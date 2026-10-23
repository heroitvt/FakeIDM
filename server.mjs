import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {DownloadManager} from './engine.mjs';
import {normalizeHeaders} from './http-policy.mjs';
import {defaultDataDir,revealPath} from './platform.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
export async function startServer({dataDir,downloadDir,port=17831,token,reveal=revealPath}={}) {
  dataDir ||= defaultDataDir();
  const manager=new DownloadManager({dataDir,downloadDir});
  let ready=false;
  function authorized(req) {const given=Buffer.from((req.headers.authorization||'').replace(/^Bearer /,''));const expected=Buffer.from(token);return given.length===expected.length && timingSafeEqual(given,expected);}
  function json(res,status,value) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
  async function body(req) {let bytes=0;const chunks=[];for await(const c of req){bytes+=c.length;if(bytes>256000)throw new Error('Yêu cầu quá lớn.');chunks.push(c);}return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
  const server=http.createServer(async(req,res)=>{
    try {
      if(!ready)return json(res,503,{error:'Đang khởi động.'});
      const host=`127.0.0.1:${server.address().port}`;
      if(req.headers.host!==host) return json(res,403,{error:'Host không hợp lệ.'});
      const origin=req.headers.origin;
      const allowed=!origin||origin===`http://${host}`||/^chrome-extension:\/\/[a-p]{32}$/.test(origin);
      if(!allowed) return json(res,403,{error:'Origin không hợp lệ.'});
      if(origin) {res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
      if(req.method==='OPTIONS') {res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,PUT');res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');res.writeHead(204);return res.end();}
      const url=new URL(req.url,`http://${host}`);
      if(url.pathname.startsWith('/api/')) {
        if(!authorized(req)) return json(res,401,{error:'Mở FakeIDM từ ứng dụng để kết nối.'});
        if(req.method==='GET'&&url.pathname==='/api/state') return json(res,200,{...manager.snapshot(),app:{name:'FakeIDM',version:'1.2.0',platform:process.platform}});
        if(req.method==='POST'&&url.pathname==='/api/downloads') {
          const b=await body(req);const items=Array.isArray(b.items)?b.items:[b];
          if(!items.length||items.length>100)throw new Error('Mỗi lần thêm từ 1 đến 100 đường dẫn.');
          // Validate the whole batch before adding any job.
          for(const item of items){normalizeHeaders(item.headers);const u=new URL(item.url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error('Đường dẫn HTTP/HTTPS không hợp lệ.');if(item.scheduledAt&&!Number.isFinite(Date.parse(item.scheduledAt)))throw new Error('Thời gian không hợp lệ.');const n=Number(item.connections||manager.settings.connections);if(!Number.isInteger(n)||n<1||n>16)throw new Error('Số kết nối không hợp lệ.');}
          const ids=items.map(x=>manager.add(x).id);return json(res,201,{jobs:manager.snapshot().jobs.filter(j=>ids.includes(j.id))});
        }
        if(req.method==='PUT'&&url.pathname==='/api/settings') {await manager.configure(await body(req));return json(res,200,{ok:true});}
        if(req.method==='POST'&&url.pathname==='/api/pause-all') {await Promise.all(manager.jobs.filter(j=>['queued','scheduled','probing','downloading','assembling'].includes(j.status)).map(j=>manager.pause(j.id)));return json(res,200,{ok:true});}
        if(req.method==='POST'&&url.pathname==='/api/resume-all') {for(const j of manager.jobs)if(['paused','error'].includes(j.status))manager.resume(j.id);return json(res,200,{ok:true});}
        if(req.method==='POST'&&url.pathname==='/api/reveal-folder') {await reveal(manager.settings.downloadDir);return json(res,200,{ok:true});}
        const match=/^\/api\/downloads\/([a-f0-9-]+)(?:\/(pause|resume|reveal|update-url))?$/.exec(url.pathname);
        if(match) {
          const [,id,action]=match;const job=manager.getJob(id);
          if(req.method==='DELETE'&&!action) {await manager.remove(id);return json(res,200,{ok:true});}
          if(req.method==='POST') {
            if(action==='pause')await manager.pause(id);
            else if(action==='resume')manager.resume(id);
            else if(action==='reveal'&&job.path)await reveal(job.path,true);
            else if(action==='update-url') {
              const b=await body(req);
              await manager.updateURL(id,b);
            }
            else throw new Error('Thao tác không hợp lệ.');
            return json(res,200,{ok:true});
          }
        }
        return json(res,404,{error:'Không tìm thấy API.'});
      }
      const assets={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/mark.svg':'mark.svg'};
      if(req.method!=='GET'||!assets[url.pathname]) return json(res,404,{error:'Không tìm thấy.'});
      const ext=path.extname(assets[url.pathname]);
      res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'})[ext], 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"});
      res.end(await fs.readFile(path.join(here,'public',assets[url.pathname])));
    } catch(e) {if(!res.headersSent)json(res,400,{error:e.message});else res.end();}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  // Reserve the port before opening state, so a duplicate launch cannot rewrite it.
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  try {
    await manager.init();
    if(!token){
      const tokenFile=path.join(dataDir,'pairing-token.txt');
      try{token=(await fs.readFile(tokenFile,'utf8')).trim();}
      catch(e){if(e.code!=='ENOENT')throw e;token=randomBytes(32).toString('hex');await fs.writeFile(tokenFile,token,{flag:'wx',mode:0o600});}
      if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Mã kết nối trong pairing-token.txt không hợp lệ.');
    }
    ready=true;
  } catch(e){clearInterval(manager.timer);await new Promise(r=>server.close(r));throw e;}
  return {server,manager,token,url:`http://127.0.0.1:${server.address().port}/#token=${token}`,close:async()=>{await manager.close();await new Promise(r=>server.close(r));}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const app=await startServer({port:Number(process.env.FAKEIDM_PORT||17831),downloadDir:process.env.FAKEIDM_DOWNLOADS});
  console.log(JSON.stringify({url:app.url}));
  if(process.argv.includes('--open')) await revealPath(app.url);
  let closing=false;
  const shutdown=async()=>{if(closing)return;closing=true;await app.close();process.exit(0);};
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,shutdown);
  if(process.argv.includes('--parent-pipe')){process.stdin.resume();process.stdin.on('end',shutdown);}
}
