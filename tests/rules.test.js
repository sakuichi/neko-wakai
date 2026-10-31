import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction } from '../src/game/rules.js';
import { RULES, PERSONALITIES } from '../src/data/params.js';
import { makeDay, makeCat } from './helpers.js';

// ツンデレをもとに、性格の得意・苦手（likes）とツン（shyUntil）をなくした猫。ルールそのものを確かめる
const plain = { ...PERSONALITIES.tsundere, likes: { pet: 1, blink: 1, patience: 1 }, shyUntil: 0 };
const blink = (holdMs) => ({ type: 'blink', holdMs });
const pet = { type: 'pet' };

test('目が合っているときのゆっくりまばたきで信頼が増え、猫がまばたきを返す', () => {
  const r = applyAction(blink(1000), makeCat({ mode: 'look' }), makeDay({ trust: 20 }), plain);
  assert.equal(r.day.trust, 20 + RULES.blink.trust);
  assert.equal(r.feedback, 'blinkBack');
  assert.equal(r.mistake, false);
  assert.notEqual(r.cat.mode, 'look');
});

test('押す時間が短すぎる・長すぎるまばたきは効果がない', () => {
  for (const ms of [RULES.blink.minHoldMs - 1, RULES.blink.maxHoldMs + 1]) {
    const r = applyAction(blink(ms), makeCat({ mode: 'look' }), makeDay({ trust: 20 }), plain);
    assert.equal(r.day.trust, 20);
    assert.equal(r.feedback, null);
  }
});

test('目が合っていないときにゆっくりまばたきすると、少し警戒される（連打対策）', () => {
  const r = applyAction(blink(1000), makeCat({ mode: 'relax' }), makeDay({ trust: 20, wariness: 10 }), plain);
  assert.equal(r.day.trust, 20);
  assert.equal(r.day.wariness, 10 + RULES.blink.missWariness * plain.warinessMul);
  assert.equal(r.feedback, 'stare');
  assert.equal(r.mistake, false);
});

test('押している間に目が合っていれば、離す前に猫の様子が変わっても成功になる', () => {
  for (const mode of ['relax', 'tailFlick', 'tailUp']) {
    const r = applyAction({ type: 'blink', holdMs: 1000, sawLook: true }, makeCat({ mode }), makeDay({ trust: 20, wariness: 10 }), plain);
    assert.equal(r.day.trust, 20 + RULES.blink.trust, mode);
    assert.equal(r.day.wariness, 10, mode);
    assert.equal(r.feedback, 'blinkBack', mode);
  }
});

test('普通のまばたき（短い）は、目が合っていなくても何も起きない', () => {
  const r = applyAction(blink(RULES.blink.minHoldMs - 1), makeCat({ mode: 'relax' }), makeDay({ wariness: 10 }), plain);
  assert.equal(r.day.wariness, 10);
  assert.equal(r.feedback, null);
});

test('すり寄りに見せかけたフェイント（しっぽパタパタ）になでると猫キック（ミス）', () => {
  const r = applyAction(pet, makeCat({ mode: 'fakeRub', distance: 20 }), makeDay({ wariness: 10, trust: 40 }), plain);
  // 焦って触ったので、信頼が少し減る
  assert.equal(r.day.trust, 40 - RULES.mistakeTrust);
  assert.equal(r.day.wariness, 10 + RULES.pet.fakeRubWariness);
  assert.equal(r.feedback, 'kick');
  assert.equal(r.mistake, true);
  assert.equal(r.cat.mode, 'flee');
});

test('まだ解禁されていない行動は何も起こさない', () => {
  const day = makeDay({ trust: 20, actions: ['pet'] });
  const r = applyAction(blink(1000), makeCat({ mode: 'look' }), day, plain);
  assert.equal(r.day.trust, 20);
  assert.equal(r.feedback, null);
});

test('すり寄りのときになでると信頼が増え、ゴロゴロ状態になる', () => {
  const r = applyAction(pet, makeCat({ mode: 'rub', distance: 20 }), makeDay({ trust: 40 }), plain);
  assert.equal(r.day.trust, 40 + RULES.pet.rubTrust);
  assert.equal(r.feedback, 'purr');
  assert.equal(r.cat.mode, 'purr');
  assert.equal(r.mistake, false);
});

test('ゴロゴロ中になでても何も起きない（連打で得もしないし、ミスにもならない）', () => {
  const r = applyAction(pet, makeCat({ mode: 'purr', distance: 20 }), makeDay({ trust: 40 }), plain);
  assert.equal(r.day.trust, 40);
  assert.equal(r.mistake, false);
});

