// イベント「窓の外に鳥」のテスト（書き方は tests/events.test.js の箱のテストに合わせる）。
// まだ無い名前（EVENTS.bird、CARDS['event:bird']、EVENT_TEXT.bird など）は、
// 先頭で import すると、このファイルのほかのテストまで読めなくなるので、テストの中で動的 import する
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction } from '../src/game/rules.js';
import { RULES, PERSONALITIES, DAYS, MAX_DAY, MAX_VALUE } from '../src/data/params.js';
import { createRenderer } from '../src/render/renderer.js';
import { makeDay, makeCat, fixedRng } from './helpers.js';

// ツンデレをもとに、性格の得意・苦手（likes）とツン（shyUntil）をなくした猫。ルールそのものを確かめる
const plain = { ...PERSONALITIES.tsundere, likes: { pet: 1, blink: 1, patience: 1 }, shyUntil: 0 };
const blink = (holdMs) => ({ type: 'blink', holdMs });
const pet = { type: 'pet' };

const DT = 0.05;
// 1 tick ぶんの誤差まで許す
const TOL = DT + 1e-6;
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

const BIRD_KEYS = ['birdDistance', 'arriveSec', 'huntSec', 'leaveSec', 'turnSec', 'happySec', 'rounds', 'doneTrust'];

async function loadBird() {
  const P = await import('../src/data/params.js');
  assert.ok(P.EVENTS && P.EVENTS.bird, 'params.js に EVENTS.bird がない');
  for (const key of BIRD_KEYS) assert.ok(key in P.EVENTS.bird, `EVENTS.bird.${key} がない`);
  assert.ok(Array.isArray(P.EVENTS.bird.huntSec) && P.EVENTS.bird.huntSec.length === 2, 'EVENTS.bird.huntSec は [最短, 最長]');
  return P.EVENTS.bird;
}

async function loadEvents() {
  const E = await import('../src/game/events.js');
  for (const name of ['createEventState', 'eventTick', 'eventAct', 'eventProp']) {
    assert.equal(typeof E[name], 'function', `events.js に ${name} がない`);
  }
  return E;
}

// huntFor = huntSec[0] + (huntSec[1] − huntSec[0]) × 乱数
const huntLength = (BIRD, v) => BIRD.huntSec[0] + (BIRD.huntSec[1] - BIRD.huntSec[0]) * v;

// 鳥の日の始まり：部屋の隅（距離100）でくつろいでいて、落ち着いている（警戒0）。時間はたっぷりある
function birdStart(createEventState, dayOverrides = {}) {
  return {
    ev: createEventState('bird'),
    cat: makeCat({ mode: 'relax', distance: MAX_VALUE, modeTimeLeft: 3 }),
    day: makeDay({ trust: 10, wariness: 0, timeLeft: 1000, ...dayOverrides }),
  };
}

// eventTick を DT ずつ呼び、各 tick の結果を時刻つきで記録する。until(r) が true になった tick で止める
function runTicks(eventTick, start, { personality = plain, rng = fixedRng(0.5), maxSec = 120, until = () => false } = {}) {
  const log = [];
  let cur = start;
  let t = 0;
  while (t < maxSec - 1e-9) {
    const r = eventTick(cur.ev, cur.cat, cur.day, personality, DT, rng);
    t += DT;
    log.push({ t, ...r });
    cur = { ev: r.ev, cat: r.cat, day: r.day };
    if (until(r)) return { log, last: cur, reached: true };
  }
  return { log, last: cur, reached: false };
}

// phase が変わった tick を区切りにして、[{ phase, at, index }] を返す（at はその phase になった tick の時刻）
function phaseSpans(log) {
  const spans = [];
  for (const [index, r] of log.entries()) {
    if (spans.length === 0 || spans[spans.length - 1].phase !== r.ev.phase) spans.push({ phase: r.ev.phase, at: r.t, index });
  }
  return spans;
}

// phase に n 回目に入った tick で止める（runTicks の until に渡す）
function untilEntered(phase, n, startPhase = 'approach') {
  let prev = startPhase;
  let count = 0;
  return (r) => {
    if (r.ev.phase !== prev && r.ev.phase === phase) count++;
    prev = r.ev.phase;
    return count >= n;
  };
}

// 鳥の流れを、ev.phase が phase になるまで進める
function reach(E, phase, { personality = plain, rng = fixedRng(0.5), dayOverrides = {} } = {}) {
  const { last, reached } = runTicks(E.eventTick, birdStart(E.createEventState, dayOverrides), { personality, rng, until: (r) => r.ev.phase === phase });
  assert.ok(reached, `phase '${phase}' になる前に上限に達した（このテストの前提）`);
  return last;
}

// hunt に入ってから、さらに sec 秒進める（hunt の途中の状態）
function reachHuntMiddle(E, BIRD, { personality = plain, sec = 1 } = {}) {
  const h = reach(E, 'hunt', { personality });
  assert.ok(sec < huntLength(BIRD, 0.5), `hunt の長さが ${sec}秒より短い（このテストの前提）`);
  const m = runTicks(E.eventTick, h, { personality, maxSec: sec });
  assert.equal(m.last.ev.phase, 'hunt', `hunt に入って ${sec}秒後も hunt のまま（このテストの前提）`);
  return m.last;
}

// ---------------------------------------------------------------- 1. 近づく → arrive → hunt

test('鳥の流れ：createEventState(bird) は approach・round 0・blinks 0。birdDistance まで歩く → arrive（cue なし・backTurn）→ arriveSec で hunt（backTurn・cue hunt）', async () => {
  const BIRD = await loadBird();
  const E = await loadEvents();
  const start = birdStart(E.createEventState);
  assert.equal(start.ev.phase, 'approach');
  assert.equal(start.ev.phaseT, 0);
  assert.equal(start.ev.done, false);
  assert.equal(start.ev.round, 0);
  assert.equal(start.ev.blinks, 0);

  const { log, reached } = runTicks(E.eventTick, start, { until: untilEntered('hunt', 1) });
  assert.ok(reached, 'hunt の前に上限に達した（このテストの前提）');
  const spans = phaseSpans(log);
  const order = spans.map((s) => s.phase);
  assert.deepEqual(order, ['approach', 'arrive', 'hunt'], `phase の順: ${order.join(' → ')}`);
  const [approach, arrive, hunt] = spans;

  // approach：くつろいで歩いて近づく。1 tick 目は approachSpeed×approachMul×dt だけ近づく
  const first = log[0];
  assert.equal(first.ev.phase, 'approach');
  assert.equal(first.cat.mode, 'relax');
  assert.equal(first.cat.walking, true);
  assert.ok(near(first.cat.distance, MAX_VALUE - plain.approachSpeed * start.day.approachMul * DT), `1 tick 目の距離 ${first.cat.distance}`);
  for (const r of log.slice(approach.index, arrive.index)) {
    assert.equal(r.cat.mode, 'relax', `approach 中の猫の様子（${r.t.toFixed(2)}秒）`);
    assert.ok(r.cat.distance >= BIRD.birdDistance, `approach 中の距離 ${r.cat.distance}`);
    if (r.cat.distance > BIRD.birdDistance) assert.equal(r.cat.walking, true, `approach 中に歩いていない（${r.t.toFixed(2)}秒）`);
  }

  // arrive：birdDistance で止まり、backTurn。arrive に入るときは cue なし
  assert.equal(log[arrive.index].cat.distance, BIRD.birdDistance);
  assert.equal(log[arrive.index].ev.round, 0);
  for (const r of log.slice(arrive.index, hunt.index)) {
    assert.equal(r.cat.mode, 'backTurn', `arrive 中の猫の様子（${r.t.toFixed(2)}秒）`);
    assert.ok(!r.cat.walking, `arrive 中に歩いている（${r.t.toFixed(2)}秒）`);
  }
  assert.ok(near(hunt.at - arrive.at, BIRD.arriveSec, TOL), `arrive の長さ ${hunt.at - arrive.at}`);

  // cue は hunt に入った tick の 'hunt' だけ
  const cues = log.flatMap((r, i) => r.cues.map((c) => [i, c]));
  assert.deepEqual(cues, [[hunt.index, 'hunt']], 'cue');
  assert.equal(log[hunt.index].cat.mode, 'backTurn');
});

// ---------------------------------------------------------------- 2. hunt の間の信頼（backTurn の分）

test('hunt の間：信頼が毎 tick (calmTrustPerSec + backTurnTrustPerSec×likes.patience)×dt×trustRate 増え、ツンデレ > ビビり > 甘えん坊', async () => {
  const BIRD = await loadBird();
  const E = await loadEvents();
  const trustRate = 0.8;
  const totals = {};
  for (const key of ['tsundere', 'bibiri', 'amaenbo']) {
    const personality = PERSONALITIES[key];
    const { log, reached } = runTicks(E.eventTick, birdStart(E.createEventState, { trustRate }), { personality, until: untilEntered('leave', 1) });
    assert.ok(reached, `${key}：leave の前に上限に達した（このテストの前提）`);
    const spans = phaseSpans(log);
    const hunt = spans.find((s) => s.phase === 'hunt');
    const leave = spans.find((s) => s.phase === 'leave');
    assert.ok(hunt && leave, `${key}：hunt・leave がない（このテストの前提）`);
    const perTick = (RULES.calmTrustPerSec * DT + RULES.backTurnTrustPerSec * DT * personality.likes.patience) * trustRate;
    let total = 0;
    // hunt に入った次の tick から、leave に入る前の tick まで（前後の tick も hunt のところ）
    for (let i = hunt.index + 1; i < leave.index; i++) {
      const gain = log[i].day.trust - log[i - 1].day.trust;
      assert.ok(near(gain, perTick), `${key}：${log[i].t.toFixed(2)}秒の信頼の増え ${gain}（期待 ${perTick}）`);
      total += gain;
    }
    assert.ok(leave.index - hunt.index - 1 > 0, `${key}：hunt の途中の tick がない（このテストの前提）`);
    totals[key] = total;
  }
  assert.ok(totals.tsundere > totals.bibiri, `ツンデレ ${totals.tsundere} がビビり ${totals.bibiri} 以下`);
  assert.ok(totals.bibiri > totals.amaenbo, `ビビり ${totals.bibiri} が甘えん坊 ${totals.amaenbo} 以下`);
});

