import fs from 'node:fs';
import path from 'node:path';
const file=root=>path.join(root,'plugin-registry-state.json');
const defaults=[
  {id:'research-core',name:'Research Core',tool:'research',category:'research',scopes:['read','create'],freeOnlyCompatible:true},
  {id:'opportunity-lab',name:'Opportunity Lab',tool:'opportunity_scan',category:'research',scopes:['read','create'],freeOnlyCompatible:true},
  {id:'video-maker',name:'Video Maker',tool:'create_video',category:'media',scopes:['create'],freeOnlyCompatible:true},
  {id:'product-studio',name:'Product Studio',tool:'create_product',category:'products',scopes:['create'],freeOnlyCompatible:true},
  {id:'website-builder',name:'Website Builder',tool:'create_website',category:'web',scopes:['create'],freeOnlyCompatible:true},
  {id:'creator-agent',name:'Creator Agent',tool:'plan_creator_goal',category:'agents',scopes:['create'],freeOnlyCompatible:true},
  {id:'project-library',name:'Project Library',tool:'list_projects',category:'library',scopes:['read'],freeOnlyCompatible:true}
];
const read=root=>{try{return JSON.parse(fs.readFileSync(file(root),'utf8'))}catch{return {version:1,overrides:{}}}};
const write=(root,state)=>{fs.mkdirSync(root,{recursive:true});const f=file(root),tmp=f+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(tmp,f);return state};
export function listPlugins(root){const state=read(root);return defaults.map(p=>({...p,enabled:state.overrides?.[p.id]?.enabled!==false,health:'built-in',smokeStatus:'release-gate-covered',costPolicy:'free-only'}));}
export function getPlugin(root,id){return listPlugins(root).find(x=>x.id===id)||null}
export function pluginForTool(root,tool){return listPlugins(root).find(x=>x.tool===tool)||null}
export function setPluginEnabled(root,id,enabled){if(!defaults.some(x=>x.id===id))throw Error('plugin not found');const state=read(root);state.overrides||={};state.overrides[id]={...(state.overrides[id]||{}),enabled:enabled===true,updatedAt:new Date().toISOString()};write(root,state);return getPlugin(root,id)}
export function pluginCapabilities(){return defaults.map(({id,name,tool,category,scopes,freeOnlyCompatible})=>({id,name,tool,category,scopes,freeOnlyCompatible}))}
