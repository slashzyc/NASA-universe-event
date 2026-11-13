import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePatch,adjacentPatch} from '../src/selection.js';

const patches=[];
for(const north of [-25,0,25])for(const east of [-25,0,25])patches.push({id:`${east},${north}`,dxM:east,dyM:north});
test('map arrow keys follow physical north/east even when the input rows are reversed',()=>{
  for(const list of [patches,[...patches].reverse()]){
    for(const [key,id] of Object.entries({ArrowUp:'0,25',ArrowDown:'0,-25',ArrowLeft:'-25,0',ArrowRight:'25,0'})){
      assert.equal(adjacentPatch(list,'0,0',key).id,id);
    }
  }
});
test('edge and corner keys keep their point instead of wrapping into another row',()=>{
  for(const p of patches){
    if(p.dxM===25)assert.equal(adjacentPatch(patches,p.id,'ArrowRight').id,p.id);
    if(p.dxM===-25)assert.equal(adjacentPatch(patches,p.id,'ArrowLeft').id,p.id);
    if(p.dyM===25)assert.equal(adjacentPatch(patches,p.id,'ArrowUp').id,p.id);
    if(p.dyM===-25)assert.equal(adjacentPatch(patches,p.id,'ArrowDown').id,p.id);
  }
});
test('missing or invalid shared point IDs resolve to the center and movement remains local',()=>{
  for(const id of [null,undefined,'not-a-point',''])assert.equal(resolvePatch(patches,id).id,'0,0');
  assert.equal(adjacentPatch(patches,'not-a-point','ArrowUp').id,'0,25');
  assert.equal(adjacentPatch(patches,'25,25','Escape').id,'25,25');
  assert.equal(adjacentPatch([],null,'ArrowUp'),null);
});
