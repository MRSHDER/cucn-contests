import {events,catalog} from '../public/data.mjs';
import {siteConfig} from '../config/site.mjs';
import {withSourceArchive,archiveScan,validateContentEvidence,completeSourceReview} from './source-archive.mjs';
export function validateSourceURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&siteConfig.sourceDomains.some(h=>u.hostname===h||u.hostname.endsWith('.'+h));}catch{return false;}}
export function initialState(){return withSourceArchive({version:1,revision:0,events:structuredClone(events),catalog:structuredClone(catalog),settings:structuredClone(siteConfig),sourceChecks:[],changes:[],candidates:[],runs:[],appliedRuns:[],lastScanAt:null,lastVerifiedAt:null,schedule:{enabled:false,description:'自动任务尚未启用'}});}
const allowed=new Set(['deadline','deadlineTime','deadlineTentative','deadlineLabel','start','individual','online','travel','mail','fee','schoolGate','closed','flags','submission','reasons','tags','sources','awardTrip','title','subtitle','effort']);
const dates=new Set(['deadline','start']);
function validateField(k,v){
 if(!allowed.has(k))throw Error('不允许修改该字段：'+k);
 if(dates.has(k)&&v!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00+08:00'))))throw Error('日期格式无效');
 if(k==='deadlineTime'&&v!==null&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))throw Error('截止时刻无效');
 if(['individual','online'].includes(k)&&!['yes','no','unknown'].includes(v))throw Error('流程值无效');
 if(k==='travel'&&!['no','required','unknown'].includes(v))throw Error('外出值无效');
 if(k==='mail'&&!['no','conditional','required','unknown'].includes(v))throw Error('寄送值无效');
 if(['flags','submission','reasons','tags'].includes(k)&&(!Array.isArray(v)||v.length>30||v.some(x=>typeof x!=='string'||x.length>3000)))throw Error('列表格式无效');
 if(k==='sources'&&(!Array.isArray(v)||!v.length||v.length>12||v.some(s=>!validateSourceURL(s.url)||!s.label||!s.supports)))throw Error('仅接受已登记官方来源');
 if(k==='fee'&&v!==null&&(typeof v!=='number'||v<0||v>100000))throw Error('费用值无效');
 if(['schoolGate','deadlineTentative','closed'].includes(k)&&v!==null&&typeof v!=='boolean')throw Error('布尔字段无效');
 if(typeof v==='string'&&v.length>6000)throw Error('字段过长');
}
function validateEvidence(e,field,now){if(!e||!validateSourceURL(e.url)||e.field!==field||typeof e.quote!=='string'||e.quote.trim().length<6||e.quote.length>2500||!Number.isFinite(Date.parse(e.checkedAt))||Math.abs(Date.parse(e.checkedAt)-Date.parse(now))>7*86400000)throw Error('缺少有效的官方字段证据：'+field);}
export function applyVerifiedUpdate(state,batch,now=new Date().toISOString()){
 if(!batch||typeof batch.runId!=='string'||!/^[a-zA-Z0-9._:-]{1,120}$/.test(batch.runId))throw Error('runId无效');
 if(state.appliedRuns.includes(batch.runId))return state;
 if(batch.revision!==state.revision)throw Error('版本冲突，请读取最新快照后重试');
 const next=withSourceArchive(structuredClone(state));let count=0;
 if((batch.patches?.length||0)>40||(batch.additions?.length||0)>15)throw Error('更新批次过大');
 for(const patch of batch.patches||[]){const event=next.events.find(e=>e.id===patch.id);if(!event)throw Error('赛事不存在');
  for(const [field,value] of Object.entries(patch.changes||{})){validateField(field,value);const evidence=patch.evidence?.find(e=>e.field===field);validateEvidence(evidence,field,now);validateContentEvidence(next,evidence);const before=event[field]??null;
   if(JSON.stringify(before)!==JSON.stringify(value)){next.changes.unshift({id:batch.runId+':'+event.id+':'+field,eventId:event.id,title:event.title,field,before,after:value,evidence,at:now,type:'verified'});event[field]=value;count++;}
  }event.checkedAt=now.slice(0,10);event.fieldEvidence={...(event.fieldEvidence||{}),...Object.fromEntries((patch.evidence||[]).map(e=>[e.field,e]))};
 }
 for(const item of batch.additions||[]){const e=item.event;if(!e||!/^[a-zA-Z0-9_-]{1,90}$/.test(e.id)||next.events.some(x=>x.id===e.id))throw Error('新增赛事ID无效或已存在');
  if(!next.catalog.rows.some(r=>r.n===e.catalogN))throw Error('新增赛事缺少学校目录对应条目');
  const row=next.catalog.rows.find(r=>r.n===e.catalogN);
  if(e.level!==row.level||e.observed!==(row.type==='观察目录'))throw Error('新增赛事等级必须与学校目录一致');
  for(const required of ['title','subtitle','deadline','individual','online','travel','mail','sources','submission','flags','reasons','tags']){validateField(required,e[required]);const evidence=item.evidence?.find(p=>p.field===required);validateEvidence(evidence,required,now);validateContentEvidence(next,evidence);}
  if(e.start)validateField('start',e.start);
  if(!e.sources?.length||!e.tags?.length)throw Error('新增赛事缺少官方来源与方向');
  const record={code:'NEW / VERIFIED',accent:'green',fee:null,schoolGate:null,recognitionScope:'special',deadlineTime:null,awardTrip:'待核实',effort:'待评估',...e,checkedAt:now.slice(0,10),fieldEvidence:Object.fromEntries(item.evidence.map(x=>[x.field,x]))};
  next.events.push(record);next.changes.unshift({id:batch.runId+':'+e.id,eventId:e.id,title:e.title,field:'new',before:null,after:e.subtitle,evidence:item.evidence[0],at:now,type:'new'});count++;
 }
 for(const c of batch.candidates||[]){if(!c.title||!validateSourceURL(c.url))throw Error('候选来源无效');if(!next.candidates.some(x=>x.url===c.url))next.candidates.unshift({title:String(c.title).slice(0,160),url:c.url,reason:String(c.reason||'新公告待核验').slice(0,400),at:now});}
 for(const review of batch.sourceReviews||[]){validateEvidence({...review,field:'source'},'source',now);completeSourceReview(next,review,now);}
 next.lastVerifiedAt=now;next.revision++;next.appliedRuns=[batch.runId,...next.appliedRuns].slice(0,200);next.runs.unshift({id:batch.runId,at:now,type:'verification',status:'success',summary:String(batch.summary||'完成官方信息核验').slice(0,1000),changes:count});next.changes=next.changes.slice(0,300);next.runs=next.runs.slice(0,80);next.candidates=next.candidates.slice(0,100);return next;
}
export function recordScans(state,results,now=new Date().toISOString()){
 const next=withSourceArchive(structuredClone(state));
 for(const result of results){if(!validateSourceURL(result.url))continue;let source=next.sourceChecks.find(s=>s.url===result.url);if(!source){source={url:result.url,hash:null,lastSuccessAt:null};next.sourceChecks.push(source);}
  source.lastAttemptAt=now;source.label=result.label||source.label||new URL(result.url).hostname;
  if(!result.ok){source.status='failed';source.fetchStatus='failed';source.error=String(result.error||'无法读取').slice(0,200);continue;}
  const changed=source.hash&&source.hash!==result.hash;archiveScan(next,source,result,now);source.fetchStatus='success';source.status=source.reviewStatus?source.reviewStatus==='pending'?'changed':'ok':changed?'changed':source.status==='changed'?'changed':'ok';source.error=null;source.lastSuccessAt=now;
  if(changed)next.changes.unshift({id:'scan:'+result.hash+':'+result.url,eventId:null,title:source.label,field:'source',before:source.hash,after:result.hash,evidence:{url:result.url,quote:'官方网页正文摘要发生变化，具体规则须重新核验。',checkedAt:now},at:now,type:'source'});
  source.hash=result.hash;
  for(const c of result.candidates||[]){if(validateSourceURL(c.url)&&!next.candidates.some(x=>x.url===c.url)&&!next.events.some(e=>e.sources.some(s=>s.url===c.url)))next.candidates.unshift({...c,reason:'官方页面发现的公告，尚未确认为可报名赛事。',at:now});}
 }
 next.lastScanAt=now;next.revision++;next.changes=next.changes.slice(0,300);next.candidates=next.candidates.slice(0,100);next.runs.unshift({id:'scan:'+now,at:now,type:'scan',status:results.every(r=>r.ok)?'success':'partial',summary:`检查${results.length}个官方页面，成功${results.filter(r=>r.ok).length}个；失败来源保留原记录。`});next.runs=next.runs.slice(0,80);return next;
}
export async function loadState(bucket){if(!bucket)throw Error('赛事数据库未绑定');const obj=await bucket.get('competition-notebook/state-v1.json');return {state:obj?withSourceArchive(JSON.parse(await obj.text())):initialState(),etag:obj?.etag||null};}
export async function saveState(bucket,state,etag){const obj=await bucket.put('competition-notebook/state-v1.json',JSON.stringify(state),{httpMetadata:{contentType:'application/json'},onlyIf:etag?{etagMatches:etag}:{etagDoesNotMatch:'*'}});if(!obj)throw Error('版本冲突，请读取最新快照后重试');return state;}
