// イベント「読書中」のテスト（書き方は tests/eventBird.test.js の鳥のテストに合わせる）。
// まだ無い名前（EVENTS.read、CARDS['event:read']、EVENT_TEXT.read、hitTestBook、sound.page など）は、
// 先頭で import すると、このファイルのほかのテストまで読めなくなるので、テストの中で動的 import する
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction } from '../src/game/rules.js';
import { distanceFloor } from '../src/game/catBrain.js';
import { RULES, PERSONALITIES, DAYS, MAX_DAY, MAX_VALUE } from '../src/data/params.js';
import { createRenderer } from '../src/render/renderer.js';
import { createSound } from '../src/ui/sound.js';
import { makeDay, makeCat, fixedRng } from './helpers.js';

// ツンデレをもとに、性格の得意・苦手（likes）とツン（shyUntil）をなくした猫。ルールそのものを確かめる
const plain = { ...PERSONALITIES.tsundere, likes: { pet: 1, blink: 1, patience: 1 }, shyUntil: 0 };
const blink = (holdMs) => ({ type: 'blink', holdMs });
const pet = { type: 'pet' };
const PAGE = { type: 'page' };

const DT = 0.05;
// 1 tick ぶんの誤差まで許す
const TOL = DT + 1e-6;
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// 本の真ん中あたり・画面の上のほう（論理座標）
const BOOK = { x: 180, y: 590 };
const TOP = { x: 180, y: 200 };

const READ_KEYS = ['readSec', 'readSpeed', 'peekBookSec', 'doneTrust'];

async function loadRead() {
  const P = await import('../src/data/params.js');
  assert.ok(P.EVENTS && P.EVENTS.read, 'params.js に EVENTS.read がない');
  for (const key of READ_KEYS) assert.equal(typeof P.EVENTS.read[key], 'number', `EVENTS.read.${key} がない`);
  return P.EVENTS.read;
}

async function loadEvents() {
  const E = await import('../src/game/events.js');
  for (const name of ['createEventState', 'eventTick', 'eventAct', 'eventProp']) {
    assert.equal(typeof E[name], 'function', `events.js に ${name} がない`);
  }
  return E;
}

// 読書の日の始まり：部屋の隅（距離100）でくつろいでいて、落ち着いている（警戒0）。時間はたっぷりある
function readStart(createEventState, dayOverrides = {}, catOverrides = {}) {
  return {
    ev: createEventState('read'),
    cat: makeCat({ mode: 'relax', distance: MAX_VALUE, modeTimeLeft: 3, ...catOverrides }),
    day: makeDay({ trust: 10, wariness: 0, timeLeft: 1000, ...dayOverrides }),
  };
}

// ページをめくる（eventAct に type 'page'）。めくれなければ分かるメッセージで落とす
function turnPage(E, cur, personality = plain) {
  const r = E.eventAct(PAGE, cur.ev, cur.cat, cur.day, personality);
  assert.ok(r, 'ページをめくれない（eventAct が null を返した）');
  return { ev: r.ev, cat: r.cat, day: r.day };
}

// eventTick を DT ずつ呼び、各 tick の結果を時刻つきで記録する。until(r) が true になった tick で止める。
// beforeTick(cur) を渡すと、各 tick の前に呼び、その戻り値で進める（ページをめくるのに使う）。before はその tick の直前の状態
function runTicks(eventTick, start, { personality = plain, rng = fixedRng(0.5), maxSec = 120, until = () => false, beforeTick = null } = {}) {
  const log = [];
  let cur = start;
  let t = 0;
  while (t < maxSec - 1e-9) {
    if (beforeTick) cur = beforeTick(cur);
    const r = eventTick(cur.ev, cur.cat, cur.day, personality, DT, rng);
    t += DT;
    log.push({ t, before: cur, ...r });
    cur = { ev: r.ev, cat: r.cat, day: r.day };
    if (until(r)) return { log, last: cur, reached: true };
  }
  return { log, last: cur, reached: false };
}

// 読んでいる残りが1秒以下になったら、めくり直す（読むのをやめない）
const keepReading = (E, personality = plain) => (cur) => (cur.ev.phase === 'read' && !cur.ev.done && cur.ev.readLeft <= 1 ? turnPage(E, cur, personality) : cur);

// 読み続けて、peekBook に入った tick まで進める
function reachPeekBook(E, start, { personality = plain } = {}) {
  const o = runTicks(E.eventTick, start, { personality, beforeTick: keepReading(E, personality), until: (r) => r.ev.phase === 'peekBook' });
  assert.ok(o.reached, 'peekBook に入らないまま上限に達した（このテストの前提）');
  return o;
}

// 読んでいる途中の状態：距離 60 でめくって、1秒進める
function readingMiddle(E, R, dayOverrides = {}) {
  assert.ok(R.readSec > 1, 'readSec が 1秒より長い（このテストの前提）');
  const s = turnPage(E, readStart(E.createEventState, dayOverrides, { distance: 60 }));
  const m = runTicks(E.eventTick, s, { maxSec: 1 });
  assert.equal(m.last.ev.phase, 'read', '読んでいる途中（このテストの前提）');
  assert.ok(m.last.ev.readLeft > 0, '読んでいる途中（readLeft > 0。このテストの前提）');
  assert.equal(m.last.cat.mode, 'relax', '読んでいる途中の猫はくつろぎ（このテストの前提）');
  return m.last;
}

// 本をのぞき込んでいる途中の状態：近くからめくって peekBook に入り、さらに 0.5 秒進める
function peekBookMiddle(E, R) {
  assert.ok(R.peekBookSec > 0.5, 'peekBookSec が 0.5秒より長い（このテストの前提）');
  const o = reachPeekBook(E, readStart(E.createEventState, {}, { distance: R.readSpeed * 0.5 }));
  const m = runTicks(E.eventTick, o.last, { maxSec: 0.5 });
  assert.equal(m.last.ev.phase, 'peekBook', '本をのぞき込んでいる途中（このテストの前提）');
  assert.equal(m.last.cat.mode, 'peekBook', '本をのぞき込んでいる途中の猫の様子（このテストの前提）');
  return m.last;
}

// ---------------------------------------------------------------- 1. ページをめくると readSec の間だけ readSpeed で近づく

test("読書の流れ：createEventState('read') は phase 'read'・phaseT 0・done false・readLeft 0・pages 0・wondered false。eventProp は { kind: 'book', phase: 'read', phaseT: 0, pages: 0 }", async () => {
  await loadRead();
  const E = await loadEvents();
  const ev = E.createEventState('read');
  assert.equal(ev.id, 'read');
  assert.equal(ev.phase, 'read');
  assert.equal(ev.phaseT, 0);
  assert.equal(ev.done, false);
  assert.equal(ev.readLeft, 0);
  assert.equal(ev.pages, 0);
  assert.equal(ev.wondered, false);
  assert.deepEqual(E.eventProp(ev), { kind: 'book', phase: 'read', phaseT: 0, pages: 0 });
});

test('ページをめくる：eventAct page で readLeft = readSec・pages+1（猫・day はそのまま、feedback null、mistake false）。readSec の間だけ毎 tick readSpeed×dt 近づき（walking true）、readLeft が 0 になったら止まる', async () => {
  const R = await loadRead();
  const E = await loadEvents();
  const start = readStart(E.createEventState, {}, { distance: 80 });
  assert.ok(start.cat.distance > R.readSpeed * R.readSec + 1, '1回読み終えても距離0にならない（このテストの前提）');
  const r = E.eventAct(PAGE, start.ev, start.cat, start.day, plain);
  assert.ok(r, 'eventAct が null を返した');
  assert.equal(r.feedback, null);
  assert.equal(r.mistake, false);
  assert.deepEqual(r.cat, start.cat, '猫は変わらない');
  assert.deepEqual(r.day, start.day, 'day は変わらない');
  assert.equal(r.ev.phase, 'read');
  assert.equal(r.ev.readLeft, R.readSec);
  assert.equal(r.ev.pages, 1);
  assert.equal(E.eventProp(r.ev).pages, 1, 'eventProp の pages');

  const { log } = runTicks(E.eventTick, { ev: r.ev, cat: r.cat, day: r.day }, { maxSec: R.readSec + 2 });
  let walked = 0;
  let stopAt = null;
  for (const x of log) {
    const label = `${x.t.toFixed(2)}秒`;
    assert.equal(x.ev.phase, 'read', `phase（${label}）`);
    assert.equal(x.cat.mode, 'relax', `猫の様子（${label}）`);
    assert.ok(x.ev.readLeft >= 0, `readLeft が 0 未満（${label}）: ${x.ev.readLeft}`);
    if (x.before.ev.readLeft > 0) {
      assert.ok(near(x.ev.readLeft, Math.max(0, x.before.ev.readLeft - DT)), `readLeft ${x.ev.readLeft}（${label}、前の tick ${x.before.ev.readLeft}）`);
      const step = x.before.cat.distance - x.cat.distance;
      assert.ok(near(step, R.readSpeed * DT), `読んでいる間に近づいた距離 ${step}（${label}、期待 ${R.readSpeed * DT}）`);
      assert.equal(x.cat.walking, true, `読んでいる間に歩いていない（${label}）`);
      walked += step;
    } else {
      assert.equal(x.ev.readLeft, 0, `読み終えたあとの readLeft（${label}）`);
      assert.equal(x.cat.distance, x.before.cat.distance, `読み終えたあとに近づいた（${label}）`);
      assert.equal(x.cat.walking, false, `読み終えたあとに歩いている（${label}）`);
    }
    if (stopAt === null && x.ev.readLeft === 0) stopAt = x.t;
  }
  assert.ok(stopAt !== null, 'readLeft が 0 にならない');
  assert.ok(near(stopAt, R.readSec, TOL), `readLeft が 0 になった時刻 ${stopAt}（期待 ${R.readSec}）`);
  assert.ok(near(walked, R.readSpeed * R.readSec, R.readSpeed * TOL), `1回めくって近づいた距離 ${walked}（期待 ${R.readSpeed * R.readSec}）`);
});

