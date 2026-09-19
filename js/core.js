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
let settings={fontSize:17,width:'medium',lineHeight:'normal',eyes:true,eyeOrientation:'vertical',plotView:'tree',typewriter:false};
let statsScope='chapter';
let writingStats={goal:500,sessionWords:0,sessionDate:'',daily:{},streakGap:0};
let typewriterCenterQueued=false;
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