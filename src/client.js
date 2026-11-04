import { dateKey, periodDays, generateSchedule, available, intervalCapacity, reviewSchedule, lastChildEnd, familyName } from '/planner.js';
const $ = (selector) => document.querySelector(selector);
const escape = (value) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const initialFamilies = [
  { id: 1, name: 'Björk', children: 'Alva', group: 'Ekorren', status: 'Aktiv' },
  { id: 2, name: 'Lind', children: 'Noah och Vera', group: 'Ekorren', status: 'Aktiv' },
  { id: 3, name: 'Ek', children: 'Elias', group: 'Ugglan', status: 'Aktiv' },
  { id: 4, name: 'Asp', children: 'Maja', group: 'Ekorren', status: 'Aktiv' },
  { id: 5, name: 'Alm', children: 'Leo', group: 'Ugglan', status: 'Aktiv' },
  { id: 6, name: 'Rönn', children: 'Ella', group: 'Ugglan', status: 'Aktiv' },
  { id: 7, name: 'Hassel', children: 'Sam', group: 'Ekorren', status: 'Jourbefriad' },
  { id: 8, name: 'Lönn', children: 'Iris', group: 'Ugglan', status: 'Aktiv' },
  { id: 9, name: 'Gran', children: 'Otto', group: 'Ekorren', status: 'Aktiv' },
  { id: 10, name: 'Tall', children: 'Lilly', group: 'Ugglan', status: 'Aktiv' },
  { id: 11, name: 'Sälg', children: 'Milo', group: 'Ugglan', status: 'Aktiv' },
  { id: 12, name: 'Vide', children: 'Freja', group: 'Ekorren', status: 'Aktiv' }
];
for (const f of initialFamilies) f.childRecords=f.children.split(' och ').map(name=>({name,end:''}));
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
  const items=warnings.filter(w=>w.date===button.dataset.date&&w.type!=='info');
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
function resetData() {
  families = structuredClone(initialFamilies);
  queue = [4, 1, 6, 3, 8, 2, 5, 9, 7, 10, 11, 12];
  assignments = {};
  week = 0; monthOffset = 0; generated = false; warnings = []; validationStale = false;
  periodStart='2026-11-01'; periodEnd='2027-01-31'; levels=3;
  closedDates=['2026-12-25','2027-01-01','2027-01-06']; aptDates=['2026-11-04','2026-12-02','2027-01-13'];
}
function days() {
  const first = new Date(`${periodStart}T00:00:00Z`);
  first.setUTCDate(first.getUTCDate() - (first.getUTCDay() + 6) % 7);
  return Array.from({ length: 5 }, (_, day) => {
    const date = new Date(first); date.setUTCDate(date.getUTCDate() + week * 7 + day); return date;
  });
}
function assignment(date, level) {
  const key = `${date}:${level}`;
  if (assignments[key]) return assignments[key];
  if (generated) return assignments[key] = { family: null, locked: false };
  const eligible = families.filter(f => available(f,date));
  if(eligible.length<=level) return assignments[key]={family:null,locked:false};
  const offset = Math.floor((new Date(`${date}T00:00:00Z`) - new Date(`${periodStart}T00:00:00Z`)) / 86400000);
  assignments[key] = { family: eligible[(offset * 3 + level) % eligible.length].id, locked: false };
  return assignments[key];
}
function slot(day, level) { return assignment(dateKey(days()[day]), level); }
function isClosed(date) { return date < periodStart || date > periodEnd || [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()) || closedDates.includes(date); }
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
  const names = { schema: 'Jourschema', familjer: 'Familjer', stadning: 'Helgstädning' };
  view = Object.hasOwn(names, location.hash.slice(1)) ? location.hash.slice(1) : 'schema';
  $('#breadcrumb').textContent = names[view];
  document.title = `${names[view]} · Jourplaneraren`;
  document.querySelectorAll('[data-view]').forEach(link => {
    const active = link.dataset.view === view;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  if (view === 'schema') renderSchedule();
  if (view === 'familjer') renderFamilies();
  if (view === 'stadning') renderCleaning();
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
    const dayWarnings = !validationStale ? warnings.filter(w => w.date === date && w.type !== 'info') : [];
    return `<div class="calendar-day ${closed ? 'closed-day' : ''}"><div class="calendar-date" data-calendar-date="${date}"><time datetime="${date}">${day.getUTCDate()}</time>${aptDates.includes(date) ? '<span class="apt">APT</span>' : ''}${dayWarnings.length ? `<button type="button" class="day-warning" data-action="show-warnings" data-date="${date}" aria-describedby="warning-tooltip" aria-label="Visa ${dayWarnings.length} ${dayWarnings.length===1?'varning':'varningar'} för ${date}">!</button>` : ''}</div>${closed ? `<span class="closed-label">${closedDates.includes(date) ? 'Stängt' : 'Helg'}</span>` : Array.from({length: levels}, (_,level) => assignmentButton(date,level,true)).join('')}</div>`;
  }).join('')}</div></div></section>`;
}
function renderSchedule() {
  if(!generated) warnings=reviewSchedule({start:periodStart,end:periodEnd,families,levels,closed:closedDates,assignments}).filter(w=>w.type==='departed');
  const locked = Object.values(assignments).filter(s => s.locked).length;
  $('#content').innerHTML = heading('PLANERING', 'Jourschema', `${periodLabel()} · ${generated ? 'Genererat utkast' : 'Exempelschema'}`, '<button class="button" data-action="generate">Generera schema</button>') +
    `<div class="schedule-tools"><div class="view-switch" role="group" aria-label="Schemavy">${[['week','Vecka'],['month','Månad'],['period','3 månader']].map(([mode,label]) => `<button class="${calendarMode === mode ? 'selected' : ''}" data-action="calendar-view" data-mode="${mode}" aria-pressed="${calendarMode === mode}">${label}</button>`).join('')}</div><div class="schedule-facts"><span>${families.length} familjer</span><span>${locked} låsta pass</span><button class="text-button" data-action="period-settings">Period och datum ↗</button></div></div>
    <div class="schedule-toolbar"><span>${calendarMode === 'period' ? 'Hela schemaperioden' : calendarMode === 'month' ? fmt(monthDate(monthOffset), {month:'long',year:'numeric'}) : `${fmt(days()[0],{day:'numeric',month:'long'})}–${fmt(days()[4],{day:'numeric',month:'long'})}`}</span>${calendarMode !== 'period' ? `<div class="week-nav"><button class="icon-button" data-action="calendar-prev" aria-label="Föregående ${calendarMode === 'month' ? 'månad' : 'vecka'}" ${(calendarMode === 'month' ? monthOffset === 0 : week === 0) ? 'disabled' : ''}>‹</button><button class="icon-button" data-action="calendar-next" aria-label="Nästa ${calendarMode === 'month' ? 'månad' : 'vecka'}" ${(calendarMode === 'month' ? monthOffset === 2 : new Date(days()[0].getTime()+7*86400000) > new Date(`${periodEnd}T00:00:00Z`)) ? 'disabled' : ''}>›</button></div>` : ''}</div>
    ${calendarMode === 'week' ? `<section class="panel" aria-label="Veckans jourschema"><div class="table-wrap"><table><thead><tr><th>DAG</th>${Array.from({length:levels},(_,l)=>`<th>JOUR ${l+1}</th>`).join('')}</tr></thead><tbody>${days().map(date => {const key=dateKey(date);return `<tr><td>${fmt(date,{weekday:'long',day:'numeric',month:'short'})}${aptDates.includes(key)?'<span class="apt">APT</span>':''}</td>${Array.from({length:levels},(_,l)=>`<td>${isClosed(key)?'Stängt':assignmentButton(key,l)}</td>`).join('')}</tr>`;}).join('')}</tbody></table></div></section>` : `${calendarMode === 'period' ? `<nav class="period-nav" aria-label="Gå till månad"><span>Gå till månad</span>${[0,1,2].map(offset => `<button data-action="jump-month" data-month="${offset}">${fmt(monthDate(offset),{month:'long',year:'numeric'})}</button>`).join('')}</nav>` : ''}<div class="month-overview ${calendarMode === 'period' ? 'three-months' : ''}">${calendarMode === 'period' ? [0,1,2].map(renderMonth).join('') : renderMonth(monthOffset)}</div>`}
    <div class="panel-foot calendar-legend"><div class="legend"><span><i></i>Jour 1</span><span><i class="gold"></i>Jour 2</span>${levels === 3 ? '<span><i class="clay"></i>Jour 3</span>' : ''}<span>◇ Låst pass</span></div><span>Klicka på ett pass för att ändra det.</span></div>
    ${renderReview()}`;
}
function renderReview() {
  if(!generated) return `<p class="calendar-help">Påhittade exempelpass. Välj Generera schema för att fördela perioden utifrån familjernas regler.</p>${warnings.length?`<section class="generation-result"><h2>Pass behöver ändras</h2><p>${warnings.length} pass ligger efter sista barnets slutdatum. Ändra tilldelningarna eller generera om olåsta pass.</p><ul class="warning-list">${warnings.map(w=>`<li>${escape(w.message)}<button class="text-button" data-action="show-warning-date" data-date="${w.date}">Visa datum →</button></li>`).join('')}</ul></section>`:''}`;
  if(validationStale) return '<section class="generation-result"><h2>Underlaget har ändrats</h2><p>Kontrollera igen för att se aktuella avvikelser utan att flytta något pass.</p><button class="button secondary" data-action="recheck">Kontrollera igen</button></section>';
  const capacity=intervalCapacity({start:periodStart,end:periodEnd,families,levels,closed:closedDates});
  const attention=warnings.filter(w=>w.type!=='info'),info=warnings.filter(w=>w.type==='info');
  const list=items=>items.map(w=>`<li><div><strong>${w.date}</strong> ${escape(w.message)}</div><button class="text-button" data-action="show-warning-date" data-date="${w.date}">Visa datum →</button></li>`).join('');
  return `<section class="generation-result"><h2>Granska utkastet</h2>${capacity?`<div class="capacity-explanation"><h3>Alla 14-dagarsintervall går inte att uppfylla</h3><p>Under ${capacity.start}–${capacity.end} behövs <strong>${capacity.required} pass på jour 1–2</strong>. Bara <strong>${capacity.available} familjer</strong> är tillgängliga någon gång under dessa 14 dagar. Med 14 dagars avstånd kan varje familj ta högst ett sådant pass i det intervallet.</p><p>Detta kan inte lösas enbart genom att flytta pass. Kontrollera familjeunderlaget. Om det stämmer behöver kortare intervall godtas eller planeringsförutsättningarna ändras. Appen ändrar inte regler eller befrielser automatiskt.</p></div>`:''}<p><strong>${attention.length} varningar</strong> · ${info.length} informationspunkter om jour 3.</p><ol class="review-steps"><li>Kontrollera att familjer, frånvaro och stängda datum stämmer.</li><li>Öppna ett berört datum och ändra tilldelningen vid behov. Ändrade pass låses.</li><li>Välj <strong>Kontrollera igen</strong> för ny kontroll av befintliga pass. Välj <strong>Generera schema</strong> om du vill fördela om olåsta pass.</li></ol><button class="button secondary" data-action="recheck">Kontrollera igen</button><p>Ingen tidigare schemahistorik är importerad. Granska fördelningen innan schemat används. Formellt godkännande av avvikelser återstår att bygga.</p>${attention.length?`<details><summary>Varningar att granska (${attention.length})</summary><ul class="warning-list">${list(attention)}</ul></details>`:'<p>Inga varningar hittades.</p>'}${info.length?`<details><summary>Information om korta intervall med jour 3 (${info.length})</summary><ul class="warning-list">${list(info)}</ul></details>`:''}</section>`;
}
function periodSettings() {
  openDialog('Period och datum', `<label for="period-start">Första månad i perioden</label><input type="month" id="period-start" name="month" value="${periodStart.slice(0,7)}" required><label for="levels">Journivåer</label><select name="levels" id="levels"><option value="2" ${levels===2?'selected':''}>2 jourer</option><option value="3" ${levels===3?'selected':''}>3 jourer</option></select><label for="apt-dates">APT-datum (ett per månad, separera med komma)</label><input id="apt-dates" name="apt" value="${aptDates.join(', ')}" placeholder="2026-11-04, 2026-12-02, 2027-01-13"><label for="closed-dates">Stängda vardagar och helgdagar (separera med komma)</label><input id="closed-dates" name="closed" value="${closedDates.join(', ')}"><p>Lördagar och söndagar är alltid jourfria. Kontrollera helgdagar och lov för vald period. Ett periodbyte återställer testperiodens pass.</p><p id="period-error" role="alert"></p>`, form => {
    const data=new FormData(form);
    const parse=value=>value.split(',').map(v=>v.trim()).filter(Boolean);
    const apt=parse(data.get('apt')), closed=parse(data.get('closed'));
    const start=`${data.get('month')}-01`;
    const endDate=new Date(`${start}T00:00:00Z`); endDate.setUTCMonth(endDate.getUTCMonth()+3,0);
    const end=dateKey(endDate);
    if ([...apt,...closed].some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||dateKey(new Date(`${d}T00:00:00Z`))!==d||d<start||d>end)||new Set(apt.map(d=>d.slice(0,7))).size!==apt.length) { $('#period-error').textContent='Ange giltiga datum inom perioden och högst ett APT per månad.';return false; }
    if (start!==periodStart) { assignments={};generated=false;week=0;monthOffset=0; }
    periodStart=start;periodEnd=end;levels=Number(data.get('levels'));aptDates=apt;closedDates=closed;warnings=[];validationStale=generated;
    toast('Periodens underlag är uppdaterat. Generera om för att använda ändrade regler.');
  });
}
function confirmGeneration() {
  openDialog('Generera jourschema', `<p>Fördela ${escape(periodLabel())} med ${levels} journivåer. Låsta pass behålls; övriga pass ersätts.</p><p>Prioritet: avstånd jour 1–2, månadsbalans, APT, avstånd med jour 3, veckodagar och historisk balans. Befrielse och frånvaro respekteras.</p><p>Med få familjer kan 14 dagars avstånd vara omöjligt. Avvikelser visas för granskning. Testversionen har inget importerat historikunderlag.</p>`, () => {
    const result=generateSchedule({start:periodStart,end:periodEnd,families,levels,closed:closedDates,apt:aptDates,existing:assignments});
    assignments=result.assignments;warnings=result.warnings;generated=true;validationStale=false;
    toast('Ett nytt utkast har fördelats. Granska varningarna.');
  });
}
function renderFamilies() {
  $('#content').innerHTML = heading('VARJE FAMILJ ÄR EN DEL AV HELHETEN', 'Alla på samma plats.', 'En enkel överblick över familjer, barn och jourskyldighet.', '<button class="button" data-action="add-family">+ &nbsp; Lägg till testfamilj</button>') +
    `<div class="stats">${stat('Familjer', families.length, 'I det här testregistret', '♧')}${stat('Aktiva i jouren', families.filter(f => f.status === 'Aktiv').length, 'Familjer utan jourbefrielse', '▦')}${stat('Jourbefriade', families.filter(f => f.status === 'Jourbefriad').length, 'Behåller sin plats i städkön', '◇')}</div>
    <section class="panel"><div class="panel-head"><div><h2>Familjeregister</h2><p>Endast påhittade uppgifter i den här versionen.</p></div><input class="search" id="family-search" type="search" placeholder="Sök familj eller barn…" aria-label="Sök familj eller barn"></div><div class="table-wrap"><table><thead><tr><th scope="col">FAMILJ</th><th scope="col">AVDELNING</th><th scope="col">JOURSTATUS</th><th scope="col"><span class="eyebrow">ÄNDRA</span></th></tr></thead><tbody id="family-rows"></tbody></table></div><div class="panel-foot">Ändra familjeregler och välj sedan Generera schema för att fördela om olåsta pass.</div></section>`;
  renderFamilyRows('');
  $('#family-search').addEventListener('input', event => renderFamilyRows(event.target.value));
}
function renderFamilyRows(query) {
  const rows = families.filter(f => `${f.name} ${f.children}`.toLocaleLowerCase('sv').includes(query.toLocaleLowerCase('sv')));
  $('#family-rows').innerHTML = rows.length ? rows.map(f => `<tr><td>${familyLabel(f,false)}</td><td>${escape(f.group)}</td><td><span class="pill ${f.status === 'Aktiv' ? '' : 'amber'}">${escape(f.status)}</span></td><td><button class="text-button" data-action="edit-family" data-id="${f.id}" aria-label="Ändra ${escape(familyName(f))}">Ändra ↗</button></td></tr>`).join('') : '<tr><td class="empty" colspan="4">Ingen familj matchar din sökning.</td></tr>';
}
function renderCleaning() {
  $('#content').innerHTML = heading('EN LITEN INSATS FÖR ALLAS TRIVSEL', 'Vi tar hand om vår plats.', 'Se vem som står på tur och prova att ändra ordningen i städkön.') +
    `<div class="stats">${stat('Nästa på tur', escape(familyName(family(queue[0]))), 'Exempelhelg: 7–8 november', '✧')}${stat('Familjer i kön', queue.length, 'Nya familjer läggs sist', '♧')}${stat('Ordinarie städtur', 'En i taget', 'Manuell turordning i prototypen', '↻')}</div>
    <div class="lower-grid"><section class="panel"><div class="panel-head"><div><h2>Städkön</h2><p>Flytta en familj med pilarna till höger.</p></div><span class="pill">Testdata</span></div>${queue.map((id, index) => `<div class="queue-row"><span class="queue-number">${String(index + 1).padStart(2, '0')}</span>${familyLabel(family(id))}${index === 0 ? '<span class="pill">Nästa tur</span>' : ''}<div class="queue-actions"><button class="icon-button" data-action="queue-up" data-id="${id}" ${index === 0 ? 'disabled' : ''} aria-label="Flytta ${escape(familyName(family(id)))} uppåt">↑</button><button class="icon-button" data-action="queue-down" data-id="${id}" ${index === queue.length - 1 ? 'disabled' : ''} aria-label="Flytta ${escape(familyName(family(id)))} nedåt">↓</button></div></div>`).join('')}</section><div><section class="note-card tinted"><span class="eyebrow">SÅ TÄNKER VI</span><h3>Alla bidrar, i sin tur.</h3><p>Nya familjer hamnar sist i kön. Jourbefrielse för styrelsearbete tar inte bort familjens ordinarie städtur.</p></section><section class="note-card"><h3>Här provar vi turordningen.</h3><p>Helgdagar, frånvaro, RE-dagar och tillfällig städbefrielse påverkar ännu inte den här prototypen. Ingen städplan publiceras.</p></section></div></div>`;
}
function openDialog(title, fields, onSave) {
  lastFocus = document.activeElement;
  $('#dialog-title').textContent = title;
  $('#dialog-fields').innerHTML = fields;
  saveDialog = onSave;
  $('#editor-form button[type=submit]').textContent = title === 'Generera jourschema' ? 'Generera utkast' : 'Spara ändring';
  dialog.showModal();
}
function editSlot(date, level) {
  const s = assignment(date, level);
  openDialog(`Jour ${level + 1} · ${fmt(new Date(`${date}T00:00:00Z`), { day: 'numeric', month: 'long' })}`,
    `<label for="slot-family">Barn och efternamn</label><select id="slot-family" name="family">${families.map(f => `<option value="${f.id}" ${f.id === s.family ? 'selected' : ''}>${escape(familyName(f,date))}${f.status === 'Jourbefriad' ? ' (jourbefriad)' : ''}</option>`).join('')}</select><label class="check-label"><input type="checkbox" name="locked" ${s.locked ? 'checked' : ''}> Lås passet</label><p>Om du byter familj låses passet automatiskt. Välj Kontrollera igen efter ändringen för att uppdatera varningarna utan att flytta pass.</p><p id="slot-error" role="alert"></p>`, form => {
      const id = Number(new FormData(form).get('family'));
      if (!available(family(id),date)) { $('#slot-error').textContent = 'Vald tilldelning är inte tillgänglig på datumet enligt registrerade regler och slutdatum.'; return false; }
      if (Array.from({length:levels},(_,l)=>l).some(l => l !== level && assignment(date, l).family === id)) { $('#slot-error').textContent = 'Vald tilldelning har redan ett pass den här dagen. Välj en annan.'; return false; }
      s.locked = id !== s.family || form.elements.locked.checked;
      s.family = id;assignments[`${date}:${level}`]=s;if(generated) { warnings=reviewSchedule({start:periodStart,end:periodEnd,families,levels,closed:closedDates,assignments});validationStale=false; }
      toast('Passet är ändrat i din testversion.');
    });
}
let childFieldId=0;
function childRow(child,index,removable=false) {
  index=childFieldId++;
  return `<div class="child-row"><div><label for="child-name-${index}">Barnets namn</label><input id="child-name-${index}" name="childName" value="${escape(child.name)}" maxlength="50" required></div><div><label for="child-end-${index}">Slutdatum (valfritt)</label><input type="date" id="child-end-${index}" name="childEnd" value="${escape(child.end??'')}"></div>${removable?'<button class="text-button" type="button" data-remove-child>Ta bort raden</button>':''}</div>`;
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
  openDialog(id ? familyName(f) : 'Lägg till en testfamilj',
    `<p>Använd bara påhittade namn. Uppgifterna sparas inte gemensamt.</p><label for="family-name">Efternamn</label><input id="family-name" name="name" value="${escape(f.name)}" maxlength="40" required><fieldset class="children-editor"><legend>Barn</legend><div id="child-rows">${f.childRecords.map((child,index)=>childRow(child,index)).join('')}</div><button type="button" class="text-button" id="add-child">+ Lägg till barn</button><p>Slutdatum är barnets sista dag. Jouren upphör efter att sista barnet har slutat. Tomt datum betyder att barnet är kvar.</p></fieldset><label for="group">Avdelning</label><select id="group" name="group"><option ${f.group === 'Ekorren' ? 'selected' : ''}>Ekorren</option><option ${f.group === 'Ugglan' ? 'selected' : ''}>Ugglan</option></select><label for="status">Jourstatus</label><select id="status" name="status"><option ${f.status === 'Aktiv' ? 'selected' : ''}>Aktiv</option><option ${f.status === 'Jourbefriad' ? 'selected' : ''}>Jourbefriad</option></select><details class="family-rules"><summary>Regler för jourfördelning</summary><div class="family-rule-grid"><div><label for="active-start">Jourstart (valfri)</label><input id="active-start" type="date" name="start" value="${f.start??''}"></div><div><label for="active-end">Jourens slutdatum (valfritt)</label><input id="active-end" type="date" name="end" value="${f.end??''}"></div><div><label for="exempt-start">Jourbefrielse från</label><input id="exempt-start" type="date" name="exemptStart" value="${f.exemptions?.[0]?.start??''}"></div><div><label for="exempt-end">Jourbefrielse till</label><input id="exempt-end" type="date" name="exemptEnd" value="${f.exemptions?.[0]?.end??''}"></div><div><label for="leave-start">Ledighet från</label><input id="leave-start" type="date" name="leaveStart" value="${f.leave?.[0]?.start??''}"></div><div><label for="leave-end">Ledighet till</label><input id="leave-end" type="date" name="leaveEnd" value="${f.leave?.[0]?.end??''}"></div></div><label for="blocked-days">Spärrade veckodagar</label><select id="blocked-days" name="blocked" multiple size="5">${['Måndag','Tisdag','Onsdag','Torsdag','Fredag'].map((d,i)=>`<option value="${i+1}" ${(f.blockedWeekdays??[]).includes(i+1)?'selected':''}>${d}</option>`).join('')}</select><p>Ledighet blockerar datum utan att minska jourandelen. Daterad jourbefrielse minskar andelen. Första testversionens formulär stödjer ett intervall av varje typ.</p></details><p id="family-error" role="alert"></p>`, form => {
      const formData=new FormData(form);
      const data = Object.fromEntries(formData);
      for (const [a,b] of [['start','end'],['exemptStart','exemptEnd'],['leaveStart','leaveEnd']]) {
        if ((a!=='start' && Boolean(data[a])!==Boolean(data[b])) || (data[a] && data[b] && data[a]>data[b])) { $('#family-error').textContent='Kontrollera datumintervallen: ange både från och till för befrielse och ledighet.';return false; }
      }
      data.exemptions=data.exemptStart?[{start:data.exemptStart,end:data.exemptEnd}]:[];
      data.leave=data.leaveStart?[{start:data.leaveStart,end:data.leaveEnd}]:[];
      data.blockedWeekdays=formData.getAll('blocked').map(Number);
      for(const key of ['exemptStart','exemptEnd','leaveStart','leaveEnd','blocked']) delete data[key];
      data.childRecords=[...form.querySelectorAll('.child-row')].map(row=>({name:row.querySelector('[name=childName]').value.trim(),end:row.querySelector('[name=childEnd]').value}));
      data.name=data.name.trim();
      if(data.childRecords.some(child=>!child.name)||!data.childRecords.length) { $('#family-error').textContent='Fyll i barnens namn.';return false; }
      data.children=new Intl.ListFormat('sv',{type:'conjunction'}).format(data.childRecords.map(child=>child.name));
      delete data.childName;delete data.childEnd;
      if (!data.name || !data.children) { $('#family-error').textContent = 'Fyll i efternamn och barnens namn.'; return false; }
      if (id) Object.assign(f, data);
      else { const newId = Math.max(...families.map(item => item.id)) + 1; families.push({ id: newId, ...data }); queue.push(newId); }
      if(generated) { warnings=reviewSchedule({start:periodStart,end:periodEnd,families,levels,closed:closedDates,assignments});validationStale=false; }
      const departed=reviewSchedule({start:periodStart,end:periodEnd,families,levels,closed:closedDates,assignments}).filter(w=>w.type==='departed');
      toast(departed.length?`${departed.length} planerade pass behöver ändras efter slutdatum. Se Jourschema.`:id ? 'Uppgifterna är uppdaterade.' : 'Tillagd sist i städkön.');
    });
}
$('#content').addEventListener('click', event => {
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
  if (action === 'recheck') { warnings=reviewSchedule({start:periodStart,end:periodEnd,families,levels,closed:closedDates,assignments});validationStale=false;render();document.querySelector('.generation-result').scrollIntoView({block:'start'});toast('Kontrollerna är uppdaterade. Inga pass har flyttats.'); }
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
    [queue[index], queue[target]] = [queue[target], queue[index]];
    render();
    const movedButton = document.querySelector(`[data-action="${action}"][data-id="${id}"]`);
    if (movedButton && !movedButton.disabled) movedButton.focus();
    toast(`${familyName(family(Number(id)))} är nu på plats ${target + 1}.`);
  }
});
$('#editor-form').addEventListener('submit', event => {
  event.preventDefault();
  if (saveDialog(event.target) === false) return;
  dialog.close(); render();
});
$('#close-dialog').addEventListener('click', () => dialog.close());
$('#cancel-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { if (lastFocus?.isConnected) lastFocus.focus(); else $('#main').focus(); });
$('#reset').addEventListener('click', () => openDialog('Börja om med testdata?', '<p>Dina ändringar i den här prototypen återställs. Du får tillbaka de ursprungliga familjerna, passen och städkön.</p>', () => { resetData(); toast('Testversionen är återställd.'); }));
window.addEventListener('hashchange', render);
resetData(); render();
fetch('/api/me').then(response => { if (!response.ok) throw new Error('Authentication failed'); return response.json(); })
  .then(user => { $('#identity').textContent = user.email; })
  .catch(() => { $('#identity').textContent = 'Kontot kunde inte hämtas'; });

$('#content').addEventListener('mouseover',event=>{const button=event.target.closest('.day-warning');if(button) showWarningTooltip(button);});
$('#content').addEventListener('focusin',event=>{if(event.target.matches('.day-warning')) showWarningTooltip(event.target);});
document.addEventListener('mouseout',event=>{if(tooltipTrigger&&!tooltipTrigger.contains(event.relatedTarget)&&!warningTooltip.contains(event.relatedTarget)&&(tooltipTrigger.contains(event.target)||warningTooltip.contains(event.target))) hideWarningTooltip();});
$('#content').addEventListener('focusout',event=>{if(event.target.matches('.day-warning')) hideWarningTooltip();});
document.addEventListener('keydown',event=>{if(event.key==='Escape') hideWarningTooltip();});
document.addEventListener('click',event=>{if(!event.target.closest('.day-warning')&&!warningTooltip.contains(event.target)) hideWarningTooltip();});
window.addEventListener('scroll',event=>{if(!warningTooltip.contains(event.target)) hideWarningTooltip();},true);