test('お腹見せのときになでると猫キック：警戒が大きく上がり、逃げる（ミス）', () => {
  const r = applyAction(pet, makeCat({ mode: 'belly', distance: 40 }), makeDay({ wariness: 10, mistakes: 0 }), plain);
  assert.equal(r.day.wariness, 10 + RULES.pet.bellyWariness);
  assert.equal(r.feedback, 'kick');
  assert.equal(r.mistake, true);
  assert.equal(r.day.mistakes, 1);
  assert.equal(r.cat.mode, 'flee');
  assert.equal(r.cat.distance, 40 + RULES.fleeDistance);
});

test('しっぽパタパタのときになでると逃げる（ミス）', () => {
  const r = applyAction(pet, makeCat({ mode: 'tailFlick', distance: 40 }), makeDay({ wariness: 10 }), plain);
  assert.equal(r.day.wariness, 10 + RULES.pet.tailFlickWariness);
  assert.equal(r.feedback, 'flee');
  assert.equal(r.mistake, true);
});

test('くつろぎ・目が合う・背中を向けるときになでると逃げる（ミス）', () => {
  for (const mode of ['relax', 'look', 'backTurn']) {
    const r = applyAction(pet, makeCat({ mode, distance: 40 }), makeDay({ wariness: 10 }), plain);
    assert.equal(r.day.wariness, 10 + RULES.pet.relaxWariness, mode);
    assert.equal(r.feedback, 'flee', mode);
    assert.equal(r.mistake, true, mode);
  }
});

test('箱の中にいるときになでると警戒が上がるが、箱からは動かない（ミス）', () => {
  const r = applyAction(pet, makeCat({ mode: 'inBox', distance: 60 }), makeDay({ wariness: 0 }), plain);
  assert.equal(r.day.wariness, RULES.pet.relaxWariness);
  assert.equal(r.cat.mode, 'inBox');
  assert.equal(r.cat.distance, 60);
  assert.equal(r.feedback, 'hide');
  assert.equal(r.mistake, true);
});

test('しっぽピンのとき、近ければなでてよい', () => {
  const r = applyAction(pet, makeCat({ mode: 'tailUp', distance: RULES.pet.tailUpReach }), makeDay({ trust: 40 }), plain);
  assert.equal(r.day.trust, 40 + RULES.pet.tailUpTrust);
  assert.equal(r.feedback, 'purr');
  assert.equal(r.mistake, false);
});

test('しっぽピンでも遠ければ手が届かない（ミスではない）', () => {
  const r = applyAction(pet, makeCat({ mode: 'tailUp', distance: RULES.pet.tailUpReach + 1 }), makeDay({ trust: 40 }), plain);
  assert.equal(r.day.trust, 40);
  assert.equal(r.feedback, 'tooFar');
  assert.equal(r.mistake, false);
});

test('性格による警戒の上がり方の倍率がかかる', () => {
  const r = applyAction(pet, makeCat({ mode: 'relax' }), makeDay({ wariness: 0 }), PERSONALITIES.bibiri);
  assert.equal(r.day.wariness, RULES.pet.relaxWariness * PERSONALITIES.bibiri.warinessMul);
});

test('おやつ目当ての日は、信頼の増え方に倍率がかかる', () => {
  const r = applyAction(blink(1000), makeCat({ mode: 'look' }), makeDay({ trust: 0, trustRate: 0.7 }), plain);
  assert.equal(r.day.trust, RULES.blink.trust * 0.7);
});

test('信頼・警戒・距離は100を超えない', () => {
  const a = applyAction(pet, makeCat({ mode: 'rub', distance: 10 }), makeDay({ trust: 95 }), plain);
  assert.equal(a.day.trust, 100);
  const b = applyAction(pet, makeCat({ mode: 'belly', distance: 90 }), makeDay({ wariness: 90 }), plain);
  assert.equal(b.day.wariness, 100);
  assert.equal(b.cat.distance, 100);
});

test('入力の状態オブジェクトを書き換えない', () => {
  const cat = makeCat({ mode: 'belly' });
  const day = makeDay({ wariness: 10 });
  const catCopy = structuredClone(cat);
  const dayCopy = structuredClone(day);
  applyAction(pet, cat, day, plain);
  assert.deepEqual(cat, catCopy);
  assert.deepEqual(day, dayCopy);
});

// ---------------------------------------------------------------- 性格ごとに効く行動（likes）と、ツンデレのツン（shyUntil）

