import { test } from 'node:test';
import assert from 'node:assert/strict';

// 紙芝居（イントロ・エピローグ）のテスト。
// 対象のモジュールは、テストの中で読み込む

async function loadSlides() {
  const slides = await import('../src/scenes/storySlides.js');
  const { STORY } = await import('../src/data/params.js');
  const { STORY_TEXT, withName } = await import('../src/data/texts.js');
  assert.ok(STORY, 'params.js に STORY がない');
  assert.ok(STORY_TEXT, 'texts.js に STORY_TEXT がない');
  return { ...slides, STORY, STORY_TEXT, withName };
}

const NAME = 'たま';
const FROM = { x: 200, y: 420, s: 0.9 };
// 区間 (a, b) の中の時刻（端は避ける）
const inside = (a, b) => [0.1, 0.5, 0.9].map((k) => a + (b - a) * k);

// ---------------------------------------------------------------- イントロは毎回出す（ゲーム全体を動かす）

// 生成した game.js と同じもの（bundle()）を、偽の画面で起動する。records は端末に保存済みのねこ手帳の記録
async function bootGame(records) {
  const { bundle } = await import('../tools/build.js');
  const { RECORDS_KEY } = await import('../src/ui/recordStore.js');
  const noop = () => {};
  const ctx2d = new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : k === 'measureText' ? () => ({ width: 0 }) : k === 'getImageData' ? () => ({ data: [] }) : () => ctx2d),
  });
  const byId = {};
  function el(tag) {
    const listeners = [];
    const found = {};
    const node = {
      tag, className: '', textContent: '', value: '', hidden: false, children: [], parentElement: null, dataset: {},
      style: { setProperty: noop, removeProperty: noop },
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      width: 360, height: 640, clientWidth: 360, clientHeight: 640, offsetWidth: 100, scrollWidth: 100,
      getContext: () => ctx2d,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 640 }),
      setAttribute: noop, removeAttribute: noop, focus: noop, blur: noop, animate: () => ({ cancel: noop }), removeEventListener: (type, fn) => {
        const i = listeners.findIndex((l) => l.type === type && l.fn === fn);
        if (i >= 0) listeners.splice(i, 1);
      },
      addEventListener: (type, fn) => listeners.push({ type, fn }),
      append(...nodes) {
        for (const n of nodes) {
          if (typeof n === 'object') n.parentElement = node;
          node.children.push(n);
        }
      },
      replaceChildren(...nodes) {
        node.children = [];
        node.append(...nodes);
      },
      remove() {
        const up = node.parentElement;
        if (up) up.children = up.children.filter((c) => c !== node);
      },
      // innerHTML で作る要素は、聞かれたときに作る
      querySelector: (sel) => (found[sel] ??= el(sel)),
      querySelectorAll: () => [],
      closest: () => null,
      fire(type) {
        let stopped = false;
        const e = { type, target: node, preventDefault: noop, stopPropagation() { stopped = true; } };
        for (let cur = node; cur && !stopped; cur = cur.parentElement) cur.emit?.(e);
      },
      emit(e) {
        for (const l of [...listeners]) if (l.type === e.type) l.fn(e);
      },
    };
    return node;
  }
  const root = el('div');
  const get = (id) => {
    if (!byId[id]) root.append((byId[id] = el(id)));
    return byId[id];
  };
  const store = { [RECORDS_KEY]: JSON.stringify(records) };
  let queue = [];
  const win = { addEventListener: noop, devicePixelRatio: 1, innerWidth: 400 };
  const { default: vm } = await import('node:vm');
  vm.runInNewContext(bundle(), {
    window: win, console, URLSearchParams, performance: { now: () => 0 }, location: { search: '' }, navigator: {},
    document: { getElementById: get, createElement: el, addEventListener: noop, hidden: false, body: root },
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    Option: function Option(text, value) { return Object.assign(el('option'), { textContent: text, value }); },
    Path2D: function Path2D() { return ctx2d; },
    requestAnimationFrame: (fn) => queue.push(fn), setTimeout: noop, clearTimeout: noop,
  });
  let now = 0;
  const screen = get('screen');
  return {
    hidden: (id) => get(id).hidden,
    has: (cls) => byClass(screen, cls).length > 0,
    press(cls, type) {
      const list = byClass(screen, cls);
      assert.equal(list.length, 1, `class ${cls} の要素が1つでない（${list.length}個）`);
      list[0].fire(type);
    },
    // sec 秒、1フレーム 50ms で進める
    advance(sec) {
      for (let t = 0; t < sec; t += 0.05) {
        now += 50;
        const fns = queue;
        queue = [];
        for (const fn of fns) fn(now);
      }
    },
  };
}

