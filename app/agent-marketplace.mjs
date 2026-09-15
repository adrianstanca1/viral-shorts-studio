import fs from 'node:fs';
import path from 'node:path';
const file=root=>path.join(root,'agent-marketplace.json');
const agents=[
  {id:'channel-launcher',name:'Channel Launcher',category:'growth',description:'Research a niche, apply Brand Brain, produce launch content and prepare approval-gated publishing.',goalPrefix:'Launch a source-grounded faceless channel around',tools:['research','brand-brain','video-maker','image-maker','publishing']},
  {id:'content-scout',name:'Content Scout',category:'research',description:'Find source-grounded content opportunities and turn the strongest one into a production plan.',goalPrefix:'Research opportunities and create the strongest source-grounded video about',tools:['research','video-maker','image-maker']},
  {id:'product-funnel',name:'Product Funnel',category:'products',description:'Create a digital product and supporting landing-page direction from one goal.',goalPrefix:'Create an ebook or planner and website funnel for',tools:['research','product-studio','website-builder']},
  {id:'growth-operator',name:'Growth Operator',category:'analytics',description:'Use observed performance signals to plan the next owner-reviewed content move.',goalPrefix:'Create the next evidence-informed content move for',tools:['research','brand-brain','video-maker','publishing']}
].map(x=>({...x,freeOnlyCompatible:true,arbitraryCode:false,ownerApprovalRequired:true}));
const read=root=>{try{return JSON.parse(fs.readFileSync(file(root),'utf8'))}catch{return {version:1,overrides:{}}}};
const write=(root,state)=>{fs.mkdirSync(root,{recursive:true});const f=file(root),tmp=f+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(tmp,f);return state};
export function listAgents(root){const state=read(root);return agents.map(a=>({...a,enabled:state.overrides?.[a.id]?.enabled!==false,installed:state.overrides?.[a.id]?.installed===true}))}
export function getAgent(root,id){return listAgents(root).find(x=>x.id===id)||null}
export function configureAgent(root,id,patch={}){if(!agents.some(x=>x.id===id))throw Error('agent not found');const state=read(root);state.overrides||={};state.overrides[id]={...(state.overrides[id]||{}),...(patch.enabled!==undefined?{enabled:patch.enabled===true}:{}),...(patch.installed!==undefined?{installed:patch.installed===true}:{}),updatedAt:new Date().toISOString()};write(root,state);return getAgent(root,id)}
export function agentGoal(root,id,input={}){const agent=getAgent(root,id);if(!agent)throw Error('agent not found');if(!agent.enabled)throw Error('agent is disabled');const objective=String(input.goal||input.objective||'').trim().slice(0,500);if(objective.length<3)throw Error('agent goal is required');return {agent,goal:`${agent.goalPrefix} ${objective}`.slice(0,700),policy:{freeOnly:true,ownerApprovalRequired:true,arbitraryCode:false}}}
