function makePlotId(){
  const used=new Set(plotIdeas.map(p=>String(p&&p.id||'')));
  // Reuse the lowest available Plot Idea slot so deleted IDs become available again.
  // IDs are allocated in base-36: pi_1, pi_2 … pi_9, pi_a, pi_b …
  let n=1;
  while(used.has('pi_'+n.toString(36)))n++;
  const id='pi_'+n.toString(36);
  nextPlotId=Math.max(nextPlotId||1,n+1);
  return id;
}
function normalizePlotData(){
  if(!Array.isArray(plotIdeas))plotIdeas=[];
  const oldToNew=new Map(),used=new Set();
  plotIdeas.forEach((p,i)=>{
    if(!p||typeof p!=='object')return;
    const old=p.id;
    let id=typeof old==='string'&&/^pi_[a-z0-9]+$/i.test(old)?old:'pi_'+(i+1).toString(36);
    while(used.has(id))id='pi_'+(used.size+1).toString(36);
    used.add(id);
    if(old!==id)oldToNew.set(String(old),id);
    p.id=id;
  });
  plotIdeas=plotIdeas.filter(p=>p&&typeof p==='object');
  const valid=new Set(plotIdeas.map(p=>p.id));
  plotIdeas.forEach(p=>{
    const oldParent=p.parentId;
    const parentKey=oldParent==null?null:String(oldParent);
    p.parentId=parentKey==null?null:(oldToNew.get(parentKey)||parentKey);
    if(p.parentId===p.id||!valid.has(p.parentId))p.parentId=null;
    p.children=(Array.isArray(p.children)?p.children:[]).map(x=>oldToNew.get(String(x))||x).filter(x=>valid.has(x)&&x!==p.id);
    p.children=[...new Set(p.children)];
    p.tags=Array.isArray(p.tags)?p.tags.filter(x=>typeof x==='string'):[];
    p.links=Array.isArray(p.links)?p.links.filter(x=>typeof x==='string'):[];
    if(typeof p.text!=='string')p.text='';
    p.color=(typeof p.color==='string'&&(PLOT_COLOR_HEX[p.color]||/^#([0-9a-f]{3}){1,2}$/i.test(p.color)))?p.color.toLowerCase():null;
    p.links=[...new Set(p.links.map(x=>oldToNew.get(String(x))||String(x).trim()).filter(Boolean))];
  });
  plotIdeas.forEach(p=>{
    if(p.parentId!=null){const par=plotIdea(p.parentId);if(par&&!par.children.includes(p.id))par.children.push(p.id);}
  });
  plotIdeas.forEach(p=>p.children=p.children.filter(id=>plotIdea(id)?.parentId===p.id));
  nextPlotId=Math.max(1,...plotIdeas.map(p=>{const m=/^pi_([a-z0-9]+)$/i.exec(p.id);return m?parseInt(m[1],36)+1:1;}));
}
function plotIdea(id){return plotIdeas.find(p=>p.id===id)||null;}
function plotRoots(){return plotIdeas.filter(p=>p.parentId==null);}
function plotDescendant(id,target){let cur=plotIdea(target),seen=new Set();while(cur&&cur.parentId!=null&&!seen.has(cur.id)){if(cur.parentId===id)return true;seen.add(cur.id);cur=plotIdea(cur.parentId);}return false;}
function plotAncestors(id){const out=[];let p=plotIdea(id),seen=new Set();while(p&&!seen.has(p.id)){out.unshift(p.id);seen.add(p.id);p=plotIdea(p.parentId);}return out;}
function plotPathText(id){return plotAncestors(id).map(x=>plotIdea(x)?.text.trim()||'Untitled idea').join(' → ');}
function plotQueryState(){return{q:(document.getElementById('plot-search')?.value||'').trim().toLowerCase(),tag:(document.getElementById('plot-tag-filter')?.value||'').trim().toLowerCase(),mode:document.getElementById('plot-view-filter')?.value||'all'};}
function plotMatches(){
  const {q,tag,mode}=plotQueryState();
  return plotIdeas.filter(p=>{
    const text=(p.text||'').toLowerCase(),tags=(p.tags||[]).map(x=>x.toLowerCase()),links=(p.links||[]).map(x=>x.toLowerCase());
    const qm=!q||text.includes(q)||tags.some(x=>x.includes(q))||links.some(x=>x.includes(q));
    const tm=!tag||tags.some(x=>x.includes(tag));
    const mm=mode==='all'||(mode==='tagged'&&tags.length>0)||(mode==='linked'&&links.length>0);
    return qm&&tm&&mm;
  });
}
function plotIsFiltered(){const s=plotQueryState();return !!(s.q||s.tag||s.mode!=='all');}
function plotAdd(parentId=null,afterId=null){
  normalizePlotData();
  pushUndoSnapshot();
  const id=makePlotId(),p={id,text:'',parentId:typeof parentId==='string'?parentId:null,children:[],tags:[],links:[],color:null};
  if(p.parentId!=null){const par=plotIdea(p.parentId);if(!par)p.parentId=null;}
  plotIdeas.push(p);
  if(p.parentId!=null){const par=plotIdea(p.parentId);const at=afterId!=null?par.children.indexOf(afterId):-1;if(at>=0)par.children.splice(at+1,0,id);else par.children.push(id);}
  activePlotId=id;plotFocusId=p.parentId??plotFocusId;clearPlotFilters();scheduleSave();renderPlotWorkspace();
  requestAnimationFrame(()=>{const el=document.querySelector('[data-plot-id="'+id+'"]');if(el){el.focus();setCaretOffset(el,el.textContent.length);}});
  return id;
}
function plotUpdateText(id,v){const p=plotIdea(id);if(!p)return;p.text=v;p.links=[...v.matchAll(/\[\[([^\]]+)\]\]/g)].map(m=>(m[1].split('|')[0]||'').trim()).filter(Boolean);scheduleSave();}
function plotDelete(id){
  const p=plotIdea(id);
  if(!p)return false;
  pushUndoSnapshot();
  const parentId=p.parentId;
  const gone=new Set([id]),queue=[id];
  while(queue.length){
    const cur=queue.shift();
    plotIdeas.forEach(x=>{
      if(x.parentId===cur&&!gone.has(x.id)){gone.add(x.id);queue.push(x.id);}
    });
  }
  if(parentId!=null){
    const par=plotIdea(parentId);
    if(par)par.children=par.children.filter(x=>!gone.has(x));
  }
  plotIdeas=plotIdeas.filter(x=>!gone.has(x?.id));
  gone.forEach(x=>plotCollapsed.delete(x));
  if(gone.has(activePlotId))activePlotId=parentId!=null?plotIdea(parentId)?.id??null:null;
  if(gone.has(plotFocusId))plotFocusId=parentId!=null?plotIdea(parentId)?.id??null:null;
  normalizePlotData();
  renderPlotWorkspace();
  save();
  return true;
}
function plotMove(id,parentId,positionIndex){
  const p=plotIdea(id);if(!p||parentId===id||plotDescendant(id,parentId))return;
  pushUndoSnapshot();
  const oldParent=p.parentId!=null?plotIdea(p.parentId):null;
  if(oldParent)oldParent.children=oldParent.children.filter(x=>x!==id);
  p.parentId=parentId==null?null:parentId;
  if(parentId!=null){const par=plotIdea(parentId);if(!par){p.parentId=null;}else{par.children=par.children.filter(x=>x!==id);par.children.splice(Math.max(0,Math.min(positionIndex??par.children.length,par.children.length)),0,id);}}
  if(parentId==null){const roots=plotRoots().filter(x=>x.id!==id);roots.splice(Math.max(0,Math.min(positionIndex??roots.length,roots.length)),0,p);const rootIds=new Set(roots.map(x=>x.id));plotIdeas=[...roots,...plotIdeas.filter(x=>!rootIds.has(x.id))];}
  normalizePlotData();scheduleSave();renderPlotWorkspace();
}
function plotDeleteWithConfirm(id,anchor){
  const p=plotIdea(id);if(!p)return;
  const label=(p.text||'Untitled idea').trim()||'Untitled idea';
  appConfirm('Delete '+JSON.stringify(label)+' and all of its children?','Delete',()=>plotDelete(id),anchor);
}
function plotColorHex(c){if(!c)return null;if(PLOT_COLOR_HEX[c])return PLOT_COLOR_HEX[c];if(/^#([0-9a-f]{3}){1,2}$/i.test(c))return c;return null;}
function plotUsedCustomColors(){
  const set=new Set();
  plotIdeas.forEach(p=>{if(p&&typeof p.color==='string'&&!PLOT_COLOR_HEX[p.color])set.add(p.color.toLowerCase());});
  return [...set];
}
function plotColorDialog(id,anchor){
  const p=plotIdea(id);if(!p)return;
  closePlotDialog();
  const d=document.createElement('div');d.className='plot-tag-editor';d.id='plot-color-editor';d.dataset.plotId=String(id);
  d.innerHTML='<div class="plot-tag-editor-title">Color</div>';
  const grid=document.createElement('div');grid.className='plot-color-grid';
  const pick=c=>{pushUndoSnapshot();p.color=c;scheduleSave();closePlotDialog();renderPlotWorkspace();};
  const none=document.createElement('button');none.type='button';none.className='plot-color-swatch none'+(!p.color?' active':'');none.title='No color';none.setAttribute('aria-label','No color');none.onclick=()=>pick(null);
  grid.appendChild(none);
  PLOT_COLORS.forEach(c=>{
    const b=document.createElement('button');b.type='button';b.className='plot-color-swatch'+(p.color===c.id?' active':'');b.style.background=c.hex;b.title=c.id;b.setAttribute('aria-label',c.id);b.onclick=()=>pick(c.id);
    grid.appendChild(b);
  });
  const customPool=[...new Set([...CUSTOM_COLORS.map(c=>c.toLowerCase()),...plotUsedCustomColors()])];
  customPool.forEach(hex=>{
    const b=document.createElement('button');b.type='button';b.className='plot-color-swatch'+(typeof p.color==='string'&&p.color.toLowerCase()===hex?' active':'');b.style.background=hex;b.title=hex;b.setAttribute('aria-label','Custom color '+hex);b.onclick=()=>pick(hex);
    grid.appendChild(b);
  });
  const custom=document.createElement('label');custom.className='plot-color-swatch plot-color-custom';custom.title='Pick any custom color';
  const nativeInput=document.createElement('input');nativeInput.type='color';nativeInput.setAttribute('aria-label','Pick a custom color');
  nativeInput.value=(typeof p.color==='string'&&/^#/.test(p.color))?p.color:'#7F77DD';
  nativeInput.addEventListener('input',()=>pick(nativeInput.value.toLowerCase()));
  custom.appendChild(nativeInput);
  grid.appendChild(custom);
  d.appendChild(grid);
  document.body.appendChild(d);positionPlotPopover(d,anchor);
}
function renderPlotColorBtn(p){
  const btn=document.createElement('button');btn.type='button';btn.className='plot-icon-btn plot-color-btn';btn.title='Set color';btn.setAttribute('aria-label','Set color for this idea');
  const hex=plotColorHex(p.color);
  const dot=document.createElement('span');dot.className='plot-color-dot'+(hex?'':' empty');if(hex)dot.style.background=hex;
  btn.appendChild(dot);
  btn.onclick=e=>{e.stopPropagation();plotColorDialog(p.id,btn);};
  return btn;
}
function plotApplyColorVar(el,p){const hex=plotColorHex(p.color);if(hex)el.style.setProperty('--plot-color',hex);else el.style.removeProperty('--plot-color');}
function plotTagDialog(id,anchor){
  const p=plotIdea(id);if(!p)return;
  closePlotDialog();
  const d=document.createElement('div');d.className='plot-tag-editor';d.id='plot-tag-editor';d.dataset.plotId=String(id);
  const chips=document.createElement('div');chips.className='plot-tag-editor-chips';
  d.innerHTML='<div class="plot-tag-editor-title">Tags</div>';d.appendChild(chips);
  renderPlotTagChips(id);
  const input=document.createElement('input');input.className='plot-tag-editor-input';input.placeholder='Add tag…';input.setAttribute('aria-label','Add tag');
  const pick=tag=>{addPlotTag(id,tag);input.value='';renderPlotTagChips(id);hideTagAC();input.focus();};
  input.addEventListener('input',()=>updateTagAutocomplete(input,plotIdea(id)?.tags||[],pick));
  input.onkeydown=e=>{
    if(tagAcOpen()&&(e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();moveTagAcSel(e.key==='ArrowDown'?1:-1);return;}
    if(e.key==='Enter'||e.key===','){
      e.preventDefault();
      if(tagAcOpen()&&tagAcItems.length){pick(tagAcItems[tagAcSel]);return;}
      pick(input.value);return;
    }
    if(e.key==='Backspace'&&!input.value&&(p.tags||[]).length){pushUndoSnapshot();p.tags.pop();renderPlotTagChips(id);scheduleSave();renderPlotWorkspace();}
    if(e.key==='Escape'){if(tagAcOpen()){hideTagAC();return;}closePlotDialog();}
  };
  d.appendChild(input);const help=document.createElement('div');help.className='plot-tag-editor-help';help.textContent='Press Enter to add a tag.';d.appendChild(help);
  document.body.appendChild(d);positionPlotPopover(d,anchor);input.focus();
}
function renderPlotTagChips(id){
  const d=document.getElementById('plot-tag-editor');if(!d)return;
  const p=plotIdea(id);if(!p)return;
  const chips=d.querySelector('.plot-tag-editor-chips');if(!chips)return;
  chips.innerHTML='';
  (p.tags||[]).forEach(tag=>{
    const chip=document.createElement('span');chip.className='chapter-tag-chip';
    const text=document.createElement('span');text.textContent=tag;
    const x=document.createElement('button');x.type='button';x.title='Remove tag';x.textContent='×';
    x.onclick=()=>{pushUndoSnapshot();p.tags=(p.tags||[]).filter(t=>t!==tag);renderPlotTagChips(id);scheduleSave();renderPlotWorkspace();};
    chip.append(text,x);chips.appendChild(chip);
  });
}
function renderPlotTagEditor(id){
  const d=document.getElementById('plot-tag-editor');if(!d)return;
  const p=plotIdea(id);if(!p){closePlotDialog();return;}
  const anchor=d.__anchor;
  d.remove();
  plotTagDialog(id,anchor);
}
document.addEventListener('pointerdown',e=>{
  const d=document.getElementById('plot-tag-editor');
  if(d && !d.contains(e.target) && !e.target.closest('.plot-icon-btn[title="Edit tags"]')) d.remove();
  const cd=document.getElementById('plot-color-editor');
  if(cd && !cd.contains(e.target) && !e.target.closest('.plot-color-btn')) cd.remove();
  const tac=document.getElementById('tag-ac');
  if(tac && tac.classList.contains('open') && !tac.contains(e.target) && e.target!==tagAcInput) hideTagAC();
});
function addPlotTag(id,raw){
  const p=plotIdea(id);if(!p)return;const tag=(raw||'').trim().replace(/,+$/,'').trim();if(!tag)return;
  if(!Array.isArray(p.tags))p.tags=[];
  if(p.tags.some(t=>t.toLowerCase()===tag.toLowerCase()))return;
  pushUndoSnapshot();
  p.tags.push(tag);
  scheduleSave();renderPlotWorkspace();
}
// ── Tag autocomplete (shared by idea tags and chapter tags) ──
let tagAcItems=[],tagAcSel=0,tagAcInput=null,tagAcOnPick=null;
function allKnownTags(){
  const set=new Set();
  plotIdeas.forEach(p=>(p.tags||[]).forEach(t=>t&&set.add(t)));
  allChapters().forEach(ch=>chapterTags(ch).forEach(t=>t&&set.add(t)));
  return [...set].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
}
function tagAcOpen(){return document.getElementById('tag-ac')?.classList.contains('open')||false;}
function hideTagAC(){document.getElementById('tag-ac')?.classList.remove('open');tagAcInput=null;tagAcOnPick=null;tagAcItems=[];}
function updateTagAutocomplete(inputEl,excludeTags,onPick){
  const q=inputEl.value.trim().toLowerCase();
  const exclude=new Set((excludeTags||[]).map(t=>t.toLowerCase()));
  const all=allKnownTags().filter(t=>!exclude.has(t.toLowerCase()));
  tagAcItems=(q?all.filter(t=>t.toLowerCase().includes(q)):all).slice(0,8);
  if(!tagAcItems.length){hideTagAC();return;}
  tagAcInput=inputEl;tagAcOnPick=onPick;tagAcSel=0;
  renderTagAC(inputEl);
}
function renderTagAC(anchor){
  const pop=document.getElementById('tag-ac');if(!pop)return;
  pop.innerHTML='';
  tagAcItems.forEach((t,i)=>{
    const item=document.createElement('div');item.className='wac-item tag-ac-item'+(i===tagAcSel?' sel':'');
    item.textContent=t;
    item.onmousedown=e=>{e.preventDefault();const pick=tagAcOnPick;hideTagAC();if(pick)pick(t);};
    pop.appendChild(item);
  });
  pop.classList.add('open');
  positionPlotPopover(pop,anchor);
}
function moveTagAcSel(dir){
  if(!tagAcItems.length)return;
  tagAcSel=(tagAcSel+dir+tagAcItems.length)%tagAcItems.length;
  renderTagAC(tagAcInput);
}
function positionPlotPopover(d,anchor){
  d.__anchor=anchor||null;
  const r=anchor?.getBoundingClientRect();
  if(!r){d.style.left='50%';d.style.top='50%';d.style.transform='translate(-50%,-50%)';return;}
  d.style.transform='';
  const pw=Math.min(340,d.offsetWidth||340),ph=d.offsetHeight||160;
  let left=r.left,top=r.bottom+6;
  if(left+pw>innerWidth-8)left=Math.max(8,innerWidth-pw-8);
  if(top+ph>innerHeight-8)top=Math.max(8,r.top-ph-6);
  d.style.left=left+'px';d.style.top=top+'px';
}
function positionPlotDialog(d){d.style.left=Math.max(10,(innerWidth-d.offsetWidth)/2)+'px';d.style.top=Math.max(60,(innerHeight-d.offsetHeight)/2)+'px';}
function closePlotDialog(){
  document.getElementById('plot-dialog')?.remove();
  document.getElementById('plot-tag-editor')?.remove();
  document.getElementById('plot-color-editor')?.remove();
  hideTagAC();
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderPlotEditor(p){
  const ed=document.createElement('div');ed.className='plot-node-editor';ed.contentEditable='true';ed.dataset.plotId=p.id;ed.dataset.placeholder='Write an idea…';ed.setAttribute('role','textbox');ed.setAttribute('aria-label','Plot idea');
  renderMarkdownInto(ed,p.text||'');
  wireMdEditable(ed,{get:()=>plotIdea(p.id)?.text||'',set:v=>plotUpdateText(p.id,v)},{onFocus:()=>{activePlotId=p.id;},onKeydown:e=>{
    if(e.key==='Enter'&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey){e.preventDefault();plotAdd(p.parentId,p.id);}
    else if(e.key==='Tab'&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey){e.preventDefault();plotAdd(p.id,null);}
  }});
  return ed;
}
async function copyPlotIdeaRef(id){const ref='[['+id+']]';let copied=false;try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(ref);copied=true;}}catch(e){}if(!copied){try{const ta=document.createElement('textarea');ta.value=ref;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';ta.style.pointerEvents='none';document.body.appendChild(ta);ta.focus();ta.select();copied=document.execCommand('copy');ta.remove();}catch(e){copied=false;}}toast(copied?'Copied '+ref:'Reference: '+ref);}
function renderPlotNode(p,visible){
  if(visible&&!visible.has(p.id))return null;
  const branch=document.createElement('div');branch.className='plot-branch';branch.dataset.id=p.id;
  const row=document.createElement('div');row.className='plot-node-row';
  const node=document.createElement('div');node.className='plot-node'+(activePlotId===p.id?' selected':'');
  plotApplyColorVar(node,p);
  node.addEventListener('dragover',e=>{
    if(plotDragMode!=='tree'||plotDragId==null||plotDragId===p.id||plotDescendant(plotDragId,p.id))return;
    e.preventDefault();
    const r=node.getBoundingClientRect(),frac=(e.clientY-r.top)/r.height;
    node.classList.remove('plot-drop-before','plot-drop-after','plot-drop-child');
    if(frac<0.28)node.classList.add('plot-drop-before');
    else if(frac>0.72)node.classList.add('plot-drop-after');
    else node.classList.add('plot-drop-child');
  });
  node.addEventListener('dragleave',()=>node.classList.remove('plot-drop-before','plot-drop-after','plot-drop-child'));
  node.addEventListener('drop',e=>{
    e.preventDefault();
    const mode=node.classList.contains('plot-drop-before')?'before':node.classList.contains('plot-drop-after')?'after':'child';
    node.classList.remove('plot-drop-before','plot-drop-after','plot-drop-child');
    if(plotDragId==null||plotDragId===p.id||plotDescendant(plotDragId,p.id))return;
    if(mode==='child'){plotMove(plotDragId,p.id,p.children.length);return;}
    const parentId=p.parentId;
    const siblings=parentId!=null?(plotIdea(parentId)?.children||[]).map(cid=>plotIdea(cid)).filter(Boolean):plotRoots();
    plotBoardReorder(plotDragId,parentId,siblings,p.id,mode==='before');
  });
  const gutter=document.createElement('div');gutter.className='plot-gutter';
  if(p.children.length){const c=document.createElement('button');c.className='plot-icon-btn';c.title=plotCollapsed.has(p.id)?'Expand children':'Collapse children';c.innerHTML='<i class="ti '+(plotCollapsed.has(p.id)?'ti-chevron-right':'ti-chevron-down')+'"></i>';c.onclick=e=>{e.stopPropagation();plotCollapsed.has(p.id)?plotCollapsed.delete(p.id):plotCollapsed.add(p.id);renderPlotWorkspace();};gutter.appendChild(c);}
  const ref=document.createElement('button');ref.className='plot-ref-id';ref.type='button';ref.title='Copy reference [['+p.id+']]';ref.textContent=p.id;ref.onclick=async e=>{e.stopPropagation();await copyPlotIdeaRef(p.id);};gutter.appendChild(ref);
  const grid=document.createElement('div');grid.className='plot-gutter-grid';
  const grip=document.createElement('button');grip.type='button';grip.className='plot-grip-btn';grip.title='Drag to reorder';grip.setAttribute('aria-label','Drag to reorder this idea');grip.innerHTML='<i class="ti ti-grip-vertical"></i>';grip.draggable=true;
  grip.addEventListener('click',e=>e.stopPropagation());
  grip.addEventListener('dragstart',e=>{plotDragId=p.id;plotDragMode='tree';node.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.stopPropagation();});
  grip.addEventListener('dragend',e=>{plotDragId=null;plotDragMode=null;document.querySelectorAll('.plot-node,.plot-search-result').forEach(x=>x.classList.remove('dragging','plot-drop-child','plot-drop-before','plot-drop-after'));e.stopPropagation();});
  grid.appendChild(grip);
  const del=document.createElement('button');del.className='plot-icon-btn';del.type='button';del.title='Delete idea and children';del.innerHTML='<i class="ti ti-trash"></i>';del.onclick=e=>{e.preventDefault();e.stopPropagation();plotDeleteWithConfirm(p.id,del);};grid.appendChild(del);
  const next=document.createElement('button');next.className='plot-icon-btn';next.title='Add next idea (Enter)';next.innerHTML='<i class="ti ti-plus"></i>';next.onclick=e=>{e.stopPropagation();plotAdd(p.parentId,p.id);};grid.appendChild(next);
  const tags=document.createElement('button');tags.className='plot-icon-btn';tags.title='Edit tags';tags.innerHTML='<i class="ti ti-tag"></i>';tags.onclick=e=>{e.stopPropagation();plotTagDialog(p.id,tags);};grid.appendChild(tags);
  grid.appendChild(renderPlotColorBtn(p));
  gutter.appendChild(grid);
  node.append(gutter,renderPlotEditor(p));
  if(p.children.length){const meta=document.createElement('span');meta.className='plot-meta';meta.textContent=p.children.length+' child'+(p.children.length===1?'':'ren');node.appendChild(meta);}
  row.appendChild(node);branch.appendChild(row);
  if(p.tags.length){const ts=document.createElement('div');ts.className='plot-tags';p.tags.forEach(t=>{const s=document.createElement('span');s.className='plot-tag';s.textContent=t;ts.appendChild(s);});branch.appendChild(ts);}
  if(!plotCollapsed.has(p.id)){const childWrap=document.createElement('div');childWrap.className='plot-children';p.children.forEach(cid=>{const ch=plotIdea(cid);if(!ch)return;const n=renderPlotNode(ch,visible);if(n)childWrap.appendChild(n);});if(childWrap.children.length)branch.appendChild(childWrap);}
  row.addEventListener('click',e=>{if(e.target.closest('button,.plot-node-editor'))return;activePlotId=p.id;plotFocusId=p.id;renderPlotWorkspace();});
  row.addEventListener('dblclick',e=>{if(e.target.closest('button,.plot-node-editor'))return;plotRevealNode(p.id);});
  return branch;
}
function plotSearchResults(){
  const results=plotMatches();
  const sort=document.getElementById('plot-sort')?.value||'story';
  if(sort==='az')results.sort((a,b)=>(a.text||'').localeCompare(b.text||'',undefined,{sensitivity:'base'}));
  return results;
}
function renderPlotSearchResults(canvas){
  const results=plotSearchResults();const list=document.createElement('div');list.className='plot-search-result-list';
  if(!results.length){list.innerHTML='<div class="plot-empty"><h3>No matching ideas</h3><p>Try a different search or clear the filter.</p></div>';canvas.appendChild(list);return;}
  results.forEach(p=>{
    const row=document.createElement('div');row.className='plot-search-result';row.draggable=true;row.dataset.id=p.id;
    row.addEventListener('dragstart',e=>{plotDragId=p.id;row.classList.add('dragging');e.dataTransfer.effectAllowed='move';});
    row.addEventListener('dragend',()=>{plotDragId=null;row.classList.remove('dragging');});
    row.addEventListener('dragover',e=>{if(plotDragId==null||plotDragId===p.id||plotDescendant(plotDragId,p.id))return;e.preventDefault();row.classList.add('plot-drop-child');});
    row.addEventListener('dragleave',()=>row.classList.remove('plot-drop-child'));
    row.addEventListener('drop',e=>{e.preventDefault();row.classList.remove('plot-drop-child');if(plotDragId!=null&&plotDragId!==p.id&&!plotDescendant(plotDragId,p.id))plotMove(plotDragId,p.id,p.children.length);});
    const body=document.createElement('div');body.className='plot-search-body';const path=document.createElement('div');path.className='plot-search-path';path.textContent=plotPathText(p.id);const text=document.createElement('div');text.className='plot-search-text';text.textContent=p.text||'Untitled idea';body.append(path,text);row.appendChild(body);row.onclick=()=>plotRevealNode(p.id);list.appendChild(row);
  });
  canvas.appendChild(list);
}
function plotRevealNode(id){
  const p=plotIdea(id);if(!p)return;
  activePlotId=id;
  if(plotIsFiltered()){document.getElementById('plot-search').value='';document.getElementById('plot-tag-filter').value='';document.getElementById('plot-view-filter').value='all';}
  if(plotView==='board'||plotView==='timeline'){
    plotFocusId=p.parentId??null;
  }else{
    plotAncestors(id).forEach(aid=>{if(aid!==id)plotCollapsed.delete(aid);});
    plotFocusId=id;
  }
  renderPlotWorkspace();
  requestAnimationFrame(()=>{
    let node=null;
    if(plotView==='board'){
      node=document.querySelector('.plot-card[data-id="'+CSS.escape(id)+'"]');
    }else if(plotView==='timeline'){
      node=document.querySelector('.plot-lane[data-id="'+CSS.escape(id)+'"]');
    }else{
      const branch=document.querySelector('.plot-branch[data-id="'+CSS.escape(id)+'"]');
      node=branch?.querySelector(':scope>.plot-node-row>.plot-node');
    }
    if(!node)return;
    node.scrollIntoView({block:'center',behavior:'smooth'});
    node.classList.add('plot-flash');
    setTimeout(()=>node.classList.remove('plot-flash'),1200);
  });
}
function plotBreadcrumb(){
  const el=document.getElementById('plot-crumb');el.innerHTML='';
  const home=document.createElement('button');home.type='button';home.className='plot-crumb-seg'+(plotFocusId?'':' current');home.textContent='Story';
  home.onclick=()=>{if(!plotFocusId)return;plotFocusId=null;renderPlotWorkspace();};
  el.appendChild(home);
  if(plotFocusId){
    plotAncestors(plotFocusId).forEach(aid=>{
      const sep=document.createElement('span');sep.className='plot-crumb-sep';sep.textContent='›';el.appendChild(sep);
      const seg=document.createElement('button');seg.type='button';const isCurrent=aid===plotFocusId;
      seg.className='plot-crumb-seg'+(isCurrent?' current':'');
      seg.textContent=(plotIdea(aid)?.text||'').trim()||'Untitled idea';
      seg.title=seg.textContent;
      seg.onclick=()=>{if(isCurrent)return;plotFocusId=aid;renderPlotWorkspace();};
      el.appendChild(seg);
    });
  }
}
function setPlotView(v){
  plotView=(v==='board'||v==='timeline')?v:'tree';
  settings.plotView=plotView;saveSettings();
  renderPlotWorkspace();
}
function updatePlotViewToggle(){
  document.getElementById('plot-view-tree')?.classList.toggle('active',plotView==='tree');
  document.getElementById('plot-view-board')?.classList.toggle('active',plotView==='board');
  document.getElementById('plot-view-timeline')?.classList.toggle('active',plotView==='timeline');
}
function renderPlotWorkspace(){
  normalizePlotData();
  plotBreadcrumb();
  updatePlotViewToggle();
  document.getElementById('plot-workspace')?.classList.toggle('colors-active',plotColorsActive());
  const canvas=document.getElementById('plot-canvas');
  if(!canvas)return;
  canvas.innerHTML='';
  if(!plotIdeas.length){canvas.innerHTML='<div class="plot-empty"><h3>Start your story model</h3><p>Write an idea, press Enter for the next sibling, or Tab to make a child. Drag ideas to change their structure.</p><button class="plot-toolbar-btn" onclick="plotAdd(null,null)"><i class="ti ti-plus"></i> New idea</button></div>';return;}
  if(plotIsFiltered()){renderPlotSearchResults(canvas);return;}
  if(plotView==='board'){renderPlotBoard(canvas);return;}
  if(plotView==='timeline'){renderPlotTimeline(canvas);return;}
  const wrap=document.createElement('div');wrap.className='plot-root-list';plotRoots().forEach(p=>{const n=renderPlotNode(p,null);if(n)wrap.appendChild(n);});canvas.appendChild(wrap);
}
function plotContainerId(){return (plotFocusId&&plotIdea(plotFocusId))?plotFocusId:null;}
function plotBoardItems(containerId){
  if(containerId==null)return plotRoots();
  const container=plotIdea(containerId);
  if(!container)return plotRoots();
  return container.children.map(cid=>plotIdea(cid)).filter(Boolean);
}
function plotBoardReorder(id,parentId,items,targetId,before){
  const rest=items.filter(x=>x.id!==id);
  let idx=rest.findIndex(x=>x.id===targetId);
  if(idx<0)idx=rest.length;
  plotMove(id,parentId,before?idx:idx+1);
}
function renderPlotBoard(canvas){
  const containerId=plotContainerId();
  const items=plotBoardItems(containerId);
  const wrap=document.createElement('div');wrap.className='plot-board-wrap';
  const grid=document.createElement('div');grid.className='plot-board';
  items.forEach(p=>grid.appendChild(renderPlotCard(p,items,containerId)));
  const add=document.createElement('button');add.type='button';add.className='plot-card-add';add.innerHTML='<i class="ti ti-plus"></i> New card';
  add.onclick=()=>plotAdd(containerId,items.length?items[items.length-1].id:null);
  add.addEventListener('dragover',e=>{if(plotDragMode!=='card'||plotDragId==null)return;e.preventDefault();});
  add.addEventListener('drop',e=>{e.preventDefault();if(plotDragMode!=='card'||plotDragId==null)return;if(plotDescendant(plotDragId,containerId))return;plotMove(plotDragId,containerId,items.filter(x=>x.id!==plotDragId).length);});
  grid.appendChild(add);
  wrap.appendChild(grid);
  if(!items.length){const hint=document.createElement('div');hint.className='plot-empty';hint.style.margin='30px auto 0';hint.innerHTML='<p>No cards at this level yet.</p>';wrap.insertBefore(hint,grid);}
  canvas.appendChild(wrap);
}
function renderPlotCard(p,items,parentId){
  const card=document.createElement('div');card.className='plot-card'+(activePlotId===p.id?' selected':'');card.dataset.id=p.id;
  plotApplyColorVar(card,p);
  // Dragging is scoped to the grip handle only (see the tree-node comment
  // above) — the whole card used to be draggable, which hijacked normal
  // text-selection drags inside the editor.
  card.addEventListener('dragover',e=>{
    if(plotDragMode!=='card'||plotDragId==null||plotDragId===p.id||plotDescendant(plotDragId,p.id))return;
    e.preventDefault();
    const r=card.getBoundingClientRect(),frac=(e.clientX-r.left)/r.width;
    card.classList.remove('drop-before','drop-after','drop-child');
    if(frac<0.25)card.classList.add('drop-before');
    else if(frac>0.75)card.classList.add('drop-after');
    else card.classList.add('drop-child');
  });
  card.addEventListener('dragleave',()=>card.classList.remove('drop-before','drop-after','drop-child'));
  card.addEventListener('drop',e=>{
    e.preventDefault();
    const mode=card.classList.contains('drop-before')?'before':card.classList.contains('drop-after')?'after':'child';
    card.classList.remove('drop-before','drop-after','drop-child');
    if(plotDragMode!=='card'||plotDragId==null||plotDragId===p.id||plotDescendant(plotDragId,p.id))return;
    if(mode==='child'){plotMove(plotDragId,p.id,plotIdea(p.id).children.length);return;}
    plotBoardReorder(plotDragId,parentId,items,p.id,mode==='before');
  });
  const head=document.createElement('div');head.className='plot-card-head';
  const grip=document.createElement('button');grip.type='button';grip.className='plot-card-grip';grip.title='Drag to move';grip.setAttribute('aria-label','Drag to move this idea');grip.innerHTML='<i class="ti ti-grip-vertical"></i>';grip.draggable=true;
  grip.addEventListener('click',e=>e.stopPropagation());
  grip.addEventListener('dragstart',e=>{plotDragId=p.id;plotDragMode='card';card.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.stopPropagation();});
  grip.addEventListener('dragend',e=>{plotDragId=null;plotDragMode=null;document.querySelectorAll('.plot-card').forEach(x=>x.classList.remove('dragging','drop-before','drop-after','drop-child'));e.stopPropagation();});
  const idBtn=document.createElement('button');idBtn.type='button';idBtn.className='plot-ref-id';idBtn.title='Copy reference [['+p.id+']]';idBtn.textContent=p.id;idBtn.onclick=async e=>{e.stopPropagation();await copyPlotIdeaRef(p.id);};
  const left=document.createElement('div');left.className='plot-card-head-left';left.append(grip,idBtn);
  const actions=document.createElement('div');actions.className='plot-card-actions';
  const tagBtn=document.createElement('button');tagBtn.type='button';tagBtn.className='plot-icon-btn';tagBtn.title='Edit tags';tagBtn.innerHTML='<i class="ti ti-tag"></i>';tagBtn.onclick=e=>{e.stopPropagation();plotTagDialog(p.id,tagBtn);};
  const delBtn=document.createElement('button');delBtn.type='button';delBtn.className='plot-icon-btn';delBtn.title='Delete idea and children';delBtn.innerHTML='<i class="ti ti-trash"></i>';delBtn.onclick=e=>{e.preventDefault();e.stopPropagation();plotDeleteWithConfirm(p.id,delBtn);};
  actions.append(tagBtn,renderPlotColorBtn(p),delBtn);
  head.append(left,actions);
  const ed=document.createElement('div');ed.className='plot-card-editor';ed.contentEditable='true';ed.dataset.plotId=p.id;ed.dataset.placeholder='Write an idea…';ed.setAttribute('role','textbox');ed.setAttribute('aria-label','Plot idea');
  renderMarkdownInto(ed,p.text||'');
  wireMdEditable(ed,{get:()=>plotIdea(p.id)?.text||'',set:v=>plotUpdateText(p.id,v)},{onFocus:()=>{activePlotId=p.id;document.querySelectorAll('.plot-card.selected').forEach(x=>x.classList.remove('selected'));card.classList.add('selected');}});
  card.addEventListener('click',e=>{if(e.target.closest('button,.plot-card-editor'))return;activePlotId=p.id;document.querySelectorAll('.plot-card.selected').forEach(x=>x.classList.remove('selected'));card.classList.add('selected');});
  card.append(head,ed);
  if(p.tags.length){const ts=document.createElement('div');ts.className='plot-card-tags';p.tags.forEach(t=>{const s=document.createElement('span');s.className='plot-tag';s.textContent=t;ts.appendChild(s);});card.appendChild(ts);}
  const footer=document.createElement('div');footer.className='plot-card-footer';
  const openBtn=document.createElement('button');openBtn.type='button';openBtn.className='plot-card-open';
  openBtn.innerHTML=p.children.length?'<i class="ti ti-layout-grid"></i> Open '+p.children.length+' card'+(p.children.length===1?'':'s'):'<i class="ti ti-corner-down-right"></i> Open';
  openBtn.onclick=e=>{e.stopPropagation();plotFocusId=p.id;renderPlotWorkspace();};
  footer.appendChild(openBtn);
  card.appendChild(footer);
  return card;
}
function renderPlotTimeline(canvas){
  const containerId=plotContainerId();
  const lanes=plotBoardItems(containerId);
  const wrap=document.createElement('div');wrap.className='plot-timeline';
  if(!lanes.length){
    const hint=document.createElement('div');hint.className='plot-empty';hint.innerHTML='<h3>No ideas yet</h3><p>Each idea at this level becomes a lane here; its children become beats placed along that lane.</p>';
    wrap.appendChild(hint);
  }
  lanes.forEach(lane=>wrap.appendChild(renderPlotLane(lane,lanes,containerId)));
  const addLane=document.createElement('button');addLane.type='button';addLane.className='plot-lane-add';addLane.innerHTML='<i class="ti ti-plus"></i> New idea';
  addLane.onclick=()=>plotAdd(containerId,lanes.length?lanes[lanes.length-1].id:null);
  addLane.addEventListener('dragover',e=>{if(plotDragMode!=='lane'||plotDragId==null)return;e.preventDefault();});
  addLane.addEventListener('drop',e=>{e.preventDefault();if(plotDragMode!=='lane'||plotDragId==null)return;if(plotDescendant(plotDragId,containerId))return;plotMove(plotDragId,containerId,lanes.filter(x=>x.id!==plotDragId).length);});
  wrap.appendChild(addLane);
  canvas.appendChild(wrap);
}
function renderPlotLane(lane,items,parentId){
  const row=document.createElement('div');row.className='plot-lane';row.dataset.id=lane.id;
  plotApplyColorVar(row,lane);
  row.addEventListener('dragover',e=>{
    if(plotDragMode!=='lane'||plotDragId==null||plotDragId===lane.id||plotDescendant(plotDragId,lane.id))return;
    e.preventDefault();
    const r=row.getBoundingClientRect(),frac=(e.clientY-r.top)/r.height;
    row.classList.remove('drop-before','drop-after','drop-child');
    if(frac<0.25)row.classList.add('drop-before');
    else if(frac>0.75)row.classList.add('drop-after');
    else row.classList.add('drop-child');
  });
  row.addEventListener('dragleave',e=>{if(!row.contains(e.relatedTarget))row.classList.remove('drop-before','drop-after','drop-child');});
  row.addEventListener('drop',e=>{
    if(plotDragMode!=='lane')return;e.preventDefault();
    const mode=row.classList.contains('drop-before')?'before':row.classList.contains('drop-after')?'after':'child';
    row.classList.remove('drop-before','drop-after','drop-child');
    if(plotDragId==null||plotDragId===lane.id||plotDescendant(plotDragId,lane.id))return;
    if(mode==='child'){plotMove(plotDragId,lane.id,plotIdea(lane.id).children.length);return;}
    plotBoardReorder(plotDragId,parentId,items,lane.id,mode==='before');
  });
  const head=document.createElement('div');head.className='plot-lane-head';
  const grip=document.createElement('span');grip.className='plot-lane-grip';grip.title='Drag to move';grip.setAttribute('aria-label','Drag to move this idea');grip.innerHTML='<i class="ti ti-grip-vertical"></i>';grip.draggable=true;
  grip.addEventListener('dragstart',e=>{plotDragId=lane.id;plotDragMode='lane';row.classList.add('dragging');e.dataTransfer.effectAllowed='move';});
  grip.addEventListener('dragend',()=>{plotDragId=null;plotDragMode=null;document.querySelectorAll('.plot-lane').forEach(x=>x.classList.remove('dragging','drop-before','drop-after','drop-child'));});
  const title=document.createElement('div');title.className='plot-lane-title';title.contentEditable='true';title.dataset.plotId=lane.id;title.dataset.placeholder='Name this idea…';title.setAttribute('role','textbox');title.setAttribute('aria-label','Idea name');
  renderMarkdownInto(title,lane.text||'');
  wireMdEditable(title,{get:()=>plotIdea(lane.id)?.text||'',set:v=>plotUpdateText(lane.id,v)},{onFocus:()=>{activePlotId=lane.id;},onKeydown:e=>{if(e.key==='Enter'){e.preventDefault();title.blur();}}});
  const count=document.createElement('span');count.className='plot-lane-count';count.textContent=lane.children.length+' idea'+(lane.children.length===1?'':'s');
  const actions=document.createElement('div');actions.className='plot-lane-actions';
  actions.append(renderPlotColorBtn(lane));
  const tagBtn=document.createElement('button');tagBtn.type='button';tagBtn.className='plot-icon-btn';tagBtn.title='Edit tags';tagBtn.innerHTML='<i class="ti ti-tag"></i>';tagBtn.onclick=e=>{e.stopPropagation();plotTagDialog(lane.id,tagBtn);};
  actions.appendChild(tagBtn);
  const delBtn=document.createElement('button');delBtn.type='button';delBtn.className='plot-icon-btn';delBtn.title='Delete idea and its children';delBtn.innerHTML='<i class="ti ti-trash"></i>';delBtn.onclick=e=>{e.preventDefault();e.stopPropagation();plotDeleteWithConfirm(lane.id,delBtn);};
  actions.appendChild(delBtn);
  head.append(grip,title,count,actions);
  const track=document.createElement('div');track.className='plot-lane-track';
  const beats=lane.children.map(cid=>plotIdea(cid)).filter(Boolean);
  track.addEventListener('dragover',e=>{if(plotDragMode!=='beat'||plotDragId==null||plotDescendant(plotDragId,lane.id))return;e.preventDefault();});
  track.addEventListener('drop',e=>{
    if(plotDragMode!=='beat'||e.target!==track)return;e.preventDefault();
    if(plotDragId==null||plotDescendant(plotDragId,lane.id))return;
    plotMove(plotDragId,lane.id,beats.filter(b=>b.id!==plotDragId).length);
  });
  beats.forEach(b=>track.appendChild(renderPlotBeat(b,beats,lane.id)));
  const addBeat=document.createElement('button');addBeat.type='button';addBeat.className='plot-beat-add';addBeat.innerHTML='<i class="ti ti-plus"></i> Idea';
  addBeat.onclick=()=>plotAdd(lane.id,beats.length?beats[beats.length-1].id:null);
  track.appendChild(addBeat);
  row.append(head,track);
  return row;
}
function renderPlotBeat(p,items,laneId){
  const beat=document.createElement('div');beat.className='plot-beat'+(activePlotId===p.id?' selected':'');beat.dataset.id=p.id;
  plotApplyColorVar(beat,p);
  // Dragging is scoped to the grip handle only, same reasoning as the
  // corkboard card and tree-node grips — see the comment on renderPlotNode.
  beat.addEventListener('dragover',e=>{
    if(plotDragMode!=='beat'||plotDragId==null||plotDragId===p.id||plotDescendant(plotDragId,p.id))return;
    e.preventDefault();e.stopPropagation();
    const r=beat.getBoundingClientRect(),frac=(e.clientX-r.left)/r.width;
    beat.classList.remove('drop-before','drop-after','drop-child');
    if(frac<0.25)beat.classList.add('drop-before');
    else if(frac>0.75)beat.classList.add('drop-after');
    else beat.classList.add('drop-child');
  });
  beat.addEventListener('dragleave',()=>beat.classList.remove('drop-before','drop-after','drop-child'));
  beat.addEventListener('drop',e=>{
    if(plotDragMode!=='beat')return;
    e.preventDefault();e.stopPropagation();
    const mode=beat.classList.contains('drop-before')?'before':beat.classList.contains('drop-after')?'after':'child';
    beat.classList.remove('drop-before','drop-after','drop-child');
    if(plotDragId==null||plotDragId===p.id||plotDescendant(plotDragId,p.id))return;
    if(mode==='child'){plotMove(plotDragId,p.id,plotIdea(p.id).children.length);return;}
    plotBoardReorder(plotDragId,laneId,items,p.id,mode==='before');
  });
  const head=document.createElement('div');head.className='plot-beat-head';
  const grip=document.createElement('button');grip.type='button';grip.className='plot-beat-grip';grip.title='Drag to move';grip.setAttribute('aria-label','Drag to move this idea');grip.innerHTML='<i class="ti ti-grip-vertical"></i>';grip.draggable=true;
  grip.addEventListener('click',e=>e.stopPropagation());
  grip.addEventListener('dragstart',e=>{plotDragId=p.id;plotDragMode='beat';beat.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.stopPropagation();});
  grip.addEventListener('dragend',e=>{plotDragId=null;plotDragMode=null;document.querySelectorAll('.plot-beat').forEach(x=>x.classList.remove('dragging','drop-before','drop-after','drop-child'));e.stopPropagation();});
  const idBtn=document.createElement('button');idBtn.type='button';idBtn.className='plot-ref-id';idBtn.title='Copy reference [['+p.id+']]';idBtn.textContent=p.id;idBtn.onclick=async e=>{e.stopPropagation();await copyPlotIdeaRef(p.id);};
  const left=document.createElement('div');left.className='plot-beat-head-left';left.append(grip,idBtn);
  const actions=document.createElement('div');actions.className='plot-beat-actions';
  const tagBtn=document.createElement('button');tagBtn.type='button';tagBtn.className='plot-icon-btn';tagBtn.title='Edit tags';tagBtn.innerHTML='<i class="ti ti-tag"></i>';tagBtn.onclick=e=>{e.stopPropagation();plotTagDialog(p.id,tagBtn);};
  const delBtn=document.createElement('button');delBtn.type='button';delBtn.className='plot-icon-btn';delBtn.title='Delete idea and children';delBtn.innerHTML='<i class="ti ti-trash"></i>';delBtn.onclick=e=>{e.preventDefault();e.stopPropagation();plotDeleteWithConfirm(p.id,delBtn);};
  actions.append(tagBtn,renderPlotColorBtn(p),delBtn);
  head.append(left,actions);
  const ed=document.createElement('div');ed.className='plot-beat-editor';ed.contentEditable='true';ed.dataset.plotId=p.id;ed.dataset.placeholder='Write an idea…';ed.setAttribute('role','textbox');ed.setAttribute('aria-label','Plot idea');
  renderMarkdownInto(ed,p.text||'');
  wireMdEditable(ed,{get:()=>plotIdea(p.id)?.text||'',set:v=>plotUpdateText(p.id,v)},{onFocus:()=>{activePlotId=p.id;document.querySelectorAll('.plot-beat.selected').forEach(x=>x.classList.remove('selected'));beat.classList.add('selected');}});
  beat.addEventListener('click',e=>{if(e.target.closest('button,.plot-beat-editor'))return;activePlotId=p.id;document.querySelectorAll('.plot-beat.selected').forEach(x=>x.classList.remove('selected'));beat.classList.add('selected');});
  beat.append(head,ed);
  if(p.tags.length){const ts=document.createElement('div');ts.className='plot-card-tags';p.tags.forEach(t=>{const s=document.createElement('span');s.className='plot-tag';s.textContent=t;ts.appendChild(s);});beat.appendChild(ts);}
  if(p.children.length){const more=document.createElement('button');more.type='button';more.className='plot-beat-more';more.textContent=p.children.length+' nested idea'+(p.children.length===1?'':'s')+' →';more.onclick=e=>{e.stopPropagation();plotFocusId=p.id;renderPlotWorkspace();};beat.appendChild(more);}
  return beat;
}
function openPlotWorkspace(){normalizePlotData();if(activePlotId&&!plotIdea(activePlotId))activePlotId=null;if(plotFocusId&&!plotIdea(plotFocusId))plotFocusId=null;document.getElementById('plot-workspace').classList.add('open');document.getElementById('plot-workspace').setAttribute('aria-hidden','false');renderPlotWorkspace();}
function closePlotWorkspace(){closePlotDialog();document.getElementById('plot-workspace').classList.remove('open');document.getElementById('plot-workspace').setAttribute('aria-hidden','true');}
function togglePlotFilters(){document.getElementById('plot-filterbar').classList.toggle('open');}
function clearPlotFilters(){document.getElementById('plot-search').value='';document.getElementById('plot-tag-filter').value='';document.getElementById('plot-view-filter').value='all';document.getElementById('plot-sort').value='story';renderPlotWorkspace();}
async function init(){
  loadSettings();
  plotView=(settings.plotView==='board'||settings.plotView==='timeline')?settings.plotView:'tree';
  await loadProjectData();
  const savedName=localStorage.getItem('nw-name');
  if(savedName)document.getElementById('project-name').value=savedName;
  const theme=localStorage.getItem('nw-theme');
  if(theme==='dark')document.documentElement.dataset.theme='dark';
  updateThemeBtn();
  buildColorPicker();
  loadWritingStats();renderSidebar();render();applyAllSettings();applyTypewriterMode();initDrag();initChapterDrag();initVirtualScroll();
  initLocalBackup();
  startBackupNudgeWatcher();
  document.getElementById('project-name').addEventListener('input',()=>{noteTextEdit();scheduleSave();});
  const notesEdit=document.getElementById('chapter-notes-edit');
  if(notesEdit){
    wireMdEditable(notesEdit,{
      get:()=>activeChapter()?.notes||'',
      set:v=>{const ch=activeChapter();if(ch)ch.notes=v;}
    },{multiline:true,onInput:()=>scheduleSave()});
  }
  const nameEdit=document.getElementById('chapter-name-edit');
  const aliasesEdit=document.getElementById('chapter-aliases-edit');
  const tagInput=document.getElementById('chapter-tag-input');
  if(nameEdit){nameEdit.addEventListener('blur',saveChapterName);nameEdit.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();nameEdit.blur();}});}
  if(aliasesEdit){aliasesEdit.addEventListener('blur',saveChapterAliases);aliasesEdit.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();aliasesEdit.blur();}});}
  if(tagInput){
    tagInput.addEventListener('input',()=>updateTagAutocomplete(tagInput,chapterTags(activeChapter()),tag=>{addChapterTag(tag);tagInput.value='';tagInput.focus();}));
    tagInput.addEventListener('keydown',handleChapterTagKeydown);
    tagInput.addEventListener('blur',e=>{setTimeout(()=>{if(document.activeElement!==tagInput)hideTagAC();},120);if(e.currentTarget.value.trim()&&!tagAcOpen()){addChapterTag(e.currentTarget.value);e.currentTarget.value='';}});
  }
  loadNotesIntoUI();
}
// force=true always re-renders (chapter switch, undo/redo, import — the
// content genuinely needs to change under the user). Without force, skips
// re-rendering while the field is focused so incidental re-renders elsewhere
// (e.g. adding a block) don't clobber an in-progress edit or cursor position.
function loadNotesIntoUI(force){
  const ch = activeChapter();
  const el=document.getElementById('chapter-notes-edit');
  if(!el)return;
  if(!force&&document.activeElement===el)return;
  renderMarkdownInto(el,ch?.notes||'');
}
function loadSample(){
  const sb=[
    {type:'scene',text:'Chapter one — the morning of the last ordinary day'},
    {type:'prose',text:'The kitchen smelled of burnt coffee and something else — something that hadn\'t been there the week before. Mara stood at the window, watching the fog roll in off the harbour, her fingers wrapped around a mug that had long since gone cold.'},
    {type:'action',text:'She set it down without drinking.'},
    {type:'dialogue',text:'"You\'re staring again," said Eli from the doorway. He didn\'t look up from his phone.'},
    {type:'prose',text:'Outside, a heron picked its way along the dock, deliberate as a surgeon. It had been there every morning for three years. She\'d never once seen it catch anything.'},
    {type:'thought',text:'Maybe that was the whole point. Maybe patience was the thing she\'d been misreading all along.'},
    {type:'dialogue',text:'"Mara." His voice was softer this time.'},
    {type:'action',text:'She turned. He was looking at her now — really looking — and his phone was face-down on the counter.'},
    {type:'prose',text:'Whatever she had been about to say dissolved somewhere between her chest and her teeth. The fog had reached the window. The heron was gone.'},
  ].map((b,i)=>({...b,id:i}));
  nextBlockId=sb.length;
  collections=[
    {id:0,name:'My Novel',icon:'ti-books',open:true,chapters:[
      {id:0,name:'Chapter 1',blocks:sb,notes:''},
      {id:1,name:'Chapter 2',blocks:[],notes:''},
    ]},
    {id:1,name:'Characters',icon:'ti-users',open:false,chapters:[
      {id:2,name:'Mara',blocks:[],notes:''},
      {id:3,name:'Eli',blocks:[],notes:''},
    ]}
  ];
  nextCollId=2;nextChapterId=4;activeCollId=0;activeChapterId=0;
}
