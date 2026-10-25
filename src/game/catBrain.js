// 時間経過による猫の変化（様子の切り替え・移動・警戒と信頼の自然な増減）。
// 描画や入力には依存しない。
import { RULES, MAX_VALUE } from '../data/params.js';

const clamp = (v) => Math.min(MAX_VALUE, Math.max(0, v));

// 猫が歩いて近づくのは「くつろぎ」の間だけ。ほかの様子（座っている・寝ころぶ・逃げる）では、その場から動かない
const WALK_MODES = ['relax'];

/**
 * @returns {{cat, day, enteredMode: string|null}} cat.walking は、この tick で歩いて近づいたか（描画で歩く姿にする）
 */
export function tick(cat, day, personality, dt, rng) {
  if (cat.mode === 'lap') return { cat, day, enteredMode: null };

  const prevMode = cat.mode;
  let c = { ...cat, walking: false };
  let d = { ...day, timeLeft: Math.max(0, day.timeLeft - dt) };

  d.wariness = Math.max(0, d.wariness - RULES.warinessDecayPerSec * dt);
  const calm = d.wariness < RULES.calmThreshold;

  if (d.boxLockLeft > 0) {
    d.boxLockLeft = Math.max(0, d.boxLockLeft - dt);
    c.mode = 'inBox';
    if (d.boxLockLeft === 0) c = pickNextMode(c, d, personality, rng);
  } else {
    // 移動はこの tick の信頼増加より先に、tick 開始時点の信頼で下限を決める
    if (calm && WALK_MODES.includes(c.mode)) {
      const floor = distanceFloor(d.trust, d.floorBonus);
      if (c.distance > floor) {
        c.distance = Math.max(floor, c.distance - personality.approachSpeed * d.approachMul * dt);
        c.walking = true;
      }
    }

    c.modeTimeLeft -= dt;
    if (c.modeTimeLeft <= 0) {
      if (c.mode === 'rub') c.distance = clamp(c.distance + RULES.rubIgnoredDistance);
      c = pickNextMode(c, d, personality, rng);
    }
  }

  let gain = 0;
  if (calm) gain += RULES.calmTrustPerSec * dt;
  if (prevMode === 'backTurn') gain += RULES.backTurnTrustPerSec * dt;
  d.trust = clamp(d.trust + gain * d.trustRate);

  if (d.canLap && d.trust >= MAX_VALUE && c.distance <= 0 && c.mode !== 'inBox') {
    c.mode = 'lap';
  }

  return { cat: c, day: d, enteredMode: c.mode !== prevMode ? c.mode : null };
}

// 信頼に応じて、猫がそれ以上近づかない距離。bonus はおやつの日などに、いつもより近くまで来る分
export function distanceFloor(trust, bonus = 0) {
  return Math.max(0, MAX_VALUE - trust - RULES.distanceFloorOffset - bonus);
}

const NEAR_ONLY = ['rub', 'fakeRub'];

function pickNextMode(cat, day, personality, rng) {
  const candidates = day.signs.filter((s) => !NEAR_ONLY.includes(s) || cat.distance <= RULES.rubMaxDistance);
  const weights = candidates.map((s) => {
    const w = personality.signWeights[s] ?? 1;
    return s === 'tailFlick' ? w * (1 + day.wariness / RULES.tailFlickWarinessScale) : w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  let mode = candidates[candidates.length - 1];
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r < 0) {
      mode = candidates[i];
      break;
    }
  }
  const [min, max] = RULES.modeSec[mode];
  return { ...cat, mode, modeTimeLeft: min + (max - min) * rng() };
}
