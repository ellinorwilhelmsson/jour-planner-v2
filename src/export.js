import { zipSync, strToU8 } from 'fflate';
import { familyName, obligation, periodDays } from './planner.js';
import { closedDates } from './model.js';
export const xml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
export function exportSheets(state,period) {
  const name=(id,date,original=false)=>{const f=(original?period.original?.families:state.families)?.find(f=>f.id===id);return f?familyName(f,date):id?'Avslutad tilldelning':'Obemannat';};
  const closed=new Set(closedDates(period)),source=period.original??period;
  const status=period.original?'Utskickat':'UTKAST';
  const heading=[`${status} · ${period.start} – ${period.end}`];
  const schedule=[heading,['Datum','Jour','Aktuell bemanning','Original','Låst','APT / stängt']];
  for(const day of periodDays(period.start,period.end)) {
    if([0,6].includes(new Date(`${day}T00:00:00Z`).getUTCDay())) continue;
    if(closed.has(day)||(period.levelOverrides[day]??period.levels)===0) {schedule.push([day,'','','','','Stängt']);continue;}
    for(let l=0;l<(period.levelOverrides[day]??period.levels);l++) {const key=`${day}:${l}`,a=period.assignments[key];schedule.push([day,l+1,name(a?.family,day),period.original?name(period.original.assignments[key]?.family,day,true):'',a?.locked?'Ja':'Nej',l===0&&period.aptDates.includes(day)?'APT från 16.00':'']);}
  }
  const cleaning=[heading,['Helg från','Barn och efternamn','Avdelning','Typ','Orsak'],...(period.cleaning?.assignments??[]).map(a=>[a.date,name(a.family,a.date),a.department,a.extraId?'RE-extrapass':'Ordinarie',a.reason??'']),...(period.cleaning?.free??[]).map(a=>[a.date,'Städfritt','','',a.reason])];
  const queue=[['Ordinarie städkö vid export'],['Plats','Barn och efternamn'],...state.queue.map((id,i)=>[i+1,name(id)])];
  const families=[['Familjeregler vid export'],['Barn och efternamn','Avdelning','Status','Jourstart','Jourslut','Barnstart / slut / befrielseveckor','Jourbefrielse','Ledighet','Spärrade veckodagar'],...state.families.map(f=>[familyName(f),f.group,f.status,f.start,f.end,f.childRecords.map(c=>`${c.name}: ${c.start||'–'} / ${c.end||'–'} / ${c.exemptionWeeks??4}`).join('; '),JSON.stringify(f.exemptions??[]),JSON.stringify(f.leave??[]),(f.blockedWeekdays??[]).join(', ')])];
  const stats=[heading,['Schemalagd tilldelning, inte bekräftat utfört arbete'],['Barn och efternamn','Jour 1','Jour 2','Jour 3','Totalt','APT jour 1','Jourskyldiga dagar'],...(period.original?.families??state.families).map(f=>{const keys=Object.entries(source.assignments).filter(([,a])=>a.family===f.id).map(([k])=>k);return [familyName(f),...[':0',':1',':2'].map(l=>keys.filter(k=>k.endsWith(l)).length),keys.length,keys.filter(k=>k.endsWith(':0')&&source.aptDates.includes(k.slice(0,10))).length,obligation(f,period.start,period.end)];})];
  return {'Jourschema':schedule,'Helgstädning':cleaning,'Städkö':queue,'Familjer och regler':families,'Statistik':stats};
}
export function makeWorkbook(sheets) {
  const files={},names=Object.keys(sheets),enc=value=>strToU8(value);
  const col=index=>{let text='';for(let n=index+1;n;n=Math.floor((n-1)/26)) text=String.fromCharCode(65+(n-1)%26)+text;return text;};
  const worksheet=rows=>`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="15" width="25" customWidth="1"/></cols><sheetData>${rows.map((row,r)=>`<row r="${r+1}">${row.map((value,c)=>{const ref=`${col(c)}${r+1}`;return typeof value==='number'&&Number.isFinite(value)?`<c r="${ref}"><v>${value}</v></c>`:`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;}).join('')}</row>`).join('')}</sheetData><pageSetup orientation="landscape" paperSize="9"/></worksheet>`;
  files['[Content_Types].xml']=enc(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${names.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  files['_rels/.rels']=enc('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  files['xl/workbook.xml']=enc(`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name,i)=>`<sheet name="${xml(name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`);
  files['xl/_rels/workbook.xml.rels']=enc(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}</Relationships>`);
  names.forEach((name,i)=>{files[`xl/worksheets/sheet${i+1}.xml`]=enc(worksheet(sheets[name]));});
  return zipSync(files,{level:1});
}