// ---------------------------------------------------------------- 3. hunt の終わり → leave（我慢のごほうび）

test('hunt は huntSec の範囲のあと leave。最初に見守れた回なので cue は understood だけ（left なし）、信頼 +(patienceTrust×likes.patience＋doneTrust)×trustRate。leave も backTurn', async () => {
  const BIRD = await loadBird();
  const E = await loadEvents();
  const personality = PERSONALITIES.tsundere;
  const trustRate = 0.5;
  for (const v of [0, 0.5, 0.999]) {
    const { log, reached } = runTicks(E.eventTick, birdStart(E.createEventState, { trustRate }), { personality, rng: fixedRng(v), until: untilEntered('leave', 1) });
    assert.ok(reached, `乱数 ${v}：leave の前に上限に達した（このテストの前提）`);
    const spans = phaseSpans(log);
    const hunt = spans.find((s) => s.phase === 'hunt');
    const leave = spans.find((s) => s.phase === 'leave');
    assert.ok(near(leave.at - hunt.at, huntLength(BIRD, v), TOL), `乱数 ${v}：hunt の長さ ${leave.at - hunt.at}（期待 ${huntLength(BIRD, v)}）`);
    for (const r of log.slice(hunt.index, leave.index)) assert.equal(r.cat.mode, 'backTurn', `乱数 ${v}：hunt 中の猫の様子（${r.t.toFixed(2)}秒）`);

    const understoods = log.flatMap((r, i) => (r.cues.includes('understood') ? [i] : []));
    assert.deepEqual(understoods, [leave.index], `乱数 ${v}：understood の cue`);
    assert.deepEqual(log[leave.index].cues, ['understood'], `乱数 ${v}：leave に入った tick の cue`);
    assert.ok(!log.some((r) => r.cues.includes('left')), `乱数 ${v}：最初に見守れた回に left の cue が出た`);
    const tick = log[leave.index];
    assert.equal(tick.cat.mode, 'backTurn', `乱数 ${v}：leave の猫の様子`);
    // leave に入った tick：落ち着いている分・背中を向けている分・我慢のごほうび・わかってくれたごほうび（doneTrust）に、trustRate がかかる
    const prev = log[leave.index - 1].day.trust;
    const expected = prev + (RULES.calmTrustPerSec * DT + RULES.backTurnTrustPerSec * DT * personality.likes.patience + RULES.patienceTrust * personality.likes.patience + BIRD.doneTrust) * trustRate;
    assert.ok(near(tick.day.trust, expected), `乱数 ${v}：leave の tick の信頼 ${tick.day.trust}（期待 ${expected}）`);
  }
});

// ---------------------------------------------------------------- 4. turn でのまばたき

test('turn 中のまばたき（plain）：applyAction を look で呼んだのと同じ day・feedback（blinkBack）。blinks+1 で happy（purr）、happySec 後にその回が終わり round+1 で arrive', async () => {
  const BIRD = await loadBird();
  const E = await loadEvents();
  assert.ok(BIRD.rounds >= 2, 'rounds が 2 以上（このテストの前提）');
  const s = reach(E, 'turn');
  assert.equal(s.cat.mode, 'look', 'turn の猫の様子');
  assert.equal(s.ev.round, 0);
  const expected = applyAction(blink(1000), { ...s.cat, mode: 'look' }, s.day, plain);
  assert.equal(expected.feedback, 'blinkBack', 'applyAction の結果（このテストの前提）');
  const r = E.eventAct(blink(1000), s.ev, s.cat, s.day, plain);
  assert.ok(r, 'eventAct が null を返した');
  assert.equal(r.feedback, 'blinkBack');
  assert.deepEqual(r.day, expected.day);
  assert.equal(r.mistake, false);
  assert.equal(r.ev.phase, 'happy');
  assert.equal(r.ev.blinks, s.ev.blinks + 1);
  assert.equal(r.cat.mode, 'purr');

  const h = runTicks(E.eventTick, { ev: r.ev, cat: r.cat, day: r.day }, { until: (x) => x.ev.phase !== 'happy' });
  assert.ok(h.reached, 'happy が終わらない');
  for (const x of h.log.slice(0, -1)) assert.equal(x.cat.mode, 'purr', `happy 中の猫の様子（${x.t.toFixed(2)}秒）`);
  assert.ok(near(h.log[h.log.length - 1].t, BIRD.happySec, TOL), `happy の長さ ${h.log[h.log.length - 1].t}`);
  assert.equal(h.last.ev.phase, 'arrive');
  assert.equal(h.last.ev.round, 1);
  assert.equal(h.last.cat.mode, 'backTurn');
});

test('turn 中のまばたき（ツンデレのツン）：applyAction を look で呼んだのと同じ day・feedback（blinkAway、信頼 −shyPenalty）。shy（relax）になり blinks は増えない。happySec 後に round+1 で arrive', async () => {
  const BIRD = await loadBird();
  const E = await loadEvents();
  assert.ok(BIRD.rounds >= 2, 'rounds が 2 以上（このテストの前提）');
  const tsundere = PERSONALITIES.tsundere;
  // 最初に見守れた回の leave で doneTrust が入っても turn でまだツンの間になるよう、信頼 0 から始める
  const s = reach(E, 'turn', { personality: tsundere, dayOverrides: { trust: 0 } });
  assert.ok(s.day.trust < tsundere.shyUntil, `信頼 ${s.day.trust} が shyUntil 以上（このテストの前提）`);
  const expected = applyAction(blink(1000), { ...s.cat, mode: 'look' }, s.day, tsundere);
  assert.equal(expected.feedback, 'blinkAway', 'applyAction の結果（このテストの前提）');
  const r = E.eventAct(blink(1000), s.ev, s.cat, s.day, tsundere);
  assert.ok(r, 'eventAct が null を返した');
  assert.equal(r.feedback, 'blinkAway');
  assert.deepEqual(r.day, expected.day);
  assert.equal(r.day.trust, s.day.trust - RULES.blink.shyPenalty);
  assert.equal(r.mistake, false);
  assert.equal(r.ev.phase, 'shy');
  assert.equal(r.ev.blinks, s.ev.blinks);
  assert.equal(r.cat.mode, 'relax');

  const h = runTicks(E.eventTick, { ev: r.ev, cat: r.cat, day: r.day }, { personality: tsundere, until: (x) => x.ev.phase !== 'shy' });
  assert.ok(h.reached, 'shy が終わらない');
  for (const x of h.log.slice(0, -1)) assert.equal(x.cat.mode, 'relax', `shy 中の猫の様子（${x.t.toFixed(2)}秒）`);
  assert.ok(near(h.log[h.log.length - 1].t, BIRD.happySec, TOL), `shy の長さ ${h.log[h.log.length - 1].t}`);
  assert.equal(h.last.ev.phase, 'arrive');
  assert.equal(h.last.ev.round, 1);
});

// ---------------------------------------------------------------- 5. 背中へのまばたき

test('hunt 中（背中）のまばたき：applyAction を backTurn で呼んだのと同じ day・feedback（stare）。警戒 +missWariness×warinessMul、信頼は増えない、phase は hunt のまま', async () => {
  const BIRD = await loadBird();
  const E = await loadEvents();
  const s = reachHuntMiddle(E, BIRD);
  const expected = applyAction(blink(1000), { ...s.cat, mode: 'backTurn' }, s.day, plain);
  assert.equal(expected.feedback, 'stare', 'applyAction の結果（このテストの前提）');
  const r = E.eventAct(blink(1000), s.ev, s.cat, s.day, plain);
  assert.ok(r, 'eventAct が null を返した');
  assert.equal(r.feedback, 'stare');
  assert.deepEqual(r.day, expected.day);
  assert.equal(r.day.trust, s.day.trust);
  assert.equal(r.day.wariness, Math.min(MAX_VALUE, s.day.wariness + RULES.blink.missWariness * plain.warinessMul));
  assert.equal(r.mistake, false);
  assert.equal(r.ev.phase, 'hunt');
  assert.equal(r.ev.blinks, s.ev.blinks);
  assert.equal(r.ev.round, s.ev.round);
});

// ---------------------------------------------------------------- 6. arrive・hunt・leave・turn でなでる

