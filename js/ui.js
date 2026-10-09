export const $ = (s, root = document) => root.querySelector(s);
export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity))
    if (c != null) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}
export const button = (text, fn, cls = '') =>
  el('button', { type: 'button', class: cls, onClick: fn }, text);
export function notice(message) {
  const box = $('#notice');
  box.textContent = message;
  box.hidden = false;
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => (box.hidden = true), 9000);
}
export const attempt =
  (fn) =>
  async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      console.error(e);
      notice(e.message || '操作失敗，請稍後重試');
    }
  };
export function download(name, data, type = 'application/json') {
  const a = el('a', {
    href: URL.createObjectURL(
      new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type }),
    ),
    download: name,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function field(label, input) {
  return el('label', { class: 'field' }, el('span', {}, label), input);
}
