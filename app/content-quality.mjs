const clean=s=>String(s||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
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
  if(beat==='hook'&&!/[?!]|\b(but|until|except|actually|hidden|missed|why|how)\b/i.test(t))score-=12;
  if(beat==='payoff'&&!/\b(so|because|therefore|ultimately|result|changed|meant|shows|explains)\b/i.test(t))score-=10;
  return Math.max(0,Math.round(score));
}
export function sceneAcceptance(score,beat='context'){
  const threshold=['hook','payoff','evidence'].includes(beat)?72:64;
  return {score:Number(score||0),threshold,accepted:Number(score||0)>=threshold};
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