for (const metCount of [0, 1, 5]) {
  test(`イントロは何回目でも出る（出会った数 ${metCount}）：タイトルの次がイントロで、スキップすると名前付けに進む`, async () => {
    const { emptyRecords, parseRecords } = await import('../src/game/records.js');
    const records = { ...emptyRecords(), metCount };
    assert.equal(parseRecords(JSON.stringify(records)).metCount, metCount, '記録が読み込めていない');
    const g = await bootGame(records);
    assert.ok(g.has('title-screen'), 'はじめはタイトル');
    g.press('title-screen', 'pointerdown');
    assert.ok(g.has('story'), 'タイトルの次がイントロでない');
    assert.ok(g.has('story-skip'), 'スキップボタンがない');
    g.advance(0.6);
    g.press('story-skip', 'pointerdown');
    g.advance(1);
    assert.ok(g.has('name-screen'), 'スキップしても名前付けに進まない');
  });
}

test('名前付けから「もどる」でタイトルに戻っても、もう一度はじめるとイントロが出る', async () => {
  const { emptyRecords } = await import('../src/game/records.js');
  const g = await bootGame({ ...emptyRecords(), metCount: 1 });
  g.press('title-screen', 'pointerdown');
  g.advance(0.6);
  g.press('story-skip', 'pointerdown');
  g.advance(1);
  g.press('name-back', 'click');
  assert.ok(g.has('title-screen'), 'タイトルに戻らない');
  assert.equal(g.hidden('bgm-btn'), true, 'タイトルで BGM の切り替えが出ている');
  g.press('title-screen', 'pointerdown');
  assert.ok(g.has('story'), '2回目にイントロが出ない');
});

// ---------------------------------------------------------------- エピローグ：通い猫2枚目の文

test('通い猫のエピローグ2枚目の文は、名前が入り、最後の信頼が70なら「もうすぐ」、69.9なら「まだ遠そう」で終わる', async () => {
  const { epilogueSlides, STORY, STORY_TEXT, withName } = await loadSlides();
  assert.equal(STORY.nearTrust, 70);
  const second = (trust) => epilogueSlides({ endingId: 'visitor', trust, name: NAME, from: FROM, dayTime: 0.9 })[1];

  const near = second(70);
  assert.equal(near.text, `${withName(STORY_TEXT.visitor[1], NAME)}\n${STORY_TEXT.near}`);
  assert.ok(near.text.includes(NAME), `名前が入っていない: ${near.text}`);
  assert.ok(!near.text.includes('{name}'), `{name} が残っている: ${near.text}`);

  const far = second(69.9);
  assert.equal(far.text, `${withName(STORY_TEXT.visitor[1], NAME)}\n${STORY_TEXT.far}`);
  assert.ok(far.text.includes(NAME), `名前が入っていない: ${far.text}`);
});

// ---------------------------------------------------------------- エピローグ：和解

test('和解のエピローグは2枚で、どちらも名前を入れた文、1枚目は膝の猫のまま夕方へ、2枚目は夜でタップ待ち', async () => {
  const { epilogueSlides, STORY, STORY_TEXT, withName } = await loadSlides();
  const D = STORY.dusk;
  for (const endingId of ['fate', 'patient', 'persistent']) {
    const startTime = 0.7;
    const slides = epilogueSlides({ endingId, trust: 100, name: NAME, from: FROM, dayTime: startTime });
    assert.equal(slides.length, 2, endingId);
    const [first, second] = slides;

    // 1枚目
    assert.equal(first.text, withName(STORY_TEXT.lap[0], NAME), `${endingId}: 1枚目の文`);
    assert.equal(first.sec, D.sec, `${endingId}: 1枚目の秒数`);
    assert.equal(first.waitTap, false, `${endingId}: 1枚目は自動で進む`);
    assert.equal(first.view(0).dayTime, startTime, `${endingId}: 1枚目のはじめは昼の最後の明るさ`);
    for (const t of [D.toEveningSec, D.toEveningSec + 0.3, D.sec]) {
      assert.equal(first.view(t).dayTime, 1, `${endingId}: ${t}秒で夕方になっている`);
    }
    let prev = -Infinity;
    for (let i = 0; i <= 20; i++) {
      const t = (D.toEveningSec * i) / 20;
      const v = first.view(t).dayTime;
      assert.ok(v >= prev, `${endingId}: ${t}秒で暗さが戻った（${prev} → ${v}）`);
      prev = v;
    }
    const mid = first.view(D.toEveningSec / 2).dayTime;
    assert.ok(mid > startTime && mid < 1, `${endingId}: 途中の明るさ ${mid}`);
    for (const t of [0, D.toEveningSec / 2, D.sec]) {
      const v = first.view(t);
      assert.equal(v.cat.mode, 'lap', `${endingId}: ${t}秒の猫`);
      assert.notEqual(v.night, true, `${endingId}: ${t}秒で夜になっている`);
    }

    // 2枚目
    assert.equal(second.text, withName(STORY_TEXT.lap[1], NAME), `${endingId}: 2枚目の文`);
    assert.ok(second.text.includes(NAME), `${endingId}: 名前が入っていない: ${second.text}`);
    assert.equal(second.waitTap, true, `${endingId}: 2枚目はタップ待ち`);
    for (const t of [0, 2, 30]) {
      const v = second.view(t);
      assert.equal(v.cat.mode, 'lap', `${endingId}: 2枚目 ${t}秒の猫`);
      assert.equal(v.night, true, `${endingId}: 2枚目 ${t}秒は夜`);
    }
  }
});

