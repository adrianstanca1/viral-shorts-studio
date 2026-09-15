export function resourceAwareWaves(plan,{maxParallel=2,activeJobs=0}={}){
  const cap=Math.max(1,Math.min(4,Number(maxParallel||2))),available=Math.max(1,cap-Math.max(0,Number(activeJobs||0)));const waves=[];for(const w of plan.parallelWaves||[]){const agents=[...(w.agents||[])];for(let i=0;i<agents.length;i+=available)waves.push({index:waves.length,agents:agents.slice(i,i+available),sourceWave:w.index,capacity:available});}return {waves,capacity:available,policy:{resourceBounded:true,autoPublish:false}};
}
