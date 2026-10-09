export const ALGORITHM = 'cumulative-1-2-4-7-15-30-v1';
export const INTERVALS = [1, 2, 4, 7, 15, 30];
export const dateKey = (date = new Date(), timeZone = 'Asia/Taipei') => {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return ['year', 'month', 'day'].map((t) => p.find((x) => x.type === t).value).join('-');
};
export function validDate(s) {
  return (
    typeof s === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s
  );
}
export const addDays = (s, n) => {
  if (!validDate(s)) throw Error('日期格式不正確');
  const d = new Date(s + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const dayDiff = (a, b) =>
  Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
export const normalizeAnswer = (s) => String(s).trim().toLocaleLowerCase('en-US');
export const correctAnswer = (s, w) =>
  [w.word, ...(w.acceptedAnswers || [])].map(normalizeAnswer).includes(normalizeAnswer(s));
export function chunks(words) {
  const s = words
    .filter((w) => w.active && w.level >= 2 && w.level <= 6)
    .sort((a, b) => a.level - b.level || a.sequence - b.sequence);
  return Array.from({ length: Math.ceil(s.length / 15) }, (_, i) => s.slice(i * 15, i * 15 + 15));
}
export function advance(old, event) {
  if (!validDate(event.actualDate) || !['remember', 'hard', 'forget'].includes(event.rating))
    throw Error('作答事件格式錯誤');
  if (event.level === 1) throw Error('Level 1 僅供查閱');
  const p = { favorite: false, correct: 0, incorrect: 0, stage: 0, revision: 0, ...old };
  // One formal response per word and local date, even when separate tabs create distinct IDs.
  if (p.lastFormalDate && p.lastFormalDate >= event.actualDate) return { ...p };
  if (p.firstCompletedAt && (!p.nextDue || p.nextDue > event.actualDate)) return { ...p };
  p.correct += event.correct === false ? 0 : 1;
  p.incorrect += event.correct === false ? 1 : 0;
  p.lastPracticeAt = event.occurredAt;
  p.lastFormalDate = event.actualDate;
  p.rating = event.rating;
  p.wordId = event.wordId;
  p.algorithm = ALGORITHM;
  p.revision++;
  p.timeZone = event.timeZone;
  if (!p.firstCompletedAt) {
    p.firstCompletedAt = event.occurredAt;
    p.baseDate = event.actualDate;
    p.stage = 0;
    p.nextDue = addDays(event.actualDate, 1);
  } else if (event.rating === 'forget') {
    p.baseDate = event.actualDate;
    p.stage = 0;
    p.nextDue = addDays(event.actualDate, 1);
  } else if (event.rating === 'hard') {
    p.nextDue = addDays(event.actualDate, 1);
  } else {
    p.stage++;
    p.nextDue =
      p.stage >= 6
        ? null
        : [addDays(p.baseDate, INTERVALS[p.stage]), addDays(event.actualDate, 1)].sort().at(-1);
  }
  return p;
}
export function planStatus(plan, progress) {
  if (!plan) return { total: 0, done: 0, complete: false, newDone: 0, reviewDone: 0 };
  const nd = (plan.words || []).filter((w) => progress[w.id]?.firstCompletedAt).length;
  const rd = (plan.reviewIds || []).filter((id) => plan.reviewDone?.includes(id)).length;
  const total = (plan.words || []).length + (plan.reviewIds || []).length;
  return {
    newDone: nd,
    reviewDone: rd,
    total,
    done: nd + rd,
    complete: total > 0 && nd + rd === total,
  };
}
export function streak(plans, today) {
  let n = 0;
  const days = Object.values(plans)
    .filter((p) => p.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const p of days) {
    if (!(p.words.length + p.reviewIds.length)) continue;
    if (p.completedActual === p.date) {
      n++;
      continue;
    }
    if (p.date === today) continue;
    break;
  }
  return n;
}
export function timelineStreak(plans, events, startDate, today, courseDays) {
  const byDay = new Map();
  for (const event of events) {
    if (event.ignored) continue;
    const day = event.actualDate;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(event);
  }
  const progress = {};
  let count = 0;
  const span = dayDiff(startDate, today);
  if (span < 0 || span > 36500) return 0;
  for (let i = 0; i <= span; i++) {
    const day = addDays(startDate, i),
      due = Object.values(progress)
        .filter((p) => p.nextDue && p.nextDue <= day)
        .map((p) => p.wordId);
    const hasNew = i < courseDays,
      hasTask = hasNew || due.length > 0;
    for (const event of (byDay.get(day) || []).sort((a, b) =>
      a.occurredAt.localeCompare(b.occurredAt),
    )) {
      if (event.kind === 'new' && progress[event.wordId]?.firstCompletedAt) continue;
      progress[event.wordId] = advance(progress[event.wordId], event);
    }
    const newDone =
      !hasNew ||
      Boolean(
        plans[day]?.words.length && plans[day].words.every((w) => progress[w.id]?.firstCompletedAt),
      );
    const reviewDone = due.every((id) => progress[id]?.lastFormalDate === day);
    if (hasTask) {
      if (newDone && reviewDone) count++;
      else if (day < today) count = 0;
    }
  }
  return count;
}
export const wordId = (level, sequence) => `level${level}-${String(sequence).padStart(4, '0')}`;
export function validateWord(raw) {
  const errors = [];
  const w = { ...raw };
  w.level = Number(w.level);
  w.sequence = Number(w.sequence);
  if (!Number.isInteger(w.level) || w.level < 1 || w.level > 6)
    errors.push(['level', '等級須為 1～6']);
  if (!Number.isInteger(w.sequence) || w.sequence < 1 || w.sequence > 999999)
    errors.push(['sequence', '序號須為 1～999999 的整數']);
  for (const f of ['word', 'partOfSpeech', 'meaningZh', 'exampleEn', 'exampleZh']) {
    w[f] = String(w[f] ?? '').trim();
    if (!w[f]) errors.push([f, '必填']);
    if (w[f].length > 2000) errors.push([f, '文字超過 2,000 字']);
  }
  w.phrases = w.phrases ?? [];
  if (!Array.isArray(w.phrases) || w.phrases.length > 3)
    errors.push(['phrases', '須為最多三筆陣列']);
  else
    for (const p of w.phrases) {
      if (
        !p ||
        !['phrase', 'collocation', 'pattern'].includes(p.type) ||
        ['text', 'meaningZh', 'exampleEn', 'exampleZh'].some(
          (k) => typeof p[k] !== 'string' || !p[k].trim() || p[k].length > 2000,
        )
      )
        errors.push(['phrases', '搭配類型與四個文字欄位皆必填']);
    }
  if (
    w.acceptedAnswers &&
    (!Array.isArray(w.acceptedAnswers) || w.acceptedAnswers.some((a) => typeof a !== 'string'))
  )
    errors.push(['acceptedAnswers', '須為文字陣列']);
  w.id = wordId(w.level, w.sequence);
  w.active = raw.active !== false;
  w.source = String(raw.source || 'import');
  w.reviewStatus = raw.reviewStatus === 'approved' ? 'approved' : 'pending';
  w.contentVersion = Number.isInteger(raw.contentVersion) ? raw.contentVersion : 1;
  if (
    JSON.stringify(w).length > 25000 ||
    new TextEncoder().encode(JSON.stringify(w)).length > 45000
  )
    errors.push(['row', '單筆資料超過大小限制']);
  return { word: w, errors };
}
export function validateRows(rows) {
  const seen = new Set();
  return rows.map((r, i) => {
    const v = validateWord(r);
    if (seen.has(v.word.id)) v.errors.push(['sequence', '同一匯入中等級＋序號重複']);
    seen.add(v.word.id);
    return { ...v, sheet: r._sheet || 'JSON', row: r._row || i + 1 };
  });
}
export const csvCell = (v) => {
  const s = String(v ?? '');
  return '"' + (/^[\s]*[=+@\-]|^[\t\r]/.test(s) ? "'" : '') + s.replaceAll('"', '""') + '"';
};
export function validateBackup(b) {
  if (
    !b ||
    b.schema !== 1 ||
    !b.profile ||
    !Array.isArray(b.plans) ||
    !Array.isArray(b.progress) ||
    !Array.isArray(b.events)
  )
    throw Error('不是版本 1 的學習備份');
  if (
    typeof b.profile.name !== 'string' ||
    !b.profile.name.trim() ||
    b.profile.name.length > 24 ||
    typeof b.profile.emoji !== 'string' ||
    b.profile.emoji.length > 16 ||
    !validDate(b.profile.startDate) ||
    !/^[\w-]{1,100}$/.test(b.profile.courseVersion)
  )
    throw Error('學習者設定不正確');
  new Intl.DateTimeFormat('en', { timeZone: b.profile.timeZone });
  if (b.plans.length > 5000 || b.progress.length > 15000 || b.events.length > 100000)
    throw Error('備份超過上限');
  for (const p of b.plans)
    if (
      !validDate(p.date) ||
      !Array.isArray(p.words) ||
      p.words.length > 15 ||
      p.words.some((w) => validateWord(w).errors.length || w.level === 1) ||
      !Array.isArray(p.reviewIds) ||
      !Array.isArray(p.reviewDone) ||
      p.reviewIds.some((id) => !/^level[2-6]-\d+$/.test(id))
    )
      throw Error('每日計畫格式不正確');
  for (const p of b.progress)
    if (
      !/^level[1-6]-\d+$/.test(p.wordId) ||
      !Number.isInteger(p.stage) ||
      p.stage < 0 ||
      p.stage > 6 ||
      (p.nextDue !== null && p.nextDue !== undefined && !validDate(p.nextDue))
    )
      throw Error('單字進度格式不正確');
  for (const e of b.events)
    if (
      !/^[\w-]{1,160}$/.test(e.id) ||
      !validDate(e.actualDate) ||
      !validDate(e.planDate) ||
      e.actualDate < e.planDate ||
      !/^level[2-6]-\d+$/.test(e.wordId) ||
      !['new', 'review'].includes(e.kind) ||
      !['remember', 'hard', 'forget'].includes(e.rating) ||
      !e.snapshot ||
      validateWord(e.snapshot).errors.length
    )
      throw Error('答題紀錄格式不正確');
  return b;
}
