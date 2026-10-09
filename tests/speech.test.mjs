import test from 'node:test';
import assert from 'node:assert/strict';
const utterances = [];
globalThis.speechSynthesis = {
  getVoices: () => [{ name: 'Unknown voice', lang: 'en-US', voiceURI: 'default', default: true }],
  addEventListener: () => {},
  cancel: () => {},
  speak: (u) => utterances.push(u),
};
globalThis.SpeechSynthesisUtterance = class {
  constructor(text) {
    this.text = text;
  }
};
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const { speech } = await import('../js/speech.js');
test('unknown English voice is a fallback, never labeled as recommended female', () => {
  assert.equal(speech.recommended(), null);
  assert.equal(speech.selected().name, 'Unknown voice');
});
test('a/an is split, uses actual voice language and natural pitch', () => {
  speech.play(['a/an'], () => {});
  assert.equal(utterances.at(-1).text, 'a');
  assert.equal(utterances.at(-1).pitch, 1);
  assert.equal(utterances.at(-1).lang, 'en-US');
  speech.stop();
});
test('cancel invalidates old onend callback and prevents queued speech', async () => {
  speech.play(['one', 'two'], () => {});
  const current = utterances.at(-1),
    before = utterances.length;
  speech.stop();
  current.onend();
  await new Promise((r) => setTimeout(r, 220));
  assert.equal(utterances.length, before);
});
