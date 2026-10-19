import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {initialState,recordScans,applyVerifiedUpdate,saveState,loadState} from '../server/state.mjs';
import {scanSource} from '../server/collector.mjs';

const url='https://www.cdec.org.cn/';
const now='2026-10-19T01:00:00.000Z';
const later='2026-10-19T02:00:00.000Z';
const firstText='官方征集说明：截止日期为2026年12月21日。';
const secondText='官方征集说明：截止日期为2027年01月05日。';
const scan=(text,at=now)=>({url,label:'官方',ok:true,text,hash:createHash('sha256').update(text).digest('hex'),fetchedAt:at,resolvedUrl:url,candidates:[]});
const review=(state,result,runId='review-1')=>({revision:state.revision,runId,patches:[],sourceReviews:[{url,contentHash:result.hash,quote:result.text,checkedAt:later}]});

test('抓取器返回清洗正文、指纹、原始和最终URL及抓取时间',async()=>{
  const html='<main>'+firstText.repeat(10)+'</main>';
  const result=await scanSource({url},async()=>new Response(html,{headers:{'content-type':'text/html'}}));
  assert.equal(result.text,firstText.repeat(10));
  assert.equal(result.hash,createHash('sha256').update(result.text).digest('hex'));
  assert.equal(result.resolvedUrl,url);
  assert.ok(Number.isFinite(Date.parse(result.fetchedAt)));
});

test('首次抓取存档并入队，读取成功不等于已核验',()=>{
  const result=scan(firstText);
  const state=recordScans(initialState(),[result],now);
  assert.deepEqual(state.sourceVersions[0],{url,resolvedUrl:url,hash:result.hash,text:firstText,fetchedAt:now});
  assert.equal(state.reviewQueue.length,1);
  assert.equal(state.reviewQueue[0].contentHash,result.hash);
  assert.equal(state.reviewQueue[0].status,'pending');
  assert.equal(state.sourceChecks[0].fetchStatus,'success');
  assert.equal(state.sourceChecks[0].reviewStatus,'pending');
  assert.equal(state.lastVerifiedAt,null);
});

test('重复抓取不重复存档或入队，也不清除待核验状态',()=>{
  let state=recordScans(initialState(),[scan(firstText)],now);
  state=recordScans(state,[scan(firstText,later)],later);
  assert.equal(state.sourceVersions.length,1);
  assert.equal(state.reviewQueue.length,1);
  assert.equal(state.sourceChecks[0].lastSuccessAt,later);
  assert.equal(state.sourceChecks[0].reviewStatus,'pending');
});

test('正文变化保留前后版本和可重建的差异，旧任务被替代',()=>{
  let state=recordScans(initialState(),[scan(firstText)],now);
  state=recordScans(state,[scan(secondText,later)],later);
  assert.equal(state.sourceVersions.length,2);
  const diff=state.sourceDiffs[0];
  assert.equal(diff.beforeHash,scan(firstText).hash);
  assert.equal(diff.afterHash,scan(secondText).hash);
  assert.equal(firstText.slice(0,diff.prefixLength)+diff.added+firstText.slice(diff.prefixLength+diff.removed.length),secondText);
  assert.equal(state.reviewQueue.filter(item=>item.status==='pending').length,1);
  assert.equal(state.reviewQueue.find(item=>item.contentHash===scan(firstText).hash).status,'superseded');
  assert.equal(state.events.find(event=>event.id==='silk21').deadline,'2026-12-21');
});

test('抓取失败保留正文和待核验队列，再次成功可以重试',()=>{
  let state=recordScans(initialState(),[scan(firstText)],now);
  const archived=structuredClone(state.sourceVersions);
  state=recordScans(state,[{url,ok:false,error:'timeout'}],later);
  assert.deepEqual(state.sourceVersions,archived);
  assert.equal(state.sourceChecks[0].fetchStatus,'failed');
  assert.equal(state.sourceChecks[0].reviewStatus,'pending');
  assert.equal(state.sourceChecks[0].error,'timeout');
  assert.equal(state.sourceChecks[0].lastSuccessAt,now);
  state=recordScans(state,[scan(firstText,later)],later);
  assert.equal(state.sourceChecks[0].fetchStatus,'success');
  assert.equal(state.sourceChecks[0].error,null);
  assert.equal(state.reviewQueue.length,1);
});

test('旧版本核验即使使用最新revision也不能清除新变化',()=>{
  const oldResult=scan(firstText);
  let state=recordScans(initialState(),[oldResult],now);
  state=recordScans(state,[scan(secondText,later)],later);
  assert.throws(()=>applyVerifiedUpdate(state,review(state,oldResult),later),/正文版本/);
  assert.equal(state.sourceChecks[0].reviewStatus,'pending');
  assert.equal(state.reviewQueue.find(item=>item.contentHash===scan(secondText).hash).status,'pending');
});

