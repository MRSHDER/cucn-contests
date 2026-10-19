// 动效增强：数字滚动、卡片依次出现、关注按钮弹跳。不影响任何数据与交互逻辑。
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
// 1. 统计数字从0滚动到当前值（只在数值变化时滚动）
const anim=new WeakMap();
function write(el,text){obs.disconnect();el.textContent=text;watch();}
function countUp(el,delay=0){const target=parseInt(el.textContent,10);if(Number.isNaN(target))return;
 const a=anim.get(el);if(a&&a.target===target)return; // 动画进行中且目标没变：保持动画，忽略页面的重复写入
 if(!a&&el.dataset.shown===String(target))return;
 if(reduce.matches){el.dataset.shown=String(target);return;}
 const from=a?a.value:parseInt(el.dataset.shown||'0',10),pad=Math.max(2,el.textContent.length),state={target,value:from};anim.set(el,state);el.dataset.shown=String(target);write(el,String(from).padStart(pad,'0'));
 let start=null;const dur=900;
 const tick=t=>{if(anim.get(el)!==state)return;start??=t;const k=Math.min(1,(t-start)/dur);state.value=Math.round(from+(target-from)*(1-Math.pow(1-k,3)));write(el,String(state.value).padStart(pad,'0'));if(k<1)requestAnimationFrame(tick);else anim.delete(el);};
 setTimeout(()=>requestAnimationFrame(tick),delay);}
const stats=['stat-open','stat-soon','stat-pending','stat-saved'].map(id=>document.getElementById(id)).filter(Boolean);
const obs=new MutationObserver(recs=>{for(const r of recs){const el=r.target.nodeType===1?r.target:r.target.parentElement;const s=el?.closest?.('[id^="stat-"]');if(stats.includes(s))countUp(s);}});
const watch=()=>stats.forEach(el=>obs.observe(el,{childList:true,characterData:true,subtree:true}));
watch();stats.forEach((el,i)=>countUp(el,300+i*80));
// 2. 新出现的卡片依次浮现；每分钟的自动刷新若卡片不变则不重复播放
const grid=document.getElementById('event-grid');let seen=new Set();let lastSaved=null;
function markCards(){const cards=[...grid.querySelectorAll('.event-card')];let i=0;const now=new Set();
 for(const c of cards){const id=c.dataset.event;now.add(id);if(!seen.has(id)){c.classList.add('enter');c.style.setProperty('--i',i++);}}
 seen=now;if(lastSaved){grid.querySelector(`[data-save="${CSS.escape(lastSaved)}"]`)?.classList.add('pop');lastSaved=null;}}
if(grid){markCards();new MutationObserver(markCards).observe(grid,{childList:true});
 document.addEventListener('click',e=>{const b=e.target.closest('[data-save]');if(b)lastSaved=b.dataset.save;},true);}
