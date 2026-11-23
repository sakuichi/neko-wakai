import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startDay, finishDay, chooseNight, endingFor, chooseCat } from '../src/game/progression.js';
import { DAYS, NIGHT, PERSONALITIES, MAX_DAY, MAX_VALUE, RULES, COAT_PERSONALITY } from '../src/data/params.js';
import { COATS } from '../src/render/renderer.js';
import { COAT_LABELS } from '../src/data/texts.js';
import { tick } from '../src/game/catBrain.js';

test('新しいゲームは1日目・信頼0・ミス0から始まる', () => {
  const g = createGame({ personality: 'bibiri', seed: 1 });
  assert.equal(g.day, 1);
  assert.equal(g.trust, 0);
  assert.equal(g.mistakes, 0);
  assert.equal(g.personality, 'bibiri');
  assert.equal(g.nightChoice, null);
});

test('1日目の初期状態：部屋の隅から、その日の警戒で始まる', () => {
  const { day, cat, newActions } = startDay(createGame({ personality: 'tsundere', seed: 1 }));
  assert.equal(day.dayNumber, 1);
  assert.equal(day.wariness, DAYS[0].startWariness);
  assert.equal(day.timeLeft, DAYS[0].durationSec);
  assert.equal(day.canLap, false);
  assert.deepEqual(day.actions, DAYS[0].actions);
  assert.deepEqual(day.signs, DAYS[0].signs);
  assert.equal(cat.distance, 100);
  assert.deepEqual(newActions, ['pet']);
});

test('2日目に、まばたきが新しく使えるようになる', () => {
  let g = createGame({ personality: 'tsundere', seed: 1 });
  g = chooseNight(g, 'nothing');
  const { newActions } = startDay(g);
  assert.deepEqual(newActions, ['blink']);
});

test('フェイントは4日目から出てくる（3日目までは出ない）', () => {
  for (const d of DAYS) {
    assert.equal(d.signs.includes('fakeRub'), d.day >= 4, `${d.day}日目`);
  }
});

test('前日の信頼が、翌日に引き継がれる', () => {
  let g = createGame({ personality: 'tsundere', seed: 1 });
  ({ game: g } = finishDay(g, { lapped: false, trust: 33, mistakes: 2 }));
  assert.equal(g.trust, 33);
  assert.equal(g.mistakes, 2);
  g = chooseNight(g, 'box');
  const { day } = startDay(g);
  assert.equal(day.trust, 33);
});

test('夜「おやつを置く」：翌日は近くから始まるが、信頼の増え方が下がる', () => {
  for (const key of Object.keys(PERSONALITIES)) {
    const g = chooseNight(createGame({ personality: key, seed: 1 }), 'treat');
    const { day, cat } = startDay(g);
    assert.equal(cat.distance, 100 - PERSONALITIES[key].treatDistance, key);
    // 翌日（2日目）の増え方は、おやつの倍率 × その日の倍率（trustMul）
    assert.equal(day.trustRate, NIGHT.treatTrustRate * (DAYS[1].trustMul ?? 1), key);
    // おやつなしの同じ日より、増え方が下がる
    const plainDay = startDay(chooseNight(createGame({ personality: key, seed: 1 }), 'nothing')).day;
    assert.ok(day.trustRate < plainDay.trustRate, `${key}: おやつの翌日 ${day.trustRate}・おやつなし ${plainDay.trustRate}`);
  }
});

test('夜「おやつを置く」：翌日は猫が最初から落ち着いていて、すぐ近づき始める', () => {
  for (const key of Object.keys(PERSONALITIES)) {
    const g = chooseNight(createGame({ personality: key, seed: 1 }), 'treat');
    const { day, cat } = startDay(g);
    assert.ok(day.wariness < RULES.calmThreshold, key);
    const r = tick(cat, day, PERSONALITIES[key], 1, () => 0.5);
    assert.ok(r.cat.distance < cat.distance, key);
  }
});

test('夜「おやつを置く」：その場で信頼が増える（100は超えない）', () => {
  const g = chooseNight({ ...createGame({ personality: 'tsundere', seed: 1 }), trust: 10 }, 'treat');
  assert.ok(NIGHT.treatTrust > 0);
  assert.equal(g.trust, 10 + NIGHT.treatTrust);
  const full = chooseNight({ ...createGame({ personality: 'tsundere', seed: 1 }), trust: 98 }, 'treat');
  assert.equal(full.trust, 100);
});