test('読んでいる途中にめくり直すと、readLeft は readSec に戻り（足さない）、pages は数える', async () => {
  const R = await loadRead();
  const E = await loadEvents();
  const s = readingMiddle(E, R);
  assert.ok(s.ev.readLeft < R.readSec, '読んでいる途中で readLeft が減っている（このテストの前提）');
  const r = E.eventAct(PAGE, s.ev, s.cat, s.day, plain);
  assert.ok(r, 'eventAct が null を返した');
  assert.equal(r.ev.readLeft, R.readSec);
  assert.equal(r.ev.pages, s.ev.pages + 1);
  assert.equal(r.ev.pages, 2);
  assert.equal(r.feedback, null);
  assert.equal(r.mistake, false);
  assert.deepEqual(r.cat, s.cat);
  assert.deepEqual(r.day, s.day);
});

test('読んでいる間は、いつもの distanceFloor（100 − 信頼 − distanceFloorOffset）より近くまで来る', async () => {
  const R = await loadRead();
  const E = await loadEvents();
  const trust = 10;
  const floor = distanceFloor(trust);
  assert.ok(floor > R.readSpeed * R.readSec, `下限 ${floor} が1回めくって近づく距離より遠い（このテストの前提）`);
  const s = turnPage(E, readStart(E.createEventState, { trust }, { distance: floor }));
  const { last } = runTicks(E.eventTick, s, { maxSec: R.readSec + 1 });
  const expected = floor - R.readSpeed * R.readSec;
  assert.ok(near(last.cat.distance, expected, R.readSpeed * TOL), `読み終えたあとの距離 ${last.cat.distance}（期待 ${expected}）`);
  assert.ok(last.cat.distance < floor, `いつもの下限 ${floor} より近くに来ていない: ${last.cat.distance}`);
});

test('逃げている（flee）最中でもめくれる：readLeft = readSec・pages+1、猫（flee のまま）・day はそのまま、feedback null', async () => {
  const R = await loadRead();
  const E = await loadEvents();
  const s = readingMiddle(E, R);
  const fled = E.eventAct(pet, s.ev, s.cat, s.day, plain);
  assert.equal(fled.cat.mode, 'flee', 'なでて逃げる（このテストの前提）');
  const r = E.eventAct(PAGE, fled.ev, fled.cat, fled.day, plain);
  assert.ok(r, '逃げている最中：eventAct が null を返した');
  assert.equal(r.ev.readLeft, R.readSec);
  assert.equal(r.ev.pages, fled.ev.pages + 1);
  assert.equal(r.feedback, null);
  assert.equal(r.mistake, false);
  assert.deepEqual(r.cat, fled.cat);
  assert.equal(r.cat.mode, 'flee');
  assert.deepEqual(r.day, fled.day);
});

// ---------------------------------------------------------------- 2. 読んでいないと近づかない・信頼は calm 分だけ

test('読んでいない（めくらない）と近づかない：phase read・relax・walking false・距離そのまま・cue なし。落ち着いていれば信頼は毎 tick calmTrustPerSec×dt×trustRate だけ増える', async () => {
  await loadRead();
  const E = await loadEvents();
  const trustRate = 0.8;
  const start = readStart(E.createEventState, { trustRate });
  const { log } = runTicks(E.eventTick, start, { maxSec: 3 });
  const perTick = RULES.calmTrustPerSec * DT * trustRate;
  for (const x of log) {
    const label = `${x.t.toFixed(2)}秒`;
    assert.equal(x.ev.phase, 'read', `phase（${label}）`);
    assert.equal(x.cat.mode, 'relax', `猫の様子（${label}）`);
    assert.equal(x.cat.walking, false, `読んでいないのに歩いている（${label}）`);
    assert.equal(x.cat.distance, MAX_VALUE, `読んでいないのに近づいた（${label}）`);
    assert.equal(x.ev.readLeft, 0, `readLeft（${label}）`);
    assert.deepEqual(x.cues, [], `cue（${label}）`);
    const gain = x.day.trust - x.before.day.trust;
    assert.ok(near(gain, perTick), `信頼の増え ${gain}（${label}、期待 ${perTick}）`);
  }
});

test('読んでいる間も、信頼の増えは calm 分（calmTrustPerSec×dt×trustRate）だけ', async () => {
  const R = await loadRead();
  const E = await loadEvents();
  const trustRate = 0.8;
  const s = turnPage(E, readStart(E.createEventState, { trustRate }, { distance: 80 }));
  const { log } = runTicks(E.eventTick, s, { maxSec: R.readSec });
  const perTick = RULES.calmTrustPerSec * DT * trustRate;
  for (const x of log) {
    const gain = x.day.trust - x.before.day.trust;
    assert.ok(near(gain, perTick), `読んでいる間の信頼の増え ${gain}（${x.t.toFixed(2)}秒、期待 ${perTick}）`);
  }
});

// ---------------------------------------------------------------- 3. その日に初めて読むのをやめたときだけ cue 'wonder'

test("その日に初めて読むのをやめた（readLeft が 0 になった）tick だけ cue 'wonder'・wondered true。めくり直しでは出ず、2回目に読むのをやめても出ない", async () => {
  const R = await loadRead();
  const E = await loadEvents();
  assert.ok(R.readSec > 1, 'readSec が 1秒より長い（このテストの前提）');
  const start = readStart(E.createEventState, {}, { distance: MAX_VALUE });
  // 1回目：めくって、残り1秒になったらめくり直し（ここでは出ない）、そのまま読み終える
  let cur = turnPage(E, start);
  const a = runTicks(E.eventTick, cur, { until: (r) => r.ev.readLeft <= 1 });
  assert.ok(a.reached, '残り1秒にならない（このテストの前提）');
  assert.deepEqual(a.log.flatMap((x) => x.cues), [], 'めくり直す前に cue が出た');
  cur = turnPage(E, a.last);
  const b = runTicks(E.eventTick, cur, { maxSec: R.readSec + 1 });
  const wonders = b.log.flatMap((x, i) => (x.cues.includes('wonder') ? [i] : []));
  const zeroIndex = b.log.findIndex((x) => x.ev.readLeft === 0);
  assert.ok(zeroIndex >= 0, 'readLeft が 0 にならない');
  assert.ok(b.log[zeroIndex].cat.distance > 0, '読むのをやめたとき距離 > 0（このテストの前提）');
  assert.deepEqual(wonders, [zeroIndex], 'wonder の cue は readLeft が 0 になった tick だけ');
  assert.deepEqual(b.log[zeroIndex].cues, ['wonder']);
  assert.equal(b.log[zeroIndex].ev.wondered, true);
  for (const x of b.log.slice(0, zeroIndex)) assert.equal(x.ev.wondered, false, `読むのをやめる前に wondered（${x.t.toFixed(2)}秒）`);

  // 2回目：もう一度めくって読み終えても、wonder は出ない
  const c = runTicks(E.eventTick, turnPage(E, b.last), { maxSec: R.readSec + 1 });
  assert.ok(c.log.some((x) => x.ev.readLeft === 0), '2回目も readLeft が 0 になる（このテストの前提）');
  assert.ok(c.last.cat.distance > 0, '2回目に読むのをやめたときも距離 > 0（このテストの前提）');
  assert.deepEqual(c.log.flatMap((x) => x.cues), [], '2回目に読むのをやめたときに cue が出た');
  assert.equal(c.last.ev.wondered, true);
});

// ---------------------------------------------------------------- 4. 距離0で peekBook、+doneTrust。peekBookSec 後に done

test('読み続けて距離0になった tick で peekBook（phaseT 0・猫 peekBook・cue peekBook だけ）、信頼 +(calm 分＋doneTrust)×trustRate。peekBookSec の間は peekBook・距離0・cue なし。信頼が足りなければ done・phase out・relax・距離0（cue なし）', async () => {
  const R = await loadRead();
  const E = await loadEvents();
  const trustRate = 0.5;
  const o = reachPeekBook(E, readStart(E.createEventState, { trust: 10, trustRate }));
  for (const x of o.log) assert.ok(x.cat.distance >= 0, `距離が 0 未満（${x.t.toFixed(2)}秒）: ${x.cat.distance}`);
  assert.ok(!o.log.some((x) => x.cues.includes('wonder')), '読み続けているのに wonder が出た（このテストの前提）');
  const enter = o.log[o.log.length - 1];
  assert.equal(enter.ev.phase, 'peekBook');
  assert.equal(enter.ev.phaseT, 0);
  assert.equal(enter.cat.distance, 0);
  assert.equal(enter.cat.mode, 'peekBook');
  assert.deepEqual(enter.cues, ['peekBook']);
  const expectedTrust = Math.min(MAX_VALUE, enter.before.day.trust + RULES.calmTrustPerSec * DT * trustRate + R.doneTrust * trustRate);
  assert.ok(near(enter.day.trust, expectedTrust), `peekBook に入った tick の信頼 ${enter.day.trust}（期待 ${expectedTrust}）`);
  assert.ok(enter.day.trust < MAX_VALUE, '信頼が足りない（このテストの前提）');

  const d = runTicks(E.eventTick, o.last, { until: (r) => r.ev.done });
  assert.ok(d.reached, 'done にならないまま上限に達した');
  const doneTick = d.log[d.log.length - 1];
  for (const x of d.log.slice(0, -1)) {
    const label = `${x.t.toFixed(2)}秒`;
    assert.equal(x.ev.phase, 'peekBook', `phase（${label}）`);
    assert.equal(x.cat.mode, 'peekBook', `猫の様子（${label}）`);
    assert.equal(x.cat.distance, 0, `距離（${label}）`);
    assert.deepEqual(x.cues, [], `cue（${label}）`);
  }
  assert.ok(near(doneTick.t, R.peekBookSec, TOL), `peekBook の長さ ${doneTick.t}（期待 ${R.peekBookSec}）`);
  assert.equal(doneTick.ev.done, true);
  assert.equal(doneTick.ev.phase, 'out');
  assert.equal(doneTick.cat.mode, 'relax');
  assert.equal(doneTick.cat.distance, 0);
  assert.deepEqual(doneTick.cues, [], 'done の tick の cue');
  assert.equal(E.eventProp(doneTick.ev).kind, 'book');
  assert.equal(E.eventProp(doneTick.ev).phase, 'done');
});

