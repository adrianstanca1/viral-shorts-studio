const cloudCatalog={
  ollama:[
    {id:'gpt-oss:20b-cloud',role:'balanced',tasks:['storyboard','script','rewrite']},
    {id:'gpt-oss:120b-cloud',role:'strong',tasks:['reasoning','fact-check','storyboard','script']},
    {id:'deepseek-v3.1:671b-cloud',role:'strong',tasks:['reasoning','fact-check','research']},
    {id:'qwen3-coder:480b-cloud',role:'specialist',tasks:['code','tools']}
  ],
  huggingface:[
    {id:'openai/gpt-oss-20b',role:'balanced',tasks:['storyboard','script','rewrite']},
    {id:'Qwen/Qwen3-30B-A3B-Instruct-2507',role:'balanced',tasks:['storyboard','script','multilingual']},
    {id:'Qwen/Qwen3-Next-80B-A3B-Instruct',role:'strong',tasks:['long-context','storyboard','script']},
    {id:'openai/gpt-oss-120b',role:'strong',tasks:['reasoning','fact-check','storyboard']},
    {id:'deepseek-ai/DeepSeek-V3.1',role:'strong',tasks:['reasoning','fact-check','research']}
  ]
};
const score=(m,task,quality)=>Number(m.tasks.includes(task))*4+Number(quality==='strong'&&m.role==='strong')*3+Number(quality!=='strong'&&m.role==='balanced')*2;
export function cloudModels(provider){return cloudCatalog[provider]||[]}
export function pickCloudModel(provider,{task='storyboard',quality='balanced'}={}){
  return [...cloudModels(provider)].sort((a,b)=>score(b,task,quality)-score(a,task,quality))[0]?.id||null;
}
export function textModelCatalog(){return structuredClone(cloudCatalog)}
