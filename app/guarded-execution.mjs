const supportedTypes=new Set(['repurpose-winner','produce-follow-up','platform-focus','creative-focus']);

export function validateBacklogExecution(item,{loadProject=()=>null}={}){
  if(!item||!item.id)throw Error('invalid backlog item');
  if(!supportedTypes.has(item.type))throw Error('this backlog action has no guarded executor yet');
  if(item.type==='repurpose-winner'){
    if(!item.projectId)throw Error('repurpose backlog item is missing projectId');
    if(!loadProject(item.projectId))throw Error('source project not found');
  }
  return true;
}

export function guardedExecutionTypes(){return [...supportedTypes]}
