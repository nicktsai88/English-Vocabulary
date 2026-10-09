import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  dateKey,
  addDays,
  dayDiff,
  chunks,
  advance,
  validateRows,
  validateWord,
  csvCell,
  correctAnswer,
  planStatus,
  validateBackup,
  streak,
  timelineStreak,
} from '../js/core.js';
import { sheetLevel, mapRows, parseJSON } from '../js/importer.js';
const samples = JSON.parse(fs.readFileSync(new URL('../examples/demo.json', import.meta.url)));
const e = (date, rating = 'remember') => ({
  wordId: 'level2-0001',
  level: 2,
  actualDate: date,
  occurredAt: date + 'T02:00:00Z',
  rating,
  correct: rating === 'remember',
  timeZone: 'Asia/Taipei',
});
test('Taipei midnight differs from UTC and respects DST elsewhere', () => {
  assert.equal(dateKey(new Date('2026-10-09T16:01:00Z')), '2026-10-10');
  assert.equal(dateKey(new Date('2026-10-09T15:59:59Z')), '2026-10-09');
  assert.equal(dateKey(new Date('2026-03-08T07:01:00Z'), 'America/New_York'), '2026-03-08');
});
test('date arithmetic crosses leap day and years', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(dayDiff('2026-01-01', '2026-01-31'), 30);
  assert.throws(() => addDays('2026-02-30', 1));
});
test('stable numeric sorting, 15 cap, cross-level fill, Level 1 excluded', () => {
  const words = Array.from({ length: 23 }, (_, i) => ({
    ...samples[0],
    id: 'x' + i,
    sequence: 23 - i,
    level: i < 17 ? 2 : 3,
  }));
  words.push({ ...samples[0], level: 1, sequence: 1 });
  const result = chunks(words);
  assert.deepEqual(
    result.map((r) => r.length),
    [15, 8],
  );
  assert.equal(
    result.flat().some((w) => w.level === 1),
    false,
  );
  assert.equal(
    result[1].some((w) => w.level === 3),
    true,
  );
  assert.deepEqual(chunks(words.reverse()), result);
});
test('cumulative 1,2,4,7,15,30 days and graduation', () => {
  let p = advance(null, e('2026-01-01'));
  assert.equal(p.nextDue, '2026-01-02');
  for (const [date, next] of [
    ['2026-01-02', '2026-01-03'],
    ['2026-01-03', '2026-01-05'],
    ['2026-01-05', '2026-01-08'],
    ['2026-01-08', '2026-01-16'],
    ['2026-01-16', '2026-01-31'],
    ['2026-01-31', null],
  ]) {
    p = advance(p, e(date));
    assert.equal(p.nextDue, next);
  }
  assert.equal(p.stage, 6);
});
test('overdue answers advance exactly once, next due at least tomorrow', () => {
  let p = advance(null, e('2026-01-01'));
  p = advance(p, e('2026-02-01'));
  assert.equal(p.stage, 1);
  assert.equal(p.nextDue, '2026-02-02');
  assert.deepEqual(advance(p, e('2026-02-01')), p);
  assert.deepEqual(advance(p, e('2026-01-31')), p);
});
test('hard does not advance; forgot resets baseline; same-day relearn preserves tomorrow', () => {
  let p = advance(null, e('2026-01-01'));
  p = advance(p, e('2026-01-02', 'hard'));
  assert.equal(p.stage, 0);
  assert.equal(p.nextDue, '2026-01-03');
  p = advance(p, e('2026-01-03', 'forget'));
  assert.equal(p.baseDate, '2026-01-03');
  assert.equal(p.nextDue, '2026-01-04');
  assert.deepEqual(advance(p, e('2026-01-03')), p);
});
test('Level 1 cannot enter review algorithm', () =>
  assert.throws(() => advance(null, { ...e('2026-01-01'), level: 1 })));
