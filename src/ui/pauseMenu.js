// 一時停止メニュー：「つづける」「タイトルにもどる」。タイトルにもどるときは、思い出に残らないことを一度確かめる。
// 開いている間は、src/main.js が昼の時間と猫の動きを止める
import { PAUSE_TEXT } from '../data/texts.js';

export function createPauseMenu({ el, onResume, onQuit }) {
  // 開くたびに増える番号。閉じる前に作ったボタンを、閉じたあとに押しても何もしないように使う
  let session = 0;
  let open = false;

  function button(className, text, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.textContent = text;
    const mine = session;
    b.addEventListener('click', () => {
      if (open && mine === session) onClick();
    });
    return b;
  }

  function panel(...children) {
    const node = document.createElement('div');
    node.className = 'pause-panel';
    node.append(...children);
    el.replaceChildren(node);
  }

  function text(tag, value) {
    const node = document.createElement(tag);
    node.textContent = value;
    return node;
  }

  function showMenu() {
    panel(
      text('h3', PAUSE_TEXT.title),
      button('pause-resume', PAUSE_TEXT.resume, () => {
        close();
        onResume();
      }),
      button('pause-quit', PAUSE_TEXT.quit, showConfirm),
    );
  }

  function showConfirm() {
    panel(
      text('p', PAUSE_TEXT.confirm),
      button('pause-cancel', PAUSE_TEXT.confirmNo, showMenu),
      button('pause-confirm', PAUSE_TEXT.confirmYes, () => {
        close();
        onQuit();
      }),
    );
  }

  function close() {
    open = false;
    session++;
    el.hidden = true;
    el.replaceChildren();
  }

  return {
    open() {
      session++;
      open = true;
      el.hidden = false;
      showMenu();
    },
    close,
    get isOpen() {
      return open;
    },
    // 遊びの操作（なでる・まばたき）を包む。メニューを開いている間は通さない
    whilePlaying(fn) {
      return (...args) => {
        if (!open) fn(...args);
      };
    },
  };
}
