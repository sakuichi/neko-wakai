import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction } from '../src/game/rules.js';
import { RULES, PERSONALITIES } from '../src/data/params.js';
import { makeDay, makeCat } from './helpers.js';

const tsundere = PERSONALITIES.tsundere;
const blink = (holdMs) => ({ type: 'blink', holdMs });
const pet = { type: 'pet' };

test('目が合っているときのゆっくりまばたきで信頼が増え、猫がまばたきを返す', () => {
  const r = applyAction(blink(1000), makeCat({ mode: 'look' }), makeDay({ trust: 20 }), tsundere);
  assert.equal(r.day.trust, 20 + RULES.blink.trust);
  assert.equal(r.feedback, 'blinkBack');
  assert.equal(r.mistake, false);
  assert.notEqual(r.cat.mode, 'look');
});

test('押す時間が短すぎる・長すぎるまばたきは効果がない', () => {
  for (const ms of [RULES.blink.minHoldMs - 1, RULES.blink.maxHoldMs + 1]) {
    const r = applyAction(blink(ms), makeCat({ mode: 'look' }), makeDay({ trust: 20 }), tsundere);
    assert.equal(r.day.trust, 20);
    assert.equal(r.feedback, null);
  }
});

test('目が合っていないときにゆっくりまばたきすると、少し警戒される（連打対策）', () => {
  const r = applyAction(blink(1000), makeCat({ mode: 'relax' }), makeDay({ trust: 20, wariness: 10 }), tsundere);
  assert.equal(r.day.trust, 20);
  assert.equal(r.day.wariness, 10 + RULES.blink.missWariness * tsundere.warinessMul);
  assert.equal(r.feedback, 'stare');
  assert.equal(r.mistake, false);
});

test('押している間に目が合っていれば、離す前に猫の様子が変わっても成功になる', () => {
  for (const mode of ['relax', 'tailFlick', 'tailUp']) {
    const r = applyAction({ type: 'blink', holdMs: 1000, sawLook: true }, makeCat({ mode }), makeDay({ trust: 20, wariness: 10 }), tsundere);
    assert.equal(r.day.trust, 20 + RULES.blink.trust, mode);
    assert.equal(r.day.wariness, 10, mode);
    assert.equal(r.feedback, 'blinkBack', mode);
  }
});

test('普通のまばたき（短い）は、目が合っていなくても何も起きない', () => {
  const r = applyAction(blink(RULES.blink.minHoldMs - 1), makeCat({ mode: 'relax' }), makeDay({ wariness: 10 }), tsundere);
  assert.equal(r.day.wariness, 10);
  assert.equal(r.feedback, null);
});

test('すり寄りに見せかけたフェイント（しっぽパタパタ）になでると猫キック（ミス）', () => {
  const r = applyAction(pet, makeCat({ mode: 'fakeRub', distance: 20 }), makeDay({ wariness: 10, trust: 40 }), tsundere);
  assert.equal(r.day.trust, 40);
  assert.equal(r.day.wariness, 10 + RULES.pet.fakeRubWariness);
  assert.equal(r.feedback, 'kick');
  assert.equal(r.mistake, true);
  assert.equal(r.cat.mode, 'flee');
});

test('まだ解禁されていない行動は何も起こさない', () => {
  const day = makeDay({ trust: 20, actions: ['pet'] });
  const r = applyAction(blink(1000), makeCat({ mode: 'look' }), day, tsundere);
  assert.equal(r.day.trust, 20);
  assert.equal(r.feedback, null);
});

test('すり寄りのときになでると信頼が増え、ゴロゴロ状態になる', () => {
  const r = applyAction(pet, makeCat({ mode: 'rub', distance: 20 }), makeDay({ trust: 40 }), tsundere);
  assert.equal(r.day.trust, 40 + RULES.pet.rubTrust);
  assert.equal(r.feedback, 'purr');
  assert.equal(r.cat.mode, 'purr');
  assert.equal(r.mistake, false);
});

test('ゴロゴロ中になでても何も起きない（連打で得もしないし、ミスにもならない）', () => {
  const r = applyAction(pet, makeCat({ mode: 'purr', distance: 20 }), makeDay({ trust: 40 }), tsundere);
  assert.equal(r.day.trust, 40);
  assert.equal(r.mistake, false);
});