test('本をのぞき込んで peekBookSec たったとき、canLap で信頼が MAX_VALUE なら、そのまま膝（cat.mode lap）で done', async () => {
  const R = await loadRead();
  const E = await loadEvents();
  // 本をのぞき込んだごほうび（doneTrust）で、ちょうど MAX_VALUE に届く信頼から始める
  const start = readStart(E.createEventState, { trust: MAX_VALUE - R.doneTrust, canLap: true });
  const o = reachPeekBook(E, start);
  assert.equal(o.last.day.trust, MAX_VALUE, 'peekBook に入ったとき信頼が MAX_VALUE（このテストの前提）');
  const d = runTicks(E.eventTick, o.last, { until: (r) => r.ev.done });
  assert.ok(d.reached, 'done にならないまま上限に達した');
  const doneTick = d.log[d.log.length - 1];
  assert.equal(doneTick.ev.done, true);
  assert.equal(doneTick.ev.phase, 'out');
  assert.equal(doneTick.cat.mode, 'lap');
  assert.equal(doneTick.cat.distance, 0);
});

test('peekBook 中はめくれない（ev そのまま・feedback null・mistake false）。done のあとの eventAct は null（めくる・なでる・まばたき）', async () => {
  const R = await loadRead();
  const E = await loadEvents();
  const s = peekBookMiddle(E, R);
  const r = E.eventAct(PAGE, s.ev, s.cat, s.day, plain);
  assert.ok(r, 'peekBook：eventAct が null を返した');
  assert.deepEqual(r.ev, s.ev);
  assert.equal(r.feedback, null);
  assert.equal(r.mistake, false);
  assert.equal(r.day.trust, s.day.trust);
  assert.equal(r.day.wariness, s.day.wariness);

  const d = runTicks(E.eventTick, s, { until: (x) => x.ev.done });
  assert.ok(d.reached, 'done にならない（このテストの前提）');
  const last = d.last;
  assert.equal(E.eventAct(PAGE, last.ev, last.cat, last.day, plain), null, 'done のあとのめくる');
  assert.equal(E.eventAct(pet, last.ev, last.cat, last.day, plain), null, 'done のあとのなでる');
  assert.equal(E.eventAct(blink(1000), last.ev, last.cat, last.day, plain), null, 'done のあとのまばたき');
});

// ---------------------------------------------------------------- 5. phase 'read' でなでると逃げてミス（relax と同じ）

test("phase 'read' でなでる：applyAction を relax で呼んだのと同じ day・feedback・mistake・cat（flee・信頼 −mistakeTrust・mistakes+1・fleeDistance 離れる）。readLeft・pages は変えない", async () => {
  const R = await loadRead();
  const E = await loadEvents();
  // 信頼が mistakeTrust より多いところから始める（少ないと 0 で止まり、−mistakeTrust にならない）
  const s = readingMiddle(E, R, { trust: RULES.mistakeTrust + 10 });
  const expected = applyAction(pet, { ...s.cat, mode: 'relax' }, s.day, plain);
  const r = E.eventAct(pet, s.ev, s.cat, s.day, plain);
  assert.ok(r, 'eventAct が null を返した');
  assert.equal(r.feedback, 'flee');
  assert.equal(r.mistake, true);
  assert.equal(r.day.trust, s.day.trust - RULES.mistakeTrust);
  assert.equal(r.day.mistakes, s.day.mistakes + 1);
  assert.deepEqual(r.day, expected.day);
  assert.deepEqual(r.cat, expected.cat);
  assert.equal(r.cat.mode, 'flee');
  assert.equal(r.cat.distance, Math.min(MAX_VALUE, s.cat.distance + RULES.fleeDistance));
  assert.equal(r.ev.readLeft, s.ev.readLeft);
  assert.equal(r.ev.pages, s.ev.pages);
});

// ---------------------------------------------------------------- 6. まばたきは stare。peekBook・逃げている最中は何も起きない

test("phase 'read' でまばたき：applyAction を relax で呼んだのと同じ day・feedback（stare）・mistake・cat。警戒 +missWariness×warinessMul、信頼そのまま、readLeft・pages そのまま", async () => {
  const R = await loadRead();
  const E = await loadEvents();
  const s = readingMiddle(E, R);
  const expected = applyAction(blink(1000), { ...s.cat, mode: 'relax' }, s.day, plain);
  const r = E.eventAct(blink(1000), s.ev, s.cat, s.day, plain);
  assert.ok(r, 'eventAct が null を返した');
  assert.equal(r.feedback, 'stare');
  assert.equal(r.mistake, false);
  assert.deepEqual(r.day, expected.day);
  assert.deepEqual(r.cat, expected.cat);
  assert.equal(r.day.trust, s.day.trust);
  assert.equal(r.day.wariness, Math.min(MAX_VALUE, s.day.wariness + RULES.blink.missWariness * plain.warinessMul));
  assert.equal(r.ev.readLeft, s.ev.readLeft);
  assert.equal(r.ev.pages, s.ev.pages);
});

test('peekBook 中になでる・まばたき：何も起きない（feedback null・mistake false・信頼と警戒そのまま・ev そのまま）', async () => {
  const R = await loadRead();
  const E = await loadEvents();
  const s = peekBookMiddle(E, R);
  for (const [label, action] of [['なでる', pet], ['まばたき', blink(1000)], ['目が合っていたまばたき', { type: 'blink', holdMs: 1000, sawLook: true }]]) {
    const r = E.eventAct(action, s.ev, s.cat, s.day, plain);
    assert.ok(r, `${label}：eventAct が null を返した`);
    assert.equal(r.feedback, null, label);
    assert.equal(r.mistake, false, label);
    assert.equal(r.day.trust, s.day.trust, label);
    assert.equal(r.day.wariness, s.day.wariness, label);
    assert.equal(r.day.mistakes, s.day.mistakes, label);
    assert.deepEqual(r.ev, s.ev, label);
  }
});

test('読んでいる途中になでて逃げた直後に、もう一度なでても何も起きない：feedback null・ミスではない・信頼・警戒・mistakes そのまま', async () => {
  const R = await loadRead();
  const E = await loadEvents();
  const s = readingMiddle(E, R);
  const fled = E.eventAct(pet, s.ev, s.cat, s.day, plain);
  assert.equal(fled.cat.mode, 'flee', '1回目になでて逃げる（このテストの前提）');
  const f = E.eventAct(pet, fled.ev, fled.cat, fled.day, plain);
  assert.ok(f, '逃げている最中：eventAct が null を返した');
  assert.equal(f.feedback, null);
  assert.equal(f.mistake, false);
  assert.equal(f.day.trust, fled.day.trust);
  assert.equal(f.day.wariness, fled.day.wariness);
  assert.equal(f.day.mistakes, fled.day.mistakes);
  assert.equal(f.ev.readLeft, fled.ev.readLeft);
  assert.equal(f.ev.pages, fled.ev.pages);
});

// ---------------------------------------------------------------- 7. いつもの日・箱・鳥の日の 'page' は何も起きない

// 'page' で何も起きないこと。eventAct が null なら、いつもの applyAction でも何も起きないことを確かめる
function assertPageDoesNothing(E, s, label) {
  const r = E.eventAct(PAGE, s.ev, s.cat, s.day, plain);
  if (r === null) {
    const a = applyAction(PAGE, s.cat, s.day, plain);
    assert.equal(a.feedback, null, `${label}：applyAction の feedback`);
    assert.equal(a.mistake, false, `${label}：applyAction の mistake`);
    assert.deepEqual(a.cat, s.cat, `${label}：applyAction の cat`);
    assert.deepEqual(a.day, s.day, `${label}：applyAction の day`);
    return;
  }
  assert.equal(r.feedback, null, `${label}：feedback`);
  assert.equal(r.mistake, false, `${label}：mistake`);
  assert.deepEqual(r.ev, s.ev, `${label}：ev`);
  assert.deepEqual(r.cat, s.cat, `${label}：cat`);
  assert.deepEqual(r.day, s.day, `${label}：day`);
}

test("箱・鳥の日の eventAct({ type: 'page' }) は何も起きない（ev・cat・day そのまま、feedback null、mistake false）", async () => {
  const E = await loadEvents();
  const startOf = (id) => ({
    ev: E.createEventState(id),
    cat: makeCat({ mode: 'relax', distance: MAX_VALUE, modeTimeLeft: 3 }),
    day: makeDay({ trust: 10, wariness: 0, timeLeft: 1000 }),
  });
  const reachPhase = (id, phase) => {
    const o = runTicks(E.eventTick, startOf(id), { until: (r) => r.ev.phase === phase });
    assert.ok(o.reached, `${id}：phase '${phase}' にならない（このテストの前提）`);
    return o.last;
  };
  assertPageDoesNothing(E, startOf('box'), '箱の approach');
  assertPageDoesNothing(E, reachPhase('box', 'hide'), '箱の hide');
  assertPageDoesNothing(E, startOf('bird'), '鳥の approach');
  assertPageDoesNothing(E, reachPhase('bird', 'hunt'), '鳥の hunt');
});

test("いつもの日の applyAction({ type: 'page' }) は何も起きない（feedback null、mistake false、cat・day そのまま）", () => {
  for (const mode of ['relax', 'look', 'tailUp', 'rub']) {
    const cat = makeCat({ mode, distance: 20 });
    const day = makeDay();
    assert.ok(!day.actions.includes('page'), "いつもの日の actions に 'page' がない（このテストの前提）");
    const r = applyAction(PAGE, cat, day, plain);
    assert.equal(r.feedback, null, mode);
    assert.equal(r.mistake, false, mode);
    assert.deepEqual(r.cat, cat, mode);
    assert.deepEqual(r.day, day, mode);
  }
});

// ---------------------------------------------------------------- 8. 前の晩の段ボールのあとに始まる

const READ_DAY = 4;
const readEvents = () => Array.from({ length: MAX_DAY }, (_, i) => (i === READ_DAY - 1 ? 'read' : null));

