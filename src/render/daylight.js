// 時間帯の景色：窓の外の空・太陽（夜は月）・部屋にかける薄い色・床の日だまり・スタンドライトの明るさ。
// 昼は 朝 → 昼 → 夕方 となめらかに変わり、夜は夜の景色（夜の画面）。区切りは src/data/params.js の DAYLIGHT
import { DAYLIGHT } from '../data/params.js';

// 窓の中の座標（窓は x -4〜236・y 84〜338、空は y 250 まで。src/render/renderer.js の drawRoom）
const LOOKS = {
  morning: {
    skyTop: '#bfe0f2', skyBottom: '#fde3cf', hill: '#a9cfa0', cloud: 0.4,
    tint: { color: '#ffd9b0', alpha: 0.06 },
    sun: { x: 66, y: 172, color: '#fff3c4' },
    patch: { alpha: 0.22, color: '#fff1c9', length: 150, skew: 70 },
  },
  noon: {
    skyTop: '#8fcdf0', skyBottom: '#d4eefa', hill: '#9cc98f', cloud: 0.9,
    tint: { color: '#ffffff', alpha: 0 },
    sun: { x: 112, y: 100, color: '#fffbe0' },
    patch: { alpha: 0.18, color: '#fff6d8', length: 70, skew: 10 },
  },
  // 昼から夕方へ移る途中：空の下のほうから先に色づく（青と橙をそのまま混ぜると灰色ににごるため）
  golden: {
    skyTop: '#a8c4e6', skyBottom: '#ffd6a0', hill: '#b5b98a', cloud: 0.6,
    tint: { color: '#ffc890', alpha: 0.06 },
    sun: { x: 132, y: 140, color: '#ffe9a8' },
    patch: { alpha: 0.22, color: '#ffe2a8', length: 110, skew: -30 },
  },
  evening: {
    skyTop: '#e58d86', skyBottom: '#ffc27a', hill: '#c98a7a', cloud: 0.3,
    tint: { color: '#ff9d5c', alpha: 0.12 },
    sun: { x: 146, y: 176, color: '#ffd27a' },
    patch: { alpha: 0.24, color: '#ffbd80', length: 170, skew: -80 },
  },
};
const NIGHT_LOOK = {
  phase: 'night', skyTop: '#1f2448', skyBottom: '#3a3f6e', hill: '#2a2f50', cloud: 0,
  tint: { color: '#2a2850', alpha: 0 },
  sun: { x: 132, y: 104, kind: 'moon', color: '#fdf6d8' },
  patch: { alpha: 0, color: '#000000', length: 0, skew: 0 },
  lamp: 1,
};
// 夕方になったときのスタンドライトの明るさ（夜は 1）
const EVENING_LAMP = 0.6;

const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
// 色 '#rrggbb' を混ぜる・半透明にする（src/render/renderer.js の部屋の描画でも使う）
export const mixColor = (a, b, u) => toHex(toRgb(a).map((v, i) => lerp(v, toRgb(b)[i], u)));
export const rgba = (hex, alpha) => `rgba(${toRgb(hex).join(', ')}, ${alpha.toFixed(3)})`;

function mix(a, b, u) {
  return {
    skyTop: mixColor(a.skyTop, b.skyTop, u),
    skyBottom: mixColor(a.skyBottom, b.skyBottom, u),
    hill: mixColor(a.hill, b.hill, u),
    cloud: lerp(a.cloud, b.cloud, u),
    tint: { color: mixColor(a.tint.color, b.tint.color, u), alpha: lerp(a.tint.alpha, b.tint.alpha, u) },
    sun: { x: lerp(a.sun.x, b.sun.x, u), y: lerp(a.sun.y, b.sun.y, u), kind: 'sun', color: mixColor(a.sun.color, b.sun.color, u) },
    patch: {
      alpha: lerp(a.patch.alpha, b.patch.alpha, u),
      color: mixColor(a.patch.color, b.patch.color, u),
      length: lerp(a.patch.length, b.patch.length, u),
      skew: lerp(a.patch.skew, b.patch.skew, u),
    },
  };
}

/**
 * progress: 昼の進み具合 0〜1（0 = 朝、1 = 昼の終わり）。night: 夜の画面なら true
 * 返り値 { phase, skyTop, skyBottom, hill, cloud, tint {color, alpha}, lamp, sun {x, y, kind, color}, patch {alpha, color, length, skew} }
 */
export function daylightAt(progress, night = false) {
  if (night) return NIGHT_LOOK;
  const p = clamp01(progress);
  const { noonAt, eveningFrom, eveningAt } = DAYLIGHT;
  if (p < noonAt) {
    const u = p / noonAt;
    return { phase: u < 0.5 ? 'morning' : 'noon', lamp: 0, ...mix(LOOKS.morning, LOOKS.noon, u) };
  }
  // eveningFrom までは昼のまま（u = 0）。途中で golden を通って夕方になる
  const u = clamp01((p - eveningFrom) / (eveningAt - eveningFrom));
  const look = u < 0.5 ? mix(LOOKS.noon, LOOKS.golden, u * 2) : mix(LOOKS.golden, LOOKS.evening, u * 2 - 1);
  return { phase: u < 0.5 ? 'noon' : 'evening', lamp: EVENING_LAMP * u, ...look };
}
