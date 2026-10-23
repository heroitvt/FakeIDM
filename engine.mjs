import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {normalizeHeaders,headersForURL,isGoogleURL} from './http-policy.mjs';

export function safeName(value) {
  let name = String(value || 'download').normalize('NFC').replace(/[\\/<>:"|?*\x00-\x1f\x7f]/g, '_').replace(/^\.+/, '').replace(/[. ]+$/, '').trim();
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name)) name = '_' + name;
  while (Buffer.byteLength(name) > 180) name = name.slice(0, -1);
  return name || 'download';
}
export function validateURL(value) {
  const u = new URL(value);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('Chỉ hỗ trợ URL HTTP/HTTPS, không chứa mật khẩu.');
  return u.href;
}
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

function get(url, headers, signal, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 8) return reject(new Error('Quá nhiều chuyển hướng.'));
    const u = new URL(validateURL(url));
    const defaultHeaders = {
      'User-Agent': BROWSER_UA,
      'Accept': '*/*',
      'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
      'Accept-Encoding': 'identity'
    };
    if (isGoogleURL(u.href) && !headers?.Referer && !headers?.referer) {
      defaultHeaders['Referer'] = 'https://drive.google.com/';
    }
    const req = (u.protocol === 'https:' ? https : http).get(u, { headers: { ...defaultHeaders, ...headers }, signal }, res => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        const next = new URL(res.headers.location, u);
        res.destroy();
        get(next.href, headersForURL(headers,u.href,next.href), signal, hops + 1).then(resolve, reject);
      } else resolve({res, url: u.href});
    });
    req.setTimeout(30000, () => req.destroy(new Error('Máy chủ không phản hồi trong 30 giây.')));
    req.on('error', reject);
  });
}
function validator(h) { return h.etag && !h.etag.startsWith('W/') ? h.etag : h['last-modified'] || null; }
function responseName(headers, url) {
  const cd = headers['content-disposition'] || '';
  let name = /filename\*=UTF-8''([^;]+)/i.exec(cd)?.[1];
  if (name) { try { name = decodeURIComponent(name); } catch { name = null; } }
  if (!name) name = /filename="([^"]+)"/i.exec(cd)?.[1] || /filename=([^;]+)/i.exec(cd)?.[1];
  if (!name) { try { name = decodeURIComponent(new URL(url).pathname.split('/').pop()); } catch {} }
  return safeName(name);
}
async function probe(url, signal, extraHeaders = {}) {
  const {res, url: finalURL} = await get(url, {...extraHeaders, Range:'bytes=0-0'}, signal);
  try {
    if (res.statusCode < 200 || res.statusCode >= 300) throw new Error(`Máy chủ trả về HTTP ${res.statusCode}.`);
    if (res.headers['content-type'] && res.headers['content-type'].includes('text/html')) {
      throw new Error('Đường dẫn trả về trang web HTML thay vì file. Có thể Google Drive bị giới hạn Quota hoặc link yêu cầu đăng nhập/xác nhận.');
    }
    const cr = /^bytes 0-0\/(\d+)$/.exec(res.headers['content-range'] || '');
    const ranges = res.statusCode === 206 && !!cr;
    const length = ranges ? Number(cr[1]) : Number(res.headers['content-length']);
    if (res.statusCode === 206 && !ranges) throw new Error('Content-Range không hợp lệ.');
    if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') throw new Error('Máy chủ bắt buộc nén nội dung; đường dẫn này chưa được hỗ trợ.');
    return { size: Number.isSafeInteger(length) && length >= 0 ? length : null, ranges, validator:validator(res.headers), finalURL, name:responseName(res.headers, finalURL) };
  } finally { res.destroy(); }
}