test('夜「段ボール箱を置く」：翌日は警戒0で、しばらく箱から出てこない', () => {
  for (const key of Object.keys(PERSONALITIES)) {
    const g = chooseNight(createGame({ personality: key, seed: 1 }), 'box');
    const { day, cat } = startDay(g);
    assert.equal(day.wariness, 0, key);
    assert.equal(day.boxLockLeft, PERSONALITIES[key].boxLockSec, key);
    assert.equal(cat.mode, 'inBox', key);
    // 翌日（2日目）の増え方は、その日の倍率（trustMul）のまま
    assert.equal(day.trustRate, DAYS[1].trustMul ?? 1, key);
  }
});

test('夜「何もしない」：その場で信頼が少し増え、翌日は部屋の隅から', () => {
  const g = chooseNight({ ...createGame({ personality: 'tsundere', seed: 1 }), trust: 10 }, 'nothing');
  assert.equal(g.trust, 10 + NIGHT.nothingTrust);
  assert.equal(g.day, 2);
  const { day, cat } = startDay(g);
  assert.equal(cat.distance, 100);
  // 翌日（2日目）の増え方は、その日の倍率（trustMul）のまま
  assert.equal(day.trustRate, DAYS[1].trustMul ?? 1);
  assert.equal(day.boxLockLeft, 0);
});

test('「何もしない」でも信頼は100を超えない', () => {
  const g = chooseNight({ ...createGame({ personality: 'tsundere', seed: 1 }), trust: 98 }, 'nothing');
  assert.equal(g.trust, 100);
});

test('膝に乗らずに一日が終わったら夜へ', () => {
  const r = finishDay(createGame({ personality: 'tsundere', seed: 1 }), { lapped: false, trust: 10, mistakes: 0 });
  assert.equal(r.next, 'night');
  assert.equal(r.endingId, null);
});

test('膝に乗ったら、その日でエンディングへ', () => {
  const g = { ...createGame({ personality: 'tsundere', seed: 1 }), day: 4 };
  const r = finishDay(g, { lapped: true, trust: 100, mistakes: 0 });
  assert.equal(r.next, 'ending');
  assert.equal(r.endingId, 'patient');
});

test('7日目が終わっても膝に乗らなければ「通い猫」エンディング', () => {
  const g = { ...createGame({ personality: 'tsundere', seed: 1 }), day: MAX_DAY };
  const r = finishDay(g, { lapped: false, trust: 80, mistakes: 3 });
  assert.equal(r.next, 'ending');
  assert.equal(r.endingId, 'visitor');
});

test('エンディングは和解した日で決まる', () => {
  assert.equal(endingFor(3, true), 'fate');
  assert.equal(endingFor(4, true), 'patient');
  assert.equal(endingFor(5, true), 'patient');
  assert.equal(endingFor(6, true), 'persistent');
  assert.equal(endingFor(7, true), 'persistent');
  assert.equal(endingFor(7, false), 'visitor');
});

test('どの毛色にも性格が1つ決まっていて、どの性格にも毛色が1つ以上ある', () => {
  assert.deepEqual(Object.keys(COAT_PERSONALITY).sort(), Object.keys(COATS).sort());
  assert.deepEqual(Object.keys(COAT_LABELS).sort(), Object.keys(COATS).sort());
  for (const [coat, p] of Object.entries(COAT_PERSONALITY)) assert.ok(PERSONALITIES[p], coat);
  for (const p of Object.keys(PERSONALITIES)) assert.ok(Object.values(COAT_PERSONALITY).includes(p), p);
});

test('猫を選ぶと、毛色に合った性格になり、どの性格も同じくらい出る', () => {
  const count = {};
  const N = 300;
  for (let i = 0; i < N; i++) {
    // 0〜1 をまんべんなく使う乱数の代わり
    let n = 0;
    const random = () => ((i * 7 + n++ * 13) % N) / N;
    const { personality, coat } = chooseCat({}, random);
    assert.equal(COAT_PERSONALITY[coat], personality, coat);
    count[personality] = (count[personality] ?? 0) + 1;
  }
  for (const p of Object.keys(PERSONALITIES)) assert.ok(count[p] >= N / 3 - 10 && count[p] <= N / 3 + 10, `${p}: ${count[p]}`);
});

