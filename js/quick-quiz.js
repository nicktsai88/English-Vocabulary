import { el, button } from './ui.js';
import { optionsFor } from './quick-core.js';

export function quickQuiz({ container, words, pool, key, save, finish, exit }) {
  let records;
  try {
    records = JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    records = {};
  }
  const persist = () => localStorage.setItem(key, JSON.stringify(records));
  const remaining = () => words.filter((w) => !records[w.id]?.done);
  function show() {
    const w = remaining()[0];
    if (!w) {
      finish();
      return;
    }
    const r = (records[w.id] ||= { wrong: false, done: false, eventId: crypto.randomUUID() });
    persist();
    const q = optionsFor(w, pool);
    const feedback = el('p', { role: 'status', 'aria-live': 'polite' });
    const answers = el('div', { class: 'quick-options' });
    let busy = false;
    const wrongWords = words.filter((x) => records[x.id]?.wrong);
    container.replaceChildren(
      el(
        'div',
        { class: 'row between' },
        el('h1', {}, r.wrong ? '錯題練習' : '例句小測驗'),
        button('暫停，稍後繼續', exit),
      ),
      el(
        'p',
        { class: 'muted' },
        `已完成 ${words.length - remaining().length} / ${words.length} · 答對直接下一題，答錯立即重練`,
      ),
      el(
        'section',
        { class: 'panel quick-question' },
        el('h2', {}, q.fallback ? `選出「${w.meaningZh}」的英文` : q.sentence),
        el(
          'p',
          { class: 'muted' },
          q.fallback ? '此字尚無包含目標字的例句，本題暫用中文提示。' : `中文提示：${w.meaningZh}`,
        ),
        answers,
        feedback,
      ),
      el(
        'aside',
        { class: 'panel quick-errors' },
        el('h2', {}, `錯題練習 · ${wrongWords.length}`),
        wrongWords.length
          ? wrongWords.map((x) =>
              el(
                'p',
                {},
                `${records[x.id].done ? '✓ 已重練' : '待重練'} · ${x.word} — ${x.meaningZh}`,
              ),
            )
          : el('p', {}, '答錯的單字會立即加入這裡。'),
      ),
    );
    for (const choice of q.options)
      answers.append(
        button(
          choice,
          async () => {
            if (busy) return;
            busy = true;
            answers.querySelectorAll('button').forEach((b) => (b.disabled = true));
            if (choice !== q.answer) {
              r.wrong = true;
              persist();
              feedback.className = 'feedback wrong';
              feedback.replaceChildren(
                el('p', {}, `正確答案：${q.answer} — ${w.meaningZh}`),
                el('p', {}, w.exampleEn),
                button('立即重練這個字', show, 'primary'),
              );
              const list = container.querySelector('.quick-errors');
              const errors = words.filter((x) => records[x.id]?.wrong);
              list.replaceChildren(
                el('h2', {}, `錯題練習 · ${errors.length}`),
                ...errors.map((x) =>
                  el(
                    'p',
                    {},
                    `${records[x.id].done ? '✓ 已重練' : '待重練'} · ${x.word} — ${x.meaningZh}`,
                  ),
                ),
              );
              return;
            }
            try {
              await save(w, r);
              r.done = true;
              persist();
              show();
            } catch (e) {
              feedback.textContent = '答案尚未儲存：' + e.message + '。請再按一次答案。';
              busy = false;
              answers.querySelectorAll('button').forEach((b) => (b.disabled = false));
            }
          },
          'quick-option',
        ),
      );
  }
  show();
}
