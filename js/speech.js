let generation = 0,
  voices = [],
  last = [],
  onState = () => {};
const synth = globalThis.speechSynthesis;
const us = v => /^en[-_]us$/i.test(v.lang);
const femaleName = /Samantha|Zira|Jenny|Aria|Joanna|Salli|Michelle|Ana|Emma|Ava|Allison|Susan|Victoria|Female/i;
const maleName = /Guy|David|Mark|Christopher|Eric|Andrew|Brian|Ryan|Alex\b|Male\b/i;
export function voiceRank(v) {
  if (!us(v)) return 100;
  if (/Google US English/i.test(v.name)) return 0;
  if (/Microsoft/i.test(v.name) && /Natural/i.test(v.name))
    return femaleName.test(v.name) ? 10 : maleName.test(v.name) ? 60 : 12;
  if (/Siri|Enhanced|Premium/i.test(v.name))
    return femaleName.test(v.name) ? 20 : maleName.test(v.name) ? 60 : 22;
  if (/Samantha/i.test(v.name)) return 30;
  if (femaleName.test(v.name)) return 40;
  return 60;
}
function refresh() {
  voices = (synth?.getVoices().filter((v) => /^en[-_]/i.test(v.lang)) || []).sort((a,b)=>voiceRank(a)-voiceRank(b));
  globalThis.dispatchEvent?.(new Event('englishvoices'));
}
if (synth) {
  refresh();
  synth.addEventListener('voiceschanged', refresh);
}
export const speech = {
  profile: 'guest',
  rate: 1,
  voices: () => voices,
  recommended: () => voices.find(v => voiceRank(v) < 60) || null,
  selected() {
    return (
      voices.find((v) => v.voiceURI === localStorage.getItem('voice:' + this.profile)) ||
      this.recommended() ||
      voices.find(us) ||
      voices.find((v) => v.default) ||
      voices[0]
    );
  },
  automatic() {
    localStorage.removeItem('voice:' + this.profile);
    this.stop();
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
        if (token === generation) setTimeout(next, 100);
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
