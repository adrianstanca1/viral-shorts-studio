function lastFailure(entries=[],backlogId){return entries.find(x=>x?.backlogId===String(backlogId)&&x.status==='failed')||null}
function ageMinutes(value,now){const t=Date.parse(value||0);return Number.isFinite(t)?Math.max(0,(now-t)/60000):Infinity}

export function executionPreflight(items=[],{entries=[],validate=()=>true,now=Date.now(),failureCooldownMinutes=10}={}){
  const eligible=[],blocked=[];
  for(const item of items){
    const failed=lastFailure(entries,item?.id);
    if(failed&&ageMinutes(failed.createdAt,now)<failureCooldownMinutes){blocked.push({id:String(item.id),type:String(item.type||''),reason:'recent-failure-cooldown',retryAfterMinutes:Number((failureCooldownMinutes-ageMinutes(failed.createdAt,now)).toFixed(1))});continue}
    try{validate(item);eligible.push(item)}catch(e){blocked.push({id:String(item?.id||''),type:String(item?.type||''),reason:String(e.message||e).slice(0,180),retryAfterMinutes:0})}
  }
  return {eligible,blocked,summary:{total:items.length,eligible:eligible.length,blocked:blocked.length},policy:{detectOnly:true,autoMutate:false,autoPublish:false,freeOnly:true,failureCooldownMinutes}};
}

export function executionReliability(entries=[],{window=100}={}){
  const rows=(entries||[]).filter(x=>['completed','failed'].includes(x?.status)).slice(0,Math.max(1,Math.min(500,Number(window||100))));
  const completed=rows.filter(x=>x.status==='completed').length,failed=rows.filter(x=>x.status==='failed').length,total=completed+failed;
  return {window:rows.length,completed,failed,successRate:total?Number((completed/total*100).toFixed(1)):null,policy:{observedReceiptsOnly:true,guarantee:false}};
}