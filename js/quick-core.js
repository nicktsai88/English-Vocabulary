// Shared by the reading sheet and the quiz; never insert vocabulary as HTML.
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function forms(word) {
  const base = String(word.word || '').trim();
  return [...new Set([base, ...(word.acceptedAnswers || []), ...base.split(/\s*\/\s*/)])]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
}
export function sentenceParts(text, word) {
  const choices = forms(word);
  if (!choices.length) return [{ text: text || '', target: false }];
  const re = new RegExp('(?<![A-Za-z])(?:' + choices.map(escape).join('|') + ')(?![A-Za-z])', 'gi');
  const parts = [];
  let last = 0;
  for (const match of String(text || '').matchAll(re)) {
    parts.push(
      { text: text.slice(last, match.index), target: false },
      { text: match[0], target: true },
    );
    last = match.index + match[0].length;
  }
  parts.push({ text: String(text || '').slice(last), target: false });
  return parts;
}
export function cloze(word) {
  const sentence = word.exampleEn || '';
  const parts = sentenceParts(sentence, word);
  const answer = parts.find((p) => p.target)?.text;
  if (!answer) return { sentence: '', answer: word.word, fallback: true };
  return {
    sentence: parts
      .map((p) => (p.target && p.text.toLowerCase() === answer.toLowerCase() ? '______' : p.text))
      .join(''),
    answer,
    fallback: false,
  };
}
function distance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}
const reserve =
  'able about above accept access action active actual adapt affect after again alone along already also alter always amount animal another answer appear apply area around arrive avoid away become before begin below better between book bring build call carry cause change class clear close come common complete consider create decide different early effect enough every expect family father follow great happen home house important include interest large later learn leave little live look many matter mean might mother move near never next often open order other paper part people place point possible present problem public quite reach read ready really right school seem sense should show small sound speak stand start state still study take tell than their there thing think time together turn under understand use very want water where which while whole without word work world would write'.split(
    ' ',
  );
export function optionsFor(word, pool, random = Math.random) {
  const question = cloze(word),
    normalized = (s) => s.toLowerCase().trim();
  const excluded = new Set([...forms(word), question.answer].map(normalized));
  const seen = new Set();
  const candidates = [...pool, ...reserve.map((word) => ({ word }))].filter((w) => {
    const value = normalized(w.word || '');
    if (
      !value ||
      excluded.has(value) ||
      seen.has(value) ||
      (w.id && w.id === word.id) ||
      (w.meaningZh && w.meaningZh === word.meaningZh)
    )
      return false;
    seen.add(value);
    return true;
  });
  const score = (w) =>
    distance(normalized(question.answer), normalized(w.word)) +
    (w.partOfSpeech && w.partOfSpeech === word.partOfSpeech ? -0.5 : 0);
  candidates.sort((a, b) => score(a) - score(b));
  const options = [question.answer, ...candidates.slice(0, 3).map((w) => w.word)];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { ...question, options };
}