test('import validates all rows with sheet and line location', () => {
  const rows = mapRows(
    'level2',
    [Object.values({ a: '序號', b: '英文單字' }), ['abc', 'bad']],
    { sequence: 0, word: 1 },
    2,
  );
  const r = validateRows(rows)[0];
  assert.equal(r.sheet, 'level2');
  assert.equal(r.row, 2);
  assert.ok(r.errors.some(([field]) => field === 'sequence'));
});
test('six sheets are recognized, unknown names are not guessed', () => {
  for (let n = 1; n <= 6; n++) assert.equal(sheetLevel(' Level' + n + ' '), n);
  assert.equal(sheetLevel('English'), null);
  assert.equal(sheetLevel('level7'), null);
});
test('six provided records valid, same-key duplicates fail, cross-level spellings remain separate', () => {
  assert.equal(validateRows(samples).flatMap((r) => r.errors).length, 0);
  assert.equal(validateRows([samples[0], samples[0]])[1].errors.length, 1);
  assert.equal(validateRows([samples[0], { ...samples[0], level: 3 }])[1].errors.length, 0);
  assert.throws(() => parseJSON('{}'));
});
test('invalid phrases and unsafe sizes are rejected', () => {
  assert.ok(validateWord({ ...samples[0], phrases: [{ type: 'wrong' }] }).errors.length);
  assert.ok(validateWord({ ...samples[0], meaningZh: 'x'.repeat(2001) }).errors.length);
});
test('spelling tolerates case and whitespace only plus explicit aliases', () => {
  assert.equal(correctAnswer(' ABILITY ', samples[1]), true);
  assert.equal(correctAnswer('ab il ity', samples[1]), false);
  assert.equal(correctAnswer('a', samples[0]), false);
  assert.equal(correctAnswer('a / an', samples[0]), true);
});
test('CSV formulas escaped and quotes doubled', () => {
  assert.equal(csvCell('=1+1'), '"\'=1+1"');
  assert.equal(csvCell('x"y'), '"x""y"');
});
test('review completion depends on responses, not positive ratings', () => {
  const plan = { words: [], reviewIds: ['a', 'b'], reviewDone: ['a', 'b'] };
  assert.equal(planStatus(plan, {}).complete, true);
  assert.equal(planStatus({ words: [], reviewIds: [], reviewDone: [] }, {}).complete, false);
});
test('backup validation rejects malformed collections and future-invalid dates', () => {
  const b = {
    schema: 1,
    profile: {
      name: 'Test',
      emoji: '🐱',
      startDate: '2026-01-01',
      courseVersion: 'demo',
      timeZone: 'Asia/Taipei',
    },
    plans: [],
    progress: [],
    events: [],
  };
  assert.equal(validateBackup(b), b);
  assert.throws(() =>
    validateBackup({ ...b, plans: [{ date: '2026-02-30', words: [], reviewIds: [] }] }),
  );
  assert.throws(() => validateBackup({ ...b, progress: [{ wordId: '../../x', stage: 1 }] }));
});
test('backfill does not create a streak; empty days do not break it', () => {
  const plans = {
    a: { date: '2026-01-01', words: [samples[0]], reviewIds: [], completedActual: '2026-01-03' },
    b: { date: '2026-01-02', words: [], reviewIds: [], completedActual: null },
    c: { date: '2026-01-03', words: [samples[1]], reviewIds: [], completedActual: '2026-01-03' },
  };
  assert.equal(streak(plans, '2026-01-03'), 1);
});
test('timeline ignores an unopened empty day but breaks on unvisited overdue tasks', () => {
  const plans = { '2026-01-01': { words: [samples[0]] } };
  const events = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-05'].map((day, i) => ({
    ...e(day),
    kind: i ? 'review' : 'new',
    planDate: day,
  }));
  assert.equal(timelineStreak(plans, events, '2026-01-01', '2026-01-05', 1), 4);
  const late = [
    ...events.slice(0, 3),
    { ...e('2026-01-06'), kind: 'review', planDate: '2026-01-06' },
  ];
  assert.equal(timelineStreak(plans, late, '2026-01-01', '2026-01-06', 1), 1);
});
test('timeline backfill never creates a completed day in the past', () => {
  const plans = { '2026-01-01': { words: [samples[0]] } };
  const events = [{ ...e('2026-01-03'), kind: 'new', planDate: '2026-01-01' }];
  assert.equal(timelineStreak(plans, events, '2026-01-01', '2026-01-03', 1), 0);
});
test('CSV leading whitespace cannot conceal a formula', () =>
  assert.equal(csvCell('  =SUM(A1:A2)'), '"\'  =SUM(A1:A2)"'));
test('future-stage and already-graduated reviews cannot advance', () => {
  const p = advance(null, e('2026-01-01'));
  assert.deepEqual(advance({ ...p, nextDue: '2026-01-05' }, e('2026-01-03')), {
    ...p,
    nextDue: '2026-01-05',
  });
  const done = { ...p, stage: 6, nextDue: null };
  assert.deepEqual(advance(done, e('2026-02-03')), done);
});
