self.onmessage = function(event){
  const {id,type,payload} = event.data || {};
  try{
    if(type === 'search'){
      self.postMessage({id,type:'result',payload:{matches:search(payload||{})}});
      return;
    }
    if(type === 'compileTxt'){
      self.postMessage({id,type:'result',payload:{text:compileTxt(payload||{})}});
      return;
    }
    throw new Error('Unknown worker operation: '+type);
  }catch(error){
    self.postMessage({
      id,
      type:'error',
      payload:{message:error&&error.message?error.message:String(error)}
    });
  }
};

function search({chapters=[],plotIdeas=[],query=''}){
  const q=String(query||'').trim().toLowerCase();
  if(!q)return[];
  const out=[];
  const add=(kind,extra,path,text)=>{
    const value=String(text||'');
    const idx=value.toLowerCase().indexOf(q);
    if(idx===-1)return;
    out.push({
      kind,
      ...extra,
      path,
      snippet:value.slice(Math.max(0,idx-50),idx+q.length+60)
    });
  };

  chapters.forEach(ch=>{
    add('chapter',{chapterId:ch.id},ch.name,ch.name);
    (ch.aliases||[]).forEach(alias=>add('chapter',{chapterId:ch.id},ch.name,alias));
    (ch.tags||[]).forEach(tag=>add('chapter',{chapterId:ch.id},ch.name,tag));
    add('chapter',{chapterId:ch.id},ch.name,ch.notes||'');

    (ch.blocks||[]).forEach(b=>{
      const text=b.type==='group'?(b.name||''):(b.text||'');
      add('block',{chapterId:ch.id,blockId:b.id},ch.name,text);
      if(b.type==='custom')add('block',{chapterId:ch.id,blockId:b.id},ch.name,b.label||'Custom');
      if(b.type==='image')add('block',{chapterId:ch.id,blockId:b.id},ch.name,b.caption||'');
    });
  });

  plotIdeas.forEach(p=>{
    add('plot',{plotId:p.id},'Plot idea',p.text||'');
    (p.tags||[]).forEach(tag=>add('plot',{plotId:p.id},'Plot idea',tag));
  });

  return out.slice(0,200);
}

function compileTxt({chapters=[],imgMap={}}){
  return chapters.map(ch=>{
    const h='─── '+ch.name+' ───';
    const body=(ch.blocks||[]).map(b=>{
      if(b.type==='scene')return'\n— '+String(b.text||'').toUpperCase()+' —\n';
      if(b.type==='image')return'[Image: images/'+(imgMap&&imgMap[b.id]?imgMap[b.id]:'?')+(b.caption?' — '+b.caption:'')+']';
      if(b.type==='group'){
        const lvl=b.level||0;
        return'\n'+'#'.repeat(lvl+1)+' '+(b.name||'Group')+'\n';
      }
      if(b.type==='custom')return'['+(b.label||'Custom')+'] '+(b.text||'');
      return b.text||'';
    }).join('\n\n');
    return h+'\n\n'+body;
  }).join('\n\n\n');
}
