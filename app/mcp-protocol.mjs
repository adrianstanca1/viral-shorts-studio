export const mcpToolDefinitions=[
{name:'list_projects',description:'List Creator OS production projects.',inputSchema:{type:'object',properties:{limit:{type:'integer',minimum:1,maximum:100}}}},
{name:'research',description:'Run source-grounded creator research.',inputSchema:{type:'object',required:['query'],properties:{query:{type:'string'},mode:{type:'string',enum:['topic','trend','competitor','faceless']}}}},
{name:'create_video',description:'Queue a free-first, approval-gated video project.',inputSchema:{type:'object',required:['topic'],properties:{topic:{type:'string'},duration:{type:'number',minimum:30,maximum:1800},aspect:{type:'string',enum:['9:16','16:9','1:1']},style:{type:'string'}}}},
{name:'create_product',description:'Create and export an ebook, planner, spreadsheet or tracker.',inputSchema:{type:'object',required:['title'],properties:{title:{type:'string'},type:{type:'string'},audience:{type:'string'}}}},
{name:'create_website',description:'Create a responsive website bundle.',inputSchema:{type:'object',required:['name'],properties:{name:{type:'string'},goal:{type:'string'}}}},
{name:'plan_creator_goal',description:'Plan an approval-gated Creator Agent workflow.',inputSchema:{type:'object',required:['goal'],properties:{goal:{type:'string'}}}}
];
export const mcpError=(id,code,message)=>({jsonrpc:'2.0',id:id??null,error:{code,message}});
export const mcpResult=(id,result)=>({jsonrpc:'2.0',id:id??null,result});
export const mcpText=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
