import { APP_NAMESPACE } from './config.js';
import { dateKey, dayDiff, advance, planStatus, validateBackup } from './core.js';
import { connect } from './firebase.js';
import { outbox } from './outbox.js';
const root = `apps/${APP_NAMESPACE}`;
const safeId = (s) => /^[\w-]{1,160}$/.test(s);
export class Store {
  constructor(demo = false) {
    this.demo = demo;
    this.unsubs = [];
    this.state = { plans: {}, progress: {}, events: {} };
    this.status = () => {};
    this.change = () => {};
    this.pending = [];
    this.busy = false;
    this.historyCache = new Map();
  }
  async init() {
    if (this.demo) {
      this.uid = 'demo';
      this.data = JSON.parse(
        localStorage.getItem('english-demo-v1') || '{"profiles":{},"records":{}}',
      );
      this.demoWords = await (await fetch('./examples/demo.json')).json();
      this.cache = '示範僅保存於本機';
    } else {
      Object.assign(this, await connect());
      this.uid = this.auth.currentUser.uid;
    }
    this.pending = await outbox.list(this.uid);
    globalThis.addEventListener('online', () => this.flush());
    globalThis.addEventListener('offline', () => this.status('離線 · 已快取題目可繼續'));
    globalThis.addEventListener('storage', (e) => {
      if (this.demo && e.key === 'english-demo-v1') {
        this.data = JSON.parse(e.newValue);
        if (this.profile) this.select(this.profile.id);
      }
      if (e.key === 'english-sync-signal') this.flush();
    });
    return this;
  }
  ref(...p) {
    return this.F.doc(this.db, root, ...p);
  }
  col(...p) {
    return this.F.collection(this.db, root, ...p);
  }
  profilePath(id = this.profile.id) {
    return ['accounts', this.uid, 'profiles', id];
  }
  persist() {
    localStorage.setItem('english-demo-v1', JSON.stringify(this.data));
  }
  async listProfiles() {
    if (this.demo) return Object.values(this.data.profiles);
    return (await this.F.getDocs(this.col('accounts', this.uid, 'profiles'))).docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => p.status !== 'restoring');
  }
  async createProfile(name, emoji, timeZone = 'Asia/Taipei', extra = {}) {
    name = name.trim();
    if (!name || name.length > 24) throw Error('請輸入 1～24 字的名稱');
    new Intl.DateTimeFormat('en', { timeZone });
    const id = crypto.randomUUID();
    let version = 'demo',
      courseDays = 1;
    if (!this.demo) {
      const current = await this.F.getDocFromServer(this.ref('meta', 'current'));
      version = current.exists() ? current.data().version : 'none';
      courseDays = current.data()?.days || 0;
    }
    const profile = {
      id,
      name,
      emoji,
      timeZone,
      startDate: dateKey(new Date(), timeZone),
      courseVersion: version,
      courseDays,
      status: 'ready',
      ...extra,
    };
    if (this.demo) {
      if (
        Object.values(this.data.profiles).some(
          (p) => p.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
        )
      )
        throw Error('這個名稱已存在');
      this.data.profiles[id] = profile;
      this.data.records[id] = { plans: {}, progress: {}, events: {} };
      this.persist();
    } else
      await this.F.runTransaction(this.db, async (tx) => {
        const ref = this.ref('accounts', this.uid);
        const a = await tx.get(ref);
        const names = a.data()?.names || {};
        const key = encodeURIComponent(name.toLocaleLowerCase()).replaceAll('.', '%2E');
        if (names[key]) throw Error('這個名稱已存在');
        if (Object.keys(names).length >= 50) throw Error('此裝置最多 50 位學習者');
        tx.set(ref, { names: { ...names, [key]: id }, updatedAt: this.F.serverTimestamp() });
        tx.set(this.ref(...this.profilePath(id)), {
          ...profile,
          createdAt: this.F.serverTimestamp(),
          updatedAt: this.F.serverTimestamp(),
        });
      });
    return profile;
  }
  async select(id) {
    this.unsubs.forEach((f) => f());
    this.unsubs = [];
    const token = (this.selection = crypto.randomUUID());
    const selected = (await this.listProfiles()).find((p) => p.id === id);
    if (token !== this.selection) return;
    this.profile = selected;
    if (!this.profile) throw Error('找不到學習者');
    this.state = { plans: {}, progress: {}, events: {} };
    if (this.demo) {
      this.state = structuredClone(this.data.records[id]);
      this.change();
      this.status('示範模式 · 僅本機儲存');
      return;
    }
    const initial = [];
    for (const [collection, key] of [
      ['dailyPlans', 'plans'],
      ['progress', 'progress'],
      ['reviewEvents', 'events'],
    ]) {
      // Events are fetched only for export/history, not kept under a permanent listener.
      if (key === 'events') continue;
      initial.push(
        new Promise((resolve, reject) => {
          const unsub = this.F.onSnapshot(
            this.col(...this.profilePath(id), collection),
            { includeMetadataChanges: true },
            (snapshot) => {
              if (token !== this.selection) {
                resolve();
                return;
              }
              this.state[key] = Object.fromEntries(snapshot.docs.map((d) => [d.id, d.data()]));
              this.status(
                !navigator.onLine
                  ? '離線 · 已快取資料'
                  : snapshot.metadata.hasPendingWrites
                    ? '等待同步'
                    : snapshot.metadata.fromCache
                      ? '裝置快取 · 正在確認連線'
                      : '已讀取雲端資料',
              );
              this.change();
              resolve();
            },
            (e) => {
              this.status('同步失敗：' + e.message);
              reject(e);
            },
          );
          this.unsubs.push(unsub);
        }),
      );
    }
    await Promise.all(initial);
    await this.flush();
  }
  leave() {
    this.selection = null;
    this.unsubs.forEach((f) => f());
    this.unsubs = [];
    this.profile = null;
  }
  async courseDay(date) {
    const n = dayDiff(this.profile.startDate, date);
    if (n < 0) return [];
    if (this.demo) return n === 0 ? this.demoWords : [];
    if (this.profile.courseVersion === 'none') return [];
    const d = await this.F.getDoc(
      this.ref('curricula', this.profile.courseVersion, 'days', String(n)),
    );
    return d.data()?.words || [];
  }
  async activateCourse(startDate) {
    const profile = { ...this.profile };
    const today = dateKey(new Date(), profile.timeZone);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      !Number.isFinite(Date.parse(startDate)) ||
      new Date(startDate).toISOString().slice(0, 10) !== startDate ||
      startDate > today
    )
      throw Error('請選擇有效的起始日期，最晚為今天');
    if (profile.courseVersion !== 'none') throw Error('這位學習者已啟用課程，不能重新設定');
    if (
      this.pending.some((e) => e.profileId === profile.id) ||
      Object.values(this.state.progress).some((p) => p.firstCompletedAt || p.lastFormalDate)
    )
      throw Error('已有學習紀錄或待同步答案，請先備份並確認課程');
    const F = this.F;
    const activated = await F.runTransaction(this.db, async (tx) => {
      const profileRef = this.ref(...this.profilePath(profile.id));
      const fresh = await tx.get(profileRef);
      if (fresh.data()?.courseVersion !== 'none') throw Error('課程已在其他分頁啟用，請重新整理');
      const current = await tx.get(this.ref('meta', 'current'));
      const version = current.data()?.version;
      if (!version) throw Error('單字已匯入後，還需要先在單字管理系統點「發布固定題庫版本」');
      const course = await tx.get(this.ref('curricula', version));
      const first = await tx.get(this.ref('curricula', version, 'days', '0'));
      if (!course.data()?.ready || !first.data()?.words?.length)
        throw Error('課程尚未發布完成，請稍後再試');
      const planRef = this.ref(...this.profilePath(profile.id), 'dailyPlans', startDate);
      const old = await tx.get(planRef);
      if (
        old.exists() &&
        (old.data().courseVersion !== 'none' ||
          old.data().words.length ||
          old.data().reviewIds.length ||
          old.data().reviewDone.length ||
          old.data().completedActual)
      )
        throw Error('起始日已有任務或紀錄，無法覆寫');
      const next = {
        ...fresh.data(),
        startDate,
        courseVersion: version,
        courseDays: course.data().days,
      };
      tx.update(profileRef, {
        startDate,
        courseVersion: version,
        courseDays: next.courseDays,
        updatedAt: F.serverTimestamp(),
      });
      tx.set(planRef, {
        date: startDate,
        words: first.data().words,
        reviewIds: [],
        reviewDone: [],
        courseVersion: version,
        timeZone: next.timeZone,
        completedActual: null,
        updatedAt: F.serverTimestamp(),
      });
      return next;
    });
    if (this.profile?.id === profile.id) this.profile = activated;
    return activated;
  }
  async ensurePlan(date) {
    const profile = { ...this.profile };
    const today = dateKey(new Date(), profile.timeZone);
    if (date > today) throw Error('未來日期只能預覽');
    if (date < profile.startDate) throw Error('這天還沒有開始學習');
    if (profile.courseVersion === 'none')
      return {
        date,
        words: [],
        reviewIds: [],
        reviewDone: [],
        courseVersion: 'none',
        timeZone: profile.timeZone,
        completedActual: null,
      };
    const words = await this.courseDay(date);
    const reviewIds =
      date === today
        ? Object.values(this.state.progress)
            .filter((p) => p.nextDue && p.nextDue <= date && p.lastFormalDate !== date)
            .map((p) => p.wordId)
        : [];
    const make = (old) => {
      // Empty placeholders made before a course was published are not learning history.
      if (
        old?.courseVersion === 'none' &&
        !old.words.length &&
        !old.reviewIds.length &&
        !old.reviewDone.length &&
        !old.completedActual
      )
        old = null;
      const plan = old
        ? { ...old, reviewIds: [...new Set([...old.reviewIds, ...reviewIds])] }
        : {
            date,
            words,
            reviewIds,
            reviewDone: [],
            courseVersion: profile.courseVersion,
            timeZone: profile.timeZone,
            completedActual: null,
          };
      plan.reviewDone = [
        ...new Set([
          ...plan.reviewDone,
          ...plan.reviewIds.filter((id) => this.state.progress[id]?.lastFormalDate >= date),
        ]),
      ];
      if (plan.reviewIds.length > (old?.reviewIds.length || 0)) plan.completedActual = null;
      return plan;
    };
    if (this.demo) {
      const plan = make(this.data.records[profile.id].plans[date]);
      this.data.records[profile.id].plans[date] = plan;
      this.persist();
      this.state.plans[date] = plan;
      return plan;
    }
    const ref = this.ref(...this.profilePath(profile.id), 'dailyPlans', date);
    if (!navigator.onLine) {
      const cached = await this.F.getDocFromCache(ref);
      if (!cached.exists()) throw Error('這天的任務尚未快取，需要連線');
      return cached.data();
    }
    return this.F.runTransaction(this.db, async (tx) => {
      const snap = await tx.get(ref);
      const plan = make(snap.data());
      if (plan.reviewIds.length > (snap.data()?.reviewIds.length || 0)) plan.completedActual = null;
      tx.set(ref, { ...plan, updatedAt: this.F.serverTimestamp() });
      return plan;
    });
  }
  async words(level = 1) {
    if (this.demo) return this.demoWords.filter((w) => w.level === level);
    const q = this.F.query(
      this.col('words'),
      this.F.where('level', '==', level),
      this.F.limit(250),
    );
    let cursor = null,
      result = [];
    do {
      const page = await this.F.getDocs(cursor ? this.F.query(q, this.F.startAfter(cursor)) : q);
      result.push(...page.docs.map((d) => d.data()));
      cursor = page.size === 250 ? page.docs.at(-1) : null;
    } while (cursor);
    return result.sort((a, b) => a.sequence - b.sequence);
  }
  async queue(event) {
    const e = {
      ...event,
      id: event.id || crypto.randomUUID(),
      profileId: this.profile.id,
      timeZone: this.profile.timeZone,
      occurredAt: new Date().toISOString(),
    };
    await outbox.put(this.uid, e);
    localStorage.setItem('english-sync-signal', crypto.randomUUID());
    this.status('等待同步 · 答案已保存在裝置');
    await this.flush();
  }
  async flush() {
    if (this.busy) return;
    this.busy = true;
    try {
      const pending = await outbox.list(this.uid);
      if (!pending.length) return;
      for (const event of pending) {
        if (!this.demo && !navigator.onLine) break;
        await this.commit(event);
        await outbox.remove(this.uid, event.id);
      }
      this.pending = await outbox.list(this.uid);
      this.status(
        this.pending.length
          ? `等待同步 · ${this.pending.length} 筆答案`
          : this.demo
            ? '示範模式 · 已儲存至本機'
            : '已儲存至雲端',
      );
    } catch (e) {
      this.status('同步失敗 · 答案保留待重試：' + e.message);
    } finally {
      this.busy = false;
      this.change();
    }
  }
  reduce(event, old, plan) {
    if (!plan) throw Error('原訂任務不存在');
    if (event.actualDate < event.planDate) throw Error('不能提前完成任務');
    if (event.kind === 'new' && !plan.words.some((w) => w.id === event.wordId))
      throw Error('單字不在原訂任務');
    if (event.kind === 'review' && !plan.reviewIds.includes(event.wordId))
      throw Error('單字不在複習清單');
    if (event.correct === false && event.rating === 'remember') throw Error('答錯不能標記記得');
    const p = event.kind === 'new' && old?.firstCompletedAt ? old : advance(old, event);
    if (event.kind === 'review') plan.reviewDone = [...new Set([...plan.reviewDone, event.wordId])];
    return { p, plan };
  }
  async commit(event) {
    if (!safeId(event.profileId) || !safeId(event.id)) throw Error('事件 ID 錯誤');
    if (this.demo) {
      this.data = JSON.parse(localStorage.getItem('english-demo-v1'));
      const r = this.data.records[event.profileId];
      if (r.events[event.id]) return;
      const { p, plan } = this.reduce(event, r.progress[event.wordId], r.plans[event.planDate]);
      p.snapshot = event.snapshot;
      r.progress[event.wordId] = p;
      if (planStatus(plan, r.progress).complete && !plan.completedActual)
        plan.completedActual = event.actualDate;
      r.plans[event.planDate] = plan;
      r.events[event.id] = event;
      this.persist();
      if (this.profile?.id === event.profileId) this.state = structuredClone(r);
      return;
    }
    const path = this.profilePath(event.profileId),
      er = this.ref(...path, 'reviewEvents', event.id),
      pr = this.ref(...path, 'progress', event.wordId),
      dr = this.ref(...path, 'dailyPlans', event.planDate);
    await this.F.runTransaction(this.db, async (tx) => {
      const [es, ps, ds] = await Promise.all([tx.get(er), tx.get(pr), tx.get(dr)]);
      if (es.exists()) return;
      const plan = ds.data();
      const others = await Promise.all(
        (plan?.words || [])
          .filter((w) => w.id !== event.wordId)
          .map((w) => tx.get(this.ref(...path, 'progress', w.id))),
      );
      const { p } = this.reduce(event, ps.data(), plan);
      p.snapshot = event.snapshot;
      const progress = Object.fromEntries(
        others.filter((s) => s.exists()).map((s) => [s.id, s.data()]),
      );
      progress[event.wordId] = p;
      if (planStatus(plan, progress).complete && !plan.completedActual)
        plan.completedActual = event.actualDate;
      tx.set(pr, { ...p, updatedAt: this.F.serverTimestamp() });
      tx.set(dr, { ...plan, updatedAt: this.F.serverTimestamp() });
      tx.set(er, { ...event, createdAt: this.F.serverTimestamp() });
    });
  }
  async favorite(word) {
    const pid = this.profile.id;
    const old = this.state.progress[word.id];
    if (this.demo) {
      const r = this.data.records[pid];
      r.progress[word.id] = {
        stage: 0,
        ...old,
        wordId: word.id,
        favorite: !old?.favorite,
        snapshot: word,
      };
      this.persist();
      this.state = structuredClone(r);
      this.change();
    } else {
      const ref = this.ref(...this.profilePath(pid), 'progress', word.id);
      await this.F.runTransaction(this.db, async (tx) => {
        const d = (await tx.get(ref)).data();
        tx.set(ref, {
          stage: 0,
          ...d,
          wordId: word.id,
          favorite: !d?.favorite,
          snapshot: word,
          updatedAt: this.F.serverTimestamp(),
        });
      });
    }
  }
  async history() {
    if (this.demo) return Object.values(this.state.events);
    const pid = this.profile.id;
    let cache = this.historyCache.get(pid);
    if (!cache) {
      cache = { events: new Map(), cursor: null };
      this.historyCache.set(pid, cache);
    }
    if (cache.loading) return cache.loading;
    cache.loading = (async () => {
      let page;
      do {
        const base = this.F.query(
          this.col(...this.profilePath(pid), 'reviewEvents'),
          this.F.orderBy('createdAt'),
          this.F.limit(500),
        );
        page = await this.F.getDocs(
          cache.cursor ? this.F.query(base, this.F.startAfter(cache.cursor)) : base,
        );
        for (const d of page.docs) cache.events.set(d.id, d.data());
        if (page.docs.length) cache.cursor = page.docs.at(-1);
      } while (page.size === 500);
      return [...cache.events.values()];
    })();
    try {
      return await cache.loading;
    } finally {
      cache.loading = null;
    }
  }
  async backup() {
    await this.flush();
    if ((await outbox.list(this.uid)).length) throw Error('請先完成待同步答案，再匯出完整備份');
    return {
      schema: 1,
      exportedAt: new Date().toISOString(),
      namespace: APP_NAMESPACE,
      profile: this.profile,
      plans: Object.values(this.state.plans),
      progress: Object.values(this.state.progress),
      events: await this.history(),
    };
  }
  async restore(input) {
    const b = validateBackup(input);
    const name = prompt('備份驗證通過。請為還原的新學習者命名', b.profile.name + '（還原）');
    if (!name) return;
    if (!this.demo && b.profile.courseVersion !== 'none') {
      const c = await this.F.getDocFromServer(this.ref('curricula', b.profile.courseVersion));
      if (!c.exists() || !c.data().ready) throw Error('找不到備份所用題庫版本；請先匯入原版本');
    }
    const p = await this.createProfile(name, b.profile.emoji, b.profile.timeZone, {
      startDate: b.profile.startDate,
      courseVersion: b.profile.courseVersion,
      courseDays: b.profile.courseDays || 0,
      status: 'restoring',
    });
    if (this.demo) {
      this.data.records[p.id] = {
        plans: Object.fromEntries(b.plans.map((x) => [x.date, x])),
        progress: Object.fromEntries(b.progress.map((x) => [x.wordId, x])),
        events: Object.fromEntries(b.events.map((x) => [x.id, x])),
      };
      this.data.profiles[p.id].status = 'ready';
      this.persist();
      return;
    }
    for (const [key, rows, idKey] of [
      ['dailyPlans', b.plans, 'date'],
      ['progress', b.progress, 'wordId'],
      ['reviewEvents', b.events, 'id'],
    ])
      for (let i = 0; i < rows.length; i += 200) {
        const batch = this.F.writeBatch(this.db);
        for (const row of rows.slice(i, i + 200)) {
          const copy = { ...row };
          delete copy.createdAt;
          delete copy.updatedAt;
          if (key === 'reviewEvents') copy.profileId = p.id;
          batch.set(this.ref(...this.profilePath(p.id), key, row[idKey]), {
            ...copy,
            createdAt: this.F.serverTimestamp(),
            updatedAt: this.F.serverTimestamp(),
          });
        }
        await batch.commit();
      }
    await this.F.updateDoc(this.ref(...this.profilePath(p.id)), {
      status: 'ready',
      updatedAt: this.F.serverTimestamp(),
    });
  }
}
