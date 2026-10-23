import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';

export function defaultDataDir(platform=process.platform, env=process.env, home=os.homedir()) {
  const p=platform==='win32'?path.win32:path.posix;
  if(env.FAKEIDM_DATA)return p.resolve(env.FAKEIDM_DATA);
  if(platform==='darwin')return p.join(home,'Library','Application Support','FakeIDM');
  if(platform==='win32')return p.join(env.APPDATA||p.join(home,'AppData','Roaming'),'FakeIDM');
  return p.join(env.XDG_DATA_HOME&&p.isAbsolute(env.XDG_DATA_HOME)?env.XDG_DATA_HOME:p.join(home,'.local','share'),'FakeIDM');
}

// No shell interpolation: paths containing spaces or shell metacharacters stay one argument.
export function revealCommand(target,file=false,platform=process.platform) {
  if(platform==='darwin')return ['/usr/bin/open',file?['-R',target]:[target]];
  if(platform==='win32')return ['explorer.exe',[file?path.win32.dirname(target):target]];
  return ['xdg-open',[file?path.dirname(target):target]];
}

export function revealPath(target,file=false) {
  const [command,args]=revealCommand(target,file);
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{stdio:'ignore',windowsHide:true});
    child.once('error',()=>reject(new Error('Không mở được trình quản lý file. Hãy kiểm tra ứng dụng mặc định của hệ điều hành.')));
    child.once('spawn',()=>{child.unref();resolve();});
  });
}
