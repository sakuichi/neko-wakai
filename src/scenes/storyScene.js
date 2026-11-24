// 紙芝居（イントロ・エピローグ）。1枚ずつ、文章と部屋の絵（slides[i].view）を出す。中身は src/scenes/storySlides.js
// slides: [{ text, sec（この秒数で自動で次へ）, waitTap（true ならタップを待つ）, view(t) }]
// タップで次へ（出てすぐ STORY.tapIgnoreSec 未満のタップは無視）。skip が true なら「スキップ」ボタンを出す。
// 枚を変えるときは、画面をクリーム色で覆ってから切り替え、戻す（wipeSec ずつ）。fadeIn なら覆った状態から始める。
// onDone は、最後の枚から進んだとき（スキップを含む）に1回だけ呼ぶ。stop() で途中でやめたら呼ばない（覆いも片付ける）
import { STORY } from '../data/params.js';
import { STORY_TEXT } from '../data/texts.js';

export function createStoryScene({ screenEl, name, slides, onDone, skip = false, fadeIn = false }) {
  const W = STORY.wipeSec;
  let i = 0;
  let t = 0;
  let done = false;
  // 切り替え中：{ t（経過秒）, to（切り替え先の枚の番号。slides.length なら終わり）, switched（覆いきって切り替えたか） }
  let wipe = fadeIn ? { t: W, to: 0, switched: true } : null;

  const node = document.createElement('div');
  node.className = 'story';
  // 文章の枠（文と「タップで次へ」）
  const box = document.createElement('div');
  box.className = 'story-box';
  const caption = document.createElement('p');
  caption.className = 'story-caption';
  const hint = document.createElement('div');
  hint.className = 'story-hint';
  hint.textContent = STORY_TEXT.next;
  box.append(caption, hint);
  node.append(box);
  if (skip) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'story-skip';
    b.textContent = STORY_TEXT.skip;
    b.addEventListener('pointerdown', (e) => {
      // 下の紙芝居のタップ（次へ）にはしない
      e.stopPropagation();
      skipToEnd();
    });
    // キーボード（Enter・Space）でも押せるように。指やマウスの click（detail 1 以上）は数えない
    // （前の画面をタップして、指を離したときの click が、ここに届くことがあるため）
    b.addEventListener('click', (e) => {
      if (e.detail === 0) skipToEnd();
    });
    node.append(b);
  }
  node.addEventListener('pointerdown', () => {
    if (t >= STORY.tapIgnoreSec) go(i + 1);
  });
  screenEl.replaceChildren(node);
  // 覆いは画面全体（#screen の外）に置く。次の場面に移ったあとも、ふわっと戻すため
  const wipeEl = document.createElement('div');
  wipeEl.className = 'story-wipe';
  wipeEl.style.opacity = fadeIn ? '1' : '0';
  screenEl.parentElement.append(wipeEl);
  show();

  function show() {
    caption.textContent = slides[i].text;
    hint.hidden = true;
  }

  // 切り替えを始める（終わったあとと、切り替えの途中は受け付けない）
  function go(next) {
    if (done || wipe) return;
    wipe = { t: 0, to: next, switched: false };
  }

  // スキップ：切り替えの途中でも効かせる。覆っている途中なら行き先を終わりに変え、戻している途中なら、いまの濃さから覆い直す
  function skipToEnd() {
    if (done) return;
    if (wipe && !wipe.switched) wipe.to = slides.length;
    else wipe = { t: wipe ? 2 * W - wipe.t : 0, to: slides.length, switched: false };
  }

  function finish() {
    done = true;
    wipeEl.style.opacity = '1';
    onDone();
    // 次の場面の上で、覆いをふわっと消す
    wipeEl.style.transition = `opacity ${W}s`;
    requestAnimationFrame(() => {
      wipeEl.style.opacity = '0';
    });
    // 覆いが消えきるのを待ってから取り除く（余裕をみて2倍待つ）
    setTimeout(() => wipeEl.remove(), W * 2000);
  }

  return {
    name,
    update(dt) {
      if (done) return;
      t += dt;
      if (wipe) {
        wipe.t += dt;
        if (!wipe.switched && wipe.t >= W) {
          wipe.switched = true;
          if (wipe.to >= slides.length) {
            finish();
            return;
          }
          i = wipe.to;
          t = 0;
          show();
        }
        wipeEl.style.opacity = String(wipe.t < W ? wipe.t / W : Math.max(0, 2 - wipe.t / W));
        if (wipe.t >= 2 * W) wipe = null;
      }
      const s = slides[i];
      if (!s.waitTap && t >= s.sec) go(i + 1);
      hint.hidden = !(s.waitTap && t >= STORY.hintAfterSec);
    },
    view: () => ({ scene: name, ...slides[i].view(t) }),
    // 途中でやめる（デバッグで別の場面に移るとき）。onDone は呼ばない
    stop() {
      done = true;
      wipeEl.remove();
    },
  };
}
