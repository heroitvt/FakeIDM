const {app,BrowserWindow,Menu,dialog,shell,session}=require('electron');
const path=require('node:path');

app.setName('FakeIDM');
const profile=process.env.FAKEIDM_PROFILE||path.join(app.getPath('appData'),'FakeIDM');
require('node:fs').mkdirSync(profile,{recursive:true});
app.setPath('userData',profile);
app.setAppUserModelId('io.github.heroitvt.fakeidm');
app.enableSandbox();
let window,backend,quitting=false;
const smoke=process.argv.includes('--smoke-test');

async function shutdown() {
  if(quitting)return;
  quitting=true;
  try {await backend?.close();app.exit(0);}
  catch(error){console.error('Shutdown failed:',error.message);app.exit(1);}
}

function menu() {
  const entries=[
    {label:'FakeIDM',submenu:[{label:'Giới thiệu FakeIDM',click:()=>dialog.showMessageBox(window,{title:'FakeIDM',message:'FakeIDM '+app.getVersion(),detail:'Trình quản lý tải xuống HTTP/HTTPS.\nDự án độc lập, không liên kết với Internet Download Manager.'})},{type:'separator'},{label:'Thoát',role:'quit'}]},
    {label:'Sửa',submenu:[{role:'undo',label:'Hoàn tác'},{role:'redo',label:'Làm lại'},{type:'separator'},{role:'cut',label:'Cắt'},{role:'copy',label:'Sao chép'},{role:'paste',label:'Dán'},{role:'selectAll',label:'Chọn tất cả'}]},
    {label:'Hiển thị',submenu:[{role:'resetZoom',label:'Kích thước gốc'},{role:'zoomIn',label:'Phóng to'},{role:'zoomOut',label:'Thu nhỏ'},{role:'togglefullscreen',label:'Toàn màn hình'}]}
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(entries));
}

async function start() {
  const {startServer}=await import('./server.mjs');
  const {defaultDataDir}=await import('./platform.mjs');
  backend=await startServer({dataDir:defaultDataDir(),downloadDir:process.env.FAKEIDM_DOWNLOADS||path.join(app.getPath('downloads'),'FakeIDM'),port:Number(process.env.FAKEIDM_PORT||17831),reveal:async(target,file)=>{
    if(file){shell.showItemInFolder(target);return;}
    const error=await shell.openPath(target);if(error)throw new Error(error);
  }});
  const origin=new URL(backend.url).origin;
  session.defaultSession.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  session.defaultSession.on('will-download',event=>event.preventDefault());
  window=new BrowserWindow({title:'FakeIDM',width:1180,height:790,minWidth:780,minHeight:600,show:false,backgroundColor:'#f8f9f4',icon:path.join(__dirname,'public','icon.png'),webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,devTools:!app.isPackaged}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  const restrict=(event,url)=>{try{if(new URL(url).origin!==origin)event.preventDefault();}catch{event.preventDefault();}};
  window.webContents.on('will-navigate',restrict);
  window.webContents.on('will-redirect',restrict);
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  window.once('ready-to-show',()=>window.show());
  window.on('closed',()=>{window=null;});
  menu();
  await window.loadURL(backend.url);
  if(smoke){
    for(let i=0;i<40;i++){
      const result=await window.webContents.executeJavaScript("({title:document.title,status:document.querySelector('#connection-status')?.textContent,node:typeof require,platform:document.querySelector('.app-ver')?.textContent})");
      if(result.status==='Đã kết nối'){
        if(!result.title.startsWith('FakeIDM')||result.node!=='undefined')throw new Error('Desktop isolation or branding check failed');
        console.log('DESKTOP_UI_OK '+JSON.stringify(result));await shutdown();return;
      }
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw new Error('Desktop connection timeout');
  }
}

if(!app.requestSingleInstanceLock()){app.quit();}
else {
  app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',event=>{if(!quitting){event.preventDefault();void shutdown();}});
  app.whenReady().then(start).catch(async error=>{
    if(smoke){console.error('DESKTOP_UI_FAILED',error.message);try{await backend?.close();}finally{app.exit(1);}return;}
    dialog.showErrorBox('Không mở được FakeIDM',error.code==='EADDRINUSE'?'Cổng 17831 đang được sử dụng. Đóng phiên FakeIDM hoặc SwiftDrop khác rồi thử lại.':error.message);
    await shutdown();
  });
}
