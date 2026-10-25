import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tick } from '../src/game/catBrain.js';
import { RULES, PERSONALITIES, DAYS } from '../src/data/params.js';
import { createRng } from '../src/util/rng.js';
import { makeDay, makeCat, fixedRng } from './helpers.js';

const tsundere = PERSONALITIES.tsundere;
const rng = fixedRng();

test('時間が経つと残り時間が減る', () => {
  const r = tick(makeCat(), makeDay({ timeLeft: 10 }), tsundere, 1, rng);
  assert.equal(r.day.timeLeft, 9);
});

test('待っている間、警戒は1秒ごとに決まった量だけ下がる', () => {
  const r = tick(makeCat(), makeDay({ wariness: 50 }), tsundere, 1, rng);
  assert.equal(r.day.wariness, 50 - RULES.warinessDecayPerSec);
});

test('警戒が十分低いと猫は近づいてくる', () => {
  const r = tick(makeCat({ distance: 80 }), makeDay({ trust: 50, wariness: 0 }), tsundere, 1, rng);
  assert.equal(r.cat.distance, 80 - tsundere.approachSpeed);
});

test('警戒が高いうちは近づかない', () => {
  const r = tick(makeCat({ distance: 80 }), makeDay({ trust: 50, wariness: 90 }), tsundere, 1, rng);
  assert.equal(r.cat.distance, 80);
});

test('信頼が低いと、距離の下限（100 − 信頼 − 余裕分）より近くには来ない', () => {
  const floor = 100 - 40 - RULES.distanceFloorOffset;
  const r = tick(makeCat({ distance: floor + 2 }), makeDay({ trust: 40, wariness: 0 }), tsundere, 1, rng);
  assert.equal(r.cat.distance, floor);
});

test('近づく速さに日ごとの倍率がかかる（7日目）', () => {
  const r = tick(makeCat({ distance: 80 }), makeDay({ trust: 50, wariness: 0, approachMul: 1.5 }), tsundere, 1, rng);
  assert.equal(r.cat.distance, 80 - tsundere.approachSpeed * 1.5);
});

test('落ち着いている（警戒が低い）間は、少しずつ信頼が増える', () => {
  const r = tick(makeCat(), makeDay({ trust: 10, wariness: 0 }), tsundere, 1, rng);
  assert.equal(r.day.trust, 10 + RULES.calmTrustPerSec);
});

test('背中を向けて座っている間に待つと、信頼が増える', () => {
  const r = tick(makeCat({ mode: 'backTurn', modeTimeLeft: 3 }), makeDay({ trust: 10, wariness: 90 }), tsundere, 1, rng);
  assert.equal(r.day.trust, 10 + RULES.backTurnTrustPerSec);
});

test('箱から出られない間は、箱の中で動かない', () => {
  const r = tick(makeCat({ mode: 'inBox', distance: 70 }), makeDay({ trust: 50, wariness: 0, boxLockLeft: 3 }), tsundere, 1, rng);
  assert.equal(r.cat.mode, 'inBox');
  assert.equal(r.cat.distance, 70);
  assert.equal(r.day.boxLockLeft, 2);
});

test('箱の時間が終わると、箱から出てくる', () => {
  const r = tick(makeCat({ mode: 'inBox', distance: 70 }), makeDay({ boxLockLeft: 0.5 }), tsundere, 1, rng);
  assert.notEqual(r.cat.mode, 'inBox');
  assert.equal(r.day.boxLockLeft, 0);
  assert.equal(r.enteredMode, r.cat.mode);
});

test('様子が切り替わるのは時間切れのときで、そのとき enteredMode が返る', () => {
  const stay = tick(makeCat({ mode: 'relax', modeTimeLeft: 3 }), makeDay(), tsundere, 1, rng);
  assert.equal(stay.cat.mode, 'relax');
  assert.equal(stay.enteredMode, null);
});

test('その日に出てよいサインしか出ない', () => {
  const r = createRng(1);
  for (const dayDef of DAYS.slice(0, 2)) {
    let cat = makeCat({ distance: 10, modeTimeLeft: 0 });
    let day = makeDay({ trust: 95, wariness: 0, signs: dayDef.signs, canLap: dayDef.canLap });
    for (let i = 0; i < 500; i++) {
      ({ cat, day } = tick(cat, day, tsundere, 0.5, r));
      day = { ...day, timeLeft: 30 };
      assert.ok(dayDef.signs.includes(cat.mode), `${dayDef.day}日目に ${cat.mode} が出た`);
    }
  }
});

