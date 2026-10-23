import fs from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const electronVersion='45.0.0';
export const checksums={
  win32:'ae53887a23bb640369c93dbd38c408a2af5c0deb86f2fa76c6c244cb444b7f47',
  linux:'22f6a10bd3f7fef987ddbb379d3375ce664ad0c98a9a50f80c89f1718a0c3e3a',
  darwin:'7877c282e74a52f8d87949536a25735cf9982de1265b544c9cd258dd14eff4de'
};
export async function run(command,args,options={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{stdio:'inherit',...options});
    child.on('error',reject);
    child.on('exit',(code,signal)=>code===0?resolve():reject(new Error(`${command} failed (${code??signal})`)));
  });
}
export async function sha256(file) {
  const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');
}
export async function runtimeZip(platform) {
  if(!checksums[platform])throw new Error('Supported targets: win32, linux, darwin (x64).');
  const cache=process.env.FAKEIDM_RUNTIME_CACHE||path.join(root,'.cache','electron');
  await fs.mkdir(cache,{recursive:true});
  const name=`electron-v${electronVersion}-${platform}-x64.zip`,file=path.join(cache,name);
  try {await fs.access(file);} catch {
    const response=await fetch(`https://github.com/electron/electron/releases/download/v${electronVersion}/${name}`);
    if(!response.ok)throw new Error(`Download runtime: HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body),createWriteStream(file+'.part',{flags:'w'}));
    if(await sha256(file+'.part')!==checksums[platform]){await fs.rm(file+'.part');throw new Error('Runtime checksum mismatch');}
    await fs.rename(file+'.part',file);
  }
  if(await sha256(file)!==checksums[platform])throw new Error(`Runtime checksum mismatch: ${file}`);
  return file;
}
export async function extractZip(archive,destination) {
  await fs.mkdir(destination,{recursive:true});
  if(process.platform==='win32')await run('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command','Expand-Archive -LiteralPath $env:FAKEIDM_ARCHIVE -DestinationPath $env:FAKEIDM_DEST -Force'],{env:{...process.env,FAKEIDM_ARCHIVE:archive,FAKEIDM_DEST:destination}});
  else await run('unzip',['-q','-o',archive,'-d',destination]);
}
