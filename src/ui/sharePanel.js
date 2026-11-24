// シェア画面：画像と「Xに投稿」「画像を保存」「コピー」「とじる」。
// 外へ出るのは、ボタンを押したときだけ（開いただけでは何もしない）。中身は src/game/shareCard.js
// 「Xに投稿」：スマホは共有メニューに画像と文を渡す。PCは画像をコピーしてからXを開く（貼り付けると画像が付く）。
// 「画像を保存」：iPhone は共有メニューに画像だけを渡す（写真アプリに保存できる）。ほかはダウンロード。
// 共有メニューや画像のコピーが使えないときは、文だけでXを開き、ダウンロードで保存する
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
  device() {
    const { userAgent = '', platform = '', maxTouchPoints = 0 } = navigator;
    if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios';
    // iPad は Mac を名乗ることがある
    if (platform === 'MacIntel' && maxTouchPoints > 1) return 'ios';
    return /Android/.test(userAgent) ? 'android' : 'pc';
  },
  // 画像ファイルを共有メニューに渡せるか
  canShare(dataUrl, fileName) {
    if (!navigator.share || !navigator.canShare) return false;
    return navigator.canShare({ files: [imageFile(dataUrl, fileName)] });
  },
  share({ image, fileName, text }) {
    const data = { files: [imageFile(image, fileName)] };
    if (text !== undefined) data.text = text;
    return navigator.share(data);
  },
  canCopyImage() {
    return !!navigator.clipboard?.write && typeof ClipboardItem !== 'undefined';
  },
  copyImage(dataUrl) {
    return navigator.clipboard.write([new ClipboardItem({ [PNG]: new Blob([imageBytes(dataUrl)], { type: PNG }) })]);
  },
};

const PNG = 'image/png';

function imageBytes(dataUrl) {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function imageFile(dataUrl, fileName) {
  return new File([imageBytes(dataUrl)], fileName, { type: PNG });
}

// 使えるかを調べる。動きがない・例外のときは fallback
function ask(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

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

    const device = ask(() => actions.device(), null);
    // 共有メニューか画像のコピーが終わるのを待っている
    let waiting = false;
    // 共有メニューを開けなかった（このあとは、共有メニューを使わない）
    let sheetFailed = false;
    // 何回目の共有メニューか（終わらないまま切り替えたとき、前の結果をあとから受け取らないため）と、終わらないまま時間が過ぎたか
    let sheetTurn = 0;
    let sheetStuck = false;
    // 画像がクリップボードに入っている（PC）
    let imageCopied = false;
    // 文をコピーした回数（画像のコピーを待つ間に、文に入れ替わったことに気づくため）
    let textCopies = 0;
    // 画像のコピーを待つとXを開けない（次からは待たずに開く）
    let openWithoutCopy = false;

    const canSheet = () => !!image && !sheetFailed && !!actions.share && ask(() => actions.canShare(image, SHARE.fileName), false);
    const canCopyImage = () => !!image && device === 'pc' && !!actions.copyImage && ask(() => actions.canCopyImage(), false);

    // Xの投稿画面を開く。okMessage：開けたときの知らせ
    function openX(okMessage) {
      const opened = ask(() => actions.openUrl(xUrl), false);
      say(opened ? okMessage : SHARE_TEXT.xFailed);
      return opened;
    }

    // 「Xに投稿」「画像を保存」を受け付けるか。共有メニューが開いている間は、後ろのボタンは押せないはずなので、
    // 終わらないまま時間が過ぎて押されたら、共有メニューは使えないものとして受け付ける
    function ready() {
      if (!waiting) return true;
      if (!sheetStuck) return false;
      sheetTurn += 1;
      waiting = false;
      sheetStuck = false;
      sheetFailed = true;
      return true;
    }

    // 共有メニューを開く（ブラウザの決まりで、押した操作の中で呼ぶ）
    async function openSheet(data, failedMessage) {
      const turn = (sheetTurn += 1);
      waiting = true;
      const timer = setTimeout(() => {
        if (turn === sheetTurn) sheetStuck = true;
      }, SHARE.sheetWaitSec * 1000);
      let failed = false;
      try {
        await actions.share({ image, fileName: SHARE.fileName, ...data });
      } catch (e) {
        // 遊ぶ人がやめたときは、失敗ではない
        failed = e?.name !== 'AbortError';
      }
      clearTimeout(timer);
      if (turn !== sheetTurn) return;
      waiting = false;
      sheetStuck = false;
      if (failed) sheetFailed = true;
      say(failed ? failedMessage : '');
    }

    async function copyThenOpenX() {
      waiting = true;
      const before = textCopies;
      const copied = await finishes(() => actions.copyImage(image), SHARE.copyWaitSec);
      imageCopied = copied && before === textCopies;
      waiting = false;
      if (alive() && !openX(imageCopied ? SHARE_TEXT.xPaste : SHARE_TEXT.xNoImage)) openWithoutCopy = true;
    }

    const x = button('share-x', SHARE_TEXT.x, () => {
      if (!ready()) return;
      if ((device === 'ios' || device === 'android') && canSheet()) openSheet({ text: post }, SHARE_TEXT.xFailed);
      else if (imageCopied) openX(SHARE_TEXT.xPaste);
      else if (openWithoutCopy) openX(SHARE_TEXT.xNoImage);
      else if (canCopyImage()) copyThenOpenX();
      else openX('');
    });
    const save = button('share-save', SHARE_TEXT.save, () => {
      if (!image || !ready()) return;
      if (device === 'ios' && canSheet()) {
        openSheet({}, SHARE_TEXT.saved);
        return;
      }
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
        // 画像の代わりに文が入った
        imageCopied = false;
        textCopies += 1;
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
    const head = image ? [picture(image), text('p', 'share-hint', canCopyImage() ? SHARE_TEXT.hintPc : SHARE_TEXT.hint)] : [text('p', 'share-noimage', SHARE_TEXT.imageFailed)];
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

// 始めた処理が sec 秒のうちにうまく終われば true
function finishes(start, sec) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), sec * 1000);
    const done = (ok) => {
      clearTimeout(timer);
      resolve(ok);
    };
    try {
      Promise.resolve(start()).then(() => done(true), () => done(false));
    } catch {
      done(false);
    }
  });
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
