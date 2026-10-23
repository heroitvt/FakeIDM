import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {DownloadManager,safeName} from '../engine.mjs';
import {startServer} from '../server.mjs';
const data=Buffer.alloc(6*1024*1024);for(let i=0;i<data.length;i++)data[i]=(i*17+Math.floor(i/1024))%251;
const digest=b=>createHash('sha256').update(b).digest('hex');
let fixture,base,root,rangeRequests=[],flaky=0,version=1;
before(async()=>{
 root=await fs.mkdtemp(path.join(os.tmpdir(),'fakeidm-test-'));
 fixture=http.createServer((req,res)=>{
   if(req.url==='/redirect'){res.writeHead(302,{Location:'/file'});return res.end();}
   if(req.url==='/fail'){res.writeHead(403);return res.end();}
   const content=req.url==='/changed'&&version===2?Buffer.alloc(data.length,73):data;
   const ranged=!['/plain','/chunked'].includes(req.url);
   let start=0,end=content.length-1;
   const m=/bytes=(\d+)-(\d*)/.exec(req.headers.range||'');
   const headers={'ETag':req.url==='/changed'?`"v${version}"`:'"fixture-v1"','Content-Disposition':'attachment; filename="test-file.bin"'};
   if(req.url==='/no-validator')delete headers.ETag;
   if(ranged&&m){start=Number(m[1]);end=m[2]?Number(m[2]):end;headers['Content-Range']=`bytes ${start}-${end}/${content.length}`;headers['Accept-Ranges']='bytes';rangeRequests.push({url:req.url,start,end});}
   if(req.url!=='/chunked')headers['Content-Length']=end-start+1;
   res.writeHead(ranged&&m?206:200,headers);
   if(end===0)return res.end(content.subarray(0,1));
   let pos=start;
   const timer=setInterval(()=>{
     if(pos>end){clearInterval(timer);res.end();return;}
     const next=Math.min(end+1,pos+32768);res.write(content.subarray(pos,next));pos=next;
     if(req.url==='/flaky'&&flaky++===0){clearInterval(timer);res.destroy();}
   },2);
   res.on('close',()=>clearInterval(timer));
 });
 await new Promise(r=>fixture.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${fixture.address().port}`;
});
after(async()=>{await new Promise(r=>fixture.close(r));await fs.rm(root,{recursive:true,force:true});});
async function manager(name){return new DownloadManager({dataDir:path.join(root,name,'state'),downloadDir:path.join(root,name,'files')}).init();}
async function waitFor(fn,timeout=20000){const begin=Date.now();while(!fn()){if(Date.now()-begin>timeout)throw new Error('Timed out');await delay(15);}}
async function complete(m,j){await waitFor(()=>['completed','error'].includes(j.status));assert.equal(j.status,'completed',j.error);assert.equal(j.sha256,digest(await fs.readFile(j.path)));return fs.readFile(j.path);}

test('parallel ranges reproduce original bytes and never overwrite names',async()=>{const m=await manager('parallel');try{const j=m.add({url:base+'/redirect',connections:8});assert.deepEqual(await complete(m,j),data);assert.equal(j.parts.length,8);const k=m.add({url:base+'/file'});assert.deepEqual(await complete(m,k),data);assert.notEqual(j.path,k.path);assert.deepEqual(await fs.readFile(j.path),data);}finally{await m.close();}});
test('pause, durable restart and ranged resume keep exact bytes',async()=>{let m=await manager('resume');let j=m.add({url:base+'/file',connections:4});await waitFor(()=>j.downloaded>200000&&j.status==='downloading');await m.pause(j.id);const saved=j.downloaded;assert.ok(saved>0&&saved<data.length);await m.close();m=await manager('resume');try{j=m.jobs[0];assert.equal(j.status,'paused');rangeRequests=[];m.resume(j.id);assert.deepEqual(await complete(m,j),data);assert.ok(rangeRequests.some(r=>r.start>0&&r.start%Math.ceil(data.length/4)!==0));}finally{await m.close();}});
test('source version change resets old chunks instead of mixing files',async()=>{version=1;const m=await manager('change');try{const j=m.add({url:base+'/changed',connections:4});await waitFor(()=>j.downloaded>100000);await m.pause(j.id);version=2;m.resume(j.id);assert.deepEqual(await complete(m,j),Buffer.alloc(data.length,73));}finally{await m.close();}});
test('servers ignoring Range and chunked bodies download correctly',async()=>{const m=await manager('plain');try{for(const endpoint of ['/plain','/chunked']){const j=m.add({url:base+endpoint});assert.deepEqual(await complete(m,j),data);assert.equal(j.parts.length,1);assert.equal(j.ranges,false);}}finally{await m.close();}});
test('temporary disconnection resumes with a retry',async()=>{const m=await manager('flaky');try{const j=m.add({url:base+'/flaky',connections:1});assert.deepEqual(await complete(m,j),data);}finally{await m.close();}});
test('queue respects concurrency and scheduler does not start early',async()=>{const m=await manager('queue');try{await m.configure({concurrency:1});const a=m.add({url:base+'/file',connections:1});const b=m.add({url:base+'/file',connections:1});assert.equal(b.status,'queued');const c=m.add({url:base+'/file',scheduledAt:new Date(Date.now()+1500).toISOString()});assert.equal(c.status,'scheduled');assert.deepEqual(await complete(m,a),data);assert.deepEqual(await complete(m,b),data);assert.deepEqual(await complete(m,c),data);}finally{await m.close();}});
test('no validator resumes from zero safely; HTTP failure is surfaced',async()=>{const m=await manager('unvalidated');try{const j=m.add({url:base+'/no-validator',connections:1});await waitFor(()=>j.downloaded>100000);await m.pause(j.id);rangeRequests=[];m.resume(j.id);assert.deepEqual(await complete(m,j),data);assert.ok(rangeRequests.some(r=>r.start===0&&r.end>0));const k=m.add({url:base+'/fail'});await waitFor(()=>k.status==='error');assert.match(k.error,/403/);}finally{await m.close();}});
test('removing completed history preserves file, and filename paths are sanitized',async()=>{const m=await manager('remove');try{const j=m.add({url:base+'/file',name:'../../evil.bin'});await complete(m,j);const saved=j.path;assert.equal(path.dirname(saved),m.settings.downloadDir);await m.remove(j.id);assert.deepEqual(await fs.readFile(saved),data);assert.equal(m.jobs.length,0);assert.equal(safeName('CON.exe'),'_CON.exe');}finally{await m.close();}});
test('aggregate speed limit constrains throughput and pause interrupts throttling',async()=>{const m=await manager('limit');try{await m.configure({speedLimit:4096});const start=Date.now();const j=m.add({url:base+'/file',connections:8});await complete(m,j);assert.ok(Date.now()-start>=1350,'6 MiB at 4 MiB/s takes at least ~1.5 s');await m.configure({speedLimit:1});const k=m.add({url:base+'/file'});await waitFor(()=>k.status==='downloading');const stop=Date.now();await m.pause(k.id);assert.ok(Date.now()-stop<1000,'Pause cancels long rate-limit wait');assert.equal(k.status,'paused');m.resume(k.id);await waitFor(()=>k.status==='downloading');await m.configure({speedLimit:0});const unlimit=Date.now();assert.deepEqual(await complete(m,k),data);assert.ok(Date.now()-unlimit<2000,'Removing speed limit releases existing waits promptly');}finally{await m.close();}});
test('API rejects unauthenticated and foreign-origin writes; accepts authenticated requests',async()=>{const app=await startServer({dataDir:path.join(root,'api'),downloadDir:path.join(root,'api-files'),port:0});const url=app.url.split('/#')[0];try{let r=await fetch(url+'/api/state');assert.equal(r.status,401);r=await fetch(url+'/api/downloads',{method:'POST',headers:{Origin:'https://evil.example',Authorization:'Bearer '+app.token,'Content-Type':'application/json'},body:JSON.stringify({url:base+'/file'})});assert.equal(r.status,403);const headers={Authorization:'Bearer '+app.token,'Content-Type':'application/json'};r=await fetch(url+'/api/downloads',{method:'POST',headers,body:JSON.stringify({url:base+'/file'})});assert.equal(r.status,201);const j=(await r.json()).jobs[0];await complete(app.manager,app.manager.getJob(j.id));r=await fetch(url+'/api/state',{headers});assert.equal((await r.json()).jobs[0].status,'completed');}finally{await app.close();}});
test('duplicate server cannot rewrite history; browser pairing survives restart',async()=>{const dataDir=path.join(root,'duplicate'),downloadDir=path.join(root,'duplicate-files');const app=await startServer({dataDir,downloadDir,port:0});const token=app.token;try{app.manager.add({url:base+'/file',scheduledAt:new Date(Date.now()+60000).toISOString()});const before=await fs.readFile(path.join(dataDir,'state.json'),'utf8');await assert.rejects(startServer({dataDir,downloadDir,port:app.server.address().port}),{code:'EADDRINUSE'});assert.equal(await fs.readFile(path.join(dataDir,'state.json'),'utf8'),before);}finally{await app.close();}const again=await startServer({dataDir,downloadDir,port:0});try{assert.equal(again.token,token);assert.equal(again.manager.jobs.length,1);}finally{await again.close();}});
