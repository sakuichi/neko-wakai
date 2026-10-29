import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tick, distanceFloor } from '../src/game/catBrain.js';
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
  // 下限まで余裕のある（歩き出す）位置から
  const r = tick(makeCat({ distance: floor + RULES.walkResumeGap + 2 }), makeDay({ trust: 40, wariness: 0 }), tsundere, 1, rng);
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

// ---------------------------------------------------------------- 下限に着いたら、足踏みせずに座る

const STEP = 0.05;
function walkGap() {
  assert.equal(typeof RULES.walkResumeGap, 'number', 'RULES.walkResumeGap がない');
  return RULES.walkResumeGap;
}
// 下限に着いて座っている、くつろぎの猫と、落ち着いている日（信頼40 → 下限は 100−40−distanceFloorOffset）
function seatedAtFloor() {
  const day = makeDay({ trust: 40, wariness: 0, timeLeft: 1000 });
  const floor = distanceFloor(day.trust, day.floorBonus);
  // 様子が relax から変わらないように、残り時間を大きくしておく
  const cat = makeCat({ mode: 'relax', distance: floor, walking: false, modeTimeLeft: 1e6 });
  return { cat, day };
}
// 1 tick 進め、tick を始めたときの下限と余裕（距離 − 下限）も返す
function step({ cat, day }) {
  const floor = distanceFloor(day.trust, day.floorBonus);
  const r = tick(cat, day, tsundere, STEP, rng);
  assert.equal(r.cat.mode, 'relax', 'くつろぎのまま（このテストの前提）');
  assert.ok(r.day.wariness < RULES.calmThreshold, '落ち着いたまま（このテストの前提）');
  return { cat: r.cat, day: r.day, floor, gap: cat.distance - floor, before: cat };
}

test('歩き出すまでの余裕（RULES.walkResumeGap）は 0 より大きい数', () => {
  assert.equal(typeof RULES.walkResumeGap, 'number');
  assert.ok(RULES.walkResumeGap > 0);
});

test('下限に着いて座った猫は、信頼が少し増えて下限がわずかに下がっても、歩き出さずに座ったまま', () => {
  const G = walkGap();
  let s = seatedAtFloor();
  const start = s.cat.distance;
  let n = 0;
  // 余裕が walkResumeGap 未満の間
  for (; n < 2000; n++) {
    if (s.cat.distance - distanceFloor(s.day.trust, s.day.floorBonus) >= G) break;
    s = step(s);
    assert.equal(s.cat.walking, false, `${n + 1} tick 目（余裕 ${s.gap.toFixed(3)}）に歩いた`);
    assert.equal(s.cat.distance, start, `${n + 1} tick 目に距離が変わった`);
  }
  assert.ok(n > 20 && n < 2000, `余裕が walkResumeGap になるまでの tick 数 ${n}（このテストの前提）`);
});

test('下限が walkResumeGap 以上下がったら歩き出し、余裕が小さくなっても下限に着くまで歩き、着いたらまた座る', () => {
  const G = walkGap();
  let s = seatedAtFloor();
  // 余裕が walkResumeGap になるまでは座っている（前のテストで確かめる）
  for (let n = 0; n < 2000 && s.cat.distance - distanceFloor(s.day.trust, s.day.floorBonus) < G; n++) s = step(s);

  // 歩き出す
  s = step(s);
  assert.ok(s.gap >= G, '余裕が walkResumeGap 以上のときに確かめる（このテストの前提）');
  assert.equal(s.cat.walking, true, `余裕 ${s.gap.toFixed(3)} で歩き出さない`);
  assert.ok(s.cat.distance < s.before.distance, '歩き出したのに近づいていない');

  // 下限に着くまで歩き続ける（余裕が walkResumeGap 未満になっても止まらない）
  let walkedWithSmallGap = false;
  let n = 0;
  for (; n < 200; n++) {
    s = step(s);
    if (!s.cat.walking) break;
    if (s.gap < G) walkedWithSmallGap = true;
  }
  assert.ok(n < 200, '下限に着いても歩き続けている');
  assert.ok(walkedWithSmallGap, '余裕が walkResumeGap 未満になったところで止まった');
  // 座ったのは下限に着いたとき
  assert.ok(Math.abs(s.cat.distance - s.floor) <= 0.1, `座った距離 ${s.cat.distance}（下限 ${s.floor}）`);

  // 着いたあとは、また座ったまま（足踏みしない）
  const seated = s.cat.distance;
  for (let i = 0; i < 40; i++) {
    s = step(s);
    assert.equal(s.cat.walking, false, `座ってから ${i + 1} tick 目に歩いた`);
    assert.equal(s.cat.distance, seated, `座ってから ${i + 1} tick 目に距離が変わった`);
  }
});

test('下限から十分遠い猫は、歩いていたかどうかが分からなくても、最初の tick から歩く', () => {
  const day = makeDay({ trust: 40, wariness: 0, timeLeft: 1000 });
  const cat = makeCat({ mode: 'relax', distance: 90, modeTimeLeft: 1e6 });
  assert.ok(!('walking' in cat), 'walking を持たない猫で確かめる（このテストの前提）');
  const r = tick(cat, day, tsundere, STEP, rng);
  assert.equal(r.cat.walking, true);
  assert.ok(r.cat.distance < 90);
});
