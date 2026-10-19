export function deadlineInstant(e){return e.deadline?Date.parse(`${e.deadline}T${e.deadlineTime?e.deadlineTime+':00':'23:59:59.999'}+08:00`):Infinity;}
export function statusOf(e,now=new Date()){
 if(e.closed)return 'closed';
 if(!e.deadline)return 'unverified';
 const t=+now;
 if(t>=deadlineInstant(e))return 'closed';
 if(e.start&&t<Date.parse(`${e.start}T00:00:00+08:00`))return 'upcoming';
 return 'open';
}
export function filterEvents(events,f={},now=new Date()){
 const unknown=f.includeUnknown===true;
 const match=(value,wanted)=>!wanted||wanted==='any'||value===wanted||(unknown&&value==='unknown');
 return events.filter(e=>{
  if(f.status&&f.status!=='all'&&statusOf(e,now)!==f.status)return false;
  if(f.excludeObserved&&e.observed)return false;
  if(f.levels?.length&&!f.levels.includes(e.level))return false;
  if(f.tags?.length&&!f.tags.some(t=>e.tags.includes(t)))return false;
  if(f.q&&!`${e.title} ${e.subtitle||''} ${e.tags.join(' ')} ${e.organizer||''}`.toLowerCase().includes(f.q.trim().toLowerCase()))return false;
  if(!match(e.individual,f.individual)||!match(e.online,f.online))return false;
  if(f.travel==='no'&&!match(e.travel,'no'))return false;
  if(f.travel==='required'&&e.travel!=='required')return false;
  if(f.mail==='no'&&!match(e.mail,'no'))return false;
  if(f.mail==='required'&&!['required','conditional'].includes(e.mail))return false;
  if(f.free&&e.fee!==0)return false;
  if(f.noSchool&&e.schoolGate!==false)return false;
  if(f.before&&(!e.deadline||e.deadline>f.before))return false;
  if(f.after&&(!e.deadline||e.deadline<f.after))return false;
  return true;
 });
}
export function daysLeft(e,now=new Date()){return e.deadline?Math.max(0,Math.ceil((deadlineInstant(e)-now)/86400000)):null;}
export function rankEvents(events,sort='match',now=new Date()){
 const weight=e=>({A2:30,B2:20,C1:10,unknown:0}[e.level]||0)+(e.observed?-20:0)+(e.travel==='no'?12:e.travel==='required'?-50:0)+(e.individual==='yes'?6:0)+(e.online==='yes'?6:0)+(e.recognitionScope==='main'?4:0)+(statusOf(e,now)==='open'?15:0)+(e.mail==='no'?3:0);
 return [...events].sort((a,b)=>sort==='deadline'?deadlineInstant(a)-deadlineInstant(b):sort==='level'?(({A2:1,B2:2,C1:3}[a.level]||4)-({A2:1,B2:2,C1:3}[b.level]||4))||deadlineInstant(a)-deadlineInstant(b):weight(b)-weight(a)||deadlineInstant(a)-deadlineInstant(b));
}
export function selectionChange(ids,id){return ids.includes(id)?ids.filter(x=>x!==id):ids.length<4?[...ids,id]:[...ids];}
