import { NIGHT_TEXT, withName } from '../data/texts.js';

// 夜の画面がふわっと出るまでの時間（style.css の .night-screen の fade-in と合わせる）
export const NIGHT_FADE_SEC = 0.5;
const AWAY = { mode: 'relax', distance: 80 };

// 夜の画面が表示しきるまでは、猫を昼の終わりの場所に留める（画面の裏で遠ざかる）
export function nightCatPose(lastCat, t) {
  return t < NIGHT_FADE_SEC ? lastCat : AWAY;
}

// lastCat: 昼の終わりの猫の様子と距離。now: 実際の時刻（ミリ秒）。
// CSS のフェードは実際の時間で進むので、デバッグの倍速でも実際の時間で数える
export function createNightScene({ screenEl, session, lastCat = AWAY, onChoose, now = () => performance.now() }) {
  const startedAt = now();
  const node = document.createElement('div');
  node.className = 'night-screen';
  const h2 = document.createElement('h2');
  h2.textContent = NIGHT_TEXT.title(session.game.day);
  const p = document.createElement('p');
  p.textContent = withName(NIGHT_TEXT.prompt, session.game.catName);
  node.append(h2, p);

  for (const c of NIGHT_TEXT.choices) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'choice';
    b.textContent = c.label;
    const small = document.createElement('small');
    small.textContent = c.hint;
    b.append(small);
    b.addEventListener('click', () => {
      screenEl.replaceChildren();
      onChoose(c.id);
    }, { once: true });
    node.append(b);
  }
  screenEl.replaceChildren(node);

  return {
    name: 'night',
    update() {},
    view: () => ({ scene: 'night', cat: nightCatPose(lastCat, (now() - startedAt) / 1000) }),
  };
}
