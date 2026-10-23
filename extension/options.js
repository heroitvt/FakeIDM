const DEFAULT_TYPES = 'ZIP, RAR, 7Z, TAR, GZ, ISO, DMG, PKG, EXE, MSI, APK, BIN, PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, MP3, WAV, FLAC, MP4, MKV, AVI, MOV, WMV, FLV, WEBM, TORRENT';

const tokenField = document.querySelector('#token');
const autoCatchField = document.querySelector('#autoCatch');
const fileTypesField = document.querySelector('#fileTypes');
const statusField = document.querySelector('#status');
const saveBtn = document.querySelector('#save');

// Load stored settings
chrome.storage.local.get(['token', 'autoCatch', 'fileTypes', 'lastError']).then(cfg => {
  tokenField.value = cfg.token || '';
  autoCatchField.checked = cfg.autoCatch !== false; // Default true
  fileTypesField.value = cfg.fileTypes || DEFAULT_TYPES;
  if (cfg.lastError) {
    statusField.textContent = cfg.lastError;
    statusField.className = 'status-err';
  }
});

// Save settings & test connection
saveBtn.onclick = async () => {
  statusField.textContent = 'Đang kiểm tra kết nối với FakeIDM...';
  statusField.className = '';
  saveBtn.disabled = true;

  const token = tokenField.value.trim();
  const autoCatch = autoCatchField.checked;
  const fileTypes = fileTypesField.value.trim() || DEFAULT_TYPES;

  if (!token) {
    statusField.textContent = 'Vui lòng nhập mã kết nối từ ứng dụng FakeIDM.';
    statusField.className = 'status-err';
    saveBtn.disabled = false;
    return;
  }

  try {
    const r = await fetch('http://127.0.0.1:17831/api/state', {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!r.ok) throw new Error('Mã kết nối không chính xác hoặc ứng dụng chưa mở.');

    const settingsResponse=await fetch('http://127.0.0.1:17831/api/settings',{
      method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({autoCatch,fileTypes})
    });
    if(!settingsResponse.ok)throw new Error('Không lưu được cài đặt trong ứng dụng.');

    await chrome.storage.local.set({
      token,
      autoCatch,
      fileTypes,
      lastError: ''
    });

    statusField.textContent = '✔ Đã kết nối thành công! Tính năng tự động bắt link tải (IDM) đã được kích hoạt.';
    statusField.className = 'status-ok';
  } catch (err) {
    statusField.textContent = '✖ Không thể kết nối: ' + err.message + ' (Hãy chắc chắn ứng dụng FakeIDM đang chạy).';
    statusField.className = 'status-err';
  } finally {
    saveBtn.disabled = false;
  }
};
