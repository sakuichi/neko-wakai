// イベント（4〜6日目）の進行。イベントの日は、いつもの様子の切り替え（src/game/catBrain.js の tick）の代わりにこれを使う。
// 描画や入力には依存しない。なでる・まばたきの判定は、いつもの決まり（src/game/rules.js）に、猫の様子を読み替えて任せる。
import { RULES, MAX_VALUE, EVENTS } from '../data/params.js';
import { ambient } from './catBrain.js';
import { applyAction } from './rules.js';

const clamp = (v) => Math.min(MAX_VALUE, Math.max(0, v));

// 箱が届いた：phase ごとの猫の様子（もぐっている間は伏せて箱に隠れ、顔を出すときは座ってふちから頭を出す）
const BOX_POSE = { approach: 'relax', arrive: 'tailUp', hop: 'tailUp', hide: 'relax', peek: 'look', happy: 'purr' };
// 箱の中にいる phase（なでると「箱の奥に引っ込んだ」になる）
const IN_BOX = ['hide', 'peek', 'happy'];

export function createEventState(id) {
  return { id, phase: 'approach', phaseT: 0, blinks: 0, done: false, hideFor: 0 };
}

/**
 * @returns {{ev, cat, day, cues: string[]}} cues：この tick で起きたこと（'drop' 箱が置かれた / 'hid' もぐった / 'peek' 顔を出した / 'out' 出てきた）
 */
export function eventTick(ev, cat, day, personality, dt, rng) {
  const P = EVENTS.box;
  const a = ambient(day, dt);
  let d = a.day;
  if (a.calm) d = { ...d, trust: clamp(d.trust + RULES.calmTrustPerSec * dt * d.trustRate) };
  let e = { ...ev, phaseT: ev.phaseT + dt };
  let c = { ...cat, walking: false };
  const cues = [];
  const go = (phase) => {
    e = { ...e, phase, phaseT: 0 };
  };

  if (d.boxLockLeft > 0) {
    // 前の晩に置いた段ボールから、まだ出てこない（いつもの日と同じ）。出てきてから、箱へ歩き始める
    d = { ...d, boxLockLeft: Math.max(0, d.boxLockLeft - dt) };
    c.mode = 'inBox';
    return { ev: e, cat: c, day: d, cues };
  }

  if (c.mode === 'flee') {
    // 逃げている間は、いつもの決まりの長さだけ待ってから、もう一度箱へ歩く
    c.modeTimeLeft = (c.modeTimeLeft ?? 0) - dt;
    if (c.modeTimeLeft > 0) return { ev: e, cat: c, day: d, cues };
    c.mode = 'relax';
  }

  if (e.phase === 'approach') {
    if (c.distance > P.boxDistance && a.calm) {
      c.distance = Math.max(P.boxDistance, c.distance - personality.approachSpeed * d.approachMul * dt);
      c.walking = c.distance > P.boxDistance;
    }
    if (c.distance <= P.boxDistance) {
      go('arrive');
      cues.push('drop');
    }
  } else if (e.phase === 'arrive') {
    if (e.phaseT >= P.arriveSec) go('hop');
  } else if (e.phase === 'hop') {
    if (e.phaseT >= P.hopSec) {
      go('hide');
      e.hideFor = hideLength(rng);
      cues.push('hid');
    }
  } else if (e.phase === 'hide') {
    if (e.phaseT >= e.hideFor) {
      go('peek');
      cues.push('peek');
    }
  } else if (e.phase === 'peek') {
    if (e.phaseT >= P.peekSec) {
      go('hide');
      e.hideFor = hideLength(rng);
    }
  } else if (e.phase === 'happy') {
    if (e.phaseT >= P.happySec) {
      if (e.blinks >= P.blinksToFinish) {
        go('out');
        e.done = true;
        d = { ...d, trust: clamp(d.trust + P.doneTrust * d.trustRate) };
        c.mode = 'relax';
        cues.push('out');
        return { ev: e, cat: c, day: d, cues };
      }
      go('hide');
      e.hideFor = hideLength(rng);
    }
  }
  c.mode = BOX_POSE[e.phase] ?? c.mode;
  return { ev: e, cat: c, day: d, cues };
}

function hideLength(rng) {
  const [min, max] = EVENTS.box.hideSec;
  return min + (max - min) * rng();
}

/**
 * イベントの間のなでる・まばたき。いつもの決まり（applyAction）に、猫の様子を読み替えて渡す。
 * @returns {{ev, cat, day, feedback, mistake}|null} イベントが終わったあとは null（いつもの applyAction に任せる）
 */
export function eventAct(action, ev, cat, day, personality) {
  if (ev.done) return null;
  const P = EVENTS.box;
  const as = (mode) => applyAction(action, { ...cat, mode }, day, personality);

  // 逃げている間・前の晩の段ボールの中では、いつもの日と同じ（逃げている猫には何も起きない。段ボールの中を触ると引っ込む）
  if (cat.mode === 'flee' || cat.mode === 'inBox') {
    const r = applyAction(action, cat, day, personality);
    return { ev, cat: r.cat, day: r.day, feedback: r.feedback, mistake: r.mistake };
  }

  if (action.type === 'blink') {
    // 押している間に顔を出していれば（sawLook）、離す前にもぐっても、いつもどおり目が合ったことにする
    if (ev.phase === 'peek' || (ev.phase === 'hide' && action.sawLook)) {
      const r = as('look');
      if (r.feedback === 'blinkBack') return result({ ...ev, blinks: ev.blinks + 1, phase: 'happy', phaseT: 0 }, cat, r);
      if (r.feedback === 'blinkAway') return result({ ...ev, phase: 'hide', phaseT: 0, hideFor: P.hideSec[0] }, cat, r);
      return result(ev, cat, r);
    }
    return result(ev, cat, as('relax'));
  }

  // なでる
  if (IN_BOX.includes(ev.phase)) {
    const r = as('inBox');
    return result({ ...ev, phase: 'hide', phaseT: 0, hideFor: P.afterPetHideSec }, cat, r);
  }
  // 箱の外では、見えている様子（くつろぎ・しっぽピン）のとおりに判定する（サインの意味を、イベントの日でも変えない）
  const r = as(BOX_POSE[ev.phase] ?? 'relax');
  if (r.cat.mode === 'flee') return { ev: { ...ev, phase: 'approach', phaseT: 0 }, cat: r.cat, day: r.day, feedback: r.feedback, mistake: r.mistake };
  return result(ev, cat, r);
}

// 判定の結果（信頼・警戒・反応）だけを使い、猫の様子は phase に合わせる
function result(ev, cat, r) {
  return { ev, cat: { ...cat, mode: BOX_POSE[ev.phase] ?? cat.mode }, day: r.day, feedback: r.feedback, mistake: r.mistake };
}

// 描画用（src/render/renderer.js）。done のあとは、空になった箱がその場に残る
export function eventProp(ev) {
  return { kind: 'parcel', phase: ev.done ? 'left' : ev.phase, phaseT: ev.phaseT };
}
