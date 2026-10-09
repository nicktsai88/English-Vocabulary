import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Store } from '../js/store.js';
const sample = JSON.parse(fs.readFileSync(new URL('../examples/demo.json', import.meta.url)))[0];
test('level catalogue pages without a composite index and sorts all 503 results numerically', async () => {
  const store = new Store(false);
  const rows = Array.from({ length: 503 }, (_, i) => ({
    ...sample,
    id: `fixture-${i}`,
    level: 2,
    sequence: 503 - i,
  }));
  rows.push({ ...sample, id: 'other-level', level: 1, sequence: 1 });
  let requests = 0;
  store.col = () => 'words';
  store.F = {
    query: (base, ...clauses) => ({ clauses: [...(base.clauses || []), ...clauses] }),
    where: (field, operator, value) => ({ field, operator, value }),
    orderBy: () => {
      throw Error('This equality + ordering query requires an index');
    },
    limit: (count) => ({ count }),
    startAfter: (snapshot) => ({ after: snapshot.id }),
    getDocs: async (query) => {
      requests++;
      const filter = query.clauses.find((c) => c.field);
      assert.equal(filter.field, 'level');
      assert.equal(filter.operator, '==');
      const all = rows
        .filter((w) => w.level === filter.value)
        .sort((a, b) => a.id.localeCompare(b.id));
      const after = query.clauses.find((c) => c.after)?.after;
      const start = after ? all.findIndex((w) => w.id === after) + 1 : 0;
      const page = all.slice(start, start + query.clauses.find((c) => c.count).count);
      return { size: page.length, docs: page.map((w) => ({ id: w.id, data: () => w })) };
    },
  };
  const result = await store.words(2);
  assert.equal(requests, 3);
  assert.equal(result.length, 503);
  assert.equal(new Set(result.map((w) => w.id)).size, 503);
  assert.deepEqual(
    result.map((w) => w.sequence),
    Array.from({ length: 503 }, (_, i) => i + 1),
  );
});
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

test('background answers return after local persistence and drain arrivals during an active upload', async () => {
 const {outbox}=await import('../js/outbox.js');
 const original={...outbox};const queue=new Map();let release,entered;
 const started=new Promise(r=>entered=r),blocked=new Promise(r=>release=r);
 Object.assign(outbox,{list:async()=>[...queue.values()],put:async(_,e)=>queue.set(e.id,e),remove:async(_,id)=>queue.delete(id)});
 try {
  const store=new Store(true);store.uid='fast';store.profile={id:'fast',timeZone:'Asia/Taipei'};
  const committed=[];let finished;
  const drained=new Promise(r=>finished=r);
  store.change=()=>finished();
  store.commit=async(e)=>{committed.push(e.id);if(e.id==='one'){entered();await blocked;}};
  await store.queue({id:'one'},{background:true});await started;
  await store.queue({id:'two'},{background:true});
  assert.equal(queue.size,2);assert.deepEqual(committed,['one']);
  release();await drained;
  assert.deepEqual(committed,['one','two']);assert.equal(queue.size,0);
 } finally {Object.assign(outbox,original);}
});