// ---------------------------------------------------------------- エピローグ：通い猫1枚目

test('通い猫のエピローグ1枚目は、昼の最後の位置から始まり、窓が開いて全開になる', async () => {
  const { epilogueSlides, STORY } = await loadSlides();
  const L = STORY.leave;
  const first = epilogueSlides({ endingId: 'visitor', trust: 50, name: NAME, from: FROM, dayTime: 0.9 })[0];
  const start = first.view(0);
  assert.equal(start.catAt.x, FROM.x);
  assert.equal(start.catAt.y, FROM.y);
  assert.equal(start.catAt.s, FROM.s);
  assert.equal(start.windowOpen, 0, 'はじめは窓が閉まっている');
  for (const t of [L.openSec, L.openSec + 0.5, L.sec]) {
    assert.equal(first.view(t).windowOpen, 1, `${t}秒で窓が開ききっている`);
  }
});

test('通い猫のエピローグ1枚目は、昼の最後の位置がなく（null）ても例外を出さず、猫の位置がある', async () => {
  const { epilogueSlides, STORY } = await loadSlides();
  const L = STORY.leave;
  const first = epilogueSlides({ endingId: 'visitor', trust: 50, name: NAME, from: null, dayTime: 0.9 })[0];
  for (const t of [0, L.openSec, L.openSec + L.walkSec / 2, L.sec]) {
    const { catAt } = first.view(t);
    assert.equal(typeof catAt, 'object', `${t}秒`);
    assert.notEqual(catAt, null, `${t}秒`);
    assert.ok(Number.isFinite(catAt.x) && Number.isFinite(catAt.y), `${t}秒: (${catAt.x}, ${catAt.y})`);
  }
});

test('通い猫のエピローグ1枚目：窓へ歩く間は後ろ姿（walkAway）、振り返る間は座って（sit）位置が動かない', async () => {
  const { epilogueSlides, STORY } = await loadSlides();
  const L = STORY.leave;
  const first = epilogueSlides({ endingId: 'visitor', trust: 50, name: NAME, from: FROM, dayTime: 0.9 })[0];
  const walkEnd = L.openSec + L.walkSec;
  for (const t of inside(L.openSec, walkEnd)) {
    assert.equal(first.view(t).cat.mode, 'walkAway', `${t}秒`);
  }
  const lookTimes = inside(walkEnd, walkEnd + L.lookBackSec);
  const at0 = first.view(lookTimes[0]).catAt;
  for (const t of lookTimes) {
    const v = first.view(t);
    assert.equal(v.cat.mode, 'sit', `${t}秒`);
    assert.equal(v.catAt.x, at0.x, `${t}秒の x`);
    assert.equal(v.catAt.y, at0.y, `${t}秒の y`);
  }
});

test('通い猫のエピローグ1枚目：出ていき終わったら猫は消え（alpha 0）、それまでは見えている', async () => {
  const { epilogueSlides, STORY } = await loadSlides();
  const L = STORY.leave;
  const first = epilogueSlides({ endingId: 'visitor', trust: 50, name: NAME, from: FROM, dayTime: 0.9 })[0];
  const goneAt = L.openSec + L.walkSec + L.lookBackSec + L.outSec;
  for (const t of [goneAt, goneAt + 0.1, L.sec]) {
    assert.equal(first.view(t).catAt.alpha, 0, `${t}秒で消えていない`);
  }
  for (let i = 0; i < 20; i++) {
    const t = (goneAt * i) / 20;
    const { alpha } = first.view(t).catAt;
    assert.ok(alpha === undefined || alpha > 0, `${t}秒で消えている（alpha ${alpha}）`);
  }
});

