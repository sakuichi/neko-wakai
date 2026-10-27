// 日の進行・夜の選択の効果・エンディング判定。描画や入力には依存しない。
import { DAYS, NIGHT, PERSONALITIES, MAX_DAY, MAX_VALUE, DEFAULT_PERSONALITY, COAT_PERSONALITY, FACES } from '../data/params.js';

// catName は1日目の最初にプレイヤーが付ける。coat は毛色（src/render/renderer.js の COATS のキー）、face は顔の形（chooseFace）
export function createGame({ personality = DEFAULT_PERSONALITY, seed = Date.now(), coat = 'chatora', face = { shape: 'mochi', ears: 'normal' } } = {}) {
  return { day: 1, trust: 0, personality, coat, face, catName: null, nightChoice: null, mistakes: 0, seed, seenCards: [] };
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
    trustRate: 1,
    boxLockLeft: 0,
    floorBonus: 0,
    mistakes: 0,
    actions: def.actions,
    signs: def.signs,
    canLap: def.canLap,
    approachMul: def.approachMul,
  };
  const cat = { mode: 'relax', distance: MAX_VALUE, modeTimeLeft: 3 };

  if (game.nightChoice === 'treat') {
    // おやつに釣られて、最初から落ち着いて近くにいる
    cat.distance = MAX_VALUE - p.treatDistance;
    day.wariness = NIGHT.treatStartWariness;
    day.floorBonus = NIGHT.treatFloorBonus;
    day.trustRate = NIGHT.treatTrustRate;
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
  const g = { ...game, trust: dayResult.trust, mistakes: game.mistakes + dayResult.mistakes };
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
