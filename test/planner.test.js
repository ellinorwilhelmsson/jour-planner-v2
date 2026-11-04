import test from 'node:test';
import assert from 'node:assert/strict';
import { available, obligation, generateSchedule } from '../src/planner.js';
const families = Array.from({ length: 24 }, (_, i) => ({ id: i + 1, name: `Familj ${i + 1}`, status: 'Aktiv' }));
const options = { start: '2026-11-01', end: '2027-01-31', families, levels: 3, closed: ['2026-12-25', '2027-01-01', '2027-01-06'], apt: ['2026-11-04','2026-12-02','2027-01-13'] };
test('leave blocks dates but never reduces obligation; exemption does', () => {
  const f = { id: 1, status: 'Aktiv', leave: [{ start: '2026-11-01', end: '2026-11-21' }] };
  assert.equal(obligation(f, '2026-11-01', '2026-11-30'), 30);
  assert.equal(available(f, '2026-11-02'), false);
  assert.equal(obligation({ ...f, exemptions: [{ start: '2026-11-01', end: '2026-11-14' }] }, '2026-11-01', '2026-11-30'), 16);
  assert.equal(obligation({ ...f, start: '2026-11-15' }, '2026-11-01', '2026-11-30'), 16);
});
test('generation fills only open weekdays and never gives two duties on one day', () => {
  const result = generateSchedule(options);
  const byDay = new Map();
  for (const [key, value] of Object.entries(result.assignments)) {
    const date = key.split(':')[0];
    assert.ok(![0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()));
    assert.ok(!options.closed.includes(date));
    assert.ok(value.family);
    const ids = byDay.get(date) ?? new Set();
    assert.ok(!ids.has(value.family)); ids.add(value.family); byDay.set(date, ids);
  }
  assert.ok([...byDay.values()].every(ids => ids.size === 3));
});
test('active dates, exemptions, weekday blocks and leave are hard constraints', () => {
  const restricted = { ...families[0], start: '2026-11-15', end: '2027-01-15', blockedWeekdays: [1], exemptions: [{ start: '2026-12-01', end: '2026-12-14' }], leave: [{ start: '2026-11-16', end: '2026-11-22' }] };
  const result = generateSchedule({ ...options, families: [restricted, ...families.slice(1)] });
  for (const [key, value] of Object.entries(result.assignments)) if (value.family === restricted.id) assert.equal(available(restricted, key.split(':')[0]), true);
});
test('locked assignments survive, unlocked assignments are replaced, invalid locks are reported', () => {
  const existing = { '2026-11-04:0': { family: 17, locked: true }, '2026-11-02:0': { family: 999, locked: false }, '2026-12-25:0': { family: 1, locked: true } };
  const result = generateSchedule({ ...options, existing });
  assert.deepEqual(result.assignments['2026-11-04:0'], existing['2026-11-04:0']);
  assert.notEqual(result.assignments['2026-11-02:0'].family, 999);
  assert.ok(result.warnings.some(w => w.type === 'locked' && w.date === '2026-12-25'));
});
test('infeasible intervals produce warnings; impossible staffing stays empty', () => {
  const result = generateSchedule({ ...options, families: families.slice(0, 3) });
  assert.ok(result.warnings.some(w => w.type === 'interval'));
  const none = generateSchedule({ ...options, families: [{ id: 1, name: 'Befriad', status: 'Jourbefriad' }] });
  assert.ok(Object.values(none.assignments).every(s => s.family === null));
  assert.ok(none.warnings.every(w => w.type === 'empty'));
});
test('a later primary-duty lock influences earlier interval choices', () => {
  const result = generateSchedule({ start: '2026-11-02', end: '2026-11-10', families: families.slice(0, 2), levels: 2, existing: { '2026-11-10:0': { family: 1, locked: true } } });
  assert.equal(result.assignments['2026-11-02:0'].family, 2);
});
test('same input produces the same reviewable schedule', () => {
  assert.deepEqual(generateSchedule(options), generateSchedule(options));
});