// ---------------------------------------------------------------- endingView

test('結果画面の背景：通い猫は朝の庭にいる猫、和解は夜', async () => {
  const { endingView } = await loadSlides();
  for (const t of [0, 5]) {
    const v = endingView('visitor', t);
    assert.equal(v.catAt.outside, true, `visitor ${t}秒：庭の猫`);
    assert.ok(v.dayTime <= 0.2, `visitor ${t}秒：朝でない（dayTime ${v.dayTime}）`);
    for (const id of ['fate', 'patient', 'persistent']) {
      assert.equal(endingView(id, t).night, true, `${id} ${t}秒：夜でない`);
    }
  }
});

// ---------------------------------------------------------------- storyScene（偽 DOM）

// 子要素・クラス名・文字・イベントを持つ、最小の偽 DOM 要素（tests/pause.test.js と同じ作り）。
// イベントは親へ伝わる（stopPropagation で止まる）
function fakeElement(tag = 'div') {
  const listeners = [];
  let text = '';
  const node = {
    tagName: String(tag).toUpperCase(),
    className: '',
    type: '',
    hidden: false,
    parent: null,
    children: [],
    attributes: {},
    style: {},
    dataset: {},
    classList: {
      add: (...c) => { node.className = [...new Set([...node.className.split(/\s+/).filter(Boolean), ...c])].join(' '); },
      remove: (...c) => { node.className = node.className.split(/\s+/).filter((x) => x && !c.includes(x)).join(' '); },
      toggle: (c, on) => {
        const has = node.className.split(/\s+/).includes(c);
        if (on ?? !has) node.classList.add(c);
        else node.classList.remove(c);
      },
      contains: (c) => node.className.split(/\s+/).includes(c),
    },
    setAttribute(k, v) { node.attributes[k] = String(v); },
    getAttribute(k) { return node.attributes[k] ?? null; },
    removeAttribute(k) { delete node.attributes[k]; },
    append(...nodes) { node.children.push(...adopt(nodes)); },
    appendChild(n) { node.append(n); return n; },
    prepend(...nodes) { node.children.unshift(...adopt(nodes)); },
    replaceChildren(...nodes) { node.children = adopt(nodes); },
    remove() {
      if (node.parent) node.parent.children = node.parent.children.filter((c) => c !== node);
      node.parent = null;
    },
    addEventListener(type, fn, opts) { listeners.push({ type, fn, once: typeof opts === 'object' && !!opts?.once }); },
    removeEventListener(type, fn) {
      const i = listeners.findIndex((l) => l.type === type && l.fn === fn);
      if (i >= 0) listeners.splice(i, 1);
    },
    focus() {},
    blur() {},
    // テスト用：イベントを起こす（親へ伝わる）
    fire(type) {
      let stopped = false;
      const event = {
        type,
        target: node,
        currentTarget: node,
        pointerId: 1,
        isPrimary: true,
        button: 0,
        clientX: 180,
        clientY: 320,
        preventDefault() {},
        stopPropagation() { stopped = true; },
        stopImmediatePropagation() { stopped = true; },
      };
      for (let cur = node; cur && !stopped; cur = cur.parent) cur.dispatch(event);
    },
    dispatch(event) {
      event.currentTarget = node;
      for (const l of [...listeners]) {
        if (l.type !== event.type) continue;
        if (l.once) listeners.splice(listeners.indexOf(l), 1);
        l.fn.call(node, event);
      }
      if (typeof node[`on${event.type}`] === 'function') node[`on${event.type}`](event);
    },
  };
  function adopt(nodes) {
    for (const n of nodes) {
      if (n && typeof n === 'object') {
        if (n.parent && n.parent !== node) n.parent.children = n.parent.children.filter((c) => c !== n);
        n.parent = node;
      }
    }
    return nodes;
  }
  Object.defineProperty(node, 'parentElement', { get: () => node.parent });
  Object.defineProperty(node, 'textContent', {
    get: () => text,
    set: (v) => { text = String(v ?? ''); node.children = []; },
  });
  Object.defineProperty(node, 'innerHTML', {
    get: () => '',
    set: () => { node.children = []; text = ''; },
  });
  return node;
}