test('デバッグで毛色だけ決めたら、その毛色の性格になる', () => {
  for (const coat of Object.keys(COAT_PERSONALITY)) {
    assert.deepEqual(chooseCat({ coat }, () => 0.5), { coat, personality: COAT_PERSONALITY[coat] });
  }
});

test('デバッグで性格だけ決めたら、その性格の毛色から選ぶ', () => {
  for (const personality of Object.keys(PERSONALITIES)) {
    for (const r of [0, 0.5, 0.99]) {
      const cat = chooseCat({ personality }, () => r);
      assert.equal(cat.personality, personality);
      assert.equal(COAT_PERSONALITY[cat.coat], personality);
    }
  }
});

test('デバッグで性格と毛色の両方を決めたら、組み合わせが違っていてもそのまま使う', () => {
  assert.deepEqual(chooseCat({ personality: 'bibiri', coat: 'chatora' }, () => 0.5), { personality: 'bibiri', coat: 'chatora' });
});

// ---------------------------------------------------------------- 猫の顔

// いつも同じ値を返す乱数
const sameRng = (v) => () => v;

// FACES・chooseFace がまだなくても読み込みが止まらないように、テストの中で読み込む
async function loadFaces() {
  const { FACES } = await import('../src/data/params.js');
  const P = await import('../src/game/progression.js');
  assert.ok(FACES, 'params.js に FACES がない');
  assert.equal(typeof P.chooseFace, 'function', 'chooseFace がない');
  return { FACES, chooseFace: P.chooseFace };
}

test('顔の種類は、輪郭4種（mochi・maru・shimobukure・hoppe）と耳3種（small・normal・big）', async () => {
  const { FACES } = await import('../src/data/params.js');
  assert.deepEqual(FACES, { shapes: ['mochi', 'maru', 'shimobukure', 'hoppe'], ears: ['small', 'normal', 'big'] });
});

test('猫の顔を選ぶと、輪郭と耳は決まった種類の中から選ばれ、乱数しだいで全種類が出る', async () => {
  const { FACES, chooseFace } = await loadFaces();
  const shapes = new Set();
  const ears = new Set();
  // 0〜1 を細かく刻んだ乱数（輪郭と耳で別の値になるよう、呼ばれるたびに進める）
  for (let i = 0; i < 200; i++) {
    let n = 0;
    const random = () => ((i * 0.37 + n++ * 0.61) % 1);
    const face = chooseFace({}, random);
    assert.ok(FACES.shapes.includes(face.shape), `shape ${face.shape}`);
    assert.ok(FACES.ears.includes(face.ears), `ears ${face.ears}`);
    shapes.add(face.shape);
    ears.add(face.ears);
  }
  assert.deepEqual([...shapes].sort(), [...FACES.shapes].sort());
  assert.deepEqual([...ears].sort(), [...FACES.ears].sort());
  // 乱数がいつも同じなら、同じ顔
  assert.deepEqual(chooseFace({}, sameRng(0)), chooseFace({}, sameRng(0)));
});

test('デバッグで顔を決めたら、そのとおりになる（片方だけ決めたら、もう片方は選ぶ）', async () => {
  const { FACES, chooseFace } = await loadFaces();
  for (const shape of FACES.shapes) {
    for (const ears of FACES.ears) {
      for (const r of [0, 0.5, 0.99]) assert.deepEqual(chooseFace({ shape, ears }, sameRng(r)), { shape, ears });
    }
  }
  const onlyShape = chooseFace({ shape: 'onigiri' }, sameRng(0.5));
  assert.equal(onlyShape.shape, 'onigiri');
  assert.ok(FACES.ears.includes(onlyShape.ears));
  const onlyEars = chooseFace({ ears: 'big' }, sameRng(0.5));
  assert.equal(onlyEars.ears, 'big');
  assert.ok(FACES.shapes.includes(onlyEars.shape));
});