test('お腹見せのときになでると猫キック：警戒が大きく上がり、逃げる（ミス）', () => {
  const r = applyAction(pet, makeCat({ mode: 'belly', distance: 40 }), makeDay({ wariness: 10, mistakes: 0 }), tsundere);
  assert.equal(r.day.wariness, 10 + RULES.pet.bellyWariness);
  assert.equal(r.feedback, 'kick');
  assert.equal(r.mistake, true);
  assert.equal(r.day.mistakes, 1);
  assert.equal(r.cat.mode, 'flee');
  assert.equal(r.cat.distance, 40 + RULES.fleeDistance);
});

test('しっぽパタパタのときになでると逃げる（ミス）', () => {
  const r = applyAction(pet, makeCat({ mode: 'tailFlick', distance: 40 }), makeDay({ wariness: 10 }), tsundere);
  assert.equal(r.day.wariness, 10 + RULES.pet.tailFlickWariness);
  assert.equal(r.feedback, 'flee');
  assert.equal(r.mistake, true);
});

test('くつろぎ・目が合う・背中を向けるときになでると逃げる（ミス）', () => {
  for (const mode of ['relax', 'look', 'backTurn']) {
    const r = applyAction(pet, makeCat({ mode, distance: 40 }), makeDay({ wariness: 10 }), tsundere);
    assert.equal(r.day.wariness, 10 + RULES.pet.relaxWariness, mode);
    assert.equal(r.feedback, 'flee', mode);
    assert.equal(r.mistake, true, mode);
  }
});

test('箱の中にいるときになでると警戒が上がるが、箱からは動かない（ミス）', () => {
  const r = applyAction(pet, makeCat({ mode: 'inBox', distance: 60 }), makeDay({ wariness: 0 }), tsundere);
  assert.equal(r.day.wariness, RULES.pet.relaxWariness);
  assert.equal(r.cat.mode, 'inBox');
  assert.equal(r.cat.distance, 60);
  assert.equal(r.feedback, 'hide');
  assert.equal(r.mistake, true);
});

test('しっぽピンのとき、近ければなでてよい', () => {
  const r = applyAction(pet, makeCat({ mode: 'tailUp', distance: RULES.pet.tailUpReach }), makeDay({ trust: 40 }), tsundere);
  assert.equal(r.day.trust, 40 + RULES.pet.tailUpTrust);
  assert.equal(r.feedback, 'purr');
  assert.equal(r.mistake, false);
});

test('しっぽピンでも遠ければ手が届かない（ミスではない）', () => {
  const r = applyAction(pet, makeCat({ mode: 'tailUp', distance: RULES.pet.tailUpReach + 1 }), makeDay({ trust: 40 }), tsundere);
  assert.equal(r.day.trust, 40);
  assert.equal(r.feedback, 'tooFar');
  assert.equal(r.mistake, false);
});

test('性格による警戒の上がり方の倍率がかかる', () => {
  const r = applyAction(pet, makeCat({ mode: 'relax' }), makeDay({ wariness: 0 }), PERSONALITIES.bibiri);
  assert.equal(r.day.wariness, RULES.pet.relaxWariness * PERSONALITIES.bibiri.warinessMul);
});

test('おやつ目当ての日は、信頼の増え方に倍率がかかる', () => {
  const r = applyAction(blink(1000), makeCat({ mode: 'look' }), makeDay({ trust: 0, trustRate: 0.7 }), tsundere);
  assert.equal(r.day.trust, RULES.blink.trust * 0.7);
});

test('信頼・警戒・距離は100を超えない', () => {
  const a = applyAction(pet, makeCat({ mode: 'rub', distance: 10 }), makeDay({ trust: 95 }), tsundere);
  assert.equal(a.day.trust, 100);
  const b = applyAction(pet, makeCat({ mode: 'belly', distance: 90 }), makeDay({ wariness: 90 }), tsundere);
  assert.equal(b.day.wariness, 100);
  assert.equal(b.cat.distance, 100);
});

test('入力の状態オブジェクトを書き換えない', () => {
  const cat = makeCat({ mode: 'belly' });
  const day = makeDay({ wariness: 10 });
  const catCopy = structuredClone(cat);
  const dayCopy = structuredClone(day);
  applyAction(pet, cat, day, tsundere);
  assert.deepEqual(cat, catCopy);
  assert.deepEqual(day, dayCopy);
});