test('すり寄りは、猫が近くにいないときは出ない', () => {
  const r = createRng(2);
  for (let i = 0; i < 300; i++) {
    const res = tick(makeCat({ distance: RULES.rubMaxDistance + 10, modeTimeLeft: 0 }), makeDay({ wariness: 90 }), tsundere, 0.1, r);
    assert.notEqual(res.cat.mode, 'rub');
  }
});

test('フェイントも、猫が近くにいないときは出ない', () => {
  const r = createRng(3);
  const day = makeDay({ wariness: 90, signs: DAYS[3].signs });
  for (let i = 0; i < 300; i++) {
    const res = tick(makeCat({ distance: RULES.rubMaxDistance + 10, modeTimeLeft: 0 }), day, tsundere, 0.1, r);
    assert.notEqual(res.cat.mode, 'fakeRub');
  }
});

test('すり寄りを放っておくと、猫は少し離れる', () => {
  const r = tick(makeCat({ mode: 'rub', distance: 20, modeTimeLeft: 0.5 }), makeDay({ wariness: 90 }), tsundere, 1, rng);
  assert.equal(r.cat.distance, 20 + RULES.rubIgnoredDistance);
});

test('逃げている間は近づいてこない', () => {
  const r = tick(makeCat({ mode: 'flee', distance: 50, modeTimeLeft: 1 }), makeDay({ trust: 80, wariness: 0 }), tsundere, 0.5, rng);
  assert.equal(r.cat.distance, 50);
});

test('3日目以降、信頼100で距離0になったら膝に乗る', () => {
  const r = tick(makeCat({ distance: 2 }), makeDay({ trust: 100, wariness: 0, canLap: true }), tsundere, 1, rng);
  assert.equal(r.cat.mode, 'lap');
  assert.equal(r.enteredMode, 'lap');
});

test('膝に乗れない日（1・2日目）は、条件を満たしても膝に乗らない', () => {
  const r = tick(makeCat({ distance: 2 }), makeDay({ trust: 100, wariness: 0, canLap: false, signs: DAYS[1].signs }), tsundere, 1, rng);
  assert.notEqual(r.cat.mode, 'lap');
});

test('入力の状態オブジェクトを書き換えない', () => {
  const cat = makeCat({ modeTimeLeft: 0 });
  const day = makeDay();
  const catCopy = structuredClone(cat);
  const dayCopy = structuredClone(day);
  tick(cat, day, tsundere, 1, rng);
  assert.deepEqual(cat, catCopy);
  assert.deepEqual(day, dayCopy);
});

test('座っている様子（見つめる・しっぽピンなど）の間は、その場から動かない', () => {
  for (const mode of ['look', 'tailUp', 'tailFlick', 'backTurn', 'rub', 'fakeRub']) {
    const r = tick(makeCat({ mode, distance: 80, modeTimeLeft: 3 }), makeDay({ trust: 50, wariness: 0 }), tsundere, 1, rng);
    assert.equal(r.cat.distance, 80, mode);
    assert.equal(r.cat.walking, false, mode);
  }
});

test('くつろぎで近づいている間は歩いている（walking）', () => {
  const r = tick(makeCat({ distance: 80 }), makeDay({ trust: 50, wariness: 0 }), tsundere, 0.5, rng);
  assert.ok(r.cat.distance < 80);
  assert.equal(r.cat.walking, true);
});

test('くつろぎでも、それ以上近づけない（距離の下限）ときや、警戒しているときは歩かずに座っている', () => {
  const floor = 100 - 50 - RULES.distanceFloorOffset;
  const atFloor = tick(makeCat({ distance: floor }), makeDay({ trust: 50, wariness: 0 }), tsundere, 0.5, rng);
  assert.equal(atFloor.cat.walking, false);
  const wary = tick(makeCat({ distance: 80 }), makeDay({ trust: 50, wariness: 90 }), tsundere, 0.5, rng);
  assert.equal(wary.cat.walking, false);
});
