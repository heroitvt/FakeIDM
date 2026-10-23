const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const escaped = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let token = new URLSearchParams(location.hash.slice(1)).get('token') || sessionStorage.getItem('fakeidm-token') || '';
if (token) sessionStorage.setItem('fakeidm-token', token);
history.replaceState(null, '', location.pathname);

let state = { jobs: [], settings: {} };
let filter = 'all';
let selected = null;
let polling = false;
let toastTimer = null;
let historySpeed = Array(24).fill(0);
let sortCol = 'name';
let sortAsc = true;
let contextTargetId = null;

const CATEGORIES = {
  compressed: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'dmg', 'pkg', 'tgz', '7zip'],
  documents: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'xls', 'xlsx', 'ppt', 'pptx', 'epub', 'mobi', 'csv', 'md'],
  music: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'alac', 'opus'],
  video: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'ts', '3gp'],
  programs: ['exe', 'msi', 'app', 'apk', 'deb', 'rpm', 'bin', 'run']
};

function getFileCategory(filename) {
  if (!filename || !filename.includes('.')) return 'other';
  const ext = filename.split('.').pop().toLowerCase();
  for (const [cat, exts] of Object.entries(CATEGORIES)) {
    if (exts.includes(ext)) return cat;
  }
  return 'other';
}

const titles = {
  all: 'Tất cả lượt tải',
  active: 'Đang tải',
  completed: 'Đã hoàn tất',
  scheduled: 'Đã hẹn giờ',
  paused: 'Tạm dừng',
  'cat-compressed': 'File Nén',
  'cat-documents': 'Tài liệu',
  'cat-music': 'Âm nhạc',
  'cat-video': 'Video',
  'cat-programs': 'Chương trình',
  'cat-other': 'Khác'
};

const labels = {
  queued: 'Trong hàng đợi',
  scheduled: 'Đã hẹn giờ',
  probing: 'Đang kết nối',
  downloading: 'Đang tải',
  assembling: 'Đang ghép file',
  paused: 'Tạm dừng',
  completed: 'Hoàn tất',
  error: 'Cần thử lại'
};

const active = j => ['probing', 'downloading', 'assembling'].includes(j.status);

function bytes(n) {
  if (n === null || n === undefined) return 'Chưa rõ';
  if (n === 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(4, Math.floor(Math.log(Math.max(1, n)) / Math.log(1024)));
  return (n / 1024 ** i).toLocaleString('vi-VN', { maximumFractionDigits: i ? 1 : 0 }) + ' ' + u[i];
}

function eta(j) {
  if (j.status === 'completed') return '—';
  if (!j.speed || j.size === null) return '—';
  const n = Math.ceil((j.size - j.downloaded) / j.speed);
  if (n < 60) return n + ' s';
  if (n < 3600) {
    const m = Math.floor(n / 60);
    const s = n % 60;
    return `${m}m ${s}s`;
  }
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  return `${h}h ${m}m`;
}

function percentage(j) {
  return j.status === 'completed' ? 100 : j.size ? Math.min(100, (j.downloaded / j.size) * 100) : 0;
}

function toast(message) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, 3500);
}

async function api(url, method = 'GET', data) {
  const r = await fetch('/api/' + url, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: data === undefined ? undefined : JSON.stringify(data)
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || 'Không thể thực hiện yêu cầu.');
  return body;
}

async function refresh() {
  if (polling) return;
  polling = true;
  try {
    state = await api('state');
    $('#connection-status').textContent = 'Đã kết nối';
    render();
  } catch (e) {
    $('#connection-status').textContent = 'Mất kết nối';
  } finally {
    polling = false;
  }
}

function matches(j) {
  if (filter === 'active') return active(j) || j.status === 'queued';
  if (filter === 'paused') return j.status === 'paused' || j.status === 'error';
  if (filter === 'completed') return j.status === 'completed';
  if (filter === 'scheduled') return j.status === 'scheduled';
  if (filter.startsWith('cat-')) {
    const targetCat = filter.replace('cat-', '');
    return getFileCategory(j.name) === targetCat;
  }
  return true;
}

