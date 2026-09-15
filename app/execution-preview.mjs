import crypto from 'node:crypto';

export function guardedExecutionPreview(items=[],{activeJobs=0,limit=2,maxActive=5,maxPerBatch=3}={}){
  const requested=Math.max(1,Math.min(maxPerBatch,Number(limit||2)));
  const available=Math.max(0,Math.min(requested,Math.max(0,maxActive-Math.max(0,Number(activeJobs||0)))));
  const candidates=[...items].sort((a,b)=>Number(b.priority||0)-Number(a.priority||0)).slice(0,available).map(x=>({id:String(x.id),type:String(x.type||''),status:String(x.status||''),priority:Number(x.priority||0),projectId:x.projectId||null,campaignId:x.campaignId||null}));
  const state={activeJobs:Number(activeJobs||0),available,requested,maxActive,maxPerBatch,candidates};
  const previewToken=crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex');
  return {generatedAt:new Date().toISOString(),previewToken,...state,policy:{previewOnly:true,ownerConfirmationRequired:true,stateBoundConfirmation:true,autoPublish:false,freeOnly:true}};
}

export function guardedExecutionPreviewMatches(preview,token){
  return typeof token==='string'&&token.length===64&&preview?.previewToken===token;
}