test('arrive・hunt・leave・turn でなでる：その phase の様子（backTurn・look）で applyAction を呼んだのと同じ。逃げてミス、round+1・approach。ごほうび（left）なしで歩き直し、次の回の arrive', async () => {
  const BIRD = await loadBird();
  const E = await loadEvents();
  assert.ok(BIRD.rounds >= 2, 'rounds が 2 以上（このテストの前提）');
  const states = {
    arrive: [reach(E, 'arrive'), 'backTurn'],
    hunt: [reachHuntMiddle(E, BIRD), 'backTurn'],
    leave: [reach(E, 'leave'), 'backTurn'],
    turn: [reach(E, 'turn'), 'look'],
  };
  // 歩き直しの間に増えてよい信頼の上限（落ち着いている分と背中を向けている分。我慢のごほうびは入らない）
  const maxGain = (RULES.calmTrustPerSec + RULES.backTurnTrustPerSec * plain.likes.patience) * DT * 1 + 1e-9;
  for (const [phase, [s, mode]] of Object.entries(states)) {
    assert.equal(s.ev.phase, phase, `${phase}（このテストの前提）`);
    assert.equal(s.ev.round, 0, `${phase}：round 0（このテストの前提）`);
    const expected = applyAction(pet, { ...s.cat, mode }, s.day, plain);
    const r = E.eventAct(pet, s.ev, s.cat, s.day, plain);
    assert.ok(r, `${phase}：eventAct が null を返した`);
    assert.equal(r.feedback, 'flee', phase);
    assert.equal(r.mistake, true, phase);
    assert.equal(r.day.trust, s.day.trust - RULES.mistakeTrust, phase);
    assert.equal(r.day.mistakes, s.day.mistakes + 1, phase);
    assert.deepEqual(r.day, expected.day, phase);
    assert.equal(r.cat.mode, 'flee', phase);
    assert.equal(r.cat.distance, expected.cat.distance, phase);
    assert.equal(r.ev.round, s.ev.round + 1, `${phase}：round`);
    assert.equal(r.ev.phase, 'approach', phase);

    // 逃げ終わったら birdDistance まで歩き直し、次の回の arrive に入る。その間 left は出ず、我慢のごほうびも入らない
    const again = runTicks(E.eventTick, { ev: r.ev, cat: r.cat, day: r.day }, { until: (x) => x.ev.phase === 'arrive' });
    assert.ok(again.reached, `${phase}：逃げたあと arrive しないまま上限に達した`);
    assert.ok(!again.log.some((x) => x.cues.includes('left')), `${phase}：なでたあとに left の cue が出た`);
    let prevTrust = r.day.trust;
    for (const x of again.log) {
      assert.ok(x.day.trust - prevTrust <= maxGain, `${phase}：${x.t.toFixed(2)}秒に信頼が ${x.day.trust - prevTrust} 増えた`);
      prevTrust = x.day.trust;
    }
    assert.equal(again.last.cat.distance, BIRD.birdDistance, `${phase}：歩き直したあとの距離`);
    assert.equal(again.last.ev.round, s.ev.round + 1, `${phase}：次の回の round`);
    assert.equal(again.last.cat.mode, 'backTurn', `${phase}：次の回の arrive の猫の様子`);
  }
});

// ---------------------------------------------------------------- 7. 何も起きないなで方・approach でなでる

test('happy 中・逃げている最中になでても何も起きない：feedback null・ミスではない・信頼と警戒そのまま', async () => {
  await loadBird();
  const E = await loadEvents();
  const t = reach(E, 'turn');
  const happy = E.eventAct(blink(1000), t.ev, t.cat, t.day, plain);
  assert.equal(happy.ev.phase, 'happy', 'まばたきで happy にならない（このテストの前提）');
  const h = E.eventAct(pet, happy.ev, happy.cat, happy.day, plain);
  assert.ok(h, 'happy：eventAct が null を返した');
  assert.equal(h.feedback, null, 'happy');
  assert.equal(h.mistake, false, 'happy');
  assert.equal(h.day.trust, happy.day.trust, 'happy');
  assert.equal(h.day.wariness, happy.day.wariness, 'happy');
  assert.equal(h.day.mistakes, happy.day.mistakes, 'happy');
  assert.equal(h.ev.phase, 'happy');
  assert.equal(h.ev.round, happy.ev.round);

  // turn でなでて逃げた直後に、もう一度なでる
  const t2 = reach(E, 'turn');
  const fled = E.eventAct(pet, t2.ev, t2.cat, t2.day, plain);
  assert.equal(fled.cat.mode, 'flee', '1回目になでて逃げる（このテストの前提）');
  const f = E.eventAct(pet, fled.ev, fled.cat, fled.day, plain);
  assert.ok(f, '逃げている最中：eventAct が null を返した');
  assert.equal(f.feedback, null, '逃げている最中');
  assert.equal(f.mistake, false, '逃げている最中');
  assert.equal(f.day.trust, fled.day.trust, '逃げている最中');
  assert.equal(f.day.wariness, fled.day.wariness, '逃げている最中');
  assert.equal(f.day.mistakes, fled.day.mistakes, '逃げている最中');
  assert.equal(f.ev.round, fled.ev.round, '逃げている最中の round');
});

test('approach 中になでる：applyAction を relax で呼んだのと同じく逃げてミス。phase は approach のまま、round は増えない', async () => {
  await loadBird();
  const E = await loadEvents();
  const start = { ...birdStart(E.createEventState), cat: makeCat({ mode: 'relax', distance: 70, modeTimeLeft: 3 }) };
  const s = runTicks(E.eventTick, start, { maxSec: DT }).last;
  assert.equal(s.ev.phase, 'approach', 'approach のまま（このテストの前提）');
  const expected = applyAction(pet, { ...s.cat, mode: 'relax' }, s.day, plain);
  const r = E.eventAct(pet, s.ev, s.cat, s.day, plain);
  assert.ok(r, 'eventAct が null を返した');
  assert.equal(r.feedback, 'flee');
  assert.equal(r.mistake, true);
  assert.equal(r.cat.mode, 'flee');
  assert.equal(r.cat.distance, expected.cat.distance);
  assert.equal(r.day.trust, s.day.trust - RULES.mistakeTrust);
  assert.equal(r.day.mistakes, s.day.mistakes + 1);
  assert.deepEqual(r.day, expected.day);
  assert.equal(r.ev.phase, 'approach');
  assert.equal(r.ev.round, s.ev.round);
  assert.equal(r.ev.round, 0);
});

// ---------------------------------------------------------------- 8. まばたきしなくても rounds 回で done

// まばたきもなでもせずに、done の tick まで進める
function finishBird(E, dayOverrides = {}, opts = {}) {
  const o = runTicks(E.eventTick, birdStart(E.createEventState, dayOverrides), { ...opts, until: (r) => r.ev.done });
  assert.ok(o.reached, 'done にならないまま上限に達した');
  return o;
}

test('まばたきしなくても rounds 回で done。understood は1回目の leave で1回、left は2回目以降の leave で rounds−1 回。done の tick は信頼の追加も cue もなし', async () => {
  const BIRD = await loadBird();
  const E = await loadEvents();
  const trustRate = 0.5;
  const { log, last } = finishBird(E, { trustRate });
  const doneTick = log[log.length - 1];
  const before = log.slice(0, -1);

  // phase の順と長さ（done の tick は除く）
  const spans = phaseSpans(before);
  const order = spans.map((s) => s.phase);
  const expectedOrder = ['approach', ...Array.from({ length: BIRD.rounds }, () => ['arrive', 'hunt', 'leave', 'turn']).flat()];
  assert.deepEqual(order, expectedOrder, `phase の順: ${order.join(' → ')}`);
  const lengths = { arrive: BIRD.arriveSec, hunt: huntLength(BIRD, 0.5), leave: BIRD.leaveSec, turn: BIRD.turnSec };
  for (let i = 1; i < spans.length; i++) {
    const end = i + 1 < spans.length ? spans[i + 1].at : doneTick.t;
    const len = end - spans[i].at;
    assert.ok(near(len, lengths[spans[i].phase], TOL), `${i}番目の ${spans[i].phase} の長さ ${len}（期待 ${lengths[spans[i].phase]}）`);
  }
  // k 回目の arrive の round は k−1
  const arrives = spans.filter((s) => s.phase === 'arrive');
  arrives.forEach((s, k) => assert.equal(before[s.index].ev.round, k, `${k + 1}回目の arrive の round`));
  // 2回目以降の arrive は、その場で始まる（歩かない・backTurn）
  for (const s of arrives.slice(1)) {
    assert.equal(before[s.index].cat.distance, BIRD.birdDistance);
    assert.equal(before[s.index].cat.mode, 'backTurn');
  }

  // cue の数
  const cues = log.flatMap((r) => r.cues);
  assert.equal(cues.filter((c) => c === 'hunt').length, BIRD.rounds, 'hunt の cue の数');
  assert.equal(cues.filter((c) => c === 'left').length, BIRD.rounds - 1, 'left の cue の数');
  assert.equal(cues.filter((c) => c === 'understood').length, 1, 'understood の cue の数');
  // 1回目の leave に入った tick は understood だけ、2回目以降の leave に入った tick は left だけ
  const leaves = spans.filter((s) => s.phase === 'leave');
  assert.equal(leaves.length, BIRD.rounds, 'leave の数（このテストの前提）');
  leaves.forEach((s, k) => assert.deepEqual(before[s.index].cues, k === 0 ? ['understood'] : ['left'], `${k + 1}回目の leave に入った tick の cue`));

  // done の tick：done・relax・まばたき0回。cue はなく、信頼は落ち着いている分（trustRate つき）だけ
  assert.equal(doneTick.ev.done, true);
  assert.equal(doneTick.ev.blinks, 0);
  assert.equal(doneTick.cat.mode, 'relax');
  assert.deepEqual(doneTick.cues, [], 'done の tick の cue');
  const prevTrust = before[before.length - 1].day.trust;
  const expected = Math.min(MAX_VALUE, prevTrust + RULES.calmTrustPerSec * DT * trustRate);
  assert.ok(near(doneTick.day.trust, expected), `done の tick の信頼 ${doneTick.day.trust}（期待 ${expected}）`);

  // そのあと eventTick が呼ばれても、cue は出ず、信頼も落ち着いている分より増えない
  let cur = last;
  for (let i = 0; i < 5; i++) {
    const r = E.eventTick(cur.ev, cur.cat, cur.day, plain, DT, fixedRng(0.5));
    assert.deepEqual(r.cues, [], `done のあと ${i + 1} tick 目の cue`);
    assert.equal(r.ev.done, true);
    assert.ok(r.day.trust <= cur.day.trust + RULES.calmTrustPerSec * DT * trustRate + 1e-9, `done のあと ${i + 1} tick 目に信頼が ${r.day.trust - cur.day.trust} 増えた`);
    cur = { ev: r.ev, cat: r.cat, day: r.day };
  }
});

