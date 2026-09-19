function countWords(text){return String(text||'').trim().split(/\s+/).filter(Boolean).length;}
function dateKey(d=new Date()){return d.toISOString().slice(0,10);}
function loadWritingStats(){
  try{
    const raw=localStorage.getItem('nw-writing-stats');
    if(raw){
      const parsed=JSON.parse(raw)||{};
      writingStats={...writingStats,...parsed,daily:{...(parsed.daily||{})}};
      writingStats.streakGap=Math.max(0,Math.min(30,parseInt(parsed.streakGap,10)||0));
    }
  }catch(e){}
  // Only retain days on which writing actually happened. Keep a bounded rolling
  // window so streak metadata cannot grow with the age of the manuscript.
  const keys=Object.keys(writingStats.daily||{}).filter(k=>writingStats.daily[k]>0).sort().slice(-366);
  const keep={};keys.forEach(k=>keep[k]=writingStats.daily[k]);writingStats.daily=keep;
  const today=dateKey();
  if(writingStats.sessionDate!==today){writingStats.sessionDate=today;writingStats.sessionWords=0;}
}
function saveWritingStats(){try{localStorage.setItem('nw-writing-stats',JSON.stringify(writingStats));}catch(e){}}
function recordWritingWords(delta){
  const n=Math.max(0,Number(delta)||0);if(!n)return;
  const today=dateKey();
  if(writingStats.sessionDate!==today){writingStats.sessionDate=today;writingStats.sessionWords=0;}
  writingStats.sessionWords=(writingStats.sessionWords||0)+n;
  writingStats.daily[today]=(writingStats.daily[today]||0)+n;
  const keys=Object.keys(writingStats.daily).filter(k=>writingStats.daily[k]>0).sort().slice(-366);const keep={};keys.forEach(k=>keep[k]=writingStats.daily[k]);writingStats.daily=keep;
  saveWritingStats();updateStats();if(document.getElementById('stats-modal')?.classList.contains('open'))renderStatsModal();
}
function dayDiff(a,b){return Math.round((new Date(a+'T00:00:00Z')-new Date(b+'T00:00:00Z'))/86400000);}
function computeStreak(){
  const days=Object.keys(writingStats.daily||{}).filter(k=>writingStats.daily[k]>0).sort();
  if(!days.length)return 0;
  const today=dateKey();
  const gap=Math.max(0,parseInt(writingStats.streakGap,10)||0);
  const latest=days[days.length-1];
  if(dayDiff(today,latest)>gap+1)return 0;
  let streak=1;
  for(let i=days.length-1;i>0;i--){
    const diff=dayDiff(days[i],days[i-1]);
    if(diff>gap+1)break;
    streak++;
  }
  return streak;
}
function readabilityScore(text){
  const raw=String(text||'').trim();if(!raw)return null;
  const words=countWords(raw);const sentences=Math.max(1,(raw.match(/[.!?]+(?:\s|$)/g)||[]).length);
  const syllables=raw.toLowerCase().replace(/[^a-z\s']/g,' ').split(/\s+/).filter(Boolean).reduce((n,w)=>n+estimateSyllables(w),0);
  if(!words)return null;
  return Math.max(0,Math.min(120,206.835-1.015*(words/sentences)-84.6*(syllables/words)));
}
function estimateSyllables(word){
  let w=String(word||'').toLowerCase().replace(/[^a-z]/g,'');if(!w)return 0;
  if(w.length<=3)return 1;
  w=w.replace(/(?:[^aeiouy]e)$/,'').replace(/^y/,'');
  const m=w.match(/[aeiouy]+/g);return Math.max(1,m?m.length:1);
}
function readabilityLabel(score){if(score==null)return '';if(score>=90)return 'Very easy';if(score>=80)return 'Easy';if(score>=70)return 'Fairly easy';if(score>=60)return 'Standard';if(score>=50)return 'Fairly difficult';if(score>=30)return 'Difficult';return 'Very difficult';}
function getStatsTarget(){
  if(statsScope==='collection'){
    const coll=activeCollection();return {name:coll?.name||'Collection',words:(coll?.chapters||[]).reduce((n,ch)=>n+ch.blocks.reduce((x,b)=>x+countWords(b.text),0),0),text:(coll?.chapters||[]).flatMap(ch=>ch.blocks.map(b=>b.text||'')).join('\n')};
  }
  const ch=activeChapter();return {name:ch?.name||'Chapter',words:(ch?.blocks||[]).reduce((n,b)=>n+countWords(b.text),0),text:(ch?.blocks||[]).map(b=>b.text||'').join('\n')};
}
function setStatsScope(scope){statsScope=scope==='collection'?'collection':'chapter';['chapter','collection'].forEach(x=>document.getElementById('stats-scope-'+x)?.classList.toggle('active',x===statsScope));renderStatsModal();}
function openStats(){loadWritingStats();document.getElementById('stats-modal').classList.add('open');document.getElementById('stats-modal').setAttribute('aria-hidden','false');renderStatsModal();document.getElementById('session-goal-input')?.focus();}
function closeStats(){const m=document.getElementById('stats-modal');m.classList.remove('open');m.setAttribute('aria-hidden','true');}
function saveSessionGoal(){const input=document.getElementById('session-goal-input');const goal=Math.max(1,parseInt(input.value,10)||500);writingStats.goal=goal;saveWritingStats();renderStatsModal();}
function saveStreakGap(){const input=document.getElementById('streak-gap-input');writingStats.streakGap=Math.max(0,Math.min(30,parseInt(input?.value,10)||0));saveWritingStats();renderStatsModal();}
function renderStatsModal(){
  const target=getStatsTarget();const score=readabilityScore(target.text);const all=allChapters();
  const allWords=all.reduce((n,ch)=>n+ch.blocks.reduce((x,b)=>x+countWords(b.text),0),0);
  document.getElementById('stats-subtitle').textContent=target.name;
  document.getElementById('stats-words').textContent=target.words.toLocaleString();
  document.getElementById('stats-reading').textContent=Math.max(1,Math.ceil(target.words/200))+' min';
  document.getElementById('stats-readability').textContent=score==null?'—':score.toFixed(0);
  document.getElementById('stats-readability-label').textContent=readabilityLabel(score);
  document.getElementById('session-goal-input').value=writingStats.goal||500;
  document.getElementById('streak-gap-input').value=Math.max(0,Math.min(30,writingStats.streakGap||0));
  document.getElementById('stats-session').textContent=(writingStats.sessionWords||0).toLocaleString()+' / '+(writingStats.goal||500).toLocaleString();
  document.getElementById('stats-session-progress').style.width=Math.min(100,((writingStats.sessionWords||0)/(writingStats.goal||500))*100)+'%';
  const streak=computeStreak();document.getElementById('stats-streak-count').textContent=streak;document.getElementById('stats-streak-label').textContent=streak===1?'day':'days';
  const today=writingStats.daily[dateKey()]||0;const gap=writingStats.streakGap||0;document.getElementById('stats-streak-detail').textContent=today?`${today.toLocaleString()} words today${gap?` · ${gap} day gap allowed`:''}`:(gap?`Up to ${gap} missed day${gap===1?'':'s'} allowed`:'Write today to start your streak');
  document.getElementById('stats-all-words').textContent=allWords.toLocaleString();document.getElementById('stats-all-chapters').textContent=all.length.toLocaleString();document.getElementById('stats-all-reading').textContent=Math.max(1,Math.ceil(allWords/200))+' min';
}
function centerTypewriterCaret(el){
  if(!settings.typewriter||!el||document.activeElement!==el)return;
  requestAnimationFrame(()=>{
    const area=document.getElementById('writing-area');if(!area)return;
    const sel=window.getSelection();let rect=null;
    if(sel&&sel.rangeCount){const r=sel.getRangeAt(0);const rs=r.getClientRects();if(rs.length)rect=rs[rs.length-1];}
    if(!rect){const b=el.closest('.block-wrap');if(b)rect=b.getBoundingClientRect();}
    if(!rect)return;
    const ar=area.getBoundingClientRect();const delta=(rect.top+rect.height/2)-(ar.top+ar.height/2);
    if(Math.abs(delta)>2)area.scrollBy({top:delta,behavior:'smooth'});
  });
}
function toggleTypewriterMode(){settings.typewriter=!settings.typewriter;document.body.classList.toggle('typewriter-mode',settings.typewriter);document.getElementById('typewriter-btn')?.classList.toggle('active',settings.typewriter);saveSettings();if(settings.typewriter){const el=document.activeElement;if(el?.matches('[contenteditable="true"]'))centerTypewriterCaret(el);}}
function applyTypewriterMode(){document.body.classList.toggle('typewriter-mode',!!settings.typewriter);document.getElementById('typewriter-btn')?.classList.toggle('active',!!settings.typewriter);}
function updateStats(){
  const bs=blocks();
  const words=bs.reduce((a,b)=>a+countWords(b.text),0);
  document.getElementById('wc').textContent=words.toLocaleString();
  document.getElementById('bc').textContent=bs.length;
  document.getElementById('rt').textContent=Math.max(1,Math.round(words/200))+' min';
  document.getElementById('prog').style.width=Math.min(100,words/4)+'%';
  const totalWords=allChapters().reduce((a,ch)=>a+ch.blocks.reduce((x,b)=>x+countWords(b.text),0),0);
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
