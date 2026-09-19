const TYPE_COLORS  = {prose:'#378ADD',dialogue:'#D85A30',action:'#639922',thought:'#7F77DD',scene:'#D4537E',image:'#C0A86B',custom:'#999999',group:'#bbbbbb'};
const TYPE_LABELS  = {prose:'prose',dialogue:'dialogue',action:'action',thought:'thought',scene:'scene meta',image:'image',custom:'custom',group:'group'};
const PLACEHOLDERS = {prose:'Begin writing prose...',dialogue:'"Character speaks..."',action:'A character does something.',thought:'A character thinks...',scene:'Scene / Chapter heading',image:'',custom:'Write here...',group:''};
const WIDTH_MAP    = {narrow:'540px',medium:'680px',wide:'860px'};
const LH_MAP       = {tight:'1.5',normal:'1.75',airy:'2.1'};
const COLL_ICONS   = ['ti-books','ti-users','ti-map','ti-bulb','ti-clipboard','ti-planet','ti-sword','ti-flask'];
const CUSTOM_COLORS= ['#E85D5D','#E8935D','#D4B84A','#6BAE5E','#5D9FE8','#8B6BE8','#D45DA0','#6B8E8E','#999999','#5A5A5A'];
const CHAPTER_TYPES       = ['chapter','character','location','item','custom'];
const CHAPTER_TYPE_LABELS = {chapter:'Chapter',character:'Character',location:'Location',item:'Item',custom:'Custom type'};
const CHAPTER_TYPE_COLORS = {chapter:'#8C8C8C',character:'#5D9FE8',location:'#6BAE5E',item:'#D4B84A',custom:'#999999'};
const PLOT_COLORS=[{id:'red',hex:'#E5484D'},{id:'orange',hex:'#F2994A'},{id:'amber',hex:'#D4B84A'},{id:'green',hex:'#6BAE5E'},{id:'teal',hex:'#3DB9A8'},{id:'blue',hex:'#5D9FE8'},{id:'purple',hex:'#9B6FE0'},{id:'pink',hex:'#E36BA6'}];
const PLOT_COLOR_HEX=Object.fromEntries(PLOT_COLORS.map(c=>[c.id,c.hex]));
function plotColorsActive(){return plotIdeas.some(p=>p&&p.color);}
function chapterType(ch){return CHAPTER_TYPES.includes(ch&&ch.type)?ch.type:'chapter';}
function chapterTypeLabel(ch){return chapterType(ch)==='custom'?(ch&&ch.customType||'Custom type'):CHAPTER_TYPE_LABELS[chapterType(ch)];}
function chapterAliases(ch){return Array.isArray(ch&&ch.aliases)?ch.aliases:[];}
function chapterTags(ch){return Array.isArray(ch&&ch.tags)?ch.tags:[];}
let collections=[], activeChapterId=null, activeCollId=null;
let nextCollId=0, nextChapterId=0, nextBlockId=0;
let acItems=[], acSel=0, acAnchorEl=null, acStart=null, acQuery='';
let viewMode='normal', showLabels=true, focusedId=null;
let pickerTargetId=null, saveTimer=null;
let dragId=null, dragOverIndex=null;
let chapDragId=null, chapDragOverIndex=null, chapDragCollId=null;
let settings={fontSize:17,width:'medium',lineHeight:'normal',eyes:true,eyeOrientation:'vertical',plotView:'tree'};
let pendingImageBlockId=null;
let plotIdeas=[],activePlotId=null,plotFocusId=null,plotCollapsed=new Set(),plotDragId=null,plotDragMode=null;
let plotView='tree';
let undoStack=[],redoStack=[];
const UNDO_LIMIT=50;
let applyingUndo=false;
let textEditOpen=false,textEditTimer=null;
const VIRTUALIZE_THRESHOLD=60;
const VIRTUALIZE_BUFFER_PX=1400;
const DEFAULT_BLOCK_HEIGHT={prose:120,dialogue:70,action:50,thought:70,scene:46,image:320,custom:90,group:34};
let blockHeights=new Map();
let blockDom=new Map();
let renderedChapterId;
let vwin={start:0,end:0};
let virtualTopSpacer=null,virtualBottomSpacer=null,virtualTrailingDz=null;
let dragForceFullWindow=false;
let scrollReflowQueued=false;
function estimatedHeight(b){return blockHeights.get(b.id)??(DEFAULT_BLOCK_HEIGHT[b.type]||90);}
function recordHeight(id,h){if(h>0)blockHeights.set(id,h);}
function sumHeights(bs,from,to){let s=0;for(let i=from;i<to;i++)s+=estimatedHeight(bs[i]);return s;}
function computeVirtualWindow(bs){
  const writingArea=document.getElementById('writing-area');
  const n=bs.length;
  if(!writingArea)return[0,n];
  const viewportH=writingArea.clientHeight||600;
  let scrolledIntoList=0;
  if(virtualTopSpacer&&virtualTopSpacer.isConnected){
    const waRect=writingArea.getBoundingClientRect();
    const tsRect=virtualTopSpacer.getBoundingClientRect();
    scrolledIntoList=Math.max(0,waRect.top-tsRect.top);
  }
  const from=scrolledIntoList-VIRTUALIZE_BUFFER_PX;
  const to=scrolledIntoList+viewportH+VIRTUALIZE_BUFFER_PX;
  let acc=0,start=0,end=n,foundStart=false;
  for(let i=0;i<n;i++){
    const h=estimatedHeight(bs[i]);
    if(!foundStart&&acc+h>=Math.max(0,from)){start=i;foundStart=true;}
    acc+=h;
    if(acc>=to){end=i+1;break;}
  }
  if(!foundStart)start=Math.max(0,n-1);
  start=Math.max(0,start-1);end=Math.min(n,end+1);
  return[start,end];
}
function initVirtualScroll(){
  const writingArea=document.getElementById('writing-area');
  if(!writingArea)return;
  writingArea.addEventListener('scroll',()=>{
    if(scrollReflowQueued)return;
    scrollReflowQueued=true;
    requestAnimationFrame(()=>{
      scrollReflowQueued=false;
      const bs=blocks();
      if(dragForceFullWindow||bs.length<=VIRTUALIZE_THRESHOLD)return;
      const[s,e]=computeVirtualWindow(bs);
      if(s!==vwin.start||e!==vwin.end)renderBlocksVirtualized();
    });
  },{passive:true});
}
function allChapters(){return collections.flatMap(c=>c.chapters);}
function activeChapter(){return allChapters().find(ch=>ch.id===activeChapterId);}
function activeCollection(){return collections.find(c=>c.id===activeCollId);}
function findChapterCollection(chapId){return collections.find(c=>c.chapters.some(ch=>ch.id===chapId));}
function blocks(){const ch=activeChapter();return ch?ch.blocks:[];}
function save(){
  localStorage.setItem('nw-active-ch',activeChapterId);
  localStorage.setItem('nw-active-coll',activeCollId);
  localStorage.setItem('nw-name',document.getElementById('project-name').value);
  persistProjectData();
  mirrorToLocalFile();
  markSaved();
}
function scheduleSave(){
  clearTimeout(saveTimer);saveTimer=setTimeout(save,800);
  if(!localBackupSupported)editsSinceExport++;
  markStale();
}
let saveStatus='saved';
function markStale(){
  if(saveStatus==='stale')return;
  saveStatus='stale';
  updateSaveStatusUI();
}
function markSaved(){
  saveStatus='saved';
  updateSaveStatusUI();
}
function updateSaveStatusUI(){
  const dot=document.getElementById('save-status-dot');
  if(dot){
    dot.classList.toggle('stale',saveStatus==='stale');
    dot.title=saveStatus==='stale'?'Unsaved changes \u2014 Ctrl+S to save now':'All changes saved';
  }
  applyBackupTitle();
}
function manualSave(){
  clearTimeout(saveTimer);
  save();
  if(!localBackupSupported){
    toast('Saved in this browser \u2014 no local file backup available here. Export a .json now and then to be safe.');
  }else if(localBackupStatus==='connected'){
    toast('Saved \u2014 mirroring to local file');
  }else if(localBackupStatus==='reconnect'){
    toast('Saved in this browser \u2014 reconnect the backup file to mirror to disk');
  }else{
    toast('Saved in this browser \u2014 no local backup file connected');
  }
}
const localBackupSupported=!!(window.showSaveFilePicker);
let localBackupHandle=null;
let localBackupStatus=localBackupSupported?'checking':'unsupported';
let localBackupWriting=false,localBackupPending=false;
const NW_IDB_NAME='nw-fs-handles',NW_IDB_STORE='handles';
function idbOpen(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(NW_IDB_NAME,1);
    req.onupgradeneeded=()=>{req.result.createObjectStore(NW_IDB_STORE);};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function idbSet(key,val){
  const db=await idbOpen();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(NW_IDB_STORE,'readwrite');
    tx.objectStore(NW_IDB_STORE).put(val,key);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });
}
async function idbGet(key){
  const db=await idbOpen();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(NW_IDB_STORE,'readonly');
    const req=tx.objectStore(NW_IDB_STORE).get(key);
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
async function idbDel(key){
  const db=await idbOpen();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(NW_IDB_STORE,'readwrite');
    tx.objectStore(NW_IDB_STORE).delete(key);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });
}
const NW_DATA_DB='nw-appdata',NW_DATA_STORE='kv';
const IDB_AVAILABLE=(()=>{try{return typeof indexedDB!=='undefined'&&indexedDB!==null;}catch(e){return false;}})();
let dataStoreBackend=IDB_AVAILABLE?'idb':'localStorage';
function dataIdbOpen(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(NW_DATA_DB,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(NW_DATA_STORE))req.result.createObjectStore(NW_DATA_STORE);};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function dataIdbSet(key,val){
  try{
    const db=await dataIdbOpen();
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(NW_DATA_STORE,'readwrite');
      tx.objectStore(NW_DATA_STORE).put(val,key);
      tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);
    });
  }catch(e){return false;}
}
async function dataIdbGet(key){
  const db=await dataIdbOpen();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(NW_DATA_STORE,'readonly');
    const req=tx.objectStore(NW_DATA_STORE).get(key);
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
let persistChain=Promise.resolve();
function persistProjectData(){
  const collectionsJson=JSON.stringify(collections);
  const plotIdeasJson=JSON.stringify(plotIdeas);
  persistChain=persistChain.then(async()=>{
    if(dataStoreBackend==='idb'){
      const[ok1,ok2]=await Promise.all([dataIdbSet('nw-collections',collectionsJson),dataIdbSet('nw-plot-ideas',plotIdeasJson)]);
      if(ok1&&ok2)return;
      dataStoreBackend='localStorage';
    }
    try{
      localStorage.setItem('nw-collections',collectionsJson);
      localStorage.setItem('nw-plot-ideas',plotIdeasJson);
    }catch(e){
      toast('Could not save — local storage is full. Export a .json backup now.');
    }
  });
}
async function loadProjectData(){
  let collectionsJson=null,plotIdeasJson=null;
  if(dataStoreBackend==='idb'){
    try{
      const[c,p]=await Promise.all([dataIdbGet('nw-collections'),dataIdbGet('nw-plot-ideas')]);
      collectionsJson=c||null;plotIdeasJson=p||null;
      if(collectionsJson==null){
        const legacy=localStorage.getItem('nw-collections');
        if(legacy){
          collectionsJson=legacy;
          plotIdeasJson=localStorage.getItem('nw-plot-ideas')||'[]';
          const[ok1,ok2]=await Promise.all([dataIdbSet('nw-collections',legacy),dataIdbSet('nw-plot-ideas',plotIdeasJson)]);
          if(ok1&&ok2){localStorage.removeItem('nw-collections');localStorage.removeItem('nw-plot-ideas');}
        }
      }
    }catch(e){dataStoreBackend='localStorage';}
  }
  if(dataStoreBackend==='localStorage'){
    collectionsJson=collectionsJson||localStorage.getItem('nw-collections');
    plotIdeasJson=plotIdeasJson||localStorage.getItem('nw-plot-ideas');
  }
  if(collectionsJson){
    try{
      collections=JSON.parse(collectionsJson);
      normalizeProjectData();
      nextCollId=Math.max(...collections.map(c=>c.id),-1)+1;
      nextChapterId=Math.max(...allChapters().map(ch=>ch.id),-1)+1;
      nextBlockId=Math.max(...allChapters().flatMap(ch=>(ch.blocks||[]).map(b=>b.id)),-1)+1;
      activeChapterId=parseInt(localStorage.getItem('nw-active-ch'),10);
      activeCollId=parseInt(localStorage.getItem('nw-active-coll'),10);
      if(!allChapters().some(ch=>ch.id===activeChapterId))activeChapterId=allChapters()[0]?.id??null;
      if(!collections.some(c=>c.id===activeCollId))activeCollId=findChapterCollection(activeChapterId)?.id??collections[0]?.id??null;
      if(!allChapters().length)loadSample();
    }catch(e){loadSample();}
  }else{loadSample();}
  if(plotIdeasJson){try{plotIdeas=JSON.parse(plotIdeasJson)||[];}catch(e){plotIdeas=[];}}
  normalizePlotData();
  normalizeProjectData();
}
async function initLocalBackup(){
  if(!localBackupSupported){updateBackupUI();return;}
  try{
    const handle=await idbGet('project-file');
    if(!handle){localBackupStatus='disconnected';updateBackupUI();return;}
    localBackupHandle=handle;
    const perm=await handle.queryPermission({mode:'readwrite'});
    if(perm==='granted'){
      localBackupStatus='connected';updateBackupUI();
      mirrorToLocalFile();
    }else{
      localBackupStatus='reconnect';updateBackupUI();
    }
  }catch(e){
    console.error('Local backup init failed',e);
    localBackupStatus='disconnected';updateBackupUI();
  }
}
async function connectLocalBackup(){
  if(!localBackupSupported)return;
  try{
    const suggested=(document.getElementById('project-name').value||'story').replace(/[^a-z0-9_\-\s]/gi,'_')+'.json';
    const handle=await window.showSaveFilePicker({
      suggestedName:suggested,
      types:[{description:'Narrative Writer backup',accept:{'application/json':['.json']}}]
    });
    localBackupHandle=handle;
    await idbSet('project-file',handle);
    localBackupStatus='connected';updateBackupUI();
    await mirrorToLocalFile();
    toast('Local backup connected \u2014 changes will mirror to this file');
  }catch(e){
    if(e.name!=='AbortError'){toast('Could not connect a backup file');console.error(e);}
  }
}
async function reconnectLocalBackup(){
  if(!localBackupHandle)return;
  try{
    const perm=await localBackupHandle.requestPermission({mode:'readwrite'});
    if(perm==='granted'){
      localBackupStatus='connected';updateBackupUI();
      await mirrorToLocalFile();
      toast('Local backup reconnected');
    }else{
      toast('Permission was not granted \u2014 backup file stays disconnected');
    }
  }catch(e){toast('Could not reconnect the backup file');console.error(e);}
}
function disconnectLocalBackup(){
  appConfirm('Stop mirroring writes to the local backup file? Your work stays saved in this browser either way.','Disconnect',async()=>{
    localBackupHandle=null;
    localBackupStatus='disconnected';
    try{await idbDel('project-file');}catch(e){}
    updateBackupUI();
    toast('Local backup disconnected');
  });
}
async function mirrorToLocalFile(){
  if(!localBackupSupported||localBackupStatus!=='connected'||!localBackupHandle)return;
  if(localBackupWriting){localBackupPending=true;return;}
  localBackupWriting=true;
  try{
    const name=document.getElementById('project-name').value||'story';
    const data=JSON.stringify({name,collections,plotIdeas},null,2);
    const writable=await localBackupHandle.createWritable();
    await writable.write(data);
    await writable.close();
  }catch(e){
    console.error('Local backup write failed',e);
    localBackupStatus='reconnect';updateBackupUI();
    toast('Local backup write failed \u2014 reconnect needed');
  }finally{
    localBackupWriting=false;
    if(localBackupPending){localBackupPending=false;mirrorToLocalFile();}
  }
}
let backupBaseTitle='';
function updateBackupUI(){
  const btn=document.getElementById('backup-status-btn');
  const icon=document.getElementById('backup-status-icon');
  const label=document.getElementById('backup-status-label');
  if(!btn)return;
  btn.classList.remove('b-connected','b-reconnect','b-unsupported');
  icon.className='ti ti-device-floppy';
  if(localBackupStatus==='unsupported'){
    btn.classList.add('b-unsupported');
    icon.className='ti ti-cloud-off';
    label.textContent='No auto-backup here';
    backupBaseTitle='This browser can\'t mirror writes to a local file. Click to export a .json backup now.';
  }else if(localBackupStatus==='checking'){
    label.textContent='Checking backup\u2026';
    backupBaseTitle='Checking local backup status\u2026';
  }else if(localBackupStatus==='disconnected'){
    label.textContent='Connect local backup';
    backupBaseTitle='Pick a file on disk to mirror every change to, as protection against data loss.';
  }else if(localBackupStatus==='reconnect'){
    btn.classList.add('b-reconnect');
    icon.className='ti ti-alert-triangle';
    label.textContent='Reconnect backup file';
    backupBaseTitle='Your browser needs a fresh click to re-grant write access to the backup file this session.';
  }else if(localBackupStatus==='connected'){
    btn.classList.add('b-connected');
    icon.className='ti ti-circle-check-filled';
    label.textContent='Local backup on';
    backupBaseTitle='Every change is mirrored to your backup file on disk. Click to change or disconnect it.';
  }
  applyBackupTitle();
}
function applyBackupTitle(){
  const btn=document.getElementById('backup-status-btn');
  if(!btn||!backupBaseTitle)return;
  const suffix=saveStatus==='stale'?' \u2014 unsaved changes':' \u2014 all changes saved';
  btn.title=backupBaseTitle+suffix;
}
function handleBackupClick(){
  if(localBackupStatus==='unsupported'){
    toast('Auto-backup isn\u2019t available here \u2014 exporting .json instead');
    setExportScope('all');doExport('json');return;
  }
  if(localBackupStatus==='disconnected')return connectLocalBackup();
  if(localBackupStatus==='reconnect')return reconnectLocalBackup();
  if(localBackupStatus==='connected')return disconnectLocalBackup();
}
let editsSinceExport=0,nudgeDismissedThisSession=false,backupNudgeTimer=null;
const NUDGE_CHECK_MS=60*1000,NUDGE_IDLE_THRESHOLD_MS=15*60*1000,NUDGE_MIN_EDITS=8;
function startBackupNudgeWatcher(){
  if(localBackupSupported)return;
  backupNudgeTimer=setInterval(checkBackupNudge,NUDGE_CHECK_MS);
}
function checkBackupNudge(){
  if(nudgeDismissedThisSession)return;
  const el=document.getElementById('backup-nudge');
  if(el.classList.contains('show'))return;
  const last=parseInt(localStorage.getItem('nw-last-export-at')||'0',10);
  if(editsSinceExport>=NUDGE_MIN_EDITS&&Date.now()-last>NUDGE_IDLE_THRESHOLD_MS){
    el.classList.add('show');
  }
}
function dismissBackupNudge(remindLater){
  document.getElementById('backup-nudge').classList.remove('show');
  if(remindLater){editsSinceExport=0;}
  else{nudgeDismissedThisSession=true;}
}
function exportFromNudge(){
  dismissBackupNudge(false);
  setExportScope('all');doExport('json');
}
function markBackupExported(){
  localStorage.setItem('nw-last-export-at',String(Date.now()));
  editsSinceExport=0;
}
function snapshotState(){
  return{
    collections:JSON.parse(JSON.stringify(collections)),
    plotIdeas:JSON.parse(JSON.stringify(plotIdeas)),
    activeChapterId,activeCollId,activePlotId,plotFocusId,
    projectName:document.getElementById('project-name').value
  };
}
function invalidateBlockDomCache(){
  for(const entry of blockDom.values()){
    entry.ro&&entry.ro.disconnect();
    entry.wrap.remove();
    entry.dz.remove();
  }
  blockDom.clear();
  virtualTopSpacer=null;
  virtualBottomSpacer=null;
  if(virtualTrailingDz){virtualTrailingDz.remove();virtualTrailingDz=null;}
  vwin={start:0,end:0};
}
function restoreSnapshot(snap){
  applyingUndo=true;
  // History replaces the entire model with cloned objects. Any cached block
  // DOM is therefore stale (its event handlers close over the old block
  // objects), even when the active chapter id is unchanged. Invalidate the
  // virtualization cache before rendering so undo/redo cannot resurrect or
  // edit pre-history state.
  invalidateBlockDomCache();
  collections=JSON.parse(JSON.stringify(snap.collections||[]));
  plotIdeas=JSON.parse(JSON.stringify(snap.plotIdeas||[]));
  normalizeProjectData();
  normalizePlotData();
  activeChapterId=snap.activeChapterId;
  activeCollId=snap.activeCollId;
  activePlotId=snap.activePlotId??null;
  plotFocusId=snap.plotFocusId??null;
  if(!allChapters().some(ch=>ch.id===activeChapterId))activeChapterId=allChapters()[0]?.id??null;
  if(!collections.some(c=>c.id===activeCollId))activeCollId=findChapterCollection(activeChapterId)?.id??collections[0]?.id??null;
  if(activePlotId&&!plotIdea(activePlotId))activePlotId=null;
  if(plotFocusId&&!plotIdea(plotFocusId))plotFocusId=null;
  document.getElementById('project-name').value=snap.projectName||'';
  renderSidebar();render();updateChapTitle();loadNotesIntoUI(true);
  if(document.getElementById('plot-workspace')?.classList.contains('open')){closePlotDialog();renderPlotWorkspace();}
  clearTimeout(saveTimer);
  save();
  applyingUndo=false;
}
function pushUndoSnapshot(){
  if(applyingUndo)return;
  textEditOpen=false;clearTimeout(textEditTimer);
  undoStack.push(snapshotState());
  if(undoStack.length>UNDO_LIMIT)undoStack.shift();
  redoStack=[];
}
function noteTextEdit(){
  if(applyingUndo)return;
  if(!textEditOpen){
    undoStack.push(snapshotState());
    if(undoStack.length>UNDO_LIMIT)undoStack.shift();
    redoStack=[];
    textEditOpen=true;
  }
  clearTimeout(textEditTimer);
  textEditTimer=setTimeout(()=>{textEditOpen=false;},1000);
}
function performUndo(){
  if(!undoStack.length){toast('Nothing to undo');return;}
  const current=snapshotState();
  const snap=undoStack.pop();
  redoStack.push(current);
  if(redoStack.length>UNDO_LIMIT)redoStack.shift();
  restoreSnapshot(snap);
  toast('Undo');
}
function performRedo(){
  if(!redoStack.length){toast('Nothing to redo');return;}
  const current=snapshotState();
  const snap=redoStack.pop();
  undoStack.push(current);
  if(undoStack.length>UNDO_LIMIT)undoStack.shift();
  restoreSnapshot(snap);
  toast('Redo');
}
function resolveLinkTarget(name){
  const n=(name||'').trim();
  if(!n)return null;
  const plot=plotIdeas.find(p=>p.id===n||p.id.toLowerCase()===n.toLowerCase());
  if(plot)return{...plot,_plot:true};
  return allChapters().find(ch=>ch.name.toLowerCase()===n.toLowerCase()||(ch.aliases||[]).some(a=>a.toLowerCase()===n.toLowerCase()));
}
// ── Init ──
function normalizeProjectData(){
  if(!Array.isArray(collections))collections=[];
  collections.forEach((coll,ci)=>{
    if(!coll||typeof coll!=='object')return;
    if(!Number.isFinite(coll.id))coll.id=ci;
    if(typeof coll.name!=='string')coll.name='Untitled Collection';
    if(typeof coll.icon!=='string')coll.icon=COLL_ICONS[ci%COLL_ICONS.length];
    if(!Array.isArray(coll.chapters))coll.chapters=[];
    coll.chapters.forEach((ch,chi)=>{
      if(!ch||typeof ch!=='object')return;
      if(!Number.isFinite(ch.id))ch.id=ci*10000+chi;
      if(typeof ch.name!=='string')ch.name='Untitled';
      if(!Array.isArray(ch.blocks))ch.blocks=[];
      if(!Array.isArray(ch.aliases))ch.aliases=[];
      if(!Array.isArray(ch.tags))ch.tags=[];
      if(typeof ch.notes!=='string')ch.notes='';
      ch.blocks.forEach((b,bi)=>{
        if(!b||typeof b!=='object')return;
        if(!Number.isFinite(b.id))b.id=bi;
        if(typeof b.type!=='string')b.type='prose';
        if(b.type!=='image'&&b.type!=='group'&&typeof b.text!=='string')b.text='';
      });
    });
  });
}
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
  renderSidebar();render();applyAllSettings();initDrag();initChapterDrag();initVirtualScroll();
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
function render(){
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
// scroll-triggered window shift — it never touches nodes for blocks whose
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
    wireMdEditable(p,{get:()=>b.text,set:v=>{b.text=v;scheduleSave();updateStats();}},{
      onFocus:()=>{focusedId=b.id;if(viewMode==='focus')refreshFocusClasses();},
      onBlur:()=>save(),
      onKeydown:e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();addBlock(b.type,i+1);}}
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
  wireMdEditable(p,{get:()=>b.text,set:v=>{b.text=v;scheduleSave();updateStats();}},{
    onFocus:()=>{focusedId=b.id;if(viewMode==='focus')refreshFocusClasses();},
    onBlur:()=>save(),
    onKeydown:e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();addBlock(b.type,i+1);}}
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
  // Level selector — small number badge
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
function updateStats(){
  const bs=blocks();
  const words=bs.reduce((a,b)=>a+(b.text||'').trim().split(/\s+/).filter(Boolean).length,0);
  document.getElementById('wc').textContent=words.toLocaleString();
  document.getElementById('bc').textContent=bs.length;
  document.getElementById('rt').textContent=Math.max(1,Math.round(words/200))+' min';
  document.getElementById('prog').style.width=Math.min(100,words/4)+'%';
  const totalWords=allChapters().reduce((a,ch)=>a+ch.blocks.reduce((x,b)=>x+(b.text||'').trim().split(/\s+/).filter(Boolean).length,0),0);
  const totalChaps=allChapters().length;
  document.getElementById('total-wc').textContent=totalChaps>1?`${totalWords.toLocaleString()} words total · ${totalChaps} chapters`:'';
  const bm=document.getElementById('beat-map');
  bm.innerHTML='';
  bs.forEach(b=>{
    const dot=document.createElement('div');dot.className='beat-dot';
    dot.style.background=b.type==='custom'?(b.color||'#999'):TYPE_COLORS[b.type]||'#999';
    dot.title=(b.text||'').substring(0,60);
    dot.onclick=()=>{const el=document.querySelector(`.block-wrap[data-id="${b.id}"]`);if(el)el.scrollIntoView({behavior:'smooth',block:'center'});};
    bm.appendChild(dot);
  });
}
function addBlock(type,afterIndex){
  const ch=activeChapter();if(!ch)return;
  pushUndoSnapshot();
  const defaults={prose:{text:''},dialogue:{text:''},action:{text:''},thought:{text:''},scene:{text:''},image:{src:'',caption:''},custom:{text:'',label:'Custom',color:'#999999'},group:{name:'Group',collapsed:false}};
  const nb={type,id:nextBlockId++,...(defaults[type]||{text:''})};
  if(afterIndex!==undefined)ch.blocks.splice(afterIndex,0,nb);
  else ch.blocks.push(nb);
  render();
  // For image blocks, immediately trigger upload
  if(type==='image'){
    setTimeout(()=>triggerImageUpload(nb.id),100);
  } else {
    setTimeout(()=>{
      const el=document.querySelector(`.block-wrap[data-id="${nb.id}"] [contenteditable]`);
      if(el){el.focus();el.scrollIntoView({behavior:'smooth',block:'center'});}
    },50);
  }
  save();
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
function toggleTheme(){
  const dark=document.documentElement.dataset.theme==='dark';
  document.documentElement.dataset.theme=dark?'':'dark';
  localStorage.setItem('nw-theme',dark?'':'dark');updateThemeBtn();
}
function updateThemeBtn(){
  const dark=document.documentElement.dataset.theme==='dark';
  document.getElementById('theme-btn').innerHTML=dark?'<i class="ti ti-sun"></i>':'<i class="ti ti-moon"></i>';
}
function isMobile(){return window.matchMedia('(max-width:600px)').matches;}
function openMobileSidebar(){
  document.getElementById('sidebar').classList.add('mobile-open');
  document.getElementById('sidebar-scrim').classList.add('show');
}
function closeMobileSidebar(){
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebar-scrim').classList.remove('show');
}
function toggleSidebar(){
  if(isMobile()){
    const sb=document.getElementById('sidebar');
    if(sb.classList.contains('mobile-open'))closeMobileSidebar();
    else openMobileSidebar();
    return;
  }
  document.getElementById('sidebar').classList.toggle('collapsed');
}
function loadSettings(){const s=localStorage.getItem('nw-settings');if(s){try{settings={...settings,...JSON.parse(s)};}catch(e){}}}
function saveSettings(){localStorage.setItem('nw-settings',JSON.stringify(settings));}
function applyAllSettings(){
  applyFontSize(settings.fontSize,false);applyWidth(settings.width,false);applyLineHeight(settings.lineHeight,false);
  document.getElementById('font-size-slider').value=settings.fontSize;
  document.getElementById('font-size-val').textContent=settings.fontSize+'px';
  setEyes(settings.eyes!==false,false);
  setEyeOrientation(settings.eyeOrientation||'vertical',false);
}
function setEyes(on,persist=true){
  settings.eyes=on;
  document.getElementById('eyes-on').classList.toggle('active',on);
  document.getElementById('eyes-off').classList.toggle('active',!on);
  document.getElementById('eye-widget').style.opacity=on?'1':'0';
  document.getElementById('eye-widget').style.pointerEvents='none';
  if(persist)saveSettings();
}
function setEyeOrientation(orient,persist=true){
  settings.eyeOrientation=orient;
  const widget=document.getElementById('eye-widget');
  const isVert=orient==='vertical';
  widget.style.flexDirection=isVert?'column':'row';
  document.getElementById('eyes-vert').classList.toggle('active',isVert);
  document.getElementById('eyes-horiz').classList.toggle('active',!isVert);
  if(persist)saveSettings();
}
function reapplySettings(){
  const fs=settings.fontSize;
  document.querySelectorAll('.type-prose [contenteditable],.type-dialogue [contenteditable]').forEach(el=>el.style.fontSize=fs+'px');
  document.querySelectorAll('.type-action [contenteditable],.type-thought [contenteditable],.type-custom [contenteditable]').forEach(el=>el.style.fontSize=(fs-1)+'px');
  const lh=LH_MAP[settings.lineHeight];
  document.querySelectorAll('.block-inner [contenteditable]').forEach(el=>el.style.lineHeight=lh);
}
function applyFontSize(val,persist=true){settings.fontSize=parseInt(val);document.getElementById('font-size-val').textContent=val+'px';reapplySettings();if(persist)saveSettings();}
function applyWidth(key,persist=true){settings.width=key;document.getElementById('editor').style.maxWidth=WIDTH_MAP[key];['narrow','medium','wide'].forEach(k=>document.getElementById('width-'+k).classList.toggle('active',k===key));if(persist)saveSettings();}
function applyLineHeight(key,persist=true){settings.lineHeight=key;document.querySelectorAll('.block-inner [contenteditable]').forEach(el=>el.style.lineHeight=LH_MAP[key]);['tight','normal','airy'].forEach(k=>document.getElementById('lh-'+k).classList.toggle('active',k===key));if(persist)saveSettings();}
function toggleSettings(){const panel=document.getElementById('settings-panel'),btn=document.getElementById('settings-btn');const open=panel.classList.toggle('open');btn.classList.toggle('active',open);}
let exportScope='chapter';
function toggleExportMenu(e){
  e.stopPropagation();
  const menu=document.getElementById('export-menu');
  const btn=document.getElementById('export-menu-btn');
  const isOpen=menu.classList.toggle('open');
  if(isOpen){
    const r=btn.getBoundingClientRect();
    const mh=280;
    let top=r.top-mh-6;
    if(top<6)top=r.bottom+6;
    menu.style.top=Math.max(6,top)+'px';
    let left=r.right+8;
    if(left+230>window.innerWidth)left=r.left-238;
    menu.style.left=Math.max(4,left)+'px';
  }
}
function closeExportMenu(){document.getElementById('export-menu').classList.remove('open');}
function setExportScope(scope){
  exportScope=scope;
  ['chapter','collection','all'].forEach(s=>{
    document.getElementById('exp-scope-'+s).classList.toggle('active',s===scope);
  });
}
function getScopeData(){
  const projName=(document.getElementById('project-name').value||'story').replace(/[^a-z0-9_\-\s]/gi,'_');
  if(exportScope==='chapter'){
    const ch=activeChapter();
    const coll=activeCollection();
    const label=(coll?coll.name+' - ':'')+(ch?ch.name:'chapter');
    const filename=projName+'_'+(ch?ch.name:'chapter').replace(/[^a-z0-9_\-\s]/gi,'_');
    return{chapters:ch?[ch]:[],label,filename};
  }
  if(exportScope==='collection'){
    const coll=activeCollection();
    const label=coll?coll.name:'collection';
    return{chapters:coll?coll.chapters:[],label,filename:projName+'_'+label.replace(/[^a-z0-9_\-\s]/gi,'_')};
  }
  return{chapters:allChapters().filter(ch=>chapterType(ch)==='chapter'),label:projName,filename:projName};
}
function blocksToTxt(chapters,imgMap){
  return chapters.map(ch=>{
    const h='─── '+ch.name+' ───';
    const body=ch.blocks.map(b=>{
      if(b.type==='scene')return'\n\u2014 '+b.text.toUpperCase()+' \u2014\n';
      if(b.type==='image')return'[Image: images/'+(imgMap&&imgMap[b.id]?imgMap[b.id]:'?')+(b.caption?' \u2014 '+b.caption:'')+']';
      if(b.type==='group'){const lvl=b.level||0;return'\n'+'#'.repeat(lvl+1)+' '+(b.name||'Group')+'\n';}
      if(b.type==='custom')return'['+(b.label||'Custom')+'] '+(b.text||'');
      return b.text||'';
    }).join('\n\n');
    return h+'\n\n'+body;
  }).join('\n\n\n');
}
async function compileTxtAsync(chapters,imgMap){
  const blockCount=chapters.reduce((n,ch)=>n+(ch.blocks?ch.blocks.length:0),0);
  if(blockCount<400)return blocksToTxt(chapters,imgMap);
  try{
    const{text}=await callAppWorker('compileTxt',{chapters:chaptersForWorker(chapters),imgMap});
    return text;
  }catch(e){
    return blocksToTxt(chapters,imgMap);
  }
}
async function doExport(format){
  closeExportMenu();
  const {chapters,label,filename}=getScopeData();
  if(!chapters.length){toast('Nothing to export');return;}
  if(format==='txt'){
    toast('Preparing export\u2026');
    const text=await compileTxtAsync(chapters,null);
    download(filename+'.txt',text,'text/plain');
    markBackupExported();
    toast('Exported '+label+' as .txt');
    return;
  }
  if(format==='json'){
    const name=document.getElementById('project-name').value||'story';
    if(exportScope==='all'){
      download(filename+'.json',JSON.stringify({name,collections,plotIdeas},null,2),'application/json');
    } else if(exportScope==='collection'){
      const coll=activeCollection();
      download(filename+'.json',JSON.stringify({name:label,collection:coll},null,2),'application/json');
    } else {
      const ch=activeChapter();
      download(filename+'.json',JSON.stringify({name:label,chapter:ch},null,2),'application/json');
    }
    markBackupExported();
    toast('Exported '+label+' as .json');
    return;
  }
  if(format==='zip'){
    if(typeof JSZip==='undefined'){toast('JSZip not loaded \u2014 check internet connection');return;}
    try{
      const zip=new JSZip();
      const imgFolder=zip.folder('images');
      let imgCounter=0;
      const imgMap={};
      chapters.forEach(chapter=>{
        chapter.blocks.filter(b=>b.type==='image'&&b.src).forEach(b=>{
          const ext=b.src.match(/data:image\/(\w+)/)?.[1]||'png';
          const fname='img_'+(++imgCounter)+'.'+ext;
          imgMap[b.id]=fname;
          imgFolder.file(fname,b.src.split(',')[1],{base64:true});
        });
      });
      zip.file(label+'.txt',await compileTxtAsync(chapters,imgMap));
      const notesContent=chapters.filter(c=>c.notes&&c.notes.trim()).map(c=>'=== '+c.name+' ===\n'+c.notes).join('\n\n');
      if(notesContent)zip.file('notes.txt',notesContent);
      if(exportScope==='all'){
        const name=document.getElementById('project-name').value||'story';
        zip.file('story.json',JSON.stringify({name,collections,plotIdeas},null,2));
      }
      const blob=await zip.generateAsync({type:'blob'});
      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download=filename+'.zip';a.click();
      markBackupExported();
      toast('Exported '+label+' as .zip');
    }catch(err){toast('Export failed: '+err.message);console.error(err);}
  }
}
function exportJson(){doExport('json');}
function importJson(){document.getElementById('import-input').click();}
function handleImport(e){
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const data=JSON.parse(ev.target.result);
      function remapChapter(ch){
        const newCh={...ch,id:nextChapterId++,blocks:(ch.blocks||[]).map(b=>({...b,id:nextBlockId++}))};
        return newCh;
      }
      function remapCollection(coll){
        return{...coll,id:nextCollId++,chapters:(coll.chapters||[]).map(remapChapter)};
      }
      if(data.collections){
        collections=data.collections;
        plotIdeas=Array.isArray(data.plotIdeas)?data.plotIdeas:[];
        normalizePlotData();
        if(data.name)document.getElementById('project-name').value=data.name;
                nextCollId=Math.max(...collections.map(c=>c.id))+1;
        nextChapterId=Math.max(...allChapters().map(ch=>ch.id),0)+1;
        nextBlockId=Math.max(...allChapters().flatMap(ch=>(ch.blocks||[]).map(b=>b.id)),0)+1;
        activeCollId=collections[0]?.id;
        activeChapterId=allChapters()[0]?.id;
        toast('Project imported');
      } else if(data.collection){
        const newColl=remapCollection(data.collection);
        collections.push(newColl);
        activeCollId=newColl.id;
        activeChapterId=newColl.chapters[0]?.id;
        toast('Collection "'+newColl.name+'" added');
      } else if(data.chapter){
        const coll=activeCollection();
        if(!coll){toast('No active collection to import into');return;}
        const newCh=remapChapter(data.chapter);
        coll.chapters.push(newCh);
        coll.open=true;
        activeChapterId=newCh.id;
        toast('Chapter "'+newCh.name+'" added to '+coll.name);
      } else if(data.chapters){
        const newColl=remapCollection({id:0,name:data.name||'Imported',icon:'ti-books',open:true,chapters:data.chapters});
        collections.push(newColl);
        activeCollId=newColl.id;
        activeChapterId=newColl.chapters[0]?.id;
        toast('Imported as new collection');
      } else if(data.blocks){
        const coll=activeCollection()||collections[0];
        const newCh=remapChapter({id:0,name:data.name||'Imported',blocks:data.blocks,notes:''});
        coll.chapters.push(newCh);
        coll.open=true;
        activeCollId=coll.id;
        activeChapterId=newCh.id;
        toast('Blocks imported as new chapter');
      } else {
        toast('Unrecognised format');return;
      }
      renderSidebar();render();
      loadNotesIntoUI(true);
      save();
    }catch(err){toast('Could not parse file');console.error(err);}
  };
  reader.readAsText(file);e.target.value='';
}
function download(filename,content,mime){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:mime}));a.download=filename;a.click();}
function importTxt(){document.getElementById('txt-import-input').click();}
function handleTxtImport(e){
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const text=ev.target.result;
    const normalised=text.replace(/\r\n/g,'\n').replace(/\r/g,'\n');
    const doubleCount=(normalised.match(/\n\n+/g)||[]).length;
    let paragraphs=doubleCount>0
      ? normalised.split(/\n{2,}/)
      : normalised.split('\n');
    paragraphs=paragraphs.map(p=>p.trim()).filter(p=>p.length>0);
    if(!paragraphs.length){toast('No paragraphs found');return;}
    const ch=activeChapter();if(!ch)return;
    const newBlocks=paragraphs.map(p=>({id:nextBlockId++,...classifyParagraph(p)}));
    ch.blocks.push(...newBlocks);
    render();save();
    toast('Imported '+newBlocks.length+' blocks');
  };
  reader.readAsText(file);e.target.value='';
}
function classifyParagraph(p){
  const trimmed=p.trim();
  const stripped=trimmed.replace(/[*_]/g,'');
  // Thought: *wrapped in asterisks*, or thought-verb at sentence start
  const isItalicWrapped=/^\*[^*]+\*$/.test(trimmed)||/^_[^_]+_$/.test(trimmed);
  const quotedThought=/^\*["\u201C\u2018'"]/.test(trimmed)||/^\*I\s/i.test(trimmed);
  const thoughtVerbs=/^(she|he|they|i|we)\s+(thought|wondered|realized|realised|knew|felt|remembered|imagined|hoped|feared|believed|mused|reflected|supposed|considered)/i.test(stripped);
  if(isItalicWrapped||quotedThought||thoughtVerbs)return{type:'thought',text:p};
  // Scene: mostly caps and short, or chapter/act/etc keyword
  const upperRatio=(stripped.match(/[A-Z]/g)||[]).length/(stripped.replace(/\s/g,'').length||1);
  const isAllCaps=upperRatio>0.55&&stripped.length>3&&stripped.length<80;
  const isSceneMarker=/^(chapter|part|scene|act|section|prologue|epilogue|interlude|book)\b/i.test(stripped)||/^[\u2014\u2013#]{1,3}\s/.test(trimmed);
  if(isAllCaps||isSceneMarker)return{type:'scene',text:p};
  // Dialogue: starts with quote char, or ends with speech attribution
  // Straight " and curly quotes: \u201C\u201D left/right double, \u2018\u2019 left/right single
  const startsQuote=/^["\u201C\u201D\u2018\u2019'`]/.test(trimmed);
  const endsAttributed=/["\u201C\u201D\u2018\u2019'][,.]?\s+(said|asked|replied|whispered|shouted|called|laughed|muttered|cried|yelled|answered|demanded|returned|chuckled|smiled)\b/i.test(trimmed);
  const quoteDensity=(trimmed.match(/["\u201C\u201D\u2018\u2019']/g)||[]).length/trimmed.length;
  if(startsQuote||endsAttributed||(quoteDensity>0.05&&trimmed.length<220))return{type:'dialogue',text:p};
  const isShortPunch=stripped.length<=90&&/^[A-Z]/.test(stripped)&&(stripped.match(/,/g)||[]).length<=1;
  if(isShortPunch)return{type:'action',text:p};
  return{type:'prose',text:p};
}
let confirmCallback=null;
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
// Confirm button action is bound directly in appConfirm().
// Global undo/redo/save — captured ahead of any element's own keydown handler
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