document.addEventListener('focusin',e=>{if(e.target.matches('[contenteditable="true"]'))centerTypewriterCaret(e.target);});
document.addEventListener('input',e=>{if(e.target.matches('[contenteditable="true"]'))centerTypewriterCaret(e.target);},true);
document.addEventListener('keyup',e=>{if(e.target.matches('[contenteditable="true"]'))centerTypewriterCaret(e.target);},true);
document.getElementById('stats-modal')?.addEventListener('click',e=>{if(e.target.id==='stats-modal')closeStats();});
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&!e.altKey){
    const k=e.key.toLowerCase();
    if(k==='z'){
      e.preventDefault();e.stopPropagation();
      if(e.shiftKey)performRedo();else performUndo();
    }else if(k==='y'){
      e.preventDefault();e.stopPropagation();
      performRedo();
    }else if(k==='s'){
      e.preventDefault();e.stopPropagation();
      manualSave();
    }
  }
},true);
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(document.getElementById('search-overlay')?.classList.contains('open')){closeGlobalSearch();return;}
    if(document.getElementById('stats-modal')?.classList.contains('open')){closeStats();return;}
    if(wikilinkAcOpen()){hideWikilinkAC();return;}
    closeConfirm();
  }
});
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);}
document.addEventListener('click',e=>{
  const picker=document.getElementById('type-picker');
  if(!picker.contains(e.target))picker.classList.remove('open');
  const em=document.getElementById('export-menu'),emb=document.getElementById('export-menu-btn');
  if(em&&emb&&!em.contains(e.target)&&!emb.contains(e.target))em.classList.remove('open');
  const sp=document.getElementById('settings-panel'),sb=document.getElementById('settings-btn');
  if(sp.classList.contains('open')&&!sp.contains(e.target)&&!sb.contains(e.target)){sp.classList.remove('open');sb.classList.remove('active');}
  const cp=document.getElementById('color-picker-popup');
  if(!cp.contains(e.target)&&!e.target.closest('.custom-color-swatch'))cp.classList.remove('open');
  const wac=document.getElementById('wikilink-ac');
  if(!wac.contains(e.target)&&e.target!==acAnchorEl)hideWikilinkAC();
});
(function(){
  const widget=document.getElementById('eye-widget');
  const pupils=[document.getElementById('ep1'),document.getElementById('ep2')];
  const glints=[document.getElementById('ep1g'),document.getElementById('ep2g')];
  const eyes=widget.querySelectorAll('.nw-eye');
  const EYE_H=28, EYE_GAP=5, WIDGET_H=EYE_H;
  const PUPIL_HOME={x:56,y:50}, PUPIL_RANGE=10;
  let hoverT=0;
  let blinkT=Date.now()+2000+Math.random()*4000;
  let isBlinking=false, blinkClose=false;
  let currentY=200;
  function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
  function getActiveBlockBottomY(){
    const focused=document.querySelector('.block-wrap.block-focused,.block-wrap:focus-within');
    if(focused){
      const r=focused.getBoundingClientRect();
      return r.bottom - 22;
    }
    const first=document.querySelector('.block-wrap');
    if(first){const r=first.getBoundingClientRect();return r.bottom-22;}
    return window.innerHeight*0.6;
  }
  function getEyeLeft(){
    const editor=document.getElementById('editor');
    if(!editor)return 10;
    const r=editor.getBoundingClientRect();
    return Math.max(2, r.left - 26);
  }
  function frame(){
    if(!widget)return;
    if(widget.style.opacity==='0'){requestAnimationFrame(frame);return;}
    hoverT+=0.016;
    const hover=Math.sin(hoverT)*2.5;
    const ty=getActiveBlockBottomY()+hover;
    currentY+=(ty-currentY)*0.07;
    widget.style.left=getEyeLeft()+'px';
    const vert = (settings.eyeOrientation || 'vertical') === 'vertical';
    const verticalLift = vert ? 40 : 0;
    widget.style.top = (currentY - WIDGET_H/2 - verticalLift) + 'px';
    const lx=getEyeLeft();
    const gazeX=lx+220+Math.sin(hoverT*0.35)*25;
    const gazeY=currentY+Math.cos(hoverT*0.28)*12;
    const now=Date.now();
    if(now>blinkT&&!isBlinking){
      isBlinking=true;
      blinkClose=true;
      blinkT=now+100+Math.random()*70;
    }
    if(isBlinking&&blinkClose&&now>blinkT){
      blinkClose=false;
      blinkT=now+80+Math.random()*60;
    }
    if(isBlinking&&!blinkClose&&now>blinkT){
      isBlinking=false;
      blinkT=now+(Math.random()<0.18 ? 150+Math.random()*100 : 2500+Math.random()*4000);
    }
    eyes.forEach((eye,idx)=>{
      const pupil=pupils[idx];
      const glint=glints[idx];
      if(isBlinking&&blinkClose){
        const vert=(settings.eyeOrientation||'vertical')==='vertical';
        eye.style.transform=vert?'scaleX(0.06)':'scaleY(0.06)';
      } else {
        eye.style.transform='';
        const eyeRect=eye.getBoundingClientRect();
        const ecx=eyeRect.left+eyeRect.width/2;
        const ecy=eyeRect.top+eyeRect.height/2;
        const dx=gazeX-ecx, dy=gazeY-ecy;
        const mag=Math.hypot(dx,dy)||1;
        const nx=dx/mag, ny=dy/mag;
        const px=clamp(PUPIL_HOME.x+nx*PUPIL_RANGE,38,68);
        const py=clamp(PUPIL_HOME.y+ny*(PUPIL_RANGE*0.65),38,62);
        pupil.setAttribute('cx',px); pupil.setAttribute('cy',py);
        glint.setAttribute('cx',px+4); glint.setAttribute('cy',py-4);
      }
    });
    requestAnimationFrame(frame);
  }
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init();
      requestAnimationFrame(frame);
    });
  } else {
    init();
    requestAnimationFrame(frame);
  }
})();