export class DownloadManager {
  constructor({dataDir, downloadDir}) {
    this.dataDir = dataDir;
    this.downloadDir = downloadDir || path.join(os.homedir(), 'Downloads', 'FakeIDM');
    this.jobs = []; this.active = new Map(); this.closing = false;
    this.updating=new Set();
    this.settings = {
      downloadDir: this.downloadDir,
      concurrency: 2,
      connections: 8,
      speedLimit: 0,
      autoCatch: true,
      fileTypes: 'ZIP, RAR, 7Z, TAR, GZ, ISO, DMG, PKG, EXE, MSI, APK, BIN, PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, MP3, WAV, FLAC, MP4, MKV, AVI, MOV, WMV, FLV, WEBM, TORRENT'
    };
    this.statePath = path.join(dataDir, 'state.json');
    this.rateTokens = 0; this.lastRateSample = Date.now();
  }
  async init() {
    await fsp.mkdir(this.dataDir, {recursive:true, mode:0o700});
    try {
      const state = JSON.parse(await fsp.readFile(this.statePath, 'utf8'));
      this.settings = {...this.settings, ...state.settings};
      this.jobs = state.jobs.map(j => ({...j, speed:0, status:['downloading','queued','probing','assembling'].includes(j.status) ? 'paused' : j.status}));
    } catch (e) { if (e.code !== 'ENOENT') throw new Error('Không đọc được lịch sử tải: ' + e.message); }
    await fsp.mkdir(this.settings.downloadDir, {recursive:true});
    this.timer = setInterval(() => { this.sampleSpeed(); this.pump(); }, 500);
    return this;
  }
  save() {
    const data = JSON.stringify({settings:this.settings, jobs:this.jobs.map(({speed, ...j}) => j)}, null, 2);
    fs.writeFileSync(this.statePath + '.tmp', data, {mode:0o600});
    fs.renameSync(this.statePath + '.tmp', this.statePath);
  }
  snapshot() { return {jobs:this.jobs.map(({headers,...j}) => ({...j, parts:j.parts?.map(p => ({start:p.start,end:p.end,done:p.done}))})), settings:this.settings}; }
  add({url, name, connections, scheduledAt, headers}) {
    url = validateURL(url);
    headers=normalizeHeaders(headers);
    if (scheduledAt && !Number.isFinite(Date.parse(scheduledAt))) throw new Error('Thời gian hẹn không hợp lệ.');
    const c = Number(connections || this.settings.connections);
    if (!Number.isInteger(c) || c < 1 || c > 16) throw new Error('Số kết nối phải từ 1 đến 16.');
    const j = {id:randomUUID(), url, name:safeName(name || new URL(url).pathname.split('/').pop()), customName:!!name, connections:c, scheduledAt:scheduledAt || null, status:scheduledAt && Date.parse(scheduledAt)>Date.now() ? 'scheduled':'queued', createdAt:new Date().toISOString(), downloaded:0, size:null, speed:0, parts:[], directory:this.settings.downloadDir, headers:headers||{}, error:null};
    this.jobs.unshift(j); this.save(); this.pump(); return j;
  }
  getJob(id) { const j = this.jobs.find(j => j.id===id); if (!j) throw new Error('Không tìm thấy lượt tải.'); return j; }
  async pause(id) {
    const j=this.getJob(id); if (j.status==='completed') return;
    const run=this.active.get(id);
    j.status='paused'; j.speed=0; j.scheduledAt=null;
    run?.controller.abort();
    if (run) await run.promise;
    this.save();
  }
  resume(id) {
    const j=this.getJob(id); if (j.status==='completed' || this.active.has(id)) return;
    if(this.updating.has(id))throw new Error('Đang cập nhật đường dẫn, hãy chờ hoàn tất.');
    j.status='queued'; j.error=null; j.scheduledAt=null; this.save(); this.pump();
  }
  async remove(id) {
    if(this.updating.has(id))throw new Error('Đang cập nhật đường dẫn, hãy chờ hoàn tất.');
    const j=this.getJob(id); await this.pause(id);
    await fsp.rm(path.join(this.dataDir, j.id), {recursive:true,force:true});
    await fsp.rm(path.join(j.directory,`.fakeidm-${j.id}.tmp`),{force:true});
    this.jobs=this.jobs.filter(x=>x.id!==id); this.save();
  }
  async updateURL(id,{url,headers}) {
    url=validateURL(url);
    if(headers!==undefined)headers=normalizeHeaders(headers);
    const j=this.getJob(id);
    if(j.status==='completed')throw new Error('File đã hoàn tất; hãy tạo lượt tải mới.');
    if(this.updating.has(id))throw new Error('Đang cập nhật đường dẫn.');
    this.updating.add(id);
    try {
      await this.pause(id);
      if(j.status==='completed')throw new Error('File đã hoàn tất; hãy tạo lượt tải mới.');
      await fsp.rm(path.join(this.dataDir,id),{recursive:true,force:true});
      await fsp.rm(path.join(j.directory,`.fakeidm-${id}.tmp`),{force:true});
      const nextHeaders=headers??headersForURL(j.headers||{},j.url,url);
      Object.assign(j,{url,headers:nextHeaders,finalURL:null,validator:null,size:null,ranges:false,parts:[],downloaded:0,speed:0,sha256:null,path:null,completedAt:null,scheduledAt:null,status:'queued',error:null});
      this.save();
    }finally{this.updating.delete(id);this.pump();}
  }
  async configure(input) {
    const next={...this.settings};
    for (const [key,min,max] of [['concurrency',1,6],['connections',1,16],['speedLimit',0,1000000]]) {
      if (input[key]!==undefined) { const n=Number(input[key]); if(!Number.isInteger(n)||n<min||n>max) throw new Error('Giá trị cài đặt không hợp lệ: '+key); next[key]=n; }
    }
    if(input.downloadDir!==undefined) {
      if(typeof input.downloadDir!=='string'||!path.isAbsolute(input.downloadDir)) throw new Error('Hãy nhập đường dẫn thư mục đầy đủ.');
      await fsp.mkdir(input.downloadDir,{recursive:true}); await fsp.access(input.downloadDir,fs.constants.W_OK); next.downloadDir=input.downloadDir;
    }
    if(input.fileTypes!==undefined) {
      if(typeof input.fileTypes!=='string') throw new Error('Danh sách định dạng file không hợp lệ.');
      next.fileTypes=input.fileTypes.trim();
    }
    if(input.autoCatch!==undefined) {
      next.autoCatch=Boolean(input.autoCatch);
    }
    this.settings=next; this.rateTokens=0; this.lastRateSample=Date.now(); this.save(); this.pump();
  }
  pump() {
    if (this.closing) return;
    for(const j of this.jobs) if(j.status==='scheduled' && Date.parse(j.scheduledAt)<=Date.now()) j.status='queued';
    for(const j of [...this.jobs].reverse()) {
      if(this.active.size>=this.settings.concurrency) break;
      if(j.status!=='queued'||this.active.has(j.id)||this.updating.has(j.id)) continue;
      const controller=new AbortController();
      const run={controller,promise:null,lastBytes:j.downloaded,lastTime:Date.now()};
      this.active.set(j.id,run);
      run.promise=this.run(j,controller.signal).catch(e=>{
        if(!controller.signal.aborted) {j.status='error';j.error=e.message;}
      }).finally(()=>{ j.speed=0;this.active.delete(j.id);this.save();this.pump(); });
    }
  }
  sampleSpeed() {
    for(const [id,r] of this.active) {const j=this.getJob(id);const now=Date.now();j.speed=Math.max(0,(j.downloaded-r.lastBytes)/((now-r.lastTime)/1000));r.lastBytes=j.downloaded;r.lastTime=now;}
  }
  async throttle(bytes,signal) {
    while(this.settings.speedLimit) {
      signal.throwIfAborted();
      const now=Date.now(), rate=this.settings.speedLimit*1024;
      this.rateTokens=Math.min(Math.max(65536,bytes,rate/4),this.rateTokens+(now-this.lastRateSample)*rate/1000);
      this.lastRateSample=now;
      if(this.rateTokens>=bytes){this.rateTokens-=bytes;return;}
      await delay(Math.min(100,Math.max(1,(bytes-this.rateTokens)*1000/rate)),undefined,{signal});
    }
  }
  async run(j,signal) {
    j.status='probing';j.error=null;
    const info=await probe(j.url,signal,j.headers); signal.throwIfAborted();
    const dir=path.join(this.dataDir,j.id); await fsp.mkdir(dir,{recursive:true});
    const previous=j.parts.length>0;
    const reset=previous && (!info.ranges || !info.validator || info.validator!==j.validator || info.size!==j.size || info.finalURL!==j.finalURL);
    if(reset) {await fsp.rm(dir,{recursive:true,force:true});await fsp.mkdir(dir,{recursive:true});j.parts=[];j.downloaded=0;}
    Object.assign(j,{size:info.size,ranges:info.ranges,validator:info.validator,finalURL:info.finalURL});
    if(!j.customName) j.name=info.name;
    if(!j.parts.length) {
      const isGoogle = isGoogleURL(info.finalURL || j.url);
      const maxConn = isGoogle ? Math.min(2, j.connections) : j.connections;
      const n=info.ranges && info.validator && info.size>0 ? Math.min(maxConn,Math.max(1,Math.floor(info.size/(512*1024)))) : 1;
      const step=info.size===null ? null : Math.ceil(info.size/n);
      j.parts=Array.from({length:n},(_,i)=>({start:step===null?0:i*step,end:step===null?null:Math.min(info.size-1,(i+1)*step-1),done:0}));
    }
    for(let i=0;i<j.parts.length;i++) {
      let size=0;try {size=(await fsp.stat(path.join(dir,String(i)))).size;}catch(e){if(e.code!=='ENOENT')throw e;}
      const p=j.parts[i];
      if(p.end!==null && size>p.end-p.start+1) throw new Error('Phần tải tạm có kích thước không hợp lệ.');
      p.done=size;
    }
    j.downloaded=j.parts.reduce((n,p)=>n+p.done,0);j.status='downloading';this.save();
    const peers=new AbortController();const combined=AbortSignal.any([signal,peers.signal]);
    const results=await Promise.allSettled(j.parts.map((p,i)=>this.downloadPart(j,p,path.join(dir,String(i)),combined).catch(e=>{peers.abort();throw e;})));
    signal.throwIfAborted();
    const failure=results.find(r=>r.status==='rejected' && r.reason?.name!=='AbortError') || results.find(r=>r.status==='rejected');
    if(failure) throw failure.reason;
    j.status='assembling';this.save();
    await fsp.mkdir(j.directory,{recursive:true});
    const temp=path.join(j.directory,`.fakeidm-${j.id}.tmp`);
    const out=await fsp.open(temp,'w',0o600);const hash=createHash('sha256');let total=0;
    try {
      for(let i=0;i<j.parts.length;i++) {
        for await(const chunk of fs.createReadStream(path.join(dir,String(i)))) {
          signal.throwIfAborted();hash.update(chunk);total+=chunk.length;
          let offset=0;while(offset<chunk.length) offset+=(await out.write(chunk,offset,chunk.length-offset)).bytesWritten;
        }
      }
      if(j.size!==null && total!==j.size) throw new Error('Kích thước file hoàn tất không khớp.');
      await out.sync();
    } finally {await out.close();if(signal.aborted) await fsp.rm(temp,{force:true});}
    signal.throwIfAborted();
    const ext=path.extname(j.name),base=j.name.slice(0,j.name.length-ext.length);
    for(let suffix=0;;suffix++) {
      const name=suffix?`${base} (${suffix})${ext}`:j.name;
      const dest=path.join(j.directory,name);
      try {await fsp.link(temp,dest);j.path=dest;j.name=name;break;} catch(e){if(e.code!=='EEXIST') throw e;}
    }
    await fsp.unlink(temp);
    j.sha256=hash.digest('hex');j.size=total;j.downloaded=total;j.status='completed';j.completedAt=new Date().toISOString();this.save();
    await fsp.rm(dir,{recursive:true,force:true});
  }
  async downloadPart(j,p,file,signal) {
    if(j.size===0) {await fsp.writeFile(file,'');return;}
    const maxChunk=isGoogleURL(j.finalURL||j.url)?8*1024*1024:64*1024*1024;
    while(p.end===null||p.done<p.end-p.start+1) {
      let success=false;
      for(let attempt=0;attempt<4;attempt++) {
        signal.throwIfAborted();
        let res,handle;
        try {
          // A partial response without a validator cannot safely be appended to a new response.
          if((!j.ranges||!j.validator)&&p.done) {
            j.downloaded-=p.done;p.done=0;await fsp.truncate(file,0);
          }
          // Recalculate after EVERY failed response, because p.done may have advanced.
          const start=p.start+p.done;
          if(p.end!==null&&start>p.end){success=true;break;}
          const end=j.ranges&&j.validator&&p.end!==null?Math.min(p.end,start+maxChunk-1):p.end;
          const headers=headersForURL(j.headers||{},j.url,j.finalURL);
          if(j.ranges)headers.Range=end===null?`bytes=${start}-`:`bytes=${start}-${end}`;
          if(j.ranges&&j.validator)headers['If-Range']=j.validator;
          ({res}=await get(j.finalURL,headers,signal));
          if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity')throw new Error('Không hỗ trợ phản hồi nén.');
          if(/text\/html/i.test(res.headers['content-type']||''))throw new Error('Máy chủ trả về trang HTML thay vì file. Link có thể hết hạn, cần đăng nhập/xác nhận hoặc bị giới hạn lượt tải.');
          if(j.ranges) {
            const expected=`bytes ${start}-${end}/${j.size}`;
            if(res.statusCode!==206||res.headers['content-range']!==expected)throw new Error('Máy chủ từ chối Range hoặc file nguồn đã thay đổi. Bấm Tiếp tục để kiểm tra lại.');
          }else if(res.statusCode!==200)throw new Error(`Máy chủ trả về HTTP ${res.statusCode}.`);
          if(j.validator&&validator(res.headers)!==j.validator)throw new Error('File nguồn đã thay đổi. Bấm Tiếp tục để tải bản mới.');
          handle=await fsp.open(file,'a',0o600);
          for await(const chunk of res) {
            signal.throwIfAborted();
            if(end!==null&&p.done+chunk.length>end-p.start+1)throw new Error('Máy chủ gửi nhiều dữ liệu hơn yêu cầu.');
            await this.throttle(chunk.length,signal);
            let offset=0;
            while(offset<chunk.length){const {bytesWritten}=await handle.write(chunk,offset,chunk.length-offset);offset+=bytesWritten;p.done+=bytesWritten;j.downloaded+=bytesWritten;}
          }
          if(end!==null&&p.done!==end-p.start+1)throw new Error('Kết nối bị ngắt trước khi tải đủ dữ liệu.');
          await handle.sync();success=true;break;
        }catch(error){
          if(signal.aborted||attempt===3)throw error;
          await delay(400*2**attempt,undefined,{signal});
        }finally{res?.destroy();await handle?.close();}
      }
      if(!success)throw new Error('Không hoàn tất được phần tải.');
      if(p.end===null)break;
    }
  }
  async close() {
    this.closing=true;clearInterval(this.timer);
    await Promise.all([...this.active.keys()].map(id=>this.pause(id)));
    this.save();
  }
}
