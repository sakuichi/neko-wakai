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

// 窓の外に鳥：鳥が来ている間は窓のほうを向いて背中を見せ、鳥が去ったら振り向いてこっちを見る。shy はツンで目をそらしたとき
const BIRD_POSE = { approach: 'relax', arrive: 'backTurn', hunt: 'backTurn', leave: 'backTurn', turn: 'look', happy: 'purr', shy: 'relax' };

export function createEventState(id) {
  const base = { id, phase: 'approach', phaseT: 0, blinks: 0, done: false };
  // round：鳥が来て去った回数（触って邪魔した回も数える）。watched：狩りを最後まで見守れた回数。huntFor：今回の狩りの長さ
  if (id === 'bird') return { ...base, round: 0, watched: 0, huntFor: 0 };
  // readLeft：ページをめくってから、まだ読んでいる残り秒。wondered：読むのをやめて「……？」となったか（その日1回だけ）
  if (id === 'read') return { ...base, phase: 'read', readLeft: 0, pages: 0, wondered: false };
  return { ...base, hideFor: 0 };
}

/**
 * @returns {{ev, cat, day, cues: string[]}} cues：この tick で起きたこと
 *   箱：'drop' 箱が置かれた / 'hid' もぐった / 'peek' 顔を出した / 'out' 出てきた
 *   鳥：'hunt' 狩りを始めた / 'understood' 初めて見守れて、鳥が去った（わかってくれた） / 'left' 2回目以降に見守れて、鳥が去った
 *   読書：'wonder' 初めて読むのをやめた（……？） / 'onBook' 本の上に乗ってきた
 */
export function eventTick(ev, cat, day, personality, dt, rng) {
  const a = ambient(day, dt);
  let d = a.day;
  if (a.calm) d = { ...d, trust: clamp(d.trust + RULES.calmTrustPerSec * dt * d.trustRate) };
  const e = { ...ev, phaseT: ev.phaseT + dt };
  const c = { ...cat, walking: false };
  // 読書中：猫が段ボールの中にいても、逃げていても、読んでいる時間は過ぎていく（歩くのは readTick で、落ち着いているときだけ）
  const reading = e.id === 'read' && e.readLeft > 0;
  if (reading) e.readLeft = Math.max(0, e.readLeft - dt);

  if (d.boxLockLeft > 0) {
    // 前の晩に置いた段ボールから、まだ出てこない（いつもの日と同じ）。出てきてから、イベントが始まる
    d = { ...d, boxLockLeft: Math.max(0, d.boxLockLeft - dt) };
    c.mode = 'inBox';
    return { ev: e, cat: c, day: d, cues: [] };
  }

  if (c.mode === 'flee') {
    // 逃げている間は、いつもの決まりの長さだけ待ってから、もう一度歩く
    c.modeTimeLeft = (c.modeTimeLeft ?? 0) - dt;
    if (c.modeTimeLeft > 0) return { ev: e, cat: c, day: d, cues: [] };
    c.mode = 'relax';
  }

  const step = { bird: birdTick, read: readTick }[e.id] ?? boxTick;
  return step(e, c, d, personality, dt, rng, a.calm, reading);
}

// 落ち着いていれば、くつろいで target まで歩く
function walkTo(c, d, personality, dt, calm, target) {
  if (c.distance > target && calm) {
    c.distance = Math.max(target, c.distance - personality.approachSpeed * d.approachMul * dt);
    c.walking = c.distance > target;
  }
  return c.distance <= target;
}

