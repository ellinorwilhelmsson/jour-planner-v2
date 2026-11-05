import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, createState, closedDates } from '../src/model.js';
import { demoFamilies, defaultDepartments } from '../src/seed.js';
import { available, generateSchedule } from '../src/planner.js';
import { isoWeek } from '../src/dates.js';
const act=(state,payload)=>applyCommand(state,{type:'period.swap',payload:{periodId:state.periods[0].id,...payload}},{actor:'tester@example.com'});
function fixture() {
  const state=createState(demoFamilies);state.periods[0].assignments={'2026-11-05:0':{family:1,locked:false},'2026-11-05:1':{family:2,locked:false},'2026-11-06:0':{family:3,locked:false}};return state;
}
test('draft exchange updates both slots atomically, locks both, clears approvals and leaves other slots alone',()=>{
  const state=fixture(),p=state.periods[0];p.approved=['old'];
  const {state:next,event}=act(state,{key:'2026-11-05:0',otherKey:'2026-11-05:1'});
  assert.deepEqual(next.periods[0].assignments['2026-11-05:0'],{family:2,locked:true});
  assert.deepEqual(next.periods[0].assignments['2026-11-05:1'],{family:1,locked:true});
  assert.deepEqual(next.periods[0].assignments['2026-11-06:0'],p.assignments['2026-11-06:0']);
  assert.deepEqual(next.periods[0].approved,[]);assert.equal(p.assignments['2026-11-05:0'].family,1);
  assert.equal(event.actor,'tester@example.com');assert.equal(event.before.assignments['2026-11-05:1'].family,2);assert.equal(event.after.assignments['2026-11-05:1'].family,1);
});
test('moving to an unstaffed draft slot leaves the source explicitly empty and locked',()=>{
  const state=fixture();const {state:next}=act(state,{key:'2026-11-05:1',otherKey:'2026-11-09:0'});
  assert.deepEqual(next.periods[0].assignments['2026-11-09:0'],{family:2,locked:true});
  assert.deepEqual(next.periods[0].assignments['2026-11-05:1'],{family:null,locked:true});
});
test('a Friday block or a duplicate at either destination rejects the whole exchange',()=>{
  const state=fixture(),before=structuredClone(state);
  assert.throws(()=>act(state,{key:'2026-11-05:0',otherKey:'2026-11-06:0'}),/inte tillgänglig/);
  assert.deepEqual(state,before);
  state.periods[0].assignments['2026-11-06:1']={family:2,locked:false};
  assert.throws(()=>act(state,{key:'2026-11-05:1',otherKey:'2026-11-06:0'}),/flera jourpass/);
});
test('exchange validates both endpoints, active levels and archived status',()=>{
  const state=fixture();
  for(const otherKey of ['2026-11-07:0','2027-02-01:0','2026-11-05:0','bad-key']) assert.throws(()=>act(state,{key:'2026-11-05:0',otherKey}));
  state.periods[0].levelOverrides={'2026-11-09':1};assert.throws(()=>act(state,{key:'2026-11-05:1',otherKey:'2026-11-09:2'}),/öppna jourpass/);
  state.periods[0].status='archived';assert.throws(()=>act(state,{key:'2026-11-05:0',otherKey:'2026-11-05:1'}),/Arkiverade/);
});
test('sent exchange requires a reason and preserves the original even across duty levels',()=>{
  const state=fixture(),p=state.periods[0];p.status='sent';p.original={assignments:structuredClone(p.assignments),families:structuredClone(state.families),aptDates:[]};
  assert.throws(()=>act(state,{key:'2026-11-05:0',otherKey:'2026-11-05:1'}),/orsaken/);
  const {state:next}=act(state,{key:'2026-11-05:0',otherKey:'2026-11-05:1',reason:'Överenskommet byte'});
  assert.equal(next.periods[0].assignments['2026-11-05:0'].family,2);assert.deepEqual(next.periods[0].original,p.original);
});
test('demo seed supplies 40 distinct households, 35 obligated, 5 exempt, 7 Friday blocks and all three departments',()=>{
  assert.equal(demoFamilies.length,40);assert.equal(demoFamilies.filter(f=>f.status==='Aktiv').length,35);assert.equal(demoFamilies.filter(f=>f.status==='Jourbefriad').length,5);
  assert.equal(demoFamilies.filter(f=>f.blockedWeekdays.includes(5)&&f.status==='Aktiv').length,7);
  assert.deepEqual([...new Set(demoFamilies.map(f=>f.group))].sort(),[...defaultDepartments].sort());
  const children=demoFamilies.flatMap(f=>f.childRecords.map(c=>c.name));assert.equal(children.length,48);assert.equal(new Set(children).size,48);
  const empty=createState([]);const seeded=applyCommand(empty,{type:'demo.seed'},{actor:'tester@example.com'}).state;
  assert.equal(seeded.families.length,40);assert.equal(seeded.queue.length,40);assert.equal(seeded.demoData,true);
  assert.throws(()=>applyCommand(seeded,{type:'demo.seed'},{actor:'tester@example.com'}),/redan familjer/);
});
test('40-household test schedule fills weekdays and respects Friday blocks and exemptions',()=>{
  const p=createState(demoFamilies).periods[0];
  const result=generateSchedule({start:p.start,end:p.end,families:demoFamilies,closed:closedDates(p)});
  assert.ok(Object.keys(result.assignments).length>150);
  for(const [key,a] of Object.entries(result.assignments)) {assert.ok(a.family);assert.ok(available(demoFamilies.find(f=>f.id===a.family),key.slice(0,10)));}
});
test('ISO week numbers correctly cross Swedish New Year weeks',()=>{
  assert.deepEqual(isoWeek('2026-11-02'),{year:2026,week:45});
  assert.deepEqual(isoWeek('2027-01-01'),{year:2026,week:53});
  assert.deepEqual(isoWeek('2027-01-04'),{year:2027,week:1});
  assert.deepEqual(isoWeek('2024-12-30'),{year:2025,week:1});
});