test('新しいゲームに顔を渡すと GameState.face に入り、省略したら mochi・normal', () => {
  const face = { shape: 'hoppe', ears: 'small' };
  assert.deepEqual(createGame({ personality: 'bibiri', seed: 1, coat: 'kuro', face }).face, face);
  assert.deepEqual(createGame({ personality: 'bibiri', seed: 1 }).face, { shape: 'mochi', ears: 'normal' });
  assert.deepEqual(createGame().face, { shape: 'mochi', ears: 'normal' });
});

// ---------------------------------------------------------------- 一度デレた・手が平気になったら、日をまたいでも覚えておく（dere・handsOk）

test('新しいゲームは、まだデレていない（dere: false）・手も平気になっていない（handsOk: false）', () => {
  for (const key of Object.keys(PERSONALITIES)) {
    const g = createGame({ personality: key, seed: 1 });
    assert.equal(g.dere, false, `${key}: dere`);
    assert.equal(g.handsOk, false, `${key}: handsOk`);
  }
});

test('その日の初期状態の dere：ツンデレは、信頼 shyUntil 未満でまだデレていなければ false、前にデレていたら true、信頼 shyUntil 以上なら true', () => {
  const S = PERSONALITIES.tsundere.shyUntil;
  assert.ok(S > 0, `ツンデレの shyUntil ${S} は 0 より大きい`);
  const base = createGame({ personality: 'tsundere', seed: 1 });
  assert.equal(startDay({ ...base, trust: S - 1, dere: false }).day.dere, false, '信頼 shyUntil−1・まだデレていない');
  assert.equal(startDay({ ...base, trust: 0, dere: false }).day.dere, false, '信頼 0・まだデレていない');
  assert.equal(startDay({ ...base, trust: S - 1, dere: true }).day.dere, true, '信頼 shyUntil−1・前にデレた');
  assert.equal(startDay({ ...base, trust: 0, dere: true }).day.dere, true, '信頼 0・前にデレた');
  assert.equal(startDay({ ...base, trust: S, dere: false }).day.dere, true, '信頼 shyUntil・まだデレていない');
});

test('その日の初期状態の handsOk：ビビりは、信頼 timidUntil 未満でまだ平気になっていなければ false、前に平気になっていたら true、信頼 timidUntil 以上なら true', () => {
  const T = PERSONALITIES.bibiri.timidUntil;
  assert.ok(T > 0, `ビビりの timidUntil ${T} は 0 より大きい`);
  const base = createGame({ personality: 'bibiri', seed: 1 });
  assert.equal(startDay({ ...base, trust: T - 1, handsOk: false }).day.handsOk, false, '信頼 timidUntil−1・まだ平気でない');
  assert.equal(startDay({ ...base, trust: 0, handsOk: false }).day.handsOk, false, '信頼 0・まだ平気でない');
  assert.equal(startDay({ ...base, trust: T - 1, handsOk: true }).day.handsOk, true, '信頼 timidUntil−1・前に平気になった');
  assert.equal(startDay({ ...base, trust: 0, handsOk: true }).day.handsOk, true, '信頼 0・前に平気になった');
  assert.equal(startDay({ ...base, trust: T, handsOk: false }).day.handsOk, true, '信頼 timidUntil・まだ平気でない');
});

test('その日の初期状態：甘えん坊（ツンも手のこわさもない）は、信頼 0 でも dere・handsOk とも true', () => {
  const { day } = startDay(createGame({ personality: 'amaenbo', seed: 1 }));
  assert.equal(day.dere, true);
  assert.equal(day.handsOk, true);
});

