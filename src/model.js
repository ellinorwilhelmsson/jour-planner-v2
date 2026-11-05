import { datesBetween, holidayMap, validDate, within } from './dates.js';
import { available, familyName, obligation, reviewSchedule } from './planner.js';
import { cleaningAvailable, generateCleaning } from './cleaning.js';
import { defaultDepartments, demoFamilies } from './seed.js';

export class AppError extends Error { constructor(message,status=400) {super(message);this.status=status;} }
const check=(condition,message)=>{if(!condition) throw new AppError(message);};
const clone=value=>structuredClone(value);
const text=(value,max=160)=>String(value??'').trim().slice(0,max);
const date=value=>{check(validDate(value),'Ange ett giltigt datum.');return value;};
const ranges=value=>(value??[]).map(range=>{const start=date(range.start),end=date(range.end);check(start<=end,'Från-datum måste ligga före till-datum.');return {start,end,reason:text(range.reason)};});
export const warningKey=warning=>JSON.stringify([warning.type,warning.date,warning.family??null,warning.message]);
export function closedDates(period) {
  const map=holidayMap(period.start,period.end);
  return [...new Set([...(period.closedDates??[]),...datesBetween(period.start,period.end).filter(day=>map[day]||within(day,period.closures))])];
}
export function makePeriod(start,id=crypto.randomUUID()) {
  date(start);check(start.endsWith('-01'),'Perioden ska börja den första i en månad.');
  const endDate=new Date(`${start}T00:00:00Z`);endDate.setUTCMonth(endDate.getUTCMonth()+3,0);
  return {id,start,end:endDate.toISOString().slice(0,10),levels:3,levelOverrides:{},aptDates:[],closedDates:[],closures:[],assignments:{},generated:false,status:'draft',original:null,approved:[],cleaning:null,published:null};
}
export function createState(families) {
  const demo=families.length>0;
  return {schemaVersion:1,families:clone(families),queue:families.map(f=>f.id),periods:[makePeriod('2026-11-01','initial-period')],calendarSettings:{time:'08:00',duration:30,timeZone:'Europe/Stockholm'},cleaningSettings:{autumnRE:demo?'2026-10-10':'',springRE:demo?'2027-05-08':'',reDates:[],breaks:demo?[{start:'2026-12-21',end:'2027-01-06',reason:'Jullov (testdatum)'}]:[],cancelled:[],departments:clone(defaultDepartments),extras:[]},completedExtras:[]};
}
export function historyFor(state,period) {
  return state.periods.filter(p=>p.id!==period.id&&p.original&&p.end<period.start).flatMap(p=>Object.entries(p.original.assignments).filter(([,a])=>a.family).map(([key,a])=>({date:key.split(':')[0],level:Number(key.split(':')[1]),family:a.family,apt:p.original.aptDates.includes(key.split(':')[0])&&key.endsWith(':0')})));
}
export function weightedFamilies(state,period) {
  const load=new Map(),aptLoad=new Map();
  for(const prior of state.periods.filter(p=>p.id!==period.id&&p.original&&p.end<period.start)) {
    const fs=prior.original.families,entries=Object.entries(prior.original.assignments).filter(([,a])=>a.family);
    const weights=new Map(fs.map(f=>[f.id,obligation(f,prior.start,prior.end)]));
    const sum=[...weights.values()].reduce((a,b)=>a+b,0);
    for(const f of fs) load.set(f.id,(load.get(f.id)??0)+entries.filter(([,a])=>a.family===f.id).length-(sum?entries.length*weights.get(f.id)/sum:0));
    for(const day of prior.original.aptDates) {
      const assigned=prior.original.assignments[`${day}:0`]?.family;if(!assigned) continue;
      const eligible=fs.filter(f=>obligation(f,day,day)>0);
      for(const f of fs) aptLoad.set(f.id,(aptLoad.get(f.id)??0)+(f.id===assigned?1:0)-(eligible.some(e=>e.id===f.id)?1/eligible.length:0));
    }
  }
  return state.families.map(f=>({...f,historyBalance:load.get(f.id)??0,aptHistoryBalance:aptLoad.get(f.id)??0}));
}
export function periodWarnings(state,period) {
  if(!period.generated) return [];
  return reviewSchedule({start:period.start,end:period.end,families:state.families,levels:period.levels,levelOverrides:period.levelOverrides,closed:closedDates(period),assignments:period.assignments});
}
export function calendarRows(state,period) {
  const names=new Map(state.families.map(f=>[f.id,f]));
  return Object.entries(period.assignments).sort(([a],[b])=>a.localeCompare(b)).filter(([,a])=>a.family).map(([key,a])=>{
    const [day,level]=key.split(':');return {key,date:day,level:Number(level),name:names.has(a.family)?familyName(names.get(a.family),day):'Avslutad tilldelning',family:a.family,apt:period.aptDates.includes(day)&&Number(level)===0};
  });
}
export function publicationChanges(state,period) {
  const current=calendarRows(state,period),previous=period.published?.rows??[];
  const before=new Map(previous.map(row=>[row.key,row])),after=new Map(current.map(row=>[row.key,row]));
  return [...new Set([...before.keys(),...after.keys()])].flatMap(key=>{
    const old=before.get(key),next=after.get(key);
    if(JSON.stringify(old)===JSON.stringify(next)) return [];
    return [{key,type:!old?'create':!next?'delete':'update',before:old??null,after:next??null}];
  });
}
function validatedFamily(input,id) {
  const childRecords=(input.childRecords??[]).map(child=>({name:text(child.name,50),start:child.start?date(child.start):'',end:child.end?date(child.end):'',exemptionWeeks:Number(child.exemptionWeeks??4)}));
  check(childRecords.length>0&&childRecords.length<=20&&childRecords.every(c=>c.name&&Number.isInteger(c.exemptionWeeks)&&c.exemptionWeeks>=0&&c.exemptionWeeks<=52&&(!c.start||!c.end||c.start<=c.end)),'Kontrollera barnens namn, datum och befrielselängd.');
  const result={id,name:text(input.name,60),group:text(input.group,60),childRecords,children:new Intl.ListFormat('sv',{type:'conjunction'}).format(childRecords.map(c=>c.name)),status:input.status==='Jourbefriad'?'Jourbefriad':'Aktiv',start:input.start?date(input.start):'',end:input.end?date(input.end):'',exemptions:ranges(input.exemptions),leave:ranges(input.leave),blockedWeekdays:[...new Set(input.blockedWeekdays??[])].filter(day=>Number.isInteger(day)&&day>=1&&day<=5)};
  check(result.name,'Efternamn saknas.');check(!result.start||!result.end||result.start<=result.end,'Jourstart måste ligga före slutdatum.');return result;
}
export function applyCommand(previous,command,{actor,now=new Date().toISOString(),id=crypto.randomUUID()}={}) {
  check(actor,'Verifierad användare saknas.');
  const state=clone(previous),payload=command.payload??{};
  let period=state.periods.find(p=>p.id===payload.periodId),before=null,scope=period?.id??'global';
  let description=command.type;
  if(period) before=clone(period);
  const draft=()=>check(period?.status==='draft','Endast utkast får ändras på detta sätt.');
  switch(command.type) {
    case 'demo.seed': {
      check(state.families.length===0,'Det finns redan familjer. Testdata kan bara läggas in i ett tomt register.');
      before={families:[],queue:clone(state.queue),cleaningSettings:clone(state.cleaningSettings)};state.families=clone(demoFamilies);state.queue=demoFamilies.map(f=>f.id);state.demoData=true;state.cleaningSettings.departments=clone(defaultDepartments);
      description='Lade till 40 testfamiljer: 35 jourskyldiga och 5 jourbefriade';
      return {state,event:{id,scope:'global',type:command.type,actor,at:now,description,before,after:{families:clone(state.families),queue:clone(state.queue),cleaningSettings:clone(state.cleaningSettings)}}};
    }
    case 'departments.set': {
      const departments=(payload.departments??[]).map(v=>text(v,60));check(departments.length>0&&departments.length<=20&&departments.every(Boolean)&&new Set(departments).size===departments.length,'Ange unika avdelningsnamn.');
      before=clone(state.cleaningSettings);state.cleaningSettings.departments=departments;description='Ändrade avdelningar';
      return {state,event:{id,scope:'global',type:command.type,actor,at:now,description,before,after:clone(state.cleaningSettings)}};
    }
    case 'family.save': {
      const old=state.families.find(f=>f.id===payload.family.id);before=old?clone(old):null;
      const family=validatedFamily(payload.family,old?.id??Math.max(0,...state.families.map(f=>f.id))+1);
      if(old) state.families[state.families.indexOf(old)]=family;else {state.families.push(family);state.queue.push(family.id);}
      description=`${old?'Ändrade':'Lade till'} ${familyName(family)}`;scope='global';
      return {state,event:{id,scope,type:command.type,actor,at:now,description,before,after:family}};
    }
    case 'family.archive': {
      const f=state.families.find(f=>f.id===payload.familyId);check(f,'Tilldelningen saknas.');before=clone(f);f.archived=true;
      // Retain records used by old schedules; an explicit end date controls future obligation.
      check(f.end||f.childRecords.every(c=>c.end),'Ange slutdatum för sista barnet innan arkivering.');
      description=`Arkiverade ${familyName(f)}`;
      return {state,event:{id,scope:'global',type:command.type,actor,at:now,description,before,after:f}};
    }
    case 'period.create': {
      period=makePeriod(payload.start,id);check(!state.periods.some(p=>p.start<=period.end&&p.end>=period.start),'Perioden överlappar en befintlig period.');state.periods.push(period);scope=period.id;description='Skapade schemaperiod';break;
    }
    case 'period.update': {
      draft();check(payload.start===period.start,'Skapa en ny period för att ändra datumgränser.');
      check([2,3].includes(payload.levels),'Välj två eller tre jourer.');
      const apt=[...new Set(payload.aptDates??[])];check(apt.every(d=>validDate(d)&&d>=period.start&&d<=period.end)&&new Set(apt.map(d=>d.slice(0,7))).size===apt.length,'Ange högst ett giltigt APT-datum per månad i perioden.');
      const closed=(payload.closedDates??[]).map(date);check(closed.every(d=>d>=period.start&&d<=period.end),'Stängt datum ligger utanför perioden.');
      const overrides=payload.levelOverrides??{};check(Object.entries(overrides).every(([day,count])=>validDate(day)&&day>=period.start&&day<=period.end&&[0,1,2,3].includes(count)),'Kontrollera avvikande journivåer.');
      Object.assign(period,{levels:payload.levels,aptDates:apt,closedDates:closed,closures:ranges(payload.closures),levelOverrides:overrides,approved:[]});description='Ändrade periodens datumregler';break;
    }
    case 'period.generate': {
      draft();check(payload.assignments&&typeof payload.assignments==='object'&&!Array.isArray(payload.assignments),'Generera ett förslag i appen först.');
      const proposed={},closed=new Set(closedDates(period));
      for(const [key,value] of Object.entries(payload.assignments)) {
        check(/^\d{4}-\d{2}-\d{2}:[0-2]$/.test(key)&&key.slice(0,10)>=period.start&&key.slice(0,10)<=period.end,'Förslaget innehåller ett ogiltigt pass.');
        check(value&&value.locked===false&&(value.family===null||state.families.some(f=>f.id===value.family)),'Förslaget innehåller en ogiltig tilldelning.');
        const [day,l]=key.split(':');
        check(!closed.has(day)&&![0,6].includes(new Date(`${day}T00:00:00Z`).getUTCDay())&&Number(l)<(period.levelOverrides[day]??period.levels),'Förslaget innehåller pass på ett stängt datum eller en inaktiv journivå.');
        check(!value.family||available(state.families.find(f=>f.id===value.family),day),'Förslaget strider mot familjereglerna.');
        check(!value.family||!Object.entries(proposed).some(([k,a])=>k.startsWith(day)&&a.family===value.family),'Förslaget dubbelbokar en familj.');
        proposed[key]={family:value.family,locked:false};
      }
      for(const [key,value] of Object.entries(period.assignments)) if(value.locked) proposed[key]=clone(value);
      const problems=reviewSchedule({start:period.start,end:period.end,families:state.families,levels:period.levels,levelOverrides:period.levelOverrides,closed:closedDates(period),assignments:proposed});
      check(!problems.some(w=>['unavailable','departed','locked'].includes(w.type)&&!Object.entries(period.assignments).some(([key,a])=>a.locked&&key.startsWith(w.date))),'Förslaget strider mot familjereglerna. Generera igen.');
      period.assignments=proposed;period.generated=true;period.approved=[];description='Fördelade om olåsta jourpass';break;
    }
    case 'period.assign': {
      draft();check(/^\d{4}-\d{2}-\d{2}:[0-2]$/.test(payload.key),'Ogiltigt pass.');const [day,level]=payload.key.split(':');
      check(day>=period.start&&day<=period.end&&Number(level)<(period.levelOverrides[day]??period.levels)&&!closedDates(period).includes(day)&&![0,6].includes(new Date(`${day}T00:00:00Z`).getUTCDay()),'Datumet har inte detta jourpass.');
      const candidate=payload.family===null?null:state.families.find(f=>f.id===payload.family);check(payload.family===null||candidate,'Tilldelningen saknas.');
      check(!candidate||available(candidate,day),'Vald tilldelning är inte tillgänglig på datumet.');
      check(!candidate||!Object.entries(period.assignments).some(([key,a])=>key!==payload.key&&key.startsWith(day)&&a.family===candidate.id),'Vald familj har redan jour samma dag.');
      const changed=period.assignments[payload.key]?.family!==payload.family;
      period.assignments[payload.key]={family:payload.family,locked:changed||Boolean(payload.locked)};period.generated=true;period.approved=[];description='Ändrade jourpass och låsning';break;
    }
    case 'period.approve': {
      draft();const warnings=periodWarnings(state,period);const valid=new Set(warnings.filter(w=>w.type==='interval'||w.type==='info').map(warningKey));
      check((payload.keys??[]).every(key=>valid.has(key)),'Varningarna har ändrats. Kontrollera igen.');
      period.approved=[...new Set([...period.approved,...payload.keys])];description='Godkände intervallavvikelser';break;
    }
    case 'period.clear-pass': {
      draft();check(period.assignments[payload.key],'Passet saknas.');delete period.assignments[payload.key];period.approved=[];description=`Tog bort pass ${text(payload.key)}`;break;
    }
    case 'period.send': {
      draft();check(period.generated,'Generera ett schema först.');
      const closed=new Set(closedDates(period));
      const openMonths=new Set(datesBetween(period.start,period.end).filter(day=>![0,6].includes(new Date(`${day}T00:00:00Z`).getUTCDay())&&!closed.has(day)&&(period.levelOverrides[day]??period.levels)>0).map(day=>day.slice(0,7)));
      check([...openMonths].every(month=>period.aptDates.some(day=>day.startsWith(month))),'Ange ett APT-datum per öppen månad under Period och datum innan utskick.');
      check(period.aptDates.every(day=>![0,6].includes(new Date(`${day}T00:00:00Z`).getUTCDay())&&!closed.has(day)&&(period.levelOverrides[day]??period.levels)>0),'APT-datum måste ha ett öppet förstajourpass.');
      const warnings=periodWarnings(state,period);
      check(!warnings.some(w=>!['interval','info'].includes(w.type)),'Rätta obemannade eller otillåtna pass innan schemat markeras som utskickat.');
      check(warnings.filter(w=>w.type==='interval').every(w=>period.approved.includes(warningKey(w))),'Godkänn eller rätta varningarna för jour 1–2 först.');
      if(period.cleaning) {
        check(period.cleaning.sourceQueue===JSON.stringify(state.queue)&&period.cleaning.sourceSettings===JSON.stringify(state.cleaningSettings),'Städkön har ändrats. Generera städplanen igen.');
        check(period.cleaning.sourceFamilies===JSON.stringify(state.families)&&period.cleaning.sourceCarry===JSON.stringify(state.cleaningCarry??[]),'Familjeregler eller uppskjutna städturer har ändrats. Generera städplanen igen.');
        check(!state.periods.some(p=>p.id!==period.id&&p.cleaning&&p.original&&p.end>period.start),'Fastställ städperioderna i datumordning.');
        check(!period.cleaning.assignments.some(a=>!a.family),'Städplanen har obemannade helger.');
        state.queue=period.cleaning.queueAfter;
        const usedCarry=new Set(period.cleaning.assignments.map(a=>a.carryId).filter(Boolean));state.cleaningCarry=(state.cleaningCarry??[]).filter(a=>!usedCarry.has(a.carryId));
        state.completedExtras=[...new Set([...state.completedExtras,...period.cleaning.assignments.filter(a=>a.extraId).map(a=>a.extraId)])];
      }
      period.original={assignments:clone(period.assignments),aptDates:clone(period.aptDates),families:clone(state.families),cleaning:clone(period.cleaning),sentAt:now};period.status='sent';description='Markerade schemat som utskickat och fastställde originalet';break;
    }
    case 'period.swap': {
      check(period&&['draft','sent'].includes(period.status),'Arkiverade scheman kan inte ändras.');
      const keys=[payload.key,payload.otherKey].filter(Boolean),closed=new Set(closedDates(period));
      check(period.status==='sent'||payload.otherKey,'Välj två pass att byta i utkastet.');
      check(!payload.otherKey||payload.key!==payload.otherKey,'Välj två olika pass.');
      for(const key of keys) {
        check(typeof key==='string'&&/^\d{4}-\d{2}-\d{2}:[0-2]$/.test(key),'Ogiltigt pass.');
        const [day,level]=key.split(':');
        check(validDate(day)&&day>=period.start&&day<=period.end&&![0,6].includes(new Date(`${day}T00:00:00Z`).getUTCDay())&&!closed.has(day)&&Number(level)<(period.levelOverrides[day]??period.levels),'Bytet måste gälla öppna jourpass i samma period.');
      }
      if(period.status==='sent') check(text(payload.reason),'Ange orsaken till jourbytet.');
      const current=period.assignments[payload.key]??{family:null,locked:false};
      period.assignments[payload.key]=current;
      if(payload.otherKey) {
        const other=period.assignments[payload.otherKey]??{family:null,locked:false};
        check(current.family!==other.family,'Passen har redan samma tilldelning.');
        period.assignments[payload.otherKey]=other;
        [current.family,other.family]=[other.family,current.family];
        if(period.status==='draft') {current.locked=true;other.locked=true;}
      } else {check(state.families.some(f=>f.id===payload.family),'Välj en tilldelning.');current.family=payload.family;}
      for(const key of keys) {
        const a=period.assignments[key],day=key.slice(0,10),f=state.families.find(f=>f.id===a.family);
        check(a.family===null||(f&&available(f,day)),'Bytet går inte: en tilldelning är inte tillgänglig på sitt nya datum.');
        check(!a.family||!Object.entries(period.assignments).some(([k,v])=>k!==key&&k.startsWith(day)&&v.family===a.family),'Bytet skulle ge samma familj flera jourpass samma dag.');
      }
      if(period.status==='draft') {period.generated=true;period.approved=[];}
      description=period.status==='draft'?'Bytte två jourpass i utkastet och låste båda':`Registrerade jourbyte: ${text(payload.reason)}`;break;
    }
    case 'period.archive': check(period,'Perioden saknas.');check(period.status!=='archived','Perioden är redan arkiverad.');period.status='archived';description='Arkiverade schemaperiod';break;
    case 'period.unarchive': check(period?.status==='archived','Perioden är inte arkiverad.');period.status=period.original?'sent':'draft';description='Återöppnade arkiverad period';break;
    case 'period.delete': draft();check(!period.generated&&period.start>now.slice(0,10),'Endast oanvända framtida utkast kan tas bort. Arkivera övriga perioder.');state.periods=state.periods.filter(p=>p.id!==period.id);description='Tog bort oanvänt framtida utkast';break;
    case 'period.restore': {
      draft();check(payload.snapshot?.id===period.id&&payload.snapshot.status==='draft'&&!payload.snapshot.original,'Endast en utkastversion av samma period kan återställas.');
      const published=period.published;Object.assign(period,clone(payload.snapshot),{published});description='Återställde tidigare utkastversion; gemensamma uppgifter behölls';break;
    }
    case 'queue.move': {
      const index=state.queue.indexOf(payload.familyId),target=index+payload.direction;check(index>=0&&[-1,1].includes(payload.direction)&&target>=0&&target<state.queue.length,'Ogiltig köflytt.');before=clone(state.queue);[state.queue[index],state.queue[target]]=[state.queue[target],state.queue[index]];description='Ändrade ordinarie städkö';
      return {state,event:{id,scope:'global',type:command.type,actor,at:now,description,before,after:state.queue}};
    }
    case 'cleaning.settings': {
      before=clone(state.cleaningSettings);const settings=payload.settings;
      check(validDate(settings.autumnRE)&&validDate(settings.springRE)&&settings.autumnRE<settings.springRE,'Ange höstens och vårens RE-dag i datumordning.');
      const extras=(settings.extras??[]).map(extra=>{check(state.families.some(f=>f.id===extra.family)&&text(extra.reason)&&validDate(extra.reDate),'Extrapass behöver tilldelning, RE-datum och orsak.');return {id:text(extra.id,80)||crypto.randomUUID(),family:extra.family,reason:text(extra.reason,500),reDate:extra.reDate};});
      state.cleaningSettings={autumnRE:settings.autumnRE,springRE:settings.springRE,reDates:(settings.reDates??[]).map(date),breaks:ranges(settings.breaks),cancelled:(settings.cancelled??[]).map(date),departments:(settings.departments??[]).map(v=>text(v,60)).filter(Boolean),extras};description='Ändrade städregler och RE-extrapass';
      return {state,event:{id,scope:'global',type:command.type,actor,at:now,description,before,after:state.cleaningSettings}};
    }
    case 'cleaning.generate': {
      draft();check(validDate(state.cleaningSettings.autumnRE)&&validDate(state.cleaningSettings.springRE),'Ange höstens och vårens RE-dag under Städregler först.');period.cleaning={...generateCleaning({start:period.start,end:period.end,families:state.families,queue:state.queue,settings:state.cleaningSettings,closedDates:closedDates(period),completedExtras:state.completedExtras,carry:state.cleaningCarry??[]}),sourceQueue:JSON.stringify(state.queue),sourceSettings:JSON.stringify(state.cleaningSettings),sourceFamilies:JSON.stringify(state.families),sourceCarry:JSON.stringify(state.cleaningCarry??[])};description='Genererade städplan utan att flytta den gemensamma kön';break;
    }
    case 'cleaning.cancel': {
      check(period?.status==='sent'&&period.cleaning,'Välj en utskickad städplan.');
      check(text(payload.reason),'Ange en orsak.');date(payload.date);
      check(payload.date>=now.slice(0,10),'Passerade städhelger kan inte ställas in.');
      check(!state.periods.some(p=>p.id!==period.id&&p.original&&p.cleaning&&p.start>period.start),'Det finns en senare fastställd städplan. Hantera den först innan tidigare uppdrag flyttas.');
      const plan=period.cleaning;check(plan.assignments.some(a=>a.date===payload.date),'Städhelgen saknas.');
      const remainingDates=plan.assignments.filter(a=>a.date>payload.date).map(a=>a.date);
      const pending=plan.assignments.filter(a=>a.date>=payload.date&&a.family).map(a=>({...a,carryId:a.carryId??crypto.randomUUID()}));
      plan.assignments=plan.assignments.filter(a=>a.date<payload.date);
      for(const day of remainingDates) {
        const index=pending.findIndex(a=>cleaningAvailable(state.families.find(f=>f.id===a.family),day));
        if(index>=0) {const [a]=pending.splice(index,1);plan.assignments.push({...a,date:day});}
        else plan.assignments.push({date:day,family:null,reason:'Ingen av de uppskjutna tilldelningarna är tillgänglig'});
      }
      plan.free.push({date:payload.date,reason:`Inställd: ${text(payload.reason)}`});
      state.cleaningCarry=[...pending,...(state.cleaningCarry??[])];
      description=`Ställde in städhelg ${payload.date}: ${text(payload.reason)}. ${pending.length} uppdrag förs vidare till nästa period.`;break;
    }
    default: throw new AppError('Åtgärden stöds inte.');
  }
  if(period) period.updatedAt=now;
  return {state,event:{id,scope,type:command.type,actor,at:now,description,before,after:period?clone(period):null},periodId:period?.id};
}
