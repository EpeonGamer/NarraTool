// ── Sidebar ──
function renderSidebar(){
  const list=document.getElementById('collection-list');
  list.innerHTML='';
  collections.forEach(coll=>{
    const group=document.createElement('div');
    group.className='collection-group'+(coll.open?' open':'');
    group.dataset.id=coll.id;
    const header=document.createElement('div');
    header.className='collection-header hide-collapsed';
    header.innerHTML=`
      <i class="ti ti-chevron-right coll-chevron"></i>
      <i class="ti ${coll.icon} coll-icon" style="color:var(--text2)"></i>
      <div class="coll-name" title="Right-click to rename">${escHtml(coll.name)}</div>
      <div class="coll-actions">
        <button class="coll-btn" title="Move up" onclick="moveCollection(${coll.id},-1)"><i class="ti ti-chevron-up"></i></button>
        <button class="coll-btn" title="Move down" onclick="moveCollection(${coll.id},1)"><i class="ti ti-chevron-down"></i></button>
        <button class="coll-btn" title="Add chapter" onclick="addChapter(${coll.id})"><i class="ti ti-plus"></i></button>
        <button class="coll-btn" title="Duplicate collection" onclick="duplicateCollection(${coll.id},this)"><i class="ti ti-copy"></i></button>
        <button class="coll-btn danger" title="Delete collection" onclick="deleteCollection(${coll.id},this)"><i class="ti ti-trash"></i></button>
      </div>`;
    header.querySelector('.coll-chevron').addEventListener('click',e=>{e.stopPropagation();toggleCollection(coll.id);});
    header.addEventListener('click',e=>{
      if(e.target.closest('.coll-btn')||e.target.closest('.coll-name[contenteditable="true"]'))return;
      toggleCollection(coll.id);
    });
    header.querySelector('.coll-name').addEventListener('contextmenu',e=>{
      e.stopPropagation();e.preventDefault();
      startRenameEl(header.querySelector('.coll-name'),val=>{coll.name=val||coll.name;renderSidebar();save();});
    });
    const chapList=document.createElement('div');
    chapList.className='collection-chapters hide-collapsed';
    coll.chapters.forEach((ch,ci)=>{
      const dz=document.createElement('div');
      dz.className='chapter-drop-zone';dz.dataset.dropIndex=ci;
      chapList.appendChild(dz);
      const item=document.createElement('div');
      item.className='chapter-item'+(ch.id===activeChapterId?' active':'');
      item.dataset.id=ch.id;
      item.innerHTML=`
        <div class="chap-drag-handle" title="Drag to reorder" data-chap-drag="${ch.id}" data-chap-drag-coll="${coll.id}"><i class="ti ti-grip-vertical"></i></div>
        <span class="chap-tag-dot" style="background:${CHAPTER_TYPE_COLORS[chapterType(ch)]}" title="${chapterTypeLabel(ch)}"></span>
        <div class="chap-name" title="Right-click to rename">${escHtml(ch.name)}</div>
        <div class="chap-actions">
          <button class="chap-btn" title="Move up" onclick="moveChapter(${coll.id},${ch.id},-1)"><i class="ti ti-chevron-up"></i></button>
          <button class="chap-btn" title="Move down" onclick="moveChapter(${coll.id},${ch.id},1)"><i class="ti ti-chevron-down"></i></button>
          <button class="chap-btn" title="Duplicate" onclick="duplicateChapter(${coll.id},${ch.id})"><i class="ti ti-copy"></i></button>
          <button class="chap-btn danger" title="Delete" onclick="deleteChapter(${coll.id},${ch.id},this)"><i class="ti ti-trash"></i></button>
        </div>`;
      item.addEventListener('click',e=>{
        if(e.target.closest('.chap-btn')||e.target.closest('.chap-drag-handle')||e.target.closest('.chap-name[contenteditable="true"]'))return;
        switchChapter(coll.id,ch.id);
      });
      item.querySelector('.chap-name').addEventListener('contextmenu',e=>{
        e.stopPropagation();e.preventDefault();
        startRenameEl(item.querySelector('.chap-name'),val=>{ch.name=val||ch.name;renderSidebar();updateChapTitle();render();save();});
      });
      chapList.appendChild(item);
    });
    const lastDz=document.createElement('div');
    lastDz.className='chapter-drop-zone';lastDz.dataset.dropIndex=coll.chapters.length;
    chapList.appendChild(lastDz);
    const addRow=document.createElement('div');
    addRow.className='add-chapter-row hide-collapsed';
    addRow.innerHTML=`<i class="ti ti-plus"></i><span>Add chapter</span>`;
    addRow.onclick=()=>addChapter(coll.id);
    chapList.appendChild(addRow);
    group.appendChild(header);group.appendChild(chapList);list.appendChild(group);
  });
}
function escHtml(s){return s.replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>').replace(/"/g,'"');}
function startRenameEl(el,onDone){
  el.contentEditable='true';el.focus();
  const range=document.createRange();range.selectNodeContents(el);
  window.getSelection().removeAllRanges();window.getSelection().addRange(range);
  const finish=()=>{el.contentEditable='false';onDone(el.textContent.trim());};
  el.addEventListener('blur',finish,{once:true});
  el.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();el.blur();}},{once:true});
}
function toggleCollection(id){const c=collections.find(c=>c.id===id);if(c){c.open=!c.open;renderSidebar();save();}}
function addCollection(){
  const icon=COLL_ICONS[collections.length%COLL_ICONS.length];
  const firstChap={id:nextChapterId++,name:'Chapter 1',blocks:[],notes:''};
  const coll={id:nextCollId++,name:'New Collection',icon,open:true,chapters:[firstChap]};
  collections.push(coll);switchChapter(coll.id,firstChap.id);save();
  setTimeout(()=>{
    const groups=document.querySelectorAll('.collection-group');
    const last=groups[groups.length-1];
    if(last){const el=last.querySelector('.coll-name');if(el)startRenameEl(el,val=>{coll.name=val||coll.name;renderSidebar();save();});}
  },50);
}
function deleteCollection(id,anchorEl){
  const coll=collections.find(c=>c.id===id);
  if(collections.length===1){toast("Can't delete the only collection");return;}
  appConfirm('Delete "'+(coll?.name||'collection')+'" and all its chapters?','Delete',()=>{
    collections=collections.filter(c=>c.id!==id);
    if(!allChapters().find(ch=>ch.id===activeChapterId)){
      const first=allChapters()[0];
      if(first){activeChapterId=first.id;activeCollId=collections.find(c=>c.chapters.some(ch=>ch.id===first.id))?.id;}
    }
    renderSidebar();render();save();
  },anchorEl);
}
function nextCopyName(base,existingNamesLower){
  const m=/^(.*) copy(?: (\d+))?$/i.exec(base);
  const root=(m?m[1]:base).trim()||base;
  const first=root+' copy';
  if(!existingNamesLower.has(first.toLowerCase()))return first;
  let n=2;
  while(existingNamesLower.has((root+' copy '+n).toLowerCase()))n++;
  return root+' copy '+n;
}
function duplicateCollection(id,anchorEl){
  const coll=collections.find(c=>c.id===id);if(!coll)return;
  appConfirm('Duplicate "'+coll.name+'" and all its chapters?','Duplicate',()=>{
    const clone=JSON.parse(JSON.stringify(coll));
    clone.id=nextCollId++;
    const existingCollNames=new Set(collections.map(c=>c.name.toLowerCase()));
    clone.name=nextCopyName(coll.name,existingCollNames);
    const existingChapNames=new Set(allChapters().map(c=>c.name.toLowerCase()));
    clone.chapters=(clone.chapters||[]).map(ch=>{
      const newCh={...ch,id:nextChapterId++,blocks:(ch.blocks||[]).map(b=>({...b,id:nextBlockId++}))};
      newCh.name=nextCopyName(ch.name,existingChapNames);
      newCh.aliases=[];
      existingChapNames.add(newCh.name.toLowerCase());
      return newCh;
    });
    clone.open=true;
    const idx=collections.findIndex(c=>c.id===id);
    collections.splice(idx+1,0,clone);
    renderSidebar();save();
    toast('Duplicated "'+coll.name+'"');
  },anchorEl);
}
function moveCollection(id,dir){
  const i=collections.findIndex(c=>c.id===id);const ni=i+dir;
  if(ni<0||ni>=collections.length)return;
  [collections[i],collections[ni]]=[collections[ni],collections[i]];
  renderSidebar();save();
}
function addChapter(collId){
  const coll=collections.find(c=>c.id===collId);if(!coll)return;
  const ch={id:nextChapterId++,name:'New Chapter',blocks:[],notes:''};
  coll.chapters.push(ch);coll.open=true;switchChapter(collId,ch.id);save();
  setTimeout(()=>{
    const item=document.querySelector(`.chapter-item[data-id="${ch.id}"]`);
    if(item){const el=item.querySelector('.chap-name');if(el)startRenameEl(el,val=>{ch.name=val||ch.name;renderSidebar();updateChapTitle();render();save();});}
  },60);
}
function duplicateChapter(collId,chapId){
  const coll=collections.find(c=>c.id===collId);if(!coll)return;
  const ch=coll.chapters.find(c=>c.id===chapId);if(!ch)return;
  const clone=JSON.parse(JSON.stringify(ch));
  clone.id=nextChapterId++;
  clone.blocks=(clone.blocks||[]).map(b=>({...b,id:nextBlockId++}));
  clone.aliases=[];
  const existingNames=new Set(allChapters().map(c=>c.name.toLowerCase()));
  clone.name=nextCopyName(ch.name,existingNames);
  const idx=coll.chapters.findIndex(c=>c.id===chapId);
  coll.chapters.splice(idx+1,0,clone);
  renderSidebar();save();
  toast('Duplicated "'+ch.name+'"');
}
function deleteChapter(collId,chapId,anchorEl){
  const coll=collections.find(c=>c.id===collId);if(!coll)return;
  if(allChapters().length===1){toast("Can't delete the only chapter");return;}
  const ch=coll.chapters.find(c=>c.id===chapId);
  appConfirm('Delete "'+(ch?.name||'chapter')+'"?','Delete',()=>{
    coll.chapters=coll.chapters.filter(ch=>ch.id!==chapId);
    if(activeChapterId===chapId){
      const next=allChapters()[0];
      if(next){const nc=collections.find(c=>c.chapters.some(ch=>ch.id===next.id));switchChapter(nc.id,next.id);}
    }
    renderSidebar();save();
  },anchorEl);
}
function moveChapter(collId,chapId,dir){
  const coll=collections.find(c=>c.id===collId);if(!coll)return;
  const i=coll.chapters.findIndex(ch=>ch.id===chapId);const ni=i+dir;
  if(ni<0||ni>=coll.chapters.length)return;
  [coll.chapters[i],coll.chapters[ni]]=[coll.chapters[ni],coll.chapters[i]];
  renderSidebar();save();
}
function switchChapter(collId,chapId){
  activeCollId=collId;activeChapterId=chapId;
  renderSidebar();render();
  loadNotesIntoUI(true);
  updateChapTitle();save();
  if(isMobile())closeMobileSidebar();
}
function updateChapTitle(){
  const ch=activeChapter(),coll=activeCollection();
  document.getElementById('chap-title-display').textContent=ch?(coll?coll.name+' · '+ch.name:ch.name):'';
}
// ── Render blocks ──
// ── Inline markdown: **bold**, *italic*, [[Link]], [[Link|Alias]] ──
// Marker characters stay as real (dimmed) text nodes in the DOM, so
// el.textContent always reconstructs the exact raw source string.
//
// Wikilinks are extracted from the *whole* string first, and bold/italic are
// only matched within the plain-text segments before/after/between them.
// (Running one combined regex over the whole string let a stray, unpaired
// "*" anywhere before a [[Link]] pair up with another "*" anywhere after it
// and swallow the link's brackets as literal italic text, silently breaking
