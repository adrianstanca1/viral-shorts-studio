import assert from 'node:assert/strict';
import { professionalFinishingProfile, sceneMotionDirection, finishingSummary } from './professional-finishing.mjs';

const doc=professionalFinishingProfile({style:'documentary',duration:30,aspect:'16:9'});
assert.equal(doc.style,'documentary');
assert.match(doc.videoFilter,/eq=contrast=1\.05/);
assert.match(doc.videoFilter,/vignette/);
assert.match(doc.audioFilter,/loudnorm=I=-16/);
assert.equal(doc.targetLoudnessLufs,-16);
assert.equal(doc.truePeakDb,-1.5);

const cinematic=professionalFinishingProfile({style:'cinematic',duration:30});
assert.match(cinematic.videoFilter,/contrast=1\.09/);
assert.match(cinematic.videoFilter,/vignette/);

const whiteboard=professionalFinishingProfile({style:'whiteboard',duration:30});
assert.ok(!whiteboard.videoFilter.includes('vignette='));
assert.match(whiteboard.videoFilter,/brightness=0\.015/);

assert.equal(sceneMotionDirection({index:1,beat:'hook'}).mode,'push-in');
assert.equal(sceneMotionDirection({index:8,beat:'payoff'}).mode,'pull-out');
assert.equal(finishingSummary(doc).targetLoudnessLufs,-16);
console.log('professional finishing tests: ok');
