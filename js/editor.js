function parseInlineMd(text,revealLinkAt=null){
  const frag=document.createDocumentFragment();
  const linkRe=/\[\[([^\[\]]+?)\]\]/g;
  let last=0,m;
  while((m=linkRe.exec(text))){
    if(m.index>last)appendInlineEmphasis(frag,text.slice(last,m.index),last,revealLinkAt);
    const raw=m[1];
    const linkStart=m.index,linkEnd=m.index+ m[0].length;
    const reveal=typeof revealLinkAt==='number' && revealLinkAt>=linkStart && revealLinkAt<=linkEnd;
    const pipeIdx=raw.indexOf('|');
    const target=(pipeIdx>=0?raw.slice(0,pipeIdx):raw).trim();
    const display=pipeIdx>=0?raw.slice(pipeIdx+1):raw;
    const openMark=mdMark('[[',true);if(reveal)openMark.classList.add('md-mark-revealed');frag.appendChild(openMark);
    if(pipeIdx>=0){const targetMark=mdMark(target+'|',true);if(reveal)targetMark.classList.add('md-mark-revealed');frag.appendChild(targetMark);}
    const resolved=!!resolveLinkTarget(target);
    const a=document.createElement('span');
    a.className='md-link'+(resolved?'':' unresolved');
    a.dataset.target=target;
    a.title=resolved?'Cmd/Ctrl-click to open':'Cmd/Ctrl-click to create "'+target+'"';
    a.textContent=display;
    frag.appendChild(a);
    const closeMark=mdMark(']]',true);if(reveal)closeMark.classList.add('md-mark-revealed');frag.appendChild(closeMark);
    last=linkRe.lastIndex;
  }
  if(last<text.length)appendInlineEmphasis(frag,text.slice(last),last,revealLinkAt);
  return frag;
}
function appendInlineEmphasis(frag,text,baseOffset,revealLinkAt){
  const re=/\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*/g;
  let last=0,m;
  while((m=re.exec(text))){
    if(m.index>last)frag.appendChild(document.createTextNode(text.slice(last,m.index)));
    const matchStart=baseOffset+m.index,matchEnd=baseOffset+m.index+m[0].length;
    const reveal=typeof revealLinkAt==='number' && revealLinkAt>=matchStart && revealLinkAt<=matchEnd;
    if(m[1]!==undefined){
      const wrap=document.createElement('span');wrap.className='md-bold';
      const b=document.createElement('b');b.textContent=m[1];
      const openMark=mdMark('**',true);if(reveal)openMark.classList.add('md-mark-revealed');
      const closeMark=mdMark('**',true);if(reveal)closeMark.classList.add('md-mark-revealed');
      wrap.append(openMark,b,closeMark);
      frag.appendChild(wrap);
    } else if(m[2]!==undefined){
      const wrap=document.createElement('span');wrap.className='md-italic';
      const it=document.createElement('i');it.textContent=m[2];
      const openMark=mdMark('*',true);if(reveal)openMark.classList.add('md-mark-revealed');
      const closeMark=mdMark('*',true);if(reveal)closeMark.classList.add('md-mark-revealed');
      wrap.append(openMark,it,closeMark);
      frag.appendChild(wrap);
    }
    last=re.lastIndex;
  }
  if(last<text.length)frag.appendChild(document.createTextNode(text.slice(last)));
}
function mdMark(str,hidden){const s=document.createElement('span');s.className='md-mark'+(hidden?' md-mark-hidden':'');s.textContent=str;return s;}
function renderMarkdownInto(el,text,revealLinkAt=null){el.innerHTML='';el.appendChild(parseInlineMd(text||'',revealLinkAt));}
// ── Caret offset (character index within textContent) survives re-render ──
function getCaretOffset(el){
  const sel=window.getSelection();
  if(!sel.rangeCount)return null;
  const range=sel.getRangeAt(0);
  if(!el.contains(range.startContainer))return null;
  const pre=document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer,range.startOffset);
  return pre.toString().length;
}
// Finds the {node,offset} text position `offset` characters into el's textContent.
function locateOffset(el,offset){
  const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,null);
  let node,count=0;
  while((node=walker.nextNode())){
    const len=node.textContent.length;
    if(count+len>=offset)return{node,offset:Math.max(0,Math.min(len,offset-count))};
    count+=len;
  }
  return null;
}
function setCaretOffset(el,offset){
  if(offset==null)return;
  const pos=locateOffset(el,offset);
  const range=document.createRange();
  if(pos)range.setStart(pos.node,pos.offset);
  else range.selectNodeContents(el);
  range.collapse(true);
  const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
}
/** Client rect of the collapsed caret inside el, or null. Avoids DOM mutation. */
function getCaretClientRect(el){
  const sel=window.getSelection();
  if(!sel.rangeCount||!sel.isCollapsed)return null;
  const range=sel.getRangeAt(0);
  if(!el.contains(range.startContainer))return null;
  const rects=range.getClientRects();
  if(rects.length)return rects[0];
  // Collapsed at a boundary with no width: expand one character to get a line box.
  try{
    const r=range.cloneRange();
    const node=range.startContainer;
    if(node.nodeType===3){
      const len=node.textContent.length;
      if(range.startOffset<len){
        r.setEnd(node,range.startOffset+1);
        const rr=r.getClientRects();
        if(rr.length)return rr[0];
      }
      if(range.startOffset>0){
        r.setStart(node,range.startOffset-1);
        r.setEnd(node,range.startOffset);
        const rr=r.getClientRects();
        if(rr.length)return rr[0];
      }
    }
  }catch(e){}
  return null;
}
/** True when the caret sits on the first visual line of el (or el is empty). */
function isCaretOnFirstVisualLine(el){
  const off=getCaretOffset(el);
  if(off===0||off==null)return true;
  const full=document.createRange();
  full.selectNodeContents(el);
  const lineRects=[...full.getClientRects()];
  if(lineRects.length<=1)return true;
  const caret=getCaretClientRect(el);
  if(!caret)return off===0;
  return Math.abs(caret.top-lineRects[0].top)<8;
}
/** True when the caret sits on the last visual line of el (or el is empty). */
function isCaretOnLastVisualLine(el){
  const raw=el.textContent||'';
  const off=getCaretOffset(el);
  if(off!=null&&off>=raw.length)return true;
  const full=document.createRange();
  full.selectNodeContents(el);
  const lineRects=[...full.getClientRects()];
  if(lineRects.length<=1)return true;
  const caret=getCaretClientRect(el);
  if(!caret)return off!=null&&off>=raw.length;
  const last=lineRects[lineRects.length-1];
  return Math.abs(caret.top-last.top)<8;
}
function isCaretAtStart(el){const off=getCaretOffset(el);return off===0;}
function isCaretAtEnd(el){const off=getCaretOffset(el);return off!=null&&off>=(el.textContent||'').length;}
/**
 * Focus the main editable inside a chapter block. Handles virtualization by
 * scrolling the target into the estimated window first when needed.
 */
