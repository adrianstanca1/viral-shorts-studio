import { produceProject } from '../app/pipeline.mjs';

const root=process.env.SHOWCASE_ROOT||'./data/showcase';
const mk=(id,topic,niche,style,mode,captionStyle,aspect,source,narrations)=>({
  id,status:'queued',progress:0,createdAt:new Date().toISOString(),topic,niche,style,mode,duration:30,
  aspect,language:'en',voice:'auto',captionStyle,autonomous:true,autoCandidates:true,candidateCount:2,
  sources:[source],
  storyboard:narrations.map((n,i)=>({
    index:i+1,beat:i===0?'hook':i===7?'payoff':i<3?'context':i<6?'evidence':'escalation',
    shotType:['close-up','wide shot','detail shot','tracking shot','macro detail','diagram shot','hero shot','closing wide'][i],
    durationHint:3.75,narration:n,overlay:n.split(' ').slice(0,7).join(' '),sourceIndex:0,
    style,aspect,language:'en',voice:'auto',captionStyle
  }))
});

const demos=[
  mk('documentary-roman','How Roman concrete survived for centuries','history','documentary','multi-scene','documentary','16:9',
    {title:'Roman concrete overview',url:'https://en.wikipedia.org/wiki/Roman_concrete',extract:'Roman concrete used lime, volcanic ash and aggregate. Some marine Roman structures remained durable for many centuries, and modern research studies mineral reactions that can strengthen parts of the material over time.'},
    ['Roman builders made concrete that still survives today.','Their mix combined lime, volcanic ash, water and stone.','Harbour structures faced salt water for centuries.','Researchers found minerals continuing to react inside the material.','Those reactions can help seal tiny cracks in some samples.','The result was durability achieved without modern cement chemistry.','Scientists now study the mechanism for future low-carbon materials.','Ancient construction is still teaching modern engineers new lessons.']),
  mk('documentary-great-train-robbery','The Great Train Robbery of 1963','true-crime','documentary','multi-scene','documentary','9:16',
    {title:'Great Train Robbery overview',url:'https://en.wikipedia.org/wiki/Great_Train_Robbery_(1963)',extract:'In August 1963 a gang stopped a Royal Mail train in Buckinghamshire, stole more than two million pounds in cash, and was later pursued in one of Britain’s most famous criminal investigations.'},
    ['In 1963, Britain woke to an audacious train robbery.','A gang stopped a Royal Mail train before dawn.','They targeted cash travelling from Glasgow toward London.','More than two million pounds was taken from the train.','Police quickly focused on fingerprints and the gang’s hideout.','Several members were arrested and later convicted.','The robbery became one of Britain’s most famous criminal cases.','Its scale changed how high-value transport security was viewed.']),
  mk('documentary-apollo13','How Apollo 13 survived a spacecraft explosion','history','documentary','multi-scene','documentary','16:9',
    {title:'Apollo 13 overview',url:'https://en.wikipedia.org/wiki/Apollo_13',extract:'Apollo 13 suffered an oxygen tank explosion in April 1970. The lunar landing was abandoned, the lunar module became a lifeboat, and the crew returned safely to Earth after engineers improvised life-support and navigation solutions.'},
    ['Apollo 13 was meant to land astronauts on the Moon.','Two days into the mission, an oxygen tank exploded.','The crew lost power, oxygen and normal spacecraft systems.','The lunar module suddenly became an emergency lifeboat.','Engineers on Earth improvised solutions with limited supplies.','Navigation and carbon-dioxide removal became critical challenges.','The crew looped around the Moon and headed home.','Apollo 13 became a landmark story of engineering under pressure.']),
  mk('cinematic-lighthouse','The Last Lighthouse Keeper','storytelling','cinematic','multi-scene','minimal','16:9',
    {title:'Original fictional micro-story',url:'https://example.invalid/lighthouse-story',extract:'An original fictional story about a lighthouse keeper riding out a storm and guiding a fishing boat away from dangerous rocks.'},
    ['At midnight, the lighthouse lamp flickered once.','Outside, the storm erased the horizon completely.','The keeper heard a distant engine below the cliffs.','A fishing boat had drifted toward the black rocks.','He climbed the tower as the power failed again.','By hand, he kept the old lens turning through the gale.','One beam found the boat and pulled it toward open water.','At sunrise, the keeper finally let the lamp go dark.']),
  mk('cinematic-watch','The Watchmaker\'s Final Commission','storytelling','cinematic','multi-scene','minimal','9:16',
    {title:'Original fictional luxury micro-story',url:'https://example.invalid/watchmaker-story',extract:'An original fictional story about an elderly watchmaker crafting one final hand-finished mechanical watch for his daughter.'},
    ['At dawn, the old watchmaker opened his shop one last time.','A velvet box waited beneath a single warm lamp.','Inside lay the final movement he would ever finish.','Every wheel had been polished by hand for weeks.','His daughter watched quietly from the doorway.','He fitted the hands and wound the crown once.','The movement began ticking with perfect, patient rhythm.','He closed the case and passed the legacy forward.']),
  mk('cinematic-mars','First Light on Mars','storytelling','cinematic','multi-scene','minimal','16:9',
    {title:'Original cinematic science-fiction micro-story',url:'https://example.invalid/mars-story',extract:'An original fictional story about the first human habitat on Mars waking before sunrise and seeing the horizon brighten.'},
    ['The habitat woke before sunrise on Mars.','Outside, the plain was silent and impossibly still.','A lone astronaut stepped onto the red dust.','The eastern horizon began to glow beneath thin clouds.','For a moment, every alarm and checklist was forgotten.','A pale sun climbed above a world without oceans.','The astronaut raised a gloved hand toward the light.','Humanity had finally watched morning arrive on another planet.']),
  mk('hybrid-skyscraper','Why skyscrapers are designed to sway','fact-check','hybrid','multi-scene','bold','16:9',
    {title:'Tall building engineering overview',url:'https://en.wikipedia.org/wiki/Skyscraper',extract:'Tall buildings move slightly under wind loads. Structural engineers design stiffness, damping and mass distribution so motion remains controlled and within safety and comfort limits.'},
    ['If a skyscraper moves in the wind, is that dangerous?','Usually, a small amount of movement is expected by design.','Wind pushes tall buildings harder as height increases.','Engineers balance stiffness with controlled flexibility.','Some towers use giant tuned mass dampers near the top.','The moving mass helps reduce uncomfortable oscillation.','What matters is not zero movement, but controlled movement.','So a gentle sway can be evidence the system is working.']),
  mk('hybrid-compound-interest','Why compound interest accelerates over time','finance','hybrid','multi-scene','bold','9:16',
    {title:'Compound interest overview',url:'https://en.wikipedia.org/wiki/Compound_interest',extract:'Compound interest is calculated on principal and accumulated interest. Over longer periods, repeated compounding can cause growth to accelerate compared with simple interest.'},
    ['Why does compound interest feel slow at first?','Because early growth happens on a relatively small balance.','Each return then becomes part of the next calculation.','That means future gains can earn gains of their own.','The effect becomes more visible as time increases.','Regular contributions can amplify the same compounding process.','Returns are never guaranteed, and fees still matter.','But time is the key ingredient that makes compounding powerful.']),
  mk('hybrid-heat-pump','How a heat pump moves heat instead of making it','fact-check','hybrid','multi-scene','bold','16:9',
    {title:'Heat pump overview',url:'https://en.wikipedia.org/wiki/Heat_pump',extract:'A heat pump transfers thermal energy using a refrigeration cycle and can deliver more heat energy than the electrical energy it consumes.'},
    ['A heat pump does not create heat like a heater.','It moves thermal energy from one place to another.','Refrigerant absorbs heat at a low temperature.','A compressor raises its pressure and temperature.','That heat is then released inside the building.','The cycle repeats continuously while the system is running.','Because heat is moved, efficiency can exceed resistance heating.','The result is heating powered by a refrigeration cycle.']),
  mk('whiteboard-battery','How a home battery stores solar energy','storytelling','whiteboard','whiteboard','minimal','16:9',
    {title:'Home battery system overview',url:'https://en.wikipedia.org/wiki/Home_energy_storage',extract:'A home energy storage system can charge from rooftop solar, store energy chemically, and discharge through an inverter to supply household loads.'},
    ['Solar panels often make more electricity around midday.','Your home uses some of that power immediately.','Extra electricity can flow into a home battery.','Inside, electrical energy is stored as chemical energy.','When solar production falls, the battery can discharge.','An inverter converts the stored power for household use.','Smart controls decide when charging or discharging makes sense.','The basic idea is simple: save sunshine for later.']),
  mk('whiteboard-rainscreen','How a ventilated rainscreen facade works','storytelling','whiteboard','whiteboard','minimal','9:16',
    {title:'Ventilated rainscreen facade overview',url:'https://en.wikipedia.org/wiki/Rainscreen',extract:'A ventilated rainscreen facade uses an outer cladding layer separated from the weather-resistant wall by a cavity that supports drainage and ventilation.'},
    ['A rainscreen facade is built in several separate layers.','The outer cladding takes most of the weather exposure.','Behind it, a cavity provides space for drainage and airflow.','Water that passes joints can drain safely downward.','Insulation sits closer to the main wall structure.','Fire barriers divide cavities where regulations require them.','Each layer has a different job in controlling moisture and heat.','Together, the system protects the wall without trapping water.']),
  mk('whiteboard-tuned-damper','How a tuned mass damper reduces building sway','storytelling','whiteboard','whiteboard','minimal','16:9',
    {title:'Tuned mass damper overview',url:'https://en.wikipedia.org/wiki/Tuned_mass_damper',extract:'A tuned mass damper is a mass connected to a structure through springs or dampers. It moves out of phase with structural motion and can reduce vibration.'},
    ['Tall buildings can move slightly under wind loads.','Engineers sometimes add a large tuned mass near the top.','The mass is connected with springs or damping systems.','When the building moves, the mass moves differently.','Its motion counteracts part of the building’s oscillation.','That reduces acceleration occupants would otherwise feel.','The system is tuned to the structure’s natural movement.','A moving weight can therefore make a tower feel steadier.'])
];

for(const project of demos){
  let last='';
  console.log('START',project.id);
  try{
    await produceProject(project,root,p=>{const state=`${p.status}:${p.progress}`;if(state!==last){last=state;console.log('PROGRESS',project.id,state)}});
    console.log('DONE',project.id,project.status,project.render?.file||'',project.qa?.viralityScore??'');
  }catch(error){
    console.error('FAILED',project.id,String(error?.message||error).slice(0,300));
    process.exitCode=1;
  }
}