// globalThis の値をテストの間だけ差し替え、終わったら元に戻す
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

// requestAnimationFrame / setTimeout の偽物。flush で、たまっている呼び出しを（あとから足されたものも）実行する
function fakeTimers() {
  const queue = [];
  let id = 0;
  let clock = 0;
  const add = (fn) => {
    id += 1;
    queue.push({ id, fn });
    return id;
  };
  const cancel = (i) => {
    const k = queue.findIndex((q) => q.id === i);
    if (k >= 0) queue.splice(k, 1);
  };
  return {
    globals: {
      requestAnimationFrame: (fn) => add(() => fn((clock += 100))),
      cancelAnimationFrame: cancel,
      setTimeout: (fn, ms, ...args) => add(() => fn(...args)),
      clearTimeout: cancel,
    },
    flush() {
      for (let n = 0; n < 50 && queue.length; n++) {
        for (const q of queue.splice(0)) q.fn();
      }
    },
  };
}

function findAll(node, pred, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (pred(node)) out.push(node);
  for (const c of node.children ?? []) findAll(c, pred, out);
  return out;
}
function textsIn(node, out = []) {
  if (typeof node === 'string') {
    out.push(node);
    return out;
  }
  if (!node || typeof node !== 'object') return out;
  if (node.textContent) out.push(node.textContent);
  for (const c of node.children ?? []) textsIn(c, out);
  return out;
}
const textOf = (node) => textsIn(node).join('');
const byClass = (root, cls) => findAll(root, (n) => n !== root && String(n.className ?? '').split(/\s+/).includes(cls));

// テスト用の枚。view(t) は、どの枚か（label）と経過秒（t）を返す
const slide = (label, sec, waitTap = false) => ({ text: `${label}の文`, sec, waitTap, view: (t) => ({ label, t }) });

const DT = 0.02;

// 物語の場面を作り、時間を進める・タップする関数を渡す。
// テストの間ずっと document・タイマーを差し替えたままにするので、操作は run の中で行う
async function setupStory({ slides, skip, name = 'intro' }, run) {
  const { createStoryScene } = await import('../src/scenes/storyScene.js');
  const { STORY } = await import('../src/data/params.js');
  assert.ok(STORY, 'params.js に STORY がない');
  const timers = fakeTimers();
  const doc = {
    createElement: (tag) => fakeElement(tag),
    createTextNode: (s) => String(s),
  };
  return withGlobals({ document: doc, ...timers.globals }, () => {
    const root = fakeElement('div');
    const screenEl = fakeElement('div');
    root.append(screenEl);
    const calls = { done: 0 };
    const opts = { screenEl, name, slides, onDone: () => { calls.done += 1; } };
    if (skip !== undefined) opts.skip = skip;
    const scene = createStoryScene(opts);
    let clock = 0;
    const one = (cls) => {
      const list = byClass(screenEl, cls);
      assert.equal(list.length, 1, `class ${cls} の要素が1つでない（${list.length}個）`);
      return list[0];
    };
    const h = {
      scene,
      screenEl,
      calls,
      STORY,
      one,
      count: (cls) => byClass(screenEl, cls).length,
      caption: () => textOf(one('story-caption')).trim(),
      tap: () => one('story').fire('pointerdown'),
      // いまから sec 秒、DT ずつ update する
      advance(sec) {
        const n = Math.round(sec / DT);
        for (let i = 0; i < n; i++) scene.update(DT);
        clock += n * DT;
      },
      // 場面を作ってからの合計が time 秒になるまで進める
      advanceTo(time) {
        if (time > clock) h.advance(time - clock);
      },
      flush: () => timers.flush(),
    };
    return run(h);
  });
}

test('物語の場面：自動で進む枚は、sec 未満では進まず、sec＋wipeSec たつと次の枚の文になり、経過秒は0から数え直す', async () => {
  await setupStory({ slides: [slide('A', 1), slide('B', 1, true)] }, (h) => {
    const W = h.STORY.wipeSec;
    assert.equal(h.caption(), 'Aの文', 'はじめは1枚目');
    assert.equal(h.scene.view().scene, 'intro');
    assert.equal(h.scene.view().label, 'A');

    h.advanceTo(1 - 0.06);
    assert.equal(h.caption(), 'Aの文', 'sec 未満で進んだ');
    assert.equal(h.scene.view().label, 'A');
    assert.ok(Math.abs(h.scene.view().t - (1 - 0.06)) < 0.03, `1枚目の経過秒 ${h.scene.view().t}`);

    h.advanceTo(1 + W - 0.06);
    assert.equal(h.caption(), 'Aの文', '覆っている間に次の枚になった');
    assert.equal(h.scene.view().label, 'A');

    h.advanceTo(1 + W + 0.06);
    assert.equal(h.caption(), 'Bの文', 'sec＋wipeSec たっても次の枚にならない');
    const v = h.scene.view();
    assert.equal(v.scene, 'intro');
    assert.equal(v.label, 'B');
    assert.ok(v.t >= 0 && v.t < 0.15, `2枚目の経過秒が0から数えられていない: ${v.t}`);
    assert.equal(h.calls.done, 0, 'まだ終わっていない');
  });
});