function focusBlockEditable(blockId,caretAtStart){
  const bs=blocks();
  const idx=bs.findIndex(b=>b.id===blockId);
  if(idx<0)return false;
  const writingArea=document.getElementById('writing-area');
  if(bs.length>VIRTUALIZE_THRESHOLD&&writingArea){
    const topH=sumHeights(bs,0,idx);
    writingArea.scrollTop=Math.max(0,topH-writingArea.clientHeight*0.35);
    renderBlocksVirtualized();
  }
  let el=document.querySelector(`.block-wrap[data-id="${blockId}"] [contenteditable="true"]`);
  if(!el){
    const input=document.querySelector(`.block-wrap[data-id="${blockId}"] .group-name-edit`);
    if(input){input.focus();if(typeof input.select==='function')input.select();return true;}
    return false;
  }
  el.focus();
  const len=(el.textContent||'').length;
  setCaretOffset(el,caretAtStart?0:len);
  focusedId=blockId;
  if(viewMode==='focus'||settings.typewriter)refreshFocusClasses();
  if(settings.typewriter)centerTypewriterCaret(el);
  else el.scrollIntoView({behavior:'smooth',block:'nearest'});
  return true;
}
/** Move focus to the next/previous chapter block from the current editable. */
function navigateAdjacentBlock(el,dir){
  const wrap=el.closest('.block-wrap');
  if(!wrap)return false;
  const id=parseInt(wrap.dataset.id,10);
  const bs=blocks();
  const idx=bs.findIndex(b=>b.id===id);
  if(idx<0)return false;
  let target=idx+dir;
  while(target>=0&&target<bs.length){
    const b=bs[target];
    // Image blocks without a caption field still get a focus attempt; skip
    // pure non-editable shells only if focus fails.
    if(focusBlockEditable(b.id,dir>0))return true;
    target+=dir;
  }
  return false;
}
/** Move focus to the next/previous plot idea editor currently in the DOM. */
function navigateAdjacentPlot(el,dir){
  const eds=[...document.querySelectorAll('#plot-workspace [contenteditable="true"][data-plot-id],#plot-workspace .plot-node-editor[contenteditable="true"],#plot-workspace .plot-card-editor[contenteditable="true"],#plot-workspace .plot-beat-editor[contenteditable="true"],#plot-workspace .plot-lane-title[contenteditable="true"]')];
  // Prefer explicit data-plot-id list when present.
  const withId=[...document.querySelectorAll('#plot-workspace [data-plot-id]')].filter(n=>n.isContentEditable||n.getAttribute('contenteditable')==='true');
  const list=withId.length?withId:eds;
  const i=list.indexOf(el);
  if(i<0)return false;
  const next=list[i+dir];
  if(!next)return false;
  next.focus();
  const len=(next.textContent||'').length;
  setCaretOffset(next,dir>0?0:len);
  const plotId=next.dataset.plotId||next.closest('[data-id]')?.dataset.id;
  if(plotId)activePlotId=plotId;
  next.scrollIntoView({behavior:'smooth',block:'nearest'});
  return true;
}
/**
 * Handle ArrowUp/Down/Left/Right at the edges of an editable so the user can
 * move between blocks (chapter editor) or plot ideas without leaving the
 * keyboard. Returns true when navigation was performed (and default prevented).
 */
