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