let generation = 0,
  voices = [],
  last = [],
  onState = () => {};
const synth = globalThis.speechSynthesis;
function refresh() {
  voices = synth?.getVoices().filter((v) => /^en[-_]/i.test(v.lang)) || [];
  globalThis.dispatchEvent?.(new Event('englishvoices'));
}
if (synth) {
  refresh();
  synth.addEventListener('voiceschanged', refresh);
}
export const speech = {
  profile: 'guest',
  rate: 0.9,
  voices: () => voices,
  recommended: () =>
    voices.find(
      (v) => /Samantha|Zira|Jenny|Aria|Joanna|Salli/i.test(v.name) && v.lang === 'en-US',
    ) ||
    voices.find((v) => /Sonia|Susan|Serena|Libby/i.test(v.name)) ||
    null,
  selected() {
    return (
      voices.find((v) => v.voiceURI === localStorage.getItem('voice:' + this.profile)) ||
      this.recommended() ||
      voices.find((v) => v.default) ||
      voices[0]
    );
  },
  select(id) {
    localStorage.setItem('voice:' + this.profile, id);
  },
  stop() {
    generation++;
    synth?.cancel();
    onState('');
  },
  replay() {
    this.play(last);
  },
  play(items, callback = onState) {
    this.stop();
    onState = callback;
    last = items;
    const token = generation;
    const voice = this.selected();
    if (!synth || !voice) {
      callback('沒有可用英文語音；請稍後重試或繼續文字學習。');
      return;
    }
    const queue = items.flatMap((t) => String(t).split(/\s*\/\s*/)).filter(Boolean);
    let i = 0;
    const next = () => {
      if (token !== generation) return;
      if (i >= queue.length) {
        callback('');
        return;
      }
      const text = queue[i++];
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = this.rate;
      u.pitch = 1;
      callback('🔊 ' + text);
      u.onend = () => {
        if (token === generation) setTimeout(next, 180);
      };
      u.onerror = () => {
        if (token === generation) {
          generation++;
          callback('朗讀失敗，請點擊重試。');
        }
      };
      synth.speak(u);
    };
    next();
  },
};
globalThis.addEventListener?.('pagehide', () => speech.stop());
