// ゲームの数値はすべてここに置く。調整はこのファイルだけで行う。
// 値の意味は docs/spec.md の 4〜9章を参照。

export const MAX_VALUE = 100;
export const MAX_DAY = 7;

export const RULES = {
  // 待っている間、警戒は1秒ごとにこれだけ下がる
  warinessDecayPerSec: 5,
  // 警戒がこれ未満のとき、猫は近づき、落ち着いて一緒にいる分だけ信頼が増える
  calmThreshold: 30,
  calmTrustPerSec: 0.35,
  // 背中を向けて座っている間、1秒ごとに増える信頼
  backTurnTrustPerSec: 1.5,

  // 距離の下限は「100 − 信頼 − この値」。信頼が低くても、ある程度までは近づいてくる
  distanceFloorOffset: 30,

  // missWariness: 目が合っていないのにゆっくりまばたきしたときの警戒（連打対策）
  blink: { minHoldMs: 500, maxHoldMs: 2000, trust: 6, missWariness: 8 },

  pet: {
    rubTrust: 10,
    tailUpTrust: 5,
    tailUpReach: 40,
    relaxWariness: 20,
    tailFlickWariness: 30,
    bellyWariness: 40,
    fakeRubWariness: 30,
  },

  // すり寄り（とそのフェイント）は、この距離以下でしか出ない
  rubMaxDistance: 30,
  // すり寄りを放っておくと、猫はこれだけ離れる
  rubIgnoredDistance: 10,

  fleeDistance: 25,
  fleeSec: 1,
  purrSec: 2,

  // 猫の様子ごとの継続時間 [最短, 最長] 秒
  modeSec: {
    relax: [3, 5],
    look: [2.5, 3],
    tailUp: [2, 3],
    tailFlick: [2, 3],
    belly: [2, 3],
    backTurn: [3, 4],
    rub: [2, 2],
    fakeRub: [2, 2],
  },
  // 不機嫌なほど、しっぽパタパタが出やすくなる（重み × (1 + 警戒 / この値)）
  tailFlickWarinessScale: 50,
};

const DAY3_SIGNS = ['relax', 'look', 'tailUp', 'tailFlick', 'belly', 'backTurn', 'rub'];
// 4日目からは、すり寄りに見せかけたフェイントが加わる
const LATE_SIGNS = [...DAY3_SIGNS, 'fakeRub'];

export const DAYS = [
  { day: 1, durationSec: 40, startWariness: 35, actions: ['pet'], signs: ['relax'], canLap: false, approachMul: 1 },
  { day: 2, durationSec: 40, startWariness: 45, actions: ['pet', 'blink'], signs: ['relax', 'look', 'tailUp', 'tailFlick'], canLap: false, approachMul: 1 },
  { day: 3, durationSec: 40, startWariness: 40, actions: ['pet', 'blink'], signs: DAY3_SIGNS, canLap: true, approachMul: 1 },
  { day: 4, durationSec: 40, startWariness: 40, actions: ['pet', 'blink'], signs: LATE_SIGNS, canLap: true, approachMul: 1 },
  { day: 5, durationSec: 40, startWariness: 40, actions: ['pet', 'blink'], signs: LATE_SIGNS, canLap: true, approachMul: 1 },
  { day: 6, durationSec: 40, startWariness: 40, actions: ['pet', 'blink'], signs: LATE_SIGNS, canLap: true, approachMul: 1 },
  { day: 7, durationSec: 45, startWariness: 30, actions: ['pet', 'blink'], signs: LATE_SIGNS, canLap: true, approachMul: 1.5 },
];

// 昼の景色の時間帯（昼の進み具合 0〜1 で）。0〜noonAt で朝→昼、eveningFrom〜eveningAt で昼→夕方に変わる。
// 40秒の日なら、8秒で昼になり、残り14秒から夕焼けが始まり、残り8秒で夕方になる（色は src/render/daylight.js）
export const DAYLIGHT = { noonAt: 0.2, eveningFrom: 0.65, eveningAt: 0.8 };

export const NIGHT = {
  // おやつを置くと、その場で信頼が増える。代わりに翌日の信頼の増え方が下がる
  treatTrust: 8,
  treatTrustRate: 0.85,
  // おやつの翌日の、開始時の警戒（落ち着きの境目より低いので、すぐ動き出す）
  treatStartWariness: 0,
  // おやつの日は、距離の下限がこれだけ近くなる
  treatFloorBonus: 20,
  nothingTrust: 5,
};

// approachSpeed：くつろぎで歩いている間に、1秒で近づく距離（座っている間は近づかない）
export const PERSONALITIES = {
  amaenbo: {
    label: '甘えん坊',
    approachSpeed: 16,
    warinessMul: 0.7,
    treatDistance: 30,
    boxLockSec: 5,
    signWeights: { relax: 3, look: 2, tailUp: 2, tailFlick: 1, belly: 1, backTurn: 1, rub: 3, fakeRub: 1 },
  },
  tsundere: {
    label: 'ツンデレ',
    approachSpeed: 10,
    warinessMul: 1.0,
    treatDistance: 10,
    boxLockSec: 5,
    signWeights: { relax: 3, look: 2, tailUp: 1, tailFlick: 1, belly: 3, backTurn: 1, rub: 1, fakeRub: 2 },
  },
  bibiri: {
    label: 'ビビり',
    approachSpeed: 8,
    warinessMul: 1.3,
    treatDistance: 20,
    boxLockSec: 3,
    signWeights: { relax: 3, look: 2, tailUp: 1, tailFlick: 2.5, belly: 1, backTurn: 1, rub: 1, fakeRub: 1 },
  },
};

export const DEFAULT_PERSONALITY = 'tsundere';

// 毛色と性格の対応。「茶トラは甘えん坊」など、よく言われる柄と性格の話に合わせる（言い伝えは src/data/texts.js の COAT_LORE）
// 毛色のキーは src/render/renderer.js の COATS
export const COAT_PERSONALITY = {
  chatora: 'amaenbo',
  cream: 'amaenbo',
  shiro: 'tsundere',
  sabatora: 'tsundere',
  kijitora: 'bibiri',
  kuro: 'bibiri',
};