test('読書の日・前の晩に段ボール：boxLockLeft > 0 の間は inBox のまま歩かず（phase read）、boxLockLeft が dt ずつ減る。0 になってからは、読んでいなければ近づかず、めくると readSpeed×dt 近づく', async () => {
  const R = await loadRead();
  const E = await loadEvents();
  const { createGame, startDay } = await import('../src/game/progression.js');
  const personality = PERSONALITIES.amaenbo;
  const game = { ...createGame({ personality: 'amaenbo', seed: 1, events: readEvents() }), day: READ_DAY, trust: 10, nightChoice: 'box' };
  const s = startDay(game);
  assert.equal(s.day.event, 'read', '4日目が読書の日（このテストの前提）');
  assert.equal(s.cat.mode, 'inBox', '前の晩に段ボールなら inBox で始まる（このテストの前提）');
  assert.equal(s.day.boxLockLeft, personality.boxLockSec, 'boxLockLeft は boxLockSec で始まる（このテストの前提）');
  const start = { ev: E.createEventState('read'), cat: s.cat, day: s.day };

  const lock = runTicks(E.eventTick, start, { personality, until: (r) => r.day.boxLockLeft === 0 });
  assert.ok(lock.reached, 'boxLockLeft が 0 にならないまま上限に達した');
  let prevLock = start.day.boxLockLeft;
  for (const r of lock.log) {
    const label = `${r.t.toFixed(2)}秒`;
    assert.equal(r.cat.mode, 'inBox', `boxLockLeft > 0 の間の猫の様子（${label}）`);
    assert.ok(!r.cat.walking, `boxLockLeft > 0 の間に歩いている（${label}）`);
    assert.equal(r.cat.distance, MAX_VALUE, `boxLockLeft > 0 の間の距離（${label}）`);
    assert.equal(r.ev.phase, 'read', `boxLockLeft > 0 の間の phase（${label}）`);
    assert.ok(near(r.day.boxLockLeft, Math.max(0, prevLock - DT), 1e-6), `boxLockLeft ${r.day.boxLockLeft}（${label}、前の tick ${prevLock}）`);
    prevLock = r.day.boxLockLeft;
  }
  assert.ok(near(lock.log[lock.log.length - 1].t, personality.boxLockSec, TOL), `boxLockLeft が 0 になった時刻 ${lock.log[lock.log.length - 1].t}`);

  // 0 になった次の tick：くつろぐが、読んでいないので近づかない
  const idle = runTicks(E.eventTick, lock.last, { personality, maxSec: DT });
  const i0 = idle.log[0];
  assert.equal(i0.cat.mode, 'relax', '段ボールから出たあとの猫の様子');
  assert.equal(i0.cat.walking, false, '読んでいないのに歩いている');
  assert.equal(i0.cat.distance, MAX_VALUE, '読んでいないのに近づいた');
  assert.equal(i0.ev.phase, 'read');

  // めくると、次の tick で readSpeed×dt 近づく
  const w = runTicks(E.eventTick, turnPage(E, idle.last, personality), { personality, maxSec: DT });
  const w0 = w.log[0];
  assert.equal(w0.cat.mode, 'relax');
  assert.equal(w0.cat.walking, true, 'めくったのに歩いていない');
  assert.ok(near(w0.cat.distance, MAX_VALUE - R.readSpeed * DT), `めくったあとの距離 ${w0.cat.distance}（期待 ${MAX_VALUE - R.readSpeed * DT}）`);
});

// ---------------------------------------------------------------- 11. 昼の画面（dayScene）

// 昼の画面を作り、トースト・止めるカード・onEnd・効果・音を記録する。session を渡すと、それを使う（同じプレイの続き）。
// hits.book・hits.cat を書き換えると、偽の renderer の hitTestBook・hitTestCat の答えが変わる
async function readDayScene({ personality = 'amaenbo', day = READ_DAY, events = readEvents(), trust = 0, seenCards = null, rng = fixedRng(0.5), session = null, book = true, cat = true } = {}) {
  const { createDayScene } = await import('../src/scenes/dayScene.js');
  const { createGame } = await import('../src/game/progression.js');
  const { CARDS } = await import('../src/data/texts.js');
  const noop = () => {};
  const toasts = [];
  const cards = [];
  const effects = [];
  const sounds = [];
  const hits = { book, cat };
  const overlay = {
    busy: false,
    splash: noop,
    card: (c) => cards.push(c),
    bubble: noop,
    toast: (text, ms) => toasts.push({ text, ms }),
    clear: noop,
  };
  const hud = { show: noop, update: noop };
  const renderer = {
    addEffect: (type, data) => effects.push(data === undefined ? { type } : { type, data }),
    hitTestCat: () => hits.cat,
    hitTestBook: () => hits.book,
  };
  const input = { setBlinkEnabled: noop, holdMs: () => 0 };
  const sound = {
    purr: () => sounds.push('purr'),
    meow: () => sounds.push('meow'),
    bump: () => sounds.push('bump'),
    page: () => sounds.push('page'),
  };
  const s = session ?? {
    game: { ...createGame({ personality, seed: 1 }), day, trust, catName: 'たま', events, seenCards: seenCards ?? Object.keys(CARDS) },
    misses: {},
  };
  const ends = [];
  const scene = createDayScene({ session: s, overlay, hud, renderer, input, sound, rng, onEnd: (r) => ends.push(r) });
  return { scene, session: s, toasts, cards, ends, effects, sounds, hits };
}

async function readText(key) {
  const { EVENT_TEXT, withName } = await import('../src/data/texts.js');
  assert.ok(EVENT_TEXT && EVENT_TEXT.read, 'texts.js に EVENT_TEXT.read がない');
  assert.equal(typeof EVENT_TEXT.read[key], 'string', `EVENT_TEXT.read.${key} がない`);
  return withName(EVENT_TEXT.read[key], 'たま');
}

// 本をタップしてめくり続け（1秒ごと）、done() が true になるまで進める
function playRead(scene, done, maxUpdates = 2000) {
  for (let i = 0; i < maxUpdates && !done(); i++) {
    if (i % 20 === 0 && scene.view().prop?.phase === 'read') scene.pet(BOOK.x, BOOK.y);
    scene.update(DT);
  }
}

test("文章：CARDS['event:read'] は pause: true・title 'イベント：読書中'。EVENT_TEXT.read に wonder・peekBook の文字列がある", async () => {
  const { CARDS } = await import('../src/data/texts.js');
  const card = CARDS['event:read'];
  assert.ok(card, "CARDS['event:read'] がない");
  assert.equal(card.pause, true, "CARDS['event:read'] は止めるカード（pause: true）");
  assert.equal(card.title, 'イベント：読書中');
  await readText('wonder');
  await readText('peekBook');
});

test('昼の画面：読書の日の始めに event:read の説明カード（pause）を1回だけ出す。同じプレイでもう一度読書の昼を始めても出さない', async () => {
  const { CARDS, withName } = await import('../src/data/texts.js');
  const card = CARDS['event:read'];
  assert.ok(card, "CARDS['event:read'] がない");
  assert.equal(typeof card.body, 'string', "CARDS['event:read'].body が文字列（このテストの前提）");
  const expected = { title: withName(card.title, 'たま'), body: withName(card.body, 'たま') };
  const first = await readDayScene({ seenCards: Object.keys(CARDS).filter((k) => k !== 'event:read') });
  for (let i = 0; i < 20; i++) first.scene.update(DT);
  assert.deepEqual(first.cards, [expected]);
  assert.ok(first.session.game.seenCards.includes('event:read'), 'seenCards に event:read が入っていない');
  const second = await readDayScene({ session: first.session });
  for (let i = 0; i < 20; i++) second.scene.update(DT);
  assert.deepEqual(second.cards, [], '2回目の読書の昼でもカードが出た');
});

test("昼の画面の view().prop：読書の日は kind 'book'（phase 'read'・pages 0 で始まる）", async () => {
  await loadRead();
  const { scene } = await readDayScene();
  scene.update(DT);
  const prop = scene.view().prop;
  assert.ok(prop, `読書の日の view().prop が ${prop}`);
  assert.equal(prop.kind, 'book');
  assert.equal(prop.phase, 'read');
  assert.equal(prop.pages, 0);
});

test('昼の画面：hitTestBook が true なら、hitTestCat も true でもなでずにページをめくる（pages+1・sound.page 1回・ミスにならない・逃げない）', async () => {
  await loadRead();
  const { FEEDBACK } = await import('../src/data/texts.js');
  const { scene, sounds, toasts } = await readDayScene({ book: true, cat: true });
  scene.update(DT);
  assert.equal(scene.view().prop?.phase, 'read', 'phase read（このテストの前提）');
  const before = scene.state();
  scene.pet(BOOK.x, BOOK.y);
  assert.equal(scene.view().prop.pages, 1, 'めくれていない');
  assert.deepEqual(sounds, ['page'], '鳴らした音');
  assert.equal(scene.state().day.mistakes, before.day.mistakes, 'ミスになった');
  assert.equal(scene.state().day.trust, before.day.trust, '信頼が変わった');
  assert.notEqual(scene.state().cat.mode, 'flee', '猫が逃げた');
  assert.ok(!toasts.some((t) => t.text === FEEDBACK.flee), '逃げたトーストが出た');
});

