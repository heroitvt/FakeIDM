import fs from 'node:fs/promises';
import path from 'node:path';
import {root,run,sha256} from './runtime.mjs';

const target=process.argv[2];
if(!['win32','linux'].includes(target))throw new Error('Expected win32 or linux');
const {version}=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const source=path.join(root,'build',`FakeIDM-${version}-${target==='win32'?'Windows':'Linux'}-x64`);
await fs.access(path.join(source,target==='win32'?'FakeIDM.exe':'fakeidm'));
let output;
if(target==='win32'){
  output=path.join(root,'dist',`FakeIDM-${version}-Windows-x64-Setup.exe`);
  const compiler=process.env.MAKENSIS||path.join(process.env['ProgramFiles(x86)']||'C:\\Program Files (x86)','NSIS','makensis.exe');
  await run(compiler,[`/DVERSION=${version}`,`/DSOURCE=${source}`,`/DOUTPUT=${output}`,path.join(root,'scripts','windows-installer.nsi')]);
}else{
  const stage=path.join(root,'build','deb');
  await fs.rm(stage,{recursive:true,force:true});
  const app=path.join(stage,'opt','fakeidm');
  await fs.mkdir(path.dirname(app),{recursive:true});
  await fs.cp(source,app,{recursive:true});
  // dpkg installs this as root:root. Keep Chromium's sandbox enabled.
  await fs.chmod(path.join(app,'chrome-sandbox'),0o4755);
  for(const d of ['DEBIAN','usr/bin','usr/share/applications','usr/share/pixmaps'])await fs.mkdir(path.join(stage,d),{recursive:true});
  await fs.writeFile(path.join(stage,'DEBIAN/control'),`Package: fakeidm\nVersion: ${version}\nSection: net\nPriority: optional\nArchitecture: amd64\nMaintainer: Anh Hung <305688386+heroitvt@users.noreply.github.com>\nHomepage: https://github.com/heroitvt/FakeIDM\nDepends: libasound2 | libasound2t64, libatk1.0-0, libatk-bridge2.0-0, libatspi2.0-0, libc6 (>= 2.31), libcairo2, libcups2, libdbus-1-3, libdrm2, libexpat1, libgbm1, libglib2.0-0, libgtk-3-0, libnspr4, libnss3, libpango-1.0-0, libstdc++6, libx11-6, libxcb1, libxcomposite1, libxdamage1, libxext6, libxfixes3, libxkbcommon0, libxrandr2\nRecommends: xdg-utils\nDescription: FakeIDM desktop download manager\n HTTP/HTTPS downloads with parallel connections and resume support.\n`);
  await fs.writeFile(path.join(stage,'usr/bin/fakeidm'),'#!/bin/sh\nexec /opt/fakeidm/fakeidm "$@"\n',{mode:0o755});
  await fs.writeFile(path.join(stage,'usr/share/applications/fakeidm.desktop'),'[Desktop Entry]\nType=Application\nName=FakeIDM\nComment=HTTP/HTTPS download manager\nExec=fakeidm\nIcon=fakeidm\nTerminal=false\nCategories=Network;FileTransfer;\nStartupWMClass=FakeIDM\n');
  await fs.copyFile(path.join(root,'public/icon.png'),path.join(stage,'usr/share/pixmaps/fakeidm.png'));
  output=path.join(root,'dist',`FakeIDM-${version}-Linux-amd64.deb`);
  await run('dpkg-deb',['--root-owner-group','--build',stage,output]);
  await run('dpkg-deb',['--info',output]);
}
await fs.writeFile(output+'.sha256',`${await sha256(output)}  ${path.basename(output)}\n`);
console.log('Installer created: '+output);
