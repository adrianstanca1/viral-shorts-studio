export function reconcileExecutions(entries=[],{loadProject=()=>null,getCampaign=()=>null}={}){
  const findings=[];
  for(const entry of entries){
    if(entry?.status!=='completed'||!entry.output?.type||!entry.output?.id)continue;
    const exists=entry.output.type==='project'?!!loadProject(entry.output.id):entry.output.type==='campaign'?!!getCampaign(entry.output.id):true;
    if(!exists)findings.push({executionId:entry.id,backlogId:entry.backlogId||null,outputType:entry.output.type,outputId:entry.output.id,severity:'warning',reason:'completed execution references missing output'});
  }
  return {checked:entries.filter(x=>x?.status==='completed').length,findings,healthy:findings.length===0,policy:{detectOnly:true,autoRepair:false,autoPublish:false}};
}