test('昼の画面：hitTestBook が false なら今までどおり。猫に当たればなでる（逃げてミス、めくらない、sound.page なし）、外れたら paw の効果（めくらない、ミスなし）', async () => {
  await loadRead();
  // 猫に当たる：phase read の猫（くつろぎ）をなでて逃げる
  const hit = await readDayScene({ book: false, cat: true });
  hit.scene.update(DT);
  const before = hit.scene.state();
  hit.scene.pet(BOOK.x, BOOK.y);
  assert.equal(hit.scene.state().day.mistakes, before.day.mistakes + 1, 'なでてミスにならない');
  assert.equal(hit.scene.state().cat.mode, 'flee', '猫が逃げない');
  assert.equal(hit.scene.view().prop.pages, 0, '本の外のタップでめくれた');
  assert.ok(!hit.sounds.includes('page'), `sound.page が呼ばれた: ${hit.sounds.join(',')}`);

  // どちらにも当たらない：足あとだけ
  const miss = await readDayScene({ book: false, cat: false });
  miss.scene.update(DT);
  const before2 = miss.scene.state();
  miss.scene.pet(BOOK.x, BOOK.y);
  assert.deepEqual(miss.effects, [{ type: 'paw', data: { x: BOOK.x, y: BOOK.y } }], '効果');
  assert.equal(miss.scene.state().day.mistakes, before2.day.mistakes, 'ミスになった');
  assert.equal(miss.scene.view().prop.pages, 0, '本の外のタップでめくれた');
  assert.deepEqual(miss.sounds, [], '鳴らした音');
});

test('昼の画面：読書以外の日（いつもの日・箱の日・鳥の日）は、hitTestBook が true を返しても、なでる・paw の動きが変わらない', async () => {
  const days = [
    ['いつもの日（3日目）', { day: 3, events: Array(MAX_DAY).fill(null) }],
    ['箱の日', { events: Array.from({ length: MAX_DAY }, (_, i) => (i === READ_DAY - 1 ? 'box' : null)) }],
    ['鳥の日', { events: Array.from({ length: MAX_DAY }, (_, i) => (i === READ_DAY - 1 ? 'bird' : null)) }],
  ];
  for (const [label, opts] of days) {
    for (const cat of [true, false]) {
      const runs = [];
      for (const book of [true, false]) {
        const r = await readDayScene({ ...opts, book, cat });
        r.scene.update(DT);
        r.scene.pet(BOOK.x, BOOK.y);
        runs.push(r);
      }
      const [withBook, without] = runs;
      const tag = `${label}・猫に${cat ? '当たる' : '外れる'}`;
      assert.deepEqual(withBook.scene.state(), without.scene.state(), `${tag}：猫と day`);
      assert.deepEqual(withBook.effects, without.effects, `${tag}：効果`);
      assert.deepEqual(withBook.toasts, without.toasts, `${tag}：トースト`);
      assert.deepEqual(withBook.sounds, without.sounds, `${tag}：音`);
      assert.ok(!withBook.sounds.includes('page'), `${tag}：sound.page が呼ばれた`);
      if (cat) {
        assert.equal(withBook.scene.state().day.mistakes, 1, `${tag}：くつろいでいる猫をなでてミスにならない`);
        assert.equal(withBook.scene.state().cat.mode, 'flee', `${tag}：猫が逃げない`);
      } else {
        assert.deepEqual(withBook.effects, [{ type: 'paw', data: { x: BOOK.x, y: BOOK.y } }], `${tag}：効果`);
        assert.equal(withBook.scene.state().day.mistakes, 0, `${tag}：ミスになった`);
      }
    }
  }
});

test("昼の画面：cue wonder・peekBook で EVENT_TEXT.read の該当トーストを1回ずつ出す（wonder は phase read のとき、peekBook は phase peekBook のとき）", async () => {
  await loadRead();
  const wonder = await readText('wonder');
  const peekBook = await readText('peekBook');
  const { scene, toasts } = await readDayScene();
  const seen = [];
  const record = (n) => {
    for (const t of toasts.slice(n)) if (t.text === wonder || t.text === peekBook) seen.push({ text: t.text, phase: scene.view().prop?.phase });
  };
  // 1回めくって、読むのをやめるまで待つ
  scene.update(DT);
  scene.pet(BOOK.x, BOOK.y);
  for (let i = 0; i < 400 && !toasts.some((t) => t.text === wonder); i++) {
    const n = toasts.length;
    scene.update(DT);
    record(n);
  }
  // そこから本をのぞき込むまで、めくり続ける
  for (let i = 0; i < 2000 && !toasts.some((t) => t.text === peekBook) && scene.state().day.timeLeft > 0; i++) {
    if (i % 20 === 0 && scene.view().prop?.phase === 'read') scene.pet(BOOK.x, BOOK.y);
    const n = toasts.length;
    scene.update(DT);
    record(n);
  }
  assert.ok(scene.state().day.timeLeft > 0, '本をのぞき込む前に時間切れになった（このテストの前提）');
  const list = toasts.map((t) => t.text).join(' / ');
  assert.deepEqual(seen, [{ text: wonder, phase: 'read' }, { text: peekBook, phase: 'peekBook' }], `トースト: ${list}`);
});

test('昼の画面：本をのぞき込んで peekBookSec たち、信頼が MAX_VALUE なら、そのまま膝（cat.mode lap）になり、いつもの膝の流れで onEnd が和解（lapped true）で1回', async () => {
  await loadRead();
  const { scene, ends } = await readDayScene();
  playRead(scene, () => scene.view().prop?.phase === 'peekBook');
  assert.equal(scene.view().prop?.phase, 'peekBook', '本をのぞき込まないまま進めた（このテストの前提）');
  assert.ok(scene.state().day.timeLeft > 0, '本をのぞき込む前に時間切れになった（このテストの前提）');
  scene.trustMax();
  let modeAtDone = null;
  for (let i = 0; i < 2000 && ends.length === 0; i++) {
    scene.update(DT);
    if (modeAtDone === null && scene.view().prop?.phase === 'done') modeAtDone = scene.state().cat.mode;
  }
  assert.equal(modeAtDone, 'lap', '本をのぞき込んで peekBookSec たったときの猫の様子');
  assert.equal(ends.length, 1, 'onEnd の呼ばれた回数');
  assert.equal(ends[0].lapped, true);
  for (let i = 0; i < 40; i++) scene.update(DT);
  assert.equal(ends.length, 1, 'onEnd が2回以上呼ばれた');
});

test('昼の画面：本をのぞき込んで peekBookSec たっても信頼が足りなければ、cat.mode relax・距離0でいつもの日に戻る（日は終わらない）', async () => {
  await loadRead();
  const { scene, ends } = await readDayScene({ trust: 0 });
  playRead(scene, () => scene.view().prop?.phase === 'done');
  assert.equal(scene.view().prop?.phase, 'done', 'done にならないまま進めた（このテストの前提）');
  assert.ok(scene.state().day.timeLeft > 0, 'done の前に時間切れになった（このテストの前提）');
  assert.ok(scene.state().day.trust < MAX_VALUE, '信頼が足りない（このテストの前提）');
  assert.equal(scene.state().cat.mode, 'relax');
  assert.equal(scene.state().cat.distance, 0);
  assert.deepEqual(ends, [], '信頼が足りないのに日が終わった');
});

// ---------------------------------------------------------------- 9. 時間切れで日が終わる

test('昼の画面：読書の日も、時間切れ（timeLeft 0）で日が終わり、onEnd が1回呼ばれる', async () => {
  await loadRead();
  const { scene, ends } = await readDayScene();
  const durationSec = DAYS[READ_DAY - 1].durationSec;
  for (let i = 0; i < Math.floor((durationSec - 1) / DT); i++) scene.update(DT);
  assert.deepEqual(ends, [], '時間切れの前に日が終わった');
  for (let i = 0; i < Math.ceil(5 / DT); i++) scene.update(DT);
  assert.equal(ends.length, 1, 'onEnd の呼ばれた回数');
  assert.equal(ends[0].lapped, false);
  assert.equal(scene.state().day.timeLeft, 0);
});

// ---------------------------------------------------------------- 11. 描画（本）

// 文字の描画（fillText）を、フレームごとに記録する偽の Canvas（tests/eventBird.test.js と同じ作り）
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

// 何フレームか描いてから、最後のフレームに描かれた文字と renderer を返す
function drawView(view) {
  const { canvas, frame } = textFrameCanvas();
  const r = createRenderer(canvas);
  for (let t = 1; t < 1.5; t += DT) r.draw(view, t, DT);
  frame.texts = [];
  r.draw(view, 1.5, DT);
  return { renderer: r, texts: frame.texts };
}

const bookView = (phase, cat, pages = 0) => ({ scene: 'day', wariness: 0, cat, prop: { kind: 'book', phase, phaseT: 0.5, pages } });

test("描画：hitTestBook(x, y) がある。prop { kind: 'book', phase: 'read' } を描いたあとは、本の真ん中あたり（180, 590）で true、画面の上のほう（180, 200）で false", () => {
  const { renderer } = drawView(bookView('read', { mode: 'relax', distance: 60 }));
  assert.equal(typeof renderer.hitTestBook, 'function', 'createRenderer の返り値に hitTestBook がない');
  assert.equal(renderer.hitTestBook(BOOK.x, BOOK.y), true, '本の真ん中あたり');
  assert.equal(renderer.hitTestBook(TOP.x, TOP.y), false, '画面の上のほう');
});

test("描画：prop が null・箱・鳥の日、本の phase 'peekBook'・'done' では、hitTestBook(180, 590) は false", async () => {
  const P = await import('../src/data/params.js');
  const views = [
    ['prop が null の昼', { scene: 'day', wariness: 0, cat: { mode: 'relax', distance: 60 }, prop: null }],
    ['箱の日（hide）', { scene: 'day', wariness: 0, cat: { mode: 'relax', distance: P.EVENTS.box.boxDistance }, prop: { kind: 'parcel', phase: 'hide', phaseT: 0.5 } }],
    ['鳥の日（hunt）', { scene: 'day', wariness: 0, cat: { mode: 'backTurn', distance: P.EVENTS.bird.birdDistance }, prop: { kind: 'bird', phase: 'hunt', phaseT: 0.5 } }],
    ["本の peekBook", bookView('peekBook', { mode: 'peekBook', distance: 0 }, 5)],
    ["本の done", bookView('done', { mode: 'relax', distance: 0 }, 5)],
  ];
  for (const [label, view] of views) {
    const { renderer } = drawView(view);
    assert.equal(typeof renderer.hitTestBook, 'function', 'createRenderer の返り値に hitTestBook がない');
    assert.equal(renderer.hitTestBook(BOOK.x, BOOK.y), false, label);
  }
});

