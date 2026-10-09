import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Store } from '../js/store.js';
const sample = JSON.parse(fs.readFileSync(new URL('../examples/demo.json', import.meta.url)))[0];
const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => memory.get(k) || null,
  setItem: (k, v) => memory.set(k, v),
};
const plan = {
  date: '2026-01-01',
  words: [sample],
  reviewIds: [],
  reviewDone: [],
  completedActual: null,
};
const first = {
  id: 'event-a',
  profileId: 'alice',
  wordId: sample.id,
  level: 2,
  snapshot: sample,
  kind: 'new',
  actualDate: '2026-01-01',
  planDate: '2026-01-01',
  occurredAt: '2026-01-01T01:00:00Z',
  rating: 'remember',
  correct: true,
  timeZone: 'Asia/Taipei',
};
test('same event replay and separate same-day events cannot double advance', async () => {
  const store = new Store(true);
  store.profile = { id: 'alice' };
  const records = {
    alice: { plans: { '2026-01-01': structuredClone(plan) }, progress: {}, events: {} },
    bob: { plans: {}, progress: {}, events: {} },
  };
  localStorage.setItem('english-demo-v1', JSON.stringify({ records }));
  await store.commit(first);
  await store.commit(first);
  await store.commit({ ...first, id: 'event-b' });
  assert.equal(store.state.progress[sample.id].revision, 1);
  assert.equal(store.state.progress[sample.id].correct, 1);
  assert.equal(store.state.progress[sample.id].nextDue, '2026-01-02');
  assert.equal(
    Object.keys(JSON.parse(localStorage.getItem('english-demo-v1')).records.bob.progress).length,
    0,
  );
});
test('review wrong answer cannot be reported as remembered', () => {
  const store = new Store();
  assert.throws(
    () => store.reduce({ ...first, correct: false }, {}, structuredClone(plan)),
    /答錯/,
  );
});
test('future and unassigned event rejected before progress writes', () => {
  const store = new Store();
  assert.throws(
    () => store.reduce({ ...first, actualDate: '2025-12-31' }, {}, structuredClone(plan)),
    /提前/,
  );
  assert.throws(
    () => store.reduce({ ...first, wordId: 'level2-0009' }, {}, structuredClone(plan)),
    /不在/,
  );
});
