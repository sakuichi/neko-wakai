import { DAYS } from '../src/data/params.js';

export function makeDay(overrides = {}) {
  const base = DAYS[2]; // 3日目：全サイン・膝あり
  return {
    dayNumber: base.day,
    trust: 50,
    wariness: 50,
    timeLeft: base.durationSec,
    trustRate: 1,
    boxLockLeft: 0,
    mistakes: 0,
    actions: base.actions,
    signs: base.signs,
    canLap: base.canLap,
    approachMul: base.approachMul,
    ...overrides,
  };
}

export function makeCat(overrides = {}) {
  return { mode: 'relax', distance: 50, modeTimeLeft: 3, ...overrides };
}

// 常に同じ値を返す乱数（テストで結果を固定するため）
export function fixedRng(value = 0.5) {
  return () => value;
}
