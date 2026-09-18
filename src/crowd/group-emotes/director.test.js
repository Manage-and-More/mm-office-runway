import test from 'node:test';
import assert from 'node:assert/strict';
import { createGroupDirector } from './director.js';
import { createRegistry } from './registry.js';
import { GROUP_EMOTES } from './definitions.js';
import { FORMATIONS } from './formations.js';
import { createLobbyLayout } from '../layout.js';
import { createStandardController } from '../standard.js';
function residents(count = 40) {
  return createLobbyLayout(count).map((p, i) => ({ mii: { position: { x: p.x, z: p.z }, rotation: { y: 0 }, userData: { applyPose() {} } }, controller: createStandardController({ seed: i + 4 }), wanderer: { walking: false } }));
}
test('synchronized emotes complete, release control, and report lifecycle', () => {
  const people = residents(), events = [];
  const director = createGroupDirector(people, { onEvent: event => events.push(event.type) });
  assert.equal(director.play('group-cheer'), true);
  assert.equal(director.play('missing'), false);
  for (let i = 0; i < 60; i++) director.update(0.1);
  assert.equal(director.active, false); assert.equal(director.status.lastResult, 'completed');
  assert.ok(people.every(person => person.controller.action === 'idle'));
  assert.deepEqual(events, ['start', 'phase', 'phase', 'finish']);
});
test('busy policies, bounded queue, cancellation, and disposal', () => {
  const d = createGroupDirector(residents());
  d.play('group-cheer'); assert.equal(d.play('wave-ripple'), false);
  for (let i = 0; i < 4; i++) assert.equal(d.play('wave-ripple', { busy: 'queue' }), true);
  assert.equal(d.play('wave-ripple', { busy: 'queue' }), false);
  assert.equal(d.play('wave-ripple', { busy: 'replace' }), true);
  assert.equal(d.status.queued, 0); d.cancel(); assert.equal(d.active, false);
  d.play('group-cheer'); d.play('wave-ripple', { busy: 'queue' });
  for (let i = 0; i < 50; i++) d.update(0.1);
  assert.equal(d.status.emote, 'wave-ripple');
  d.dispose(); assert.equal(d.play('group-cheer'), false);
});
test('reduced motion stays in place and suppresses effect cues', () => {
  const people = residents(), before = people.map(p => ({ ...p.mii.position })), cues = [];
  const definitions = [{ id:'test', label:'test', phases:[{ type:'formation', formation:'garden-rings', timeout:10 }, {type:'motion', motion:'dance',duration:1,cues:[{at:0,name:'future-effect'}]}, {type:'release',duration:.5}] }];
  const d = createGroupDirector(people, { reducedMotion:true, definitions, onEvent:e => cues.push(e) });
  d.play('test'); for (let i=0;i<25;i++) d.update(.1);
  assert.deepEqual(people.map(p=>p.mii.position), before); assert.equal(cues.some(e=>e.type==='cue'),false);
  assert.equal(d.status.lastResult,'completed');
});
test('cues fire once per phase and definition mutations cannot change a sequence', () => {
  const definitions=[{id:'test',label:'test',phases:[{type:'motion',motion:'wave',duration:1,cues:[{at:0,name:'start'},{at:.5,name:'half'}]},{type:'release',duration:.5}]}];
  const events=[]; const d=createGroupDirector(residents(8),{definitions,onEvent:e=>events.push(e)});
  definitions[0].phases[0].duration=100;
  d.play('test');for(let i=0;i<20;i++)d.update(.1);
  assert.equal(d.status.lastResult,'completed');assert.deepEqual(events.filter(e=>e.type==='cue').map(e=>e.name),['start','half']);
});
test('invalid definitions are rejected before runtime', () => {
  assert.throws(()=>createRegistry([...GROUP_EMOTES,GROUP_EMOTES[0]]));
  assert.throws(()=>createRegistry([{id:'bad',label:'Bad',phases:[{type:'motion',motion:'invalid',duration:2}]}]));
  assert.throws(()=>createRegistry([{id:'bad',label:'Bad',phases:[{type:'release',duration:NaN}]}]));
});
test('formations scale to 150 without overlapping slots', () => {
  for(const count of [8,40,150]) {
    const slots=FORMATIONS['garden-rings'](count);assert.equal(slots.length,count);
    for(let i=0;i<count;i++)for(let j=0;j<i;j++)assert.ok(Math.hypot(slots[i].x-slots[j].x,slots[i].z-slots[j].z)>1.1);
  }
});
test('gather uses continuous movement, preserves spacing, and completes at 40', () => {
  const people=residents(), d=createGroupDirector(people);d.play('garden-dance');
  for(let frame=0;frame<600&&d.active;frame++) {
    const before=people.map(p=>({...p.mii.position}));d.update(.1);
    for(let i=0;i<people.length;i++) {
      const p=people[i].mii.position;assert.ok(Math.hypot(p.x-before[i].x,p.z-before[i].z)<=.073);
      for(let j=0;j<i;j++)assert.ok(Math.hypot(p.x-people[j].mii.position.x,p.z-people[j].mii.position.z)>=.779);
    }
  }
  assert.equal(d.status.lastResult,'completed');
});
