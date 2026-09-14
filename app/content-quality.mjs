const clean=s=>String(s||'').replace(/<[^>]+>/g,' ').replace(/(^|\s)#{1,6}\s+/g,' ').replace(/\[\.\.\.\]/g,' ').replace(/\s+/g,' ').trim();
const terms=s=>new Set(clean(s).toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>2));
const overlap=(a,b)=>{const A=terms(a),B=terms(b);let n=0;for(const t of A)if(B.has(t))n++;return n;};
export function sourceQuality(topic,source={}){
  const title=clean(source.title),extract=clean(source.extract),provider=String(source.provider||'');
  let score=Math.min(30,overlap(topic,`${title} ${extract}`)*5)+Math.min(20,extract.length/90);
  if(provider==='wikipedia')score+=8;
  if(/^https:\/\//.test(String(source.url||'')))score+=4;
  if(/\b(19|20)\d{2}\b/.test(extract))score+=3;
  return Math.round(Math.min(100,score));
}
export function rankSources(topic,sources=[]){
  return [...sources].map((s,i)=>({...s,qualityScore:sourceQuality(topic,s),_order:i}))
    .sort((a,b)=>b.qualityScore-a.qualityScore||a._order-b._order).map(({_order,...s})=>s);
}
export function rankFacts(topic,sources=[]){
  const seen=new Set(),out=[];
  for(const [sourceIndex,source] of sources.entries()){
    for(const sentence of clean(source.extract).split(/(?<=[.!?])\s+/)){
      if(sentence.length<45||sentence.length>360)continue;
      const key=sentence.toLowerCase().replace(/[^a-z0-9 ]/g,'').slice(0,150);if(seen.has(key))continue;seen.add(key);
      let score=Number(source.qualityScore||0)+Math.min(20,overlap(topic,sentence)*4);
      if(/\b\d+(?:\.\d+)?%?\b/.test(sentence))score+=5;
      if(/\b(19|20)\d{2}\b/.test(sentence))score+=4;
      out.push({text:sentence,sourceIndex,score:Math.round(score)});
    }
  }
  return out.sort((a,b)=>b.score-a.score);
}
export function narrationQuality(text,{beat='context'}={}){
  const t=clean(text),words=t.split(/\s+/).filter(Boolean);let score=100;
  if(words.length<7)score-=25;if(words.length>18)score-=Math.min(35,(words.length-18)*4);
  if(/^(this|it|they|he|she)\b/i.test(t))score-=8;
  if(!/[.!?]$/.test(t))score-=3;
  if(beat==='hook'&&!/[?!]|\b(but|until|except|actually|hidden|missed|why|how)\b|\b\d{2,4}\b/i.test(t))score-=12;
  if(beat==='payoff'&&!/\b(so|because|therefore|ultimately|result|changed|meant|shows|explains|response|responded|led|passed|act|law|policy)\b/i.test(t))score-=10;
  return Math.max(0,Math.round(score));
}
export function sceneAcceptance(score,beat='context'){
  const threshold=['hook','payoff','evidence'].includes(beat)?72:64;
  return {score:Number(score||0),threshold,accepted:Number(score||0)>=threshold};
}




export function repairNarration(scenes=[],sources=[],topic=''){
  const facts=rankFacts(topic,sources);
  const used=new Set();
  const validFact=f=>{
    const text=clean(f.text), words=text.split(/\s+/).filter(Boolean);
    if(words.length<7||words.length>16)return false;
    if((text.match(/\(/g)||[]).length!==(text.match(/\)/g)||[]).length)return false;
    if((text.match(/"/g)||[]).length%2)return false;
    return true;
  };
  return scenes.map((scene,i)=>{
    const original=clean(scene.narration), prev=clean(scenes[i-1]?.narration||'');
    const reasons=[]; let candidate=original, sourceIndex=scene.sourceIndex;
    if(scene.beat==='hook'&&narrationQuality(original,{beat:'hook'})<75)reasons.push('weak-hook');
    if(scene.beat==='payoff'&&narrationQuality(original,{beat:'payoff'})<75)reasons.push('weak-payoff');
    if(i>0&&overlap(original,prev)>=4)reasons.push('repetitive');
    if(reasons.length){
      const options=facts.filter(f=>!used.has(f.text)&&validFact(f)&&overlap(f.text,prev)<4);
      const fact=options.find(f=>Number(f.sourceIndex)===Number(scene.sourceIndex))||options[0];
      if(fact){
        const text=clean(fact.text);
        const before=narrationQuality(original,{beat:scene.beat}), after=narrationQuality(text,{beat:scene.beat});
        if(after>=before){candidate=text;sourceIndex=fact.sourceIndex;used.add(fact.text);}
      }
    }
    const before=narrationQuality(original,{beat:scene.beat}), after=narrationQuality(candidate,{beat:scene.beat});
    const changed=candidate!==original&&after>=before;
    return {...scene,narration:changed?candidate:original,sourceIndex:changed?sourceIndex:scene.sourceIndex,narrationRepair:{changed,reasons:changed?reasons:[],beforeScore:before,afterScore:changed?after:before}};
  });
}

export function fitNarrationBudget(scenes=[],targetDuration=60){
  if(!scenes.length)return [];
  const totalBudget=Math.max(scenes.length*7,Math.floor(Number(targetDuration||60)*3.35));
  const base=Math.max(7,Math.floor(totalBudget/scenes.length));
  let remaining=totalBudget;
  return scenes.map((scene,i)=>{
    const left=scenes.length-i, words=clean(scene.narration).split(/\s+/).filter(Boolean);
    const preferred=Math.min(Number(targetDuration)<=30?12:14,base+(['hook','payoff'].includes(scene.beat)?1:0));
    const reserve=Math.max(0,(left-1)*7),limit=Math.max(7,Math.min(preferred,remaining-reserve));
    let trimmed=words;
    if(words.length>limit){
      const firstClause=clean(scene.narration).split(/[,;:—–](?:\s+|$)/)[0].split(/\s+/).filter(Boolean);
      trimmed=firstClause.length>=7&&firstClause.length<=limit?firstClause:words.slice(0,limit);
      const dangling=/^(?:a|an|the|and|or|but|of|to|in|on|for|with|from|at|by|as|into|including|through|after|before)$/i;
      while(trimmed.length>7&&dangling.test(String(trimmed.at(-1)||'').replace(/[^a-z]/gi,'')))trimmed.pop();
    }
    remaining-=trimmed.length;
    let narration=trimmed.join(' ').replace(/[,:;]+$/,'');
    if(narration&&!/[.!?]$/.test(narration))narration+='.';
    return {...scene,narration,pacingBudget:{originalWords:words.length,finalWords:trimmed.length,maxWords:limit,trimmed:trimmed.length<words.length}};
  });
}

export function optimizePacing(scenes=[],targetDuration=60){
  if(!scenes.length)return [];
  const target=Math.max(scenes.length*2.2,Number(targetDuration)||60);
  const desired=scenes.map(s=>{
    const words=clean(s.narration).split(/\s+/).filter(Boolean).length;
    const beatBoost=['hook','payoff'].includes(s.beat)?0.25:0;
    return Math.max(2.2,Math.min(7.5,words/2.75+beatBoost));
  });
  const scale=target/desired.reduce((a,b)=>a+b,0);
  let durations=desired.map(x=>Math.max(2.2,Math.min(8.5,x*scale)));
  const sum=durations.reduce((a,b)=>a+b,0);
  if(sum>0){const correction=target/sum;durations=durations.map(x=>x*correction);}
  return scenes.map((s,i)=>{
    const durationHint=Number(durations[i].toFixed(2));
    const words=clean(s.narration).split(/\s+/).filter(Boolean).length;
    return {...s,durationHint,pacing:{words,targetWordsPerSecond:2.75,plannedWordsPerSecond:Number((words/durationHint).toFixed(2))}};
  });
}

export function retentionAnalysis(scenes=[]){
  const rows=scenes.map((s,i)=>{
    const words=clean(s.narration).split(/\s+/).filter(Boolean).length,duration=Math.max(.1,Number(s.duration||s.durationHint||1));
    const wps=Number((words/duration).toFixed(2));let risk=0;const reasons=[];
    if(wps>3.6){risk+=25;reasons.push('too-fast');}else if(wps<1.45){risk+=18;reasons.push('too-slow');}
    if(i>0&&overlap(s.narration,scenes[i-1]?.narration||'')>=4){risk+=18;reasons.push('repetitive');}
    if(s.beat==='hook'&&narrationQuality(s.narration,{beat:'hook'})<75){risk+=25;reasons.push('weak-hook');}
    if(s.beat==='payoff'&&narrationQuality(s.narration,{beat:'payoff'})<75){risk+=20;reasons.push('weak-payoff');}
    return {index:s.index,words,duration:Number(duration.toFixed(2)),wordsPerSecond:wps,risk:Math.min(100,risk),reasons};
  });
  const avgRisk=rows.length?rows.reduce((n,x)=>n+x.risk,0)/rows.length:100;
  return {score:Math.max(0,Math.round(100-avgRisk)),highRiskScenes:rows.filter(x=>x.risk>=25).map(x=>x.index),scenes:rows};
}