test('物語の場面：タップ待ちの枚は、60秒たっても自動では進まない', async () => {
  await setupStory({ slides: [slide('A', 1, true), slide('B', 1)] }, (h) => {
    h.advance(60);
    h.flush();
    assert.equal(h.caption(), 'Aの文');
    assert.equal(h.scene.view().label, 'A');
    assert.equal(h.calls.done, 0);
  });
});

test('物語の場面：枚が出てすぐ（tapIgnoreSec 未満）のタップは無視し、それより後のタップで wipeSec ののちに次の枚へ進む', async () => {
  await setupStory({ slides: [slide('A', 1, true), slide('B', 1, true), slide('C', 1, true)] }, (h) => {
    const { wipeSec: W, tapIgnoreSec: I } = h.STORY;

    // 1枚目：出てすぐのタップは無視
    h.advanceTo(0.1);
    h.tap();
    h.advance(W + 0.1);
    assert.equal(h.caption(), 'Aの文', '出てすぐのタップで進んだ');
    assert.equal(h.scene.view().label, 'A');

    // tapIgnoreSec を過ぎたタップで、wipeSec ののちに進む
    h.advanceTo(Math.max(I, 0.1 + W + 0.1) + 0.05);
    h.tap();
    h.advance(W - 0.06);
    assert.equal(h.caption(), 'Aの文', '覆う前に次の枚になった');
    h.advance(0.12);
    assert.equal(h.caption(), 'Bの文', 'タップしても次の枚にならない');
    assert.equal(h.scene.view().label, 'B');

    // 2枚目：出てすぐのタップは無視
    h.tap();
    h.advance(I + W + 0.1);
    assert.equal(h.caption(), 'Bの文', '2枚目が出てすぐのタップで進んだ');

    // 2枚目：時間がたってからのタップで進む
    h.tap();
    h.advance(W + 0.06);
    assert.equal(h.caption(), 'Cの文', '2枚目でタップしても次の枚にならない');
    assert.equal(h.calls.done, 0);
  });
});

test('物語の場面：最後の枚から自動で進んだら onDone を1回だけ呼び、そのあと update を続けても呼ばない', async () => {
  await setupStory({ slides: [slide('A', 1), slide('B', 1)] }, (h) => {
    const W = h.STORY.wipeSec;
    h.advanceTo(1 + W + 0.06);
    h.flush();
    assert.equal(h.caption(), 'Bの文');
    assert.equal(h.calls.done, 0, '2枚目に入っただけで終わった');

    h.advance(1 + W * 2 + 0.5);
    h.flush();
    assert.equal(h.calls.done, 1);

    h.advance(10);
    h.flush();
    h.advance(1);
    assert.equal(h.calls.done, 1, '終わったあとの update でもう一度呼んだ');
  });
});

test('物語の場面：最後のタップ待ちの枚を連打しても、onDone は1回だけ', async () => {
  await setupStory({ slides: [slide('A', 1, true)] }, (h) => {
    const { wipeSec: W, tapIgnoreSec: I } = h.STORY;
    h.advanceTo(I + 0.1);
    for (let i = 0; i < 10; i++) h.tap();
    h.advance(W * 3 + 0.5);
    h.flush();
    assert.equal(h.calls.done, 1);
    for (let i = 0; i < 5; i++) {
      h.tap();
      h.advance(0.1);
    }
    h.advance(2);
    h.flush();
    assert.equal(h.calls.done, 1, '終わったあとのタップ・update でもう一度呼んだ');
  });
});