function sortJobs(list) {
  return [...list].sort((a, b) => {
    let valA, valB;
    switch (sortCol) {
      case 'size':
        valA = a.size || 0; valB = b.size || 0; break;
      case 'status':
        valA = a.status; valB = b.status; break;
      case 'speed':
        valA = a.speed || 0; valB = b.speed || 0; break;
      case 'progress':
        valA = percentage(a); valB = percentage(b); break;
      case 'downloaded':
        valA = a.downloaded || 0; valB = b.downloaded || 0; break;
      case 'eta':
        valA = a.speed && a.size ? (a.size - a.downloaded) / a.speed : Infinity;
        valB = b.speed && b.size ? (b.size - b.downloaded) / b.speed : Infinity;
        break;
      case 'name':
      default:
        valA = a.name.toLowerCase(); valB = b.name.toLowerCase(); break;
    }
    if (valA < valB) return sortAsc ? -1 : 1;
    if (valA > valB) return sortAsc ? 1 : -1;
    return 0;
  });
}

function render() {
  const platform=state.app?.platform;
  if(platform&&document.documentElement.dataset.platform!==platform){
    document.documentElement.dataset.platform=platform;
    if(platform!=='darwin'){
      document.querySelectorAll('kbd,code').forEach(el=>{el.textContent=el.textContent.replaceAll('⌘','Ctrl+');});
      document.querySelectorAll('[title]').forEach(el=>{el.title=el.title.replaceAll('⌘','Ctrl+');});
    }
  }
  $('.app-ver').textContent='FakeIDM v'+(state.app?.version||'1.2.0')+' · '+({darwin:'macOS',win32:'Windows',linux:'Linux'}[platform]||'Desktop');
  const jobs = state.jobs || [];
  const search = ($('#search').value || '').trim().toLowerCase();

  // Category counts calculation
  const counts = {
    all: jobs.length,
    active: jobs.filter(j => active(j) || j.status === 'queued').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    paused: jobs.filter(j => ['paused', 'error'].includes(j.status)).length,
    scheduled: jobs.filter(j => j.status === 'scheduled').length,
    compressed: 0,
    documents: 0,
    music: 0,
    video: 0,
    programs: 0,
    other: 0
  };

  jobs.forEach(j => {
    const cat = getFileCategory(j.name);
    if (counts[cat] !== undefined) counts[cat]++;
  });

  $('#count-all').textContent = counts.all;
  $('#count-active').textContent = counts.active;
  $('#count-completed').textContent = counts.completed;
  $('#count-paused').textContent = counts.paused;
  $('#count-scheduled').textContent = counts.scheduled;
  $('#count-cat-compressed').textContent = counts.compressed;
  $('#count-cat-documents').textContent = counts.documents;
  $('#count-cat-music').textContent = counts.music;
  $('#count-cat-video').textContent = counts.video;
  $('#count-cat-programs').textContent = counts.programs;
  $('#count-cat-other').textContent = counts.other;

  // Filter & search
  const visible = jobs.filter(j => matches(j) && (`${j.name} ${j.url}`).toLowerCase().includes(search));
  const sorted = sortJobs(visible);

  // Status & speed stats
  const running = jobs.filter(active);
  const done = jobs.filter(j => j.status === 'completed');
  const speed = running.reduce((n, j) => n + (j.speed || 0), 0);

  $('#stat-active').textContent = running.length;
  $('#stat-done').textContent = done.length;
  $('#stat-bytes').textContent = bytes(done.reduce((n, j) => n + (j.size || 0), 0));

  const speedParts = bytes(speed).split(' ');
  $('#stat-speed').innerHTML = `${escaped(speedParts[0])} <small>${escaped(speedParts[1])}/s</small>`;

  const queued = jobs.filter(j => j.status === 'queued').length;
  $('#stat-queue').textContent = queued ? `${queued} file đợi lượt` : 'Hàng đợi sẵn sàng';

  // Sparkline
  historySpeed.push(speed);
  historySpeed.shift();
  const max = Math.max(1, ...historySpeed);
  $('#spark').innerHTML = historySpeed.map(v => `<i style="height:${Math.max(2, (v / max) * 20)}px" title="${bytes(v)}/s"></i>`).join('');

  // Table body render
  $('#downloads-list').innerHTML = sorted.map(j => {
    let host = '';
    try { host = new URL(j.url).hostname; } catch { host = ''; }

    const ext = j.name.includes('.') ? j.name.split('.').pop().slice(0, 4).toUpperCase() : 'FILE';
    const cat = getFileCategory(j.name);
    const isChosen = selected === j.id;
    const isDone = j.status === 'completed';
    const isPaused = ['paused', 'error'].includes(j.status);
    const pct = percentage(j);

    const action = isDone ? 'reveal' : (isPaused ? 'resume' : 'pause');
    const actionIcon = isDone ? '📂' : (isPaused ? '▶' : '⏸');
    const actionTitle = isDone ? 'Mở vị trí file trong trình quản lý file' : (isPaused ? 'Tiếp tục tải' : 'Tạm dừng');

    const statusPillClass = `pill-${j.status}`;
    const pulseDot = active(j) ? '<span class="pulse-circle"></span>' : '';

    return `
      <div class="idm-row ${isChosen ? 'selected' : ''}" data-id="${j.id}" data-status="${j.status}" role="row" tabindex="0">
        <!-- File Name & Host -->
        <div class="idm-cell cell-name">
          <div class="file-type-badge badge-cat-${cat}">${escaped(ext)}</div>
          <div class="file-title-wrap">
            <div class="file-primary-name" title="${escaped(j.name)}">${escaped(j.name)}</div>
            <div class="file-host-sub">${escaped(host)}</div>
          </div>
        </div>

        <!-- Size -->
        <div class="idm-cell cell-size">${bytes(j.size)}</div>

        <!-- Status -->
        <div class="idm-cell cell-status">
          <span class="status-pill ${statusPillClass}">${pulseDot}${labels[j.status] || j.status}</span>
        </div>

        <!-- ETA -->
        <div class="idm-cell cell-eta">${eta(j)}</div>

        <!-- Speed -->
        <div class="idm-cell cell-speed">${j.speed ? bytes(j.speed) + '/s' : '—'}</div>

        <!-- Progress Bar (Classic IDM) -->
        <div class="idm-cell cell-progress">
          <div class="idm-progress-container" title="${pct.toFixed(1)}%">
            <div class="idm-progress-fill" style="width: ${pct}%"></div>
            <span class="idm-progress-text">${Math.floor(pct)}%</span>
          </div>
        </div>

        <!-- Downloaded bytes -->
        <div class="idm-cell cell-downloaded">${bytes(j.downloaded)}</div>

        <!-- Actions -->
        <div class="idm-cell cell-actions">
          <button class="row-btn" data-job-action="${action}" data-id="${j.id}" title="${actionTitle}">${actionIcon}</button>
          <button class="row-btn btn-delete" data-job-action="remove" data-id="${j.id}" title="Xóa khỏi danh sách">✕</button>
        </div>
      </div>
    `;
  }).join('');

  $('#empty').style.display = sorted.length ? 'none' : 'flex';
  $('#list-count').textContent = `${sorted.length} lượt tải${search ? ' phù hợp' : ''}`;

  renderDetail();
  updateSortIndicators();
}

