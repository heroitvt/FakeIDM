const DEFAULT_FILE_TYPES = 'ZIP,RAR,7Z,TAR,GZ,ISO,DMG,PKG,EXE,MSI,APK,BIN,PDF,DOC,DOCX,XLS,XLSX,PPT,PPTX,MP3,WAV,FLAC,MP4,MKV,AVI,MOV,WMV,FLV,WEBM,TORRENT';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'fakeidm',
    title: 'Tải bằng FakeIDM',
    contexts: ['link', 'image', 'video', 'audio']
  });
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

async function getCookiesForUrl(url) {
  try {
    const list = await chrome.cookies.getAll({ url });
    // Only cookies the browser would send to this exact URL. Never merge unrelated domains.
    return list.filter(c => c && c.name).map(c => `${c.name}=${c.value}`).join('; ');
  } catch (e) {
    return '';
  }
}

// Xử lý menu chuột phải
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'fakeidm') return;
  const { token } = await chrome.storage.local.get('token');
  if (!token) {
    await chrome.storage.local.set({ lastError: 'Hãy nhập mã kết nối từ Cài đặt trong FakeIDM.' });
    return chrome.runtime.openOptionsPage();
  }

  const url = info.linkUrl || info.srcUrl;
  if (!url || !/^https?:\/\//i.test(url)) return;

  const cookieHeader = await getCookiesForUrl(url);
  const extraHeaders = {
    'User-Agent': navigator.userAgent
  };
  if (cookieHeader) extraHeaders['Cookie'] = cookieHeader;
  const referrer = info.pageUrl || tab?.url;
  if (referrer) extraHeaders['Referer'] = referrer;

  try {
    const r = await fetch('http://127.0.0.1:17831/api/downloads', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token
      },
      body: JSON.stringify({
        url,
        headers: extraHeaders
      })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);

    await chrome.action.setBadgeText({ text: '✓' });
    await chrome.action.setBadgeBackgroundColor({ color: '#16a34a' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3500);
    await chrome.storage.local.set({ lastError: '' });
  } catch (e) {
    await chrome.storage.local.set({ lastError: 'Không gửi được link: ' + e.message });
    chrome.runtime.openOptionsPage();
  }
});

const interceptedDownloads = new Set();

async function interceptOne(item) {
  if (!item || item.id === undefined || interceptedDownloads.has(item.id)) return;

  const url = item.finalUrl || item.url;
  if (!url || !/^https?:\/\//i.test(url)) return;
  if(item.state && item.state!=='in_progress')return;

  let settings = await chrome.storage.local.get(['token', 'autoCatch', 'fileTypes']);
  if (!settings.token) return;

  // Đồng bộ cài đặt từ ứng dụng FakeIDM
  try {
    const res = await fetch('http://127.0.0.1:17831/api/state', {
      headers: { Authorization: 'Bearer ' + settings.token }, signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const serverState = await res.json();
      if (serverState.settings) {
        if (serverState.settings.fileTypes !== undefined) settings.fileTypes = serverState.settings.fileTypes;
        if (serverState.settings.autoCatch !== undefined) settings.autoCatch = serverState.settings.autoCatch;
      }
    }
  } catch {}

  if (settings.autoCatch === false) return; // Người dùng đã tắt tự động bắt link

  let filename = (item.filename || '').split(/[/\\]/).pop().trim();
  let ext = '';
  if (filename.includes('.')) {
    ext = filename.split('.').pop().toUpperCase();
  } else {
    try {
      const uPath = new URL(url).pathname;
      if (uPath.includes('.')) {
        ext = uPath.split('.').pop().toUpperCase();
      }
    } catch {}
  }

  const fileTypesStr = settings.fileTypes !== undefined ? settings.fileTypes : DEFAULT_FILE_TYPES;
  const allowed = fileTypesStr
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);

  const shouldCatch = allowed.includes('*') || (ext && allowed.includes(ext));
  if (!shouldCatch) return;

  const cookieHeader = await getCookiesForUrl(url);
  const extraHeaders = {
    'User-Agent': navigator.userAgent
  };
  if (cookieHeader) extraHeaders['Cookie'] = cookieHeader;
  if (item.referrer) extraHeaders['Referer'] = item.referrer;

  try {
    const r = await fetch('http://127.0.0.1:17831/api/downloads', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + settings.token
      },
      body: JSON.stringify({
        url,
        name: filename || undefined,
        headers: extraHeaders
      })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    if(!Array.isArray(data.jobs)||!data.jobs.length)throw new Error('Ứng dụng chưa nhận lượt tải.');
    interceptedDownloads.add(item.id);
    if(interceptedDownloads.size>512)interceptedDownloads.delete(interceptedDownloads.values().next().value);
    // Cancel only after the local manager has persisted and acknowledged the new job.
    try {await chrome.downloads.cancel(item.id);}catch{}


    await chrome.action.setBadgeText({ text: '✓' });
    await chrome.action.setBadgeBackgroundColor({ color: '#16a34a' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 4000);
  } catch (err) {
    await chrome.storage.local.set({lastError:'Không chuyển được link; trình duyệt tiếp tục tải: '+err.message});
  }
}

const pendingInterceptions=new Map();
function handleDownloadInterception(item) {
  if(!item||item.id===undefined)return Promise.resolve();
  const previous=pendingInterceptions.get(item.id)||Promise.resolve();
  const task=previous.catch(()=>{}).then(()=>interceptOne(item)).finally(()=>{
    if(pendingInterceptions.get(item.id)===task)pendingInterceptions.delete(item.id);
  });
  pendingInterceptions.set(item.id,task);
  return task;
}
chrome.downloads.onCreated.addListener(item=>{void handleDownloadInterception(item);});
if(chrome.downloads.onDeterminingFilename) {
  chrome.downloads.onDeterminingFilename.addListener((item,suggest)=>{
    suggest();
    void handleDownloadInterception(item);
  });
}
