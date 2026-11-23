// イベントの仕組みと「箱が届いた」のテスト。
// まだ無いモジュール・名前（src/game/events.js、chooseEvents、ambient、EVENTS など）は、
// 先頭で import すると、このファイルのほかのテストまで読めなくなるので、テストの中で動的 import する
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction } from '../src/game/rules.js';
import { RULES, PERSONALITIES, DAYS, MAX_DAY, MAX_VALUE } from '../src/data/params.js';
import { createRenderer } from '../src/render/renderer.js';
import { createRng } from '../src/util/rng.js';
import { makeDay, makeCat, fixedRng } from './helpers.js';

// ツンデレをもとに、性格の得意・苦手（likes）とツン（shyUntil）をなくした猫。ルールそのものを確かめる
const plain = { ...PERSONALITIES.tsundere, likes: { pet: 1, blink: 1, patience: 1 }, shyUntil: 0 };
const blink = (holdMs) => ({ type: 'blink', holdMs });
const pet = { type: 'pet' };

const DT = 0.05;
// 1 tick ぶんの誤差まで許す
const TOL = DT + 1e-6;
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

async function loadParams() {
  const P = await import('../src/data/params.js');
  assert.ok(Array.isArray(P.EVENT_DAYS), 'params.js に EVENT_DAYS がない');
  assert.ok(P.EVENTS && P.EVENTS.box, 'params.js に EVENTS.box がない');
  return { EVENT_DAYS: P.EVENT_DAYS, EVENTS: P.EVENTS, BOX: P.EVENTS.box };
}

async function loadEvents() {
  const E = await import('../src/game/events.js');
  for (const name of ['createEventState', 'eventTick', 'eventAct', 'eventProp']) {
    assert.equal(typeof E[name], 'function', `events.js に ${name} がない`);
  }
  return E;
}

