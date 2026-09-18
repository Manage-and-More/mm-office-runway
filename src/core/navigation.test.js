import test from 'node:test';
import assert from 'node:assert/strict';
import { createNavigation } from './navigation.js';
test('paths avoid registered beds/furniture and recover when removed', () => {
  const nav=createNavigation();
  const unregister=nav.register('bed',[{contour:[{x:-1,z:-1},{x:1,z:-1},{x:1,z:1},{x:-1,z:1}]}]);
  assert.equal(nav.isWalkable(0,0),false);assert.equal(nav.segmentClear(-2,0,2,0),false);
  const route=nav.findPath({x:-2,z:0},{x:2,z:0});assert.ok(route?.length>1);
  let last={x:-2,z:0};for(const p of route){assert.ok(nav.segmentClear(last.x,last.z,p.x,p.z));last=p;}
  unregister();assert.equal(nav.findPath({x:-2,z:0},{x:2,z:0}).length,1);
});
test('invalid targets and disconnected holes cannot produce unsafe routes', () => {
  const nav=createNavigation();
  nav.register('ring',[{contour:[{x:-2,z:-2},{x:2,z:-2},{x:2,z:2},{x:-2,z:2}],holes:[[{x:-1,z:-1},{x:1,z:-1},{x:1,z:1},{x:-1,z:1}]]}]);
  assert.ok(nav.isWalkable(0,0));assert.equal(nav.findPath({x:4,z:0},{x:0,z:0}),null);
  assert.equal(nav.findPath({x:4,z:0},{x:20,z:0}),null);
});
