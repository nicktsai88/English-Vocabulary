import { validateRows, csvCell } from './core.js';
export const COLUMNS = {
  sequence: '序號',
  word: '英文單字',
  partOfSpeech: '詞性',
  meaningZh: '中文意思',
  exampleEn: '英文例句',
  exampleZh: '中文翻譯',
};
export const sheetLevel = (name) => Number(/^level\s*([1-6])$/i.exec(name.trim())?.[1]) || null;
export function mapRows(sheet, grid, mapping, level) {
  return grid.slice(1).flatMap((row, i) => {
    if (row.every((x) => x == null || String(x).trim() === '')) return [];
    const r = {
      _sheet: sheet,
      _row: i + 2,
      level,
      source: 'excel',
      phrases: [],
      reviewStatus: 'pending',
      active: true,
    };
    for (const [key, column] of Object.entries(mapping)) r[key] = row[column] ?? '';
    return [r];
  });
}
export function parseJSON(text) {
  const rows = JSON.parse(text);
  if (!Array.isArray(rows)) throw Error('請提供 JSON 陣列');
  return validateRows(rows);
}
export function toCSV(words) {
  const fields = ['level', ...Object.keys(COLUMNS), 'source', 'reviewStatus', 'active'];
  return (
    '\uFEFF' +
    [fields, ...words.map((w) => fields.map((f) => w[f]))]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n')
  );
}