test('当前版本核验只完成对应任务，重复抓取及失败不抹掉核验结果',()=>{
  const result=scan(firstText);
  let state=recordScans(initialState(),[result],now);
  state=applyVerifiedUpdate(state,review(state,result),later);
  assert.equal(state.reviewQueue[0].status,'verified');
  assert.equal(state.sourceChecks[0].reviewedHash,result.hash);
  assert.equal(state.sourceChecks[0].reviewStatus,'verified');
  state=recordScans(state,[scan(firstText,later)],later);
  assert.equal(state.reviewQueue.length,1);
  state=recordScans(state,[{url,ok:false,error:'HTTP 503'}],later);
  assert.equal(state.sourceChecks[0].fetchStatus,'failed');
  assert.equal(state.sourceChecks[0].reviewStatus,'verified');
});

test('缺少版本或伪造原文不能核验已存档来源，旧证据不能写入字段',()=>{
  const result=scan(firstText);
  let state=recordScans(initialState(),[result],now);
  const batch=review(state,result);
  delete batch.sourceReviews[0].contentHash;
  assert.throws(()=>applyVerifiedUpdate(state,batch,later),/正文版本/);
  batch.sourceReviews[0].contentHash=result.hash;
  batch.sourceReviews[0].quote='这段文字不存在于官方原文中';
  assert.throws(()=>applyVerifiedUpdate(state,batch,later),/原文/);
  state=recordScans(state,[scan(secondText,later)],later);
  assert.throws(()=>applyVerifiedUpdate(state,{revision:state.revision,runId:'stale-field',patches:[{id:'silk21',changes:{deadline:'2027-01-05'},evidence:[{field:'deadline',url,quote:firstText,contentHash:result.hash,checkedAt:later}]}]},later),/正文版本/);
});

test('旧数据缺少新增集合时兼容读取和首次正文补档',async()=>{
  const oldState=initialState();
  delete oldState.sourceVersions;
  delete oldState.sourceDiffs;
  delete oldState.reviewQueue;
  oldState.sourceChecks=[{url,hash:scan(firstText).hash,status:'ok',lastSuccessAt:now}];
  const bucket={get:async()=>({etag:'old',text:async()=>JSON.stringify(oldState)})};
  const {state}=await loadState(bucket);
  assert.deepEqual(state.sourceVersions,[]);
  const next=recordScans(state,[scan(firstText,later)],later);
  assert.equal(next.sourceVersions.length,1);
  assert.equal(next.reviewQueue[0].status,'pending');
  assert.equal(next.events.length,oldState.events.length);
});

test('内容回退复用同一正文和任务，不重复入队',()=>{
  let state=recordScans(initialState(),[scan(firstText)],now);
  state=recordScans(state,[scan(secondText,later)],later);
  state=recordScans(state,[scan(firstText,later)],later);
  assert.equal(state.sourceVersions.length,2);
  assert.equal(state.reviewQueue.length,2);
  assert.equal(state.reviewQueue.find(item=>item.contentHash===scan(firstText).hash).status,'pending');
  assert.equal(state.reviewQueue.filter(item=>item.status==='pending').length,1);
});

test('版本与队列随数据库持久化，条件写入参数不变',async()=>{
  const state=recordScans(initialState(),[scan(firstText)],now);
  let saved;
  const bucket={put:async(key,body,options)=>{assert.deepEqual(options.onlyIf,{etagMatches:'etag-1'});saved=body;return {etag:'etag-2'};},get:async()=>({etag:'etag-2',text:async()=>saved})};
  await saveState(bucket,state,'etag-1');
  assert.deepEqual((await loadState(bucket)).state,state);
});

test('长正文末尾变化也会产生不同指纹',async()=>{
  const prefix='官方征集说明。'.repeat(24000);
  const fetchText=async suffix=>scanSource({url},async()=>new Response('<main>'+prefix+suffix+'</main>',{headers:{'content-type':'text/html'}}));
  const before=await fetchText('截止2026年12月21日');
  const after=await fetchText('截止2027年01月05日');
  assert.ok(before.text.length>160000);
  assert.notEqual(before.hash,after.hash);
});

test('已核验正文回退时恢复对应核验身份，不沿用其他版本的标记',()=>{
  const first=scan(firstText),second=scan(secondText,later);
  let state=recordScans(initialState(),[first],now);
  state=applyVerifiedUpdate(state,review(state,first),later);
  state=recordScans(state,[second],later);
  state=applyVerifiedUpdate(state,review(state,second,'review-2'),later);
  state=recordScans(state,[scan(firstText,later)],later);
  assert.equal(state.sourceChecks[0].reviewedHash,first.hash);
  assert.equal(state.sourceChecks[0].reviewNote,firstText);
  assert.equal(state.sourceChecks[0].reviewStatus,'verified');
  assert.equal(state.reviewQueue.length,2);
});
