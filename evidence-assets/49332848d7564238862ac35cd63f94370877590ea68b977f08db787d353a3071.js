/* Slide real, mounted DOM scenes. No screenshot, video or ViewTransition raster.
 * The outgoing landing DOM lives briefly in a ShadowRoot to isolate IDs and CSS;
 * its WebGL canvas and listeners remain live. The workspace is ordinary DOM. */
export function installPageTransition(){
  if(window.__lunaTransition)return;window.__lunaTransition=true;
  const base=new URL('./',location.href),homeURL=location.href,homeTitle=document.title,homeBodyClass=document.body.className;
  const homeStyles=[...document.querySelectorAll('head link[rel=stylesheet]')].filter(l=>!l.href.endsWith('page-transition.css'));
  const transitionStyles=document.createElement('link');transitionStyles.rel='stylesheet';transitionStyles.href=new URL('src/page-transition.css',base);if(!document.querySelector('link[href$="page-transition.css"]'))document.head.append(transitionStyles);
  const status=document.createElement('div');status.className='lm-transition-status';status.role='status';document.body.append(status);
  let preparing=null,prepared=null,navScene=null,homeHost=null,homeRoot=null,homeChildren=[],homeScroll=0,navScroll=0,navStyles=[],scene='home',busy=false,navURL=null,navClass='',navTitle='',homeLang='en';
  history.replaceState({...history.state,lunaScene:'home'},'',location.href);
  const tr=(en,zh)=>document.documentElement.lang.startsWith('zh')?zh:en;
  async function prepare(){
    if(prepared)return prepared;if(preparing)return preparing;
    preparing=(async()=>{
      const response=await fetch(new URL('navigator.html',base));if(!response.ok)throw new Error(`Workspace: HTTP ${response.status}`);
      const html=new DOMParser().parseFromString(await response.text(),'text/html');
      const styleURLs=[...html.querySelectorAll('link[rel=stylesheet]')].map(l=>new URL(l.getAttribute('href'),base).href);
      const styles=await Promise.all(styleURLs.map(async href=>{const r=await fetch(href);if(!r.ok)throw new Error(`Styles: HTTP ${r.status}`);return {href,text:await r.text()};}));
      const homeCSS=await Promise.all(homeStyles.map(async link=>{const r=await fetch(link.href);return await r.text();}));
      const scripts=[...html.body.querySelectorAll('script[type=module][src]')].map(s=>new URL(s.getAttribute('src'),base).href);html.body.querySelectorAll('script').forEach(s=>s.remove());
      for(const href of scripts){const l=document.createElement('link');l.rel='modulepreload';l.href=href;document.head.append(l);}
      // Warm immutable manifest/data fetches without executing app code.
      fetch(new URL('build-info.json',base)).then(r=>r.ok?r.json():null).then(m=>{if(m?.identity?.datasets?.jun)fetch(new URL(m.identity.datasets.jun.snapshot,base)).catch(()=>{});}).catch(()=>{});
      prepared={html,styles,homeCSS,scripts};return prepared;
    })().catch(error=>{preparing=null;throw error;});return preparing;
  }
  function mountHomeShadow(data){
    if(homeHost)return;
    homeScroll=scrollY;homeLang=document.documentElement.lang;
    homeHost=document.createElement('section');homeHost.id='landing-transition-scene';homeHost.className='lm-scene';homeHost.lang=homeLang;homeHost.inert=true;homeHost.setAttribute('aria-hidden','true');
    const computed=getComputedStyle(document.body);for(const p of ['fontFamily','fontSize','lineHeight','color','backgroundColor'])homeHost.style[p]=computed[p];
    homeRoot=homeHost.attachShadow({mode:'open'});
    for(const css of data.homeCSS){const s=document.createElement('style');s.textContent=css.replaceAll(':root',':host').replace(/\bhtml\[lang=zh-CN\]/g,':host([lang=zh-CN])').replace(/\bhtml\b/g,':host').replace(/\bbody\b(?=\s*\{|\.)/g,':host');homeRoot.append(s);}
    homeChildren=[...document.body.childNodes].filter(n=>n!==status&&n!==navScene&&n!==homeHost);
    for(const node of homeChildren)homeRoot.append(node);
    window.dispatchEvent(new CustomEvent('lunamargin:home-root',{detail:{root:homeRoot,active:false}}));
    document.body.append(homeHost);homeHost.scrollTop=homeScroll;
  }
  function focusWorkspace(){const focus=document.querySelector('#welcome-title,#workspace h1,#workspace');if(focus){focus.setAttribute('tabindex','-1');focus.focus({preventScroll:true});}}
  function ready(){return new Promise(resolve=>{if(document.querySelector('#app:not([hidden])')||document.querySelector('#loading strong'))return resolve();let timer;const done=()=>{clearTimeout(timer);window.removeEventListener('lunamargin:ready',done);resolve();};window.addEventListener('lunamargin:ready',done,{once:true});const start=performance.now();const poll=()=>{if(document.querySelector('#app:not([hidden])')||document.querySelector('#loading strong')||performance.now()-start>12000)done();else timer=setTimeout(poll,60);};poll();});}
  async function slide(from,to,direction=1){
    document.documentElement.classList.add('lm-transitioning');document.body.classList.add('lm-transitioning');
    // Preserve the exact scroll position while each real scene is fixed for the slide.
    from.scrollTop=from===homeHost?homeScroll:navScroll;to.scrollTop=to===homeHost?homeScroll:0;
    from.inert=true;to.inert=true;from.setAttribute('aria-hidden','true');to.setAttribute('aria-hidden','true');
    const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches,options={duration:reduced?0:560,easing:'cubic-bezier(.22,.72,.16,1)',fill:'both'};
    const a=from.animate([{transform:'translateX(0)'},{transform:`translateX(${-100*direction}%)`}],options),b=to.animate([{transform:`translateX(${100*direction}%)`},{transform:'translateX(0)'}],options);
    // People can skip the slide; this only finishes animation, never delays work.
    const skip=e=>{if(e.key==='Escape'){a.finish();b.finish();}};document.addEventListener('keydown',skip);
    await Promise.all([a.finished,b.finished]).catch(()=>{});a.cancel();b.cancel();document.removeEventListener('keydown',skip);
    from.remove();to.inert=false;to.removeAttribute('aria-hidden');document.documentElement.classList.remove('lm-transitioning');document.body.classList.remove('lm-transitioning');
  }
  async function go(url,{historyMove=false}={}){
    if(busy)return;busy=true;status.textContent=tr('Preparing your workspace…','正在准备任务工作台…');
    try{
      const data=await prepare();
      if(scene==='nav'){location.assign(url);return;}
      mountHomeShadow(data);window.scrollTo({top:0,behavior:'instant'});
      homeStyles.forEach(l=>l.disabled=true);
      if(!navScene){navScene=document.createElement('section');navScene.id='navigator-scene';navScene.className='lm-scene';navScene.inert=true;navScene.setAttribute('aria-hidden','true');navScene.style.visibility='hidden';navScene.append(...data.html.body.childNodes);navClass=data.html.body.className;navTitle=data.html.title;
        for(const item of data.styles){const l=document.createElement('link');l.rel='stylesheet';l.href=item.href;document.head.append(l);navStyles.push(l);}
      }
      navStyles.forEach(l=>l.disabled=false);document.body.className=navClass;document.body.append(navScene);navScene.style.visibility='hidden';
      if(!historyMove)history.pushState({...history.state,lunaScene:'nav'},'',url);navURL=String(url);document.title=navTitle;
      if(!window.lunaMargin){for(const src of data.scripts)await import(src);await ready();}else if(window.lunaMargin.applyURL){await window.lunaMargin.applyURL(new URL(url,base));await ready();}
      await Promise.all(navStyles.map(l=>l.sheet?Promise.resolve():new Promise(resolve=>{l.onload=resolve;l.onerror=resolve;setTimeout(resolve,3000);})));navScene.style.visibility='';status.textContent='';
      await slide(homeHost,navScene,1);scene='nav';window.scrollTo({top:0,behavior:'instant'});focusWorkspace();window.dispatchEvent(new Event('resize'));if(!location.pathname.endsWith('/navigator.html'))setTimeout(back,0);
    }catch(error){status.textContent=tr(`Workspace could not open: ${error.message}. Click again to retry.`,`工作台未能打开：${error.message}。请再次点击重试。`);if(homeHost){navScene?.remove();homeStyles.forEach(l=>l.disabled=false);navStyles.forEach(l=>l.disabled=true);restoreHome();}history.replaceState({...history.state,lunaScene:'home'},'',homeURL);scene='home';}
    finally{busy=false;}
  }
  function restoreHome(){
    if(!homeHost)return;for(const node of homeChildren)document.body.insertBefore(node,status);homeHost.remove();homeHost=null;homeRoot=null;document.body.className=homeBodyClass;document.title=homeTitle;document.documentElement.lang=homeLang;
    window.dispatchEvent(new CustomEvent('lunamargin:home-root',{detail:{root:document,active:true}}));window.scrollTo({top:homeScroll,behavior:'instant'});
  }
  async function back(){
    if(busy||scene!=='nav')return;busy=true;navScroll=scrollY;document.body.append(homeHost);homeHost.style.visibility='';
    await slide(navScene,homeHost,-1);navStyles.forEach(l=>l.disabled=true);homeStyles.forEach(l=>l.disabled=false);restoreHome();scene='home';status.textContent='';busy=false;
    const a=document.querySelector('.hero-actions a');a?.focus({preventScroll:true});if(location.pathname.endsWith('/navigator.html'))setTimeout(()=>go(location.href,{historyMove:true}),0);
  }
  document.addEventListener('click',e=>{if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;const a=e.target.closest('a[href]');if(!a||a.target||a.download)return;const url=new URL(a.href,base);if(url.origin!==location.origin)return;
    if(scene==='home'&&url.pathname===new URL('navigator.html',base).pathname){e.preventDefault();go(url.href);}
    else if(scene==='nav'&&(url.pathname===base.pathname||url.pathname===new URL('index.html',base).pathname)&&!url.search){e.preventDefault();history.back();}
  });
  document.addEventListener('pointerover',e=>{const a=e.target.closest?.('a[href]');if(a&&new URL(a.href,base).pathname.endsWith('/navigator.html'))prepare().catch(()=>{});},{passive:true});
  document.addEventListener('focusin',e=>{if(e.target.matches?.('a[href*="navigator.html"]'))prepare().catch(()=>{});});
  window.addEventListener('popstate',()=>{if(location.pathname.endsWith('/navigator.html')){if(scene==='home')go(location.href,{historyMove:true});}else back();});
  setTimeout(()=>prepare().catch(()=>{}),1800);
}
