import fs from 'node:fs';
import path from 'node:path';

const file=root=>path.join(root,'voice-studio.json');
const catalog=[
  {id:'piper-en-lessac',name:'Lessac HD',engine:'piper',locale:'en-US',gender:'female',local:true,quality:'neural',model:'/opt/piper-voices/en_US-lessac-medium.onnx'},
  {id:'piper-fr-siwis',name:'Siwis HD',engine:'piper',locale:'fr-FR',gender:'female',local:true,quality:'neural',model:'/opt/piper-voices/fr_FR-siwis-medium.onnx'},
  {id:'piper-es-sharvard',name:'Sharvard HD',engine:'piper',locale:'es-ES',gender:'male',local:true,quality:'neural',model:'/opt/piper-voices/es_ES-sharvard-medium.onnx'},
  {id:'piper-it-serena',name:'Serena HD',engine:'piper',locale:'it-IT',gender:'female',local:true,quality:'neural',model:'/opt/piper-voices/it_IT-serena-medium.onnx'},
  {id:'piper-de-thorsten',name:'Thorsten HD',engine:'piper',locale:'de-DE',gender:'male',local:true,quality:'neural',model:'/opt/piper-voices/de_DE-thorsten-medium.onnx'},
  {id:'piper-ro-mihai',name:'Mihai HD',engine:'piper',locale:'ro-RO',gender:'male',local:true,quality:'neural',model:'/opt/piper-voices/ro_RO-mihai-medium.onnx'},
  {id:'slt',name:'Slt',engine:'flite',locale:'en-US',gender:'female',local:true,quality:'standard'},
  {id:'awb',name:'Awb',engine:'flite',locale:'en-US',gender:'male',local:true,quality:'standard'},
  {id:'rms',name:'Rms',engine:'flite',locale:'en-US',gender:'male',local:true,quality:'standard'},
  {id:'kal',name:'Kal',engine:'flite',locale:'en-US',gender:'male',local:true,quality:'basic'},
  {id:'kal16',name:'Kal16',engine:'flite',locale:'en-US',gender:'male',local:true,quality:'basic'}
];
const read=root=>{try{return JSON.parse(fs.readFileSync(file(root),'utf8'))}catch{return {version:1,favourites:[]}}};
const write=(root,state)=>{fs.mkdirSync(root,{recursive:true});const f=file(root),tmp=f+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(tmp,f);return state};
export function voiceCatalog(root){const state=read(root),fav=new Set(state.favourites||[]);return catalog.map(x=>({...x,favourite:fav.has(x.id),previewAvailable:true,policy:'local-free',tier:x.engine==='piper'?'preferred':'fallback'}));}
export function getVoice(id){return catalog.find(x=>x.id===String(id||''))||null;}
export function setVoiceFavourite(root,id,favourite=true){if(!getVoice(id))throw Error('voice not found');const state=read(root),set=new Set(state.favourites||[]);favourite?set.add(id):set.delete(id);state.favourites=[...set];write(root,state);return {id,favourite:set.has(id)};}
export function voicePreviewText(input=''){return String(input||'This is a Creator OS local voice preview.').replace(/[^a-zA-Z0-9 ,.?!'-]/g,' ').replace(/\s+/g,' ').trim().slice(0,180)||'Creator OS voice preview.';}