test('鳥の done のあとの eventAct は null（まばたき・なでるとも）', async () => {
  await loadBird();
  const E = await loadEvents();
  const { last } = finishBird(E);
  assert.equal(last.ev.done, true, 'done になっていない（このテストの前提）');
  assert.equal(E.eventAct(blink(1000), last.ev, { ...last.cat, mode: 'look' }, last.day, plain), null);
  assert.equal(E.eventAct({ type: 'blink', holdMs: 1000, sawLook: true }, last.ev, last.cat, last.day, plain), null);
  assert.equal(E.eventAct(blink(1000), last.ev, last.cat, last.day, plain), null);
  assert.equal(E.eventAct(pet, last.ev, last.cat, last.day, plain), null);
});

// ---------------------------------------------------------------- 9. 前の晩の段ボールのあとに始まる

const BIRD_DAY = 4;
const birdEvents = () => Array.from({ length: MAX_DAY }, (_, i) => (i === BIRD_DAY - 1 ? 'bird' : null));

test('鳥の日・前の晩に段ボール：boxLockLeft > 0 の間は inBox のまま歩かず（phase approach）boxLockLeft が dt ずつ減り、0 になってから birdDistance へ歩いて arrive', async () => {
  const BIRD = await loadBird();
  const E = await loadEvents();
  const { createGame, startDay } = await import('../src/game/progression.js');
  const personality = PERSONALITIES.amaenbo;
  const game = { ...createGame({ personality: 'amaenbo', seed: 1, events: birdEvents() }), day: BIRD_DAY, trust: 10, nightChoice: 'box' };
  const s = startDay(game);
  assert.equal(s.day.event, 'bird', '4日目が鳥の日（このテストの前提）');
  assert.equal(s.cat.mode, 'inBox', '前の晩に段ボールなら inBox で始まる（このテストの前提）');
  assert.equal(s.day.boxLockLeft, personality.boxLockSec, 'boxLockLeft は boxLockSec で始まる（このテストの前提）');
  const start = { ev: E.createEventState('bird'), cat: s.cat, day: s.day };

  // boxLockLeft が 0 になったあと、2 tick 進める
  let zeroAt = -1;
  const { log, reached } = runTicks(E.eventTick, start, {
    personality,
    until: (r) => {
      if (zeroAt < 0 && r.day.boxLockLeft === 0) zeroAt = 0;
      else if (zeroAt >= 0) zeroAt++;
      return zeroAt >= 2;
    },
  });
  const zeroIndex = log.findIndex((r) => r.day.boxLockLeft === 0);
  let prevLock = start.day.boxLockLeft;
  for (const r of log.slice(0, zeroIndex < 0 ? log.length : zeroIndex)) {
    const label = `${r.t.toFixed(2)}秒`;
    assert.equal(r.cat.mode, 'inBox', `boxLockLeft > 0 の間の猫の様子（${label}）`);
    assert.ok(!r.cat.walking, `boxLockLeft > 0 の間に歩いている（${label}）`);
    assert.equal(r.cat.distance, MAX_VALUE, `boxLockLeft > 0 の間の距離（${label}）`);
    assert.equal(r.ev.phase, 'approach', `boxLockLeft > 0 の間の phase（${label}）`);
    assert.ok(near(r.day.boxLockLeft, prevLock - DT, 1e-6), `boxLockLeft ${r.day.boxLockLeft}（${label}、前の tick ${prevLock}）`);
    prevLock = r.day.boxLockLeft;
  }
  assert.ok(reached, 'boxLockLeft が 0 にならないまま上限に達した');
  assert.ok(near(log[zeroIndex].t, personality.boxLockSec, TOL), `boxLockLeft が 0 になった時刻 ${log[zeroIndex].t}`);
  assert.equal(log[zeroIndex].ev.phase, 'approach');
  // 0 になった次の tick：くつろいで歩く（approachSpeed×approachMul×dt だけ近づく）
  const walk = log[zeroIndex + 1];
  assert.equal(walk.cat.mode, 'relax', '0 になったあとの猫の様子');
  assert.equal(walk.cat.walking, true, '0 になったあと歩いていない');
  assert.equal(walk.ev.phase, 'approach');
  const before = log[zeroIndex].cat.distance;
  assert.ok(near(walk.cat.distance, before - personality.approachSpeed * s.day.approachMul * DT), `0 になったあとの距離 ${walk.cat.distance}（前の tick ${before}）`);

  // birdDistance まで歩いて arrive
  const toWindow = runTicks(E.eventTick, { ev: walk.ev, cat: walk.cat, day: walk.day }, { personality, until: (r) => r.ev.phase === 'arrive' });
  assert.ok(toWindow.reached, 'arrive しないまま上限に達した');
  assert.equal(toWindow.last.cat.distance, BIRD.birdDistance);
  assert.equal(toWindow.last.cat.mode, 'backTurn');
  assert.equal(toWindow.last.ev.round, 0);
});

// ---------------------------------------------------------------- 11. 昼の画面（dayScene）

// 昼の画面を作り、トースト・止めるカード・onEnd を記録する。session を渡すと、それを使う（同じプレイの続き）
async function birdDayScene({ personality = 'amaenbo', day = BIRD_DAY, events = birdEvents(), trust = 0, seenCards = null, rng = fixedRng(0.5), session = null } = {}) {
  const { createDayScene } = await import('../src/scenes/dayScene.js');
  const { createGame } = await import('../src/game/progression.js');
  const { CARDS } = await import('../src/data/texts.js');
  const noop = () => {};
  const toasts = [];
  const cards = [];
  const overlay = {
    busy: false,
    splash: noop,
    card: (c) => cards.push(c),
    bubble: noop,
    toast: (text, ms) => toasts.push({ text, ms }),
    clear: noop,
  };
  const hud = { show: noop, update: noop };
  const renderer = { addEffect: noop, hitTestCat: () => true };
  const input = { setBlinkEnabled: noop, holdMs: () => 0 };
  const sound = { purr: noop, meow: noop, bump: noop };
  const s = session ?? {
    game: { ...createGame({ personality, seed: 1 }), day, trust, catName: 'たま', events, seenCards: seenCards ?? Object.keys(CARDS) },
    misses: {},
  };
  const ends = [];
  const scene = createDayScene({ session: s, overlay, hud, renderer, input, sound, rng, onEnd: (r) => ends.push(r) });
  return { scene, session: s, toasts, cards, ends };
}

async function birdText(key) {
  const { EVENT_TEXT, withName } = await import('../src/data/texts.js');
  assert.ok(EVENT_TEXT && EVENT_TEXT.bird, 'texts.js に EVENT_TEXT.bird がない');
  assert.equal(typeof EVENT_TEXT.bird[key], 'string', `EVENT_TEXT.bird.${key} がない`);
  return withName(EVENT_TEXT.bird[key], 'たま');
}

test("昼の画面：鳥の日の始めに event:bird の説明カード（pause: true、title 'イベント：窓の外に鳥'）を1回だけ出す。同じプレイでもう一度鳥の昼を始めても出さない", async () => {
  const { CARDS, withName } = await import('../src/data/texts.js');
  const card = CARDS['event:bird'];
  assert.ok(card, "CARDS['event:bird'] がない");
  assert.equal(card.pause, true, "CARDS['event:bird'] は止めるカード（pause: true）");
  assert.equal(card.title, 'イベント：窓の外に鳥');
  assert.equal(typeof card.body, 'string', "CARDS['event:bird'].body がない");
  const expected = { title: withName(card.title, 'たま'), body: withName(card.body, 'たま') };
  const first = await birdDayScene({ seenCards: Object.keys(CARDS).filter((k) => k !== 'event:bird') });
  for (let i = 0; i < 20; i++) first.scene.update(DT);
  assert.deepEqual(first.cards, [expected]);
  assert.ok(first.session.game.seenCards.includes('event:bird'), 'seenCards に event:bird が入っていない');
  const second = await birdDayScene({ session: first.session });
  for (let i = 0; i < 20; i++) second.scene.update(DT);
  assert.deepEqual(second.cards, [], '2回目の鳥の昼でもカードが出た');
});

