import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {defaultDataDir,revealCommand} from '../platform.mjs';
import {startServer} from '../server.mjs';

test('data paths honor Windows AppData, XDG and explicit overrides',()=>{
  assert.equal(defaultDataDir('win32',{APPDATA:'D:\\Profile\\Roaming'},'C:\\Users\\A'),'D:\\Profile\\Roaming\\FakeIDM');
  assert.equal(defaultDataDir('win32',{},'C:\\Users\\A'),'C:\\Users\\A\\AppData\\Roaming\\FakeIDM');
  assert.equal(defaultDataDir('linux',{XDG_DATA_HOME:'/mnt/data'},'/home/a'),'/mnt/data/FakeIDM');
  assert.equal(defaultDataDir('linux',{XDG_DATA_HOME:'relative'},'/home/a'),'/home/a/.local/share/FakeIDM');
  assert.equal(defaultDataDir('darwin',{},'/Users/a'),'/Users/a/Library/Application Support/FakeIDM');
  assert.equal(defaultDataDir('linux',{FAKEIDM_DATA:'/tmp/custom'},'/home/a'),'/tmp/custom');
});
test('file manager commands preserve paths without shell interpolation',()=>{
  assert.deepEqual(revealCommand('C:\\Downloads\\some file & test.zip',true,'win32'),['explorer.exe',['C:\\Downloads']]);
  assert.deepEqual(revealCommand('/tmp/a $(touch injected).zip',true,'darwin'),['/usr/bin/open',['-R','/tmp/a $(touch injected).zip']]);
  assert.deepEqual(revealCommand('/home/a/My Files/file.zip',true,'linux'),['xdg-open',['/home/a/My Files']]);
});
test('authenticated reveal uses the desktop adapter and propagates errors',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'fakeidm-platform-'));
  const calls=[];let fail=false;
  const app=await startServer({dataDir:path.join(root,'state'),downloadDir:path.join(root,'files'),port:0,reveal:async(...args)=>{if(fail)throw new Error('File manager unavailable');calls.push(args);}});
  const url=new URL(app.url).origin,headers={Authorization:'Bearer '+app.token};
  try{
    assert.equal((await fetch(url+'/api/reveal-folder',{method:'POST'})).status,401);
    assert.equal(calls.length,0);
    assert.equal((await fetch(url+'/api/reveal-folder',{method:'POST',headers})).status,200);
    assert.deepEqual(calls,[[path.join(root,'files')]]);
    const state=await(await fetch(url+'/api/state',{headers})).json();assert.equal(state.app.name,'FakeIDM');assert.equal(state.app.platform,process.platform);
    fail=true;const response=await fetch(url+'/api/reveal-folder',{method:'POST',headers});assert.equal(response.status,400);assert.match((await response.json()).error,/unavailable/);
  }finally{await app.close();await fs.rm(root,{recursive:true,force:true});}
});
