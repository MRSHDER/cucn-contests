import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAPI} from '../server/api.mjs';
import {scanSource,textFromHTML} from '../server/collector.mjs';
import {initialState,saveState,loadState,recordScans} from '../server/state.mjs';
class Bucket{constructor(){this.body=null;this.version=0;}async get(){return this.body===null?null:{etag:String(this.version),text:async()=>this.body};}async put(key,body,options){if(options.onlyIf.etagMatches&&options.onlyIf.etagMatches!==String(this.version))return null;if(options.onlyIf.etagDoesNotMatch==='*'&&this.body!==null)return null;this.body=body;this.version++;return {etag:String(this.version)};}}
const origin='https://notebook.example.chatgpt.site';
const post=(path,body,headers={})=>new Request(origin+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test('API实际写入后快照读回相同run与revision，重复请求幂等',async()=>{const bucket=new Bucket();const body={revision:0,runId:'verify-no-change-1',summary:'已核验，无确认变更',patches:[]};let r=await handleAPI(post('/api/updates',body),bucket);assert.equal(r.status,200);r=await handleAPI(new Request(origin+'/api/snapshot'),bucket);const s=await r.json();assert.equal(s.revision,1);assert.equal(s.runs[0].id,body.runId);await handleAPI(post('/api/updates',body),bucket);assert.equal((await loadState(bucket)).state.runs.length,1);});
test('跨站请求拒绝写入，缺失JSON媒体类型拒绝写入',async()=>{const bucket=new Bucket();assert.equal((await handleAPI(post('/api/updates',{}, {origin:'https://evil.example'}),bucket)).status,403);assert.equal((await handleAPI(new Request(origin+'/api/updates',{method:'POST',body:'{}'}),bucket)).status,415);assert.equal(bucket.body,null);});
test('R2竞争写入只能一个成功，保护新数据',async()=>{const b=new Bucket();await saveState(b,initialState(),null);const a=await loadState(b),c=await loadState(b);a.state.revision=1;await saveState(b,a.state,a.etag);await assert.rejects(saveState(b,c.state,c.etag),/版本冲突/);assert.equal((await loadState(b)).state.revision,1);});
test('抓取解析仅收录登记官方域名公告，脚本正文不计入摘要',async()=>{const html='<html><script>secret script text</script><main>'+('设计艺术大赛官方征集说明。'.repeat(15))+'<a href="/articleDetail/123">2027设计大赛征集简章</a><a href="https://evil.example/">2027假大赛征稿通知</a></main></html>';const result=await scanSource({label:'官方',url:'https://www.cdec.org.cn/'},async()=>new Response(html,{headers:{'content-type':'text/html'}}));assert.equal(result.ok,true);assert.equal(result.candidates.length,1);assert.ok(!textFromHTML(html).includes('secret'));assert.match(result.hash,/^[a-f0-9]{64}$/);});
test('官方网页跳转到未登记目标时停止抓取',async()=>{let calls=0;const result=await scanSource({url:'https://www.cdec.org.cn/'},async()=>{calls++;return new Response('',{status:302,headers:{location:'https://127.0.0.1/'}});});assert.equal(result.ok,false);assert.equal(calls,1);});
test('无R2绑定时报告失败，不能把内存快照假装为已持久化',async()=>{const r=await handleAPI(new Request(origin+'/api/snapshot'),null);assert.equal(r.status,503);});

test('API正文版本冲突拒绝整批写入，正确版本完成队列并保存字段证据',async()=>{
  const bucket=new Bucket(),url='https://www.cdec.org.cn/',now=new Date().toISOString();
  const text='作品征集截止调整至2027年1月5日，请参赛者按时提交。'.repeat(5);
  const result=await scanSource({url},async()=>new Response(text,{headers:{'content-type':'text/html'}}));
  await saveState(bucket,recordScans(initialState(),[result],now),null);
  const batch={revision:1,runId:'archive-api',patches:[{id:'silk21',changes:{deadline:'2027-01-05'},evidence:[{field:'deadline',url,contentHash:result.hash,quote:'作品征集截止调整至2027年1月5日',checkedAt:now}]}],sourceReviews:[{url,contentHash:'old-version',quote:text,checkedAt:now}]};
  assert.equal((await handleAPI(post('/api/updates',batch),bucket)).status,409);
  let state=(await loadState(bucket)).state;
  assert.equal(state.revision,1);
  assert.equal(state.events.find(event=>event.id==='silk21').deadline,'2026-12-21');
  batch.sourceReviews[0].contentHash=result.hash;
  assert.equal((await handleAPI(post('/api/updates',batch),bucket)).status,200);
  state=await (await handleAPI(new Request(origin+'/api/snapshot'),bucket)).json();
  assert.equal(state.reviewQueue[0].status,'verified');
  assert.equal(state.events.find(event=>event.id==='silk21').fieldEvidence.deadline.contentHash,result.hash);
  assert.equal(state.changes[0].before,'2026-12-21');
  assert.equal(state.changes[0].after,'2027-01-05');
});

test('核验接口说明明确正文版本和队列合同',async()=>{
  const response=await handleAPI(new Request(origin+'/api/instructions'),new Bucket());
  const instructions=await response.json();
  assert.equal(instructions.version,3);
  assert.ok(instructions.schema.sourceReviews[0].contentHash);
  assert.ok(instructions.schema.patches[0].evidence[0].contentHash);
  assert.ok(instructions.archiveContract);
});
