function appConfirm(msg,label,onYes,anchorEl){
  const popup=document.getElementById('confirm-popup');
  document.getElementById('confirm-msg').textContent=msg;
  const yesBtn=document.getElementById('confirm-yes-btn');
  yesBtn.type='button';
  yesBtn.textContent=label||'Delete';
  confirmCallback=onYes;
  yesBtn.onclick=e=>{
    e.preventDefault();
    e.stopPropagation();
    const cb=confirmCallback;
    closeConfirm();
    if(typeof cb==='function') cb();
  };
  if(anchorEl){
    const r=anchorEl.getBoundingClientRect();
    const pw=200;
    let left=r.right+6;
    if(left+pw>window.innerWidth)left=r.left-pw-6;
    let top=r.top;
    const ph=popup.offsetHeight||90;
    if(top+ph>window.innerHeight-8)top=Math.max(8,window.innerHeight-ph-8);
    popup.style.transform='';
    popup.style.left=Math.max(4,Math.min(left,window.innerWidth-pw-4))+'px';
    popup.style.top=Math.max(4,top)+'px';
  } else {
    popup.style.left='50%';popup.style.top='50%';
    popup.style.transform='translate(-50%,-50%)';
  }
  popup.classList.add('open');
  yesBtn.focus();
}
function closeConfirm(){
  document.getElementById('confirm-popup').classList.remove('open');
  document.getElementById('confirm-popup').style.transform='';
  confirmCallback=null;
}
