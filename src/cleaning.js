import { addDays, datesBetween, holidayMap, utcDate, within } from './dates.js';
import { childExempt, familyActive } from './planner.js';
export function cleaningFreeReason(saturday, settings, closedDates=[]) {
  const sunday=addDays(saturday,1);
  if(!settings.autumnRE||!settings.springRE) return 'RE-dagar saknas';
  if(saturday<=settings.autumnRE||sunday>=settings.springRE) return 'Utanför städperioden';
  if([settings.autumnRE,settings.springRE,...(settings.reDates??[])].some(date=>date>=saturday&&date<=sunday)) return 'RE-helg';
  if((settings.cancelled??[]).includes(saturday)) return 'Inställd städhelg';
  const longWeekend=datesBetween(addDays(saturday,-1),addDays(saturday,2));
  const holidays=holidayMap(saturday,sunday);
  if(longWeekend.some(date=>holidays[date])) return 'Storhelg eller afton';
  if([saturday,sunday].some(date=>within(date,settings.breaks))) return 'Jullov eller stängningsperiod';
  const priorWeek=datesBetween(addDays(saturday,-5),addDays(saturday,-1));
  if(priorWeek.every(date=>closedDates.includes(date)||holidays[date]||within(date,settings.breaks))) return 'Efter helt stängd vardagsvecka';
  return null;
}
export function cleaningAvailable(family,saturday) {
  return Boolean(family?.id) && [saturday,addDays(saturday,1)].every(date=>familyActive(family,date)&&!childExempt(family,date)&&!within(date,family.leave));
}
export function generateCleaning({start,end,families,queue,settings,closedDates=[],completedExtras=[],carry=[]}) {
  const pending=[...(settings.extras??[])].filter(extra=>!completedExtras.includes(extra.id));
  const postponed=structuredClone(carry);
  const order=[...queue],assignments=[],free=[];
  for(const date of datesBetween(start,end)) {
    if(utcDate(date).getUTCDay()!==6) continue;
    const reason=cleaningFreeReason(date,settings,closedDates);
    if(reason) {free.push({date,reason});continue;}
    const carryIndex=postponed.findIndex(entry=>cleaningAvailable(families.find(f=>f.id===entry.family),date));
    if(carryIndex>=0) {const [entry]=postponed.splice(carryIndex,1);assignments.push({...entry,date});continue;}
    // Extras are separate queue posts. Serving one never moves the ordinary post.
    const extra=pending.find(entry=>entry.reDate<=date&&cleaningAvailable(families.find(f=>f.id===entry.family)??{},date));
    if(extra) {assignments.push({date,family:extra.family,extraId:extra.id,reason:extra.reason,department:settings.departments?.[assignments.length%(settings.departments.length||1)]??''});pending.splice(pending.indexOf(extra),1);continue;}
    const index=order.findIndex(id=>{const f=families.find(f=>f.id===id);return f&&cleaningAvailable(f,date);});
    if(index<0) {assignments.push({date,family:null,reason:'Ingen tillgänglig tilldelning'});continue;}
    const [id]=order.splice(index,1);order.push(id);
    assignments.push({date,family:id,department:settings.departments?.[assignments.length%(settings.departments.length||1)]??''});
  }
  return {assignments,free,queueAfter:order,extrasAfter:pending.map(extra=>extra.id)};
}