// 小数のかけ算の順番で、ごくわずかにずれてもよいように比べる
function assertNear(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ''} ${actual}（期待 ${expected}）`);
}
// 性格の得意・苦手の倍率（なければ、ここで分かるように止める）
function likesOf(key) {
  const likes = PERSONALITIES[key].likes;
  assert.ok(likes, `PERSONALITIES.${key}.likes がない`);
  for (const k of ['pet', 'blink', 'patience']) assert.equal(typeof likes[k], 'number', `PERSONALITIES.${key}.likes.${k} がない`);
  return likes;
}
function shyUntilOf(key) {
  const s = PERSONALITIES[key].shyUntil;
  assert.equal(typeof s, 'number', `PERSONALITIES.${key}.shyUntil がない`);
  return s;
}
function shyPenalty() {
  assert.equal(typeof RULES.blink.shyPenalty, 'number', 'RULES.blink.shyPenalty がない');
  assert.ok(RULES.blink.shyPenalty > 0, 'RULES.blink.shyPenalty は 0 より大きい数');
  return RULES.blink.shyPenalty;
}

test('甘えん坊は、すり寄り・しっぽピンになでると、ふつうの likes.pet 倍の信頼が増える（甘えん坊の pet は 1 より大きい）', () => {
  const likes = likesOf('amaenbo');
  assert.ok(likes.pet > 1, `甘えん坊の likes.pet ${likes.pet}`);
  const amaenbo = PERSONALITIES.amaenbo;
  const rub = makeCat({ mode: 'rub', distance: 20 });
  const tailUp = makeCat({ mode: 'tailUp', distance: RULES.pet.tailUpReach });

  const rubR = applyAction(pet, rub, makeDay({ trust: 40 }), amaenbo);
  assertNear(rubR.day.trust, 40 + RULES.pet.rubTrust * likes.pet, 'すり寄り:');
  assert.equal(rubR.feedback, 'purr');
  assert.equal(rubR.mistake, false);
  // ふつう（倍率 1）の猫と比べて、増えた分がちょうど likes.pet 倍
  const rubPlain = applyAction(pet, rub, makeDay({ trust: 40 }), plain);
  assertNear(rubR.day.trust - 40, (rubPlain.day.trust - 40) * likes.pet, 'すり寄り（ふつうとの比）:');

  const tailR = applyAction(pet, tailUp, makeDay({ trust: 40 }), amaenbo);
  assertNear(tailR.day.trust, 40 + RULES.pet.tailUpTrust * likes.pet, 'しっぽピン:');
  assert.equal(tailR.feedback, 'purr');
  assert.equal(tailR.mistake, false);
  const tailPlain = applyAction(pet, tailUp, makeDay({ trust: 40 }), plain);
  assertNear(tailR.day.trust - 40, (tailPlain.day.trust - 40) * likes.pet, 'しっぽピン（ふつうとの比）:');
});

test('ビビりは、まばたきが likes.blink 倍、なでるのが likes.pet 倍効く（blink は 1 より大きく、pet は 1 より小さい）', () => {
  const likes = likesOf('bibiri');
  assert.ok(likes.blink > 1, `ビビりの likes.blink ${likes.blink}`);
  assert.ok(likes.pet < 1, `ビビりの likes.pet ${likes.pet}`);
  const bibiri = PERSONALITIES.bibiri;

  const b = applyAction(blink(1000), makeCat({ mode: 'look' }), makeDay({ trust: 20 }), bibiri);
  assertNear(b.day.trust, 20 + RULES.blink.trust * likes.blink, 'まばたき:');
  assert.equal(b.feedback, 'blinkBack');
  assert.equal(b.mistake, false);

  const p = applyAction(pet, makeCat({ mode: 'rub', distance: 20 }), makeDay({ trust: 40 }), bibiri);
  assertNear(p.day.trust, 40 + RULES.pet.rubTrust * likes.pet, 'すり寄り:');
  assert.equal(p.feedback, 'timid');

  const t = applyAction(pet, makeCat({ mode: 'tailUp', distance: RULES.pet.tailUpReach }), makeDay({ trust: 40 }), bibiri);
  assertNear(t.day.trust, 40 + RULES.pet.tailUpTrust * likes.pet, 'しっぽピン:');
  assert.equal(t.feedback, 'timid');
});

test('ツンデレが信頼 shyUntil−1 でまばたきに成功すると、信頼が shyPenalty 減り blinkAway。猫はくつろぎに戻り、ミスに数えず、警戒は変わらない', () => {
  const S = shyUntilOf('tsundere');
  assert.ok(S > 0, `ツンデレの shyUntil ${S} は 0 より大きい`);
  const penalty = shyPenalty();
  const trust = S - 1;
  const r = applyAction(blink(1000), makeCat({ mode: 'look', distance: 50 }), makeDay({ trust, wariness: 10, mistakes: 0 }), PERSONALITIES.tsundere);
  assert.equal(r.day.trust, Math.max(0, trust - penalty));
  assert.equal(r.day.wariness, 10);
  assert.equal(r.feedback, 'blinkAway');
  assert.equal(r.mistake, false);
  assert.equal(r.day.mistakes, 0);
  assert.equal(r.cat.mode, 'relax');
  assert.equal(r.cat.modeTimeLeft, RULES.modeSec.relax[0]);
});

test('ツンデレが信頼ちょうど shyUntil でまばたきすると、ツンではなく likes.blink 倍効いて blinkBack（境目）', () => {
  const S = shyUntilOf('tsundere');
  const likes = likesOf('tsundere');
  const r = applyAction(blink(1000), makeCat({ mode: 'look' }), makeDay({ trust: S, wariness: 10 }), PERSONALITIES.tsundere);
  assertNear(r.day.trust, S + RULES.blink.trust * likes.blink);
  assert.equal(r.day.wariness, 10);
  assert.equal(r.feedback, 'blinkBack');
  assert.equal(r.mistake, false);
});

test('信頼が 0 や shyPenalty−1 のツンデレがまばたきしても、信頼はマイナスにならない', () => {
  const penalty = shyPenalty();
  assert.ok(penalty > 1, `shyPenalty ${penalty} が 1 より大きい（このテストの前提）`);
  for (const trust of [0, penalty - 1]) {
    const r = applyAction(blink(1000), makeCat({ mode: 'look' }), makeDay({ trust }), PERSONALITIES.tsundere);
    assert.equal(r.feedback, 'blinkAway', `信頼 ${trust}`);
    assert.equal(r.day.trust, 0, `信頼 ${trust}`);
  }
});

test('isShy：ツンデレは信頼 shyUntil−1 で true、shyUntil で false。shyUntil が 0 の性格は常に false', async () => {
  const { isShy } = await import('../src/game/rules.js');
  assert.equal(typeof isShy, 'function', 'rules.js に isShy がない');
  const S = shyUntilOf('tsundere');
  assert.equal(isShy(S - 1, PERSONALITIES.tsundere), true);
  assert.equal(isShy(S, PERSONALITIES.tsundere), false);
  for (const key of ['amaenbo', 'bibiri']) {
    assert.equal(shyUntilOf(key), 0, `${key} の shyUntil`);
    for (const trust of [0, S - 1, S, 100]) assert.equal(isShy(trust, PERSONALITIES[key]), false, `${key}: 信頼 ${trust}`);
  }
});

// ---------------------------------------------------------------- 性格の得意・苦手の追加調整（まばたきの距離・ビビりの look・ビビりの手）

// まばたきが遠くで効きにくくなる設定（なければ、ここで分かるように止める）
function blinkFar() {
  const far = RULES.blink.far;
  assert.ok(far, 'RULES.blink.far がない');
  assert.equal(typeof far.from, 'number', 'RULES.blink.far.from がない');
  assert.equal(typeof far.min, 'number', 'RULES.blink.far.min がない');
  assert.ok(far.from < 100, `RULES.blink.far.from ${far.from} は 100 より小さい`);
  assert.ok(far.min > 0 && far.min < 1, `RULES.blink.far.min ${far.min} は 0〜1 の間`);
  return far;
}
test('まばたきの距離の倍率：距離 far.from 以下（50・20）ではそのまま、100 で far.min 倍、from と 100 の中間ではその間（式どおり）', () => {
  const far = blinkFar();
  assert.ok(20 <= far.from, `far.from ${far.from} が 20 以上（このテストの前提）`);
  const blinkAt = (distance, trustRate = 1) =>
    applyAction(blink(1000), makeCat({ mode: 'look', distance }), makeDay({ trust: 20, trustRate }), plain);

  for (const distance of [far.from, 20]) {
    const r = blinkAt(distance);
    assertNear(r.day.trust, 20 + RULES.blink.trust, `距離 ${distance}:`);
    assert.equal(r.feedback, 'blinkBack', `距離 ${distance}`);
    assert.equal(r.mistake, false, `距離 ${distance}`);
  }

  const r100 = blinkAt(100);
  assertNear(r100.day.trust, 20 + RULES.blink.trust * far.min, '距離 100:');
  assert.equal(r100.feedback, 'blinkBack');

  const mid = (far.from + 100) / 2;
  const rMid = blinkAt(mid);
  // 仕様の式：倍率 = 1 − (1 − min) × (距離 − from) / (100 − from)
  const midMul = 1 - (1 - far.min) * (mid - far.from) / (100 - far.from);
  assertNear(rMid.day.trust, 20 + RULES.blink.trust * midMul, `距離 ${mid}:`);
  assert.ok(rMid.day.trust < 20 + RULES.blink.trust, `距離 ${mid} は from より効きが小さい`);
  assert.ok(rMid.day.trust > r100.day.trust, `距離 ${mid} は 100 より効きが大きい`);

  // おやつ目当ての日の倍率（trustRate）も、距離の倍率と一緒にかかる
  const rRate = blinkAt(100, 0.7);
  assertNear(rRate.day.trust, 20 + RULES.blink.trust * far.min * 0.7, '距離 100・trustRate 0.7:');
  const rRateNear = blinkAt(far.from, 0.7);
  assertNear(rRateNear.day.trust, 20 + RULES.blink.trust * 0.7, `距離 ${far.from}・trustRate 0.7:`);
});

test('ツンデレの信頼 shyUntil−1 でのまばたき（blinkAway）は、距離 100 でも shyPenalty だけ減る（距離の倍率はかからない）', () => {
  blinkFar();
  const S = shyUntilOf('tsundere');
  assert.ok(S > 0, `ツンデレの shyUntil ${S} は 0 より大きい`);
  const penalty = shyPenalty();
  const trust = S - 1;
  const far = applyAction(blink(1000), makeCat({ mode: 'look', distance: 100 }), makeDay({ trust, wariness: 10 }), PERSONALITIES.tsundere);
  assert.equal(far.feedback, 'blinkAway');
  assert.equal(far.day.trust, Math.max(0, trust - penalty));
  assert.equal(far.day.wariness, 10);
  assert.equal(far.mistake, false);
  // 近くでのツンと同じだけ減る
  const near = applyAction(blink(1000), makeCat({ mode: 'look', distance: 20 }), makeDay({ trust, wariness: 10 }), PERSONALITIES.tsundere);
  assert.equal(near.feedback, 'blinkAway');
  assert.equal(far.day.trust, near.day.trust);
});

test('ビビりは目を合わせるのが苦手：サインの重み signWeights.look が、ほかのどの性格より小さい', () => {
  const look = PERSONALITIES.bibiri.signWeights.look;
  assert.equal(typeof look, 'number', 'PERSONALITIES.bibiri.signWeights.look がない');
  assert.ok(look > 0, `ビビりの look ${look} は 0 より大きい（まったく出なくはならない）`);
  for (const key of Object.keys(PERSONALITIES).filter((k) => k !== 'bibiri')) {
    const other = PERSONALITIES[key].signWeights.look;
    assert.equal(typeof other, 'number', `PERSONALITIES.${key}.signWeights.look がない`);
    assert.ok(look < other, `ビビりの look ${look} が ${key} の look ${other} より小さくない`);
  }
});

test('ビビり（timidHands）がすり寄り・しっぽピンをなでると feedback は timid。信頼は likes.pet 倍増え、猫はゴロゴロ、ミスではない', () => {
  assert.equal(PERSONALITIES.bibiri.timidHands, true, 'PERSONALITIES.bibiri.timidHands が true でない');
  for (const key of Object.keys(PERSONALITIES).filter((k) => k !== 'bibiri')) {
    assert.ok(!PERSONALITIES[key].timidHands, `${key} に timidHands がある`);
  }
  const likes = likesOf('bibiri');
  const bibiri = PERSONALITIES.bibiri;
  const cases = [
    { name: 'すり寄り', cat: makeCat({ mode: 'rub', distance: 20 }), gain: RULES.pet.rubTrust },
    { name: 'しっぽピン', cat: makeCat({ mode: 'tailUp', distance: RULES.pet.tailUpReach }), gain: RULES.pet.tailUpTrust },
  ];
  for (const c of cases) {
    const r = applyAction(pet, c.cat, makeDay({ trust: 40, wariness: 10, mistakes: 0 }), bibiri);
    assert.equal(r.feedback, 'timid', c.name);
    assertNear(r.day.trust, 40 + c.gain * likes.pet, `${c.name}:`);
    assert.equal(r.day.wariness, 10, c.name);
    assert.equal(r.cat.mode, 'purr', c.name);
    assert.equal(r.cat.modeTimeLeft, RULES.purrSec, c.name);
    assert.equal(r.mistake, false, c.name);
    assert.equal(r.day.mistakes, 0, c.name);
  }
});

test('timidHands のない性格（plain・甘えん坊）は、すり寄り・しっぽピンをなでると今までどおり purr', () => {
  for (const [name, p] of [['plain', plain], ['甘えん坊', PERSONALITIES.amaenbo]]) {
    const rub = applyAction(pet, makeCat({ mode: 'rub', distance: 20 }), makeDay({ trust: 40 }), p);
    assert.equal(rub.feedback, 'purr', `${name}: すり寄り`);
    assert.equal(rub.cat.mode, 'purr', `${name}: すり寄り`);
    const tail = applyAction(pet, makeCat({ mode: 'tailUp', distance: RULES.pet.tailUpReach }), makeDay({ trust: 40 }), p);
    assert.equal(tail.feedback, 'purr', `${name}: しっぽピン`);
    assert.equal(tail.cat.mode, 'purr', `${name}: しっぽピン`);
  }
});

// ---------------------------------------------------------------- ビビりの手は、仲良くなると平気になる（timidUntil）

// ビビりの手がこわい間の信頼の上限（なければ、ここで分かるように止める）
function timidUntilOf(key) {
  const t = PERSONALITIES[key].timidUntil;
  assert.equal(typeof t, 'number', `PERSONALITIES.${key}.timidUntil がない`);
  return t;
}

test('ビビりの timidUntil は 0 より大きく MAX_VALUE 以下。ほかの性格には timidUntil がない（または 0）', async () => {
  const { MAX_VALUE } = await import('../src/data/params.js');
  const T = timidUntilOf('bibiri');
  assert.ok(T > 0, `ビビりの timidUntil ${T} は 0 より大きい`);
  assert.ok(T <= MAX_VALUE, `ビビりの timidUntil ${T} は MAX_VALUE ${MAX_VALUE} 以下`);
  for (const key of Object.keys(PERSONALITIES).filter((k) => k !== 'bibiri')) {
    assert.ok(!PERSONALITIES[key].timidUntil, `${key} に timidUntil ${PERSONALITIES[key].timidUntil} がある`);
  }
});

test('ビビりが信頼 timidUntil−1 ですり寄り・しっぽピンをなでると timid・likes.pet 倍。信頼 timidUntil（境目）と 100 では purr・ふつうの効き。trustRate もかかる', async () => {
  const { MAX_VALUE } = await import('../src/data/params.js');
  const T = timidUntilOf('bibiri');
  assert.ok(T >= 1, `ビビりの timidUntil ${T} が 1 以上（このテストの前提）`);
  const likes = likesOf('bibiri');
  assert.ok(likes.pet !== 1, `ビビりの likes.pet ${likes.pet} が 1 ではない（このテストの前提）`);
  const bibiri = PERSONALITIES.bibiri;
  const cases = [
    { name: 'すり寄り', cat: () => makeCat({ mode: 'rub', distance: 20 }), gain: RULES.pet.rubTrust },
    { name: 'しっぽピン', cat: () => makeCat({ mode: 'tailUp', distance: RULES.pet.tailUpReach }), gain: RULES.pet.tailUpTrust },
  ];
  for (const trustRate of [1, 0.85]) {
    for (const c of cases) {
      // 手がまだこわい（timidUntil−1）：今までどおり timid、likes.pet 倍
      const trust = T - 1;
      const r = applyAction(pet, c.cat(), makeDay({ trust, trustRate, wariness: 10, mistakes: 0 }), bibiri);
      const label = `${c.name}・信頼 ${trust}・trustRate ${trustRate}`;
      assert.equal(r.feedback, 'timid', label);
      assertNear(r.day.trust, Math.min(MAX_VALUE, trust + c.gain * likes.pet * trustRate), `${label}:`);
      assert.equal(r.day.wariness, 10, label);
      assert.equal(r.cat.mode, 'purr', label);
      assert.equal(r.cat.modeTimeLeft, RULES.purrSec, label);
      assert.equal(r.mistake, false, label);
      assert.equal(r.day.mistakes, 0, label);

      // 手が平気になった（timidUntil ちょうど・100）：purr、likes.pet をかけないふつうの効き
      for (const trust2 of [T, 100]) {
        const r2 = applyAction(pet, c.cat(), makeDay({ trust: trust2, trustRate, wariness: 10, mistakes: 0 }), bibiri);
        const label2 = `${c.name}・信頼 ${trust2}・trustRate ${trustRate}`;
        assert.equal(r2.feedback, 'purr', label2);
        assertNear(r2.day.trust, Math.min(MAX_VALUE, trust2 + c.gain * trustRate), `${label2}:`);
        assert.equal(r2.day.wariness, 10, label2);
        assert.equal(r2.cat.mode, 'purr', label2);
        assert.equal(r2.cat.modeTimeLeft, RULES.purrSec, label2);
        assert.equal(r2.mistake, false, label2);
        assert.equal(r2.day.mistakes, 0, label2);
      }
    }
  }
});

// ---------------------------------------------------------------- 焦って触った（ミス）ときは、信頼が少し減る（mistakeTrust）

// ミスで減る信頼（なければ、ここで分かるように止める）
function mistakeTrustOf() {
  const m = RULES.mistakeTrust;
  assert.equal(typeof m, 'number', 'RULES.mistakeTrust がない');
  assert.ok(m > 0, `RULES.mistakeTrust ${m} は 0 より大きい数`);
  return m;
}
// ミスになるなで方（猫の様子・距離と、返ってくる反応）
const MISTAKE_CASES = [
  { mode: 'relax', distance: 40, feedback: 'flee' },
  { mode: 'look', distance: 40, feedback: 'flee' },
  { mode: 'backTurn', distance: 40, feedback: 'flee' },
  { mode: 'tailFlick', distance: 40, feedback: 'flee' },
  { mode: 'belly', distance: 40, feedback: 'kick' },
  { mode: 'fakeRub', distance: 20, feedback: 'kick' },
  { mode: 'inBox', distance: 60, feedback: 'hide' },
];

test('焦って触ると（くつろぎ・チラッ・背中・しっぽパタパタ・お腹見せ・気まぐれすりすり・箱の中）、信頼が mistakeTrust 減る', () => {
  const M = mistakeTrustOf();
  for (const c of MISTAKE_CASES) {
    const r = applyAction(pet, makeCat({ mode: c.mode, distance: c.distance }), makeDay({ trust: 40, wariness: 10, mistakes: 0 }), plain);
    assert.equal(r.feedback, c.feedback, c.mode);
    assert.equal(r.mistake, true, c.mode);
    assert.equal(r.day.mistakes, 1, c.mode);
    assert.equal(r.day.trust, 40 - M, c.mode);
  }
});

test('ミスで減る信頼は 0 で止まる（信頼 0・mistakeTrust−1 からでもマイナスにならない）', () => {
  const M = mistakeTrustOf();
  assert.ok(M > 1, `RULES.mistakeTrust ${M} が 1 より大きい（このテストの前提）`);
  for (const trust of [0, M - 1]) {
    for (const c of MISTAKE_CASES) {
      const r = applyAction(pet, makeCat({ mode: c.mode, distance: c.distance }), makeDay({ trust, wariness: 10 }), plain);
      assert.equal(r.mistake, true, `${c.mode}・信頼 ${trust}`);
      assert.equal(r.day.trust, 0, `${c.mode}・信頼 ${trust}`);
    }
  }
});

test('おやつの翌日（trustRate 0.85）でも、ミスで減る信頼は mistakeTrust のまま（trustRate はかけない）', () => {
  const M = mistakeTrustOf();
  for (const c of MISTAKE_CASES) {
    const r = applyAction(pet, makeCat({ mode: c.mode, distance: c.distance }), makeDay({ trust: 40, trustRate: 0.85, wariness: 10 }), plain);
    assert.equal(r.mistake, true, c.mode);
    assert.equal(r.day.trust, 40 - M, c.mode);
  }
});

test('ミスでないとき（すり寄り・しっぽピンを正しくなでる、遠すぎ、まばたきの blinkBack・stare・短すぎ）は、信頼が mistakeTrust 分減らない', () => {
  mistakeTrustOf();
  const cases = [
    { name: 'すり寄り', action: pet, cat: makeCat({ mode: 'rub', distance: 20 }), trust: 40 + RULES.pet.rubTrust, feedback: 'purr' },
    { name: 'しっぽピン', action: pet, cat: makeCat({ mode: 'tailUp', distance: RULES.pet.tailUpReach }), trust: 40 + RULES.pet.tailUpTrust, feedback: 'purr' },
    { name: '遠すぎ', action: pet, cat: makeCat({ mode: 'tailUp', distance: RULES.pet.tailUpReach + 1 }), trust: 40, feedback: 'tooFar' },
    { name: 'まばたき（blinkBack）', action: blink(1000), cat: makeCat({ mode: 'look', distance: 50 }), trust: 40 + RULES.blink.trust, feedback: 'blinkBack' },
    { name: 'まばたき（stare）', action: blink(1000), cat: makeCat({ mode: 'relax', distance: 50 }), trust: 40, feedback: 'stare' },
    { name: 'まばたき（短すぎ）', action: blink(RULES.blink.minHoldMs - 1), cat: makeCat({ mode: 'look', distance: 50 }), trust: 40, feedback: null },
  ];
  for (const c of cases) {
    const r = applyAction(c.action, c.cat, makeDay({ trust: 40, wariness: 10, mistakes: 0 }), plain);
    assert.equal(r.feedback, c.feedback, c.name);
    assert.equal(r.mistake, false, c.name);
    assert.equal(r.day.mistakes, 0, c.name);
    assert.equal(r.day.trust, c.trust, c.name);
  }
});

// ---------------------------------------------------------------- 一度デレた・手が平気になったら、ミスで信頼が境目を下回っても戻らない（dere・handsOk）

test('isShy の第3引数（dere）：真ならツンデレの信頼が shyUntil 未満でも false。偽・省略なら今までどおり', async () => {
  const { isShy } = await import('../src/game/rules.js');
  const S = shyUntilOf('tsundere');
  assert.ok(S > 0, `ツンデレの shyUntil ${S} は 0 より大きい`);
  const tsundere = PERSONALITIES.tsundere;
  // dere が真：境目未満でも、ツンではない
  for (const trust of [0, S - 1]) assert.equal(isShy(trust, tsundere, true), false, `dere 真・信頼 ${trust}`);
  assert.equal(isShy(S, tsundere, true), false, 'dere 真・信頼 shyUntil');
  // dere が偽・省略：今までどおり、shyUntil 未満だけツン
  assert.equal(isShy(S - 1, tsundere, false), true, 'dere 偽・信頼 shyUntil−1');
  assert.equal(isShy(S, tsundere, false), false, 'dere 偽・信頼 shyUntil');
  assert.equal(isShy(S - 1, tsundere), true, 'dere 省略・信頼 shyUntil−1');
  assert.equal(isShy(S, tsundere), false, 'dere 省略・信頼 shyUntil');
});

test('isTimid の第3引数（handsOk）：真ならビビりの信頼が timidUntil 未満でも false。偽・省略なら今までどおり', async () => {
  const { isTimid } = await import('../src/game/rules.js');
  const T = timidUntilOf('bibiri');
  assert.ok(T > 0, `ビビりの timidUntil ${T} は 0 より大きい`);
  const bibiri = PERSONALITIES.bibiri;
  // handsOk が真：境目未満でも、手はこわくない
  for (const trust of [0, T - 1]) assert.equal(isTimid(trust, bibiri, true), false, `handsOk 真・信頼 ${trust}`);
  assert.equal(isTimid(T, bibiri, true), false, 'handsOk 真・信頼 timidUntil');
  // handsOk が偽・省略：今までどおり、timidUntil 未満だけビクビク
  assert.equal(isTimid(T - 1, bibiri, false), true, 'handsOk 偽・信頼 timidUntil−1');
  assert.equal(isTimid(T, bibiri, false), false, 'handsOk 偽・信頼 timidUntil');
  assert.equal(isTimid(T - 1, bibiri), true, 'handsOk 省略・信頼 timidUntil−1');
  assert.equal(isTimid(T, bibiri), false, 'handsOk 省略・信頼 timidUntil');
});

test('一度デレたツンデレ（day.dere 真）は、信頼 shyUntil−1 でもまばたきが blinkBack・likes.blink 倍', () => {
  const S = shyUntilOf('tsundere');
  assert.ok(S > 0, `ツンデレの shyUntil ${S} は 0 より大きい`);
  const likes = likesOf('tsundere');
  const trust = S - 1;
  const r = applyAction(blink(1000), makeCat({ mode: 'look', distance: 50 }), makeDay({ trust, wariness: 10, mistakes: 0, dere: true }), PERSONALITIES.tsundere);
  assert.equal(r.feedback, 'blinkBack');
  assertNear(r.day.trust, trust + RULES.blink.trust * likes.blink, 'まばたき:');
  assert.equal(r.day.wariness, 10);
  assert.equal(r.mistake, false);
  assert.equal(r.day.mistakes, 0);
});

test('一度手が平気になったビビり（day.handsOk 真）は、信頼 timidUntil−1 でもすり寄り・しっぽピンをなでると purr・ふつうの効き', () => {
  const T = timidUntilOf('bibiri');
  assert.ok(T >= 1, `ビビりの timidUntil ${T} が 1 以上（このテストの前提）`);
  const likes = likesOf('bibiri');
  assert.ok(likes.pet !== 1, `ビビりの likes.pet ${likes.pet} が 1 ではない（このテストの前提）`);
  const bibiri = PERSONALITIES.bibiri;
  const cases = [
    { name: 'すり寄り', cat: makeCat({ mode: 'rub', distance: 20 }), gain: RULES.pet.rubTrust },
    { name: 'しっぽピン', cat: makeCat({ mode: 'tailUp', distance: RULES.pet.tailUpReach }), gain: RULES.pet.tailUpTrust },
  ];
  const trust = T - 1;
  for (const c of cases) {
    const r = applyAction(pet, c.cat, makeDay({ trust, wariness: 10, mistakes: 0, handsOk: true }), bibiri);
    assert.equal(r.feedback, 'purr', c.name);
    // likes.pet をかけない、ふつうの効き
    assertNear(r.day.trust, trust + c.gain, `${c.name}:`);
    assert.equal(r.cat.mode, 'purr', c.name);
    assert.equal(r.mistake, false, c.name);
    assert.equal(r.day.mistakes, 0, c.name);
  }
});
