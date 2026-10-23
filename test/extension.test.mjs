import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source=await fs.readFile(new URL('../extension/background.js',import.meta.url),'utf8');
function extension({offline=false,reject=false}={}){
  const calls=[],events={},store={token:'test-token',autoCatch:true,fileTypes:'ZIP'};
  const event=name=>({addListener:fn=>{events[name]=fn;}});
  const chrome={runtime:{onInstalled:event('installed'),openOptionsPage:async()=>{}},contextMenus:{create:()=>{},onClicked:event('menu')},action:{onClicked:event('action'),setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},cookies:{getAll:async query=>{calls.push(['cookies',query]);return[{name:'session',value:'scoped'}];}},storage:{local:{get:async()=>({...store}),set:async value=>Object.assign(store,value)}},downloads:{cancel:async id=>{calls.push(['cancel',id]);},onCreated:event('created'),onDeterminingFilename:event('filename')}};
  const sandbox={chrome,navigator:{userAgent:'TestBrowser'},URL,AbortSignal,console,setTimeout:()=>0,fetch:async(url,options={})=>{
    if(url.endsWith('/api/state'))return{ok:true,json:async()=>({settings:{autoCatch:true,fileTypes:'ZIP'}})};
    calls.push(['post',JSON.parse(options.body)]);
    if(offline)throw Error('Offline');
    return{ok:!reject,json:async()=>reject?{error:'Rejected'}:{jobs:[{id:'accepted'}]}};
  }};
  vm.createContext(sandbox);vm.runInContext(source,sandbox);return{sandbox,calls,events,store};
}
const item={id:0,url:'https://files.example/file.zip',filename:'file.zip',state:'in_progress'};
test('extension leaves browser download intact if manager is offline or rejects handoff',async()=>{
  for(const options of [{offline:true},{reject:true}]){const {sandbox,calls,store}=extension(options);await sandbox.handleDownloadInterception(item);assert.equal(calls.some(x=>x[0]==='cancel'),false);assert.match(store.lastError,/trình duyệt tiếp tục tải/);}
});
test('concurrent browser events submit once and cancel only after acceptance',async()=>{
  const {sandbox,calls}=extension();await Promise.all([sandbox.handleDownloadInterception(item),sandbox.handleDownloadInterception(item)]);
  assert.equal(calls.filter(x=>x[0]==='post').length,1);assert.equal(calls.filter(x=>x[0]==='cancel').length,1);assert.ok(calls.findIndex(x=>x[0]==='cancel')>calls.findIndex(x=>x[0]==='post'));
});
test('cookie collection only asks for exact URL, even when query mentions Google',async()=>{
  const {sandbox,calls}=extension();const url='https://files.example/file.zip?google.com';await sandbox.getCookiesForUrl(url);
  assert.equal(calls.length,1);assert.equal(calls[0][1].url,url);assert.equal(calls[0][1].domain,undefined);
});
test('filename hook acknowledges browser suggestion synchronously',()=>{
  const {events}=extension();let suggested=false;events.filename({...item,state:'complete'},()=>{suggested=true;});assert.equal(suggested,true);
});
