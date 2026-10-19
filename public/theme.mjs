// 白天 / 夜间一键切换。手动选择后记住；没选过就跟随系统设置。
const root=document.documentElement,btn=document.getElementById('theme-toggle'),KEY='cucn-theme';
const reduce=matchMedia('(prefers-reduced-motion: reduce)'),system=matchMedia('(prefers-color-scheme: dark)');
const stored=()=>{try{return localStorage.getItem(KEY);}catch{return null;}};
function apply(theme){root.setAttribute('data-theme',theme);const dark=theme==='dark';
 btn.setAttribute('aria-pressed',String(dark));btn.setAttribute('aria-label',dark?'切换到白天模式':'切换到夜间模式');btn.title=dark?'切换到白天模式':'切换到夜间模式';}
apply(root.getAttribute('data-theme')==='dark'?'dark':'light');
system.addEventListener('change',e=>{if(!stored())apply(e.matches?'dark':'light');});
btn.addEventListener('click',()=>{
 const next=root.getAttribute('data-theme')==='dark'?'light':'dark';
 const commit=()=>{apply(next);try{localStorage.setItem(KEY,next);}catch{}};
 if(!document.startViewTransition||reduce.matches){commit();return;}
 // 以按钮为圆心，新主题像墨水一样晕开
 const r=btn.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
 const radius=Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y));
 root.classList.add('theme-switching');
 const t=document.startViewTransition(commit);
 t.ready.then(()=>root.animate({clipPath:[`circle(0px at ${x}px ${y}px)`,`circle(${radius}px at ${x}px ${y}px)`]},{duration:650,easing:'cubic-bezier(.4,0,.2,1)',pseudoElement:'::view-transition-new(root)'})).catch(()=>{});
 t.finished.finally(()=>root.classList.remove('theme-switching'));
});