test("描画：prop { kind: 'book', phase: 'read', pages: 3 } で「3ページ」を描く", () => {
  const { texts } = drawView(bookView('read', { mode: 'relax', distance: 60 }, 3));
  assert.ok(texts.includes('3ページ'), `「3ページ」がない: ${texts.join(' / ')}`);
});

test("描画：cat.mode 'peekBook' と、prop { kind: 'book' } のどの phase（read・peekBook・done）でも例外を出さない", () => {
  const cases = [
    ['read', { mode: 'relax', distance: 60, walking: true }],
    ['peekBook', { mode: 'peekBook', distance: 0 }],
    ['done', { mode: 'relax', distance: 0 }],
  ];
  for (const [phase, cat] of cases) {
    let texts = null;
    assert.doesNotThrow(() => {
      texts = drawView(bookView(phase, cat, 2)).texts;
    }, `phase ${phase} で例外`);
    assert.ok(Array.isArray(texts), `phase ${phase}：描画が最後まで進んでいない`);
  }
});

// ---------------------------------------------------------------- 11. 音（ページをめくる音）

// globalThis の値をテストの間だけ差し替え、終わったら元に戻す（tests/sound.test.js と同じ作り）
function withGlobals(values, fn) {
  const saved = Object.keys(values).map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
  for (const [k, v] of Object.entries(values)) {
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true, enumerable: true });
  }
  try {
    return fn();
  } finally {
    for (const [k, desc] of saved) {
      if (desc) Object.defineProperty(globalThis, k, desc);
      else delete globalThis[k];
    }
  }
}

// 効果音に足りるだけの、偽の AudioContext（tests/sound.test.js と同じ作り）
function fakeAudio() {
  const param = (value) => ({
    value,
    setValueAtTime() {},
    setTargetAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
  });
  const node = (kind, extra = {}) => ({
    kind,
    connect(to) {
      return to;
    },
    disconnect() {},
    ...extra,
  });
  class FakeAudioContext {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.sampleRate = 100;
      this.destination = node('destination');
    }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
    suspend() {
      this.state = 'suspended';
      return Promise.resolve();
    }
    close() {
      this.state = 'closed';
      return Promise.resolve();
    }
    createBuffer(channels, length) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { getChannelData: (ch) => data[ch] };
    }
    createBufferSource() {
      return node('bufferSource', { buffer: null, loop: false, playbackRate: param(1), start() {}, stop() {} });
    }
    createGain() {
      return node('gain', { gain: param(1) });
    }
    createBiquadFilter() {
      return node('filter', { type: 'lowpass', frequency: param(350), Q: param(1), gain: param(0) });
    }
    createOscillator() {
      return node('oscillator', { type: 'sine', frequency: param(440), detune: param(0), start() {}, stop() {} });
    }
    createDynamicsCompressor() {
      return node('compressor', { threshold: param(0), knee: param(0), ratio: param(1), attack: param(0), release: param(0) });
    }
  }
  return { FakeAudioContext };
}

test('音：createSound の返り値に page（関数）があり、効果音 ON で unlock したあとに呼んでも例外を出さない', () => {
  const { FakeAudioContext } = fakeAudio();
  withGlobals(
    {
      window: { AudioContext: FakeAudioContext },
      // 効果音の設定が保存されていない（ON）
      localStorage: { getItem: () => null, setItem() {} },
      navigator: {},
    },
    () => {
      const sound = createSound();
      assert.equal(typeof sound.page, 'function', 'createSound の返り値に page がない');
      sound.unlock();
      assert.doesNotThrow(() => sound.page());
    },
  );
});

// ---------------------------------------------------------------- 不具合の再現：本をのぞき込む猫（peekBook）がいつもの日に戻るとき、1フレームで位置が跳ばない（以前、膝の上の姿で描いていたころは、膝の上から床へ飛んでいた）

const FRAME = 1 / 60;

// view を sec 秒、60fps で描き、各フレームの shownPosition() を返す
function drawFrames(r, view, t0, sec) {
  const frames = [];
  const n = Math.round(sec / FRAME);
  for (let i = 0; i < n; i++) {
    r.draw(view, t0 + i * FRAME, FRAME);
    const p = r.shownPosition();
    frames.push({ x: p.x, y: p.y });
  }
  return frames;
}

const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('描画：本をのぞき込んでいる猫（peekBook・距離0）が relax・距離0 に変わっても、位置は跳ばない（どのフレームでも前のフレームから2px以内）', () => {
  const peekBookView = bookView('peekBook', { mode: 'peekBook', distance: 0 }, 5);
  const relaxView = bookView('done', { mode: 'relax', distance: 0 }, 5);
  const r = createRenderer(textFrameCanvas().canvas);
  const peekFrames = drawFrames(r, peekBookView, 1, 6);
  const last = peekFrames[peekFrames.length - 1];
  assert.ok(dist2(last, peekFrames[peekFrames.length - 2]) < 0.01, `のぞき込んでいる位置が落ち着いている（このテストの前提）: ${JSON.stringify(peekFrames.slice(-2))}`);

  const t0 = 1 + peekFrames.length * FRAME;
  const offFrames = drawFrames(r, relaxView, t0, 1.5);
  const frames = [last, ...offFrames];
  for (let i = 1; i < frames.length; i++) {
    const d = dist2(frames[i], frames[i - 1]);
    assert.ok(d <= 2, `relax に変えて ${i} フレーム目に ${d.toFixed(1)}px 動いた（${JSON.stringify(frames[i - 1])} → ${JSON.stringify(frames[i])}）`);
  }
});

// ---------------------------------------------------------------- 本をのぞき込む（peekBook）：膝の上には乗らず、膝の前の床の位置で描く。本は開いたまま

// view を最初から sec 秒描いて、落ち着いた位置（最後のフレーム）を返す。落ち着いていなければ落とす
function settledPosition(view, label, sec = 6) {
  const frames = drawFrames(createRenderer(textFrameCanvas().canvas), view, 1, sec);
  const p = frames[frames.length - 1];
  assert.ok(dist2(p, frames[frames.length - 2]) < 0.01, `${label}の位置が落ち着いている（このテストの前提）: ${JSON.stringify(frames.slice(-2))}`);
  return p;
}

test('描画：cat { mode: peekBook, distance: 0 }・本の phase peekBook を何フレームか描くと、shownPosition() は relax・距離0 の床の位置と同じ（±1px）、膝の上の位置（lap）とは y が10以上離れている。shownCat().mode は lap でない', () => {
  const floor = settledPosition(bookView('done', { mode: 'relax', distance: 0 }, 5), '床（relax・距離0）');
  const seat = settledPosition(bookView('done', { mode: 'lap', distance: 0 }, 5), '膝の上（lap）');
  const r = createRenderer(textFrameCanvas().canvas);
  const frames = drawFrames(r, bookView('peekBook', { mode: 'peekBook', distance: 0 }, 5), 1, 6);
  const p = frames[frames.length - 1];
  assert.ok(Math.abs(p.x - floor.x) <= 1 && Math.abs(p.y - floor.y) <= 1, `のぞき込んでいる位置 ${JSON.stringify(p)}（床 ${JSON.stringify(floor)}）`);
  assert.ok(Math.abs(p.y - seat.y) >= 10, `のぞき込んでいる位置 ${JSON.stringify(p)} が膝の上 ${JSON.stringify(seat)} に近い`);
  assert.notEqual(r.shownCat().mode, 'lap', 'のぞき込んでいる猫を膝の姿で描いている');
});

test('描画：本の phase peekBook の間も「Nページ」を描く（開いた本のまま）。phase done では描かない（閉じた本）', () => {
  const peekBook = drawView(bookView('peekBook', { mode: 'peekBook', distance: 0 }, 5)).texts;
  assert.ok(peekBook.includes('5ページ'), `peekBook：「5ページ」がない: ${peekBook.join(' / ')}`);
  const done = drawView(bookView('done', { mode: 'relax', distance: 0 }, 5)).texts;
  assert.ok(!done.includes('5ページ'), `done：「5ページ」を描いている: ${done.join(' / ')}`);
});

test('描画：本をのぞき込んでいる猫（peekBook・距離0）が lap に変わったら（膝に乗った）、最初のフレームで膝の上へ飛ばず、LAP_JUMP_SEC（0.5秒）かけて膝の上の位置に着く。shownCat().mode は lap', () => {
  const seat = settledPosition(bookView('done', { mode: 'lap', distance: 0 }, 5), '膝の上（lap）');
  const r = createRenderer(textFrameCanvas().canvas);
  const peekFrames = drawFrames(r, bookView('peekBook', { mode: 'peekBook', distance: 0 }, 5), 1, 6);
  const from = peekFrames[peekFrames.length - 1];
  assert.ok(dist2(from, peekFrames[peekFrames.length - 2]) < 0.01, `のぞき込んでいる位置が落ち着いている（このテストの前提）: ${JSON.stringify(peekFrames.slice(-2))}`);
  const gap = dist2(from, seat);
  assert.ok(Math.abs(from.y - seat.y) >= 10, `のぞき込んでいる位置 ${JSON.stringify(from)} と膝の上 ${JSON.stringify(seat)} が離れている（このテストの前提）`);

  const t0 = 1 + peekFrames.length * FRAME;
  const lapFrames = drawFrames(r, bookView('done', { mode: 'lap', distance: 0 }, 5), t0, 1.5);
  const first = lapFrames[0];
  assert.ok(dist2(first, from) < gap / 2, `膝に乗った最初のフレームで ${dist2(first, from).toFixed(1)}px 動いた（${JSON.stringify(from)} → ${JSON.stringify(first)}、膝の上 ${JSON.stringify(seat)}）`);
  const at = (sec) => lapFrames[Math.round(sec / FRAME) - 1];
  // 0.5秒（LAP_JUMP_SEC）より前は、まだ膝の上に着いていない
  assert.ok(Math.abs(at(0.25).y - seat.y) > 1, `0.25秒後にもう膝の上に着いている: ${JSON.stringify(at(0.25))}`);
  // 0.5秒以上たてば膝の上の位置
  const end = at(1.5);
  assert.ok(Math.abs(end.y - seat.y) <= 1, `1.5秒後の y ${end.y}（膝の上 ${seat.y}）`);
  assert.ok(Math.abs(end.x - seat.x) <= 2, `1.5秒後の x ${end.x}（膝の上 ${seat.x}）`);
  assert.equal(r.shownCat().mode, 'lap');
});

