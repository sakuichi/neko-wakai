// 説明カード・日付の表示（ゲームを一時停止する）と、
// 吹き出し（止めない説明）・トースト（止めない短いメッセージ）。
export function createOverlay(overlayEl, toastEl, bubbleEl) {
  const queue = [];
  let current = null;
  let shownAt = 0;
  let autoTimer = null;

  overlayEl.addEventListener('pointerdown', () => {
    // 表示直後の誤タップで閉じないように少し待つ
    if (current && performance.now() - shownAt > 350) close();
  });

  function showNext() {
    current = queue.shift() ?? null;
    if (!current) {
      overlayEl.hidden = true;
      overlayEl.replaceChildren();
      return;
    }
    overlayEl.replaceChildren(current.node);
    overlayEl.hidden = false;
    shownAt = performance.now();
    if (current.autoMs) autoTimer = setTimeout(close, current.autoMs);
  }

  function close() {
    clearTimeout(autoTimer);
    const done = current?.onClose;
    showNext();
    done?.();
  }

  function enqueue(item) {
    queue.push(item);
    if (!current) showNext();
  }

  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  return {
    get busy() {
      return current !== null;
    },
    card({ title, body }, onClose) {
      const node = el('div', 'card');
      node.append(el('h3', null, title), el('p', null, body), el('div', 'tap', 'タップでとじる'));
      enqueue({ node, onClose });
    },
    splash(title, sub, onClose) {
      const node = el('div', 'splash', title);
      if (sub) node.append(el('small', null, sub));
      enqueue({ node, onClose, autoMs: 1800 });
    },
    bubble({ title, body }, ms = 5000) {
      const item = el('div', 'bubble-item');
      item.append(el('b', null, title), el('span', null, body));
      bubbleEl.replaceChildren(item);
      setTimeout(() => item.classList.add('out'), ms);
      setTimeout(() => item.remove(), ms + 500);
    },
    toast(text, ms = 2400) {
      const item = el('div', 'toast-item', text);
      toastEl.replaceChildren(item);
      setTimeout(() => item.classList.add('out'), ms);
      setTimeout(() => item.remove(), ms + 500);
    },
    clear() {
      queue.length = 0;
      clearTimeout(autoTimer);
      current = null;
      overlayEl.hidden = true;
      overlayEl.replaceChildren();
      toastEl.replaceChildren();
      bubbleEl.replaceChildren();
    },
  };
}