test('昼の画面：cue hunt・understood・left のトーストを出す（hunt は rounds 回、understood は1回目の leave、left は2回目以降の leave）。done になってもトーストは足さない', async () => {
  const BIRD = await loadBird();
  const hunt = await birdText('hunt');
  const understood = await birdText('understood');
  const left = await birdText('left');
  const { EVENT_TEXT, withName } = await import('../src/data/texts.js');
  const birdTexts = Object.values(EVENT_TEXT.bird).map((s) => withName(s, 'たま'));
  const { scene, toasts } = await birdDayScene();
  const seen = [];
  let doneToasts = null;
  for (let i = 0; i < 2000 && scene.view().prop?.phase !== 'done'; i++) {
    const n = toasts.length;
    scene.update(DT);
    const added = toasts.slice(n);
    for (const t of added) {
      if ([hunt, understood, left].includes(t.text)) seen.push({ text: t.text, phase: scene.view().prop?.phase });
    }
    if (scene.view().prop?.phase === 'done') doneToasts = added.map((t) => t.text);
  }
  assert.equal(scene.view().prop?.phase, 'done', 'done にならないまま進めた（このテストの前提）');
  assert.ok(scene.state().day.timeLeft > 0, 'done の前に時間切れになった（このテストの前提）');
  const list = toasts.map((t) => t.text).join(' / ');
  assert.equal(toasts.filter((t) => t.text === hunt).length, BIRD.rounds, `hunt のトースト: ${list}`);
  assert.equal(toasts.filter((t) => t.text === understood).length, 1, `understood のトースト: ${list}`);
  assert.equal(toasts.filter((t) => t.text === left).length, BIRD.rounds - 1, `left のトースト: ${list}`);
  const expected = [
    { text: hunt, phase: 'hunt' },
    { text: understood, phase: 'leave' },
    ...Array.from({ length: BIRD.rounds - 1 }, () => [{ text: hunt, phase: 'hunt' }, { text: left, phase: 'leave' }]).flat(),
  ];
  assert.deepEqual(seen, expected);
  // done になった update で増えたトーストに、EVENT_TEXT.bird の文はない
  assert.ok(doneToasts, 'done になった update を記録できていない（このテストの前提）');
  assert.deepEqual(doneToasts.filter((t) => birdTexts.includes(t)), [], `done になった update のトースト: ${doneToasts.join(' / ')}`);
});

test("昼の画面の view().prop：鳥の日は kind 'bird'（phase つき）", async () => {
  await loadBird();
  const { scene } = await birdDayScene();
  scene.update(DT);
  const prop = scene.view().prop;
  assert.ok(prop, `鳥の日の view().prop が ${prop}`);
  assert.equal(prop.kind, 'bird');
  assert.equal(typeof prop.phase, 'string');
});

test('昼の画面：鳥の日も、時間切れ（timeLeft 0）で日が終わり、onEnd が1回呼ばれる', async () => {
  await loadBird();
  const { scene, ends } = await birdDayScene();
  const durationSec = DAYS[BIRD_DAY - 1].durationSec;
  for (let i = 0; i < Math.floor((durationSec - 1) / DT); i++) scene.update(DT);
  assert.deepEqual(ends, [], '時間切れの前に日が終わった');
  for (let i = 0; i < Math.ceil(5 / DT); i++) scene.update(DT);
  assert.equal(ends.length, 1, 'onEnd の呼ばれた回数');
  assert.equal(ends[0].lapped, false);
  assert.equal(scene.state().day.timeLeft, 0);
});

// ---------------------------------------------------------------- 11. 描画（窓の外の鳥）

// 文字の描画（fillText）を、フレームごとに記録する偽の Canvas（tests/events.test.js と同じ作り）
function textFrameCanvas() {
  const frame = { texts: [] };
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'fillText') return (text) => frame.texts.push(String(text));
      return () => {};
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
  const canvas = { width: 360, height: 640, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 640 }) };
  return { canvas, frame };
}

// 何フレームか描いてから、最後のフレームに描かれた文字を返す
function drawnTexts(view) {
  const { canvas, frame } = textFrameCanvas();
  const r = createRenderer(canvas);
  for (let t = 1; t < 1.5; t += DT) r.draw(view, t, DT);
  frame.texts = [];
  r.draw(view, 1.5, DT);
  return frame.texts;
}

test("描画：view.prop が { kind: 'bird', phase: 'hunt' } で猫が backTurn なら「カカカ」を描く", async () => {
  const BIRD = await loadBird();
  const texts = drawnTexts({ scene: 'day', wariness: 0, cat: { mode: 'backTurn', distance: BIRD.birdDistance }, prop: { kind: 'bird', phase: 'hunt', phaseT: 0.5 } });
  assert.ok(texts.includes('カカカ'), `「カカカ」がない: ${texts.join(' / ')}`);
});

test('描画：prop が null の日・箱の日では、猫が backTurn でも「カカカ」を描かない', async () => {
  const P = await import('../src/data/params.js');
  const boxDistance = P.EVENTS.box.boxDistance;
  const views = [
    ['prop が null の昼（backTurn）', { scene: 'day', wariness: 0, cat: { mode: 'backTurn', distance: 55 }, prop: null }],
    ['prop の無い昼（backTurn）', { scene: 'day', wariness: 0, cat: { mode: 'backTurn', distance: 55 } }],
    ['箱の日（hide・relax）', { scene: 'day', wariness: 0, cat: { mode: 'relax', distance: boxDistance }, prop: { kind: 'parcel', phase: 'hide', phaseT: 0.5 } }],
    ['箱の日（arrive・backTurn）', { scene: 'day', wariness: 0, cat: { mode: 'backTurn', distance: boxDistance }, prop: { kind: 'parcel', phase: 'arrive', phaseT: 0.5 } }],
  ];
  for (const [label, view] of views) {
    const texts = drawnTexts(view);
    assert.ok(!texts.includes('カカカ'), `${label}で「カカカ」が描かれている`);
  }
});

test("描画：prop { kind: 'bird' } のどの phase（approach・arrive・hunt・leave・turn・happy・shy・done）でも例外を出さない", async () => {
  const BIRD = await loadBird();
  const poses = { approach: 'relax', arrive: 'backTurn', hunt: 'backTurn', leave: 'backTurn', turn: 'look', happy: 'purr', shy: 'relax', done: 'relax' };
  for (const [phase, mode] of Object.entries(poses)) {
    const distance = phase === 'approach' ? 80 : BIRD.birdDistance;
    let texts = null;
    assert.doesNotThrow(() => {
      texts = drawnTexts({ scene: 'day', wariness: 0, cat: { mode, distance, walking: phase === 'approach' }, prop: { kind: 'bird', phase, phaseT: 0.5 } });
    }, `phase ${phase} で例外`);
    assert.ok(Array.isArray(texts), `phase ${phase}：描画が最後まで進んでいない`);
  }
});

// ---------------------------------------------------------------- 追加：最後の回でなでる・arrive と leave の信頼・turn 以外の sawLook

test('最後の回の hunt でなでる：歩き直して birdDistance に着いたら arrive に行かずに done。done の tick は信頼の追加も cue もなし（1回目で understood 済み）', async () => {
  const BIRD = await loadBird();
  const E = await loadEvents();
  const trustRate = 0.5;
  // 最後の回の hunt に入ってから、さらに1秒進める
  const toLast = runTicks(E.eventTick, birdStart(E.createEventState, { trustRate }), { until: (r) => r.ev.phase === 'hunt' && r.ev.round === BIRD.rounds - 1 });
  assert.ok(toLast.reached, '最後の回の hunt の前に上限に達した（このテストの前提）');
  assert.equal(toLast.log.flatMap((x) => x.cues).filter((c) => c === 'understood').length, 1, '1回目で understood が出ている（このテストの前提）');
  const m = runTicks(E.eventTick, toLast.last, { maxSec: 1 });
  const s = m.last;
  assert.equal(s.ev.phase, 'hunt', '最後の回の hunt の途中（このテストの前提）');
  assert.equal(s.ev.round, BIRD.rounds - 1, '最後の回（このテストの前提）');
  assert.equal(s.ev.done, false, 'まだ done ではない（このテストの前提）');

  const r = E.eventAct(pet, s.ev, s.cat, s.day, plain);
  assert.ok(r, 'eventAct が null を返した');
  assert.equal(r.feedback, 'flee');
  assert.equal(r.mistake, true);
  assert.equal(r.cat.mode, 'flee');
  assert.equal(r.ev.round, BIRD.rounds);
  assert.equal(r.ev.phase, 'approach');
  assert.equal(r.ev.done, false, 'なでた時点ではまだ done ではない');

  const o = runTicks(E.eventTick, { ev: r.ev, cat: r.cat, day: r.day }, { until: (x) => x.ev.done });
  assert.ok(o.reached, '歩き直したあと done にならないまま上限に達した');
  const doneTick = o.log[o.log.length - 1];
  const before = o.log.slice(0, -1);
  // done までは approach のまま（arrive・hunt に入らない）。cue は一つも出ない
  for (const x of before) assert.equal(x.ev.phase, 'approach', `${x.t.toFixed(2)}秒の phase`);
  const cues = o.log.flatMap((x) => x.cues);
  assert.deepEqual(cues, [], 'cue');
  // done の tick：birdDistance に着いて done・relax
  assert.equal(doneTick.ev.done, true);
  assert.equal(doneTick.cat.distance, BIRD.birdDistance);
  assert.equal(doneTick.cat.mode, 'relax');
  // 落ち着いている分（calmTrustPerSec×dt）だけに trustRate がかかる（doneTrust は入らない）
  const prevTrust = before.length > 0 ? before[before.length - 1].day.trust : r.day.trust;
  const expected = Math.min(MAX_VALUE, prevTrust + RULES.calmTrustPerSec * DT * trustRate);
  assert.ok(near(doneTick.day.trust, expected), `done の tick の信頼 ${doneTick.day.trust}（期待 ${expected}）`);
});