test('物語の場面：スキップを押し、同時にタップやスキップを重ねても、onDone は1回だけ', async () => {
  await setupStory({ slides: [slide('A', 1, true), slide('B', 1, true)], skip: true }, (h) => {
    const { wipeSec: W, tapIgnoreSec: I } = h.STORY;
    h.advanceTo(I + 0.1);
    const skipBtn = h.one('story-skip');
    skipBtn.fire('pointerdown');
    h.tap();
    skipBtn.fire('pointerdown');
    h.tap();
    h.advance(W * 3 + 0.5);
    h.flush();
    assert.equal(h.calls.done, 1);
    // 終わったあとにもう一度押す・タップする・update する
    skipBtn.fire('pointerdown');
    h.tap();
    h.advance(5);
    h.flush();
    assert.equal(h.calls.done, 1, '終わったあとにもう一度呼んだ');
  });
});

test('物語の場面：skip が false（または指定なし）ならスキップボタンはなく、true なら1つある', async () => {
  for (const skip of [false, undefined]) {
    await setupStory({ slides: [slide('A', 1, true)], skip }, (h) => {
      assert.equal(h.count('story'), 1, `skip ${skip}: .story がない`);
      assert.equal(h.count('story-skip'), 0, `skip ${skip}: スキップボタンがある`);
    });
  }
  await setupStory({ slides: [slide('A', 1, true)], skip: true }, (h) => {
    assert.equal(h.count('story-skip'), 1, 'skip true: スキップボタンが1つでない');
  });
});

// ---------------------------------------------------------------- 窓の外の枝（偽 Canvas）

// 描画命令を記録する偽の Canvas（tests/renderer.test.js と同じ作り）。線（stroke）を、そのときの色と一緒に残す
function recordingCanvas() {
  const fills = [];
  const strokes = [];
  let path = [];
  const state = { strokeStyle: '#000', fillStyle: '#000', lineWidth: 1 };
  const stack = [];
  const pathOps = ['moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'ellipse', 'arc', 'arcTo', 'rect', 'closePath'];
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'beginPath') return () => { path = []; };
      if (pathOps.includes(key)) return (...args) => { path.push(`${key}(${args.map((v) => +v.toFixed(2)).join(',')})`); };
      if (key === 'save') return () => stack.push({ ...state });
      if (key === 'restore') return () => Object.assign(state, stack.pop());
      if (key === 'fill') return () => fills.push({ style: state.fillStyle, path: path.join(' ') });
      if (key === 'stroke') return () => strokes.push({ style: state.strokeStyle, lw: state.lineWidth, path: path.join(' ') });
      return () => {};
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
  const canvas = { width: 360, height: 640, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 640 }) };
  return { canvas, fills, strokes };
}

async function loadBranch() {
  const { BRANCH_COLOR } = await import('../src/render/props.js');
  assert.ok(BRANCH_COLOR, 'props.js に BRANCH_COLOR がない');
  assert.equal(typeof BRANCH_COLOR.day, 'string');
  assert.equal(typeof BRANCH_COLOR.night, 'string');
  assert.notEqual(BRANCH_COLOR.day, BRANCH_COLOR.night, '昼と夜の枝の色が同じ');
  return { BRANCH_COLOR };
}

function strokeStyles(view) {
  return import('../src/render/renderer.js').then(({ createRenderer }) => {
    const rec = recordingCanvas();
    createRenderer(rec.canvas).draw(view, 1, 0.016);
    return rec.strokes.map((s) => s.style);
  });
}

test('窓の外の枝は、鳥の日でなくても描く（1日目の昼の画面で、昼の枝の色の線がある）', async () => {
  const { BRANCH_COLOR } = await loadBranch();
  const styles = await strokeStyles({ scene: 'day', cat: { mode: 'relax', distance: 80 }, prop: null, dayTime: 0.3 });
  assert.ok(styles.includes(BRANCH_COLOR.day), `昼の枝の色（${BRANCH_COLOR.day}）の線がない`);
});

test('夜の画面でも窓の外の枝を描き、色は夜の枝の色（昼の色では描かない）', async () => {
  const { BRANCH_COLOR } = await loadBranch();
  const styles = await strokeStyles({ scene: 'night', cat: { mode: 'relax', distance: 60 } });
  assert.ok(styles.includes(BRANCH_COLOR.night), `夜の枝の色（${BRANCH_COLOR.night}）の線がない`);
  assert.ok(!styles.includes(BRANCH_COLOR.day), `夜なのに昼の枝の色（${BRANCH_COLOR.day}）の線がある`);
});

