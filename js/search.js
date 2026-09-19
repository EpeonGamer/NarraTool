let appWorker,appWorkerReqId=0;
const appWorkerPending=new Map();
function getAppWorker(){
  if(appWorker!==undefined)return appWorker;
  try{
    appWorker=new Worker('js/workers/app-worker.js');
    appWorker.onmessage=e=>{
      const{id,type,payload}=e.data||{};
      const pending=appWorkerPending.get(id);
      if(!pending)return;
      appWorkerPending.delete(id);
      if(type==='error')pending.reject(new Error((payload&&payload.message)||'Worker error'));
      else pending.resolve(payload);
    };
    appWorker.onerror=e=>{
      const pending=[...appWorkerPending.values()];
      appWorkerPending.clear();
      pending.forEach(p=>p.reject(new Error('Search worker failed')));
      appWorker=null;
    };
  }catch(e){appWorker=null;}
  return appWorker;
}
function callAppWorker(type,payload){
  const worker=getAppWorker();
  if(!worker)return Promise.reject(new Error('Web Worker unavailable'));
  return new Promise((resolve,reject)=>{
    const id=++appWorkerReqId;
    appWorkerPending.set(id,{resolve,reject});
    worker.postMessage({id,type,payload});
  });
}
function chaptersForWorker(chapters){
  return chapters.map(ch=>({
    id:ch.id,name:ch.name,aliases:ch.aliases||[],tags:ch.tags||[],notes:ch.notes||'',
    blocks:(ch.blocks||[]).map(b=>({
      id:b.id,type:b.type,text:b.text||'',name:b.name,label:b.label,caption:b.caption,level:b.level
    }))
  }));
}
let searchDebounceTimer=null,searchReqSeq=0;
function openGlobalSearch(){
  const overlay=document.getElementById('search-overlay');
  if(!overlay)return;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden','false');
  const input=document.getElementById('search-input');
  input.value='';
  document.getElementById('search-results').innerHTML='<div class="search-empty search-hint">Search chapters, blocks, and plot ideas</div>';
  setTimeout(()=>input.focus(),0);
}
function closeGlobalSearch(){
  const overlay=document.getElementById('search-overlay');
  if(!overlay)return;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden','true');
}
function onGlobalSearchInput(){
  clearTimeout(searchDebounceTimer);
  const q=document.getElementById('search-input').value;
  if(!q.trim()){
    document.getElementById('search-results').innerHTML='<div class="search-empty search-hint">Search chapters, blocks, and plot ideas</div>';
    return;
  }
  searchDebounceTimer=setTimeout(()=>runGlobalSearch(q),150);
}
function handleGlobalSearchKeydown(e){
  if(e.key==='Escape'){e.preventDefault();closeGlobalSearch();}
}
async function runGlobalSearch(q){
  const mySeq=++searchReqSeq;
  const resultsEl=document.getElementById('search-results');
  resultsEl.innerHTML='<div class="search-empty">Searching…</div>';
  const payload={
    chapters:chaptersForWorker(allChapters()),
    plotIdeas:plotIdeas.map(p=>({id:p.id,text:p.text||'',tags:p.tags||[]})),
    query:q
  };
  let matches;
  try{
    ({matches}=await callAppWorker('search',payload));
  }catch(e){
    matches=searchInMainThreadFallback(payload);
  }
  if(mySeq!==searchReqSeq)return;
  renderSearchResults(matches,q);
}
function searchInMainThreadFallback({chapters,plotIdeas,query}){
  const q=(query||'').trim().toLowerCase();
  if(!q)return[];
  const out=[];
  const add=(kind,extra,path,text)=>{
    const idx=text.toLowerCase().indexOf(q);
    if(idx!==-1)out.push({
      kind,...extra,path,
      snippet:text.slice(Math.max(0,idx-50),idx+q.length+60)
    });
  };
  chapters.forEach(ch=>{
    add('chapter',{chapterId:ch.id},ch.name,ch.name);
    (ch.aliases||[]).forEach(a=>add('chapter',{chapterId:ch.id},ch.name,a));
    ch.blocks.forEach(b=>{
      const text=b.type==='group'?(b.name||''):(b.text||'');
      add('block',{chapterId:ch.id,blockId:b.id},ch.name,text);
    });
  });
  (plotIdeas||[]).forEach(p=>{
    add('plot',{plotId:p.id},'Plot idea',p.text||'');
    (p.tags||[]).forEach(tag=>add('plot',{plotId:p.id},'Plot idea',tag));
  });
  return out.slice(0,200);
}
function renderSearchResults(matches,q){
  const resultsEl=document.getElementById('search-results');
  resultsEl.innerHTML='';
  if(!matches.length){
    resultsEl.innerHTML='<div class="search-empty">No matches</div>';
    return;
  }
  matches.forEach(m=>{
    const item=document.createElement('button');
    item.type='button';
    item.className='search-result-item';
    const path=document.createElement('div');
    path.className='search-result-path';
    path.textContent=m.kind==='plot'?'Plot Workspace':m.path;
    const snippet=document.createElement('div');
    snippet.className='search-result-snippet';
    snippet.appendChild(highlightMatch(m.snippet||'',q));
    item.append(path,snippet);
    item.onclick=()=>goToSearchResult(m);
    resultsEl.appendChild(item);
  });
}
function highlightMatch(text,q){
  const frag=document.createDocumentFragment();
  const ql=(q||'').trim().toLowerCase();
  if(!ql){frag.appendChild(document.createTextNode(text));return frag;}
  const lower=text.toLowerCase();
  let i=0;
  while(i<text.length){
    const idx=lower.indexOf(ql,i);
    if(idx===-1){frag.appendChild(document.createTextNode(text.slice(i)));break;}
    if(idx>i)frag.appendChild(document.createTextNode(text.slice(i,idx)));
    const mark=document.createElement('mark');
    mark.textContent=text.slice(idx,idx+ql.length);
    frag.appendChild(mark);
    i=idx+ql.length;
  }
  return frag;
}
function goToSearchResult(m){
  closeGlobalSearch();
  if(m.kind==='plot'){
    openPlotWorkspace();
    plotRevealNode(m.plotId);
    return;
  }
  const ch=allChapters().find(c=>c.id===m.chapterId);
  if(!ch)return;
  const coll=findChapterCollection(ch.id);
  switchChapter(coll?coll.id:activeCollId,ch.id);
  if(m.blockId!=null){
    setTimeout(()=>{
      const el=document.querySelector(`.block-wrap[data-id="${m.blockId}"] [contenteditable]`)||
        document.querySelector(`.block-wrap[data-id="${m.blockId}"]`);
      if(el)el.scrollIntoView({behavior:'smooth',block:'center'});
    },100);
  }
}
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='k'){
    e.preventDefault();
    e.stopPropagation();
    openGlobalSearch();
  }
},true);
document.addEventListener('click',e=>{
  const overlay=document.getElementById('search-overlay');
  if(overlay&&e.target===overlay)closeGlobalSearch();
});