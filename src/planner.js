export const dateKey = date => date.toISOString().slice(0, 10);
const asDate = value => new Date(`${value}T00:00:00Z`);
const inRange = (date, range) => date >= range.start && date <= range.end;
const active = (family, date) => (!family.start || date >= family.start) && (!family.end || date <= family.end);
const exempt = (family, date) => family.status === 'Jourbefriad' || (family.exemptions ?? []).some(range => inRange(date, range));
export function periodDays(start, end) {
  const days = [];
  for (let date = asDate(start); date <= asDate(end); date.setUTCDate(date.getUTCDate() + 1)) days.push(dateKey(date));
  return days;
}
export function obligation(family, start, end) {
  return periodDays(start, end).filter(date => active(family, date) && !exempt(family, date)).length;
}
export function available(family, date) {
  return active(family, date) && !exempt(family, date)
    && !(family.leave ?? []).some(range => inRange(date, range))
    && !(family.blockedWeekdays ?? []).includes(asDate(date).getUTCDay());
}
const gap = (a, b) => Math.abs((asDate(a) - asDate(b)) / 86400000);
const compare = (a, b) => {
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-8) return a[i] - b[i];
  return 0;
};

// Deterministic, chronological allocation. Priorities are compared in order,
// rather than blended into weights that could override a higher-priority rule.
export function generateSchedule({ start, end, families, levels = 3, closed = [], apt = [], existing = {}, history = [] }) {
  const allDays = periodDays(start, end);
  const working = allDays.filter(date => ![0, 6].includes(asDate(date).getUTCDay()) && !closed.includes(date));
  const result = {};
  const records = history.map(record => ({ ...record }));
  const warnings = [];
  const monthWeights = new Map();
  for (const month of new Set(allDays.map(date => date.slice(0, 7)))) {
    const monthDays = allDays.filter(date => date.startsWith(month));
    monthWeights.set(month, new Map(families.map(f => [f.id, obligation(f, monthDays[0], monthDays.at(-1))])));
  }
  // All locked assignments are considered before filling gaps, including locks
  // later in the period. Invalid locks remain visible and require manual review.
  for (const [key, value] of Object.entries(existing)) {
    const [date, levelText] = key.split(':');
    const level = Number(levelText);
    if (!value.locked || date < start || date > end) continue;
    result[key] = { ...value };
    records.push({ date, level, family: value.family, apt: apt.includes(date) && level === 0 });
    const f = families.find(item => item.id === value.family);
    if (!working.includes(date) || level >= levels || !f || !available(f, date)) {
      warnings.push({ type: 'locked', date, message: 'Ett låst pass strider mot aktuellt underlag. Lås upp eller korrigera det.' });
    }
  }
  for (const date of working) {
    const weights = monthWeights.get(date.slice(0, 7));
    for (let level = 0; level < levels; level++) {
      const key = `${date}:${level}`;
      if (result[key]) continue;
      const candidates = families.filter(f => available(f, date)
        && !records.some(record => record.date === date && record.family === f.id));
      const score = f => {
        const own = records.filter(record => record.family === f.id);
        const weight = weights.get(f.id) || 1;
        const monthRecords = own.filter(record => record.date.startsWith(date.slice(0, 7)));
        const near = own.filter(record => gap(record.date, date) < 14);
        const primarySpacing = level < 2 ? near.filter(record => record.level < 2).reduce((sum, r) => sum + 14 - gap(r.date, date), 0) : 0;
        // Month balance considers overall counts, then the individual duty level.
        const monthly = [monthRecords.length / weight, monthRecords.filter(r => r.level === level).length / weight];
        const aptBalance = apt.includes(date) && level === 0 ? own.filter(r => r.apt).length / weight : 0;
        const thirdSpacing = near.filter(record => level === 2 || record.level === 2).reduce((sum, r) => sum + 14 - gap(r.date, date), 0);
        const weekdays = own.filter(r => asDate(r.date).getUTCDay() === asDate(date).getUTCDay()).length;
        // Historical load is an imbalance relative to expected allocation;
        // missing history starts at zero, never fabricating past obligations.
        const historical = (f.historyBalance ?? 0) + own.filter(r => r.date < start).length;
        return [primarySpacing, ...monthly, aptBalance, thirdSpacing, weekdays, historical, f.id];
      };
      candidates.sort((a, b) => compare(score(a), score(b)));
      const chosen = candidates[0];
      if (!chosen) {
        result[key] = { family: null, locked: false };
        warnings.push({ type: 'empty', date, message: `Jour ${level + 1} saknar tillgänglig familj.` });
        continue;
      }
      result[key] = { family: chosen.id, locked: false };
      records.push({ date, level, family: chosen.id, apt: apt.includes(date) && level === 0 });
    }
  }
  const current = records.filter(r => r.date >= start && r.date <= end);
  for (const f of families) {
    const own = current.filter(r => r.family === f.id).sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < own.length; i++) {
      for (let j = i + 1; j < own.length && gap(own[i].date, own[j].date) < 14; j++) {
        const primary = own[i].level < 2 && own[j].level < 2;
        warnings.push({ type: primary ? 'interval' : 'info', date: own[j].date, family: f.id,
          message: `${f.name}: ${gap(own[i].date, own[j].date)} dagar mellan jour ${own[i].level + 1} (${own[i].date}) och jour ${own[j].level + 1} (${own[j].date}).` });
      }
    }
    const seen = new Set();
    for (const record of own) {
      if (seen.has(record.date)) warnings.push({ type: 'locked', date: record.date, message: `${f.name} har flera låsta pass samma dag.` });
      seen.add(record.date);
    }
  }
  return { assignments: result, warnings };
}
