import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import {DownloadManager} from '../engine.mjs';
import {normalizeHeaders,isGoogleURL} from '../http-policy.mjs';
import {startServer} from '../server.mjs';

const digest=b=>createHash('sha256').update(b).digest('hex');
async function waitFor(fn,timeout=20000){const start=Date.now();while(!fn()){if(Date.now()-start>timeout)throw Error('Timed out');await delay(10);}}
async function fixture(t,handler){const server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));return `http://127.0.0.1:${server.address().port}`;}
async function manager(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'fakeidm-regression-'));const m=await new DownloadManager({dataDir:path.join(root,'state'),downloadDir:path.join(root,'files')}).init();t.after(async()=>{await m.close();await fs.rm(root,{recursive:true,force:true});});return m;}
async function complete(m,j){await waitFor(()=>['completed','error'].includes(j.status));assert.equal(j.status,'completed',j.error);return fs.readFile(j.path);}
function range(req,data){const match=/bytes=(\d+)-(\d*)/.exec(req.headers.range||'');const start=match?+match[1]:0,end=match&&match[2]?+match[2]:data.length-1;return {start,end,code:match?206:200,headers:{'Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${data.length}`,'ETag':'"stable"'}};}

test('partial response disconnect retries from received offset without duplicate bytes',async t=>{
  const data=Buffer.alloc(2*1024*1024);for(let i=0;i<data.length;i++)data[i]=i%251;
  let broken=false;const starts=[];
  const url=await fixture(t,(req,res)=>{const r=range(req,data);res.writeHead(r.code,r.headers);starts.push(r.start);
    if(r.end>0&&!broken){broken=true;res.write(data.subarray(r.start,r.start+32768));setTimeout(()=>res.destroy(),80);}
    else res.end(data.subarray(r.start,r.end+1));
  });
  const m=await manager(t),j=m.add({url,connections:1});assert.deepEqual(await complete(m,j),data);assert.ok(starts.includes(32768),'retry must advance past bytes already saved');
});

test('non-Range response larger than 64 MiB downloads to completion',async t=>{
  const data=Buffer.alloc(65*1024*1024+123,71);
  const url=await fixture(t,(_req,res)=>{res.writeHead(200,{'Content-Length':data.length,'ETag':'"large"'});res.end(data);});
  const m=await manager(t),j=m.add({url,connections:8});const actual=await complete(m,j);assert.equal(actual.length,data.length);assert.equal(digest(actual),digest(data));assert.equal(j.parts.length,1);
});

test('ranged file spanning multiple 64 MiB requests preserves exact bytes',async t=>{
  const data=Buffer.alloc(65*1024*1024+123,53);const starts=[];
  const url=await fixture(t,(req,res)=>{const r=range(req,data);starts.push(r.start);res.writeHead(r.code,r.headers);res.end(data.subarray(r.start,r.end+1));});
  const m=await manager(t),j=m.add({url,connections:1});assert.equal(digest(await complete(m,j)),digest(data));assert.ok(starts.includes(64*1024*1024));
});

test('unknown-length response downloads all chunks and HTML errors are explicit',async t=>{
  const data=Buffer.alloc(40000,12);
  const url=await fixture(t,(req,res)=>{if(req.url==='/html'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<html>Sign in</html>');}else{res.writeHead(200,{'ETag':'"chunked"'});res.write(data.subarray(0,10000));res.end(data.subarray(10000));}});
  const m=await manager(t);assert.deepEqual(await complete(m,m.add({url})),data);const j=m.add({url:url+'/html'});await waitFor(()=>j.status==='error');assert.match(j.error,/HTML/);
});

test('redirect never forwards cookies or authorization to another origin, including data requests',async t=>{
  const data=Buffer.alloc(800000,31),received=[],sourceHeaders=[];
  const target=await fixture(t,(req,res)=>{received.push(req.headers);const r=range(req,data);res.writeHead(r.code,r.headers);res.end(data.subarray(r.start,r.end+1));});
  const source=await fixture(t,(req,res)=>{sourceHeaders.push(req.headers);res.writeHead(302,{Location:target});res.end();});
  const m=await manager(t);const j=m.add({url:source,headers:{Cookie:'session=private',Authorization:'Bearer private',Referer:'https://private.example/'}});
  assert.deepEqual(await complete(m,j),data);assert.equal(sourceHeaders[0].cookie,'session=private');assert.ok(received.length>1);
  for(const h of received){assert.equal(h.cookie,undefined);assert.equal(h.authorization,undefined);assert.equal(h.referer,undefined);}
  assert.equal('headers' in m.snapshot().jobs[0],false);
});

test('header overrides cannot replace engine Range/Host or inject new header lines',()=>{
  for(const headers of [{Range:'bytes=5-'},{Host:'other.example'},{'If-Range':'fake'},{Cookie:'a=b\r\nX-Injected: yes'},{Cookie:7},[],null])assert.throws(()=>normalizeHeaders(headers));
  assert.deepEqual(normalizeHeaders({'User-Agent':'Browser',Cookie:'a=b'}),{'user-agent':'Browser',cookie:'a=b'});
  assert.equal(isGoogleURL('https://drive.google.com/file'),true);assert.equal(isGoogleURL('https://evil.example/?google.com'),false);assert.equal(isGoogleURL('https://evilgoogle.com/file'),false);
});

test('refresh URL waits for active transfer and resets old chunks even with matching validators',async t=>{
  const old=Buffer.alloc(2*1024*1024,1),fresh=Buffer.alloc(old.length,2);const m=await manager(t);
  const url=await fixture(t,(req,res)=>{const data=req.url==='/new'?fresh:old,r=range(req,data);res.writeHead(r.code,r.headers);
    if(r.end===0||req.url==='/new')return res.end(data.subarray(r.start,r.end+1));
    let pos=r.start;const timer=setInterval(()=>{const end=Math.min(pos+16384,r.end+1);res.write(data.subarray(pos,end));pos=end;if(pos>r.end){clearInterval(timer);res.end();}},5);res.on('close',()=>clearInterval(timer));
  });
  const j=m.add({url:url+'/old',connections:1});await waitFor(()=>j.downloaded>32768);
  await m.updateURL(j.id,{url:url+'/new'});assert.deepEqual(await complete(m,j),fresh);assert.equal(j.sha256,digest(fresh));await assert.rejects(m.updateURL(j.id,{url:url+'/old'}),/hoàn tất/);
});

test('batch API rejects invalid headers before adding any job and redacts accepted headers',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'fakeidm-api-regression-'));
  const app=await startServer({dataDir:path.join(root,'state'),downloadDir:path.join(root,'files'),port:0});t.after(async()=>{await app.close();await fs.rm(root,{recursive:true,force:true});});
  const endpoint=new URL(app.url).origin,headers={Authorization:'Bearer '+app.token,'Content-Type':'application/json'};
  let response=await fetch(endpoint+'/api/downloads',{method:'POST',headers,body:JSON.stringify({items:[{url:'http://127.0.0.1:1/good'},{url:'http://127.0.0.1:1/bad',headers:{Range:'bytes=1-'}}]})});
  assert.equal(response.status,400);assert.equal(app.manager.jobs.length,0);
  response=await fetch(endpoint+'/api/downloads',{method:'POST',headers,body:JSON.stringify({url:'http://127.0.0.1:1/file',scheduledAt:new Date(Date.now()+60000).toISOString(),headers:{Cookie:'session=private'}})});
  assert.equal(response.status,201);assert.equal('headers' in (await response.json()).jobs[0],false);
});
