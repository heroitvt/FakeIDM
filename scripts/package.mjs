import fs from 'node:fs/promises';
import path from 'node:path';
import {root,runtimeZip,extractZip,run,sha256,electronVersion,checksums} from './runtime.mjs';

const platform=process.argv[2];
if(!['win32','linux'].includes(platform))throw new Error('Usage: node scripts/package.mjs win32|linux');
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const label=platform==='win32'?'Windows':'Linux';
const basename=`FakeIDM-${pkg.version}-${label}-x64`;
const output=path.join(root,'dist'),destination=path.join(root,'build',basename);
await fs.rm(destination,{recursive:true,force:true});
await extractZip(await runtimeZip(platform),destination);
const resources=path.join(destination,'resources');
await fs.rm(path.join(resources,'default_app.asar'),{force:true});
const app=path.join(resources,'app');await fs.mkdir(app,{recursive:true});
for(const file of ['desktop.cjs','engine.mjs','server.mjs','platform.mjs','http-policy.mjs','package.json','public'])await fs.cp(path.join(root,file),path.join(app,file),{recursive:true});
await fs.rename(path.join(destination,platform==='win32'?'electron.exe':'electron'),path.join(destination,platform==='win32'?'FakeIDM.exe':'fakeidm'));
if(platform==='win32'){
  try{await fs.rename(path.join(destination,'electron_wer.dll'),path.join(destination,'FakeIDM_wer.dll'));}catch(error){if(error.code!=='ENOENT')throw error;}
}else{
  await fs.chmod(path.join(destination,'fakeidm'),0o755);
  await fs.copyFile(path.join(root,'scripts','start-linux.sh'),path.join(destination,'Start-FakeIDM.sh'));
  await fs.chmod(path.join(destination,'Start-FakeIDM.sh'),0o755);
}
await fs.rename(path.join(destination,'LICENSE'),path.join(destination,'LICENSE-electron.txt'));
for(const file of ['LICENSE','THIRD_PARTY_NOTICES.md','README.md','CHANGELOG.md','CONTRIBUTING.md','SECURITY.md'])await fs.copyFile(path.join(root,file),path.join(destination,file));
await fs.cp(path.join(root,'docs'),path.join(destination,'docs'),{recursive:true});
await fs.cp(path.join(root,'extension'),path.join(destination,'extension'),{recursive:true});
await fs.writeFile(path.join(destination,'BUILD-INFO.json'),JSON.stringify({application:'FakeIDM',version:pkg.version,platform,arch:'x64',electron:electronVersion,runtimeSHA256:checksums[platform]},null,2)+'\n');
await fs.mkdir(output,{recursive:true});
const archive=path.join(output,basename+(platform==='win32'?'.zip':'.tar.gz'));
await fs.rm(archive,{force:true});
if(platform==='linux')await run('tar',['-czf',archive,'-C',path.dirname(destination),basename],{env:{...process.env,COPYFILE_DISABLE:'1'}});
else if(process.platform==='win32')await run('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command','Compress-Archive -LiteralPath $env:FAKEIDM_SOURCE -DestinationPath $env:FAKEIDM_ARCHIVE -CompressionLevel Optimal'],{env:{...process.env,FAKEIDM_SOURCE:destination,FAKEIDM_ARCHIVE:archive}});
else await run('zip',['-qry',archive,basename],{cwd:path.dirname(destination)});
const checksum=await sha256(archive);
await fs.writeFile(archive+'.sha256',`${checksum}  ${path.basename(archive)}\n`);
console.log(JSON.stringify({archive,sha256:checksum,size:(await fs.stat(archive)).size}));
