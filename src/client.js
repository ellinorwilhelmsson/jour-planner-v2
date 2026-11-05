import { dateKey, periodDays, generateSchedule, available, intervalCapacity, reviewSchedule, lastChildEnd, familyName, obligation } from '/planner.js';
import { closedDates as getClosedDates, periodWarnings, historyFor, weightedFamilies, warningKey } from '/model.js';
import { addDays } from '/dates.js';
import { exportSheets, makeWorkbook } from '/export.js';
const $ = (selector) => document.querySelector(selector);
const escape = (value) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let families, queue, assignments, week, view, saveDialog, lastFocus;
let calendarMode = 'month', monthOffset = 0;
let periodStart = '2026-11-01', periodEnd = '2027-01-31', levels = 3;
let closedDates = ['2026-12-25', '2027-01-01', '2027-01-06'];
let aptDates = ['2026-11-04', '2026-12-02', '2027-01-13'];
let generated = false, warnings = [], validationStale = false;
let toastTimer;
const dialog = $('#editor');
const warningTooltip=document.createElement('div');
warningTooltip.id='warning-tooltip';warningTooltip.setAttribute('role','tooltip');warningTooltip.hidden=true;document.body.append(warningTooltip);
let tooltipTrigger=null;
function hideWarningTooltip() { warningTooltip.hidden=true;tooltipTrigger=null; }
function showWarningTooltip(button) {
  if(validationStale) return;
  tooltipTrigger=button;
  const items=warnings.filter(w=>w.date===button.dataset.date&&w.type!=='info'&&!(w.type==='interval'&&currentPeriod().approved.includes(warningKey(w))));
  warningTooltip.innerHTML=`<strong>${button.dataset.date} · ${items.length} ${items.length===1?'varning':'varningar'}</strong><ul>${items.map(w=>`<li>${escape(w.message)}</li>`).join('')}</ul>`;
  warningTooltip.hidden=false;
  const rect=button.getBoundingClientRect();
  const width=warningTooltip.offsetWidth;
  const height=warningTooltip.offsetHeight;
  warningTooltip.style.left=`${Math.max(8,Math.min(rect.left,innerWidth-width-8))}px`;
  warningTooltip.style.top=`${rect.bottom+height+8<innerHeight?rect.bottom+8:Math.max(8,rect.top-height-8)}px`;
}
const fmt = (date, options) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC', ...options }).format(date);
const family = id => families.find(f => f.id === id);
let workspace, revision=0, selectedPeriodId=localStorage.getItem('jourplanner-period'), busy=false;
function currentPeriod() { return workspace?.periods.find(p=>p.id===selectedPeriodId); }
function hydrate(response) {
  workspace=response.state;revision=response.revision;
  if(!currentPeriod()) selectedPeriodId=workspace.periods.find(p=>p.status!=='archived')?.id??workspace.periods[0]?.id;
  if(selectedPeriodId) localStorage.setItem('jourplanner-period',selectedPeriodId);
  families=workspace.families;queue=workspace.queue;
  const p=currentPeriod();
  if(p) {periodStart=p.start;periodEnd=p.end;levels=p.levels;closedDates=getClosedDates(p);aptDates=p.aptDates;assignments=p.assignments;generated=p.generated;warnings=periodWarnings(workspace,p);}
  validationStale=false;
}
async function loadWorkspace() {
  const response=await fetch('/api/state');const data=await response.json();
  if(!response.ok) throw new Error(data.error??'Kunde inte hämta planeringen.');
  hydrate(data);render();$('#save-status').textContent='Allt sparat';
}
async function sendCommand(type,payload={}) {
  if(busy) throw new Error('Vänta tills föregående ändring har sparats.');
  busy=true;$('#save-status').textContent='Sparar…';
  try {
    const response=await fetch('/api/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,type,payload})});
    const data=await response.json();if(!response.ok) throw new Error(data.error??'Ändringen kunde inte sparas.');
    if(type==='period.create') {selectedPeriodId=data.periodId;week=0;monthOffset=0;}
    hydrate(data);$('#save-status').textContent='Allt sparat';render();return data;
  } catch(error) {$('#save-status').textContent='Inte sparat · hämta senaste vid konflikt';throw error;}
  finally {busy=false;}
}
function levelsOn(date) {return currentPeriod()?.levelOverrides[date]??levels;}

function days() {
  const first = new Date(`${periodStart}T00:00:00Z`);
  const weekday=first.getUTCDay();
  first.setUTCDate(first.getUTCDate() + (weekday===0?1:weekday===6?2:-(weekday+6)%7));
  return Array.from({ length: 5 }, (_, day) => {
    const date = new Date(first); date.setUTCDate(date.getUTCDate() + week * 7 + day); return date;
  });
}
function assignment(date,level) {return assignments[`${date}:${level}`]??{family:null,locked:false};}
function slot(day, level) { return assignment(dateKey(days()[day]), level); }
function isClosed(date) { return date < periodStart || date > periodEnd || [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()) || closedDates.includes(date) || levelsOn(date)===0; }
function monthDate(offset) { const date = new Date(`${periodStart}T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + offset, 1); return date; }
function periodLabel() { return `${fmt(monthDate(0), { month: 'long', year: 'numeric' })}–${fmt(monthDate(2), { month: 'long', year: 'numeric' })}`; }
function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4500);
}
function heading(kicker, title, subtitle, action = '') {
  return `<div class="page-heading"><div><span class="eyebrow">${kicker}</span><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
}
function stat(label, value, detail, icon) {
  return `<div class="stat"><div><div class="stat-label">${label}</div><div class="stat-value">${value}</div><small>${detail}</small></div><span class="stat-symbol" aria-hidden="true">${icon}</span></div>`;
}
function familyLabel(f, showGroup = true) {
  return `<div class="family-name"><span class="family-initial">${escape(f.name.slice(0, 2).toUpperCase())}</span><div>${escape(familyName(f))}<small>${showGroup?escape(f.group):''}${lastChildEnd(f)?`${showGroup?' · ':''}Sista dag ${lastChildEnd(f)}`:''}</small></div></div>`;
}
function render() {
  hideWarningTooltip();
  const names = {schema:'Jourschema',familjer:'Familjer',stadning:'Helgstädning',statistik:'Statistik',historik:'Ändringshistorik',export:'Export'};
  renderPeriodBar();
  view = Object.hasOwn(names, location.hash.slice(1)) ? location.hash.slice(1) : 'schema';
  $('#breadcrumb').textContent = names[view];
  document.title = `${names[view]} · Jourplaneraren`;
  document.querySelectorAll('[data-view]').forEach(link => {
    const active = link.dataset.view === view;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  if(!currentPeriod() && view!=='familjer' && view!=='historik') {$('#content').innerHTML=heading('PLANERING','Skapa en schemaperiod','Börja med en period om tre månader.');return;}
  if (view === 'schema') renderSchedule();
  if (view === 'familjer') renderFamilies();
  if (view === 'stadning') renderCleaning();
  if(view==='statistik') renderStatistics();
  if(view==='historik') renderHistory();
  if(view==='export') renderExports();
}
function assignmentButton(date, level, compact = false) {
  const s = assignment(date, level);
  const name = s.family ? family(s.family) ? familyName(family(s.family), date) : 'Okänd tilldelning' : 'Obemannat';
  return `<button class="slot level-${level} ${compact ? 'calendar-slot' : ''}" data-action="edit-slot" data-date="${date}" data-level="${level}" title="Jour ${level + 1}: ${escape(name)}${s.locked ? ' (låst)' : ''}" aria-label="Ändra jour ${level + 1}, ${date}, ${escape(name)}${s.locked ? ', låst' : ''}"><span>${compact ? `<small>${level + 1}</small>` : ''}${escape(name)}</span><span class="locked">${s.locked ? '◇' : compact ? '' : '↗'}</span></button>`;
}
function renderMonth(offset) {
  const month = monthDate(offset);
  const start = dateKey(month);
  const end = new Date(month); end.setUTCMonth(end.getUTCMonth() + 1, 0);
  const padding = (month.getUTCDay() + 6) % 7;
  return `<section class="month-panel" id="period-month-${offset}" tabindex="-1" aria-label="${fmt(month, { month: 'long', year: 'numeric' })}"><h2>${fmt(month, { month: 'long', year: 'numeric' })}</h2><div class="month-scroll"><div class="calendar-weekdays">${['Mån','Tis','Ons','Tor','Fre','Lör','Sön'].map(d => `<span>${d}</span>`).join('')}</div><div class="calendar-grid">${Array.from({length: padding}, () => '<div class="calendar-padding" aria-hidden="true"></div>').join('')}${periodDays(start, dateKey(end)).map(date => {
    const day = new Date(`${date}T00:00:00Z`);
    const closed = isClosed(date);
    const dayWarnings = !validationStale ? warnings.filter(w => w.date === date && w.type !== 'info' && !(w.type==='interval'&&currentPeriod().approved.includes(warningKey(w)))) : [];
    return `<div class="calendar-day ${closed ? 'closed-day' : ''}"><div class="calendar-date" data-calendar-date="${date}"><time datetime="${date}">${day.getUTCDate()}</time>${aptDates.includes(date) ? '<span class="apt">APT</span>' : ''}${dayWarnings.length ? `<button type="button" class="day-warning" data-action="show-warnings" data-date="${date}" aria-describedby="warning-tooltip" aria-label="Visa ${dayWarnings.length} ${dayWarnings.length===1?'varning':'varningar'} för ${date}">!</button>` : ''}</div>${closed ? `<span class="closed-label">${closedDates.includes(date) ? 'Stängt' : 'Helg'}</span>` : Array.from({length: levelsOn(date)}, (_,level) => assignmentButton(date,level,true)).join('')}</div>`;
  }).join('')}</div></div></section>`;
}
function renderSchedule() {

  const locked = Object.values(assignments).filter(s => s.locked).length;
  $('#content').innerHTML = heading('PLANERING', 'Jourschema', `${periodLabel()} · ${currentPeriod().status==='draft'?'Utkast':currentPeriod().status==='sent'?'Utskickat':'Arkiverat'}`, currentPeriod().status==='draft'?'<button class="button" data-action="generate">Generera schema</button>':'') +
    `<div class="schedule-tools"><div class="view-switch" role="group" aria-label="Schemavy">${[['week','Vecka'],['month','Månad'],['period','3 månader']].map(([mode,label]) => `<button class="${calendarMode === mode ? 'selected' : ''}" data-action="calendar-view" data-mode="${mode}" aria-pressed="${calendarMode === mode}">${label}</button>`).join('')}</div><div class="schedule-facts"><span>${families.length} familjer</span><span>${locked} låsta pass</span><button class="text-button" data-action="period-settings">Period och datum ↗</button></div></div>
    <div class="schedule-toolbar"><span>${calendarMode === 'period' ? 'Hela schemaperioden' : calendarMode === 'month' ? fmt(monthDate(monthOffset), {month:'long',year:'numeric'}) : `${fmt(days()[0],{day:'numeric',month:'long'})}–${fmt(days()[4],{day:'numeric',month:'long'})}`}</span>${calendarMode !== 'period' ? `<div class="week-nav"><button class="icon-button" data-action="calendar-prev" aria-label="Föregående ${calendarMode === 'month' ? 'månad' : 'vecka'}" ${(calendarMode === 'month' ? monthOffset === 0 : week === 0) ? 'disabled' : ''}>‹</button><button class="icon-button" data-action="calendar-next" aria-label="Nästa ${calendarMode === 'month' ? 'månad' : 'vecka'}" ${(calendarMode === 'month' ? monthOffset === 2 : new Date(days()[0].getTime()+7*86400000) > new Date(`${periodEnd}T00:00:00Z`)) ? 'disabled' : ''}>›</button></div>` : ''}</div>
    ${calendarMode === 'week' ? `<section class="panel" aria-label="Veckans jourschema"><div class="table-wrap"><table><thead><tr><th>DAG</th>${Array.from({length:levels},(_,l)=>`<th>JOUR ${l+1}</th>`).join('')}</tr></thead><tbody>${days().map(date => {const key=dateKey(date);return `<tr><td>${fmt(date,{weekday:'long',day:'numeric',month:'short'})}${aptDates.includes(key)?'<span class="apt">APT</span>':''}</td>${Array.from({length:levels},(_,l)=>`<td>${isClosed(key)?'Stängt':l>=levelsOn(key)?'—':assignmentButton(key,l)}</td>`).join('')}</tr>`;}).join('')}</tbody></table></div></section>` : `${calendarMode === 'period' ? `<nav class="period-nav" aria-label="Gå till månad"><span>Gå till månad</span>${[0,1,2].map(offset => `<button data-action="jump-month" data-month="${offset}">${fmt(monthDate(offset),{month:'long',year:'numeric'})}</button>`).join('')}</nav>` : ''}<div class="month-overview ${calendarMode === 'period' ? 'three-months' : ''}">${calendarMode === 'period' ? [0,1,2].map(renderMonth).join('') : renderMonth(monthOffset)}</div>`}
    <div class="panel-foot calendar-legend"><div class="legend"><span><i></i>Jour 1</span><span><i class="gold"></i>Jour 2</span>${levels === 3 ? '<span><i class="clay"></i>Jour 3</span>' : ''}<span>◇ Låst pass</span></div><span>Klicka på ett pass för att ändra det.</span></div>
    ${inactivePasses()}${renderReview()}`;
}
function renderReview() {
  if(!generated) return `<p class="calendar-help">Inga pass har fördelats ännu. Välj Generera schema för att fördela perioden utifrån familjernas regler.</p>${warnings.length?`<section class="generation-result"><h2>Pass behöver ändras</h2><p>${warnings.length} pass ligger efter sista barnets slutdatum. Ändra tilldelningarna eller generera om olåsta pass.</p><ul class="warning-list">${warnings.map(w=>`<li>${escape(w.message)}<button class="text-button" data-action="show-warning-date" data-date="${w.date}">Visa datum →</button></li>`).join('')}</ul></section>`:''}`;
  if(validationStale) return '<section class="generation-result"><h2>Underlaget har ändrats</h2><p>Kontrollera igen för att se aktuella avvikelser utan att flytta något pass.</p><button class="button secondary" data-action="recheck">Kontrollera igen</button></section>';
  const capacity=intervalCapacity({start:periodStart,end:periodEnd,families,levels,levelOverrides:currentPeriod().levelOverrides,closed:closedDates});
  const approved=warnings.filter(w=>w.type==='interval'&&currentPeriod().approved.includes(warningKey(w)));
  const attention=warnings.filter(w=>w.type!=='info'&&!approved.includes(w)),info=warnings.filter(w=>w.type==='info');
  const list=items=>items.map(w=>`<li><div><strong>${w.date}</strong> ${escape(w.message)}</div><button class="text-button" data-action="show-warning-date" data-date="${w.date}">Visa datum →</button></li>`).join('');
  return `<section class="generation-result"><h2>${currentPeriod().status==='draft'?'Granska utkastet':'Kontroll av aktuellt schema'}</h2>${currentPeriod().status==='draft'?`<p>${currentPeriod().approved.length} granskade intervallavvikelser.</p><button class="button secondary" data-action="approve">Godkänn granskade intervall</button> <button class="button" data-action="send">Markera som utskickat</button>`:'<p>Originalfördelningen är sparad. Jourbyten ändrar bemanningen och historiken, medan statistiken behåller originalet.</p>'}${capacity?`<div class="capacity-explanation"><h3>Alla 14-dagarsintervall går inte att uppfylla</h3><p>Under ${capacity.start}–${capacity.end} behövs <strong>${capacity.required} pass på jour 1–2</strong>. Bara <strong>${capacity.available} familjer</strong> är tillgängliga någon gång under dessa 14 dagar. Med 14 dagars avstånd kan varje familj ta högst ett sådant pass i det intervallet.</p><p>Detta kan inte lösas enbart genom att flytta pass. Kontrollera familjeunderlaget. Om det stämmer behöver kortare intervall godtas eller planeringsförutsättningarna ändras. Appen ändrar inte regler eller befrielser automatiskt.</p></div>`:''}<p><strong>${attention.length} varningar</strong> · ${info.length} informationspunkter om jour 3.</p><ol class="review-steps"><li>Kontrollera att familjer, frånvaro och stängda datum stämmer.</li><li>Öppna ett berört datum och ändra tilldelningen vid behov. Ändrade pass låses.</li><li>Välj <strong>Kontrollera igen</strong> för ny kontroll av befintliga pass. Välj <strong>Generera schema</strong> om du vill fördela om olåsta pass.</li></ol><button class="button secondary" data-action="recheck">Kontrollera igen</button><p>Historik hämtas från tidigare utskickade perioder i appen. Äldre historik är inte importerad. Granska fördelningen innan schemat används. Godkänn granskade intervallavvikelser innan schemat markeras som utskickat.</p>${attention.length?`<details><summary>Varningar att granska (${attention.length})</summary><ul class="warning-list">${list(attention)}</ul></details>`:'<p>Inga varningar hittades.</p>'}${approved.length?`<details><summary>Godkända intervallavvikelser (${approved.length})</summary><ul class="warning-list">${list(approved)}</ul></details>`:''}${info.length?`<details><summary>Information om korta intervall med jour 3 (${info.length})</summary><ul class="warning-list">${list(info)}</ul></details>`:''}</section>`;
}
function inactivePasses() {
  const entries=Object.entries(assignments).filter(([key])=>isClosed(key.slice(0,10))||Number(key.split(':')[1])>=levelsOn(key.slice(0,10)));
  if(!entries.length) return '';
  return `<section class="generation-result"><h2>Pass på stängda datum eller inaktiva journivåer</h2><p>Pass som blivit inaktiva behålls tills du uttryckligen tar bort dem.</p><ul>${entries.map(([key,a])=>`<li>${key.slice(0,10)} · jour ${Number(key.split(':')[1])+1} · ${a.family?escape(familyName(family(a.family)??{})):'Obemannat'}${currentPeriod().status==='draft'?` <button class="text-button" data-action="clear-pass" data-key="${key}">Ta bort inaktivt pass</button>`:''}</li>`).join('')}</ul></section>`;
}
function periodSettings() {
  const p=currentPeriod();if(p.status!=='draft') {toast('Utskickade perioders datumregler är låsta.');return;}
  openDialog('Period och datum',`<p>${periodLabel()}. Svenska röda dagar och aftnar stängs automatiskt.</p><label>Antal jourer<select name="levels"><option value="2" ${levels===2?'selected':''}>2</option><option value="3" ${levels===3?'selected':''}>3</option></select></label><label>APT-datum, separerade med komma<input name="apt" value="${aptDates.join(', ')}"></label><label>Extra stängda datum, separerade med komma<input name="closed" value="${p.closedDates.join(', ')}"></label><label>Stängningsperioder, en rad per intervall (från till)<textarea name="closures" placeholder="2026-12-21 2027-01-06">${escape(rangeText(p.closures))}</textarea></label><label>Avvikande jourantal, en rad per datum (datum antal 0–3)<textarea name="overrides">${Object.entries(p.levelOverrides).map(([d,n])=>`${d} ${n}`).join('\n')}</textarea></label>`,async form=>{
    const d=new FormData(form);const overrides=Object.fromEntries(lines(d.get('overrides')).map(line=>{const [date,n]=line.split(/\s+/);return [date,Number(n)];}));
    await sendCommand('period.update',{periodId:p.id,start:p.start,levels:Number(d.get('levels')),aptDates:comma(d.get('apt')),closedDates:comma(d.get('closed')),closures:parseRanges(d.get('closures')),levelOverrides:overrides});toast('Datumreglerna sparades. Befintliga pass har inte flyttats.');
  });
}

function confirmGeneration() {
  openDialog('Generera jourschema',`<p>Fördela om olåsta pass i ${escape(periodLabel())}. Låsta pass behålls.</p><p>Regler för befrielse, ledighet, startdatum och slutdatum respekteras. Granska avvikelserna efteråt.</p>`,async()=>{
    const p=currentPeriod();
    const result=generateSchedule({start:p.start,end:p.end,families:weightedFamilies(workspace,p),levels:p.levels,levelOverrides:p.levelOverrides,closed:getClosedDates(p),apt:p.aptDates,existing:p.assignments,history:historyFor(workspace,p)});
    const proposed=Object.fromEntries(Object.entries(result.assignments).filter(([,a])=>!a.locked));
    await sendCommand('period.generate',{periodId:p.id,assignments:proposed});toast('Utkastet är sparat. Granska varningarna.');
  });
}

function renderFamilies() {
  $('#content').innerHTML = heading('REGISTER', 'Familjer', 'En enkel överblick över familjer, barn och jourskyldighet.', '<button class="button" data-action="add-family">+ &nbsp; Lägg till familj</button>') +
    `<div class="stats">${stat('Familjer', families.length, 'I registret', '♧')}${stat('Aktiva i jouren', families.filter(f => f.status === 'Aktiv').length, 'Familjer utan jourbefrielse', '▦')}${stat('Jourbefriade', families.filter(f => f.status === 'Jourbefriad').length, 'Behåller sin plats i städkön', '◇')}</div>
    <section class="panel"><div class="panel-head"><div><h2>Familjeregister</h2><p>Uppgifterna sparas gemensamt.</p></div><input class="search" id="family-search" type="search" placeholder="Sök familj eller barn…" aria-label="Sök familj eller barn"></div><div class="table-wrap"><table><thead><tr><th scope="col">FAMILJ</th><th scope="col">AVDELNING</th><th scope="col">JOURSTATUS</th><th scope="col"><span class="eyebrow">ÄNDRA</span></th></tr></thead><tbody id="family-rows"></tbody></table></div><div class="panel-foot">Ändra familjeregler och välj sedan Generera schema för att fördela om olåsta pass.</div></section>`;
  renderFamilyRows('');
  $('#family-search').addEventListener('input', event => renderFamilyRows(event.target.value));
}
function renderFamilyRows(query) {
  const rows = families.filter(f => `${f.name} ${f.children}`.toLocaleLowerCase('sv').includes(query.toLocaleLowerCase('sv')));
  $('#family-rows').innerHTML = rows.length ? rows.map(f => `<tr><td>${familyLabel(f,false)}</td><td>${escape(f.group)}</td><td><span class="pill ${f.status === 'Aktiv' ? '' : 'amber'}">${escape(f.status)}</span></td><td><button class="text-button" data-action="edit-family" data-id="${f.id}" aria-label="Ändra ${escape(familyName(f))}">Ändra ↗</button></td></tr>`).join('') : '<tr><td class="empty" colspan="4">Ingen familj matchar din sökning.</td></tr>';
}
function openDialog(title, fields, onSave) {
  lastFocus = document.activeElement;
  $('#dialog-title').textContent = title;
  $('#dialog-fields').innerHTML = fields;
  saveDialog = onSave;
  $('#dialog-fields').insertAdjacentHTML('beforeend','<p id="dialog-error" role="alert"></p>');
  $('#editor-form button[type=submit]').textContent = title === 'Generera jourschema' ? 'Generera utkast' : 'Spara ändring';
  dialog.showModal();
}
function editSlot(date,level) {
  if(currentPeriod().status==='archived') {toast('Återöppna perioden för att registrera ändringar.');return;}
  if(currentPeriod().status==='sent') return editSwap(`${date}:${level}`);
  const s=assignment(date,level);
  openDialog(`Jour ${level+1} · ${date}`,`<label>Barn och efternamn<select name="family"><option value="">Obemannat</option>${families.map(f=>`<option value="${f.id}" ${f.id===s.family?'selected':''}>${escape(familyName(f,date))}</option>`).join('')}</select></label><label class="check-label"><input type="checkbox" name="locked" ${s.locked?'checked':''}> Lås passet</label><p>Ändrad tilldelning låses automatiskt.</p>`,async form=>{const d=new FormData(form);await sendCommand('period.assign',{periodId:selectedPeriodId,key:`${date}:${level}`,family:d.get('family')?Number(d.get('family')):null,locked:d.has('locked')});toast('Passet sparades.');});
}

let childFieldId=0;
function childRow(child,index,removable=false) {
  index=childFieldId++;
  return `<div class="child-row"><div><label for="child-name-${index}">Barnets namn</label><input id="child-name-${index}" name="childName" value="${escape(child.name)}" maxlength="50" required></div><div><label for="child-start-${index}">Startdatum (valfritt)</label><input type="date" id="child-start-${index}" name="childStart" value="${escape(child.start??'')}"></div><div><label for="child-weeks-${index}">Befrielse från start (veckor)</label><input type="number" min="0" max="52" step="1" id="child-weeks-${index}" name="childWeeks" value="${child.exemptionWeeks??4}"></div><div><label for="child-end-${index}">Slutdatum (valfritt)</label><input type="date" id="child-end-${index}" name="childEnd" value="${escape(child.end??'')}"></div>${removable?'<button class="text-button" type="button" data-remove-child>Ta bort raden</button>':''}</div>`;
}
$('#editor-form').addEventListener('click',event=>{
  if(event.target.closest('#add-child')) {
    const rows=$('#child-rows');const index=rows.querySelectorAll('.child-row').length;
    rows.insertAdjacentHTML('beforeend',childRow({name:'',end:''},index,true));rows.lastElementChild.querySelector('input').focus();
  }
  const remove=event.target.closest('[data-remove-child]');if(remove) remove.closest('.child-row').remove();
});
function editFamily(id) {
  const f = id ? family(id) : { name: '', children: '', childRecords: [{name:'',end:''}], group: 'Ekorren', status: 'Aktiv' };
  openDialog(id ? familyName(f) : 'Lägg till familj',
    `<p>Ändringar sparas gemensamt och registreras i ändringshistoriken.</p><label for="family-name">Efternamn</label><input id="family-name" name="name" value="${escape(f.name)}" maxlength="40" required><fieldset class="children-editor"><legend>Barn</legend><div id="child-rows">${f.childRecords.map((child,index)=>childRow(child,index)).join('')}</div><button type="button" class="text-button" id="add-child">+ Lägg till barn</button><p>Slutdatum är barnets sista dag. Jouren upphör efter att sista barnet har slutat. Tomt slutdatum betyder att barnet är kvar. Startdatum ger fyra veckors befrielse för jour och städning som förslag. Ändra antalet veckor, eller välj 0 för ingen befrielse.</p></fieldset><label for="group">Avdelning</label><input id="group" name="group" value="${escape(f.group)}" maxlength="60" list="departments"><datalist id="departments">${workspace.cleaningSettings.departments.map(name=>`<option value="${escape(name)}"></option>`).join('')}</datalist><label for="status">Jourstatus</label><select id="status" name="status"><option ${f.status === 'Aktiv' ? 'selected' : ''}>Aktiv</option><option ${f.status === 'Jourbefriad' ? 'selected' : ''}>Jourbefriad</option></select><details class="family-rules"><summary>Regler för jourfördelning</summary><div class="family-rule-grid"><div><label for="active-start">Jourstart (valfri)</label><input id="active-start" type="date" name="start" value="${f.start??''}"></div><div><label for="active-end">Jourens slutdatum (valfritt)</label><input id="active-end" type="date" name="end" value="${f.end??''}"></div><div><label for="exempt-start">Jourbefrielse från</label><input id="exempt-start" type="date" name="exemptStart" value="${f.exemptions?.[0]?.start??''}"></div><div><label for="exempt-end">Jourbefrielse till</label><input id="exempt-end" type="date" name="exemptEnd" value="${f.exemptions?.[0]?.end??''}"></div><div><label for="leave-start">Ledighet från</label><input id="leave-start" type="date" name="leaveStart" value="${f.leave?.[0]?.start??''}"></div><div><label for="leave-end">Ledighet till</label><input id="leave-end" type="date" name="leaveEnd" value="${f.leave?.[0]?.end??''}"></div></div><label for="blocked-days">Spärrade veckodagar</label><select id="blocked-days" name="blocked" multiple size="5">${['Måndag','Tisdag','Onsdag','Torsdag','Fredag'].map((d,i)=>`<option value="${i+1}" ${(f.blockedWeekdays??[]).includes(i+1)?'selected':''}>${d}</option>`).join('')}</select><p>Ledighet blockerar datum utan att minska jourandelen. Daterad jourbefrielse minskar andelen. Ange fler intervall nedan vid behov.</p><label>Fler jourbefrielseperioder (från till per rad)<textarea name="moreExempt">${escape(rangeText((f.exemptions??[]).slice(1)))}</textarea></label><label>Fler ledighetsperioder (från till per rad)<textarea name="moreLeave">${escape(rangeText((f.leave??[]).slice(1)))}</textarea></label></details><p id="family-error" role="alert"></p>`, async form => {
      const formData=new FormData(form);
      const data = Object.fromEntries(formData);
      for (const [a,b] of [['start','end'],['exemptStart','exemptEnd'],['leaveStart','leaveEnd']]) {
        if ((a!=='start' && Boolean(data[a])!==Boolean(data[b])) || (data[a] && data[b] && data[a]>data[b])) { $('#family-error').textContent='Kontrollera datumintervallen: ange både från och till för befrielse och ledighet.';return false; }
      }
      data.exemptions=[...(data.exemptStart?[{start:data.exemptStart,end:data.exemptEnd,reason:f.exemptions?.[0]?.reason??''}]:[]),...parseRanges(data.moreExempt)];
      data.leave=[...(data.leaveStart?[{start:data.leaveStart,end:data.leaveEnd,reason:f.leave?.[0]?.reason??''}]:[]),...parseRanges(data.moreLeave)];
      data.blockedWeekdays=formData.getAll('blocked').map(Number);
      for(const key of ['exemptStart','exemptEnd','leaveStart','leaveEnd','blocked']) delete data[key];
      data.childRecords=[...form.querySelectorAll('.child-row')].map(row=>({name:row.querySelector('[name=childName]').value.trim(),start:row.querySelector('[name=childStart]').value,exemptionWeeks:Number(row.querySelector('[name=childWeeks]').value),end:row.querySelector('[name=childEnd]').value}));
      data.name=data.name.trim();
      if(data.childRecords.some(child=>!child.name)||!data.childRecords.length) { $('#family-error').textContent='Fyll i barnens namn.';return false; }
      data.children=new Intl.ListFormat('sv',{type:'conjunction'}).format(data.childRecords.map(child=>child.name));
      delete data.childName;delete data.childEnd;
      if (!data.name || !data.children) { $('#family-error').textContent = 'Fyll i efternamn och barnens namn.'; return false; }
      await sendCommand('family.save',{family:{...data,id:id??null}});
      toast('Uppgifterna är sparade. Kontrollera redan planerade pass om datum har ändrats.');
    });
}
$('#content').addEventListener('click', async event => {
 try {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, date, level, id, mode } = button.dataset;
  if (action === 'prev-week' || action === 'next-week') { week += action === 'next-week' ? 1 : -1; render(); }
  if (action === 'edit-slot') editSlot(date, Number(level));
  if (action === 'calendar-view') { calendarMode=mode;render(); }
  if (action === 'jump-month') { const month=document.getElementById(`period-month-${button.dataset.month}`);month.scrollIntoView({block:'start'});month.focus({preventScroll:true}); }
  if (action === 'calendar-prev' || action === 'calendar-next') { const direction=action==='calendar-next'?1:-1;if(calendarMode==='month') monthOffset+=direction;else week+=direction;render(); }
  if (action === 'period-settings') periodSettings();
  if (action === 'generate') confirmGeneration();
  if (action === 'show-warnings') showWarningTooltip(button);
  if (action === 'recheck') { warnings=periodWarnings(workspace,currentPeriod());validationStale=false;render();document.querySelector('.generation-result').scrollIntoView({block:'start'});toast('Kontrollerna är uppdaterade. Inga pass har flyttats.'); }
  if (action === 'show-warning-date') {
    const month=new Date(`${date}T00:00:00Z`),first=monthDate(0);
    calendarMode='month';monthOffset=(month.getUTCFullYear()-first.getUTCFullYear())*12+month.getUTCMonth()-first.getUTCMonth();render();
    const target=document.querySelector(`[data-calendar-date="${date}"]`).closest('.calendar-day');target.classList.add('highlight-day');target.setAttribute('tabindex','-1');target.scrollIntoView({block:'center'});target.focus({preventScroll:true});
  }
  if (action === 'add-family') editFamily();
  if (action === 'edit-family') editFamily(Number(id));
  if (action === 'queue-up' || action === 'queue-down') {
    const index = queue.indexOf(Number(id));
    const target = index + (action === 'queue-up' ? -1 : 1);
    if (target < 0 || target >= queue.length) return;
    await sendCommand('queue.move',{familyId:Number(id),direction:action==='queue-up'?-1:1});
    render();
    const movedButton = document.querySelector(`[data-action="${action}"][data-id="${id}"]`);
    if (movedButton && !movedButton.disabled) movedButton.focus();
    toast(`${familyName(family(Number(id)))} är nu på plats ${target + 1}.`);
  }
  await extraAction(button);
 } catch(error) {toast(error.message);}
});
$('#editor-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button=event.target.querySelector('[type=submit]');button.disabled=true;
  try {if(await saveDialog(event.target)===false) return;dialog.close();render();}
  catch(error) {$('#dialog-error').textContent=error.message;}
  finally {button.disabled=false;}
});
$('#close-dialog').addEventListener('click', () => dialog.close());
$('#cancel-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { if (lastFocus?.isConnected) lastFocus.focus(); else $('#main').focus(); });
$('#reset').addEventListener('click',()=>loadWorkspace().catch(error=>toast(error.message)));
window.addEventListener('hashchange',()=>{if(workspace) render();});
week=0;
async function boot() {
  try {const response=await fetch('/api/me');if(!response.ok) throw new Error('Inloggningen kunde inte verifieras.');const user=await response.json();$('#identity').textContent=user.email;$('#demo-description').textContent=user.local?'Lokal testmiljö · Påhittade uppgifter. Ändringar sparas i lokal databas.':'Gemensam planering · Ändringar sparas i Cloudflare D1.';await loadWorkspace();}
  catch(error) {$('#save-status').textContent='Kunde inte hämta';$('#content').textContent=error.message;}
}
window.addEventListener('focus',async()=>{if(!workspace||busy||dialog.open) return;try {const response=await fetch('/api/revision');if(response.ok&&(await response.json()).revision!==revision) await loadWorkspace();} catch {$('#save-status').textContent='Anslutningen kunde inte kontrolleras';}});
$('#content').addEventListener('mouseover',event=>{const button=event.target.closest('.day-warning');if(button) showWarningTooltip(button);});
$('#content').addEventListener('focusin',event=>{if(event.target.matches('.day-warning')) showWarningTooltip(event.target);});
document.addEventListener('mouseout',event=>{if(tooltipTrigger&&!tooltipTrigger.contains(event.relatedTarget)&&!warningTooltip.contains(event.relatedTarget)&&(tooltipTrigger.contains(event.target)||warningTooltip.contains(event.target))) hideWarningTooltip();});
$('#content').addEventListener('focusout',event=>{if(event.target.matches('.day-warning')) hideWarningTooltip();});
document.addEventListener('keydown',event=>{if(event.key==='Escape') hideWarningTooltip();});
document.addEventListener('click',event=>{if(!event.target.closest('.day-warning')&&!warningTooltip.contains(event.target)) hideWarningTooltip();});
window.addEventListener('scroll',event=>{if(!warningTooltip.contains(event.target)) hideWarningTooltip();},true);

const comma=value=>String(value??'').split(',').map(v=>v.trim()).filter(Boolean);
const lines=value=>String(value??'').split('\n').map(v=>v.trim()).filter(Boolean);
const rangeText=ranges=>(ranges??[]).map(r=>`${r.start} ${r.end}${r.reason?' '+r.reason:''}`).join('\n');
const parseRanges=value=>lines(value).map(line=>{const [start,end,...reason]=line.split(/\s+/);return {start,end,reason:reason.join(' ')};});
function renderPeriodBar() {
  const p=currentPeriod();
  $('#periodbar').innerHTML=`<div class="period-selector"><label for="select-period">Schemaperiod</label><select id="select-period">${workspace.periods.slice().sort((a,b)=>a.start.localeCompare(b.start)).map(p=>`<option value="${escape(p.id)}" ${p.id===selectedPeriodId?'selected':''}>${p.start} – ${p.end} · ${{draft:'Utkast',sent:'Utskickat',archived:'Arkiverat'}[p.status]}</option>`).join('')}</select><button class="button secondary" id="new-period">+ Ny period</button>${p?`<button class="text-button" id="archive-period">${p.status==='archived'?'Återöppna':'Arkivera'}</button>`:''}</div>`;
  $('#select-period').addEventListener('change',event=>{selectedPeriodId=event.target.value;week=0;monthOffset=0;hydrate({state:workspace,revision});render();});
  $('#new-period').addEventListener('click',()=>{
    const next=workspace.periods.map(p=>p.end).sort().at(-1);
    openDialog('Ny schemaperiod',`<label>Första månad<input type="month" name="month" value="${next?addDays(next,1).slice(0,7):new Date().toISOString().slice(0,7)}" required></label><p>En ny period omfattar tre hela månader. Tidigare perioder behålls.</p>`,async form=>{await sendCommand('period.create',{start:`${new FormData(form).get('month')}-01`});});
  });
  $('#archive-period')?.addEventListener('click',()=>openDialog(p.status==='archived'?'Återöppna period':'Arkivera period','<p>Perioden och dess historik behålls. Inga kalenderposter ändras.</p>',()=>sendCommand(p.status==='archived'?'period.unarchive':'period.archive',{periodId:p.id})));
}
function editSwap(key) {
  const p=currentPeriod(),original=p.original.assignments[key],current=p.assignments[key];
  openDialog(`Registrera jourbyte · ${key.split(':')[0]}`,`<p>Original: ${escape(familyName(p.original.families.find(f=>f.id===original?.family)??{}))}. Nu: ${escape(familyName(family(current.family)??{}))}.</p><label>Ny tilldelning<select name="family">${families.map(f=>`<option value="${f.id}" ${f.id===current.family?'selected':''}>${escape(familyName(f))}</option>`).join('')}</select></label><label>Eller byt med ett annat pass<select name="otherKey"><option value="">Ersätt bara detta pass</option>${Object.entries(p.assignments).filter(([k,a])=>k!==key&&a.family).sort(([a],[b])=>a.localeCompare(b)).map(([k,a])=>`<option value="${k}">${k.split(':')[0]} · Jour ${Number(k.split(':')[1])+1} · ${escape(familyName(family(a.family)??{}))}</option>`).join('')}</select></label><label>Orsak<input name="reason" required maxlength="160"></label><p>Rättvisestatistiken behåller originaltilldelningen. Kalendern ändras först efter separat publicering.</p>`,async form=>{const d=new FormData(form);await sendCommand('period.swap',{periodId:p.id,key,family:Number(d.get('family')),otherKey:d.get('otherKey')||null,reason:d.get('reason')});toast('Jourbytet är sparat.');});
}
function cleaningSettings() {
  const c=workspace.cleaningSettings;
  openDialog('Städregler och RE-dagar',`<label>Höstens RE-dag<input type="date" name="autumnRE" value="${c.autumnRE}" required></label><label>Vårens RE-dag<input type="date" name="springRE" value="${c.springRE}" required></label><label>Övriga RE-datum (komma emellan)<input name="reDates" value="${c.reDates.join(', ')}"></label><label>Jullov och stängningsperioder (från till orsak)<textarea name="breaks">${escape(rangeText(c.breaks))}</textarea></label><label>Inställda helger (lördagens datum, komma emellan)<input name="cancelled" value="${c.cancelled.join(', ')}"></label><label>Avdelningar i rotationsordning (komma emellan)<input name="departments" value="${escape(c.departments.join(', '))}"></label><p>Städfria helger: RE-helger, fredag–måndag med röd dag eller afton, lov och helgen efter en helt stängd vardagsvecka. Ändrade regler flyttar inga redan sparade uppdrag.</p>`,async form=>{const d=Object.fromEntries(new FormData(form));await sendCommand('cleaning.settings',{settings:{...c,...d,reDates:comma(d.reDates),breaks:parseRanges(d.breaks),cancelled:comma(d.cancelled),departments:comma(d.departments)}});});
}
function addExtra() {
  openDialog('Extra städtur efter missad RE-dag',`<label>Barn och efternamn<select name="family">${families.map(f=>`<option value="${f.id}">${escape(familyName(f))}</option>`).join('')}</select></label><label>Missad RE-dag<input name="reDate" type="date" required></label><label>Orsak<input name="reason" required maxlength="500"></label><p>Extrapasset får förtur. Den ordinarie köplatsen behålls.</p>`,async form=>{const d=Object.fromEntries(new FormData(form));await sendCommand('cleaning.settings',{settings:{...workspace.cleaningSettings,extras:[...workspace.cleaningSettings.extras,{...d,family:Number(d.family)}]}});});
}
function renderCleaning() {
  const p=currentPeriod(),plan=p.cleaning;
  $('#content').innerHTML=heading('PLANERING','Helgstädning',`${periodLabel()} · Städplan och ordinarie kö`,p.status==='draft'?'<button class="button" data-action="cleaning-generate">Generera städplan</button>':'')+
    `<div class="schedule-tools"><button class="button secondary" data-action="cleaning-settings">Städregler och RE-dagar</button><button class="button secondary" data-action="cleaning-extra">+ RE-extrapass</button></div><p>Städplanen är ett förslag tills perioden markeras som utskickad. Då flyttas den gemensamma kön. Överhoppad familj behåller sin tur.</p>`+
    (plan?`<section class="panel"><div class="panel-head"><h2>Städplan · ${p.status==='draft'?'utkast':'fastställd'}</h2></div><div class="table-wrap"><table><thead><tr><th>Helg</th><th>Barn och efternamn</th><th>Avdelning</th><th>Uppdrag</th></tr></thead><tbody>${plan.assignments.map(a=>`<tr><td>${a.date}–${addDays(a.date,1).slice(5)}</td><td>${a.family?escape(familyName(family(a.family)??{},a.date)):'Obemannat'}</td><td>${escape(a.department??'')}</td><td>${a.extraId?`Extra · ${escape(a.reason)}`:'Ordinarie'}${p.status==='sent'?` <button class="text-button" data-action="cleaning-cancel" data-date="${a.date}">Ställ in</button>`:''}</td></tr>`).join('')}</tbody></table></div><details><summary>Städfria helger (${plan.free.length})</summary><ul>${plan.free.map(a=>`<li>${a.date}: ${escape(a.reason)}</li>`).join('')}</ul></details></section>`:'<p class="empty">Ingen städplan är genererad för perioden.</p>')+
    `<div class="lower-grid"><section class="panel"><div class="panel-head"><h2>Ordinarie städkö</h2></div>${queue.map((id,index)=>`<div class="queue-row"><span class="queue-number">${index+1}</span>${familyLabel(family(id))}<div class="queue-actions"><button class="icon-button" data-action="queue-up" data-id="${id}" ${index===0?'disabled':''} aria-label="Flytta ${escape(familyName(family(id)))} uppåt">↑</button><button class="icon-button" data-action="queue-down" data-id="${id}" ${index===queue.length-1?'disabled':''} aria-label="Flytta ${escape(familyName(family(id)))} nedåt">↓</button></div></div>`).join('')}</section><section class="note-card"><h2>Väntande RE-extrapass</h2>${workspace.cleaningSettings.extras.filter(e=>!workspace.completedExtras.includes(e.id)).map(e=>`<p>${escape(familyName(family(e.family)))} · ${e.reDate}<br>${escape(e.reason)}</p>`).join('')||'<p>Inga väntande extrapass.</p>'}<p>Styrelsebefrielse från jour påverkar inte städturen.</p></section></div>`;
}
function renderStatistics() {
  const p=currentPeriod(),source=p.original??p,records=Object.entries(source.assignments),list=p.original?.families??families;
  $('#content').innerHTML=heading('FÖRDELNING','Statistik',`${periodLabel()} · ${p.original?'Fastställt original':'Preliminärt utkast'}`)+`<p>Avser schemalagda tilldelningar. Jourbyten och faktiskt utfört arbete räknas inte om här. Jourskyldiga dagar är aktiva dagar minus befrielse; vanlig ledighet räknas med.</p><section class="panel"><div class="table-wrap"><table><thead><tr><th>Barn och efternamn</th><th>Jour 1</th><th>Jour 2</th><th>Jour 3</th><th>Totalt</th><th>APT jour 1</th><th>Jourskyldiga dagar</th></tr></thead><tbody>${list.map(f=>{const own=records.filter(([,a])=>a.family===f.id);return `<tr><td>${escape(familyName(f))}</td>${[0,1,2].map(l=>`<td>${own.filter(([key])=>key.endsWith(':'+l)).length}</td>`).join('')}<td>${own.length}</td><td>${own.filter(([key])=>key.endsWith(':0')&&source.aptDates.includes(key.split(':')[0])).length}</td><td>${obligation(f,p.start,p.end)}</td></tr>`;}).join('')}</tbody></table></div></section><p>Tidigare utskickade perioder: ${workspace.periods.filter(p=>p.original).length}. Äldre statistik är inte importerad.</p>`;
}
let historyRequest=0;
function historyFields(value) {
  if(!value) return {};
  const name=id=>family(id)?familyName(family(id)):'Obemannat';
  const range=rows=>(rows??[]).map(r=>`${r.start} – ${r.end}${r.reason?' · '+r.reason:''}`).join('; ');
  if(Array.isArray(value)) return Object.fromEntries(value.map((id,i)=>[`Köplats ${i+1}`,name(id)]));
  if(value.assignments) return {
    Period:`${value.start} – ${value.end}`,Status:({draft:'Utkast',sent:'Utskickat',archived:'Arkiverat'})[value.status],
    Journivåer:value.levels,'APT-datum':value.aptDates.join(', '),'Stängda datum':value.closedDates.join(', '),'Stängningsperioder':range(value.closures),'Avvikande jourantal':Object.entries(value.levelOverrides).map(([d,n])=>`${d}: ${n}`).join('; '),
    ...Object.fromEntries(Object.entries(value.assignments).map(([key,a])=>[`${key.slice(0,10)} · jour ${Number(key.split(':')[1])+1}`,`${name(a.family)}${a.locked?' · Låst':''}`])),
    ...Object.fromEntries((value.cleaning?.assignments??[]).map(a=>[`Städhelg ${a.date}`,`${name(a.family)} · ${a.department??''}${a.extraId?' · RE-extrapass':''}`])),
    'Städfria helger':(value.cleaning?.free??[]).map(a=>`${a.date}: ${a.reason}`).join('; '),'Godkända intervall':value.approved.length
  };
  if(value.childRecords) return {Namn:familyName(value),Avdelning:value.group,Jourstatus:value.status,Jourstart:value.start,Jourslut:value.end,
    Barn:value.childRecords.map(c=>`${c.name} · Start ${c.start||'ej angiven'} · Sista dag ${c.end||'ej angiven'} · ${c.exemptionWeeks??4} befrielseveckor`).join('; '),
    Jourbefrielse:range(value.exemptions),Ledighet:range(value.leave),'Spärrade veckodagar':(value.blockedWeekdays??[]).map(n=>['','Mån','Tis','Ons','Tor','Fre'][n]).join(', '),Arkiverad:value.archived?'Ja':'Nej'};
  return {'Höstens RE-dag':value.autumnRE,'Vårens RE-dag':value.springRE,'Övriga RE-dagar':value.reDates?.join(', '),'Stängningsperioder':range(value.breaks),'Inställda helger':value.cancelled?.join(', '),Avdelningar:value.departments?.join(', '),'RE-extrapass':value.extras?.map(e=>`${name(e.family)} · ${e.reDate}: ${e.reason}`).join('; ')};
}
function historyDiff(event) {
  const before=historyFields(event.before),after=historyFields(event.after);
  const keys=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(key=>(before[key]??'')!==(after[key]??''));
  return keys.length?`<div class="table-wrap"><table><thead><tr><th>Uppgift</th><th>Före</th><th>Efter</th></tr></thead><tbody>${keys.map(key=>`<tr><td>${escape(key)}</td><td>${escape(before[key]??'—')}</td><td>${escape(after[key]??'—')}</td></tr>`).join('')}</tbody></table></div>`:'<p>Inga ändrade fält i planeringen.</p>';
}
async function renderHistory() {
  const request=++historyRequest;
  $('#content').innerHTML=heading('SPÅRBARHET','Ändringshistorik','Vem som ändrat vad, när och värden före och efter.')+`<label>Visa<select id="history-scope"><option value="all">Alla ändringar</option><option value="${escape(selectedPeriodId??'')}">Vald period</option><option value="global">Familjer och städkö</option></select></label><div id="history-results">Hämtar…</div>`;
  let cursor=Number.MAX_SAFE_INTEGER,loading=0;
  const load=async(append=false)=>{try {const attempt=++loading,scope=$('#history-scope').value;if(!append) cursor=Number.MAX_SAFE_INTEGER;const response=await fetch(`/api/history?scope=${encodeURIComponent(scope)}&before=${cursor}`);const data=await response.json();if(!response.ok) throw new Error(data.error);if(view!=='historik'||request!==historyRequest||attempt!==loading) return;
    const html=data.events.map(event=>`<article class="history-event"><h2>${escape(event.description)}</h2><p>${escape(event.actor)} · ${escape(new Date(event.at).toLocaleString('sv-SE'))} · version ${event.revision}</p><details><summary>Visa före och efter</summary>${historyDiff(event)}</details>${currentPeriod()?.status==='draft'&&event.scope===selectedPeriodId&&event.before?.status==='draft'?`<button class="text-button" data-action="restore" data-id="${escape(event.id)}">Återställ perioden till före denna ändring</button>`:''}</article>`).join('');
    $('#history-more')?.remove();
    if(append) $('#history-results').insertAdjacentHTML('beforeend',html);else $('#history-results').innerHTML=html||'<p>Inga registrerade ändringar ännu.</p>';
    cursor=data.events.at(-1)?.revision??0;
    if(data.events.length===50) {$('#history-results').insertAdjacentHTML('beforeend','<button id="history-more" class="button secondary">Visa äldre ändringar</button>');$('#history-more').addEventListener('click',()=>load(true));}
  } catch(error) {if($('#history-results')) $('#history-results').textContent=error.message;}};
  $('#history-scope').addEventListener('change',()=>load());await load();
}
function renderExports() {
  const p=currentPeriod();
  $('#content').innerHTML=heading('DELA','Export',`${periodLabel()} · ${p.status==='draft'?'UTKAST':'Utskickat original och aktuell bemanning'}`)+`<section class="panel export-options"><h2>Schema och underlag</h2><p>Exporten innehåller aktuell bemanning, original, städplan, kö, familjeregler och statistik. Utkast märks tydligt.</p><button class="button" data-action="excel">Hämta Excel</button> <button class="button secondary" data-action="print">Skriv ut / spara PDF</button></section><section class="note-card"><h2>Google Kalender</h2><p>Kalenderkopplingen är ännu inte konfigurerad. Inga kalenderposter skickas från den här versionen.</p></section>`;
}
async function extraAction(button) {
  const {action,id,date}=button.dataset,p=currentPeriod();
  if(action==='approve') openDialog('Godkänn granskade intervall',`<p>Du godkänner ${warnings.filter(w=>['interval','info'].includes(w.type)).length} intervallavvikelser i det aktuella utkastet. Obemannade och otillåtna pass måste rättas.</p>`,()=>sendCommand('period.approve',{periodId:p.id,keys:warnings.filter(w=>['interval','info'].includes(w.type)).map(warningKey)}));
  if(action==='send') openDialog('Markera som utskickat','<p>Originalfördelningen fastställs och städkön flyttas enligt städplanen. Senare ändringar registreras som jourbyten. Appen skickar inget mejl.</p>',()=>sendCommand('period.send',{periodId:p.id}));
  if(action==='cleaning-generate') await sendCommand('cleaning.generate',{periodId:p.id});
  if(action==='cleaning-settings') cleaningSettings();
  if(action==='cleaning-extra') addExtra();
  if(action==='cleaning-cancel') openDialog('Ställ in städhelg',`<p>Städningen ${date} ställs in. Familjens tilldelning flyttas till nästa möjliga helg och efterföljande uppdrag flyttas fram. Andra perioder med fastställd städplan behöver hanteras först om flytten når periodgränsen.</p><label>Orsak<input name="reason" required></label>`,form=>sendCommand('cleaning.cancel',{periodId:p.id,date,reason:new FormData(form).get('reason')}));
  if(action==='restore') openDialog('Återställ utkast','<p>Bara den här periodens utkast återställs. Familjer, gemensam kö och andra perioder behålls. Återställningen registreras som en ny ändring.</p>',()=>sendCommand('period.restore',{periodId:p.id,versionId:id}));
  if(action==='clear-pass') openDialog('Ta bort inaktivt pass',`<p>Ta bort jour ${Number(button.dataset.key.split(':')[1])+1} den ${date??button.dataset.key.slice(0,10)}. Åtgärden registreras i historiken.</p>`,()=>sendCommand('period.clear-pass',{periodId:p.id,key:button.dataset.key}));
  if(action==='excel') await downloadExcel();
  if(action==='print') printPeriod();
}
async function downloadExcel() {
  const p=currentPeriod(),url=URL.createObjectURL(new Blob([makeWorkbook(exportSheets(workspace,p))],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const a=document.createElement('a');a.href=url;a.download=`Jourplanering-${p.start}${p.status==='draft'?'-UTKAST':''}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function printPeriod() {
  let area=$('#print-area');if(!area) {area=document.createElement('div');area.id='print-area';document.body.append(area);}
  area.innerHTML=Object.entries(exportSheets(workspace,currentPeriod())).map(([title,rows])=>`<section><h1>${escape(title)}</h1><table>${rows.map((row,i)=>`<tr>${row.map(cell=>`<${i<2?'th':'td'}>${escape(cell??'')}</${i<2?'th':'td'}>`).join('')}</tr>`).join('')}</table></section>`).join('');
  window.print();
}
await boot();
