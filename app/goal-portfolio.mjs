export function goalPortfolio(goals=[],progressById=new Map()){
  const rows=goals.map(g=>{const p=progressById.get(g.id)||{},values=Object.values(p.progress||{}).filter(x=>Number.isFinite(x));const completion=values.length?Number((values.reduce((a,b)=>a+b,0)/values.length).toFixed(1)):0;const risk=g.status!=='active'?'inactive':completion>=100?'complete':completion<35?'high':completion<70?'medium':'low';return {goal:g,progress:p,completion,risk};});
  const active=rows.filter(x=>x.goal.status==='active');return {generatedAt:new Date().toISOString(),goals:rows,summary:{total:rows.length,active:active.length,atRisk:active.filter(x=>['high','medium'].includes(x.risk)).length,complete:rows.filter(x=>x.risk==='complete').length},policy:{observedMetricsOnly:true,guarantee:false}};
}