test('arrive・leave の途中の tick も、hunt と同じく信頼が (calmTrustPerSec + backTurnTrustPerSec×likes.patience)×dt×trustRate 増える', async () => {
  await loadBird();
  const E = await loadEvents();
  const trustRate = 0.8;
  for (const key of ['tsundere', 'bibiri', 'amaenbo']) {
    const personality = PERSONALITIES[key];
    const { log, reached } = runTicks(E.eventTick, birdStart(E.createEventState, { trustRate }), { personality, until: untilEntered('turn', 1) });
    assert.ok(reached, `${key}：turn の前に上限に達した（このテストの前提）`);
    const spans = phaseSpans(log);
    const at = (phase) => spans.find((s) => s.phase === phase);
    const perTick = (RULES.calmTrustPerSec * DT + RULES.backTurnTrustPerSec * DT * personality.likes.patience) * trustRate;
    // [その phase, 次の phase]：その phase に入った次の tick から、次の phase に入る前の tick まで
    for (const [phase, next] of [['arrive', 'hunt'], ['leave', 'turn']]) {
      const from = at(phase);
      const to = at(next);
      assert.ok(from && to, `${key}：${phase}・${next} がない（このテストの前提）`);
      assert.ok(to.index - from.index - 1 > 0, `${key}：${phase} の途中の tick がない（このテストの前提）`);
      for (let i = from.index + 1; i < to.index; i++) {
        const gain = log[i].day.trust - log[i - 1].day.trust;
        assert.ok(near(gain, perTick), `${key}：${phase} の ${log[i].t.toFixed(2)}秒の信頼の増え ${gain}（期待 ${perTick}）`);
      }
    }
  }
});

test('turn 以外（leave 中）の sawLook: true のまばたき：applyAction を look で呼んだのと同じ day・feedback・mistake。phase は leave のまま、blinks・round も変わらない', async () => {
  await loadBird();
  const E = await loadEvents();
  const s = reach(E, 'leave');
  assert.equal(s.ev.phase, 'leave', 'leave（このテストの前提）');
  const seen = { type: 'blink', holdMs: 1000, sawLook: true };
  const expected = applyAction(seen, { ...s.cat, mode: 'look' }, s.day, plain);
  assert.equal(expected.feedback, 'blinkBack', 'applyAction の結果（このテストの前提）');
  const r = E.eventAct(seen, s.ev, s.cat, s.day, plain);
  assert.ok(r, 'eventAct が null を返した');
  assert.equal(r.feedback, expected.feedback);
  assert.deepEqual(r.day, expected.day);
  assert.equal(r.mistake, expected.mistake);
  assert.equal(r.ev.phase, 'leave');
  assert.equal(r.ev.blinks, s.ev.blinks);
  assert.equal(r.ev.round, s.ev.round);
});

// ---------------------------------------------------------------- 不具合の再現：飛び去り終えたあとに turn に変わると、鳥が枝にもう一度出る

// 小鳥の胴（src/render/props.js の drawBird、fillStyle '#8fb7d9'）を塗った回数を、フレームごとに数える偽の Canvas
const BIRD_BODY = '#8fb7d9';
function birdFillCanvas() {
  const frame = { birdFills: 0 };
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'fill') return () => {
        if (target.fillStyle === BIRD_BODY) frame.birdFills++;
      };
      return () => {};
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
  const canvas = { width: 360, height: 640, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 640 }) };
  return { canvas, frame };
}

test('描画（不具合の再現）：leave を leaveSec 以上描いて鳥が飛び去り終えたあと、phase が turn に変わっても、鳥をもう一度描かない', async () => {
  const BIRD = await loadBird();
  const { canvas, frame } = birdFillCanvas();
  const r = createRenderer(canvas);
  const view = (phase, mode) => ({ scene: 'day', wariness: 0, cat: { mode, distance: BIRD.birdDistance }, prop: { kind: 'bird', phase, phaseT: 0 } });
  let t = 1;
  const drawFrame = (v) => {
    frame.birdFills = 0;
    r.draw(v, t, DT);
    t += DT;
    return frame.birdFills;
  };

  // hunt：枝の上に鳥がいる（数え方の裏付け）
  let huntFills = 0;
  for (let i = 0; i < 10; i++) huntFills = drawFrame(view('hunt', 'backTurn'));
  assert.ok(huntFills >= 1, `hunt の最後のフレームで鳥が描かれていない（数え方の前提）: ${huntFills}`);

  // leave：leaveSec + 0.5 秒ぶん描く。最後のフレームでは、もう飛び去り終えている
  const leaveFrames = Math.ceil((BIRD.leaveSec + 0.5) / DT);
  let leaveFills = 0;
  for (let i = 0; i < leaveFrames; i++) leaveFills = drawFrame(view('leave', 'backTurn'));
  assert.equal(leaveFills, 0, 'leave の最後のフレーム（leaveSec + 0.5 秒後）で鳥がまだ描かれている（このテストの前提）');

  // turn の最初のフレーム：鳥はもういないので描かない
  const turnFills = drawFrame(view('turn', 'look'));
  assert.equal(turnFills, 0, `飛び去り終えたあと turn に変わったら、鳥がまた描かれた（胴を塗った回数 ${turnFills}）`);
});

// ---------------------------------------------------------------- 仕様：狩りを最後まで見守れた最初の回（hunt→leave の tick）で understood・+doneTrust。done の tick では何も足さない

// until が true になるまで進める（前提が崩れたら、分かるメッセージで落ちる）
function advance(E, cur, until, label) {
  const r = runTicks(E.eventTick, cur, { until });
  assert.ok(r.reached, `${label}の前に上限に達した（このテストの前提）`);
  return r;
}

// round 回目（0 始まり）の hunt に入ってから1秒進め、なでて邪魔する（逃げて round+1・approach になる）
function disturbHunt(E, BIRD, cur, round, cues) {
  const h = advance(E, cur, (r) => r.ev.phase === 'hunt' && r.ev.round === round, `round ${round} の hunt`);
  cues.push(...h.log.flatMap((r) => r.cues));
  const m = runTicks(E.eventTick, h.last, { maxSec: 1 });
  cues.push(...m.log.flatMap((r) => r.cues));
  assert.equal(m.last.ev.phase, 'hunt', `round ${round}：hunt の途中（このテストの前提）`);
  const s = m.last;
  const a = E.eventAct(pet, s.ev, s.cat, s.day, plain);
  assert.equal(a.feedback, 'flee', `round ${round}：hunt でなでて逃げる（このテストの前提）`);
  assert.equal(a.ev.round, round + 1, `round ${round}：なでたあとの round（このテストの前提）`);
  assert.equal(a.ev.phase, 'approach', `round ${round}：なでたあとの phase（このテストの前提）`);
  return { ev: a.ev, cat: a.cat, day: a.day };
}

// done になった tick まで進め、その tick・ひとつ前の tick の信頼・ログを返す
function runToDone(E, cur, cues) {
  const o = advance(E, cur, (r) => r.ev.done, 'done');
  cues.push(...o.log.flatMap((r) => r.cues));
  const doneTick = o.log[o.log.length - 1];
  const prevTrust = o.log.length >= 2 ? o.log[o.log.length - 2].day.trust : cur.day.trust;
  return { doneTick, prevTrust, log: o.log };
}

// understood の tick（hunt→leave）の信頼：落ち着いている分・背中を向けている分・我慢のごほうび・doneTrust に trustRate がかかる
function understoodTrust(BIRD, personality, prevTrust, trustRate) {
  return Math.min(MAX_VALUE, prevTrust + (RULES.calmTrustPerSec * DT + RULES.backTurnTrustPerSec * DT * personality.likes.patience + RULES.patienceTrust * personality.likes.patience + BIRD.doneTrust) * trustRate);
}

test('両方の回の hunt で触って邪魔した：birdDistance に着いた tick で done になるが cue understood は出ず、信頼は doneTrust の分だけ増えない（いつもの calm 分だけ）', async () => {
  const BIRD = await loadBird();
  const E = await loadEvents();
  const trustRate = 0.5;
  const cues = [];
  let cur = birdStart(E.createEventState, { trustRate });
  for (let round = 0; round < BIRD.rounds; round++) cur = disturbHunt(E, BIRD, cur, round, cues);
  assert.equal(cur.ev.round, BIRD.rounds, 'rounds 回とも邪魔した（このテストの前提）');
  const { doneTick, prevTrust } = runToDone(E, cur, cues);
  assert.equal(doneTick.ev.done, true);
  assert.equal(doneTick.cat.distance, BIRD.birdDistance, 'done になった tick の距離');
  assert.ok(!cues.includes('left'), `left の cue が出た: ${cues.join(',')}`);
  assert.ok(!cues.includes('understood'), `見守れた回がないのに understood の cue が出た: ${cues.join(',')}`);
  assert.deepEqual(doneTick.cues, [], 'done の tick の cue');
  const expected = Math.min(MAX_VALUE, prevTrust + RULES.calmTrustPerSec * DT * trustRate);
  assert.ok(near(doneTick.day.trust, expected), `done の tick の信頼 ${doneTick.day.trust}（期待 ${expected}、doneTrust の分は入らない）`);
});