// 箱の日の始まり：部屋の隅（距離100）でくつろいでいて、落ち着いている（警戒0）。時間はたっぷりある
function boxStart(createEventState, dayOverrides = {}) {
  return {
    ev: createEventState('box'),
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

// 箱の流れを、ev.phase が phase になるまで進める
function reach(E, phase, { personality = plain, rng = fixedRng(0.5), dayOverrides = {} } = {}) {
  const { last, reached } = runTicks(E.eventTick, boxStart(E.createEventState, dayOverrides), { personality, rng, until: (r) => r.ev.phase === phase });
  assert.ok(reached, `phase '${phase}' になる前に上限に達した（このテストの前提）`);
  return last;
}

// ---------------------------------------------------------------- 1. chooseEvents

test('chooseEvents：長さ MAX_DAY の配列で、箱は EVENT_DAYS のどれか1日だけ、それ以外の日は null', async () => {
  const { chooseEvents } = await import('../src/game/progression.js');
  assert.equal(typeof chooseEvents, 'function', 'progression.js に chooseEvents がない');
  const { EVENT_DAYS, EVENTS } = await loadParams();
  const ids = Object.keys(EVENTS);
  for (const random of [fixedRng(0), fixedRng(0.5), fixedRng(0.999), createRng(1), createRng(2), createRng(3)]) {
    const events = chooseEvents(random);
    assert.equal(events.length, MAX_DAY);
    const boxDays = events.flatMap((e, i) => (e === 'box' ? [i + 1] : []));
    assert.equal(boxDays.length, 1, `箱の日: ${boxDays.join(',')}`);
    assert.ok(EVENT_DAYS.includes(boxDays[0]), `箱の日 ${boxDays[0]} が EVENT_DAYS にない`);
    // どのイベントも1回ずつ、EVENT_DAYS の別々の日に置かれ、ほかの日は null
    for (const id of ids) {
      const days = events.flatMap((e, i) => (e === id ? [i + 1] : []));
      assert.equal(days.length, 1, `${id} の日: ${days.join(',')}`);
      assert.ok(EVENT_DAYS.includes(days[0]), `${id} の日 ${days[0]} が EVENT_DAYS にない`);
    }
    for (const [i, e] of events.entries()) {
      if (!ids.includes(e)) assert.equal(e, null, `${i + 1}日目`);
    }
  }
});

test('chooseEvents：乱数を固定すると、同じ結果になる', async () => {
  const { chooseEvents } = await import('../src/game/progression.js');
  assert.equal(typeof chooseEvents, 'function', 'progression.js に chooseEvents がない');
  for (const seed of [1, 7, 42]) {
    assert.deepEqual(chooseEvents(createRng(seed)), chooseEvents(createRng(seed)), `seed ${seed}`);
  }
  for (const v of [0, 0.5, 0.999]) {
    assert.deepEqual(chooseEvents(fixedRng(v)), chooseEvents(fixedRng(v)), `fixedRng(${v})`);
  }
});

// ---------------------------------------------------------------- 2. createGame の events と startDay の day.event

test('createGame：events を省くと、長さ MAX_DAY の全部 null。渡すと game.events に入る', async () => {
  const { createGame } = await import('../src/game/progression.js');
  assert.deepEqual(createGame({ personality: 'tsundere', seed: 1 }).events, Array(MAX_DAY).fill(null));
  const events = [null, null, null, 'box', null, null, null];
  assert.deepEqual(createGame({ personality: 'tsundere', seed: 1, events }).events, events);
});

test('startDay：その日のイベントが day.event に入る（ない日は null）。ほかの値は、イベントのないゲームと同じ', async () => {
  const { createGame, startDay } = await import('../src/game/progression.js');
  const events = [null, null, null, 'box', null, null, null];
  for (const personality of Object.keys(PERSONALITIES)) {
    for (const dayNumber of [3, 4, 5]) {
      const withEvents = startDay({ ...createGame({ personality, seed: 1, events }), day: dayNumber });
      const noEvents = startDay({ ...createGame({ personality, seed: 1 }), day: dayNumber });
      const label = `${personality}・${dayNumber}日目`;
      assert.equal(withEvents.day.event, dayNumber === 4 ? 'box' : null, label);
      assert.equal(noEvents.day.event, null, `${label}（イベントなし）`);
      const { event: _a, ...restA } = withEvents.day;
      const { event: _b, ...restB } = noEvents.day;
      assert.deepEqual(restA, restB, label);
      assert.deepEqual(withEvents.cat, noEvents.cat, label);
      assert.deepEqual(withEvents.newActions, noEvents.newActions, label);
    }
  }
});

// ---------------------------------------------------------------- 7. ambient

test('ambient：残り時間を dt 減らし、警戒を warinessDecayPerSec×dt 下げる。信頼は変えない', async () => {
  const { ambient } = await import('../src/game/catBrain.js');
  assert.equal(typeof ambient, 'function', 'catBrain.js に ambient がない');
  const day = makeDay({ timeLeft: 10, wariness: 50, trust: 20 });
  const r = ambient(day, 1);
  assert.deepEqual(r.day, { ...day, timeLeft: 9, wariness: 50 - RULES.warinessDecayPerSec });
  assert.equal(r.calm, false);
  // 落ち着いていても、信頼は ambient では増えない
  const c = ambient(makeDay({ timeLeft: 10, wariness: 0, trust: 20 }), 1);
  assert.equal(c.day.trust, 20);
  assert.equal(c.calm, true);
});

test('ambient：残り時間・警戒は 0 未満にならない', async () => {
  const { ambient } = await import('../src/game/catBrain.js');
  assert.equal(typeof ambient, 'function', 'catBrain.js に ambient がない');
  const r = ambient(makeDay({ timeLeft: 0.5, wariness: 2 }), 1);
  assert.equal(r.day.timeLeft, 0);
  assert.equal(r.day.wariness, 0);
  assert.equal(r.calm, true);
});

test('ambient：calm は「下げたあとの警戒 < calmThreshold」', async () => {
  const { ambient } = await import('../src/game/catBrain.js');
  assert.equal(typeof ambient, 'function', 'catBrain.js に ambient がない');
  const decay = RULES.warinessDecayPerSec;
  // 下げたあとがちょうど calmThreshold：落ち着いていない
  assert.equal(ambient(makeDay({ wariness: RULES.calmThreshold + decay }), 1).calm, false);
  // 下げたあとが calmThreshold − 1：落ち着いている
  assert.equal(ambient(makeDay({ wariness: RULES.calmThreshold + decay - 1 }), 1).calm, true);
});

// ---------------------------------------------------------------- 3. 箱の流れ（eventTick）

test('箱の流れ：approach で boxDistance まで歩く → drop → arrive（arriveSec）→ hop（hopSec）→ hid → hideSec の範囲内で peek → peekSec 後に hide。各 phase の猫の様子', async () => {
  const E = await loadEvents();
  const { BOX } = await loadParams();
  const start = boxStart(E.createEventState);
  assert.equal(start.ev.id, 'box');
  assert.equal(start.ev.phase, 'approach');
  assert.equal(start.ev.phaseT, 0);
  assert.equal(start.ev.blinks, 0);
  assert.equal(start.ev.done, false);

  // 2回目の hide に入るまで進める
  const { log, reached } = runTicks(E.eventTick, start, { until: untilEntered('hide', 2) });
  assert.ok(reached, '2回目の hide の前に上限に達した（このテストの前提）');
  const spans = phaseSpans(log);
  const order = spans.map((s) => s.phase);
  assert.deepEqual(order, ['approach', 'arrive', 'hop', 'hide', 'peek', 'hide'], `phase の順: ${order.join(' → ')}`);
  const [approach, arrive, hop, hide, peek, hide2] = spans;

  // approach：くつろいで歩いて近づく。1 tick 目は approachSpeed×approachMul×dt だけ近づく
  const first = log[0];
  assert.equal(first.ev.phase, 'approach');
  assert.equal(first.cat.mode, 'relax');
  assert.equal(first.cat.walking, true);
  assert.ok(near(first.cat.distance, MAX_VALUE - plain.approachSpeed * start.day.approachMul * DT), `1 tick 目の距離 ${first.cat.distance}`);
  for (const r of log.slice(approach.index, arrive.index)) {
    assert.equal(r.cat.mode, 'relax', `approach 中の猫の様子（${r.t.toFixed(2)}秒）`);
    assert.ok(r.cat.distance >= BOX.boxDistance, `approach 中の距離 ${r.cat.distance}`);
    if (r.cat.distance > BOX.boxDistance) assert.equal(r.cat.walking, true, `approach 中に歩いていない（${r.t.toFixed(2)}秒）`);
  }

  // drop：arrive に入った tick で1回だけ。距離は boxDistance で止まっている
  const drops = log.flatMap((r, i) => (r.cues.includes('drop') ? [i] : []));
  assert.deepEqual(drops, [arrive.index], 'drop の cue');
  assert.equal(log[arrive.index].cat.distance, BOX.boxDistance);

  // arrive：tailUp で arriveSec
  for (const r of log.slice(arrive.index, hop.index)) assert.equal(r.cat.mode, 'tailUp', `arrive 中の猫の様子（${r.t.toFixed(2)}秒）`);
  assert.ok(near(hop.at - arrive.at, BOX.arriveSec, TOL), `arrive の長さ ${hop.at - arrive.at}`);

  // hop：hopSec のあと hide（cue 'hid'）
  assert.ok(near(hide.at - hop.at, BOX.hopSec, TOL), `hop の長さ ${hide.at - hop.at}`);
  const hids = log.flatMap((r, i) => (r.cues.includes('hid') ? [i] : []));
  assert.deepEqual(hids, [hide.index], 'hid の cue');

  // hide：relax・歩かない・距離そのまま。長さは hideSec の範囲内
  for (const r of log.slice(hide.index, peek.index)) {
    assert.equal(r.cat.mode, 'relax', `hide 中の猫の様子（${r.t.toFixed(2)}秒）`);
    assert.ok(!r.cat.walking, `hide 中に歩いている（${r.t.toFixed(2)}秒）`);
    assert.equal(r.cat.distance, BOX.boxDistance, `hide 中の距離（${r.t.toFixed(2)}秒）`);
  }
  const hideLen = peek.at - hide.at;
  assert.ok(hideLen >= BOX.hideSec[0] - TOL && hideLen <= BOX.hideSec[1] + TOL, `hide の長さ ${hideLen}`);

  // peek：cue 'peek'、look で peekSec のあと hide に戻る
  const peeks = log.flatMap((r, i) => (r.cues.includes('peek') ? [i] : []));
  assert.deepEqual(peeks, [peek.index], 'peek の cue');
  for (const r of log.slice(peek.index, hide2.index)) assert.equal(r.cat.mode, 'look', `peek 中の猫の様子（${r.t.toFixed(2)}秒）`);
  assert.ok(near(hide2.at - peek.at, BOX.peekSec, TOL), `peek の長さ ${hide2.at - peek.at}`);
  assert.equal(log[hide2.index].cat.mode, 'relax');
});

test('箱の流れ：もぐっている長さは、乱数が端の値（0・0.999）でも hideSec の範囲内', async () => {
  const E = await loadEvents();
  const { BOX } = await loadParams();
  for (const v of [0, 0.999]) {
    const { log, reached } = runTicks(E.eventTick, boxStart(E.createEventState), { rng: fixedRng(v), until: untilEntered('peek', 1) });
    assert.ok(reached, `乱数 ${v}：peek の前に上限に達した（このテストの前提）`);
    const spans = phaseSpans(log);
    const hide = spans.find((s) => s.phase === 'hide');
    const peek = spans.find((s) => s.phase === 'peek');
    const len = peek.at - hide.at;
    assert.ok(len >= BOX.hideSec[0] - TOL && len <= BOX.hideSec[1] + TOL, `乱数 ${v}：hide の長さ ${len}`);
  }
});

// ---------------------------------------------------------------- 4. まばたき（eventAct）

test('peek 中のまばたき（plain）：applyAction を look で呼んだのと同じ day・feedback（blinkBack）。blinks+1 で happy、猫は purr', async () => {
  const E = await loadEvents();
  const s = reach(E, 'peek');
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
});

test('peek 中のまばたき（ツンデレのツン）：applyAction を look で呼んだのと同じ day・feedback（blinkAway）。hide に戻り、blinks は増えない', async () => {
  const E = await loadEvents();
  const tsundere = PERSONALITIES.tsundere;
  const s = reach(E, 'peek', { personality: tsundere });
  assert.ok(s.day.trust < tsundere.shyUntil, `信頼 ${s.day.trust} が shyUntil 以上（このテストの前提）`);
  const expected = applyAction(blink(1000), { ...s.cat, mode: 'look' }, s.day, tsundere);
  assert.equal(expected.feedback, 'blinkAway', 'applyAction の結果（このテストの前提）');
  const r = E.eventAct(blink(1000), s.ev, s.cat, s.day, tsundere);
  assert.ok(r, 'eventAct が null を返した');
  assert.equal(r.feedback, 'blinkAway');
  assert.deepEqual(r.day, expected.day);
  assert.equal(r.mistake, false);
  assert.equal(r.ev.phase, 'hide');
  assert.equal(r.ev.blinks, s.ev.blinks);
});

test('hide 中のまばたき：目が合っていないので、applyAction を relax で呼んだのと同じ day・feedback（stare）', async () => {
  const E = await loadEvents();
  const s = reach(E, 'hide');
  const expected = applyAction(blink(1000), { ...s.cat, mode: 'relax' }, s.day, plain);
  assert.equal(expected.feedback, 'stare', 'applyAction の結果（このテストの前提）');
  const r = E.eventAct(blink(1000), s.ev, s.cat, s.day, plain);
  assert.ok(r, 'eventAct が null を返した');
  assert.equal(r.feedback, 'stare');
  assert.deepEqual(r.day, expected.day);
  assert.equal(r.mistake, false);
  assert.equal(r.ev.blinks, s.ev.blinks);
});

// ---------------------------------------------------------------- 5. なでる（eventAct）

test('箱の中（hide・peek・happy）をなでる：feedback hide・ミス・信頼 −mistakeTrust・mistakes+1。hide に戻り、afterPetHideSec のあいだは peek しない', async () => {
  const E = await loadEvents();
  const { BOX } = await loadParams();
  // 乱数 0 なら、ふつうの hide は hideSec の最短。なでたあとは afterPetHideSec になることを確かめる
  const rng = fixedRng(0);
  // 信頼が mistakeTrust より多いところから始める（少ないと 0 で止まり、−mistakeTrust にならない）
  const dayOverrides = { trust: RULES.mistakeTrust + 10 };
  const states = {
    hide: reach(E, 'hide', { rng, dayOverrides }),
    peek: reach(E, 'peek', { rng, dayOverrides }),
  };
  const p = states.peek;
  const happy = E.eventAct(blink(1000), p.ev, p.cat, p.day, plain);
  assert.equal(happy.ev.phase, 'happy', 'まばたきで happy にならない（このテストの前提）');
  states.happy = { ev: happy.ev, cat: happy.cat, day: happy.day };

  for (const [phase, s] of Object.entries(states)) {
    const expected = applyAction(pet, { ...s.cat, mode: 'inBox' }, s.day, plain);
    const r = E.eventAct(pet, s.ev, s.cat, s.day, plain);
    assert.ok(r, `${phase}：eventAct が null を返した`);
    assert.equal(r.feedback, 'hide', phase);
    assert.equal(r.mistake, true, phase);
    assert.equal(r.day.trust, s.day.trust - RULES.mistakeTrust, phase);
    assert.equal(r.day.mistakes, s.day.mistakes + 1, phase);
    assert.deepEqual(r.day, expected.day, phase);
    assert.equal(r.ev.phase, 'hide', phase);
    // なでたあとは afterPetHideSec 隠れてから peek する
    const after = runTicks(E.eventTick, { ev: r.ev, cat: r.cat, day: r.day }, { rng, until: (x) => x.cues.includes('peek') });
    assert.ok(after.reached, `${phase}：なでたあと peek しないまま上限に達した`);
    for (const x of after.log.slice(0, -1)) assert.equal(x.ev.phase, 'hide', `${phase}：${x.t.toFixed(2)}秒で hide 以外になった`);
    const peekAt = after.log[after.log.length - 1].t;
    assert.ok(near(peekAt, BOX.afterPetHideSec, TOL), `${phase}：なでたあと ${peekAt}秒で peek した（afterPetHideSec ${BOX.afterPetHideSec}）`);
  }
});

test('approach 中になでる：くつろいでいるのと同じく逃げてミス（applyAction を relax で呼んだのと同じ）。approach に戻り、もう一度箱まで歩く', async () => {
  const E = await loadEvents();
  const { BOX } = await loadParams();
  // 信頼が mistakeTrust より多いところから始める（少ないと 0 で止まり、−mistakeTrust にならない）
  const start = { ...boxStart(E.createEventState, { trust: RULES.mistakeTrust + 10 }), cat: makeCat({ mode: 'relax', distance: 70, modeTimeLeft: 3 }) };
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
  // もう一度箱まで歩いて、drop する
  const again = runTicks(E.eventTick, { ev: r.ev, cat: r.cat, day: r.day }, { until: (x) => x.cues.includes('drop') });
  assert.ok(again.reached, '逃げたあと、箱まで歩かないまま上限に達した');
  assert.equal(again.last.cat.distance, BOX.boxDistance);
  assert.equal(again.last.ev.phase, 'arrive');
});

// ---------------------------------------------------------------- 6. 箱から出てくる（done）

// peek のたびにまばたきして blinksToFinish 回成功させ、cue 'out' の tick まで進める
function finishBox(E, BOX, dayOverrides) {
  let cur = boxStart(E.createEventState, dayOverrides);
  const cues = [];
  for (let n = 1; n <= BOX.blinksToFinish; n++) {
    const p = runTicks(E.eventTick, cur, { until: (r) => r.ev.phase === 'peek' });
    assert.ok(p.reached, `${n}回目の peek の前に上限に達した（このテストの前提）`);
    cues.push(...p.log.flatMap((r) => r.cues));
    const a = E.eventAct(blink(1000), p.last.ev, p.last.cat, p.last.day, plain);
    assert.equal(a.feedback, 'blinkBack', `${n}回目のまばたき（このテストの前提）`);
    assert.equal(a.ev.blinks, n, `${n}回目のまばたきのあとの blinks`);
    cur = { ev: a.ev, cat: a.cat, day: a.day };
    if (n < BOX.blinksToFinish) {
      // まだ足りない：happy のあとは hide に戻る
      const h = runTicks(E.eventTick, cur, { until: (r) => r.ev.phase !== 'happy' });
      assert.ok(h.reached, `${n}回目の happy が終わらない`);
      assert.equal(h.last.ev.phase, 'hide', `${n}回目の happy のあと`);
      assert.ok(!h.log.some((r) => r.cues.includes('out')), `${n}回目で out した`);
      cues.push(...h.log.flatMap((r) => r.cues));
      cur = h.last;
    }
  }
  const beforeOut = cur;
  const o = runTicks(E.eventTick, cur, { until: (r) => r.cues.includes('out') });
  assert.ok(o.reached, '最後の happy のあと out しないまま上限に達した');
  cues.push(...o.log.flatMap((r) => r.cues));
  const prev = o.log.length >= 2 ? o.log[o.log.length - 2] : beforeOut;
  return { cues, beforeOut, outTick: o.log[o.log.length - 1], prevDay: prev.day, last: o.last };
}

test('blinksToFinish 回まばたきが成功すると、happy のあと out：done・cue out・猫は relax・信頼が doneTrust×trustRate だけ1回増える', async () => {
  const E = await loadEvents();
  const { BOX } = await loadParams();
  assert.equal(typeof BOX.doneTrust, 'number', 'EVENTS.box.doneTrust がない');
  const trustRate = 0.5;
  const { cues, beforeOut, outTick, prevDay, last } = finishBox(E, BOX, { trustRate });
  assert.equal(beforeOut.ev.phase, 'happy', '最後のまばたきのあと happy になっていない');
  assert.equal(cues.filter((c) => c === 'out').length, 1, 'out の cue の数');
  assert.equal(outTick.ev.done, true);
  assert.equal(outTick.cat.mode, 'relax');
  // out の tick：落ち着いている分（calmTrustPerSec×dt）と doneTrust に、trustRate がかかる
  const expected = Math.min(MAX_VALUE, prevDay.trust + (RULES.calmTrustPerSec * DT + BOX.doneTrust) * trustRate);
  assert.ok(near(outTick.day.trust, expected), `out の tick の信頼 ${outTick.day.trust}（期待 ${expected}）`);
  // そのあと eventTick が呼ばれても、もう増えない（1回だけ）
  let cur = last;
  for (let i = 0; i < 5; i++) {
    const r = E.eventTick(cur.ev, cur.cat, cur.day, plain, DT, fixedRng(0.5));
    assert.ok(!r.cues.includes('out'), `done のあと ${i + 1} tick 目に out の cue`);
    assert.equal(r.ev.done, true);
    assert.ok(r.day.trust <= cur.day.trust + RULES.calmTrustPerSec * DT * trustRate + 1e-9, `done のあと ${i + 1} tick 目に信頼が ${r.day.trust - cur.day.trust} 増えた`);
    cur = { ev: r.ev, cat: r.cat, day: r.day };
  }
});

test('done のあとの eventAct は null（まばたき・なでるとも、いつもの applyAction に任せる）', async () => {
  const E = await loadEvents();
  const { BOX } = await loadParams();
  const { last } = finishBox(E, BOX, {});
  assert.equal(last.ev.done, true, 'done になっていない（このテストの前提）');
  assert.equal(E.eventAct(blink(1000), last.ev, { ...last.cat, mode: 'look' }, last.day, plain), null);
  assert.equal(E.eventAct(blink(1000), last.ev, last.cat, last.day, plain), null);
  assert.equal(E.eventAct(pet, last.ev, last.cat, last.day, plain), null);
});

// ---------------------------------------------------------------- 8・9. 昼の画面（dayScene）

const BOX_DAY = 4;
const boxEvents = () => Array.from({ length: MAX_DAY }, (_, i) => (i === BOX_DAY - 1 ? 'box' : null));

// 昼の画面を作り、トースト・止めるカード・onEnd を記録する。session を渡すと、それを使う（同じプレイの続き）
async function boxDayScene({ personality = 'amaenbo', day = BOX_DAY, events = boxEvents(), trust = 0, seenCards = null, rng = fixedRng(0.5), session = null } = {}) {
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

// 箱の流れを進め、猫が顔を出したら（peek・こちらを見ている）まばたきする。done() が true になるまで
function playBox(scene, done) {
  for (let i = 0; i < 2000 && !done(); i++) {
    const prop = scene.view().prop;
    if (prop && prop.phase === 'peek' && scene.state().cat.mode === 'look') scene.act(blink(1000));
    scene.update(DT);
  }
}

async function eventText(key) {
  const { EVENT_TEXT, withName } = await import('../src/data/texts.js');
  assert.ok(EVENT_TEXT && EVENT_TEXT.box, 'texts.js に EVENT_TEXT.box がない');
  assert.equal(typeof EVENT_TEXT.box[key], 'string', `EVENT_TEXT.box.${key} がない`);
  return withName(EVENT_TEXT.box[key], 'たま');
}

test('昼の画面：箱の日の始めに event:box の説明カード（pause: true）を1回だけ出す。同じプレイでもう一度箱の昼を始めても出さない', async () => {
  const { CARDS, withName } = await import('../src/data/texts.js');
  const card = CARDS['event:box'];
  assert.ok(card, "CARDS['event:box'] がない");
  assert.equal(card.pause, true, "CARDS['event:box'] は止めるカード（pause: true）");
  const expected = { title: withName(card.title, 'たま'), body: withName(card.body, 'たま') };
  const first = await boxDayScene({ seenCards: Object.keys(CARDS).filter((k) => k !== 'event:box') });
  for (let i = 0; i < 20; i++) first.scene.update(DT);
  assert.deepEqual(first.cards, [expected]);
  assert.ok(first.session.game.seenCards.includes('event:box'), 'seenCards に event:box が入っていない');
  const second = await boxDayScene({ session: first.session });
  for (let i = 0; i < 20; i++) second.scene.update(DT);
  assert.deepEqual(second.cards, [], '2回目の箱の昼でもカードが出た');
});

test("昼の画面：箱の日、猫が箱にもぐったら（cue 'hid'）EVENT_TEXT.box.hid のトーストを1回出す", async () => {
  const hid = await eventText('hid');
  const { scene, toasts } = await boxDayScene();
  for (let i = 0; i < 600 && !toasts.some((t) => t.text === hid); i++) scene.update(DT);
  assert.equal(toasts.filter((t) => t.text === hid).length, 1, `トースト: ${toasts.map((t) => t.text).join(' / ')}`);
});

test("昼の画面：顔を出すたびにまばたきして箱から出てきたら（cue 'out'）EVENT_TEXT.box.out のトーストを1回出し、そのあとはいつもの tick に戻って、信頼100・距離0で膝に乗る", async () => {
  const out = await eventText('out');
  // 乱数 0：もぐる長さは hideSec の最短、いつもの tick では次の様子が「くつろぎ」（候補の先頭）になる
  const { scene, toasts } = await boxDayScene({ rng: fixedRng(0) });
  playBox(scene, () => toasts.some((t) => t.text === out));
  assert.equal(toasts.filter((t) => t.text === out).length, 1, `トースト: ${toasts.map((t) => t.text).join(' / ')}`);
  assert.ok(scene.state().day.timeLeft > 0, '箱から出る前に時間切れになった（このテストの前提）');
  scene.trustMax();
  for (let i = 0; i < 600 && scene.state().cat.mode !== 'lap'; i++) scene.update(DT);
  assert.equal(scene.state().cat.mode, 'lap', `膝に乗らない（猫 ${scene.state().cat.mode}・距離 ${scene.state().cat.distance}）`);
  assert.equal(scene.state().cat.distance, 0);
  assert.equal(toasts.filter((t) => t.text === out).length, 1, 'out のトーストが2回以上出た');
});

test('昼の画面：箱の日も、時間切れ（timeLeft 0）で日が終わり、onEnd が1回呼ばれる', async () => {
  const { scene, ends } = await boxDayScene();
  const durationSec = DAYS[BOX_DAY - 1].durationSec;
  for (let i = 0; i < Math.floor((durationSec - 1) / DT); i++) scene.update(DT);
  assert.deepEqual(ends, [], '時間切れの前に日が終わった');
  for (let i = 0; i < Math.ceil(5 / DT); i++) scene.update(DT);
  assert.equal(ends.length, 1, 'onEnd の呼ばれた回数');
  assert.equal(ends[0].lapped, false);
  assert.equal(scene.state().day.timeLeft, 0);
});

test("昼の画面の view().prop：箱の日は kind 'parcel'（phase つき）、いつもの日は null", async () => {
  const box = await boxDayScene();
  box.scene.update(DT);
  const prop = box.scene.view().prop;
  assert.ok(prop, `箱の日の view().prop が ${prop}`);
  assert.equal(prop.kind, 'parcel');
  assert.equal(typeof prop.phase, 'string');
  // 箱は4日目なので3日目はいつもの日。イベントのないゲームの4日目もいつもの日
  for (const [label, opts] of [['箱が4日目のゲームの3日目', { day: 3 }], ['イベントのないゲームの4日目', { events: Array(MAX_DAY).fill(null) }]]) {
    const { scene } = await boxDayScene(opts);
    assert.equal(scene.view().prop, null, label);
    scene.update(DT);
    assert.equal(scene.view().prop, null, `${label}（update のあと）`);
  }
});

// ---------------------------------------------------------------- 10. 描画（通販の箱）

// 文字の描画（fillText）を、フレームごとに記録する偽の Canvas（tests/renderer.test.js と同じ作り）
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

test("描画：view.prop が { kind: 'parcel' } なら、通販の箱の「ワレモノ」を描く", async () => {
  const { BOX } = await loadParams();
  for (const [phase, mode] of [['hide', 'relax'], ['peek', 'look'], ['happy', 'purr'], ['left', 'relax']]) {
    const texts = drawnTexts({ scene: 'day', wariness: 0, cat: { mode, distance: BOX.boxDistance }, prop: { kind: 'parcel', phase, phaseT: 0.5 } });
    assert.ok(texts.includes('ワレモノ'), `phase ${phase} で「ワレモノ」がない: ${texts.join(' / ')}`);
  }
});

test('描画：prop が無い日・夜の段ボール（猫の様子 inBox）では「ワレモノ」を描かない', () => {
  const views = [
    ['prop が null の昼', { scene: 'day', wariness: 0, cat: { mode: 'relax', distance: 50 }, prop: null }],
    ['prop の無い昼', { scene: 'day', wariness: 0, cat: { mode: 'relax', distance: 50 } }],
    ['段ボールの翌朝（inBox）', { scene: 'day', wariness: 0, cat: { mode: 'inBox', distance: 70 }, prop: null }],
    ['夜の段ボール（inBox）', { scene: 'night', cat: { mode: 'inBox', distance: 70 } }],
  ];
  for (const [label, view] of views) {
    const texts = drawnTexts(view);
    assert.ok(!texts.includes('ワレモノ'), `${label}で「ワレモノ」が描かれている`);
  }
});

// ---------------------------------------------------------------- 11. 不具合の再現（前の晩の段ボール・逃げている猫・peek から hide にまたがるまばたき）

test('箱の日・前の晩に段ボール：boxLockLeft > 0 の間は inBox のまま歩かず（phase approach）boxLockLeft が dt ずつ減り、0 になってから箱へ歩く。done のあと tick に戻っても段ボールに入り直さない', async () => {
  const E = await loadEvents();
  const { BOX } = await loadParams();
  const { createGame, startDay } = await import('../src/game/progression.js');
  const { tick } = await import('../src/game/catBrain.js');
  const personality = PERSONALITIES.amaenbo;
  // 乱数 0：もぐる長さは hideSec の最短
  const rng = fixedRng(0);
  const game = { ...createGame({ personality: 'amaenbo', seed: 1, events: boxEvents() }), day: BOX_DAY, trust: 10, nightChoice: 'box' };
  const s = startDay(game);
  assert.equal(s.day.event, 'box', '4日目が箱の日（このテストの前提）');
  assert.equal(s.cat.mode, 'inBox', '前の晩に段ボールなら inBox で始まる（このテストの前提）');
  assert.equal(s.day.boxLockLeft, personality.boxLockSec, 'boxLockLeft は boxLockSec で始まる（このテストの前提）');
  const start = { ev: E.createEventState('box'), cat: s.cat, day: s.day };

  // boxLockLeft が 0 になったあと、2 tick 進める
  let zeroAt = -1;
  const { log, reached } = runTicks(E.eventTick, start, {
    personality,
    rng,
    until: (r) => {
      if (zeroAt < 0 && r.day.boxLockLeft === 0) zeroAt = 0;
      else if (zeroAt >= 0) zeroAt++;
      return zeroAt >= 2;
    },
  });
  const zeroIndex = log.findIndex((r) => r.day.boxLockLeft === 0);
  // boxLockLeft > 0 の間：inBox・歩かない・距離そのまま・phase approach・boxLockLeft は dt ずつ減る
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
  // boxLockSec たったところで 0 になる
  assert.ok(near(log[zeroIndex].t, personality.boxLockSec, TOL), `boxLockLeft が 0 になった時刻 ${log[zeroIndex].t}`);
  assert.equal(log[zeroIndex].ev.phase, 'approach');
  // 0 になった次の tick：くつろいで箱へ歩く（approachSpeed×approachMul×dt だけ近づく）
  const walk = log[zeroIndex + 1];
  assert.equal(walk.cat.mode, 'relax', '0 になったあとの猫の様子');
  assert.equal(walk.cat.walking, true, '0 になったあと歩いていない');
  assert.equal(walk.ev.phase, 'approach');
  const before = log[zeroIndex].cat.distance;
  assert.ok(near(walk.cat.distance, before - personality.approachSpeed * s.day.approachMul * DT), `0 になったあとの距離 ${walk.cat.distance}（前の tick ${before}）`);

  // 箱まで歩いて drop する
  const toBox = runTicks(E.eventTick, { ev: walk.ev, cat: walk.cat, day: walk.day }, { personality, rng, until: (r) => r.cues.includes('drop') });
  assert.ok(toBox.reached, '箱まで歩かないまま上限に達した');
  assert.equal(toBox.last.cat.distance, BOX.boxDistance);

  // peek のたびにまばたきして、done まで進める
  let cur = toBox.last;
  for (let n = 1; n <= BOX.blinksToFinish; n++) {
    const p = runTicks(E.eventTick, cur, { personality, rng, until: (r) => r.ev.phase === 'peek' });
    assert.ok(p.reached, `${n}回目の peek の前に上限に達した（このテストの前提）`);
    const a = E.eventAct(blink(1000), p.last.ev, p.last.cat, p.last.day, personality);
    assert.equal(a.feedback, 'blinkBack', `${n}回目のまばたき（このテストの前提）`);
    cur = { ev: a.ev, cat: a.cat, day: a.day };
  }
  const o = runTicks(E.eventTick, cur, { personality, rng, until: (r) => r.ev.done });
  assert.ok(o.reached, 'done にならないまま上限に達した');
  assert.equal(o.last.day.boxLockLeft, 0, 'done のときの boxLockLeft');
  assert.ok(o.last.day.timeLeft > 0, 'done の前に時間切れになった（このテストの前提）');

  // done のあと、いつもの tick に戻っても段ボールに入り直さない
  let c = o.last.cat;
  let d = o.last.day;
  for (let i = 1; i <= 20; i++) {
    const r = tick(c, d, personality, DT, rng);
    assert.notEqual(r.cat.mode, 'inBox', `done のあと ${i} tick 目に段ボールに入った`);
    assert.equal(r.day.boxLockLeft, 0, `done のあと ${i} tick 目の boxLockLeft`);
    c = r.cat;
    d = r.day;
  }
});

test('approach 中になでて逃げた（flee）直後に、もう一度なでても何も起きない：feedback null・ミスではない・mistakes と信頼は変わらない', async () => {
  const E = await loadEvents();
  const start = { ...boxStart(E.createEventState), cat: makeCat({ mode: 'relax', distance: 70, modeTimeLeft: 3 }) };
  const s = runTicks(E.eventTick, start, { maxSec: DT }).last;
  assert.equal(s.ev.phase, 'approach', 'approach のまま（このテストの前提）');
  const first = E.eventAct(pet, s.ev, s.cat, s.day, plain);
  assert.equal(first.cat.mode, 'flee', '1回目になでて逃げる（このテストの前提）');
  assert.equal(first.mistake, true, '1回目はミス（このテストの前提）');
  const r = E.eventAct(pet, first.ev, first.cat, first.day, plain);
  assert.ok(r, 'eventAct が null を返した');
  assert.equal(r.feedback, null);
  assert.equal(r.mistake, false);
  assert.equal(r.day.mistakes, first.day.mistakes);
  assert.equal(r.day.trust, first.day.trust);
});

test('peek 中に押し始めたまばたき（sawLook: true）を hide で離す：peek のときと同じく look で判定。blinkBack なら blinks+1 で happy。sawLook が偽なら stare のまま', async () => {
  const E = await loadEvents();
  const p = reach(E, 'peek');
  // peek のまま peekSec たって、hide に戻ったところ
  const h = runTicks(E.eventTick, p, { until: (r) => r.ev.phase === 'hide' });
  assert.ok(h.reached, 'peek のあと hide に戻らないまま上限に達した（このテストの前提）');
  const s = h.last;
  assert.equal(s.ev.phase, 'hide', 'hide に戻った（このテストの前提）');

  // sawLook: true：peek のときと同じ（applyAction を look で呼んだのと同じ day・feedback）
  const seen = { type: 'blink', holdMs: 1000, sawLook: true };
  const expected = applyAction(seen, { ...s.cat, mode: 'look' }, s.day, plain);
  assert.equal(expected.feedback, 'blinkBack', 'applyAction の結果（このテストの前提）');
  const r = E.eventAct(seen, s.ev, s.cat, s.day, plain);
  assert.ok(r, 'eventAct が null を返した');
  assert.equal(r.feedback, 'blinkBack');
  assert.deepEqual(r.day, expected.day);
  assert.equal(r.mistake, false);
  assert.equal(r.ev.phase, 'happy');
  assert.equal(r.ev.blinks, s.ev.blinks + 1);
  assert.equal(r.cat.mode, 'purr');

  // sawLook: false：目が合っていないので stare（applyAction を relax で呼んだのと同じ）
  const unseen = { type: 'blink', holdMs: 1000, sawLook: false };
  const expectedStare = applyAction(unseen, { ...s.cat, mode: 'relax' }, s.day, plain);
  assert.equal(expectedStare.feedback, 'stare', 'applyAction の結果（このテストの前提）');
  const q = E.eventAct(unseen, s.ev, s.cat, s.day, plain);
  assert.ok(q, 'eventAct が null を返した');
  assert.equal(q.feedback, 'stare');
  assert.deepEqual(q.day, expectedStare.day);
  assert.equal(q.mistake, false);
  assert.equal(q.ev.phase, 'hide');
  assert.equal(q.ev.blinks, s.ev.blinks);
});

// ---------------------------------------------------------------- 不具合の再現：ツンデレのツンの間に箱の日が来ると、箱から出てこない
// ツンの間は、顔を出したとき（peek）にまばたきしても blinkAway になる。peek がまばたきされずに終わったら「見つめないでくれた」として数える

// ツンの間のツンデレ（信頼 shyUntil 未満・dere false）の箱の日。時間は、その日の長さ（箱の日の durationSec）
function shyBoxStart(E, dayOverrides = {}) {
  const tsundere = PERSONALITIES.tsundere;
  assert.ok(tsundere.shyUntil > 10, `ツンデレの shyUntil ${tsundere.shyUntil}（このテストの前提）`);
  return boxStart(E.createEventState, { trust: 10, dere: false, timeLeft: DAYS[BOX_DAY - 1].durationSec, ...dayOverrides });
}

// peek が終わった tick（直前の tick が peek で、この tick で peek でなくなった）を、順に返す
function peekEnds(start, log) {
  const ends = [];
  let prev = start.ev.phase;
  for (const r of log) {
    if (prev === 'peek' && r.ev.phase !== 'peek') ends.push(r);
    prev = r.ev.phase;
  }
  return ends;
}

test('不具合の再現：ツンデレ・信頼 shyUntil 未満・dere false の箱の日、まばたきせずに待つと、その日のうちに out・done になり、信頼に doneTrust×trustRate が入る', async () => {
  const E = await loadEvents();
  const { BOX } = await loadParams();
  const tsundere = PERSONALITIES.tsundere;
  const trustRate = 0.5;
  const start = shyBoxStart(E, { trustRate });
  const { log, reached } = runTicks(E.eventTick, start, { personality: tsundere, maxSec: start.day.timeLeft, until: (r) => r.cues.includes('out') });
  assert.ok(reached, `その日のうちに箱から出てこない（最後の phase ${log[log.length - 1].ev.phase}・blinks ${log[log.length - 1].ev.blinks}）`);
  const outTick = log[log.length - 1];
  assert.ok(outTick.day.timeLeft > 0, 'out の tick で時間切れになっている');
  assert.ok(log.every((r) => isShyNow(r.day, tsundere)), 'out までの間にツンでなくなった（このテストの前提）');
  assert.equal(outTick.ev.done, true);
  assert.equal(outTick.ev.phase, 'out');
  assert.equal(outTick.cat.mode, 'relax');
  const prevTrust = log.length >= 2 ? log[log.length - 2].day.trust : start.day.trust;
  const expected = Math.min(MAX_VALUE, prevTrust + (RULES.calmTrustPerSec * DT + BOX.doneTrust) * trustRate);
  assert.ok(near(outTick.day.trust, expected), `out の tick の信頼 ${outTick.day.trust}（期待 ${expected}）`);
});

// ツンの間か（src/game/rules.js の isShy と同じ条件：まだデレていなくて、信頼が shyUntil 未満）
function isShyNow(day, personality) {
  return !day.dere && day.trust < personality.shyUntil;
}

test("ツンの間の箱：1回目の peek がまばたきされずに終わると blinks 1・cue 'watched'・phase hide。2回目の peek が終わると phase happy", async () => {
  const E = await loadEvents();
  const { BOX } = await loadParams();
  assert.equal(BOX.blinksToFinish, 2, 'blinksToFinish が 2（このテストの前提）');
  const tsundere = PERSONALITIES.tsundere;
  const start = shyBoxStart(E);
  const { log, reached } = runTicks(E.eventTick, start, { personality: tsundere, until: (r) => r.ev.phase === 'happy' || r.ev.done });
  assert.ok(reached, `happy にならないまま上限に達した（peek の終わり: ${peekEnds(start, log).map((r) => r.ev.phase).join(',')}）`);
  const ends = peekEnds(start, log);
  assert.ok(ends.length >= 1, 'peek が1回も終わっていない（このテストの前提）');
  assert.ok(isShyNow(ends[0].day, tsundere), '1回目の peek の終わりでツンでない（このテストの前提）');
  assert.equal(ends[0].ev.blinks, 1, '1回目の peek の終わりの blinks');
  assert.deepEqual(ends[0].cues, ['watched'], '1回目の peek の終わりの cue');
  assert.equal(ends[0].ev.phase, 'hide', '1回目の peek の終わりの phase');
  assert.equal(ends.length, 2, `peek が終わった回数: ${ends.length}`);
  assert.equal(ends[1].ev.phase, 'happy', '2回目の peek の終わりの phase');
});

test("ツンのない猫（甘えん坊）・デレたあとのツンデレ（dere true）は、peek がまばたきされずに終わっても blinks は増えず、cue 'watched' は出ない（hide に戻る）", async () => {
  const E = await loadEvents();
  const cases = [
    ['甘えん坊', PERSONALITIES.amaenbo, { trust: 10, dere: true }],
    ['ツンデレ dere true', PERSONALITIES.tsundere, { trust: 10, dere: true }],
  ];
  for (const [label, personality, dayOverrides] of cases) {
    const start = boxStart(E.createEventState, dayOverrides);
    const { log, reached } = runTicks(E.eventTick, start, { personality, until: untilEntered('peek', 2) });
    assert.ok(reached, `${label}：2回目の peek の前に上限に達した（このテストの前提）`);
    const ends = peekEnds(start, log);
    assert.equal(ends.length, 1, `${label}：peek が終わった回数（このテストの前提）`);
    assert.equal(ends[0].ev.phase, 'hide', `${label}：peek の終わりの phase`);
    assert.equal(ends[0].ev.blinks, 0, `${label}：peek の終わりの blinks`);
    assert.ok(!log.some((r) => r.cues.includes('watched')), `${label}：cue 'watched' が出た`);
  }
});

test("ツンの間に peek でまばたき：blinkAway で hide に戻り、blinks は増えない。その peek は数えず、次の peek まで cue 'watched' は出ない", async () => {
  const E = await loadEvents();
  const tsundere = PERSONALITIES.tsundere;
  const start = shyBoxStart(E);
  const p = runTicks(E.eventTick, start, { personality: tsundere, until: (r) => r.ev.phase === 'peek' });
  assert.ok(p.reached, 'peek の前に上限に達した（このテストの前提）');
  assert.ok(isShyNow(p.last.day, tsundere), 'peek でツンでない（このテストの前提）');
  const a = E.eventAct(blink(1000), p.last.ev, p.last.cat, p.last.day, tsundere);
  assert.equal(a.feedback, 'blinkAway');
  assert.equal(a.ev.phase, 'hide');
  assert.equal(a.ev.blinks, p.last.ev.blinks);
  const next = runTicks(E.eventTick, { ev: a.ev, cat: a.cat, day: a.day }, { personality: tsundere, until: (r) => r.ev.phase === 'peek' });
  assert.ok(next.reached, '次の peek の前に上限に達した（このテストの前提）');
  assert.ok(!next.log.some((r) => r.cues.includes('watched')), "まばたきした peek のあとに cue 'watched' が出た");
  assert.equal(next.last.ev.blinks, p.last.ev.blinks, '次の peek までの blinks');
});

// 昼の画面を作り、トースト・効果を記録する（boxDayScene と同じ作りで、効果も記録する）
async function boxEffectDayScene({ personality, trust }) {
  const { createDayScene } = await import('../src/scenes/dayScene.js');
  const { createGame } = await import('../src/game/progression.js');
  const { CARDS } = await import('../src/data/texts.js');
  const noop = () => {};
  const toasts = [];
  const effects = [];
  const overlay = { busy: false, splash: noop, card: noop, bubble: noop, toast: (text, ms) => toasts.push({ text, ms }), clear: noop };
  const hud = { show: noop, update: noop };
  const renderer = { addEffect: (type) => effects.push(type), hitTestCat: () => true };
  const input = { setBlinkEnabled: noop, holdMs: () => 0 };
  const sound = { purr: noop, meow: noop, bump: noop };
  const session = {
    game: { ...createGame({ personality, seed: 1 }), day: BOX_DAY, trust, catName: 'たま', events: boxEvents(), seenCards: Object.keys(CARDS) },
    misses: {},
  };
  const scene = createDayScene({ session, overlay, hud, renderer, input, sound, rng: fixedRng(0.5), onEnd: noop });
  return { scene, toasts, effects };
}

test("昼の画面：ツンの間の箱で peek がまばたきされずに終わった（cue 'watched'）update に、EVENT_TEXT.box.watched のトーストと relief の効果が出る", async () => {
  const watched = await eventText('watched');
  const { scene, toasts, effects } = await boxEffectDayScene({ personality: 'tsundere', trust: 0 });
  assert.equal(scene.view().shy, true, 'ツンの間でない（このテストの前提）');
  let endStep = null;
  for (let i = 0; i < 2000 && !endStep && scene.state().day.timeLeft > 0; i++) {
    const before = scene.view().prop?.phase;
    const n = { toasts: toasts.length, effects: effects.length };
    scene.update(DT);
    if (before === 'peek' && scene.view().prop?.phase !== 'peek') endStep = { toasts: toasts.slice(n.toasts).map((t) => t.text), effects: effects.slice(n.effects) };
  }
  assert.ok(endStep, 'peek が終わらないまま進めた（このテストの前提）');
  assert.deepEqual(endStep.toasts.filter((t) => t === watched), [watched], `peek が終わった update のトースト: ${endStep.toasts.join(' / ')}`);
  assert.ok(endStep.effects.includes('relief'), `peek が終わった update の効果: ${endStep.effects.join(',')}`);
});