test('文章：EVENT_TEXT.read.peekBook に「のぞき込」が入っている（膝に乗るのではなく、本をのぞき込む）', async () => {
  const peekBook = await readText('peekBook');
  assert.ok(peekBook.includes('のぞき込'), `EVENT_TEXT.read.peekBook: ${peekBook}`);
});

// ---------------------------------------------------------------- 不具合の再現：逃げている間・段ボールの中では readLeft が減らない

test('イベントの進行（不具合の再現）：読んでいる途中になでて逃がしても、逃げている間も readLeft は dt ずつ減る。fleeSec 後に readSec − fleeSec（±1 tick）', async () => {
  const R = await loadRead();
  const E = await loadEvents();
  assert.ok(R.readSec > RULES.fleeSec, 'readSec が fleeSec より長い（このテストの前提）');
  const s = turnPage(E, readStart(E.createEventState, {}, { distance: 60 }));
  assert.equal(s.ev.readLeft, R.readSec, 'めくった直後（このテストの前提）');
  const fled = E.eventAct(pet, s.ev, s.cat, s.day, plain);
  assert.equal(fled.cat.mode, 'flee', 'なでて逃げる（このテストの前提）');
  assert.equal(fled.ev.readLeft, R.readSec, 'なでても readLeft は変わらない（このテストの前提）');
  const { log, last } = runTicks(E.eventTick, { ev: fled.ev, cat: fled.cat, day: fled.day }, { maxSec: RULES.fleeSec });
  for (const x of log) {
    if (x.cat.mode !== 'flee') continue;
    assert.ok(near(x.ev.readLeft, Math.max(0, x.before.ev.readLeft - DT)), `逃げている間の readLeft ${x.ev.readLeft}（${x.t.toFixed(2)}秒、前の tick ${x.before.ev.readLeft}）`);
  }
  const expected = R.readSec - RULES.fleeSec;
  assert.ok(near(last.ev.readLeft, expected, TOL), `fleeSec 後の readLeft ${last.ev.readLeft}（期待 ${expected}）`);
});

test('イベントの進行（不具合の再現）：前の晩の段ボールの中（boxLockLeft > 0）でめくっても、readLeft は dt ずつ減り（0 未満にならない）、猫は inBox のまま歩かない', async () => {
  const R = await loadRead();
  const E = await loadEvents();
  const { createGame, startDay } = await import('../src/game/progression.js');
  const personality = PERSONALITIES.amaenbo;
  assert.ok(personality.boxLockSec > R.readSec, 'boxLockSec が readSec より長い（このテストの前提）');
  const game = { ...createGame({ personality: 'amaenbo', seed: 1, events: readEvents() }), day: READ_DAY, trust: 10, nightChoice: 'box' };
  const s = startDay(game);
  assert.equal(s.cat.mode, 'inBox', '前の晩に段ボールなら inBox で始まる（このテストの前提）');
  const start = turnPage(E, { ev: E.createEventState('read'), cat: s.cat, day: s.day }, personality);
  assert.equal(start.ev.readLeft, R.readSec, '段ボールの中でもめくれる（このテストの前提）');
  const { log } = runTicks(E.eventTick, start, { personality, until: (r) => r.day.boxLockLeft === 0 });
  let zeroAt = null;
  for (const x of log) {
    const label = `${x.t.toFixed(2)}秒`;
    assert.equal(x.cat.mode, 'inBox', `段ボールの中の猫の様子（${label}）`);
    assert.ok(!x.cat.walking, `段ボールの中で歩いている（${label}）`);
    assert.equal(x.cat.distance, MAX_VALUE, `段ボールの中で近づいた（${label}）`);
    assert.ok(x.ev.readLeft >= 0, `readLeft が 0 未満（${label}）: ${x.ev.readLeft}`);
    assert.ok(near(x.ev.readLeft, Math.max(0, x.before.ev.readLeft - DT)), `段ボールの中の readLeft ${x.ev.readLeft}（${label}、前の tick ${x.before.ev.readLeft}）`);
    if (zeroAt === null && x.ev.readLeft === 0) zeroAt = x.t;
  }
  assert.ok(zeroAt !== null, '段ボールの中で readLeft が 0 にならない');
  assert.ok(near(zeroAt, R.readSec, TOL), `readLeft が 0 になった時刻 ${zeroAt}（期待 ${R.readSec}）`);
});

// ---------------------------------------------------------------- 不具合の再現：本をのぞき込んでいる間に時間切れになると、onEnd の cat が peekBook のまま

test('昼の画面（不具合の再現）：本をのぞき込んでいる（peekBook）間に時間切れになったら、onEnd の cat は mode relax・distance 0、lapped false', async () => {
  const R = await loadRead();
  const { scene, ends } = await readDayScene({ trust: 0 });
  // 本のそば（1回めくって近づく距離の2倍以下）まで読ませる
  const nearBook = R.readSpeed * R.readSec * 2;
  playRead(scene, () => scene.state().cat.distance <= nearBook || scene.view().prop?.phase !== 'read');
  assert.equal(scene.view().prop?.phase, 'read', '本のそばまで来た時点でまだ read（このテストの前提）');
  // 読み終えて止まるまで待つ
  for (let i = 0; i < Math.ceil((R.readSec + 0.5) / DT); i++) scene.update(DT);
  const d = scene.state().cat.distance;
  assert.ok(d > 0 && scene.view().prop?.phase === 'read', `読み終えて距離 ${d} で止まっている（このテストの前提）`);
  // 残り時間が「歩く時間＋peekBookSec の半分」になるまで待ってから、めくり続けて本をのぞき込ませる
  const waitUntil = d / R.readSpeed + R.peekBookSec / 2;
  for (let i = 0; i < 2000 && scene.state().day.timeLeft > waitUntil; i++) scene.update(DT);
  assert.ok(scene.state().day.timeLeft > 0, '待っている間に時間切れになった（このテストの前提）');
  playRead(scene, () => scene.view().prop?.phase !== 'read' || ends.length > 0);
  assert.equal(scene.view().prop?.phase, 'peekBook', '本をのぞき込まない（このテストの前提）');
  const left = scene.state().day.timeLeft;
  assert.ok(left > 0 && left < R.peekBookSec, `本をのぞき込み始めたときの残り時間 ${left} が 0〜peekBookSec の間（このテストの前提）`);
  let phaseBeforeEnd = null;
  for (let i = 0; i < 2000 && ends.length === 0; i++) {
    phaseBeforeEnd = scene.view().prop?.phase;
    scene.update(DT);
  }
  assert.equal(ends.length, 1, 'onEnd の呼ばれた回数');
  assert.equal(phaseBeforeEnd, 'peekBook', '時間切れの直前に本をのぞき込んでいる（このテストの前提）');
  assert.equal(scene.state().day.timeLeft, 0, '時間切れで終わった（このテストの前提）');
  assert.equal(ends[0].lapped, false);
  assert.equal(ends[0].cat.mode, 'relax', `onEnd の cat.mode が ${ends[0].cat.mode}`);
  assert.equal(ends[0].cat.distance, 0);
});

// ---------------------------------------------------------------- 本をのぞき込んだあと膝に乗ったときも、いつもの膝と同じ演出

test('昼の画面：読書の日、本をのぞき込んだあと信頼100で膝に乗ったとき（イベントの tick で lap）も、hud.show(false)・input.setBlinkEnabled(false) が呼ばれ、LAP_TEXT のトーストが出る', async () => {
  await loadRead();
  const { createDayScene } = await import('../src/scenes/dayScene.js');
  const { createGame } = await import('../src/game/progression.js');
  const { CARDS, LAP_TEXT, withName } = await import('../src/data/texts.js');
  const noop = () => {};
  const toasts = [];
  const calls = [];
  const overlay = { busy: false, splash: noop, card: noop, bubble: noop, toast: (text, ms) => toasts.push({ text, ms }), clear: noop };
  const hud = { show: (v) => calls.push(['hud.show', v]), update: noop };
  const renderer = { addEffect: noop, hitTestCat: () => true, hitTestBook: () => true };
  const input = { setBlinkEnabled: (v) => calls.push(['input.setBlinkEnabled', v]), holdMs: () => 0 };
  const sound = { purr: noop, meow: noop, bump: noop, page: noop };
  const session = {
    game: { ...createGame({ personality: 'amaenbo', seed: 1 }), day: READ_DAY, trust: 0, catName: 'たま', events: readEvents(), seenCards: Object.keys(CARDS) },
    misses: {},
  };
  const ends = [];
  const scene = createDayScene({ session, overlay, hud, renderer, input, sound, rng: fixedRng(0.5), onEnd: (r) => ends.push(r) });

  playRead(scene, () => scene.view().prop?.phase === 'peekBook');
  assert.equal(scene.view().prop?.phase, 'peekBook', '本をのぞき込まないまま進めた（このテストの前提）');
  assert.ok(scene.state().day.timeLeft > 0, '本をのぞき込む前に時間切れになった（このテストの前提）');
  scene.trustMax();
  let lapCalls = null;
  let lapToasts = null;
  for (let i = 0; i < 2000 && lapCalls === null; i++) {
    const nc = calls.length;
    const nt = toasts.length;
    scene.update(DT);
    if (scene.state().cat.mode === 'lap') {
      lapCalls = calls.slice(nc);
      lapToasts = toasts.slice(nt).map((t) => t.text);
    }
  }
  assert.ok(lapCalls, '膝に乗らないまま進めた（このテストの前提）');
  assert.equal(scene.view().prop?.phase, 'done', '本をのぞき込んだあと膝に乗った（このテストの前提）');
  assert.deepEqual(ends, [], '膝に乗った瞬間に日が終わった（このテストの前提）');
  assert.ok(lapCalls.some(([name, v]) => name === 'hud.show' && v === false), `膝に乗った update で hud.show(false) が呼ばれていない: ${JSON.stringify(lapCalls)}`);
  assert.ok(lapCalls.some(([name, v]) => name === 'input.setBlinkEnabled' && v === false), `膝に乗った update で input.setBlinkEnabled(false) が呼ばれていない: ${JSON.stringify(lapCalls)}`);
  assert.ok(lapToasts.includes(withName(LAP_TEXT, 'たま')), `膝に乗った update のトースト: ${lapToasts.join(' / ')}`);
});