test('1回目の hunt で邪魔し、2回目は見守った：2回目の leave で cue understood・+doneTrust×trustRate。done の tick は追加なし', async () => {
  const BIRD = await loadBird();
  const E = await loadEvents();
  assert.equal(BIRD.rounds, 2, 'rounds が 2（このテストの前提）');
  const trustRate = 0.5;
  const cues = [];
  const cur = disturbHunt(E, BIRD, birdStart(E.createEventState, { trustRate }), 0, cues);
  const { doneTick, prevTrust, log } = runToDone(E, cur, cues);
  assert.equal(doneTick.ev.done, true);
  assert.equal(cues.filter((c) => c === 'left').length, 0, `left の cue の数: ${cues.join(',')}`);
  assert.equal(cues.filter((c) => c === 'understood').length, 1, `understood の cue の数: ${cues.join(',')}`);
  // understood の tick：2回目の leave に入った tick。cue は understood だけ、信頼に doneTrust が入る
  const ui = log.findIndex((x) => x.cues.includes('understood'));
  assert.ok(ui >= 1, 'understood の tick が見つからない');
  assert.equal(log[ui].ev.phase, 'leave', 'understood の tick の phase');
  assert.equal(log[ui].ev.round, 1, 'understood の tick の round');
  assert.deepEqual(log[ui].cues, ['understood'], 'understood の tick の cue');
  const expectedU = understoodTrust(BIRD, plain, log[ui - 1].day.trust, trustRate);
  assert.ok(near(log[ui].day.trust, expectedU), `understood の tick の信頼 ${log[ui].day.trust}（期待 ${expectedU}）`);
  // done の tick：cue なし、信頼は落ち着いている分だけ
  assert.deepEqual(doneTick.cues, [], 'done の tick の cue');
  const expected = Math.min(MAX_VALUE, prevTrust + RULES.calmTrustPerSec * DT * trustRate);
  assert.ok(near(doneTick.day.trust, expected), `done の tick の信頼 ${doneTick.day.trust}（期待 ${expected}）`);
});

test('1回目は leave まで見守り turn で触って逃げ、2回目の hunt でも邪魔した：1回目の leave で understood・+doneTrust。done の tick は追加なし', async () => {
  const BIRD = await loadBird();
  const E = await loadEvents();
  assert.equal(BIRD.rounds, 2, 'rounds が 2（このテストの前提）');
  const trustRate = 0.5;
  const cues = [];
  // 1回目：turn まで見守る（leave に入るとき understood が出る）。turn でなでて逃げる
  const t = advance(E, birdStart(E.createEventState, { trustRate }), (r) => r.ev.phase === 'turn' && r.ev.round === 0, 'round 0 の turn');
  cues.push(...t.log.flatMap((r) => r.cues));
  assert.equal(cues.filter((c) => c === 'understood').length, 1, '1回目に understood が出ない');
  assert.equal(cues.filter((c) => c === 'left').length, 0, '1回目に left が出た');
  const ui = t.log.findIndex((x) => x.cues.includes('understood'));
  assert.equal(t.log[ui].ev.phase, 'leave', 'understood の tick の phase');
  const expectedU = understoodTrust(BIRD, plain, t.log[ui - 1].day.trust, trustRate);
  assert.ok(near(t.log[ui].day.trust, expectedU), `understood の tick の信頼 ${t.log[ui].day.trust}（期待 ${expectedU}）`);
  const s = t.last;
  const a = E.eventAct(pet, s.ev, s.cat, s.day, plain);
  assert.equal(a.feedback, 'flee', 'turn でなでて逃げる（このテストの前提）');
  assert.equal(a.ev.round, 1, 'turn でなでたあとの round（このテストの前提）');
  // 2回目：hunt で邪魔する
  const cur = disturbHunt(E, BIRD, { ev: a.ev, cat: a.cat, day: a.day }, 1, cues);
  const { doneTick, prevTrust } = runToDone(E, cur, cues);
  assert.equal(doneTick.ev.done, true);
  assert.equal(doneTick.cat.distance, BIRD.birdDistance, 'done になった tick の距離');
  assert.deepEqual(doneTick.cues, [], 'done の tick の cue');
  assert.equal(cues.filter((c) => c === 'understood').length, 1, `understood の cue の数: ${cues.join(',')}`);
  const expected = Math.min(MAX_VALUE, prevTrust + RULES.calmTrustPerSec * DT * trustRate);
  assert.ok(near(doneTick.day.trust, expected), `done の tick の信頼 ${doneTick.day.trust}（期待 ${expected}）`);
});

test('昼の画面：rounds 回とも hunt でなでて邪魔したときは、done になっても EVENT_TEXT.bird.understood のトーストを出さない', async () => {
  const BIRD = await loadBird();
  const understood = await birdText('understood');
  const left = await birdText('left');
  const { scene, toasts, ends } = await birdDayScene();
  let pets = 0;
  for (let i = 0; i < 2000 && ends.length === 0; i++) {
    const prop = scene.view().prop;
    if (prop && prop.phase === 'done') break;
    // hunt に入って1秒たったら、なでて邪魔する
    if (prop && prop.phase === 'hunt' && prop.phaseT >= 1 && scene.state().cat.mode === 'backTurn') {
      scene.act(pet);
      pets++;
    }
    scene.update(DT);
  }
  assert.equal(pets, BIRD.rounds, `hunt でなでた回数（このテストの前提）`);
  assert.equal(scene.view().prop?.phase, 'done', 'done にならないまま進めた（このテストの前提）');
  assert.ok(scene.state().day.timeLeft > 0, 'done の前に時間切れになった（このテストの前提）');
  const list = toasts.map((t) => t.text).join(' / ');
  assert.equal(toasts.filter((t) => t.text === understood).length, 0, `見守れた回がないのに understood のトーストが出た: ${list}`);
  assert.equal(toasts.filter((t) => t.text === left).length, 0, `見守れた回がないのに left のトーストが出た: ${list}`);
});

// N1
test('2回目に見守れた回の leave の tick：cue は left だけ、信頼 +(patienceTrust×likes.patience)×trustRate（doneTrust なし）', async () => {
  const BIRD = await loadBird();
  const E = await loadEvents();
  assert.ok(BIRD.rounds >= 2, 'rounds が 2 以上（このテストの前提）');
  const personality = PERSONALITIES.tsundere;
  const trustRate = 0.5;
  const { log, reached } = runTicks(E.eventTick, birdStart(E.createEventState, { trustRate }), { personality, until: untilEntered('leave', 2) });
  assert.ok(reached, '2回目の leave の前に上限に達した（このテストの前提）');
  const leaves = phaseSpans(log).filter((s) => s.phase === 'leave');
  assert.equal(leaves.length, 2, 'leave の数（このテストの前提）');
  const tick = log[leaves[1].index];
  assert.equal(tick.ev.round, 1, '2回目の leave の round');
  assert.deepEqual(tick.cues, ['left'], '2回目の leave に入った tick の cue');
  const prev = log[leaves[1].index - 1].day.trust;
  const expected = Math.min(MAX_VALUE, prev + (RULES.calmTrustPerSec * DT + RULES.backTurnTrustPerSec * DT * personality.likes.patience + RULES.patienceTrust * personality.likes.patience) * trustRate);
  assert.ok(near(tick.day.trust, expected), `2回目の leave の tick の信頼 ${tick.day.trust}（期待 ${expected}、doneTrust は入らない）`);
});

// N2
test('1回目は leave に入ってからなでて逃げ、2回目は見守った：2回目の leave は left だけ。understood は全体で1回（2回目には出ない）', async () => {
  const BIRD = await loadBird();
  const E = await loadEvents();
  assert.equal(BIRD.rounds, 2, 'rounds が 2（このテストの前提）');
  const cues = [];
  const l = advance(E, birdStart(E.createEventState), (r) => r.ev.phase === 'leave' && r.ev.round === 0, 'round 0 の leave');
  cues.push(...l.log.flatMap((r) => r.cues));
  assert.equal(cues.filter((c) => c === 'understood').length, 1, '1回目の leave に入るとき understood が出ない');
  const s = l.last;
  const a = E.eventAct(pet, s.ev, s.cat, s.day, plain);
  assert.equal(a.feedback, 'flee', 'leave でなでて逃げる（このテストの前提）');
  assert.equal(a.ev.round, 1, 'leave でなでたあとの round（このテストの前提）');
  assert.equal(a.ev.phase, 'approach', 'leave でなでたあとの phase（このテストの前提）');
  const { doneTick, log } = runToDone(E, { ev: a.ev, cat: a.cat, day: a.day }, cues);
  assert.equal(doneTick.ev.done, true);
  const li = log.findIndex((x) => x.cues.includes('left'));
  assert.ok(li >= 0, `2回目の leave で left が出ない: ${cues.join(',')}`);
  assert.equal(log[li].ev.phase, 'leave', 'left の tick の phase');
  assert.equal(log[li].ev.round, 1, 'left の tick の round');
  assert.deepEqual(log[li].cues, ['left'], '2回目の leave に入った tick の cue');
  assert.equal(cues.filter((c) => c === 'understood').length, 1, `understood の cue の数: ${cues.join(',')}`);
  assert.equal(cues.filter((c) => c === 'left').length, 1, `left の cue の数: ${cues.join(',')}`);
});

