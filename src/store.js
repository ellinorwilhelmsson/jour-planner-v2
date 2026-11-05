import { AppError, applyCommand, createState } from './model.js';
import { demoFamilies } from './seed.js';
export async function readWorkspace(db,demo=false) {
  if(!db) throw new AppError('Lagringen är inte konfigurerad.',503);
  let row=await db.prepare('SELECT revision, body FROM app_state WHERE id=1').first();
  if(!row) {
    const initial=createState(demo?demoFamilies:[]);
    await db.prepare('INSERT OR IGNORE INTO app_state(id,revision,body,updated_at) VALUES(1,0,?,?)').bind(JSON.stringify(initial),new Date().toISOString()).run();
    row=await db.prepare('SELECT revision, body FROM app_state WHERE id=1').first();
  }
  return {revision:row.revision,state:JSON.parse(row.body)};
}
export async function commitCommand(db,request,actor,demo=false) {
  if(!request||typeof request.type!=='string'||(request.payload!==undefined&&(!request.payload||typeof request.payload!=='object'||Array.isArray(request.payload)))) throw new AppError('Ogiltigt underlag.');
  const current=await readWorkspace(db,demo);
  if(!Number.isInteger(request.revision)||request.revision!==current.revision) throw new AppError('Underlaget har ändrats i ett annat fönster. Hämta senaste versionen innan du sparar igen.',409);
  const command={type:request.type,payload:structuredClone(request.payload??{})};
  if(command.type==='period.restore') {
    const row=await db.prepare('SELECT scope, before_json FROM audit_log WHERE id=?').bind(command.payload.versionId).first();
    if(!row||row.scope!==command.payload.periodId||!row.before_json) throw new AppError('Utkastversionen finns inte.',404);
    command.payload.snapshot=JSON.parse(row.before_json);
  }
  const next=applyCommand(current.state,command,{actor});
  const {event}=next;
  const updates=await db.batch([
    db.prepare('UPDATE app_state SET body=?,revision=revision+1,updated_at=? WHERE id=1 AND revision=?').bind(JSON.stringify(next.state),event.at,current.revision),
    db.prepare('INSERT INTO audit_log(id,revision,scope,actor,happened_at,type,description,before_json,after_json) SELECT ?,?,?,?,?,?,?,?,? WHERE changes()>0').bind(event.id,current.revision+1,event.scope,event.actor,event.at,event.type,event.description,event.before===null?null:JSON.stringify(event.before),event.after===null?null:JSON.stringify(event.after))
  ]);
  if(!updates[0].meta.changes) throw new AppError('Någon annan sparade samtidigt. Hämta senaste versionen och försök igen.',409);
  return {state:next.state,revision:current.revision+1,periodId:next.periodId};
}
export async function historyPage(db,scope,before=Number.MAX_SAFE_INTEGER) {
  const rows=await db.prepare('SELECT id, revision, scope, actor, happened_at AS at, type, description, before_json, after_json FROM audit_log WHERE (scope=? OR ?=\'all\') AND revision<? ORDER BY revision DESC LIMIT 50').bind(scope,scope,before).all();
  return rows.results.map(row=>({...row,before:row.before_json?JSON.parse(row.before_json):null,after:row.after_json?JSON.parse(row.after_json):null,before_json:undefined,after_json:undefined}));
}
