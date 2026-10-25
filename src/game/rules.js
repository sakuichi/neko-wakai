// プレイヤーの行動（なでる・まばたき）を判定する。描画や入力には依存しない。
import { RULES, MAX_VALUE } from '../data/params.js';

const clamp = (v) => Math.min(MAX_VALUE, Math.max(0, v));

// 不正解のなで方 → 上がる警戒
const WRONG_PET_WARINESS = {
  relax: RULES.pet.relaxWariness,
  look: RULES.pet.relaxWariness,
  backTurn: RULES.pet.relaxWariness,
  tailFlick: RULES.pet.tailFlickWariness,
  belly: RULES.pet.bellyWariness,
  fakeRub: RULES.pet.fakeRubWariness,
};

// なでると猫キックが返ってくる様子
const KICK_MODES = ['belly', 'fakeRub'];

/**
 * @returns {{cat, day, feedback: 'flee'|'kick'|'hide'|'stare'|'blinkBack'|'purr'|'tooFar'|null, mistake: boolean}}
 */
// action: { type: 'pet' } または { type: 'blink', holdMs, sawLook }（sawLook = 押している間に目が合ったか）
export function applyAction(action, cat, day, personality) {
  const none = { cat, day, feedback: null, mistake: false };
  if (!day.actions.includes(action.type)) return none;

  if (action.type === 'blink') {
    const slow = action.holdMs >= RULES.blink.minHoldMs && action.holdMs <= RULES.blink.maxHoldMs;
    if (!slow || cat.mode === 'lap') return none;
    // 押している間に一度でも目が合っていれば成功（離す前に様子が変わっても失敗にしない）
    const eyeContact = cat.mode === 'look' || action.sawLook;
    if (!eyeContact) {
      // 目が合っていないのに見つめてくる人は、ちょっと落ち着かない
      return {
        cat,
        day: { ...day, wariness: clamp(day.wariness + RULES.blink.missWariness * personality.warinessMul) },
        feedback: 'stare',
        mistake: false,
      };
    }
    return {
      cat: { ...cat, mode: 'relax', modeTimeLeft: RULES.modeSec.relax[0] },
      day: gainTrust(day, RULES.blink.trust),
      feedback: 'blinkBack',
      mistake: false,
    };
  }

  // 以下は pet
  if (cat.mode === 'rub') {
    return purr(cat, gainTrust(day, RULES.pet.rubTrust));
  }
  if (cat.mode === 'tailUp') {
    if (cat.distance > RULES.pet.tailUpReach) return { ...none, feedback: 'tooFar' };
    return purr(cat, gainTrust(day, RULES.pet.tailUpTrust));
  }
  if (cat.mode === 'inBox') {
    return {
      cat,
      day: scare(day, RULES.pet.relaxWariness, personality),
      feedback: 'hide',
      mistake: true,
    };
  }
  const wariness = WRONG_PET_WARINESS[cat.mode];
  if (wariness === undefined) return none; // flee / purr / lap 中は何も起きない
  return {
    cat: { ...cat, mode: 'flee', modeTimeLeft: RULES.fleeSec, distance: clamp(cat.distance + RULES.fleeDistance) },
    day: scare(day, wariness, personality),
    feedback: KICK_MODES.includes(cat.mode) ? 'kick' : 'flee',
    mistake: true,
  };
}

function gainTrust(day, amount) {
  return { ...day, trust: clamp(day.trust + amount * day.trustRate) };
}

function scare(day, amount, personality) {
  return { ...day, wariness: clamp(day.wariness + amount * personality.warinessMul), mistakes: day.mistakes + 1 };
}

function purr(cat, day) {
  return {
    cat: { ...cat, mode: 'purr', modeTimeLeft: RULES.purrSec },
    day,
    feedback: 'purr',
    mistake: false,
  };
}
