import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { applyCommand, createState, closedDates, historyFor, weightedFamilies, warningKey, periodWarnings } from '../src/model.js';
import { available, generateSchedule, obligation } from '../src/planner.js';
import { generateCleaning, cleaningFreeReason, cleaningAvailable } from '../src/cleaning.js';
import { swedishHolidays } from '../src/dates.js';
import { commitCommand, readWorkspace, historyPage } from '../src/store.js';
import { createHandler } from '../src/handler.js';
import { makeWorkbook, exportSheets } from '../src/export.js';
import { unzipSync, strFromU8 } from 'fflate';
const families=Array.from({length:24},(_,i)=>({id:i+1,name:`Namn ${i+1}`,status:'Aktiv',group:'Ekorren',childRecords:[{name:`Barn ${i+1}`,end:''}]}));
const actor='allowed@example.com';
const run=(state,type,payload={})=>applyCommand(state,{type,payload},{actor,now:'2026-11-04T18:00:00Z'});
const generate=state=>{const p=state.periods[0];p.aptDates=[...new Set([...p.aptDates,'2026-11-04','2026-12-02','2027-01-13'])];const result=generateSchedule({start:p.start,end:p.end,families:state.families,levels:p.levels,closed:closedDates(p),existing:p.assignments,apt:p.aptDates,levelOverrides:p.levelOverrides,history:historyFor(state,p)});return run(state,'period.generate',{periodId:p.id,assignments:Object.fromEntries(Object.entries(result.assignments).filter(([,a])=>!a.locked))}).state;};
const settings={autumnRE:'2026-10-10',springRE:'2027-05-08',reDates:[],breaks:[],cancelled:[],departments:['Ekorren','Ugglan'],extras:[]};
function database() {
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync('migrations/0001_workspace.sql','utf8'));
  const wrap=(sql,args=[])=>({bind:(...values)=>wrap(sql,values),first:async()=>sqlite.prepare(sql).get(...args)??null,all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:async()=>({meta:{changes:sqlite.prepare(sql).run(...args).changes}})});
  return {sqlite,prepare:sql=>wrap(sql),batch:async statements=>{sqlite.exec('BEGIN');try {const result=[];for(const statement of statements) result.push(await statement.run());sqlite.exec('COMMIT');return result;} catch(error) {sqlite.exec('ROLLBACK');throw error;}}};
}
test('D1 commands persist actor and state together, reject stale revisions and roll back audit failures',async()=>{
  const db=database();await readWorkspace(db,true);
  const command={revision:0,type:'period.create',payload:{start:'2027-02-01'}};
  const result=await commitCommand(db,command,actor,true);assert.equal(result.revision,1);
  assert.equal((await readWorkspace(db)).state.periods.length,2);
  const [event]=await historyPage(db,'all');assert.equal(event.actor,actor);assert.equal(event.scope,result.periodId);assert.equal(event.before,null);
  await assert.rejects(commitCommand(db,command,actor),error=>error.status===409);
  db.sqlite.exec("CREATE TRIGGER audit_fail BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT,'forced failure'); END;");
  await assert.rejects(commitCommand(db,{...command,revision:1,payload:{start:'2027-05-01'}},actor));
  assert.equal((await readWorkspace(db)).revision,1);assert.equal((await historyPage(db,'all')).length,1);
});
test('concurrent writers allow one save and never overwrite a newer revision',async()=>{
  const db=database();await readWorkspace(db);
  const results=await Promise.allSettled(['2027-02-01','2027-05-01'].map(start=>commitCommand(db,{revision:0,type:'period.create',payload:{start}},actor)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await readWorkspace(db)).revision,1);assert.equal((await historyPage(db,'all')).length,1);
});
test('write API rejects cross-origin and malformed requests and fails closed without storage',async()=>{
  const fetch=createHandler({}),env={ALLOWED_EMAIL:actor,DB:database()},ctx={access:{getIdentity:async()=>({email:actor})}};
  for(const headers of [{Origin:'https://other.example','Content-Type':'application/json'},{Origin:'https://app.example','Content-Type':'text/plain'}]) assert.equal((await fetch(new Request('https://app.example/api/commands',{method:'POST',headers,body:'{}'}),env,ctx)).status,403);
  assert.equal((await fetch(new Request('https://app.example/api/commands',{method:'POST',headers:{Origin:'https://app.example','Content-Type':'application/json'},body:'{'}),env,ctx)).status,400);
  assert.equal((await fetch(new Request('https://app.example/api/state'),{ALLOWED_EMAIL:actor},ctx)).status,503);
});
test('new child exemption is inclusive for 28 days and applies to cleaning, while board exemption does not',()=>{
  const f={...families[0],childRecords:[{name:'Nytt',start:'2026-11-01',exemptionWeeks:4}]};
  assert.equal(available(f,'2026-11-28'),false);assert.equal(available(f,'2026-11-29'),true);assert.equal(cleaningAvailable(f,'2026-11-28'),false);
  assert.equal(obligation(f,'2026-11-01','2026-11-30'),2);
  assert.equal(cleaningAvailable({...families[0],status:'Jourbefriad'},'2026-11-07'),true);
  assert.equal(available({...f,childRecords:[{...f.childRecords[0],exemptionWeeks:0}]},'2026-11-02'),true);
});
test('Swedish holidays, RE weekends, full closed weeks and Friday–Monday holidays skip cleaning',()=>{
  assert.equal(swedishHolidays(2027)['2027-03-28'],'Påskdagen');
  assert.equal(swedishHolidays(2026)['2026-06-20'],'Midsommardagen');
  assert.ok(cleaningFreeReason('2026-12-26',settings));
  assert.equal(cleaningFreeReason('2026-11-14',settings,['2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13']),'Efter helt stängd vardagsvecka');
  assert.equal(cleaningFreeReason('2026-11-07',{...settings,reDates:['2026-11-08']}),'RE-helg');
  assert.equal(cleaningFreeReason('2026-12-12',{...settings,breaks:[{start:'2026-12-13',end:'2026-12-20'}]}),'Jullov eller stängningsperiod');
  assert.equal(cleaningFreeReason('2026-11-07',settings),null);
});
test('partial weekend leave preserves place, RE extras preserve the ordinary place, planning never mutates input',()=>{
  const fs=[{...families[0],leave:[{start:'2026-11-08',end:'2026-11-08'}]},families[1],families[2]],queue=[1,2,3];
  const plan=generateCleaning({start:'2026-11-07',end:'2026-11-15',families:fs,queue,settings});
  assert.equal(plan.assignments[0].family,2);assert.equal(plan.assignments[1].family,1);assert.deepEqual(queue,[1,2,3]);
  const extra=generateCleaning({start:'2026-11-07',end:'2026-11-08',families:fs,queue,settings:{...settings,extras:[{id:'extra',family:3,reDate:'2026-10-10',reason:'Missad RE'}]}});
  assert.equal(extra.assignments[0].extraId,'extra');assert.deepEqual(extra.queueAfter,queue);
});
test('sent original survives swaps and later family edits; history uses original APT assignments',()=>{
  let state=createState(families);const p=state.periods[0],id=p.id;p.aptDates=['2026-11-04'];state=generate(state);
  state=run(state,'period.approve',{periodId:id,keys:periodWarnings(state,state.periods[0]).filter(w=>['interval','info'].includes(w.type)).map(warningKey)}).state;
  state=run(state,'period.send',{periodId:id}).state;const original=structuredClone(state.periods[0].original);
  const key='2026-11-04:0',replacement=families.find(f=>!Object.entries(state.periods[0].assignments).some(([k,a])=>k.startsWith('2026-11-04')&&a.family===f.id));
  state=run(state,'period.swap',{periodId:id,key,family:replacement.id,reason:'Överenskommet byte'}).state;
  assert.deepEqual(state.periods[0].original,original);assert.equal(state.periods[0].assignments[key].family,replacement.id);
  state=run(state,'period.create',{start:'2027-02-01'}).state;
  assert.equal(historyFor(state,state.periods[1]).find(r=>r.date==='2026-11-04'&&r.level===0).family,original.assignments[key].family);
  assert.throws(()=>run(state,'period.assign',{periodId:id,key,family:replacement.id}),/utkast/);
});
test('send requires reviewed primary intervals and hard errors cannot be approved away',()=>{
  let state=generate(createState(families.slice(0,3)));const id=state.periods[0].id;
  assert.throws(()=>run(state,'period.send',{periodId:id}),/Godkänn/);
  state.periods[0].assignments['2026-11-02:0'].family=null;
  state=run(state,'period.approve',{periodId:id,keys:periodWarnings(state,state.periods[0]).filter(w=>['interval','info'].includes(w.type)).map(warningKey)}).state;
  assert.throws(()=>run(state,'period.send',{periodId:id}),/obemannade/);
});
test('D1 restore fetches the saved snapshot and preserves global family and queue state',async()=>{
  const db=database();let ws=await readWorkspace(db,true);const id=ws.state.periods[0].id;
  ws=await commitCommand(db,{revision:0,type:'period.assign',payload:{periodId:id,key:'2026-11-02:0',family:1}},actor,true);
  const [version]=await historyPage(db,id);
  ws=await commitCommand(db,{revision:1,type:'family.save',payload:{family:{...ws.state.families[0],name:'Ändrat'}}},actor);
  ws=await commitCommand(db,{revision:2,type:'period.restore',payload:{periodId:id,versionId:version.id,snapshot:{id:'forged'}}},actor);
  assert.deepEqual(ws.state.periods[0].assignments,{});assert.equal(ws.state.families[0].name,'Ändrat');assert.equal(ws.revision,3);
});
test('cleaning plan only advances queue on send, rejects stale family data and carries cancelled turn forward',()=>{
  let state=generate(createState(families));const id=state.periods[0].id;
  const queue=structuredClone(state.queue);state=run(state,'cleaning.generate',{periodId:id}).state;assert.deepEqual(state.queue,queue);
  let changed=structuredClone(state);changed.families[0].leave=[{start:'2026-11-07',end:'2026-11-08'}];
  changed=run(changed,'period.approve',{periodId:id,keys:periodWarnings(changed,changed.periods[0]).filter(w=>['interval','info'].includes(w.type)).map(warningKey)}).state;
  assert.throws(()=>run(changed,'period.send',{periodId:id}),/Familjeregler/);
  state=run(state,'period.approve',{periodId:id,keys:periodWarnings(state,state.periods[0]).filter(w=>['interval','info'].includes(w.type)).map(warningKey)}).state;
  state=run(state,'period.send',{periodId:id}).state;const fixed=structuredClone(state.periods[0].original),before=state.periods[0].cleaning.assignments;
  const cancelled=run(state,'cleaning.cancel',{periodId:id,date:before[0].date,reason:'Stängt'}).state;
  assert.equal(cancelled.periods[0].cleaning.assignments[0].family,before[0].family);assert.equal(cancelled.periods[0].cleaning.assignments[0].date,before[1].date);assert.equal(cancelled.cleaningCarry.length,1);
  assert.deepEqual(cancelled.periods[0].original,fixed);
});
test('xlsx contains typed literal names, current staffing and frozen original in separate columns',()=>{
  const state=createState(families);state.periods[0].assignments={'2026-11-02:0':{family:1,locked:true}};
  const sheets=exportSheets(state,state.periods[0]);assert.match(sheets.Jourschema[0][0],/UTKAST/);
  const archive=unzipSync(makeWorkbook({...sheets,Literal:[['=HYPERLINK("bad")','<&ä>']]}));
  assert.ok(archive['xl/workbook.xml']);const literal=strFromU8(archive['xl/worksheets/sheet6.xml']);assert.ok(literal.includes('inlineStr'));assert.ok(literal.includes('&lt;&amp;ä&gt;'));assert.ok(!literal.includes('<f>'));
});
test('a formerly exempt household has no invented historical or APT debt',()=>{
  const state=createState(families.slice(0,3)),prior=state.periods[0];
  prior.original={families:[{...families[0],status:'Jourbefriad'},families[1],families[2]],assignments:{'2026-11-04:0':{family:2},'2026-11-05:0':{family:3}},aptDates:['2026-11-04']};
  const next=run(state,'period.create',{start:'2027-02-01'}).state;
  const adjusted=weightedFamilies(next,next.periods[1]);assert.equal(adjusted[0].historyBalance,0);assert.equal(adjusted[0].aptHistoryBalance,0);assert.equal(adjusted[1].historyBalance,0);assert.equal(adjusted[2].historyBalance,0);
});
test('per-day level overrides are checked and obsolete locked passes can be removed explicitly',()=>{
  let state=createState(families);const p=state.periods[0],id=p.id;p.levels=2;p.levelOverrides={'2026-11-02':3,'2026-11-03':0};
  p.assignments={'2026-11-03:0':{family:1,locked:true}};
  state=generate(state);assert.ok(state.periods[0].assignments['2026-11-02:2']);assert.ok(periodWarnings(state,state.periods[0]).some(w=>w.date==='2026-11-03'&&w.type==='locked'));
  state=run(state,'period.clear-pass',{periodId:id,key:'2026-11-03:0'}).state;
  assert.ok(!periodWarnings(state,state.periods[0]).some(w=>w.date==='2026-11-03'));
  state.periods[0].aptDates=[];assert.throws(()=>run(state,'period.send',{periodId:id}),/APT/);
});