function boxTick(e, c, d, personality, dt, rng, calm) {
  const P = EVENTS.box;
  const cues = [];
  const go = (phase) => {
    e = { ...e, phase, phaseT: 0 };
  };

  if (e.phase === 'approach') {
    if (walkTo(c, d, personality, dt, calm, P.boxDistance)) {
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

function birdTick(e, c, d, personality, dt, rng, calm) {
  const P = EVENTS.bird;
  const cues = [];
  const go = (phase, extra = {}) => {
    e = { ...e, ...extra, phase, phaseT: 0 };
  };
  const gain = (amount) => {
    d = { ...d, trust: clamp(d.trust + amount * d.trustRate) };
  };
  // 終わり。ごほうびとトーストは、最初に見守れた回に済ませているので、ここでは何も足さない
  const finish = () => {
    go('out', { done: true });
    c.mode = 'relax';
    return { ev: e, cat: c, day: d, cues };
  };

  // 背中を向けている間は、いつもの日と同じく「触らずに待てた」分だけ信頼が増える（性格の得意・苦手 likes.patience がかかる）
  if (c.mode === 'backTurn') gain(RULES.backTurnTrustPerSec * dt * personality.likes.patience);

  if (e.phase === 'approach') {
    if (walkTo(c, d, personality, dt, calm, P.birdDistance)) {
      if (e.round >= P.rounds) return finish();
      go('arrive');
    }
  } else if (e.phase === 'arrive') {
    if (e.phaseT >= P.arriveSec) {
      const [min, max] = P.huntSec;
      go('hunt', { huntFor: min + (max - min) * rng() });
      cues.push('hunt');
    }
  } else if (e.phase === 'hunt') {
    if (e.phaseT >= e.huntFor) {
      // 狩りの邪魔をしなかった：いつもの「我慢のごほうび」と同じ量。最初に見守れた回だけ、わかってくれた（doneTrust）
      const first = e.watched === 0;
      go('leave', { watched: e.watched + 1 });
      gain(RULES.patienceTrust * personality.likes.patience);
      if (first) gain(P.doneTrust);
      cues.push(first ? 'understood' : 'left');
    }
  } else if (e.phase === 'leave') {
    if (e.phaseT >= P.leaveSec) go('turn');
  } else if (e.phase === 'turn') {
    if (e.phaseT >= P.turnSec && endRound()) return finish();
  } else if (e.phase === 'happy' || e.phase === 'shy') {
    if (e.phaseT >= P.happySec && endRound()) return finish();
  }
  c.mode = BIRD_POSE[e.phase] ?? c.mode;
  return { ev: e, cat: c, day: d, cues };

  // その回が終わる。まだ回が残っていれば、鳥がまた来る。最後の回なら true
  function endRound() {
    const round = e.round + 1;
    e = { ...e, round };
    if (round >= P.rounds) return true;
    go('arrive');
    return false;
  }
}

// 読書中：読んでいる（ページをめくってから readSec の）間だけ、いつもの距離の下限を気にせず近づく。膝の前（距離0）まで来たら本の上に乗る
// reading：この tick のはじめに読んでいたか（readLeft は eventTick で減らしてある）
function readTick(e, c, d, personality, dt, rng, calm, reading) {
  const P = EVENTS.read;
  const cues = [];

  if (e.phase === 'read') {
    c.mode = 'relax';
    if (reading) {
      if (calm) {
        c.distance = Math.max(0, c.distance - P.readSpeed * dt);
        c.walking = c.distance > 0;
      }
      if (e.readLeft === 0 && !e.wondered && c.distance > 0) {
        // 読むのをやめると、猫は「……？」と立ち止まる（遊び方に気づけるよう、その日の最初の1回だけ知らせる）
        e.wondered = true;
        cues.push('wonder');
      }
    }
    if (c.distance <= 0) {
      e = { ...e, phase: 'onBook', phaseT: 0 };
      d = { ...d, trust: clamp(d.trust + P.doneTrust * d.trustRate) };
      c.walking = false;
      cues.push('onBook');
    }
  } else if (e.phase === 'onBook') {
    if (e.phaseT >= P.onBookSec) {
      // 本の上から降りる。信頼が100なら、そのまま膝の上で和解（いつもの膝の流れ）
      e = { ...e, phase: 'out', phaseT: 0, done: true };
      const lap = d.canLap && d.trust >= MAX_VALUE;
      c.mode = lap ? 'lap' : 'relax';
      if (!lap) c.modeTimeLeft = RULES.modeSec.relax[0];
      return { ev: e, cat: c, day: d, cues };
    }
  }
  if (e.phase === 'onBook') {
    c.mode = 'onBook';
    c.distance = 0;
  }
  return { ev: e, cat: c, day: d, cues };
}

/**
 * イベントの間のなでる・まばたき。いつもの決まり（applyAction）に、猫の様子を読み替えて渡す。
 * @returns {{ev, cat, day, feedback, mistake}|null} イベントが終わったあとは null（いつもの applyAction に任せる）
 */
export function eventAct(action, ev, cat, day, personality) {
  if (ev.done) return null;
  // ページをめくる（本のタップ）は読書中の日だけ。猫が逃げていても、段ボールの中にいてもめくれる
  if (action.type === 'page') {
    const turned = ev.id === 'read' && ev.phase === 'read';
    const next = turned ? { ...ev, readLeft: EVENTS.read.readSec, pages: ev.pages + 1 } : ev;
    return { ev: next, cat, day, feedback: null, mistake: false };
  }

  // 逃げている間・前の晩の段ボールの中では、いつもの日と同じ（逃げている猫には何も起きない。段ボールの中を触ると引っ込む）
  if (cat.mode === 'flee' || cat.mode === 'inBox') {
    const r = applyAction(action, cat, day, personality);
    return { ev, cat: r.cat, day: r.day, feedback: r.feedback, mistake: r.mistake };
  }
  const act = { bird: birdAct, read: readAct }[ev.id] ?? boxAct;
  return act(action, ev, cat, day, personality);
}

// 読書中：読んでいる間の猫は、くつろいでいるのと同じ（触ると逃げてミス、まばたきは「じっと見つめる」）。本の上では何も起きない
function readAct(action, ev, cat, day, personality) {
  const r = applyAction(action, { ...cat, mode: ev.phase === 'onBook' ? 'lap' : 'relax' }, day, personality);
  if (ev.phase === 'onBook') return { ev, cat, day: r.day, feedback: r.feedback, mistake: r.mistake };
  return { ev, cat: r.cat, day: r.day, feedback: r.feedback, mistake: r.mistake };
}

function boxAct(action, ev, cat, day, personality) {
  const P = EVENTS.box;
  const as = (mode) => applyAction(action, { ...cat, mode }, day, personality);

  if (action.type === 'blink') {
    // 押している間に顔を出していれば（sawLook）、離す前にもぐっても、いつもどおり目が合ったことにする
    if (ev.phase === 'peek' || (ev.phase === 'hide' && action.sawLook)) {
      const r = as('look');
      if (r.feedback === 'blinkBack') return result(BOX_POSE, { ...ev, blinks: ev.blinks + 1, phase: 'happy', phaseT: 0 }, cat, r);
      if (r.feedback === 'blinkAway') return result(BOX_POSE, { ...ev, phase: 'hide', phaseT: 0, hideFor: P.hideSec[0] }, cat, r);
      return result(BOX_POSE, ev, cat, r);
    }
    return result(BOX_POSE, ev, cat, as('relax'));
  }

  // なでる
  if (IN_BOX.includes(ev.phase)) {
    const r = as('inBox');
    return result(BOX_POSE, { ...ev, phase: 'hide', phaseT: 0, hideFor: P.afterPetHideSec }, cat, r);
  }
  // 箱の外では、見えている様子（くつろぎ・しっぽピン）のとおりに判定する（サインの意味を、イベントの日でも変えない）
  const r = as(BOX_POSE[ev.phase] ?? 'relax');
  if (r.cat.mode === 'flee') return { ev: { ...ev, phase: 'approach', phaseT: 0 }, cat: r.cat, day: r.day, feedback: r.feedback, mistake: r.mistake };
  return result(BOX_POSE, ev, cat, r);
}

function birdAct(action, ev, cat, day, personality) {
  const as = (mode) => applyAction(action, { ...cat, mode }, day, personality);
  const pose = BIRD_POSE[ev.phase] ?? 'relax';

  if (action.type === 'blink') {
    // 振り向いたとき（turn）か、押している間に目が合っていれば（sawLook）、いつもの「チラッ」へのまばたき
    if (ev.phase === 'turn' || action.sawLook) {
      const r = as('look');
      if (ev.phase === 'turn' && r.feedback === 'blinkBack') return result(BIRD_POSE, { ...ev, blinks: ev.blinks + 1, phase: 'happy', phaseT: 0 }, cat, r);
      if (ev.phase === 'turn' && r.feedback === 'blinkAway') return result(BIRD_POSE, { ...ev, phase: 'shy', phaseT: 0 }, cat, r);
      return result(BIRD_POSE, ev, cat, r);
    }
    return result(BIRD_POSE, ev, cat, as(pose));
  }

  // なでる：見えている様子（背中・チラッ・ゴロゴロ）のとおりに判定する。逃げたら、鳥も去って、その回は終わり（ごほうびなし）。
  // 窓の前まで歩き直してから、次の回の鳥が来る。歩いている途中（approach）に逃げたときは、回は数えない
  const r = as(pose);
  if (r.cat.mode === 'flee') {
    const round = ev.phase === 'approach' ? ev.round : ev.round + 1;
    return { ev: { ...ev, phase: 'approach', phaseT: 0, round }, cat: r.cat, day: r.day, feedback: r.feedback, mistake: r.mistake };
  }
  return result(BIRD_POSE, ev, cat, r);
}

// 判定の結果（信頼・警戒・反応）だけを使い、猫の様子は phase に合わせる
function result(pose, ev, cat, r) {
  return { ev, cat: { ...cat, mode: pose[ev.phase] ?? cat.mode }, day: r.day, feedback: r.feedback, mistake: r.mistake };
}

// 描画用（src/render/renderer.js）。箱は done のあと、空になった箱がその場に残る（left）。鳥は done のあとも窓の外に枝が残る
export function eventProp(ev) {
  if (ev.id === 'bird') return { kind: 'bird', phase: ev.done ? 'done' : ev.phase, phaseT: ev.phaseT };
  if (ev.id === 'read') return { kind: 'book', phase: ev.done ? 'done' : ev.phase, phaseT: ev.phaseT, pages: ev.pages };
  return { kind: 'parcel', phase: ev.done ? 'left' : ev.phase, phaseT: ev.phaseT };
}