function handleEdgeArrowNavigation(el,e){
  if(e.shiftKey||e.altKey||e.ctrlKey||e.metaKey)return false;
  const key=e.key;
  if(key!=='ArrowDown'&&key!=='ArrowUp'&&key!=='ArrowLeft'&&key!=='ArrowRight')return false;
  const sel=window.getSelection();
  if(sel&&!sel.isCollapsed)return false;
  if(wikilinkAcOpen())return false;
  const goingDown=key==='ArrowDown'||key==='ArrowRight';
  const goingUp=key==='ArrowUp'||key==='ArrowLeft';
  if(goingDown){
    const atEdge=key==='ArrowRight'?isCaretAtEnd(el):isCaretOnLastVisualLine(el);
    if(!atEdge)return false;
  }else if(goingUp){
    const atEdge=key==='ArrowLeft'?isCaretAtStart(el):isCaretOnFirstVisualLine(el);
    if(!atEdge)return false;
  }else return false;
  const inPlot=!!el.closest('#plot-workspace');
  const moved=inPlot?navigateAdjacentPlot(el,goingDown?1:-1):navigateAdjacentBlock(el,goingDown?1:-1);
  if(moved){e.preventDefault();e.stopPropagation();return true;}
  return false;
}
function getSelectionOffsets(el){
  const sel=window.getSelection();
  if(!sel.rangeCount)return null;
  const range=sel.getRangeAt(0);
  if(!el.contains(range.startContainer)||!el.contains(range.endContainer))return null;
  const preStart=document.createRange();preStart.selectNodeContents(el);preStart.setEnd(range.startContainer,range.startOffset);
  const preEnd=document.createRange();preEnd.selectNodeContents(el);preEnd.setEnd(range.endContainer,range.endOffset);
  return{start:preStart.toString().length,end:preEnd.toString().length};
}
function setSelectionRange(el,start,end){
  const startPos=locateOffset(el,start)||{node:el,offset:el.childNodes.length};
  const endPos=locateOffset(el,end)||{node:el,offset:el.childNodes.length};
  const range=document.createRange();
  range.setStart(startPos.node,startPos.offset);
  range.setEnd(endPos.node,endPos.offset);
  const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
}
function wrapSelection(el,getSet,marker){
  const off=getSelectionOffsets(el);
  if(!off||off.start===off.end)return;
  pushUndoSnapshot();
  const {start,end}=off;
  const raw=el.textContent;
  const mLen=marker.length;
  const before=raw.slice(0,start),selText=raw.slice(start,end),after=raw.slice(end);
  let newRaw,newStart,newEnd;
  if(selText.length>=2*mLen&&selText.startsWith(marker)&&selText.endsWith(marker)){
    const inner=selText.slice(mLen,selText.length-mLen);
    newRaw=before+inner+after;newStart=start;newEnd=start+inner.length;
  }else if(before.endsWith(marker)&&after.startsWith(marker)){
    newRaw=before.slice(0,before.length-mLen)+selText+after.slice(mLen);
    newStart=start-mLen;newEnd=end-mLen;
  }else{
    newRaw=before+marker+selText+marker+after;
    newStart=start+mLen;newEnd=end+mLen;
  }
  getSet.set(newRaw);
  renderMarkdownInto(el,newRaw);
  setSelectionRange(el,newStart,newEnd);
}
function wireMdEditable(el,getSet,opts){
  opts=opts||{};
  el.addEventListener('input',()=>{
    noteTextEdit();
    const raw=el.textContent;
    const offset=getCaretOffset(el);
    getSet.set(raw);
    renderMarkdownInto(el,raw,offset);
    setCaretOffset(el,offset);
    handleWikilinkAutocomplete(el,raw,offset);
    if(opts.onInput)opts.onInput();
  });
  el.addEventListener('focus',()=>{if(opts.onFocus)opts.onFocus();});
  const revealAtCaret=()=>{
    const sel=window.getSelection();
    if(!sel||sel.rangeCount===0||!el.contains(sel.anchorNode)||!el.contains(sel.focusNode))return;
    if(!sel.isCollapsed)return;
    const off=getCaretOffset(el);
    if(off!=null){const raw=el.textContent;renderMarkdownInto(el,raw,off);setCaretOffset(el,off);}
  };
  el.addEventListener('keyup',revealAtCaret);
  el.addEventListener('mouseup',()=>setTimeout(revealAtCaret,0));
  el.addEventListener('blur',()=>{
    if(applyingUndo){hideWikilinkAC();return;}
    const raw=el.textContent;
    getSet.set(raw);
    renderMarkdownInto(el,raw);
    hideWikilinkAC();
    if(opts.onBlur)opts.onBlur();
  });
  el.addEventListener('click',e=>{
    const link=e.target.closest('.md-link');
    if(link&&(e.metaKey||e.ctrlKey)){e.preventDefault();const target=link.dataset.target;const pp=plotIdea(target);if(pp){openPlotWorkspace();plotRevealNode(pp.id);}else openOrCreateChapterEntry(target);}
  });
  el.addEventListener('keydown',e=>{
    if(wikilinkAcOpen()){
      if(e.key==='Escape'){hideWikilinkAC();return;}
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();moveWikilinkAcSel(e.key==='ArrowDown'?1:-1);return;}
      if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();commitWikilinkAcSel(el,getSet);return;}
    }
    if(handleEdgeArrowNavigation(el,e))return;
    if(opts.multiline&&e.key==='Enter'&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey){
      e.preventDefault();
      noteTextEdit();
      const raw=el.textContent;
      const offset=getCaretOffset(el)??raw.length;
      const newRaw=raw.slice(0,offset)+'\n'+raw.slice(offset);
      getSet.set(newRaw);
      renderMarkdownInto(el,newRaw,offset+1);
      setCaretOffset(el,offset+1);
      if(opts.onInput)opts.onInput();
      return;
    }
    if((e.ctrlKey||e.metaKey)&&!e.altKey){
      if(e.key==='b'||e.key==='B'){e.preventDefault();wrapSelection(el,getSet,'**');return;}
      if(e.key==='i'||e.key==='I'){e.preventDefault();wrapSelection(el,getSet,'*');return;}
    }
    if(opts.onKeydown)opts.onKeydown(e);
  });
  el.__mdGetSet=getSet;
}
function handleWikilinkAutocomplete(el,raw,caretOffset){
  if(caretOffset==null){hideWikilinkAC();return;}
  const before=raw.slice(0,caretOffset);
  const m=/\[\[([^\[\]]*)$/.exec(before);
  if(!m){hideWikilinkAC();return;}
  acQuery=m[1];acStart=m.index;acAnchorEl=el;
  const q=acQuery.toLowerCase();
  const chapters=allChapters().filter(c=>c.name.toLowerCase().includes(q)||chapterAliases(c).some(a=>a.toLowerCase().includes(q))||chapterTags(c).some(t=>t.toLowerCase().includes(q))).map(c=>({...c,_plot:false}));
  const ideas=plotIdeas.filter(p=>(p.text||'').toLowerCase().includes(q)||p.id.toLowerCase().includes(q)||(p.tags||[]).some(t=>t.toLowerCase().includes(q))).map(p=>({id:p.id,name:(p.text||'').trim()||'Untitled idea',tags:p.tags||[],aliases:[],_plot:true}));
  acItems=[...chapters,...ideas].slice(0,12);
  acSel=0;
  showWikilinkAC();
}
function wikilinkAcOpen(){return document.getElementById('wikilink-ac').classList.contains('open');}
function hideWikilinkAC(){document.getElementById('wikilink-ac').classList.remove('open');acStart=null;}
function showWikilinkAC(){
  const pop=document.getElementById('wikilink-ac');
  pop.innerHTML='';
  acItems.forEach((c,idx)=>{
    const row=document.createElement('div');
    row.className='wac-item'+(idx===acSel?' sel':'');
    const dot=document.createElement('span');dot.className='wac-dot';dot.style.background=c._plot?'var(--thought-accent)':(CHAPTER_TYPE_COLORS[chapterType(c)]||'#999');
    const nm=document.createElement('span');nm.className='wac-name';nm.textContent=c.name||'Untitled';nm.title=c.name||'Untitled';
    row.append(dot,nm);
    if(c._plot){
      const id=document.createElement('span');id.className='wac-id';id.textContent=c.id;id.title=c.id;row.appendChild(id);
    }
    row.onmousedown=e=>{e.preventDefault();acSel=idx;commitWikilinkAcSel(acAnchorEl,acAnchorEl.__mdGetSet);};
    pop.appendChild(row);
  });
  if(acQuery){
    const create=document.createElement('div');
    create.className='wac-item wac-new'+(acSel===acItems.length?' sel':'');
    create.textContent='+ New entry "'+acQuery+'"';
    create.onmousedown=e=>{e.preventDefault();acSel=acItems.length;commitWikilinkAcSel(acAnchorEl,acAnchorEl.__mdGetSet);};
    pop.appendChild(create);
  }
  if(!acItems.length&&!acQuery){hideWikilinkAC();return;}
  const sel=window.getSelection();
  if(sel.rangeCount){
    const r=sel.getRangeAt(0).cloneRange();
    const rects=r.getClientRects();
    const rect=rects[0]||acAnchorEl.getBoundingClientRect();
    pop.style.left=Math.max(4,Math.min(rect.left,window.innerWidth-290))+'px';
    pop.style.top=(rect.bottom+4)+'px';
  }
  pop.classList.add('open');
}
function moveWikilinkAcSel(dir){
  const total=acItems.length+(acQuery?1:0);
  if(!total)return;
  acSel=(acSel+dir+total)%total;
  showWikilinkAC();
}
function commitWikilinkAcSel(el,getSet){
  const target=acItems[acSel];if(!target||acStart==null)return;
  const raw=el.textContent;const off=getCaretOffset(el)??raw.length;const before=raw.slice(0,off);const m=/\[\[([^\[\]]*)$/.exec(before);if(!m)return;
  const label=target.name||'';
  // Plot Idea links use the stable Plot Idea ID as their default visible text.
  // Do not inject an alias when a suggestion is accepted via Enter/Tab.
  const replacement=target._plot?'[['+target.id+']]' :'[['+label+']]';
  const newRaw=raw.slice(0,m.index)+replacement+raw.slice(off);
  getSet.set(newRaw);renderMarkdownInto(el,newRaw,m.index+replacement.length);setCaretOffset(el,m.index+replacement.length);hideWikilinkAC();
}
function openOrCreateChapterEntry(name){
  let entry=resolveLinkTarget(name);
  if(!entry){
    const coll=activeCollection()||collections[0];
    if(!coll)return;
    entry={id:nextChapterId++,name:name||'Untitled',type:'chapter',aliases:[],tags:[],blocks:[],notes:''};
    coll.chapters.push(entry);coll.open=true;
    renderSidebar();scheduleSave();
  }
  const coll=findChapterCollection(entry.id);
  if(coll)switchChapter(coll.id,entry.id);
}