// ---------------------------------------------------------------- 膝に乗る信頼（day.lapTrust）。本をのぞき込むのをやめるときも、その日の lapTrust で膝に乗るかを決める

// 膝の前（距離0）から始めて、最初の tick で本をのぞき込ませ、peekBookSec たってのぞき込むのをやめる（done）tick まで進める。
// 警戒を高くして、落ち着きの分の信頼が入らないようにする（本をのぞき込んだごほうび doneTrust だけが入る）
function lapTrustPeekBook(E, trust) {
  assert.equal(typeof DAYS[2].lapTrust, 'number', '3日目の DAYS に lapTrust がない（このテストの前提）');
  const start = readStart(E.createEventState, { canLap: true, lapTrust: DAYS[2].lapTrust, trust, wariness: MAX_VALUE }, { distance: 0 });
  const o = runTicks(E.eventTick, start, { maxSec: DT });
  assert.equal(o.last.ev.phase, 'peekBook', '最初の tick で本をのぞき込んでいない（このテストの前提）');
  const d = runTicks(E.eventTick, o.last, { until: (r) => r.ev.done });
  assert.ok(d.reached, 'done にならないまま上限に達した（このテストの前提）');
  return d.log[d.log.length - 1];
}

test('本をのぞき込んで peekBookSec たったとき、canLap・day.lapTrust 85 で信頼 85 なら、そのまま膝（cat.mode lap）で done', async () => {
  const R = await loadRead();
  const E = await loadEvents();
  const L = DAYS[2].lapTrust;
  const doneTick = lapTrustPeekBook(E, L - R.doneTrust);
  assert.equal(doneTick.day.trust, L, 'done の tick の信頼が lapTrust ちょうど（このテストの前提）');
  assert.equal(doneTick.ev.done, true);
  assert.equal(doneTick.ev.phase, 'out');
  assert.equal(doneTick.cat.mode, 'lap');
  assert.equal(doneTick.cat.distance, 0);
});

test('本をのぞき込んで peekBookSec たったとき、day.lapTrust 85 で信頼が lapTrust 未満（84.9）なら、くつろぎ（relax）に戻って done', async () => {
  const R = await loadRead();
  const E = await loadEvents();
  const L = DAYS[2].lapTrust;
  const doneTick = lapTrustPeekBook(E, L - R.doneTrust - 0.1);
  assert.ok(Math.abs(doneTick.day.trust - (L - 0.1)) < 1e-9, `done の tick の信頼 ${doneTick.day.trust} が lapTrust − 0.1 でない（このテストの前提）`);
  assert.equal(doneTick.ev.done, true);
  assert.equal(doneTick.ev.phase, 'out');
  assert.equal(doneTick.cat.mode, 'relax');
  assert.equal(doneTick.cat.distance, 0);
});

// ---------------------------------------------------------------- 不具合の再現：本を連打していると、本が閉じたあとのタップが猫へのタッチになり、逃げてミスになる
// 猫が本をのぞき込んでいる間と、読書が終わって（done）から tapGuardSec の間は、開いた本の範囲（inBookArea）のタップを猫へのタッチにしない

// readDayScene と同じ作りで、偽の renderer に inBookArea を足したもの。hits.area を書き換えると inBookArea の答えが変わる
async function guardDayScene({ trust = 0, area = true, cat = true } = {}) {
  const { createDayScene } = await import('../src/scenes/dayScene.js');
  const { createGame } = await import('../src/game/progression.js');
  const { CARDS } = await import('../src/data/texts.js');
  const noop = () => {};
  const effects = [];
  const sounds = [];
  const hits = { area, cat };
  let scene = null;
  const overlay = { busy: false, splash: noop, card: noop, bubble: noop, toast: noop, clear: noop };
  const hud = { show: noop, update: noop };
  const renderer = {
    addEffect: (type, data) => effects.push(data === undefined ? { type } : { type, data }),
    hitTestCat: () => hits.cat,
    // 本の phase が read のときだけ、本に当たる（本物の hitTestBook と同じ）
    hitTestBook: () => scene.view().prop?.phase === 'read',
    inBookArea: () => hits.area,
  };
  const input = { setBlinkEnabled: noop, holdMs: () => 0 };
  const sound = { purr: () => sounds.push('purr'), meow: () => sounds.push('meow'), bump: () => sounds.push('bump'), page: () => sounds.push('page') };
  const session = {
    game: { ...createGame({ personality: 'amaenbo', seed: 1 }), day: READ_DAY, trust, catName: 'たま', events: readEvents(), seenCards: Object.keys(CARDS) },
    misses: {},
  };
  scene = createDayScene({ session, overlay, hud, renderer, input, sound, rng: fixedRng(0.5), onEnd: noop });
  return { scene, effects, sounds, hits };
}

async function loadTapGuardSec() {
  const R = await loadRead();
  assert.equal(typeof R.tapGuardSec, 'number', 'EVENTS.read.tapGuardSec がない');
  return R.tapGuardSec;
}

// 本をめくり続けて、読書が終わった（prop.phase 'done'）update の直後まで進める。信頼 0 なので、猫は膝の前でくつろいでいる
function reachReadDone(scene) {
  playRead(scene, () => scene.view().prop?.phase === 'done');
  assert.equal(scene.view().prop?.phase, 'done', 'done にならないまま進めた（このテストの前提）');
  assert.ok(scene.state().day.timeLeft > 0, 'done の前に時間切れになった（このテストの前提）');
  assert.equal(scene.state().cat.mode, 'relax', 'done のあとの猫がくつろぎでない（このテストの前提）');
}

// タップして、そのタップで出た効果と、前後の mistakes を返す
function tap(g, x = BOOK.x, y = BOOK.y) {
  const n = g.effects.length;
  const mistakesBefore = g.scene.state().day.mistakes;
  g.scene.pet(x, y);
  return { effects: g.effects.slice(n), mistakesBefore, mistakesAfter: g.scene.state().day.mistakes };
}

test('不具合の再現：読書の日、のぞき込みが終わって done になった直後（tapGuardSec 未満）に、inBookArea も hitTestCat も true の場所をタップしても、ミスにならず猫は逃げない。paw の効果だけ出る', async () => {
  await loadRead();
  const g = await guardDayScene({ area: true, cat: true });
  reachReadDone(g.scene);
  const t = tap(g);
  assert.equal(t.mistakesAfter, 0, 'ミスになった');
  assert.notEqual(g.scene.state().cat.mode, 'flee', '猫が逃げた');
  assert.deepEqual(t.effects, [{ type: 'paw', data: { x: BOOK.x, y: BOOK.y } }], 'タップの効果');
});

test('読書が done になってから tapGuardSec 以上たったタップは、今までどおりなでる（くつろいでいる猫は逃げてミス）', async () => {
  const guard = await loadTapGuardSec();
  const g = await guardDayScene({ area: true, cat: true });
  reachReadDone(g.scene);
  for (let i = 0; i < Math.ceil(guard / DT) + 1; i++) g.scene.update(DT);
  assert.equal(g.scene.state().cat.mode, 'relax', 'タップの前に猫がくつろぎでなくなった（このテストの前提）');
  const t = tap(g);
  assert.equal(t.mistakesAfter, t.mistakesBefore + 1, 'ミスにならない');
  assert.equal(g.scene.state().cat.mode, 'flee', '猫が逃げない');
  assert.ok(t.effects.some((e) => e.type === 'reach'), `タップの効果: ${JSON.stringify(t.effects)}`);
});

test('本をのぞき込んでいる（peekBook）間に inBookArea が true の場所をタップすると、paw の効果だけ出て、reach は出ず、ミスにならない', async () => {
  await loadRead();
  const g = await guardDayScene({ area: true, cat: true });
  playRead(g.scene, () => g.scene.view().prop?.phase === 'peekBook');
  assert.equal(g.scene.view().prop?.phase, 'peekBook', '本をのぞき込まないまま進めた（このテストの前提）');
  const t = tap(g);
  assert.deepEqual(t.effects, [{ type: 'paw', data: { x: BOOK.x, y: BOOK.y } }], 'タップの効果');
  assert.equal(t.mistakesAfter, t.mistakesBefore, 'ミスになった');
  assert.equal(g.scene.view().prop?.phase, 'peekBook', 'タップでのぞき込むのをやめた');
});

test('inBookArea が false の場所（猫に当たる）は、読書が done になった直後でも今までどおりなでる（くつろいでいる猫は逃げてミス）', async () => {
  await loadRead();
  const g = await guardDayScene({ area: false, cat: true });
  reachReadDone(g.scene);
  const t = tap(g);
  assert.equal(t.mistakesAfter, t.mistakesBefore + 1, 'ミスにならない');
  assert.equal(g.scene.state().cat.mode, 'flee', '猫が逃げない');
  assert.ok(t.effects.some((e) => e.type === 'reach'), `タップの効果: ${JSON.stringify(t.effects)}`);
  assert.ok(!t.effects.some((e) => e.type === 'paw'), `paw の効果が出た: ${JSON.stringify(t.effects)}`);
});

test('描画：inBookArea(x, y) は開いた本の範囲かどうかだけで決まる。prop がなくても（何も描かなくても）本の真ん中あたり（180, 590）で true、画面の上のほう（180, 200）で false', () => {
  const r = createRenderer(textFrameCanvas().canvas);
  assert.equal(typeof r.inBookArea, 'function', 'createRenderer の返り値に inBookArea がない');
  assert.equal(r.inBookArea(BOOK.x, BOOK.y), true, '本の真ん中あたり');
  assert.equal(r.inBookArea(TOP.x, TOP.y), false, '画面の上のほう');
});
