import fs from 'node:fs';
import { test, before, after } from 'node:test';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import * as F from 'firebase/firestore';
import { Store } from '../js/store.js';
let env;
const ns = 'apps/english-vocabulary-v1';
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-english-vocabulary',
    firestore: {
      rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});
after(async () => env?.cleanup());
test('owner account allowed; cross-owner and unauthenticated access rejected', async () => {
  const a = env.authenticatedContext('alice').firestore(),
    b = env.authenticatedContext('bob').firestore(),
    guest = env.unauthenticatedContext().firestore();
  await assertSucceeds(
    setDoc(doc(a, ns, 'accounts', 'alice'), {
      names: { Alice: 'p' },
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(getDoc(doc(b, ns, 'accounts', 'alice')));
  await assertFails(getDoc(doc(guest, ns, 'accounts', 'alice')));
  await assertFails(
    setDoc(doc(b, ns, 'accounts', 'alice'), { names: {}, updatedAt: serverTimestamp() }),
  );
});
test('family visitors can edit words without admin claims; unauthenticated writes and deletion denied', async () => {
  const a = env
      .authenticatedContext('family-editor', { firebase: { sign_in_provider: 'anonymous' } })
      .firestore(),
    learner = env.authenticatedContext('alice').firestore();
  const w = JSON.parse(fs.readFileSync(new URL('../examples/demo.json', import.meta.url)))[0];
  await assertSucceeds(setDoc(doc(a, ns, 'words', w.id), w));
  await assertSucceeds(updateDoc(doc(learner, ns, 'words', w.id), { meaningZh: 'changed' }));
  const guest = env.unauthenticatedContext().firestore();
  await assertFails(updateDoc(doc(guest, ns, 'words', w.id), { meaningZh: 'unauthenticated' }));
  await assertFails(deleteDoc(doc(a, ns, 'words', w.id)));
  await assertFails(setDoc(doc(a, 'apps/Chinese-Learning-1/words/test'), w));
});
test('profile isolation and malformed progress denied', async () => {
  const a = env.authenticatedContext('alice').firestore(),
    b = env.authenticatedContext('bob').firestore();
  const path = ns + '/accounts/alice/profiles/p';
  await assertSucceeds(
    setDoc(doc(a, path), {
      id: 'p',
      name: '小明',
      emoji: '🐱',
      startDate: '2026-01-01',
      timeZone: 'Asia/Taipei',
      courseVersion: 'none',
      status: 'ready',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(getDoc(doc(b, path)));
  await assertFails(
    setDoc(doc(a, path + '/progress/level2-0001'), {
      wordId: 'wrong',
      stage: 99,
      updatedAt: serverTimestamp(),
    }),
  );
});
test('published snapshots cannot be overwritten, even by family editors', async () => {
  const a = env
    .authenticatedContext('family-editor', { firebase: { sign_in_provider: 'anonymous' } })
    .firestore();
  await assertSucceeds(setDoc(doc(a, ns + '/curricula/v1'), { ready: false, days: 1 }));
  await assertSucceeds(setDoc(doc(a, ns + '/curricula/v1/days/0'), { words: [], index: 0 }));
  await assertSucceeds(updateDoc(doc(a, ns + '/curricula/v1'), { ready: true }));
  await assertFails(updateDoc(doc(a, ns + '/curricula/v1/days/0'), { words: [] }));
  await assertFails(setDoc(doc(a, ns + '/curricula/v1/days/1'), { words: [], index: 1 }));
});
test('100-word family transaction remains within security access-call limits', async () => {
  const a = env
    .authenticatedContext('family-editor', { firebase: { sign_in_provider: 'anonymous' } })
    .firestore();
  const sample = JSON.parse(fs.readFileSync(new URL('../examples/demo.json', import.meta.url)))[0];
  await assertSucceeds(
    F.runTransaction(a, async (tx) => {
      for (let i = 100; i < 200; i++) {
        const id = 'level3-' + String(i).padStart(4, '0');
        tx.set(doc(a, ns, 'words', id), { ...sample, id, level: 3, sequence: i });
      }
    }),
  );
});
test('real Store plan and concurrent answer transactions obey rules and are idempotent', async () => {
  const admin = env
      .authenticatedContext('family-editor', { firebase: { sign_in_provider: 'anonymous' } })
      .firestore(),
    db = env.authenticatedContext('integration').firestore();
  const sample = JSON.parse(fs.readFileSync(new URL('../examples/demo.json', import.meta.url)))[0];
  await setDoc(doc(admin, ns + '/curricula/integration'), { ready: false, days: 1 });
  await setDoc(doc(admin, ns + '/curricula/integration/days/0'), { words: [sample], index: 0 });
  await updateDoc(doc(admin, ns + '/curricula/integration'), { ready: true });
  await setDoc(doc(admin, ns + '/meta/current'), { version: 'integration', days: 1 });
  const store = new Store(false);
  Object.assign(store, { F, db, uid: 'integration' });
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  const profile = await store.createProfile('測試學習者', '🐼', 'Asia/Taipei', {
    startDate: '2026-01-01',
  });
  store.profile = profile;
  const plan = await store.ensurePlan('2026-01-01');
  if (plan.words.length !== 1) throw Error('Plan missing word');
  const event = {
    id: 'integration-first',
    profileId: profile.id,
    wordId: sample.id,
    level: 2,
    snapshot: sample,
    kind: 'new',
    planDate: '2026-01-01',
    actualDate: '2026-01-01',
    occurredAt: '2026-01-01T04:00:00Z',
    rating: 'remember',
    correct: true,
    timeZone: 'Asia/Taipei',
  };
  await Promise.all([store.commit(event), store.commit(event)]);
  await store.commit({ ...event, id: 'another-tab' });
  const path = ns + '/accounts/integration/profiles/' + profile.id;
  let progress = (await getDoc(doc(db, path + '/progress/' + sample.id))).data();
  if (progress.revision !== 1 || progress.correct !== 1 || progress.nextDue !== '2026-01-02')
    throw Error('Duplicate progression');
  await setDoc(doc(db, path + '/dailyPlans/2026-01-02'), {
    date: '2026-01-02',
    words: [],
    reviewIds: [sample.id],
    reviewDone: [],
    courseVersion: 'integration',
    updatedAt: serverTimestamp(),
  });
  await store.commit({
    ...event,
    id: 'review-1',
    kind: 'review',
    actualDate: '2026-01-02',
    planDate: '2026-01-02',
    occurredAt: '2026-01-02T04:00:00Z',
  });
  progress = (await getDoc(doc(db, path + '/progress/' + sample.id))).data();
  if (progress.stage !== 1 || progress.nextDue !== '2026-01-03')
    throw Error('Review schedule mismatch');
  const duplicateNames = await Promise.allSettled([
    store.createProfile('同名', '🐱'),
    store.createProfile('同名', '🐰'),
  ]);
  if (duplicateNames.filter((r) => r.status === 'fulfilled').length !== 1)
    throw Error('Duplicate learner names allowed');
  const other = env.authenticatedContext('other').firestore();
  await assertFails(getDoc(doc(other, path + '/progress/' + sample.id)));
  await assertFails(setDoc(doc(other, path + '/reviewEvents/attacker'), event));
});

test('unassigned learner enrolls on Oct 9 once, keeps identity and replaces only empty plans', async () => {
  const assert = (await import('node:assert/strict')).default;
  const db = env.authenticatedContext('enrollment').firestore();
  const store = new Store(false);
  Object.assign(store, { F, db, uid: 'enrollment' });
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  const profile = await store.createProfile('尼克克', '🦊', 'Asia/Taipei', {
    courseVersion: 'none',
    courseDays: 0,
    startDate: '2026-10-01',
  });
  store.profile = profile;
  const path = ns + '/accounts/enrollment/profiles/' + profile.id;
  const placeholder = (date) => ({
    date,
    words: [],
    reviewIds: [],
    reviewDone: [],
    completedActual: null,
    courseVersion: 'none',
    timeZone: 'Asia/Taipei',
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, path + '/dailyPlans/2026-10-09'), placeholder('2026-10-09'));
  await setDoc(doc(db, ns + '/meta/current'), {});
  await assert.rejects(store.activateCourse('2026-10-09'), /發布固定題庫版本/);
  await assert.rejects(store.activateCourse('2026-02-30'), /有效/);
  await assert.rejects(store.activateCourse('2999-01-01'), /有效/);
  assert.equal((await getDoc(doc(db, path))).data().courseVersion, 'none');
  const sample = JSON.parse(fs.readFileSync(new URL('../examples/demo.json', import.meta.url)))[0];
  const words = Array.from({ length: 15 }, (_, i) => ({
    ...sample,
    id: 'level2-' + String(i + 1).padStart(4, '0'),
    sequence: i + 1,
  }));
  await setDoc(doc(db, ns + '/curricula/enrollment'), { ready: false, days: 1 });
  await setDoc(doc(db, ns + '/curricula/enrollment/days/0'), { words, index: 0 });
  await updateDoc(doc(db, ns + '/curricula/enrollment'), { ready: true });
  await setDoc(doc(db, ns + '/meta/current'), { version: 'enrollment', days: 1 });
  const second = new Store(false);
  Object.assign(second, { F, db, uid: 'enrollment', profile: { ...profile } });
  const results = await Promise.allSettled([
    store.activateCourse('2026-10-09'),
    second.activateCourse('2026-10-09'),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  store.profile = (await getDoc(doc(db, path))).data();
  assert.equal(store.profile.name, '尼克克');
  assert.equal(store.profile.startDate, '2026-10-09');
  assert.equal(store.profile.id, profile.id);
  const plan = await store.ensurePlan('2026-10-09');
  assert.equal(plan.words.length, 15);
  assert.equal(plan.words[0].id, 'level2-0001');
  assert.equal(plan.completedActual, null);
  await assert.rejects(store.activateCourse('2026-10-09'), /已啟用/);
  await assertFails(
    updateDoc(doc(db, path), { startDate: '2026-10-08', updatedAt: serverTimestamp() }),
  );
  await assertFails(
    updateDoc(doc(db, path + '/dailyPlans/2026-10-09'), {
      words: [],
      updatedAt: serverTimestamp(),
    }),
  );
  const stranger = env.authenticatedContext('enrollment-stranger').firestore();
  await assertFails(
    updateDoc(doc(stranger, path), { startDate: '2026-10-08', updatedAt: serverTimestamp() }),
  );
});
