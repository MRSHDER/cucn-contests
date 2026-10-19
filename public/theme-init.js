// 在页面绘制前确定主题，避免夜间模式下先闪一下白屏。
(function(){var t=null;try{t=localStorage.getItem('cucn-theme');}catch(e){}
if(t!=='dark'&&t!=='light')t=window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
document.documentElement.setAttribute('data-theme',t);})();
