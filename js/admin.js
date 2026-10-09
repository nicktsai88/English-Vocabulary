import { connect } from './firebase.js';
import { APP_NAMESPACE } from './config.js';
import { chunks, validateRows, validateWord } from './core.js';
import { COLUMNS, sheetLevel, mapRows, parseJSON, toCSV } from './importer.js';
import { $, el, button, notice, attempt, download, field } from './ui.js';
import { speech } from './speech.js';
let ctx,
  words = [],
  preview = [],
  failed = [],
  editing = null,
  form,
  query = '',
  levelFilter = '',
  posFilter = '',
  reviewFilter = '',
  selectedSheetControls = [];
let updateDanger = () => {};
const status = (text) => ($('#sync').textContent = text);
const ref = (...p) => ctx.F.doc(ctx.db, 'apps', APP_NAMESPACE, ...p);
const col = (...p) => ctx.F.collection(ctx.db, 'apps', APP_NAMESPACE, ...p);
async function refresh() {
  status('正在讀取雲端題庫…');
  const q = ctx.F.query(
    col('words'),
    ctx.F.orderBy('level'),
    ctx.F.orderBy('sequence'),
    ctx.F.limit(250),
  );
  words = [];
  let cursor = null;
  do {
    const s = await ctx.F.getDocsFromServer(cursor ? ctx.F.query(q, ctx.F.startAfter(cursor)) : q);
    words.push(...s.docs.map((d) => d.data()));
    cursor = s.size === 250 ? s.docs.at(-1) : null;
  } while (cursor);
  status(`已連線 · 題庫 ${words.length} 筆`);
  updateDanger();
}
$('#login').addEventListener(
  'click',
  attempt(async () => {
    status('正在驗證…');
    ctx = ctx || (await connect(true));
    if (!ctx.auth.currentUser)
      await ctx.U.signInWithPopup(ctx.auth, new ctx.U.GoogleAuthProvider());
    const token = await ctx.auth.currentUser.getIdTokenResult(true);
    if (token.claims.admin !== true) {
      status('權限不足');
      await ctx.U.signOut(ctx.auth);
      throw Error('此 Google 帳號沒有 admin claim，請依 README 在可信任環境授權');
    }
    await refresh();
    render();
  }),
);
function textInput(name, required = true) {
  return el('input', { name, required, maxlength: 2000 });
}
function formField(name, label, type = 'input') {
  const x = type === 'textarea' ? el('textarea', { name }) : textInput(name);
  return field(label, x);
}
function phraseEditor(value = {}) {
  const box = el('div', { class: 'phrase' });
  const type = el(
    'select',
    { name: 'phraseType' },
    [
      ['phrase', '片語'],
      ['collocation', '搭配詞'],
      ['pattern', '句型'],
    ].map(([v, t]) => el('option', { value: v }, t)),
  );
  type.value = value.type || 'collocation';
  box.append(field('類型', type));
  for (const [k, t] of [
    ['text', '英文內容'],
    ['meaningZh', '中文意思'],
    ['exampleEn', '英文例句'],
    ['exampleZh', '中文翻譯'],
  ]) {
    const input = textInput('phrase-' + k);
    input.value = value[k] || '';
    box.append(field(t, input));
  }
  box.append(button('移除此搭配', () => box.remove()));
  box.append(
    field(
      '搭配審核',
      el(
        'select',
        { name: 'phraseReview' },
        el('option', { value: 'pending' }, '待審核'),
        el('option', { value: 'approved' }, '已審核'),
      ),
    ),
  );
  box.querySelector('[name=phraseReview]').value = value.reviewStatus || 'pending';
  box.dataset.source = value.source || 'manual';
  box.dataset.reviewStatus = value.reviewStatus || 'pending';
  return box;
}
function singleForm() {
  const level = el(
    'select',
    { name: 'level' },
    [1, 2, 3, 4, 5, 6].map((n) => el('option', { value: n }, 'Level ' + n)),
  );
  const seq = el('input', {
    name: 'sequence',
    type: 'number',
    min: 1,
    max: 999999,
    required: true,
  });
  const phrases = el('div', { id: 'phrases' });
  form = el(
    'form',
    {
      onSubmit: attempt(async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        data.active = form.elements.active.checked;
        data.phrases = [...phrases.children].map((box) => ({
          type: box.querySelector('select').value,
          ...Object.fromEntries(
            ['text', 'meaningZh', 'exampleEn', 'exampleZh'].map((k) => [
              k,
              box.querySelector(`[name="phrase-${k}"]`).value,
            ]),
          ),
          source: box.dataset.source,
          reviewStatus: box.querySelector('[name=phraseReview]').value,
        }));
        const v = validateWord(data);
        if (v.errors.length) throw Error(v.errors.map(([f, e]) => f + ': ' + e).join('；'));
        if (editing && editing !== v.word.id)
          throw Error('既有 Level／序號不可變更；wordId 必須保持穩定');
        const result = await writeRows([v], editing ? 'update' : 'add');
        if (result.failed.length) throw Error(result.failed[0].reason);
        await refresh();
        drawLibrary();
        notice('單筆儲存成功');
        form.reset();
        phrases.replaceChildren();
        editing = null;
      }),
    },
    field('等級', level),
    field('序號', seq),
    ...Object.entries(COLUMNS)
      .filter(([k]) => k !== 'sequence')
      .map(([k, t]) => formField(k, t, k.includes('example') ? 'textarea' : 'input')),
    phrases,
    button('＋ 新增片語／搭配詞／句型', () => {
      if (phrases.children.length >= 3) return notice('每個單字最多三筆');
      phrases.append(phraseEditor());
    }),
    formField('source', '來源'),
    field(
      '內容審核',
      el(
        'select',
        { name: 'reviewStatus' },
        el('option', { value: 'pending' }, '待審核'),
        el('option', { value: 'approved' }, '已審核'),
      ),
    ),
    field('啟用', el('input', { name: 'active', type: 'checkbox', checked: true })),
    el(
      'div',
      { class: 'row' },
      el('button', { class: 'primary', type: 'submit' }, '儲存單字'),
      button('試聽', () =>
        speech.play([form.elements.word.value, form.elements.exampleEn.value], notice),
      ),
      button('取消編輯', () => {
        editing = null;
        form.reset();
        phrases.replaceChildren();
      }),
    ),
  );
  return el(
    'section',
    { class: 'panel section-purple' },
    el('h2', {}, '✏️ 單筆新增與編輯'),
    el('p', { class: 'muted' }, '修改不會改寫已發布的課程與學習快照。'),
    form,
  );
}
function edit(w) {
  editing = w.id;
  for (const k of [
    'level',
    'sequence',
    'word',
    'partOfSpeech',
    'meaningZh',
    'exampleEn',
    'exampleZh',
    'source',
    'reviewStatus',
  ])
    form.elements[k].value = w[k] || '';
  form.elements.active.checked = w.active;
  $('#phrases').replaceChildren((w.phrases || []).map(phraseEditor));
  form.scrollIntoView({ behavior: 'smooth' });
}
function importPanel() {
  const upload = el('input', { type: 'file', accept: '.xlsx,.csv,.json' }),
    paste = el('textarea', { placeholder: '貼上 JSON 陣列', 'aria-label': 'JSON 匯入' }),
    sheets = el('div', { id: 'sheets' }),
    pv = el('div', { id: 'preview' }),
    strategy = el(
      'select',
      { id: 'strategy' },
      el('option', { value: 'skip' }, '略過既有資料'),
      el('option', { value: 'update' }, '更新既有資料'),
      el('option', { value: 'add' }, '僅新增（重複列為錯誤）'),
    );
  sheets.append(
    button(
      '下載六工作表空白 Excel',
      attempt(() => {
        if (!globalThis.XLSX) throw Error('Excel 套件尚未載入');
        const wb = XLSX.utils.book_new();
        for (let n = 1; n <= 6; n++)
          XLSX.utils.book_append_sheet(
            wb,
            XLSX.utils.aoa_to_sheet([Object.values(COLUMNS)]),
            'level' + n,
          );
        XLSX.writeFile(wb, 'english-six-level-template.xlsx');
      }),
    ),
  );
  upload.addEventListener(
    'change',
    attempt(async () => {
      preview = [];
      pv.replaceChildren();
      const f = upload.files[0];
      if (!f) return;
      if (f.size > 20 * 1024 * 1024) throw Error('檔案上限 20 MB');
      if (/\.json$/i.test(f.name)) {
        preview = parseJSON(await f.text());
        drawPreview();
        return;
      }
      if (!globalThis.XLSX) throw Error('Excel 讀取套件尚未載入；請檢查網路');
      const wb = XLSX.read(await f.arrayBuffer(), {
        type: 'array',
        cellFormula: false,
        cellHTML: false,
      });
      selectedSheetControls = [];
      sheets.replaceChildren(el('h3', {}, '選擇工作表與欄位對應'));
      for (const name of wb.SheetNames) {
        const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], {
          header: 1,
          raw: false,
          defval: '',
        });
        if (!grid.length) continue;
        const checked = el('input', { type: 'checkbox', checked: true }),
          lev = el(
            'select',
            {},
            el('option', { value: '' }, '請手動指定等級'),
            [1, 2, 3, 4, 5, 6].map((n) => el('option', { value: n }, 'Level ' + n)),
          );
        lev.value = String(sheetLevel(name) || '');
        const mapping = {};
        const box = el(
          'details',
          { class: 'phrase' },
          el('summary', {}, name + ` · ${Math.max(0, grid.length - 1)} 列`),
          field('匯入此工作表', checked),
          field('工作表等級', lev),
        );
        for (const [key, label] of Object.entries(COLUMNS)) {
          const select = el(
            'select',
            {},
            el('option', { value: '' }, '請選擇欄位'),
            grid[0].map((head, i) => el('option', { value: i }, String(head))),
          );
          const index = grid[0].findIndex(
            (v) => String(v).trim() === label || String(v).trim() === key,
          );
          select.value = index < 0 ? '' : String(index);
          mapping[key] = select;
          box.append(field(label, select));
        }
        selectedSheetControls.push({ name, grid, checked, lev, mapping });
        sheets.append(box);
      }
      sheets.append(
        button(
          '驗證所有已選工作表',
          attempt(() => {
            const rows = [];
            for (const c of selectedSheetControls) {
              if (!c.checked.checked) continue;
              if (!c.lev.value || Object.values(c.mapping).some((s) => s.value === ''))
                throw Error(c.name + '：請完成等級與所有欄位對應');
              rows.push(
                ...mapRows(
                  c.name,
                  c.grid,
                  Object.fromEntries(
                    Object.entries(c.mapping).map(([k, s]) => [k, Number(s.value)]),
                  ),
                  Number(c.lev.value),
                ),
              );
            }
            preview = validateRows(rows);
            drawPreview();
          }),
          'orange',
        ),
      );
    }),
  );
  return el(
    'section',
    { class: 'panel section-orange' },
    el('h2', {}, '📥 批次匯入'),
    el(
      'p',
      { class: 'muted' },
      '先預覽、驗證，再寫入。原始資料保留於 originalSource；同等級＋序號維持相同 ID。',
    ),
    field('Excel / UTF-8 CSV / JSON', upload),
    sheets,
    field('或直接貼上 JSON', paste),
    button(
      '驗證 JSON',
      attempt(() => {
        preview = parseJSON(paste.value);
        drawPreview();
      }),
    ),
    pv,
    field('遇到既有等級＋序號', strategy),
    button(
      '確認預覽並分批匯入',
      attempt(async () => {
        if (!preview.length) throw Error('請先讀取並預覽資料');
        if (preview.some((r) => r.errors.length)) throw Error('請先修正所有驗證錯誤');
        if (
          !confirm(
            `確認匯入 ${preview.length} 筆？策略：${strategy.selectedOptions[0].textContent}`,
          )
        )
          return;
        const r = await writeRows(preview, strategy.value);
        failed = r.failed;
        notice(`成功 ${r.success}、失敗 ${r.failed.length}、略過 ${r.skipped}`);
        $('#import-result').textContent =
          `成功 ${r.success}／失敗 ${r.failed.length}／略過 ${r.skipped}`;
        await refresh();
        drawLibrary();
      }),
      'primary',
    ),
    el('p', { id: 'import-result', role: 'status' }),
    button('下載失敗資料', () =>
      download(
        'failed-import.json',
        failed.map((r) => ({ ...r.word, _error: r.reason })),
      ),
    ),
    button(
      '重試失敗項目',
      attempt(async () => {
        if (!failed.length) throw Error('目前沒有失敗項目');
        preview = validateRows(failed.map((r) => r.word));
        drawPreview();
        notice('已載入失敗項目，請確認策略後重新匯入。');
      }),
    ),
  );
}
function drawPreview() {
  const box = $('#preview'),
    counts = [1, 2, 3, 4, 5, 6]
      .map((n) => `L${n}: ${preview.filter((r) => r.word.level === n).length}`)
      .join(' · ');
  const errors = preview.flatMap((r) =>
    r.errors.map(([field, reason]) => `${r.sheet} 第 ${r.row} 列 · ${field}：${reason}`),
  );
  const warnings = preview
    .filter((r) =>
      words.some((w) => w.word.toLowerCase() === r.word.word.toLowerCase() && w.id !== r.word.id),
    )
    .map((r) => `${r.word.word}：其他序號／Level 也有同字，保留為不同 ID`);
  box.replaceChildren(
    el('h3', {}, '匯入預覽'),
    el('p', {}, counts),
    el('p', {}, `驗證錯誤 ${errors.length} · 拼字衝突警示 ${warnings.length}`),
    el(
      'div',
      { class: 'table-wrap' },
      el(
        'table',
        {},
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            ['來源列', 'ID', '英文', '中文', '處理'].map((h) => el('th', {}, h)),
          ),
        ),
        el(
          'tbody',
          {},
          preview
            .slice(0, 100)
            .map((r) =>
              el(
                'tr',
                {},
                el('td', {}, r.sheet + ' / ' + r.row),
                el('td', {}, r.word.id),
                el('td', {}, r.word.word),
                el('td', {}, r.word.meaningZh),
                el('td', {}, words.some((w) => w.id === r.word.id) ? '既有' : '新增'),
              ),
            ),
        ),
      ),
    ),
    el('small', {}, '表格顯示前 100 筆，驗證涵蓋全部資料。'),
    el(
      'div',
      { class: 'table-wrap' },
      [...errors, ...warnings].map((s) => el('p', {}, s)),
    ),
  );
}
async function writeRows(rows, strategy) {
  const result = { success: 0, skipped: 0, failed: [] };
  for (let i = 0; i < rows.length; i += 100) {
    const slice = rows.slice(i, i + 100);
    status(`寫入中 ${i} / ${rows.length}（尚未同步完成）`);
    try {
      const outcome = await ctx.F.runTransaction(ctx.db, async (tx) => {
        const docs = await Promise.all(slice.map((r) => tx.get(ref('words', r.word.id))));
        const revision = await tx.get(ref('meta', 'draft'));
        const o = { success: 0, skipped: 0, failed: [] };
        for (let j = 0; j < slice.length; j++) {
          const w = slice[j].word,
            existing = docs[j].data();
          if (existing && strategy === 'skip') {
            o.skipped++;
            continue;
          }
          if (existing && strategy === 'add') {
            o.failed.push({ word: w, reason: '相同 Level＋序號已存在' });
            continue;
          }
          const { _sheet, _row, ...clean } = w;
          tx.set(ref('words', w.id), {
            ...clean,
            originalSource: existing?.originalSource || clean,
            contentVersion: (existing?.contentVersion || 0) + 1,
            updatedAt: ctx.F.serverTimestamp(),
          });
          o.success++;
        }
        tx.set(ref('meta', 'draft'), {
          revision: (revision.data()?.revision || 0) + 1,
          updatedAt: ctx.F.serverTimestamp(),
        });
        return o;
      });
      result.success += outcome.success;
      result.skipped += outcome.skipped;
      result.failed.push(...outcome.failed);
    } catch (e) {
      result.failed.push(...slice.map((r) => ({ word: r.word, reason: e.message })));
    }
  }
  status(result.failed.length ? '部分寫入失敗' : '同步成功 · 寫入已由雲端確認');
  return result;
}
let library;
function libraryPanel() {
  const input = el('input', {
      class: 'search',
      placeholder: '搜尋英文、中文、片語',
      'aria-label': '題庫搜尋',
    }),
    lev = el(
      'select',
      {},
      el('option', { value: '' }, '全部等級'),
      [1, 2, 3, 4, 5, 6].map((n) => el('option', { value: n }, 'Level ' + n)),
    ),
    pos = el('input', { class: 'search', placeholder: '詞性篩選', 'aria-label': '詞性篩選' }),
    review = el(
      'select',
      {},
      el('option', { value: '' }, '全部內容'),
      el('option', { value: 'missing' }, '片語待補充'),
      el('option', { value: 'pending' }, '待審核'),
    );
  input.addEventListener('input', () => {
    query = input.value;
    drawLibrary();
  });
  lev.addEventListener('change', () => {
    levelFilter = lev.value;
    drawLibrary();
  });
  pos.addEventListener('input', () => {
    posFilter = pos.value;
    drawLibrary();
  });
  review.addEventListener('change', () => {
    reviewFilter = review.value;
    drawLibrary();
  });
  library = el('div');
  return el(
    'section',
    { class: 'panel' },
    el('h2', {}, '📚 題庫查詢與審核'),
    el('div', { class: 'filters' }, input, lev, pos, review),
    el(
      'div',
      { class: 'row' },
      button('匯出目前篩選 JSON', () => download('vocabulary.json', filteredWords())),
      button('匯出目前篩選 CSV', () =>
        download('vocabulary.csv', toCSV(filteredWords()), 'text/csv;charset=utf-8'),
      ),
    ),
    library,
  );
}
function filteredWords() {
  return words.filter(
    (w) =>
      (!levelFilter || w.level === Number(levelFilter)) &&
      (!posFilter || w.partOfSpeech.includes(posFilter)) &&
      JSON.stringify([w.word, w.meaningZh, w.phrases])
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (!reviewFilter ||
        (reviewFilter === 'missing'
          ? !w.phrases?.length
          : w.reviewStatus !== 'approved' ||
            w.phrases?.some((p) => p.reviewStatus !== 'approved'))),
  );
}
function drawLibrary() {
  const found = filteredWords();
  library.replaceChildren(
    el(
      'p',
      { class: 'mini-note' },
      [1, 2, 3, 4, 5, 6]
        .map(
          (n) =>
            `Level ${n}：啟用 ${words.filter((w) => w.level === n && w.active).length} / 停用 ${words.filter((w) => w.level === n && !w.active).length}`,
        )
        .join('　'),
    ),
    el('p', {}, `${found.length} 筆符合 · 表格顯示前 200 筆，匯出包含全部篩選結果`),
    el(
      'div',
      { class: 'table-wrap' },
      el(
        'table',
        {},
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            ['ID', '英文／中文', '狀態', '操作'].map((x) => el('th', {}, x)),
          ),
        ),
        el(
          'tbody',
          {},
          found.slice(0, 200).map((w) =>
            el(
              'tr',
              {},
              el('td', {}, w.id),
              el('td', {}, el('strong', {}, w.word), el('p', {}, w.meaningZh)),
              el(
                'td',
                {},
                w.active ? '啟用' : '停用',
                ' · ',
                w.reviewStatus === 'approved' ? '已審核' : '待審核',
              ),
              el(
                'td',
                {},
                button('編輯', () => edit(w)),
                button('試聽', () => speech.play([w.word, w.exampleEn], notice)),
                button(
                  w.active ? '停用' : '啟用',
                  attempt(async () => {
                    await writeRows([{ word: { ...w, active: !w.active } }], 'update');
                    await refresh();
                    drawLibrary();
                  }),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
async function publish() {
  const draftBefore = await ctx.F.getDocFromServer(ref('meta', 'draft'));
  const expected = draftBefore.data()?.revision || 0;
  await refresh();
  if (!words.length) throw Error('題庫是空的');
  const invalid = words.filter((w) => validateWord(w).errors.length);
  if (invalid.length) throw Error('題庫仍有驗證錯誤');
  const course = chunks(words);
  if (!course.length) throw Error('沒有可排程的 Level 2～6 單字');
  if (
    !confirm(
      `發布 ${course.length} 天、${course.flat().length} 個新字的固定版本？既有學習者維持原版本，新學習者採用此版本。`,
    )
  )
    return;
  const version = 'v-' + crypto.randomUUID();
  await ctx.F.setDoc(ref('curricula', version), {
    ready: false,
    days: course.length,
    wordCount: course.flat().length,
    createdAt: ctx.F.serverTimestamp(),
  });
  for (let i = 0; i < course.length; i += 100) {
    const b = ctx.F.writeBatch(ctx.db);
    course.slice(i, i + 100).forEach((ws, n) =>
      b.set(ref('curricula', version, 'days', String(i + n)), {
        words: ws.map((w) => {
          const { updatedAt, originalSource, ...snapshot } = w;
          return snapshot;
        }),
        index: i + n,
      }),
    );
    await b.commit();
    status(`版本寫入 ${Math.min(i + 100, course.length)} / ${course.length} 天`);
  }
  await ctx.F.runTransaction(ctx.db, async (tx) => {
    const draft = await tx.get(ref('meta', 'draft'));
    if ((draft.data()?.revision || 0) !== expected)
      throw Error('發布期间題庫有變更，請重新整理後再發布；未完成版本不會啟用');
    tx.update(ref('curricula', version), { ready: true });
    tx.set(ref('meta', 'current'), {
      version,
      days: course.length,
      publishedAt: ctx.F.serverTimestamp(),
    });
  });
  status('同步成功 · 版本 ' + version);
  notice('版本已發布，新建立的學習者會使用此版本。');
}
function render() {
  const dangerLevel = el(
      'select',
      {},
      el('option', { value: '' }, '全部等級'),
      [1, 2, 3, 4, 5, 6].map((n) => el('option', { value: n }, 'Level ' + n)),
    ),
    count = el('p');
  const updateCount = () =>
    (count.textContent = `將影響 ${words.filter((w) => w.active && (!dangerLevel.value || w.level === Number(dangerLevel.value))).length} 筆啟用單字`);
  updateDanger = updateCount;
  dangerLevel.addEventListener('change', updateCount);
  updateCount();
  $('#admin').replaceChildren(
    el(
      'div',
      { class: 'row between', style: 'margin-bottom:20px' },
      el('p', { class: 'muted' }, '英文專用資料空間 · ' + APP_NAMESPACE),
      el(
        'div',
        { class: 'row' },
        button(
          '重新讀取',
          attempt(async () => {
            await refresh();
            drawLibrary();
            updateCount();
          }),
        ),
        button('發布固定題庫版本', attempt(publish), 'primary'),
        button(
          '登出管理員',
          attempt(async () => {
            await ctx.U.signOut(ctx.auth);
            location.reload();
          }),
        ),
      ),
    ),
    el('div', { class: 'admin-grid' }, singleForm(), importPanel()),
    libraryPanel(),
    el(
      'section',
      { class: 'panel section-red' },
      el('h2', {}, '⚠️ 批次停用'),
      el('p', {}, '歷史版本與學習紀錄仍保留。本工具禁止永久刪除，避免破壞引用。'),
      field('操作範圍', dangerLevel),
      count,
      button('先下載完整題庫備份', () => download('vocabulary-full-backup.json', words)),
      button(
        '批次停用',
        attempt(async () => {
          const affected = words.filter(
            (w) => w.active && (!dangerLevel.value || w.level === Number(dangerLevel.value)),
          );
          if (!affected.length) return notice('沒有需要停用的單字');
          if (
            prompt(`將停用 ${affected.length} 筆，請輸入「停用 ${affected.length}」確認`) !==
            `停用 ${affected.length}`
          )
            return;
          const result = await writeRows(
            affected.map((w) => ({ word: { ...w, active: false } })),
            'update',
          );
          notice(`成功 ${result.success}，失敗 ${result.failed.length}`);
          await refresh();
          drawLibrary();
          updateCount();
        }),
        'danger',
      ),
    ),
    el('p', {}, el('a', { href: './index.html' }, '← 回到學習樂園')),
  );
  drawLibrary();
}
