import { Store } from './store.js';
import { sentenceParts } from './quick-core.js';
import { quickQuiz } from './quick-quiz.js';
import { dateKey, addDays, dayDiff, planStatus, streak, timelineStreak } from './core.js';
import { $, el, button, notice, attempt, download, field } from './ui.js';
import { speech } from './speech.js';
import { outbox } from './outbox.js';
const demo = new URLSearchParams(location.search).has('demo');
const store = new Store(demo);
let view = 'home',
  month = new Date(),
  root,
  content,
  profiles = [],
  session = null,
  generation = 0,
  historyKey = '',
  historyReady = false;
const today = () => dateKey(new Date(), store.profile?.timeZone || 'Asia/Taipei');
const go = attempt(async (name) => {
  generation++;
  speech.stop();
  session = null;
  view = name;
  await render();
});
function empty(title, text) {
  return el(
    'div',
    { class: 'panel empty' },
    el('div', { class: 'icon' }, '🌱'),
    el('h2', {}, title),
    el('p', {}, text),
  );
}
function saveStatus(text) {
  const s = $('#sync');
  if (s) s.textContent = text;
}
store.status = saveStatus;
store.change = () => {
  if (store.profile && view === 'home') renderHome();
};
function stop() {
  generation++;
  speech.stop();
  session = null;
}
async function choose(id) {
  stop();
  historyKey = '';
  historyReady = false;
  const token = generation;
  await store.select(id);
  if (token !== generation) return;
  try {
    await store.ensurePlan(today());
  } catch (e) {
    notice(e.message);
  }
  speech.profile = store.uid + ':' + id;
  localStorage.setItem('english-last:' + store.uid, id);
  month = new Date(today() + 'T12:00:00');
  view = 'home';
  await render();
}
async function welcome() {
  stop();
  store.leave();
  profiles = await store.listProfiles();
  const name = el('input', {
    maxlength: 24,
    placeholder: '你的名字',
    required: true,
    autocomplete: 'nickname',
  });
  let avatar = '🐱';
  const av = el('div', { class: 'avatars' });
  for (const a of ['🐱', '🐼', '🦊', '🐯', '🐰', '🐻']) {
    const b = button(a, () => {
      avatar = a;
      av.querySelectorAll('button').forEach((x) => x.classList.toggle('selected', x === b));
    });
    b.setAttribute('aria-label', a + ' 頭像');
    b.classList.toggle('selected', a === avatar);
    av.append(b);
  }
  const form = el(
    'form',
    {
      onSubmit: attempt(async (e) => {
        e.preventDefault();
        const p = await store.createProfile(name.value, avatar);
        await choose(p.id);
      }),
    },
    field('學習者名稱', name),
    field('選一位學習夥伴', av),
    el('button', { class: 'primary', type: 'submit' }, '建立我的學習空間 →'),
  );
  const list = el(
    'div',
    { class: 'profiles' },
    profiles.map((p) =>
      button(
        p.emoji + ' ' + p.name,
        attempt(() => choose(p.id)),
      ),
    ),
  );
  $('#app').replaceChildren(
    el(
      'main',
      { class: 'welcome' },
      el('p', { class: 'eyebrow' }, 'YOUR WORDS, YOUR WORLD'),
      el('h1', {}, '🌈 英文單字學習樂園'),
      el('p', { class: 'muted' }, '每天一點點，讓英文慢慢成為你的朋友。'),
      demo
        ? el(
            'p',
            { class: 'demo-banner' },
            '隔離示範模式 · 六筆範例指定為 Level 2 · 不連接正式資料庫',
          )
        : null,
      profiles.length ? el('section', { class: 'panel' }, el('h2', {}, '歡迎回來'), list) : null,
      el('section', { class: 'panel' }, el('h2', {}, '從你的名字開始 🌱'), form),
      el(
        'p',
        { class: 'mini-note' },
        '這是共用裝置的學習者切換。名稱不是密碼，也不會自動連接其他裝置的紀錄。',
      ),
      el(
        'a',
        { href: demo ? './index.html' : './index.html?demo' },
        demo ? '進入 Firebase 正式模式' : '先體驗六筆示範資料',
      ),
    ),
  );
}
async function render() {
  if (!store.profile) return welcome();
  profiles = await store.listProfiles();
  const p = store.profile;
  const items = [
    ['home', '🗓️', '首頁日曆'],
    ['learn', '📘', '今日學習'],
    ['review', '🍊', '到期複習'],
    ['words', '🔎', '單字總覽'],
    ['favorites', '💜', '我的收藏'],
    ['history', '📊', '學習紀錄'],
    ['settings', '⚙️', '設定'],
  ];
  const nav = el(
    'nav',
    { class: 'nav', 'aria-label': '主要導覽' },
    items.map(([id, icon, label]) =>
      button(icon + ' ' + label, () => go(id), view === id ? 'active' : ''),
    ),
  );
  root = el('main', { class: 'main' });
  content = el('div', { id: 'content' });
  root.append(
    el(
      'header',
      { class: 'topbar' },
      el(
        'div',
        { class: 'profiles' },
        profiles.map((x) =>
          button(
            x.emoji + ' ' + x.name,
            attempt(() => choose(x.id)),
            x.id === p.id ? 'primary' : '',
          ),
        ),
        button('＋', attempt(welcome)),
      ),
      el(
        'span',
        { class: 'status', id: 'sync', role: 'status' },
        demo ? '示範模式 · 僅本機儲存' : navigator.onLine ? '已連接 · ' + store.cache : '離線',
      ),
    ),
  );
  root.append(content);
  $('#app').replaceChildren(
    demo
      ? el(
          'div',
          { class: 'demo-banner' },
          '示範模式｜六筆示範指定為 Level 2，僅保存於這個瀏覽器。',
        )
      : document.createTextNode(''),
    el(
      'div',
      { class: 'shell' },
      el(
        'aside',
        { class: 'sidebar' },
        el(
          'div',
          { class: 'brand' },
          el('span', { class: 'mark' }, '🌈'),
          '英文單字學習樂園',
          el('div', { class: 'eyebrow' }, 'GROW A LITTLE, EVERY DAY'),
        ),
        nav,
        el(
          'div',
          { class: 'side-footer' },
          el('p', {}, '慢慢來，每一步都算數。 🌱'),
          el('a', { href: './migration_tool.html' }, '單字管理系統 ↗'),
        ),
      ),
      root,
    ),
  );
  if (view === 'home') {
    try {
      const plan = await store.ensurePlan(today());
      store.state.plans[plan.date] = plan;
    } catch (e) {
      notice(e.message);
    }
    renderHome();
  } else if (view === 'learn' || view === 'review')
    await startSession(today(), view === 'review' ? 'review' : 'new');
  else if (view === 'words' || view === 'favorites') await renderWords();
  else if (view === 'history') await renderHistory();
  else renderSettings();
}
function renderHome() {
  if (!content || view !== 'home') return;
  if (store.profile.courseVersion === 'none') {
    content.replaceChildren(courseActivation());
    return;
  }
  const key =
    store.profile.id +
    ':' +
    Object.values(store.state.progress).reduce((sum, p) => sum + (p.revision || 0), 0);
  if (historyKey !== key) {
    historyKey = key;
    historyReady = false;
    const pid = store.profile.id;
    store
      .history()
      .then((events) => {
        if (store.profile?.id !== pid || historyKey !== key) return;
        store.state.events = Object.fromEntries(events.map((e) => [e.id, e]));
        historyReady = true;
        renderHome();
      })
      .catch((e) => notice('連續天數暫時無法計算：' + e.message));
  }
  const p = store.profile,
    t = today(),
    plan = store.state.plans[t],
    s = planStatus(plan, store.state.progress);
  const learned = Object.values(store.state.progress).filter(
    (x) => x.firstCompletedAt && x.snapshot?.level !== 1,
  ).length;
  const due = Object.values(store.state.progress).filter(
    (x) => x.nextDue && x.nextDue <= t && x.lastFormalDate !== t,
  ).length;
  const stat = (label, value, detail) =>
    el(
      'div',
      { class: 'stat' },
      el('small', {}, label),
      el('strong', { class: 'value' }, value),
      el('small', {}, detail),
    );
  const cal = el('section', { class: 'panel' });
  const y = month.getFullYear(),
    m = month.getMonth();
  cal.append(
    el(
      'div',
      { class: 'row between' },
      el('h2', {}, `${y} 年 ${m + 1} 月`),
      el(
        'div',
        { class: 'row' },
        button('‹', () => {
          month = new Date(y, m - 1, 1);
          renderHome();
        }),
        button('本月', () => {
          month = new Date(t + 'T12:00:00');
          renderHome();
        }),
        button('›', () => {
          month = new Date(y, m + 1, 1);
          renderHome();
        }),
      ),
    ),
  );
  const grid = el(
    'div',
    { class: 'calendar' },
    ['一', '二', '三', '四', '五', '六', '日'].map((x) => el('div', { class: 'weekday' }, x)),
  );
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  for (let i = 0; i < offset; i++) grid.append(el('span'));
  for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) {
    const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      ps = planStatus(store.state.plans[key], store.state.progress);
    let label =
      key > t
        ? '預估'
        : key < p.startDate
          ? '未開始'
          : ps.complete
            ? '✓ 完成'
            : ps.done
              ? '◐ 進行中'
              : key < t && (!store.state.plans[key] || ps.total > 0)
                ? '待處理'
                : store.state.plans[key] && ps.total === 0
                  ? '休息日'
                  : key === t
                    ? '今天'
                    : '未開始';
    const b = button(
      '',
      attempt(() => openDate(key)),
      `day ${key === t ? 'today' : ''} ${key > t ? 'future' : ''} ${ps.complete ? 'completed' : ps.done ? 'partial' : ''}`,
    );
    b.append(el('span', {}, d), el('small', {}, label));
    b.setAttribute('aria-label', key + ' ' + label);
    grid.append(b);
  }
  cal.append(
    grid,
    el(
      'div',
      { class: 'legend' },
      el('span', {}, '✓ 完成'),
      el('span', {}, '◐ 部分完成'),
      el('span', {}, '待處理 · 可以補學'),
      el('span', {}, '未來 · 僅預覽'),
    ),
  );
  const aside = el(
    'aside',
    {},
    el(
      'section',
      { class: 'panel' },
      el('h2', {}, '今天的小目標 ✨'),
      el(
        'div',
        { class: 'task blue' },
        el('span', { class: 'tag' }, 'NEW WORDS'),
        el('h3', {}, '📘 每日新單字'),
        el('p', {}, '依序認識新朋友，每天最多 15 個。'),
        el(
          'div',
          { class: 'progress-track' },
          el('div', {
            class: 'progress-fill',
            style: `width:${plan?.words.length ? (s.newDone / plan.words.length) * 100 : 0}%`,
          }),
        ),
        button('開始／繼續今日學習 →', () => go('learn'), 'primary'),
      ),
      el(
        'div',
        { class: 'task orange' },
        el('h3', {}, '🍊 讓記憶更牢固'),
        el('p', {}, due ? `有 ${due} 個單字等你複習。` : '目前沒有到期複習，做得很好！'),
        button('前往到期複習', () => go('review')),
      ),
      el('p', { class: 'mini-note' }, '新字與複習分開計算。Level 1 是隨時可以翻閱的小字典。'),
    ),
    el(
      'div',
      { class: 'panel soft' },
      el('h3', {}, '🌿 一點一滴，累積成長'),
      el(
        'p',
        { class: 'muted' },
        learned >= 100 ? '你已經累積超過 100 個單字！' : '你的下一個里程碑：100 個單字',
      ),
      el('small', {}, `${Math.min(learned, 100)} / 100 個`),
    ),
  );
  content.replaceChildren(
    el(
      'section',
      { class: 'hero' },
      el(
        'div',
        {},
        el('p', { class: 'eyebrow' }, t + ' · YOUR DAILY GARDEN'),
        el('h1', {}, `${p.name}，今天也一起進步吧！`),
        el('p', { class: 'muted' }, '15 個新單字，一點溫柔的複習。準備好就出發。'),
      ),
      el('div', { class: 'mascot', 'aria-hidden': 'true' }, p.emoji),
    ),
    el(
      'div',
      { class: 'stats' },
      stat(
        '📘 今日新字',
        plan ? `${s.newDone} / ${plan.words.length}` : '— / 15',
        '每日最多 15 個',
      ),
      stat('🍊 到期複習', due + ' 個', `今天已完成 ${s.reviewDone} 個`),
      stat(
        '🌱 累積學習',
        learned + ' 字',
        plan?.words.find((w) => !store.state.progress[w.id]?.firstCompletedAt)
          ? '目前 Level ' +
              plan.words.find((w) => !store.state.progress[w.id]?.firstCompletedAt).level
          : 'Level 2–6 · 複習與查閱',
      ),
      stat(
        '🔥 連續完成',
        historyReady
          ? timelineStreak(
              store.state.plans,
              Object.values(store.state.events),
              p.startDate,
              t,
              p.courseDays || 0,
            ) + ' 天'
          : '計算中',
        '以實際當日完成計算',
      ),
    ),
    el('div', { class: 'dashboard' }, cal, aside),
  );
}
async function openDate(date) {
  if (date < store.profile.startDate) {
    notice('這一天還沒有開始學習。');
    return;
  }
  if (date > today()) {
    const words = await store.courseDay(date);
    notice(`${date} 預估 ${words.length} 個新字；複習量依實際作答變動，不能提前完成。`);
    return;
  }
  stop();
  view = 'date';
  const plan = await store.ensurePlan(date);
  content.replaceChildren(
    el('h1', {}, date + ' 的學習任務'),
    el('p', { class: 'muted' }, '補學會記錄實際作答日期，不會補造過去的連續天數。'),
    el(
      'div',
      { class: 'row' },
      button(
        '學習新字 · ' + plan.words.length,
        attempt(() => startSession(date, 'new')),
        'primary',
      ),
      button(
        '原訂複習 · ' + plan.reviewIds.length,
        attempt(() => startSession(date, 'review')),
      ),
    ),
    el(
      'div',
      { class: 'panel', style: 'margin-top:20px' },
      plan.words.map((w) =>
        el(
          'p',
          {},
          `${store.state.progress[w.id]?.firstCompletedAt ? '✓' : '○'} ${w.word} · ${w.meaningZh}`,
        ),
      ),
    ),
    button('返回日曆', () => go('home')),
  );
}
async function startSession(date, kind) {
  const token = ++generation;
  if (store.profile.courseVersion === 'none') {
    await go('home');
    return;
  }
  view = 'session';
  speech.stop();
  content.replaceChildren(empty('準備今日學習', '正在讀取單字與例句…'));
  const plan = await store.ensurePlan(date);
  const pending = (await outbox.list(store.uid))
    .filter((e) => e.profileId === store.profile.id)
    .map((e) => e.wordId);
  if (token !== generation) return;
  const isPending = (w) => !store.state.progress[w.id]?.firstCompletedAt && !pending.includes(w.id);
  const reviews = plan.reviewIds
    .filter(
      (id) =>
        !plan.reviewDone.includes(id) &&
        !pending.includes(id) &&
        store.state.progress[id]?.lastFormalDate !== today(),
    )
    .map((id) => store.state.progress[id]?.snapshot)
    .filter(Boolean);
  const fresh = kind === 'new' ? plan.words.filter(isPending) : [];
  const words = [...fresh, ...reviews.filter((w) => !fresh.some((n) => n.id === w.id))];
  const reading = kind === 'new' ? plan.words : reviews;
  session = { date, kind, words, token };
  // Pool loads while the learner reads. Cached day words remain usable offline.
  const poolPromise = Promise.all(
    [...new Set(words.map((w) => w.level))].map((level) => store.words(level).catch(() => [])),
  ).then((rows) => [...reading, ...reviews, ...rows.flat().filter((w) => w.active !== false)]);
  const begin = button(
    '閱讀完成，開始四選一 →',
    attempt(async () => {
      begin.disabled = true;
      begin.textContent = '準備測驗…';
      const pool = await poolPromise;
      if (token !== generation) return;
      speech.stop();
      quickQuiz({
        container: content,
        words,
        pool,
        key: 'english-quick-v1:' + store.uid + ':' + store.profile.id + ':' + date + ':' + kind,
        exit: () => go('home'),
        save: async (w, r) => {
          if (token !== generation) throw Error('已離開測驗');
          await store.queue(
            {
              id: r.eventId,
              wordId: w.id,
              level: w.level,
              snapshot: w,
              kind: fresh.some((n) => n.id === w.id) ? 'new' : 'review',
              planDate: date,
              actualDate: today(),
              rating: r.wrong ? 'forget' : 'remember',
              correct: !r.wrong,
            },
            { background: true },
          );
        },
        finish: () => {
          if (token !== generation) return;
          content.replaceChildren(
            el(
              'section',
              { class: 'panel empty celebrate' },
              el(
                'h1',
                {},
                kind === 'review' && plan.words.some(isPending)
                  ? '到期複習完成了！ 🎉'
                  : date === today()
                    ? '今天的任務完成了！ 🎉'
                    : date + ' 的任務完成了！ 🎉',
              ),
              el('p', {}, '測驗與錯題練習已完成。答案已保存於此裝置，雲端同步狀態請看右上方。'),
              button('回到日曆', () => go('home'), 'primary'),
              button(
                '重試同步',
                attempt(() => store.flush()),
              ),
            ),
          );
        },
      });
      content.scrollIntoView({ block: 'start' });
    }),
    'primary',
  );
  if (!words.length) {
    content.replaceChildren(
      empty('這一天的作答已完成', '若仍有等待同步的答案，連線後會繼續儲存。'),
      button('回到日曆', () => go('home')),
    );
    return;
  }
  content.replaceChildren(
    el(
      'div',
      { class: 'row between' },
      el('h1', {}, date + ' · 快速學習'),
      button('暫停，稍後繼續', () => go('home')),
    ),
    el('p', { class: 'muted' }, '約 20 分鐘：先同頁閱讀，再做例句四選一。紅字標出單字用法。'),
    el('p', {}, '本次測驗：' + fresh.length + ' 個未完成新字、' + reviews.length + ' 個到期複習。'),
    el(
      'div',
      { class: 'quick-sheet' },
      reading.map((w) => wordCard(w)),
    ),
    ...(kind === 'new' && reviews.length
      ? [
          el('h2', {}, '到期複習'),
          el(
            'div',
            { class: 'quick-sheet' },
            reviews.map((w) => wordCard(w)),
          ),
        ]
      : []),
    el('div', { class: 'quick-start' }, begin),
  );
  content.scrollIntoView({ block: 'start' });
}
function wordCard(w) {
  const wrap = el('article', { class: 'word-card panel' }),
    speechState = el('p', { class: 'muted', 'aria-live': 'polite' });
  const say = (text) => {
    const b = button(
      '🔊',
      () => speech.play([text], (t) => (speechState.textContent = t)),
      'speech-button',
    );
    b.setAttribute('aria-label', '朗讀：' + text);
    return b;
  };
  const speakLine = (text, cls = 'english') =>
    el(
      'div',
      { class: 'row' },
      el(
        'span',
        { class: cls },
        sentenceParts(text, w).map((p) =>
          p.target ? el('strong', { class: 'target-word' }, p.text) : p.text,
        ),
      ),
      say(text),
    );
  const detail = el(
    'div',
    { class: 'definition' },
    el('p', { class: 'meaning' }, w.meaningZh),
    el(
      'div',
      { class: 'example' },
      speakLine(w.exampleEn),
      el('p', { class: 'muted' }, w.exampleZh),
    ),
    el('h3', {}, '搭配一起學'),
    w.phrases?.length
      ? w.phrases.map((p) =>
          el(
            'div',
            { class: 'phrase' },
            el(
              'span',
              { class: 'tag' },
              { phrase: '片語', collocation: '搭配詞', pattern: '句型' }[p.type] || p.type,
            ),
            speakLine(p.text),
            el('p', {}, p.meaningZh),
            speakLine(p.exampleEn),
            el('p', { class: 'muted' }, p.exampleZh),
            p.reviewStatus !== 'approved'
              ? el('small', {}, p.source === 'ai-assisted' ? 'AI 補充／待審核' : '待審核')
              : null,
          ),
        )
      : el('p', { class: 'muted' }, '片語待補充'),
    w.word === 'a/an'
      ? el('p', { class: 'mini-note' }, 'a / an 依後接詞的起始發音選擇，不是只看字母。')
      : null,
  );
  const all = [w.word, w.exampleEn, ...(w.phrases || []).flatMap((p) => [p.text, p.exampleEn])];
  wrap.append(
    el(
      'div',
      { class: 'row between' },
      el('span', { class: 'tag' }, `LEVEL ${w.level} · #${w.sequence}`),
      button(
        (store.state.progress[w.id]?.favorite ? '♥' : '♡') + ' 收藏',
        attempt(async (e) => {
          const b = e.currentTarget;
          await store.favorite(w);
          b.textContent = (store.state.progress[w.id]?.favorite ? '♥' : '♡') + ' 收藏';
        }),
      ),
    ),
    el('h2', { class: 'word-heading' }, w.word),
    el('div', { class: 'row' }, el('span', { class: 'muted' }, w.partOfSpeech), say(w.word)),
    el(
      'div',
      { class: 'row' },
      button('依序朗讀本卡', () => speech.play(all, (t) => (speechState.textContent = t))),
      button('停止', () => speech.stop()),
    ),
    speechState,
  );
  wrap.append(detail);
  return wrap;
}
async function renderWords() {
  const token = generation;
  content.replaceChildren(empty('翻開你的單字書', '正在讀取單字…'));
  let level = 1,
    search = '',
    pos = '',
    sort = 'sequence',
    page = 0,
    words = [];
  const body = el('div'),
    filters = el('div', { class: 'filters' });
  const searchEl = el('input', {
      class: 'search',
      placeholder: '搜尋英文、中文或片語',
      'aria-label': '搜尋',
    }),
    levelEl = el(
      'select',
      { 'aria-label': '等級' },
      [1, 2, 3, 4, 5, 6].map((n) => el('option', { value: n }, 'Level ' + n)),
    ),
    posEl = el('select', { 'aria-label': '詞性' }),
    sortEl = el(
      'select',
      { 'aria-label': '排序' },
      el('option', { value: 'sequence' }, '按序號'),
      el('option', { value: 'word' }, '按英文'),
    );
  async function load() {
    words =
      view === 'favorites'
        ? Object.values(store.state.progress)
            .filter((p) => p.favorite)
            .map((p) => p.snapshot)
            .filter(Boolean)
        : (await store.words(level)).filter((w) => w.active);
    if (token !== generation) return;
    posEl.replaceChildren(
      el('option', { value: '' }, '全部詞性'),
      [...new Set(words.map((w) => w.partOfSpeech))].map((p) => el('option', { value: p }, p)),
    );
    pos = '';
    draw();
  }
  function draw() {
    let filtered = words
      .filter(
        (w) =>
          (!pos || w.partOfSpeech === pos) &&
          JSON.stringify([w.word, w.meaningZh, w.phrases])
            .toLowerCase()
            .includes(search.toLowerCase()),
      )
      .sort((a, b) => (sort === 'word' ? a.word.localeCompare(b.word) : a.sequence - b.sequence));
    body.replaceChildren(
      el('p', { class: 'muted' }, `${filtered.length} 個單字 · Level 1 僅供查閱`),
      filtered.length
        ? el(
            'div',
            { class: 'word-list' },
            filtered
              .slice(page * 24, page * 24 + 24)
              .map((w) =>
                button(
                  '',
                  () => {
                    const dialog = el('dialog');
                    dialog.append(
                      button('關閉', () => {
                        speech.stop();
                        dialog.close();
                        dialog.remove();
                      }),
                      wordCard(w),
                    );
                    dialog.addEventListener('close', () => speech.stop());
                    document.body.append(dialog);
                    dialog.showModal();
                  },
                  'word-item',
                ),
              )
              .map((b, i) => {
                const w = filtered[page * 24 + i];
                b.append(
                  el(
                    'div',
                    {},
                    el('span', { class: 'tag' }, 'LEVEL ' + w.level),
                    el('strong', {}, w.word),
                    el('span', {}, w.meaningZh),
                  ),
                  el('span', {}, '↗'),
                );
                return b;
              }),
          )
        : empty(
            '這裡還沒有單字',
            demo
              ? '示範資料只有 Level 2 的六筆；可切換等級查看。'
              : '可請管理員匯入正式 Excel，或先收藏喜歡的字。',
          ),
      el(
        'div',
        { class: 'row', style: 'margin-top:20px' },
        button('上一頁', () => {
          page = Math.max(0, page - 1);
          draw();
        }),
        el('span', {}, `${page + 1} / ${Math.max(1, Math.ceil(filtered.length / 24))}`),
        button('下一頁', () => {
          page = Math.min(Math.max(0, Math.ceil(filtered.length / 24) - 1), page + 1);
          draw();
        }),
      ),
    );
  }
  searchEl.addEventListener('input', () => {
    search = searchEl.value;
    page = 0;
    draw();
  });
  levelEl.addEventListener(
    'change',
    attempt(async () => {
      level = Number(levelEl.value);
      page = 0;
      await load();
    }),
  );
  posEl.addEventListener('change', () => {
    pos = posEl.value;
    page = 0;
    draw();
  });
  sortEl.addEventListener('change', () => {
    sort = sortEl.value;
    draw();
  });
  filters.append(searchEl, ...(view === 'favorites' ? [] : [levelEl]), posEl, sortEl);
  content.replaceChildren(
    el('h1', {}, view === 'favorites' ? '我的收藏 💜' : '單字總覽 🔎'),
    el('p', { class: 'muted' }, '隨時查閱、聽一聽，不會改變每日任務與複習進度。'),
    filters,
    body,
  );
  await load();
}
async function renderHistory() {
  const token = generation,
    events = await store.history();
  if (token !== generation) return;
  content.replaceChildren(
    el('h1', {}, '每一步，都留下成長 📊'),
    events.length
      ? el(
          'section',
          { class: 'panel' },
          events
            .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
            .slice(0, 300)
            .map((e) =>
              el(
                'p',
                {},
                `${e.actualDate} · ${e.snapshot?.word || e.wordId} · ${{ remember: '記得', hard: '不熟', forget: '忘記' }[e.rating]} · 原訂 ${e.planDate}`,
              ),
            ),
          el('small', {}, '畫面顯示最近 300 筆；完整紀錄可從設定匯出。'),
        )
      : empty('還沒有學習紀錄', '完成第一個單字後，就會出現在這裡。'),
  );
}
function courseActivation() {
  const p = store.profile;
  const requested = new URLSearchParams(location.search).get('start');
  const date = el('input', {
    type: 'date',
    max: today(),
    value: requested || p.startDate,
    'aria-label': '第 1 天日期',
  });
  const result = el('p', { role: 'status' });
  const activate = button(
    '啟用第 1 天',
    async () => {
      activate.disabled = true;
      result.textContent = '正在啟用課程…';
      try {
        await store.activateCourse(date.value);
        await choose(p.id);
        await openDate(date.value);
        notice(`已設定 ${date.value} 為第 1 天，從 Level 2 開始`);
      } catch (e) {
        result.textContent =
          e.code === 'permission-denied'
            ? '請先更新英文學習系統的 Firestore 規則，再按一次啟用。資料尚未變更。'
            : e.message;
        activate.disabled = false;
      }
    },
    'primary',
  );
  return el(
    'section',
    { class: 'panel settings' },
    el('h1', {}, `${p.name}，準備開始第 1 天 🌱`),
    el('p', {}, '目前尚未啟用課程。匯入單字後，請先發布固定題庫版本，再選擇起始日期。'),
    el('p', {}, '每天最多 15 個新字，依 Level 2～6 順序學習；Level 1 可自由查閱。'),
    el(
      'a',
      { href: './migration_tool.html', target: '_blank', rel: 'noopener' },
      '開啟單字管理系統，發布固定題庫版本 ↗',
    ),
    field('第 1 天日期', date),
    activate,
    result,
  );
}
function renderSettings() {
  const p = store.profile,
    voiceSelect = el('select', { 'aria-label': '英文聲音' }),
    info = el('p', { class: 'muted' });
  function voices() {
    voiceSelect.replaceChildren(
      speech.voices().map((v) => el('option', { value: v.voiceURI }, `${v.name} · ${v.lang}`)),
    );
    if (speech.selected()) voiceSelect.value = speech.selected().voiceURI;
    info.textContent = speech.recommended()
      ? `目前：${speech.selected()?.name || '無'}（推薦名稱僅供參考，請試聽確認）`
      : '此瀏覽器尚未提供優先語音，已選用可用的英文聲音，請試聽確認：' +
        (speech.selected()?.name || '尚未可用');
  }
  voices();
  globalThis.addEventListener('englishvoices', voices, { once: true });
  voiceSelect.addEventListener('change', () => {
    speech.select(voiceSelect.value);
    voices();
  });
  const importInput = el('input', { type: 'file', accept: '.json,application/json' });
  importInput.addEventListener(
    'change',
    attempt(async () => {
      await store.restore(JSON.parse(await importInput.files[0].text()));
      notice('備份已還原到新學習者');
      await welcome();
    }),
  );
  content.replaceChildren(
    el(
      'div',
      { class: 'settings' },
      el('h1', {}, '你的學習設定 ⚙️'),
      ...(p.courseVersion === 'none' ? [courseActivation()] : []),
      el(
        'section',
        { class: 'panel' },
        el('h2', {}, '🗣️ 英文女聲'),
        el(
          'p',
          { class: 'muted' },
          '優先 Google US English、Microsoft Natural、Siri／Enhanced／Premium、Samantha，再選其他 en-US。聲音依裝置提供，請試聽確認。',
        ),
        field('裝置提供的英文聲音', voiceSelect),
        info,
        button('自動選擇推薦美式語音', () => {
          speech.automatic();
          voices();
        }),
        button('試聽', () => speech.play(["Hello! Let's practice English together."], notice)),
        button('停止', () => speech.stop()),
        el(
          'p',
          { class: 'mini-note' },
          '每位學習者的聲音選擇只保存於目前装置；語音是否可離線使用依裝置而異。',
        ),
      ),
      el(
        'section',
        { class: 'panel' },
        el('h2', {}, '資料與備份'),
        el('p', {}, `學習時區：${p.timeZone} · 起始日：${p.startDate}`),
        el('p', {}, `固定題庫版本：${p.courseVersion}`),
        el(
          'p',
          { class: 'mini-note' },
          '清除瀏覽器資料可能失去匿名身分。請定期下載 JSON 備份。跨裝置請將備份還原到新的學習者；同名不會自動同步。為保留歷史日期與排程，既有學習者的時區與題庫版本固定。',
        ),
        button(
          '下載完整學習備份',
          attempt(async () => download('english-learning-backup.json', await store.backup())),
        ),
        field('驗證並還原 JSON（建立新學習者）', importInput),
        button(
          '重試待同步答案',
          attempt(() => store.flush()),
        ),
      ),
      button('返回使用者選擇', attempt(welcome)),
    ),
  );
}
try {
  await store.init();
  profiles = await store.listProfiles();
  const last = localStorage.getItem('english-last:' + store.uid);
  if (profiles.some((p) => p.id === last)) await choose(last);
  else await welcome();
} catch (e) {
  console.error(e);
  $('#app').replaceChildren(
    el(
      'main',
      { class: 'welcome' },
      el('h1', {}, '🌈 學習空間尚未連接'),
      el('p', {}, '請確認網路、Firebase 匿名登入與英文專用權限規則已啟用。'),
      el('p', { class: 'mini-note' }, e.message),
      button('重新連線', () => location.reload(), 'primary'),
      el('p', {}, el('a', { href: './index.html?demo' }, '先使用隔離示範模式 →')),
    ),
  );
}
