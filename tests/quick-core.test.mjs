import test from 'node:test';
import assert from 'node:assert/strict';
import { sentenceParts, cloze, optionsFor } from '../js/quick-core.js';
test('target highlighting uses full words, repeated matches and case without changing source text', () => {
  const text = 'An able person is ABLE; table is different.';
  const p = sentenceParts(text, { word: 'able' });
  assert.deepEqual(
    p.filter((x) => x.target).map((x) => x.text),
    ['able', 'ABLE'],
  );
  assert.equal(p.map((x) => x.text).join(''), text);
  assert.equal(
    cloze({ word: 'able', exampleEn: text }).sentence,
    'An ______ person is ______; table is different.',
  );
});
test('slash alternatives, punctuation and explicit inflections use the actual sentence answer', () => {
  assert.equal(cloze({ word: 'a/an', exampleEn: 'An apple and a book.' }).answer, 'An');
  assert.equal(
    cloze({ word: 'study', acceptedAnswers: ['studies'], exampleEn: 'She studies daily.' })
      .sentence,
    'She ______ daily.',
  );
  assert.equal(
    cloze({ word: 'take off', exampleEn: 'We take off now.' }).sentence,
    'We ______ now.',
  );
  assert.equal(sentenceParts('<img onerror=x> able', { word: 'able' })[0].text, '<img onerror=x> ');
});
test('four unique choices have one accepted answer and prefer similarly spelled real words', () => {
  const w = {
    id: 'a',
    word: 'adapt',
    meaningZh: '適應',
    partOfSpeech: 'v.',
    exampleEn: 'We adapt quickly.',
  };
  const q = optionsFor(
    w,
    [
      { word: 'adopt', partOfSpeech: 'v.' },
      { word: 'adept' },
      { word: 'adapt', meaningZh: '變體' },
      { word: 'adjust', meaningZh: '適應' },
    ],
    () => 0.2,
  );
  assert.equal(q.options.length, 4);
  assert.equal(new Set(q.options.map((x) => x.toLowerCase())).size, 4);
  assert.equal(q.options.filter((x) => x === q.answer).length, 1);
  assert.ok(q.options.includes('adopt'));
  assert.ok(!q.options.includes('adjust'));
});
test('missing or unmatched example is explicitly reported rather than fabricated', () => {
  assert.equal(cloze({ word: 'run', exampleEn: 'No target here.' }).fallback, true);
  assert.equal(optionsFor({ word: 'run' }, []).options.length, 4);
});
