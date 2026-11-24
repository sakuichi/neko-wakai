// 紙芝居（イントロ・エピローグ）の中身。src/scenes/storyScene.js に渡す slides を作る（純粋関数）
// Slide: { text, sec（この秒数で自動で次へ）, waitTap（true ならタップを待つ）, view(t) → 描画に渡す View の一部 }
// View の一部：cat（姿勢）, catAt（猫を描く位置 { x, y, s, alpha, outside（庭にいる＝窓のガラスより奥に描く） }）,
// windowOpen（窓の開き 0〜1）, dayTime（明るさ 0 朝〜1 夕方）, night（夜）, lapTime（膝に乗ってからの秒数）
import { STORY, MAX_VALUE } from '../data/params.js';
import { STORY_TEXT, withName } from '../data/texts.js';
import { LAP_SHOW_SEC } from './dayScene.js';

// 庭（窓の外、芝生の上）に座っている猫
const GARDEN = { x: 100, y: 326, s: 0.42, outside: true };
// 部屋の隅（いつもの昼のスタートあたり）
const CORNER = { x: 214, y: 372, s: 0.55 };
// 開けた窓の前（左の戸をずらしたすき間の前）
const DOOR = { x: 46, y: 352, s: 0.52 };
// 窓から出ていった先（ここへ向かいながら消える）
const OUT = { x: 22, y: 340, s: 0.48 };
// 昼の最後の位置がわからないとき（デバッグで途中から見るときなど）は、部屋の真ん中あたりから歩き出す
const FALLBACK_FROM = { x: 200, y: 450, s: 0.75 };
const MORNING = STORY.morning;

const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const between = (from, to, u) => ({ x: lerp(from.x, to.x, u), y: lerp(from.y, to.y, u), s: lerp(from.s, to.s, u) });
const cat = (mode, distance = MAX_VALUE) => ({ mode, distance });
const sitAt = (at) => ({ cat: cat('sit'), catAt: at });

export function introSlides() {
  return [
    { text: STORY_TEXT.intro[0], sec: STORY.slideSec, waitTap: false, view: () => ({ dayTime: MORNING, ...sitAt(GARDEN) }) },
    {
      text: STORY_TEXT.intro[1],
      sec: STORY.longSlideSec,
      waitTap: false,
      view: () => ({ dayTime: MORNING, windowOpen: STORY.introWindowOpen, cat: cat('relax'), catAt: CORNER }),
    },
  ];
}

// from：昼の最後に猫を描いた位置 { x, y, s }（なければ null）。dayTime：昼の最後の明るさ
export function epilogueSlides({ endingId, trust, name, from, dayTime = 1 }) {
  return endingId === 'visitor' ? visitorSlides(trust, name, from ?? FALLBACK_FROM) : lapSlides(name, dayTime);
}

// 和解：膝で眠ったまま夕方になり、夜になる
function lapSlides(name, dayTime) {
  const D = STORY.dusk;
  return [
    {
      text: withName(STORY_TEXT.lap[0], name),
      sec: D.sec,
      waitTap: false,
      view: (t) => ({ cat: cat('lap', 0), lapTime: LAP_SHOW_SEC + t, dayTime: lerp(dayTime, 1, clamp01(t / D.toEveningSec)) }),
    },
    {
      text: withName(STORY_TEXT.lap[1], name),
      waitTap: true,
      view: (t) => ({ cat: cat('lap', 0), lapTime: LAP_SHOW_SEC + D.sec + t, night: true }),
    },
  ];
}

// 通い猫：窓を開ける → 窓の前まで後ろ姿で歩く → 振り返る → 出ていく。次の朝、また庭に来ている
function visitorSlides(trust, name, start) {
  const L = STORY.leave;
  const walkEnd = L.openSec + L.walkSec;
  const lookEnd = walkEnd + L.lookBackSec;
  return [
    {
      text: withName(STORY_TEXT.visitor[0], name),
      sec: L.sec,
      waitTap: false,
      view: (t) => {
        const base = { dayTime: 1, windowOpen: clamp01(t / L.openSec) };
        if (t < L.openSec) return { ...base, ...sitAt({ x: start.x, y: start.y, s: start.s }) };
        if (t < walkEnd) return { ...base, cat: cat('walkAway'), catAt: between(start, DOOR, (t - L.openSec) / L.walkSec) };
        if (t < lookEnd) return { ...base, ...sitAt(DOOR) };
        // 出ていき終わったら、計算の誤差を残さず、ちょうど見えなくする
        const u = t >= lookEnd + L.outSec ? 1 : clamp01((t - lookEnd) / L.outSec);
        return { ...base, cat: cat('walkAway'), catAt: { ...between(DOOR, OUT, u), alpha: 1 - u } };
      },
    },
    {
      text: `${withName(STORY_TEXT.visitor[1], name)}\n${trust >= STORY.nearTrust ? STORY_TEXT.near : STORY_TEXT.far}`,
      waitTap: true,
      view: () => ({ dayTime: MORNING, ...sitAt(GARDEN) }),
    },
  ];
}

// 結果画面の背景：通い猫は朝の庭に座っている。和解は、夜の膝の上で眠り続ける
export function endingView(endingId, t) {
  if (endingId === 'visitor') return { dayTime: MORNING, ...sitAt(GARDEN) };
  return { cat: cat('lap', 0), lapTime: LAP_SHOW_SEC + STORY.dusk.sec + t, night: true };
}