// レビューの指摘（デバッグで紙芝居を途中でやめると、覆いが画面に残る）の再現
test('物語の場面：途中で stop したら、画面全体の覆いを取り除き、そのあと onDone を呼ばない', async () => {
  await setupStory({ slides: [slide('A', 1), slide('B', 1, true)] }, (h) => {
    const root = h.screenEl.parentElement;
    const wipes = () => byClass(root, 'story-wipe').length;
    assert.equal(wipes(), 1, 'はじめは覆いが1つある');
    h.advance(1.1);
    h.scene.stop();
    h.flush();
    assert.equal(wipes(), 0, 'stop しても覆いが残っている');
    h.advance(5);
    h.tap();
    h.advance(1);
    h.flush();
    assert.equal(h.calls.done, 0, 'stop したあとに onDone を呼んだ');
  });
});

test('物語の場面：切り替えの途中でスキップしても、終わりまで進む（onDone は1回）', async () => {
  await setupStory({ slides: [slide('A', 0.5), slide('B', 1, true), slide('C', 1, true)], skip: true }, (h) => {
    const W = h.STORY.wipeSec;
    // 自動で次の枚へ切り替えている途中（覆っている最中）にスキップ
    h.advanceTo(0.5 + W / 2);
    h.one('story-skip').fire('pointerdown');
    h.advance(W * 4);
    h.flush();
    assert.equal(h.calls.done, 1, '切り替えの途中のスキップが効かない');
  });
});

// 検収の指摘（イントロのあと、庭に猫の影のようなだ円がずっと残る）の再現
test('猫が庭にいないときは、窓の外の芝生に影のようなだ円を描かない（イントロ2枚目・昼・夜）', async () => {
  const { introSlides } = await loadSlides();
  const { createRenderer } = await import('../src/render/renderer.js');
  const views = {
    'イントロ2枚目': { scene: 'intro', ...introSlides()[1].view(1) },
    昼: { scene: 'day', cat: { mode: 'relax', distance: 80 }, prop: null, dayTime: 0.3 },
    夜: { scene: 'night', cat: { mode: 'relax', distance: 60 } },
  };
  for (const [label, view] of Object.entries(views)) {
    const rec = recordingCanvas();
    createRenderer(rec.canvas).draw(view, 1, 0.016);
    // 窓の中の芝生（x 236 まで、y 270〜338）を中心とするだ円
    const onLawn = rec.fills.filter((f) => [...f.path.matchAll(/ellipse\((-?[\d.]+),(-?[\d.]+),/g)].some(([, x, y]) => +x <= 236 && +y >= 270 && +y <= 338));
    assert.deepEqual(onLawn, [], `${label}: 芝生にだ円がある`);
  }
});

// レビューの指摘（通い猫の結果画面から「もう一度」で、庭の猫が部屋の中へ跳んでから消える）の再現
test('通い猫の結果画面からタイトルに戻ると、庭の猫は庭の位置のまま消え、そのあとタイトルの位置に現れる', async () => {
  const { endingView } = await loadSlides();
  const { createRenderer, CAT_FADE_SEC } = await import('../src/render/renderer.js');
  const r = createRenderer(recordingCanvas().canvas);
  const ending = { scene: 'ending', endingId: 'visitor', ...endingView('visitor', 1) };
  for (let i = 0; i < 5; i++) r.draw(ending, 1 + i / 60, 1 / 60);
  const garden = { x: ending.catAt.x, y: ending.catAt.y, s: ending.catAt.s };
  assert.deepEqual(r.shownPosition(), garden, '結果画面では庭にいる');
  for (let i = 1; i / 60 < CAT_FADE_SEC - 0.05; i++) {
    r.draw({ scene: 'title' }, 1.1 + i / 60, 1 / 60);
    assert.deepEqual(r.shownPosition(), garden, `消えている途中（${i}フレーム目）で庭から動いた`);
  }
  for (let i = 0; i < 60; i++) r.draw({ scene: 'title' }, 1.6 + CAT_FADE_SEC + i / 60, 1 / 60);
  assert.notDeepEqual(r.shownPosition(), garden, 'タイトルの位置に移っていない');
});

// レビューの指摘（タイトルの右下をタップすると、指を離したときの click がスキップに届く）の再現
test('物語の場面：前の画面のタップから届いた click ではスキップせず、キーボードの click（detail 0）ではスキップする', async () => {
  await setupStory({ slides: [slide('A', 9), slide('B', 9, true)], skip: true }, (h) => {
    const click = (detail) => h.one('story-skip').dispatch({ type: 'click', detail });
    click(1);
    h.advance(1.5);
    h.flush();
    assert.equal(h.calls.done, 0, '指やマウスの click だけでスキップした');
    click(0);
    h.advance(1.5);
    h.flush();
    assert.equal(h.calls.done, 1, 'キーボードでスキップできない');
  });
});
