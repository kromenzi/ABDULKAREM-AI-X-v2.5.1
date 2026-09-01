const MODEL_PRIORITIES={
  eco:{
    vision:['qwen3-vl:8b','qwen3-vl','gemma3','gemma4:26b'],
    coding:['qwen2.5-coder:14b','alenzi-coder-pro-14b:latest','my-coder-pro:latest','qwen3-coder:30b','qwen3:8b'],
    general:['abdulkarem-general-sa:v2','qwen3:8b','qwen3:14b','qwen3-coder:30b']
  },
  max:{
    vision:['gemma4:26b','qwen3-vl:32b','qwen3-vl:30b','qwen3-vl:8b','qwen3-vl','gemma3'],
    coding:['qwen3-coder:30b','qwen3-coder-next','qwen3-coder','qwen2.5-coder:14b','alenzi-coder-pro-14b:latest'],
    general:['abdulkarem-general-sa:v2','qwen3:32b','nemotron-3.5-lightning','qwen3:14b','qwen3:8b','qwen3-coder:30b']
  },
  balanced:{
    vision:['gemma4:26b','qwen3-vl:8b','qwen3-vl','gemma3'],
    coding:['qwen3-coder:30b','qwen2.5-coder:14b','alenzi-coder-pro-14b:latest','qwen3-coder-next','qwen3-coder'],
    general:['abdulkarem-general-sa:v2','qwen3:8b','qwen3:14b','nemotron-3.5-lightning','qwen3-coder:30b']
  }
};
function findInstalled(installed,wanted){
  const list=(installed||[]).map(String);
  return list.find(x=>x.toLowerCase()===String(wanted).toLowerCase()) || list.find(x=>x.toLowerCase().includes(String(wanted).toLowerCase())) || '';
}
function selectModelFromInstalled({kind='general',performanceProfile='balanced',installed=[],preferred='auto'}={}){
  const list=(installed||[]).map(String).filter(Boolean);
  if(preferred&&preferred!=='auto'){
    const hit=list.find(x=>x.toLowerCase()===String(preferred).toLowerCase());
    if(hit)return hit;
  }
  const profile=MODEL_PRIORITIES[performanceProfile]||MODEL_PRIORITIES.balanced;
  const priorities=profile[kind]||profile.general;
  for(const wanted of priorities){const hit=findInstalled(list,wanted);if(hit)return hit;}
  return list[0]||'';
}
module.exports={MODEL_PRIORITIES,selectModelFromInstalled};