function updateSortIndicators() {
  $$('.th-col[data-sort]').forEach(th => {
    th.classList.toggle('sorted-asc', th.dataset.sort === sortCol && sortAsc);
    th.classList.toggle('sorted-desc', th.dataset.sort === sortCol && !sortAsc);
  });
}

function renderDetail() {
  const j = state.jobs.find(x => x.id === selected);
  const dock = $('#detail');
  if (!j) {
    dock.hidden = true;
    return;
  }
  dock.hidden = false;

  const parts = j.parts || [];
  const pct = percentage(j);

  dock.innerHTML = `
    <div class="dock-header">
      <h4>
        <span>ℹ️ Đang chọn:</span> <b>${escaped(j.name)}</b>
      </h4>
      <div style="display:flex;gap:6px;">
        <button class="btn-idm-secondary" data-action="properties" style="font-size:11px;padding:3px 10px;">Chi tiết luồng tải & Mã băm</button>
        <button class="btn-close" style="width:20px;height:20px;font-size:16px;" title="Đóng bảng chi tiết" data-action="close-detail">×</button>
      </div>
    </div>

    <dl class="dock-meta-grid">
      <div class="meta-item"><dt>Trạng thái:</dt><dd>${labels[j.status] || j.status}</dd></div>
      <div class="meta-item"><dt>Đã tải:</dt><dd>${bytes(j.downloaded)} / ${bytes(j.size)} (${pct.toFixed(1)}%)</dd></div>
      <div class="meta-item"><dt>Tốc độ:</dt><dd>${j.speed ? bytes(j.speed) + '/s' : '0 B/s'}</dd></div>
      <div class="meta-item"><dt>Còn lại:</dt><dd>${eta(j)}</dd></div>
      <div class="meta-item"><dt>Nguồn:</dt><dd title="${escaped(j.url)}">${escaped(j.url)}</dd></div>
      <div class="meta-item"><dt>Thư mục:</dt><dd title="${escaped(j.path || j.directory)}">${escaped(j.path || j.directory)}</dd></div>
    </dl>

    <!-- Multi-connection Segments Monitor -->
    <div class="segments-wrapper">
      <div class="segments-label">
        <span>Tiến độ ${parts.length || 1} phân đoạn kết nối tải song song (IDM Threads):</span>
        <span>${j.ranges ? (j.validator ? 'Có hỗ trợ Range & ETag' : 'Range có hỗ trợ (thiếu ETag)') : 'Máy chủ đơn luồng (không Range)'}</span>
      </div>
      <div class="segments-bar" title="Tiến độ từng luồng kết nối">
        ${parts.length ? parts.map(p => {
          const partPct = p.end === null ? 0 : Math.min(100, (p.done / (p.end - p.start + 1)) * 100);
          return `<div class="segment-chunk" title="Luồng #${p.index || 1}: ${bytes(p.done)} (${partPct.toFixed(0)}%)"><i style="width:${partPct}%"></i></div>`;
        }).join('') : '<div class="segment-chunk"><i style="width:' + pct + '%"></i></div>'}
      </div>
    </div>
  `;
}