test('一日の終わりに、昼の結果の dere・handsOk を引き継ぐ。結果に無ければ、ゲームの値のまま', () => {
  const g0 = createGame({ personality: 'tsundere', seed: 1 });
  // その日にデレた・平気になった
  const { game: g1 } = finishDay({ ...g0, dere: false, handsOk: false }, { lapped: false, trust: 30, mistakes: 0, dere: true, handsOk: true });
  assert.equal(g1.dere, true, '結果の dere 真を引き継ぐ');
  assert.equal(g1.handsOk, true, '結果の handsOk 真を引き継ぐ');
  // 結果に dere・handsOk が無い：ゲームの値のまま
  const { game: g2 } = finishDay({ ...g0, dere: true, handsOk: true }, { lapped: false, trust: 30, mistakes: 0 });
  assert.equal(g2.dere, true, '結果に無い：ゲームの dere 真のまま');
  assert.equal(g2.handsOk, true, '結果に無い：ゲームの handsOk 真のまま');
  const { game: g3 } = finishDay({ ...g0, dere: false, handsOk: false }, { lapped: false, trust: 30, mistakes: 0 });
  assert.equal(g3.dere, false, '結果に無い：ゲームの dere 偽のまま');
  assert.equal(g3.handsOk, false, '結果に無い：ゲームの handsOk 偽のまま');
});

// ---------------------------------------------------------------- 日ごとの信頼の増え方（trustMul）と膝に乗る信頼（lapTrust）

test('startDay：1日目・2日目の day.trustRate は DAYS の trustMul、3〜7日目は 1（おやつの翌日でない日）', () => {
  for (const n of [1, 2]) {
    assert.equal(typeof DAYS[n - 1].trustMul, 'number', `${n}日目の DAYS に trustMul がない（このテストの前提）`);
    assert.notEqual(DAYS[n - 1].trustMul, 1, `${n}日目の trustMul が 1（このテストの前提）`);
  }
  for (let n = 1; n <= MAX_DAY; n++) {
    const { day } = startDay({ ...createGame({ personality: 'tsundere', seed: 1 }), day: n });
    const expected = n <= 2 ? DAYS[n - 1].trustMul : 1;
    assert.equal(day.trustRate, expected, `${n}日目`);
  }
});

test('startDay：2日目がおやつの翌日なら trustRate は NIGHT.treatTrustRate × 2日目の trustMul。3日目以降のおやつの翌日は NIGHT.treatTrustRate のまま', () => {
  for (let n = 2; n <= MAX_DAY; n++) {
    const g = chooseNight({ ...createGame({ personality: 'tsundere', seed: 1 }), day: n - 1 }, 'treat');
    assert.equal(g.day, n, `${n}日目（このテストの前提）`);
    const { day } = startDay(g);
    const expected = n === 2 ? NIGHT.treatTrustRate * DAYS[1].trustMul : NIGHT.treatTrustRate;
    assert.equal(day.trustRate, expected, `${n}日目`);
  }
});

test('startDay：3日目の day.lapTrust は DAYS[2].lapTrust（85）、それ以外の日は MAX_VALUE', () => {
  assert.equal(typeof DAYS[2].lapTrust, 'number', '3日目の DAYS に lapTrust がない（このテストの前提）');
  assert.ok(DAYS[2].lapTrust < MAX_VALUE, `3日目の lapTrust ${DAYS[2].lapTrust} が MAX_VALUE 未満でない（このテストの前提）`);
  for (let n = 1; n <= MAX_DAY; n++) {
    const { day } = startDay({ ...createGame({ personality: 'tsundere', seed: 1 }), day: n });
    assert.equal(day.lapTrust, n === 3 ? DAYS[2].lapTrust : MAX_VALUE, `${n}日目`);
  }
});

test('1日目：startDay の day を tick に通すと、落ち着いて一緒にいる間に増える信頼は calmTrustPerSec × trustMul × dt', () => {
  const { day, cat } = startDay(createGame({ personality: 'tsundere', seed: 1 }));
  assert.equal(day.dayNumber, 1, '1日目（このテストの前提）');
  // 警戒だけ 0 にして、落ち着いている状態にする（ほかは startDay のまま）
  const calm = { ...day, wariness: 0 };
  const dt = 0.5;
  const r = tick(cat, calm, PERSONALITIES.tsundere, dt, () => 0.5);
  assert.ok(r.day.wariness < RULES.calmThreshold, '落ち着いていない（このテストの前提）');
  assert.equal(r.cat.mode, cat.mode, '様子が変わった（このテストの前提）');
  const expected = day.trust + RULES.calmTrustPerSec * DAYS[0].trustMul * dt;
  assert.ok(Math.abs(r.day.trust - expected) < 1e-9, `信頼 ${r.day.trust}（期待 ${expected}）`);
});
