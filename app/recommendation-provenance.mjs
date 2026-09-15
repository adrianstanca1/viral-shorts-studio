const clean=x=>x==null?null:JSON.parse(JSON.stringify(x));
export function withProvenance(item,{sources=[],kind='recommendation',generatedBy='creator-os'}={}){
  return {...item,provenance:{kind,generatedBy,generatedAt:new Date().toISOString(),sources:(sources||[]).slice(0,12).map(s=>({type:String(s.type||'observed'),id:String(s.id||''),label:String(s.label||''),observed:s.observed!==false,evidence:clean(s.evidence||null)})),policy:{observedEvidencePreferred:true,noGuarantee:true,ownerReviewRequired:true}}};
}
export function provenanceValid(item={}){
  const p=item.provenance;if(!p||!Array.isArray(p.sources))return false;
  return p.sources.every(s=>s.observed===true||s.type==='internal-qa');
}
