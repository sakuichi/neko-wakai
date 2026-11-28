// 日の進行・夜の選択の効果・エンディング判定。描画や入力には依存しない。
import { DAYS, NIGHT, PERSONALITIES, MAX_DAY, MAX_VALUE, DEFAULT_PERSONALITY, COAT_PERSONALITY, FACES, EVENTS, EVENT_DAYS } from '../data/params.js';
import { isShy, isTimid } from './rules.js';

// catName は1日目の最初にプレイヤーが付ける。coat は毛色（src/render/renderer.js の COATS のキー）、face は顔の形（chooseFace）
// events：日ごとのイベント（添字は日−1。なければ null。chooseEvents）
export function createGame({ personality = DEFAULT_PERSONALITY, seed = Date.now(), coat = 'chatora', face = { shape: 'mochi', ears: 'normal' }, events = Array(MAX_DAY).fill(null) } = {}) {
  // dere・handsOk：ツンデレがデレた・ビビりの手が平気になったか（一度なったら戻らない。src/game/rules.js の isShy・isTimid）
  return { day: 1, trust: 0, personality, coat, face, catName: null, nightChoice: null, mistakes: 0, seed, seenCards: [], dere: false, handsOk: false, events };
}

/**
 * 今回の猫の顔（輪郭と耳の大きさ）を決める。毛色や性格とは関係なく、それぞれ同じくらい出る。
 * shape / ears はデバッグで固定したいときだけ渡す
 */
export function chooseFace({ shape = null, ears = null } = {}, random = Math.random) {
  return {
    shape: shape ?? FACES.shapes[Math.floor(random() * FACES.shapes.length)],
    ears: ears ?? FACES.ears[Math.floor(random() * FACES.ears.length)],
  };
}

/**
 * イベントを、イベントの日（EVENT_DAYS）のどれかに1つずつ、重ならないように割り当てる。
 * @returns {(string|null)[]} 長さ MAX_DAY。添字は日−1、イベントのない日は null
 */
export function chooseEvents(random = Math.random) {
  const days = [...EVENT_DAYS];
  for (let i = days.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [days[i], days[j]] = [days[j], days[i]];
  }
  const events = Array(MAX_DAY).fill(null);
  Object.keys(EVENTS).forEach((id, i) => {
    if (i < days.length) events[days[i] - 1] = id;
  });
  return events;
}

/**
 * 今回の猫の性格と毛色を決める。性格は毛色で決まる（COAT_PERSONALITY）。
 * どの性格も同じくらい出るように、先に性格を選んでから、その性格の毛色を選ぶ。
 * personality / coat はデバッグで固定したいときだけ渡す
 */
export function chooseCat({ personality = null, coat = null } = {}, random = Math.random) {
  if (coat) return { personality: personality ?? COAT_PERSONALITY[coat], coat };
  const keys = Object.keys(PERSONALITIES);
  const p = personality ?? keys[Math.floor(random() * keys.length)];
  const coats = Object.keys(COAT_PERSONALITY).filter((c) => COAT_PERSONALITY[c] === p);
  return { personality: p, coat: coats[Math.floor(random() * coats.length)] };
}

/**
 * タイトルの「ちがう子にする」：毛色と顔を引き直す。毛色は、いまの毛色を除いた中から同じ確率で選び、性格は毛色で決まる。
 * fixed：デバッグで固定しているもの { personality, coat, face }。変わるのは coat・personality・face だけ
 */
export function rerollCat(game, { personality = null, coat = null, face = {} } = {}, random = Math.random) {
  let next = coat;
  if (!next) {
    const all = Object.keys(COAT_PERSONALITY).filter((c) => !personality || COAT_PERSONALITY[c] === personality);
    const others = all.filter((c) => c !== game.coat);
    const pool = others.length ? others : all;
    next = pool[Math.floor(random() * pool.length)];
  }
  return { ...game, coat: next, personality: personality ?? COAT_PERSONALITY[next], face: chooseFace(face ?? {}, random) };
}

/**
 * その日の初期状態を作る。前の晩の選択の効果をここで反映する。
 * @returns {{day, cat, newActions: string[]}}
 */
export function startDay(game) {
  const def = DAYS[game.day - 1];
  const prevActions = game.day > 1 ? DAYS[game.day - 2].actions : [];
  const p = PERSONALITIES[game.personality];

  const day = {
    dayNumber: def.day,
    trust: game.trust,
    wariness: def.startWariness,
    timeLeft: def.durationSec,
    trustRate: def.trustMul ?? 1,
    // 膝に乗る信頼（3日目だけ低い）
    lapTrust: def.lapTrust ?? MAX_VALUE,
    boxLockLeft: 0,
    floorBonus: 0,
    mistakes: 0,
    actions: def.actions,
    signs: def.signs,
    canLap: def.canLap,
    approachMul: def.approachMul,
    // その日のイベント（なければ null。src/game/events.js）
    event: game.events?.[game.day - 1] ?? null,
    // 夜のあいだ（おやつなど）に信頼が境目を越えていたら、その日は最初からデレて・平気になっている
    dere: !!game.dere || !isShy(game.trust, p),
    handsOk: !!game.handsOk || !isTimid(game.trust, p),
  };
  const cat = { mode: 'relax', distance: MAX_VALUE, modeTimeLeft: 3 };

  if (game.nightChoice === 'treat') {
    // おやつに釣られて、最初から落ち着いて近くにいる
    cat.distance = MAX_VALUE - p.treatDistance;
    day.wariness = NIGHT.treatStartWariness;
    day.floorBonus = NIGHT.treatFloorBonus;
    day.trustRate = NIGHT.treatTrustRate * (def.trustMul ?? 1);
  } else if (game.nightChoice === 'box') {
    day.wariness = 0;
    day.boxLockLeft = p.boxLockSec;
    cat.mode = 'inBox';
  }

  return { day, cat, newActions: def.actions.filter((a) => !prevActions.includes(a)) };
}

/**
 * @param dayResult {{lapped: boolean, trust: number, mistakes: number}}
 * @returns {{game, next: 'night'|'ending', endingId: string|null}}
 */
export function finishDay(game, dayResult) {
  const g = {
    ...game,
    trust: dayResult.trust,
    mistakes: game.mistakes + dayResult.mistakes,
    dere: dayResult.dere ?? game.dere,
    handsOk: dayResult.handsOk ?? game.handsOk,
  };
  if (dayResult.lapped || game.day >= MAX_DAY) {
    return { game: g, next: 'ending', endingId: endingFor(game.day, dayResult.lapped) };
  }
  return { game: g, next: 'night', endingId: null };
}

export function chooseNight(game, choice) {
  const gain = { nothing: NIGHT.nothingTrust, treat: NIGHT.treatTrust }[choice] ?? 0;
  const trust = Math.min(MAX_VALUE, game.trust + gain);
  return { ...game, day: game.day + 1, trust, nightChoice: choice };
}

export function endingFor(dayNumber, lapped) {
  if (!lapped) return 'visitor';
  if (dayNumber <= 3) return 'fate';
  if (dayNumber <= 5) return 'patient';
  return 'persistent';
}