// N3
test('文章：EVENT_TEXT.bird.understood は文字列で、EVENT_TEXT.bird に out は無い', async () => {
  const { EVENT_TEXT } = await import('../src/data/texts.js');
  assert.ok(EVENT_TEXT && EVENT_TEXT.bird, 'texts.js に EVENT_TEXT.bird がない');
  assert.equal(typeof EVENT_TEXT.bird.understood, 'string', 'EVENT_TEXT.bird.understood がない');
  assert.equal('out' in EVENT_TEXT.bird, false, 'EVENT_TEXT.bird.out が残っている');
});

// N4
test('昼の画面：1回目の hunt で邪魔し、2回目は見守った：understood のトーストが1回、出たときの prop.phase は leave。left のトーストは出ない', async () => {
  const BIRD = await loadBird();
  assert.equal(BIRD.rounds, 2, 'rounds が 2（このテストの前提）');
  const understood = await birdText('understood');
  const left = await birdText('left');
  const { scene, toasts, ends } = await birdDayScene();
  let pets = 0;
  const seen = [];
  for (let i = 0; i < 2000 && ends.length === 0; i++) {
    const prop = scene.view().prop;
    if (prop && prop.phase === 'done') break;
    // 1回目の hunt だけ、入って1秒たったらなでて邪魔する
    if (pets === 0 && prop && prop.phase === 'hunt' && prop.phaseT >= 1 && scene.state().cat.mode === 'backTurn') {
      scene.act(pet);
      pets++;
    }
    const n = toasts.length;
    scene.update(DT);
    for (const t of toasts.slice(n)) {
      if (t.text === understood) seen.push(scene.view().prop?.phase);
    }
  }
  assert.equal(pets, 1, 'hunt でなでた回数（このテストの前提）');
  assert.equal(scene.view().prop?.phase, 'done', 'done にならないまま進めた（このテストの前提）');
  assert.ok(scene.state().day.timeLeft > 0, 'done の前に時間切れになった（このテストの前提）');
  const list = toasts.map((t) => t.text).join(' / ');
  assert.deepEqual(seen, ['leave'], `understood のトーストが出たときの phase: ${list}`);
  assert.equal(toasts.filter((t) => t.text === left).length, 0, `left のトースト: ${list}`);
});

// N5
test('見守れた回が無いまま done になったあとも、eventAct は null（まばたき・なでるとも）', async () => {
  const BIRD = await loadBird();
  const E = await loadEvents();
  const cues = [];
  let cur = birdStart(E.createEventState);
  for (let round = 0; round < BIRD.rounds; round++) cur = disturbHunt(E, BIRD, cur, round, cues);
  const { doneTick } = runToDone(E, cur, cues);
  assert.equal(doneTick.ev.done, true, 'done になっていない（このテストの前提）');
  assert.ok(!cues.includes('understood'), '見守れた回が無い（このテストの前提）');
  const last = { ev: doneTick.ev, cat: doneTick.cat, day: doneTick.day };
  assert.equal(E.eventAct(blink(1000), last.ev, { ...last.cat, mode: 'look' }, last.day, plain), null);
  assert.equal(E.eventAct({ type: 'blink', holdMs: 1000, sawLook: true }, last.ev, last.cat, last.day, plain), null);
  assert.equal(E.eventAct(blink(1000), last.ev, last.cat, last.day, plain), null);
  assert.equal(E.eventAct(pet, last.ev, last.cat, last.day, plain), null);
});

// ---------------------------------------------------------------- 不具合の再現：understood の update で、ツンが取れた・手が平気になったトーストが重なって understood が見えない

// 鳥の昼をそのまま進め（なでない・まばたきしない）、トーストを出た時刻（ゲーム内の経過秒）つきで記録する。
// understood の update の前後の信頼・dere・handsOk も記録する。understood から afterSec 秒たつまで進める
async function warmUpRun({ personality, trust, afterSec = 5 }) {
  await loadBird();
  const understood = await birdText('understood');
  const { scene, toasts, ends } = await birdDayScene({ personality, trust });
  const log = [];
  let t = 0;
  let u = null;
  for (let i = 0; i < 2000 && ends.length === 0; i++) {
    if (u && t >= u.t + afterSec) break;
    const before = scene.state().day;
    const n = toasts.length;
    scene.update(DT);
    t += DT;
    const after = scene.state().day;
    const added = toasts.slice(n);
    for (const x of added) log.push({ text: x.text, ms: x.ms, t });
    if (!u && added.some((x) => x.text === understood)) {
      u = { t, ms: added.find((x) => x.text === understood).ms, added: added.map((x) => x.text), trustBefore: before.trust, trustAfter: after.trust, dere: after.dere, handsOk: after.handsOk };
    }
  }
  assert.ok(u, `understood のトーストが出ないまま進めた（このテストの前提）: ${toasts.map((x) => x.text).join(' / ')}`);
  assert.ok(scene.state().day.timeLeft > 0, 'understood のあと待っている間に時間切れになった（このテストの前提）');
  assert.ok(t >= u.t + afterSec - 1e-9, `understood から ${afterSec}秒たつ前に止まった（このテストの前提）`);
  return { understood, u, log, scene };
}

// warm（ツンが取れた・手が平気になった文）が、understood の update とは別の update で、
// understood の ms ぶんたってから（1 update の誤差まで）1回だけ出ることを確かめる
function assertWarmAfterUnderstood({ understood, u, log }, warm, label) {
  assert.equal(typeof u.ms, 'number', 'understood のトーストの表示時間（ms）が記録されていない（このテストの前提）');
  assert.ok(!u.added.includes(warm), `${label}：understood と同じ update で出た（トースト: ${u.added.join(' / ')}）`);
  const warms = log.filter((x) => x.text === warm);
  assert.equal(warms.length, 1, `${label}のトーストの数: ${log.map((x) => x.text).join(' / ')}`);
  const wait = warms[0].t - u.t;
  const expected = u.ms / 1000;
  assert.ok(wait >= expected - TOL && wait <= expected + TOL, `${label}：understood から ${wait.toFixed(2)}秒後に出た（期待 ${expected}秒、誤差 1 update まで）`);
  // understood より前には出ていない
  const ui = log.findIndex((x) => x.text === understood);
  assert.ok(log.findIndex((x) => x.text === warm) > ui, `${label}：understood より前に出た`);
}

test('昼の画面（不具合の再現）：ツンデレ trust 30。understood の update で shyUntil をまたいでも、DERE_TEXT は understood の表示時間（ms）が過ぎてから1回だけ出る', async () => {
  const { DERE_TEXT, withName } = await import('../src/data/texts.js');
  const shyUntil = PERSONALITIES.tsundere.shyUntil;
  const run = await warmUpRun({ personality: 'tsundere', trust: 30 });
  assert.ok(run.u.trustBefore < shyUntil && run.u.trustAfter >= shyUntil, `understood の update で shyUntil ${shyUntil} をまたいでいない（このテストの前提）：${run.u.trustBefore} → ${run.u.trustAfter}`);
  assertWarmAfterUnderstood(run, withName(DERE_TEXT, 'たま'), 'DERE_TEXT');
});

test('昼の画面（不具合の再現）：ビビり trust 35。understood の update で timidUntil をまたいでも、TIMID_GONE_TEXT は understood の表示時間（ms）が過ぎてから1回だけ出る', async () => {
  const { TIMID_GONE_TEXT, withName } = await import('../src/data/texts.js');
  const timidUntil = PERSONALITIES.bibiri.timidUntil;
  const run = await warmUpRun({ personality: 'bibiri', trust: 35 });
  assert.ok(run.u.trustBefore < timidUntil && run.u.trustAfter >= timidUntil, `understood の update で timidUntil ${timidUntil} をまたいでいない（このテストの前提）：${run.u.trustBefore} → ${run.u.trustAfter}`);
  assertWarmAfterUnderstood(run, withName(TIMID_GONE_TEXT, 'たま'), 'TIMID_GONE_TEXT');
});

test('昼の画面：トーストを待たせても判定は遅らせない。understood の update で、ツンデレは day.dere・ビビりは day.handsOk がもう true', async () => {
  const tsundere = await warmUpRun({ personality: 'tsundere', trust: 30, afterSec: 0 });
  assert.ok(tsundere.u.trustBefore < PERSONALITIES.tsundere.shyUntil && tsundere.u.trustAfter >= PERSONALITIES.tsundere.shyUntil, 'ツンデレ：understood の update で shyUntil をまたいでいない（このテストの前提）');
  assert.equal(tsundere.u.dere, true, 'ツンデレ：understood の update のあとの day.dere');
  assert.equal(tsundere.scene.view().shy, false, 'ツンデレ：understood の update のあとの view().shy');
  const bibiri = await warmUpRun({ personality: 'bibiri', trust: 35, afterSec: 0 });
  assert.ok(bibiri.u.trustBefore < PERSONALITIES.bibiri.timidUntil && bibiri.u.trustAfter >= PERSONALITIES.bibiri.timidUntil, 'ビビり：understood の update で timidUntil をまたいでいない（このテストの前提）');
  assert.equal(bibiri.u.handsOk, true, 'ビビり：understood の update のあとの day.handsOk');
});
