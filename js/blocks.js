function addBlock(type,afterIndex,opts){
  const ch=activeChapter();if(!ch)return;
  opts=opts||{};
  if(!opts.skipUndo)pushUndoSnapshot();
  const defaults={prose:{text:''},dialogue:{text:''},action:{text:''},thought:{text:''},scene:{text:''},image:{src:'',caption:''},custom:{text:'',label:'Custom',color:'#999999'},group:{name:'Group',collapsed:false}};
  const nb={type,id:nextBlockId++,...(defaults[type]||{text:''})};
  if(typeof opts.text==='string')nb.text=opts.text;
  if(afterIndex!==undefined)ch.blocks.splice(afterIndex,0,nb);
  else ch.blocks.push(nb);
  focusedId=nb.id;
  render();
  if(type==='image'){
    setTimeout(()=>triggerImageUpload(nb.id),100);
  } else {
    setTimeout(()=>{
      const el=document.querySelector(`.block-wrap[data-id="${nb.id}"] [contenteditable]`);
      if(el){
        el.focus();
        const caret=opts.caretAtStart?0:(el.textContent||'').length;
        setCaretOffset(el,caret);
        el.scrollIntoView({behavior:'smooth',block:'center'});
        if(settings.typewriter)centerTypewriterCaret(el);
      }
    },50);
  }
  save();
}
function splitBlockAtCaret(el,block,index){
  if(!el||!block)return;
  const raw=el.textContent||'';
  const offset=getCaretOffset(el)??raw.length;
  const before=raw.slice(0,offset);
  const after=raw.slice(offset);
  pushUndoSnapshot();
  // 1) Suppress blur→save while we tear down the old editor (blur would
  //    otherwise write the full pre-split text back into the model).
  // 2) Drop the virtualized DOM cache entry so render rebuilds this block
  //    from the truncated model instead of reusing the stale full-text node.
  applyingUndo=true;
  try{
    block.text=before;
    if(el.__mdGetSet)el.__mdGetSet.set(before);
    // Truncate the live DOM immediately so any residual handlers see before.
    try{renderMarkdownInto(el,before);}catch(e){}
    const entry=blockDom.get(block.id);
    if(entry){
      try{entry.ro&&entry.ro.disconnect();}catch(e){}
      try{entry.wrap.remove();}catch(e){}
      try{entry.dz.remove();}catch(e){}
      blockDom.delete(block.id);
    }
    addBlock(block.type,index+1,{text:after,skipUndo:true,caretAtStart:true});
  }finally{
    applyingUndo=false;
  }
  // Final guard: nothing should have restored the trailing half.
  if(block.text!==before)block.text=before;
}
function deleteBlock(id){
  const ch=activeChapter();if(!ch)return;
  if(ch.blocks.length<=1){toast('Need at least one block');return;}
  const btn=document.querySelector(`.block-wrap[data-id="${id}"] .gutter-btn[title="Delete block"]`);
  appConfirm('Delete this block?','Delete',()=>{
    pushUndoSnapshot();
    ch.blocks=ch.blocks.filter(b=>b.id!==id);
    render();save();
  },btn);
}
function initDrag(){
  const editor=document.getElementById('editor');
  editor.addEventListener('mousedown',e=>{
    const h=e.target.closest('[data-drag]');if(!h)return;
    e.preventDefault();startDrag(parseInt(h.dataset.drag));
    document.addEventListener('mousemove',onMouseMove);
    document.addEventListener('mouseup',()=>{document.removeEventListener('mousemove',onMouseMove);endDrag();},{once:true});
  });
  editor.addEventListener('touchstart',e=>{
    const h=e.target.closest('[data-drag]');if(!h)return;
    startDrag(parseInt(h.dataset.drag));
    editor.addEventListener('touchmove',onTouchMove,{passive:false});
    editor.addEventListener('touchend',()=>{editor.removeEventListener('touchmove',onTouchMove);endDrag();},{once:true});
  },{passive:true});
}
function startDrag(id){
  dragId=id;
  if(blocks().length>VIRTUALIZE_THRESHOLD){
    dragForceFullWindow=true;renderBlocksVirtualized();
  }
  const w=document.querySelector(`.block-wrap[data-id="${dragId}"]`);if(w)w.classList.add('dragging');
}
function onMouseMove(e){updateDropTarget(e.clientX,e.clientY);}
function onTouchMove(e){if(dragId===null)return;e.preventDefault();const t=e.touches[0];updateDropTarget(t.clientX,t.clientY);}
function updateDropTarget(x,y){
  if(dragId===null)return;
  const zones=document.querySelectorAll('.drop-zone');
  let closest=null,closestDist=Infinity;
  zones.forEach(z=>{const rect=z.getBoundingClientRect();const dist=Math.abs(y-(rect.top+rect.height/2));if(dist<closestDist){closestDist=dist;closest=z;}});
  zones.forEach(z=>z.classList.remove('active'));
  if(closest){closest.classList.add('active');dragOverIndex=parseInt(closest.dataset.dropIndex);}
}
function endDrag(){
  const w=document.querySelector(`.block-wrap[data-id="${dragId}"]`);if(w)w.classList.remove('dragging');
  let moved=false;
  if(dragOverIndex!==null){
    const ch=activeChapter();
    if(ch){
      const from=ch.blocks.findIndex(b=>b.id===dragId);
      if(from!==-1){
        pushUndoSnapshot();
        const[movedBlock]=ch.blocks.splice(from,1);
        const to=dragOverIndex>from?dragOverIndex-1:dragOverIndex;
        ch.blocks.splice(to,0,movedBlock);
        moved=true;
      }
    }
  }
  dragId=null;dragOverIndex=null;
  dragForceFullWindow=false;
  if(moved)save();
  render();
  document.querySelectorAll('.drop-zone').forEach(z=>z.classList.remove('active'));
}
function initChapterDrag(){
  const list=document.getElementById('collection-list');
  list.addEventListener('mousedown',e=>{
    const h=e.target.closest('[data-chap-drag]');if(!h)return;
    e.preventDefault();e.stopPropagation();
    startChapDrag(parseInt(h.dataset.chapDrag),parseInt(h.dataset.chapDragColl));
    document.addEventListener('mousemove',onChapMouseMove);
    document.addEventListener('mouseup',()=>{document.removeEventListener('mousemove',onChapMouseMove);endChapDrag();},{once:true});
  });
  list.addEventListener('touchstart',e=>{
    const h=e.target.closest('[data-chap-drag]');if(!h)return;
    startChapDrag(parseInt(h.dataset.chapDrag),parseInt(h.dataset.chapDragColl));
    list.addEventListener('touchmove',onChapTouchMove,{passive:false});
    list.addEventListener('touchend',()=>{list.removeEventListener('touchmove',onChapTouchMove);endChapDrag();},{once:true});
  },{passive:true});
}
function startChapDrag(id,collId){
  chapDragId=id;chapDragCollId=collId;
  const item=document.querySelector(`.chapter-item[data-id="${chapDragId}"]`);
  if(item)item.classList.add('dragging');
}
function onChapMouseMove(e){updateChapDropTarget(e.clientX,e.clientY);}
function onChapTouchMove(e){if(chapDragId===null)return;e.preventDefault();const t=e.touches[0];updateChapDropTarget(t.clientX,t.clientY);}
function updateChapDropTarget(x,y){
  if(chapDragId===null)return;
  const group=document.querySelector(`.collection-group[data-id="${chapDragCollId}"]`);
  if(!group)return;
  const zones=group.querySelectorAll('.chapter-drop-zone');
  let closest=null,closestDist=Infinity;
  zones.forEach(z=>{const rect=z.getBoundingClientRect();const dist=Math.abs(y-(rect.top+rect.height/2));if(dist<closestDist){closestDist=dist;closest=z;}});
  document.querySelectorAll('.chapter-drop-zone').forEach(z=>z.classList.remove('active'));
  if(closest){closest.classList.add('active');chapDragOverIndex=parseInt(closest.dataset.dropIndex);}
}
function endChapDrag(){
  const item=document.querySelector(`.chapter-item[data-id="${chapDragId}"]`);
  if(item)item.classList.remove('dragging');
  if(chapDragOverIndex!==null&&chapDragCollId!==null){
    const coll=collections.find(c=>c.id===chapDragCollId);
    if(coll){
      const from=coll.chapters.findIndex(ch=>ch.id===chapDragId);
      if(from!==-1){
        const[moved]=coll.chapters.splice(from,1);
        const to=chapDragOverIndex>from?chapDragOverIndex-1:chapDragOverIndex;
        coll.chapters.splice(to,0,moved);renderSidebar();save();
      }
    }
  }
  chapDragId=null;chapDragOverIndex=null;chapDragCollId=null;
  document.querySelectorAll('.chapter-drop-zone').forEach(z=>z.classList.remove('active'));
}
function openPicker(e,id){
  e.stopPropagation();pickerTargetId=id;
  const picker=document.getElementById('type-picker');
  picker.style.visibility='hidden';picker.style.display='flex';
  const ph=picker.offsetHeight, pw=picker.offsetWidth;
  picker.style.display='';picker.style.visibility='';
  picker.classList.add('open');
  const rect=e.currentTarget.getBoundingClientRect();
  const margin=6;
  let top=rect.bottom+margin;
  if(top+ph>window.innerHeight-margin)top=rect.top-ph-margin;
  top=Math.max(margin,top);
  let left=rect.left;
  if(left+pw>window.innerWidth-margin)left=window.innerWidth-pw-margin;
  left=Math.max(margin,left);
  picker.style.top=top+'px';picker.style.left=left+'px';
}
function changeType(type){
  const ch=activeChapter();if(!ch)return;
  const b=ch.blocks.find(b=>b.id===pickerTargetId);
  if(b){
    b.type=type;
    if(type==='image'&&!b.src)b.src='';
    if(type==='custom'){if(!b.label)b.label='Custom';if(!b.color)b.color='#999999';}
    if(type==='group'){if(!b.name)b.name='Group';if(b.collapsed===undefined)b.collapsed=false;}
    render();save();
  }
  document.getElementById('type-picker').classList.remove('open');
}
function setView(v){
  viewMode=v;showLabels=v!=='clean';
  document.body.classList.toggle('clean-view',v==='clean');
  ['normal','focus','clean'].forEach(m=>document.getElementById('view-'+m).classList.toggle('active',m===v));
  document.getElementById('editor').classList.toggle('focus-mode',v==='focus');
  if(v!=='focus')focusedId=null;render();
}
function toggleChapterMeta(){
  const meta=document.getElementById('chapter-meta');if(!meta)return;
  const collapsed=meta.classList.toggle('collapsed');
  const btn=meta.querySelector('.chapter-meta-toggle');
  if(btn)btn.setAttribute('aria-expanded',String(!collapsed));
}
function updateChapterMetaSummary(){
  const ch=activeChapter(),summary=document.getElementById('chapter-meta-summary');
  if(!summary)return;
  if(!ch){summary.textContent='';return;}
  const bits=[chapterTypeLabel(ch),chapterAliases(ch).length?chapterAliases(ch).length+' aliases':'',chapterTags(ch).length?chapterTags(ch).length+' tags':''].filter(Boolean);
  summary.textContent=bits.join(' · ');
}
function renderChapterMeta(){
  hideTagAC();
  const ch=activeChapter();
  const name=document.getElementById('chapter-name-edit');
  const collLabel=document.getElementById('chapter-collection-label');
  const typeGroup=document.getElementById('chapter-type-group');
  const aliases=document.getElementById('chapter-aliases-edit');
  const chips=document.getElementById('chapter-tag-chips');
  const tagInput=document.getElementById('chapter-tag-input');
  if(!name||!typeGroup||!aliases||!chips||!tagInput)return;
  if(!ch){
    name.value='';aliases.value='';chips.innerHTML='';typeGroup.innerHTML='';
    if(collLabel)collLabel.textContent='';
    return;
  }
  name.value=ch.name||'';
  if(collLabel){const coll=activeCollection();collLabel.textContent=coll?coll.name:'';}
  aliases.value=chapterAliases(ch).join(', ');
  typeGroup.innerHTML='';
  ['chapter','character','location','item','custom'].forEach(t=>{
    const btn=document.createElement('button');
    btn.type='button';btn.className='chapter-type-btn'+(chapterType(ch)===t?' active':'');
    btn.innerHTML=`<span class="chapter-type-dot" style="background:${CHAPTER_TYPE_COLORS[t]}"></span>${CHAPTER_TYPE_LABELS[t]}`;
    btn.onclick=()=>setChapterType(t);
    typeGroup.appendChild(btn);
  });
  if(chapterType(ch)==='custom'){
    const input=document.createElement('input');
    input.type='text';input.className='chapter-meta-input chapter-custom-type-input';input.placeholder='e.g. Faction, Creature, Event…';input.value=ch.customType||'';
    input.addEventListener('input',()=>{
      noteTextEdit();
      ch.customType=input.value.trim();
      scheduleSave();
      const summary=document.getElementById('chapter-meta-summary');
      if(summary){const bits=[chapterTypeLabel(ch),chapterAliases(ch).length?chapterAliases(ch).length+' aliases':'',chapterTags(ch).length?chapterTags(ch).length+' tags':''].filter(Boolean);summary.textContent=bits.join(' · ');}
      const dot=document.querySelector(`.chapter-item[data-id="${ch.id}"] .chap-tag-dot`);
      if(dot)dot.title=chapterTypeLabel(ch);
    });
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();input.blur();}});
    typeGroup.appendChild(input);
  }
  renderChapterTagChips();
  tagInput.value='';
  loadNotesIntoUI();
  updateChapterMetaSummary();
}
function saveChapterName(){
  const ch=activeChapter(),el=document.getElementById('chapter-name-edit');
  if(!ch||!el)return;
  const name=el.value.trim();
  if(name)ch.name=name;
  el.value=ch.name||'';
  renderSidebar();updateChapTitle();scheduleSave();
}
function setChapterType(type){
  const ch=activeChapter();
  if(!ch||!CHAPTER_TYPES.includes(type))return;
  ch.type=type;
  if(type!=='custom')delete ch.customType;
  renderChapterMeta();renderSidebar();scheduleSave();
}
function saveChapterAliases(){
  const ch=activeChapter(),el=document.getElementById('chapter-aliases-edit');
  if(!ch||!el)return;
  ch.aliases=el.value.split(',').map(s=>s.trim()).filter(Boolean);
  updateChapterMetaSummary();
  scheduleSave();
}
function renderChapterTagChips(){
  const ch=activeChapter(),wrap=document.getElementById('chapter-tag-chips');
  if(!wrap)return;
  wrap.innerHTML='';
  chapterTags(ch).forEach(tag=>{
    const chip=document.createElement('span');chip.className='chapter-tag-chip';
    const text=document.createElement('span');text.textContent=tag;
    const x=document.createElement('button');x.type='button';x.title='Remove tag';x.textContent='×';
    x.onclick=()=>removeChapterTag(tag);
    chip.append(text,x);wrap.appendChild(chip);
  });
}
function addChapterTag(raw){
  const ch=activeChapter();
  if(!ch)return;
  const tag=(raw||'').trim().replace(/,+$/,'').trim();
  if(!tag)return;
  if(!Array.isArray(ch.tags))ch.tags=[];
  if(!ch.tags.some(t=>t.toLowerCase()===tag.toLowerCase()))ch.tags.push(tag);
  renderChapterTagChips();updateChapterMetaSummary();scheduleSave();
}
function removeChapterTag(tag){
  const ch=activeChapter();if(!ch)return;
  ch.tags=chapterTags(ch).filter(t=>t!==tag);
  renderChapterTagChips();updateChapterMetaSummary();scheduleSave();
}
function handleChapterTagKeydown(e){
  if(tagAcOpen()&&(e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();moveTagAcSel(e.key==='ArrowDown'?1:-1);return;}
  if(e.key==='Enter'||e.key===','){
    e.preventDefault();
    if(tagAcOpen()&&tagAcItems.length){addChapterTag(tagAcItems[tagAcSel]);e.currentTarget.value='';hideTagAC();return;}
    addChapterTag(e.currentTarget.value);e.currentTarget.value='';hideTagAC();return;
  }
  if(e.key==='Escape'&&tagAcOpen()){hideTagAC();return;}
  if(e.key==='Backspace'&&!e.currentTarget.value&&chapterTags(activeChapter()).length){
    const tags=chapterTags(activeChapter());removeChapterTag(tags[tags.length-1]);
  }
}