// シェア画面：画像と「Xに投稿」「画像を保存」「コピー」「とじる」。
// 外へ出るのは、ボタンを押したときだけ（開いただけでは何もしない）。中身は src/game/shareCard.js
import { SHARE } from '../data/params.js';
import { SHARE_TEXT } from '../data/texts.js';

const browserActions = {
  // Xの投稿画面を新しいタブで開く（実際に投稿するかは、遊ぶ人がそこで決める）。開けたら true
  openUrl(url) {
    const w = window.open(url, '_blank');
    if (!w) return false;
    // 開いた先から、このページを操作できないようにする（できない環境でも、開けたことに変わりはない）
    try {
      w.opener = null;
    } catch {
      // 別の場所のページになったあとは切れないことがある
    }
    return true;
  },
  save(dataUrl, fileName) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
  },
  async copy(text) {
    await navigator.clipboard.writeText(text);
  },
};

// el: シェア画面を出す空の要素。閉じている間は hidden。
// behind: 開いている間、操作できなくする後ろの要素。opener: 閉じたときにフォーカスを戻すボタン（どちらも省略できる）
export function createSharePanel({ el, actions = browserActions, behind = null, opener = null }) {
  let isOpen = false;
  // 何回目に開いたか（閉じたあとに終わったコピーの知らせを、次に開いた画面に出さないため）
  let session = 0;
  el.hidden = true;

  // makeImage: 画像（data URL。作れなければ null）を作る。post: 投稿文。xUrl: Xの投稿画面のURL
  function open({ makeImage, post, xUrl }) {
    const now = (session += 1);
    const alive = () => isOpen && now === session;
    let image = null;
    try {
      image = makeImage();
    } catch {
      image = null;
    }

    const status = text('p', 'share-status', '');
    status.setAttribute('aria-live', 'polite');
    const say = (message) => {
      if (alive()) status.textContent = message;
    };

    const x = button('share-x', SHARE_TEXT.x, () => {
      let opened = false;
      try {
        opened = actions.openUrl(xUrl);
      } catch {
        opened = false;
      }
      say(opened ? '' : SHARE_TEXT.xFailed);
    });
    const save = button('share-save', SHARE_TEXT.save, () => {
      if (!image) return;
      try {
        actions.save(image, SHARE.fileName);
        // 保存が効かない環境でも例外は出ないので、長押しの方法も知らせる
        say(SHARE_TEXT.saved);
      } catch {
        say(SHARE_TEXT.saveFailed);
      }
    });
    save.disabled = !image;
    let copying = false;
    const copy = button('share-copy', SHARE_TEXT.copy, async () => {
      if (copying) return;
      copying = true;
      try {
        await actions.copy(post);
        say(SHARE_TEXT.copied);
      } catch {
        say(SHARE_TEXT.copyFailed);
      } finally {
        copying = false;
      }
    });
    const closeBtn = button('share-close', SHARE_TEXT.close, close);

    const buttons = document.createElement('div');
    buttons.className = 'share-buttons';
    buttons.append(x, save, copy);
    const head = image ? [picture(image), text('p', 'share-hint', SHARE_TEXT.hint)] : [text('p', 'share-noimage', SHARE_TEXT.imageFailed)];
    el.replaceChildren(...head, buttons, status, closeBtn);
    el.hidden = false;
    isOpen = true;
    if (behind) behind.inert = true;
    closeBtn.focus();

    // 閉じたあとに届いた操作では、何もしない
    function button(className, label, fn) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = className;
      b.textContent = label;
      b.addEventListener('click', () => {
        if (alive()) fn();
      });
      return b;
    }
  }

  function close() {
    isOpen = false;
    el.hidden = true;
    el.replaceChildren();
    if (behind) behind.inert = false;
    opener?.focus();
  }

  return {
    open,
    close,
    get isOpen() {
      return isOpen;
    },
  };
}

function text(tag, className, content) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = content;
  return node;
}

function picture(src) {
  const img = document.createElement('img');
  img.className = 'share-image';
  img.alt = SHARE_TEXT.alt;
  img.src = src;
  return img;
}