function showPropertiesModal(jobId) {
  const j = state.jobs.find(x => x.id === (jobId || selected));
  if (!j) {
    toast('Hãy chọn một file trong danh sách để xem thuộc tính.');
    return;
  }

  $('#prop-title').textContent = j.name;
  $('#prop-url').textContent = j.url;

  const parts = j.parts || [];
  const pct = percentage(j);

  $('#prop-body').innerHTML = `
    <dl class="prop-grid">
      <dt>Trạng thái:</dt><dd><b>${labels[j.status] || j.status}</b></dd>
      <dt>Dung lượng file:</dt><dd>${bytes(j.size)}</dd>
      <dt>Đã tải xuống:</dt><dd>${bytes(j.downloaded)} (${pct.toFixed(1)}%)</dd>
      <dt>Tốc độ tức thời:</dt><dd>${j.speed ? bytes(j.speed) + '/s' : '0 B/s'}</dd>
      <dt>Thời gian còn lại:</dt><dd>${eta(j)}</dd>
      <dt>Khả năng tiếp tục:</dt><dd>${j.ranges ? '<span style="color:#15803d;font-weight:600">✔ Có hỗ trợ (HTTP Range)</span>' : '<span style="color:#b91c1c">✖ Không hỗ trợ</span>'}</dd>
      <dt>Đường dẫn lưu:</dt><dd>${escaped(j.path || j.directory)}</dd>
      ${j.scheduledAt ? `<dt>Hẹn giờ:</dt><dd>${new Date(j.scheduledAt).toLocaleString('vi-VN')}</dd>` : ''}
      ${j.sha256 ? `<dt>Mã băm SHA-256:</dt><dd><code style="font-family:monospace;font-size:11px">${j.sha256}</code></dd>` : ''}
      ${j.error ? `<dt style="color:#b91c1c">Chi tiết lỗi:</dt><dd style="color:#b91c1c">${escaped(j.error)}</dd>` : ''}
    </dl>

    <div style="margin-top:12px;">
      <h4 style="font-size:12px;margin-bottom:6px;color:#334155;">Phân đoạn mạng song song (${parts.length || 1} kết nối):</h4>
      <div class="segments-bar" style="height:20px;margin-bottom:10px;">
        ${parts.length ? parts.map(p => {
          const partPct = p.end === null ? 0 : Math.min(100, (p.done / (p.end - p.start + 1)) * 100);
          return `<div class="segment-chunk" title="Luồng #${(p.index ?? 0) + 1}: ${bytes(p.done)}"><i style="width:${partPct}%"></i></div>`;
        }).join('') : `<div class="segment-chunk"><i style="width:${pct}%"></i></div>`}
      </div>

      ${parts.length ? `
        <table class="prop-threads-table">
          <thead>
            <tr><th>Kết nối</th><th>Dải Byte bắt đầu - kết thúc</th><th>Đã nạp</th><th>Tiến độ</th></tr>
          </thead>
          <tbody>
            ${parts.map((p, idx) => {
              const partPct = p.end === null ? 0 : Math.min(100, (p.done / (p.end - p.start + 1)) * 100);
              return `
                <tr>
                  <td><b>#${idx + 1}</b></td>
                  <td>${p.start?.toLocaleString()} – ${p.end?.toLocaleString() ?? 'hết'}</td>
                  <td>${bytes(p.done)}</td>
                  <td><b>${partPct.toFixed(1)}%</b></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      ` : '<p style="font-size:11px;color:#64748b">File này tải với 1 kết nối duy nhất.</p>'}
    </div>
  `;

  $('#prop-reveal-btn').onclick = () => {
    if (j.path) api(`downloads/${j.id}/reveal`, 'POST').catch(e => toast(e.message));
    else api('reveal-folder', 'POST').catch(e => toast(e.message));
  };

  $('#properties-dialog').showModal();
}

async function addDialog(urls = '') {
  if (!urls) {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const clip = (await navigator.clipboard.readText()).trim();
        if (/^https?:\/\//i.test(clip)) {
          urls = clip;
          toast('Đã tự động nhận liên kết từ bộ nhớ tạm (Clipboard).');
        }
      }
    } catch {}
  }
  $('#urls').value = urls;
  $('#add-error').textContent = '';
  $('#connections').value = String(state.settings.connections || 8);
  if (!$('#connections').value) $('#connections').value = '8';
  $('#add-dialog').showModal();
  setTimeout(() => $('#urls').focus(), 40);
}

// Close any open dropdown menu
function closeDropdowns() {
  $$('.dropdown-panel').forEach(p => p.classList.remove('show'));
  $$('.menu-btn').forEach(b => b.classList.remove('active'));
}

// Global click event dispatcher
document.addEventListener('click', async e => {
  // Hide custom context menu if clicked outside
  const ctx = $('#context-menu');
  if (ctx && !e.target.closest('#context-menu')) {
    ctx.hidden = true;
  }

  // Handle menu bar dropdown toggles
  const menuBtn = e.target.closest('[data-toggle]');
  if (menuBtn) {
    e.stopPropagation();
    const targetId = menuBtn.dataset.toggle;
    const targetPanel = $('#' + targetId);
    const isOpen = targetPanel?.classList.contains('show');
    closeDropdowns();
    if (!isOpen && targetPanel) {
      targetPanel.classList.add('show');
      menuBtn.classList.add('active');
    }
    return;
  }
  closeDropdowns();

  // Close modals
  const close = e.target.closest('[data-close]');
  if (close) {
    close.closest('dialog').close();
    return;
  }

  // Column header sorting
  const th = e.target.closest('.th-col[data-sort]');
  if (th) {
    const col = th.dataset.sort;
    if (sortCol === col) {
      sortAsc = !sortAsc;
    } else {
      sortCol = col;
      sortAsc = true;
    }
    render();
    return;
  }

  // Filter sidebar tree
  const navNode = e.target.closest('[data-filter]');
  if (navNode) {
    filter = navNode.dataset.filter;
    $$('[data-filter]').forEach(x => x.classList.toggle('selected', x === navNode));
    render();
    return;
  }

  // In-row actions (Pause, Resume, Reveal, Delete)
  const jobBtn = e.target.closest('[data-job-action]');
  if (jobBtn) {
    e.stopPropagation();
    jobBtn.disabled = true;
    try {
      const id = jobBtn.dataset.id;
      const action = jobBtn.dataset.jobAction;
      if (action === 'remove') {
        const j = state.jobs.find(x => x.id === id);
        if (j && j.status !== 'completed' && !confirm('Xóa lượt tải này? Phần tải chưa hoàn tất sẽ bị hủy.')) return;
        await api('downloads/' + id, 'DELETE');
        if (selected === id) selected = null;
        toast('Đã xóa khỏi danh sách.');
      } else {
        await api(`downloads/${id}/${action}`, 'POST');
      }
      await refresh();
    } catch (err) {
      toast(err.message);
    } finally {
      jobBtn.disabled = false;
    }
    return;
  }

  // Row selection
  const row = e.target.closest('.idm-row');
  if (row) {
    selected = (selected === row.dataset.id) ? row.dataset.id : row.dataset.id;
    render();
    return;
  }

  // Context menu actions
  const ctxBtn = e.target.closest('[data-ctx]');
  if (ctxBtn) {
    const action = ctxBtn.dataset.ctx;
    const targetId = contextTargetId || selected;
    $('#context-menu').hidden = true;
    if (!targetId) return;

    try {
      if (action === 'resume') {
        await api(`downloads/${targetId}/resume`, 'POST');
        await refresh();
      } else if (action === 'pause') {
        await api(`downloads/${targetId}/pause`, 'POST');
        await refresh();
      } else if (action === 'reveal') {
        const j = state.jobs.find(x => x.id === targetId);
        if (j?.path) await api(`downloads/${targetId}/reveal`, 'POST');
        else await api('reveal-folder', 'POST');
      } else if (action === 'copy-url') {
        const j = state.jobs.find(x => x.id === targetId);
        if (j?.url) {
          await navigator.clipboard.writeText(j.url);
          toast('Đã sao chép liên kết vào bộ nhớ tạm.');
        }
      } else if (action === 'refresh-url') {
        const j = state.jobs.find(x => x.id === targetId);
        if (j) {
          $('#refresh-job-id').value=targetId;
          $('#refresh-url-input').value=j.url;
          $('#refresh-link-error').textContent='';
          $('#refresh-link-dialog').showModal();
        }
      } else if (action === 'properties') {
        showPropertiesModal(targetId);
      } else if (action === 'remove') {
        const j = state.jobs.find(x => x.id === targetId);
        if (j && j.status !== 'completed' && !confirm('Xóa lượt tải này?')) return;
        await api('downloads/' + targetId, 'DELETE');
        if (selected === targetId) selected = null;
        toast('Đã xóa lượt tải.');
        await refresh();
      }
    } catch (err) {
      toast(err.message);
    }
    return;
  }

  // Toolbar & Menu generic actions
  const button = e.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if(action==='close-detail'){selected=null;render();return;}

  try {
    if (action === 'new') {
      addDialog();
    } else if (action === 'help') {
      $('#help-dialog').showModal();
    } else if (action === 'about') {
      $('#help-dialog').showModal();
    } else if (action === 'settings') {
      const s = state.settings || {};
      const defaultTypes = 'ZIP, RAR, 7Z, TAR, GZ, ISO, DMG, PKG, EXE, MSI, APK, BIN, PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, MP3, WAV, FLAC, MP4, MKV, AVI, MOV, WMV, FLV, WEBM, TORRENT';
      $('#download-dir').value = s.downloadDir || '';
      $('#concurrency').value = s.concurrency || 2;
      $('#default-connections').value = s.connections || 8;
      $('#speed-limit').value = s.speedLimit || 0;
      $('#pair-token').value = token;
      $('#settings-auto-catch').checked = s.autoCatch !== false;
      $('#settings-file-types').value = s.fileTypes || defaultTypes;
      $('#settings-error').textContent = '';
      $('#settings-dialog').showModal();
    } else if (action === 'folder') {
      await api('reveal-folder', 'POST');
    } else if (action === 'resume-selected') {
      const j = state.jobs.find(x => x.id === selected);
      if (j && ['paused', 'error'].includes(j.status)) {
        await api(`downloads/${selected}/resume`, 'POST');
      } else {
        await api('resume-all', 'POST');
      }
      await refresh();
    } else if (action === 'pause-selected') {
      const j = state.jobs.find(x => x.id === selected);
      if (j && active(j)) {
        await api(`downloads/${selected}/pause`, 'POST');
      } else {
        await api('pause-all', 'POST');
      }
      await refresh();
    } else if (action === 'delete-selected') {
      if (!selected) {
        toast('Hãy chọn một lượt tải để xóa.');
        return;
      }
      const j = state.jobs.find(x => x.id === selected);
      if (j && j.status !== 'completed' && !confirm('Xóa lượt tải đang chọn?')) return;
      await api('downloads/' + selected, 'DELETE');
      selected = null;
      toast('Đã xóa lượt tải.');
      await refresh();
    } else if (action === 'clean-completed') {
      const done = state.jobs.filter(j => j.status === 'completed');
      if (!done.length) {
        toast('Không có file hoàn tất nào để dọn dẹp.');
        return;
      }
      for (const j of done) {
        await api('downloads/' + j.id, 'DELETE');
      }
      if (done.some(j => j.id === selected)) selected = null;
      toast(`Đã dọn dẹp ${done.length} file hoàn tất.`);
      await refresh();
    } else if (action === 'scheduler') {
      filter = 'scheduled';
      $$('[data-filter]').forEach(x => x.classList.toggle('selected', x.dataset.filter === 'scheduled'));
      render();
    } else if (action === 'properties') {
      showPropertiesModal(selected);
    } else if (action === 'toggle-sidebar') {
      $('#sidebar').classList.toggle('hidden');
    } else if (action === 'toggle-details') {
      $('#detail').hidden = !$('#detail').hidden;
    } else {
      button.disabled = true;
      await api(action, 'POST');
      await refresh();
    }
  } catch (err) {
    toast(err.message);
  } finally {
    button.disabled = false;
  }
});

// Double click row -> open file if done, else open properties
document.addEventListener('dblclick', e => {
  const row = e.target.closest('.idm-row');
  if (!row) return;
  const id = row.dataset.id;
  const j = state.jobs.find(x => x.id === id);
  if (!j) return;
  if (j.status === 'completed' && j.path) {
    api(`downloads/${id}/reveal`, 'POST').catch(err => toast(err.message));
  } else {
    showPropertiesModal(id);
  }
});

// Right click context menu on row
document.addEventListener('contextmenu', e => {
  const row = e.target.closest('.idm-row');
  if (!row) return;
  e.preventDefault();

  const id = row.dataset.id;
  selected = id;
  contextTargetId = id;
  render();

  const ctx = $('#context-menu');
  if (!ctx) return;
  ctx.hidden = false;

  const mouseX = e.clientX;
  const mouseY = e.clientY;
  const winW = window.innerWidth;
  const winH = window.innerHeight;

  ctx.style.left = `${Math.min(mouseX, winW - 200)}px`;
  ctx.style.top = `${Math.min(mouseY, winH - 220)}px`;
});

// Add download form submit
$('#add-form').addEventListener('submit', async e => {
  e.preventDefault();
  const button = e.submitter;
  button.disabled = true;
  try {
    const urls = $('#urls').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const scheduledAt = $('#schedule').value ? new Date($('#schedule').value).toISOString() : null;
    await api('downloads', 'POST', {
      items: urls.map(url => ({
        url,
        name: urls.length === 1 && $('#filename').value.trim() ? $('#filename').value.trim() : undefined,
        connections: Number($('#connections').value),
        scheduledAt
      }))
    });
    $('#add-dialog').close();
    $('#filename').value = '';
    $('#schedule').value = '';
    toast(`Đã thêm ${urls.length} lượt tải.`);
    await refresh();
  } catch (err) {
    $('#add-error').textContent = err.message;
  } finally {
    button.disabled = false;
  }
});

// Settings form submit
$('#settings-form').addEventListener('submit', async e => {
  e.preventDefault();
  const b = e.submitter;
  b.disabled = true;
  try {
    await api('settings', 'PUT', {
      downloadDir: $('#download-dir').value,
      concurrency: Number($('#concurrency').value),
      connections: Number($('#default-connections').value),
      speedLimit: Number($('#speed-limit').value),
      autoCatch: $('#settings-auto-catch')?.checked ?? true,
      fileTypes: $('#settings-file-types')?.value?.trim() || ''
    });
    $('#settings-dialog').close();
    await refresh();
    toast('Đã lưu cài đặt và danh sách định dạng bắt link.');
  } catch (err) {
    $('#settings-error').textContent = err.message;
  } finally {
    b.disabled = false;
  }
});

// Reset file types to default in settings
$('#btn-reset-filetypes')?.addEventListener('click', () => {
  const defaultTypes = 'ZIP, RAR, 7Z, TAR, GZ, ISO, DMG, PKG, EXE, MSI, APK, BIN, PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, MP3, WAV, FLAC, MP4, MKV, AVI, MOV, WMV, FLV, WEBM, TORRENT';
  if ($('#settings-file-types')) $('#settings-file-types').value = defaultTypes;
  if ($('#settings-auto-catch')) $('#settings-auto-catch').checked = true;
  toast('Đã khôi phục danh sách định dạng mặc định.');
});

// Copy token button in settings
$('#btn-copy-token')?.addEventListener('click', () => {
  const tokenInput = $('#pair-token');
  if (tokenInput && tokenInput.value) {
    navigator.clipboard.writeText(tokenInput.value);
    toast('Đã sao chép mã kết nối tiện ích.');
  }
});

// Paste from clipboard button in Add dialog
$('#btn-paste-clip')?.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      $('#urls').value = text.trim();
      toast('Đã dán liên kết từ bộ nhớ tạm.');
    } else {
      toast('Bộ nhớ tạm đang trống.');
    }
  } catch (err) {
    toast('Hãy cấp quyền truy cập bộ nhớ tạm hoặc dán bằng Ctrl+V (⌘V trên Mac).');
  }
});

// Search input
$('#search').addEventListener('input', render);

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    if (!document.querySelector('dialog[open]')) addDialog();
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    $('#search').focus();
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    api('reveal-folder', 'POST').catch(err => toast(err.message));
  }
  if ((e.metaKey || e.ctrlKey) && e.key === ',') {
    e.preventDefault();
    $('[data-action="settings"]')?.click();
  }
  if (e.key === 'Escape') {
    $('#context-menu').hidden = true;
    closeDropdowns();
  }
  if (e.key === 'Delete' && selected && !document.querySelector('dialog[open]')) {
    e.preventDefault();
    $('[data-action="delete-selected"]')?.click();
  }
  if (e.key === ' ' && selected && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    e.preventDefault();
    const j = state.jobs.find(x => x.id === selected);
    if (j) {
      if (active(j)) api(`downloads/${selected}/pause`, 'POST').then(refresh);
      else api(`downloads/${selected}/resume`, 'POST').then(refresh);
    }
  }
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    const rows = Array.from($$('.idm-row'));
    if (!rows.length) return;
    const curIdx = rows.findIndex(r => r.dataset.id === selected);
    let nextIdx = 0;
    if (e.key === 'ArrowDown') {
      nextIdx = curIdx < rows.length - 1 ? curIdx + 1 : 0;
    } else {
      nextIdx = curIdx > 0 ? curIdx - 1 : rows.length - 1;
    }
    selected = rows[nextIdx].dataset.id;
    rows[nextIdx].scrollIntoView({ block: 'nearest' });
    render();
  }
});

// Drag and drop link handling
let dragDepth = 0;
document.addEventListener('dragenter', e => {
  if (e.dataTransfer.types.includes('text/uri-list') || e.dataTransfer.types.includes('text/plain')) {
    e.preventDefault();
    dragDepth++;
    $('#drop-overlay').style.display = 'flex';
  }
});

document.addEventListener('dragover', e => e.preventDefault());

document.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) $('#drop-overlay').style.display = 'none';
});

document.addEventListener('drop', e => {
  e.preventDefault();
  dragDepth = 0;
  $('#drop-overlay').style.display = 'none';
  const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
  const urls = text.split(/\r?\n/).filter(x => /^https?:\/\//.test(x));
  if (urls.length) {
    if (!$('#add-dialog').open) addDialog(urls.join('\n'));
    else $('#urls').value = urls.join('\n');
  } else {
    toast('Hãy thả liên kết HTTP hoặc HTTPS đến tập tin.');
  }
});

$('#refresh-link-form').addEventListener('submit',async e=>{
  e.preventDefault();const button=e.submitter;button.disabled=true;
  try{
    await api('downloads/'+$('#refresh-job-id').value+'/update-url','POST',{url:$('#refresh-url-input').value.trim()});
    $('#refresh-link-dialog').close();toast('Đã cập nhật liên kết. File được tải lại từ đầu để tránh trộn dữ liệu.');await refresh();
  }catch(error){$('#refresh-link-error').textContent=error.message;}finally{button.disabled=false;}
});

if (!token) toast('Mở ứng dụng FakeIDM để kết nối với bộ tải.');
refresh();
setInterval(refresh, 900);
