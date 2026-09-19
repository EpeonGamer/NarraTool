function render(){
  document.body.classList.toggle('clean-view',viewMode==='clean');
  const editor=document.getElementById('editor');
  const chapterMeta=document.getElementById('chapter-meta');
  const addBar=document.getElementById('add-bar');
  const ch=activeChapter();
  const chId=ch?ch.id:null;
  if(chId!==renderedChapterId){
    editor.innerHTML='';
    if(chapterMeta)editor.appendChild(chapterMeta);
    editor.appendChild(addBar);
    for(const entry of blockDom.values())entry.ro&&entry.ro.disconnect();
    blockDom.clear();
    virtualTopSpacer=null;virtualBottomSpacer=null;virtualTrailingDz=null;
    vwin={start:0,end:0};
    renderedChapterId=chId;
  }
  renderChapterMeta();
  renderBlocksVirtualized(addBar);
  updateStats();updateChapTitle();
}
// Builds/reconciles only the blocks that should currently be in the DOM
// (the "window"). Existing wrap/drop-zone nodes are reused by block id, so
// this is safe (and cheap) to call both for a full render and for a
// scroll-triggered window shift; it never touches nodes for blocks whose
// position and type haven't changed.
function renderBlocksVirtualized(addBar){
  const editor=document.getElementById('editor');
  addBar=addBar||document.getElementById('add-bar');
  const bs=blocks();
  const n=bs.length;
  if(!virtualTopSpacer){
    virtualTopSpacer=document.createElement('div');virtualTopSpacer.className='virtual-spacer';
    virtualBottomSpacer=document.createElement('div');virtualBottomSpacer.className='virtual-spacer';
    editor.insertBefore(virtualTopSpacer,addBar);
    editor.insertBefore(virtualBottomSpacer,addBar);
  }
  const virtualize=!dragForceFullWindow&&n>VIRTUALIZE_THRESHOLD;
  const[start,end]=virtualize?computeVirtualWindow(bs):[0,n];
  vwin={start,end};
  const windowIds=new Set(bs.slice(start,end).map(b=>b.id));
  for(const[id,entry] of[...blockDom]){
    if(!windowIds.has(id)){
      entry.wrap.remove();entry.dz.remove();entry.ro&&entry.ro.disconnect();
      blockDom.delete(id);
    }
  }
  virtualTopSpacer.style.height=start>0?sumHeights(bs,0,start)+'px':'0px';
  let cursor=virtualTopSpacer;
  for(let i=start;i<end;i++){
    const b=bs[i];
    let entry=blockDom.get(b.id);
    if(!entry||entry.type!==b.type){
      if(entry){entry.wrap.remove();entry.dz.remove();entry.ro&&entry.ro.disconnect();}
      const dz=document.createElement('div');dz.className='drop-zone';
      const wrap=buildBlockWrap(b,i,bs);
      const ro=new ResizeObserver(()=>recordHeight(b.id,wrap.offsetHeight));
      ro.observe(wrap);
      entry={wrap,dz,type:b.type,ro};
      blockDom.set(b.id,entry);
    }else{
      entry.wrap.classList.toggle('block-focused',focusedId===b.id);
    }
    entry.wrap.querySelectorAll('.block-label').forEach(el=>el.style.display=showLabels?'block':'none');
    entry.wrap.querySelectorAll('.block-label-wrap').forEach(el=>el.style.display=showLabels?'flex':'none');
    entry.dz.dataset.dropIndex=i;
    if(cursor.nextSibling!==entry.dz)editor.insertBefore(entry.dz,cursor.nextSibling);
    cursor=entry.dz;
    if(cursor.nextSibling!==entry.wrap)editor.insertBefore(entry.wrap,cursor.nextSibling);
    cursor=entry.wrap;
    recordHeight(b.id,entry.wrap.offsetHeight||estimatedHeight(b));
  }
  if(end===n){
    if(!virtualTrailingDz){virtualTrailingDz=document.createElement('div');virtualTrailingDz.className='drop-zone';}
    virtualTrailingDz.dataset.dropIndex=n;
    if(cursor.nextSibling!==virtualTrailingDz)editor.insertBefore(virtualTrailingDz,cursor.nextSibling);
    cursor=virtualTrailingDz;
  }else if(virtualTrailingDz&&virtualTrailingDz.parentNode){
    virtualTrailingDz.remove();
  }
  if(virtualBottomSpacer.previousSibling!==cursor)editor.insertBefore(virtualBottomSpacer,cursor.nextSibling);
  virtualBottomSpacer.style.height=end<n?sumHeights(bs,end,n)+'px':'0px';
  cursor=virtualBottomSpacer;
  if(addBar.previousSibling!==cursor||addBar.parentNode!==editor)editor.insertBefore(addBar,cursor.nextSibling);
  if(viewMode==='focus')refreshFocusClasses();
  reapplySettings();
  requestAnimationFrame(()=>{
    bs.filter(b=>b.type==='group'&&b.collapsed).forEach(b=>applyGroupCollapse(b));
  });
}
function buildBlockWrap(b,i,bs){
  const wrap=document.createElement('div');
  wrap.className=`block-wrap type-${b.type}${focusedId===b.id?' block-focused':''}`;
  wrap.dataset.id=b.id;
  const gutter=document.createElement('div');
  gutter.className='block-gutter';
  gutter.innerHTML=`<div class="gutter-inner">
    <div class="drag-handle" title="Drag to reorder" data-drag="${b.id}"><i class="ti ti-grip-vertical"></i></div>
    <button class="gutter-btn" title="Delete block" onclick="deleteBlock(${b.id})"><i class="ti ti-trash"></i></button>
    <button class="gutter-btn" title="Change type" onclick="openPicker(event,${b.id})"><i class="ti ti-dots"></i></button>
    <button class="gutter-btn" title="Add block below" onclick="addBlock('${b.type}',${i+1})"><i class="ti ti-plus"></i></button>
  </div>`;
  const content=document.createElement('div');
  content.className='block-content';
  const inner=document.createElement('div');
  inner.className='block-inner';
  if(b.type==='image'){
    buildImageBlock(b,inner);
  } else if(b.type==='custom'){
    buildCustomBlock(b,inner,i);
  } else if(b.type==='group'){
    buildGroupBlock(b,inner,i,bs);
  } else {
    const label=document.createElement('div');
    label.className='block-label';
    label.textContent=TYPE_LABELS[b.type]||b.type;
    label.style.display=showLabels?'block':'none';
    const p=document.createElement('div');
    p.contentEditable='true';
    p.setAttribute('data-placeholder',PLACEHOLDERS[b.type]||'Write here...');
    p.spellcheck=true;
    renderMarkdownInto(p,b.text||'');
    wireMdEditable(p,{get:()=>b.text,set:v=>{const old=countWords(b.text);b.text=v;recordWritingWords(Math.max(0,countWords(v)-old));scheduleSave();updateStats();}},{
      onFocus:()=>{focusedId=b.id;if(viewMode==='focus'||settings.typewriter)refreshFocusClasses();},
      onBlur:()=>save(),
      onKeydown:e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey){e.preventDefault();splitBlockAtCaret(p,b,i);}}
    });
    inner.appendChild(label);inner.appendChild(p);
  }
  content.appendChild(inner);wrap.appendChild(gutter);wrap.appendChild(content);
  return wrap;
}
function buildImageBlock(b,inner){
  const label=document.createElement('div');
  label.className='block-label';label.textContent='image';label.style.display=showLabels?'block':'none';
  inner.appendChild(label);
  if(b.src){
    const img=document.createElement('img');
    img.className='block-img-img';
    img.src=b.src;img.alt=b.caption||'';img.style.maxWidth='100%';img.style.borderRadius='6px';img.style.display='block';
    img.style.cursor='pointer';img.title='Click to replace image';
    img.onclick=()=>triggerImageUpload(b.id);
    inner.appendChild(img);
    const cap=document.createElement('div');
    cap.className='img-caption';cap.contentEditable='true';
    cap.setAttribute('data-placeholder','Add a caption...');
    cap.textContent=b.caption||'';
    cap.addEventListener('input',()=>{noteTextEdit();b.caption=cap.textContent;scheduleSave();});
    cap.addEventListener('blur',()=>{b.caption=cap.textContent;save();});
    inner.appendChild(cap);
    const swapBtn=document.createElement('button');
    swapBtn.className='img-swap-btn';swapBtn.textContent='Replace image';
    swapBtn.onclick=()=>triggerImageUpload(b.id);
    inner.appendChild(swapBtn);
  } else {
    const area=document.createElement('div');
    area.className='img-upload-area';
    area.innerHTML=`<i class="ti ti-photo"></i><span>Click to add image</span><span style="font-size:11px;opacity:0.6">PNG, JPG, GIF, WebP</span>`;
    area.onclick=()=>triggerImageUpload(b.id);
    inner.appendChild(area);
  }
}
function triggerImageUpload(blockId){
  pendingImageBlockId=blockId;
  document.getElementById('img-input').value='';
  document.getElementById('img-input').click();
}
function handleImageFile(e){
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const ch=activeChapter();if(!ch)return;
    const b=ch.blocks.find(b=>b.id===pendingImageBlockId);
    if(b){b.src=ev.target.result;b.caption=b.caption||'';}
    render();save();
  };
  reader.readAsDataURL(file);
}
// ── Custom block ──
function buildCustomBlock(b,inner,i){
  if(!b.label)b.label='Custom';
  if(!b.color)b.color='#999999';
  inner.style.borderLeftColor=b.color;
  const labelWrap=document.createElement('div');
  labelWrap.className='type-custom block-label-wrap';
  labelWrap.style.display=showLabels?'flex':'none';
  const swatch=document.createElement('div');
  swatch.className='custom-color-swatch';
  swatch.style.background=b.color;
  swatch.title='Change colour';
  swatch.onclick=e=>{e.stopPropagation();openColorPicker(e,b.id);};
  const labelEl=document.createElement('input');
  labelEl.className='custom-label-edit';
  labelEl.value=b.label;
  labelEl.title='Edit label';
  labelEl.style.color=b.color;
  labelEl.addEventListener('input',()=>{noteTextEdit();b.label=labelEl.value;scheduleSave();});
  labelEl.addEventListener('blur',()=>save());
  labelWrap.appendChild(swatch);labelWrap.appendChild(labelEl);
  inner.appendChild(labelWrap);
  const p=document.createElement('div');
  p.contentEditable='true';
  p.setAttribute('data-placeholder','Write here...');
  p.spellcheck=true;
  p.style.fontSize='16px';p.style.lineHeight='1.7';
  renderMarkdownInto(p,b.text||'');
  wireMdEditable(p,{get:()=>b.text,set:v=>{const old=countWords(b.text);b.text=v;recordWritingWords(Math.max(0,countWords(v)-old));scheduleSave();updateStats();}},{
    onFocus:()=>{focusedId=b.id;if(viewMode==='focus'||settings.typewriter)refreshFocusClasses();},
    onBlur:()=>save(),
    onKeydown:e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey){e.preventDefault();splitBlockAtCaret(p,b,i);}}
  });
  inner.appendChild(p);
}
function buildGroupBlock(b,inner,i,bs){
  if(b.level===undefined)b.level=0;
  const lvl=Math.max(0,Math.min(4,b.level||0));
  const indents=[0,14,28,42,56];
  const fontSizes=[11,11,10,10,10];
  const lineH=[1.5,1.4,1.3,1.3,1.3];
  inner.style.background='transparent';
  inner.style.border='none';
  inner.style.padding=`${10-lvl}px 16px ${4}px ${16+indents[lvl]}px`;
  inner.style.borderLeft='none';
  const row=document.createElement('div');
  row.style.cssText='display:flex;align-items:center;gap:6px;user-select:none;';
  const chevron=document.createElement('i');
  chevron.className='ti ti-chevron-down';
  chevron.style.cssText=`font-size:${fontSizes[lvl]+1}px;color:var(--text3);transition:transform 0.2s;cursor:pointer;flex-shrink:0;`;
  if(b.collapsed)chevron.style.transform='rotate(-90deg)';
  chevron.onclick=(e)=>{
    e.stopPropagation();
    b.collapsed=!b.collapsed;
    save();
    applyGroupCollapse(b);
    chevron.style.transform=b.collapsed?'rotate(-90deg)':'';
  };
  // Level selector; small number badge
  const lvlBadge=document.createElement('button');
  lvlBadge.title='Group level (click to increase, right-click to decrease)';
  lvlBadge.style.cssText=`font-size:9px;font-weight:600;width:16px;height:16px;border-radius:50%;border:0.5px solid var(--border2);background:var(--bg2);color:var(--text3);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;`;
  lvlBadge.textContent=lvl;
  lvlBadge.onclick=(e)=>{e.stopPropagation();b.level=((lvl+1)%5);render();save();};
  lvlBadge.oncontextmenu=(e)=>{e.preventDefault();e.stopPropagation();b.level=((lvl+4)%5);render();save();};
  const nameEl=document.createElement('input');
  nameEl.className='group-name-edit';
  nameEl.style.cssText=`font-size:${fontSizes[lvl]}px;font-weight:${600-lvl*100};letter-spacing:${0.07-lvl*0.01}em;opacity:${0.65-lvl*0.05};`;
  nameEl.value=b.name||'Group';
  nameEl.placeholder='Group name';
  nameEl.addEventListener('input',()=>{noteTextEdit();b.name=nameEl.value;scheduleSave();});
  nameEl.addEventListener('blur',()=>save());
  nameEl.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();nameEl.blur();}});
  const line=document.createElement('div');
  line.style.cssText=`flex:1;height:0.5px;background:var(--border2);opacity:${1-lvl*0.15};`;
  row.appendChild(chevron);row.appendChild(lvlBadge);row.appendChild(nameEl);row.appendChild(line);
  inner.appendChild(row);
  if(b.collapsed){
    requestAnimationFrame(()=>applyGroupCollapse(b));
  }
}
function applyGroupCollapse(b){
  const editor=document.getElementById('editor');
  const wraps=[...editor.querySelectorAll('.block-wrap')];
  const myIdx=wraps.findIndex(w=>parseInt(w.dataset.id)===b.id);
  const myLevel=b.level||0;
  for(let j=myIdx+1;j<wraps.length;j++){
    const nextB=blocks().find(bl=>bl.id===parseInt(wraps[j].dataset.id));
    if(nextB&&nextB.type==='group'&&(nextB.level||0)<=myLevel)break;
    const show=!b.collapsed;
    wraps[j].style.display=show?'':'none';
    const prev=wraps[j].previousElementSibling;
    if(prev&&prev.classList.contains('drop-zone'))prev.style.display=show?'':'none';
  }
}
function buildColorPicker(){
  const popup=document.getElementById('color-picker-popup');
  CUSTOM_COLORS.forEach(c=>{
    const sw=document.createElement('div');
    sw.className='cp-swatch';sw.style.background=c;sw.dataset.color=c;
    sw.onclick=()=>applyCustomColor(c);
    popup.appendChild(sw);
  });
}
function openColorPicker(e,id){
  pickerTargetId=id;
  const popup=document.getElementById('color-picker-popup');
  popup.classList.add('open');
  popup.style.top=(e.clientY+8)+'px';
  popup.style.left=e.clientX+'px';
}
function applyCustomColor(color){
  const ch=activeChapter();if(!ch)return;
  const b=ch.blocks.find(b=>b.id===pickerTargetId);
  if(b){b.color=color;render();save();}
  document.getElementById('color-picker-popup').classList.remove('open');
}
function refreshFocusClasses(){
  document.querySelectorAll('.block-wrap').forEach(w=>{
    w.classList.toggle('block-focused',parseInt(w.dataset.id)===focusedId);
  });
}