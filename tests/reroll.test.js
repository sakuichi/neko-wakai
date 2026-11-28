import { test } from 'node:test';
import assert from 'node:assert/strict';

// タイトル画面の「ちがう子にする」ボタン（猫を引き直す）のテスト。
// 対象のモジュールは、テストの中で読み込む（まだない関数があっても、ほかのテストは動くように）

// ---------------------------------------------------------------- 共通

// 毛色の一覧（6つ）と、その性格
async function loadParams() {
  const { COAT_PERSONALITY, FACES } = await import('../src/data/params.js');
  return { COAT_PERSONALITY, FACES, COAT_KEYS: Object.keys(COAT_PERSONALITY) };
}

async function loadReroll() {
  const mod = await import('../src/game/progression.js');
  assert.equal(typeof mod.rerollCat, 'function', 'progression.js に rerollCat がない');
  return mod;
}

// src/main.js がタイトルの onReroll で渡す形（デバッグで何も固定していないとき）
const NOT_FIXED = { personality: null, coat: null, face: {} };

// いつも同じ値を返す乱数。ただし1回の rerollCat で呼ばれすぎたら止める
// （同じ値が出続けても終わる作りであることを確かめるため。無限ループでテストが止まらないように）
function constantRandom(value, limit = 100) {
  let calls = 0;
  return () => {
    calls += 1;
    if (calls > limit) throw new Error(`random が ${limit} 回より多く呼ばれた（同じ値が続くと終わらない作り？）`);
    return value;
  };
}

// 試す random の値（0 から 1 未満まで、いろいろ）
const RANDOM_VALUES = [0, 0.01, 0.1, 0.17, 0.2, 0.25, 0.33, 0.4, 0.5, 0.6, 0.66, 0.75, 0.8, 0.83, 0.9, 0.99, 0.999999];

// ---------------------------------------------------------------- 1. rerollCat：いつも違う毛色になる（高）

test('rerollCat：6つのどの毛色から始めても、いろいろな random 値で、毎回いまと違う毛色になり、personality はその毛色の COAT_PERSONALITY', async () => {
  const { rerollCat, createGame } = await loadReroll();
  const { COAT_PERSONALITY, COAT_KEYS } = await loadParams();
  assert.equal(COAT_KEYS.length, 6, '毛色は6つ（このテストの前提）');
  for (const from of COAT_KEYS) {
    const game = createGame({ personality: COAT_PERSONALITY[from], coat: from, seed: 1 });
    for (const fixed of [NOT_FIXED, {}]) {
      for (const v of RANDOM_VALUES) {
        const g = rerollCat(game, fixed, constantRandom(v));
        const label = `${from} から（random ${v}・fixed ${JSON.stringify(fixed)}）`;
        assert.ok(COAT_KEYS.includes(g.coat), `${label}: 毛色 ${g.coat} が COAT_PERSONALITY にない`);
        assert.notEqual(g.coat, from, `${label}: 毛色が変わっていない`);
        assert.equal(g.personality, COAT_PERSONALITY[g.coat], `${label}: 毛色 ${g.coat} の性格でない`);
      }
    }
  }
});

// ---------------------------------------------------------------- 2. rerollCat：残り5色がまんべんなく出る（中）

test('rerollCat：まんべんなく使う乱数で、いまの毛色は出ず、残り5色がそれぞれおよそ1/5ずつ（±15%以内）出る', async () => {
  const { rerollCat, createGame } = await loadReroll();
  const { COAT_PERSONALITY, COAT_KEYS } = await loadParams();
  const { createRng } = await import('../src/util/rng.js');
  const N = 5000;
  COAT_KEYS.forEach((from, i) => {
    const game = createGame({ personality: COAT_PERSONALITY[from], coat: from, seed: 1 });
    const random = createRng(1000 + i);
    const counts = Object.fromEntries(COAT_KEYS.map((c) => [c, 0]));
    for (let n = 0; n < N; n++) counts[rerollCat(game, NOT_FIXED, random).coat] += 1;
    assert.equal(counts[from], 0, `${from} から: いまの毛色が ${counts[from]} 回出た`);
    const expected = N / 5;
    for (const c of COAT_KEYS.filter((k) => k !== from)) {
      assert.ok(
        counts[c] >= expected * 0.85 && counts[c] <= expected * 1.15,
        `${from} から: ${c} が ${counts[c]} 回（${N} 回中。およそ ${expected} 回のはず）: ${JSON.stringify(counts)}`,
      );
    }
  });
});

// ---------------------------------------------------------------- 3. rerollCat：変わるのは coat・personality・face だけ（高）

test('rerollCat：変わるのは coat・personality・face だけで、ほかのフィールドは同じ値。入力の game は書き換えられず、face は FACES の値', async () => {
  const { rerollCat, createGame } = await loadReroll();
  const { COAT_PERSONALITY, FACES } = await loadParams();
  const { createRng } = await import('../src/util/rng.js');
  const base = createGame({
    personality: 'tsundere',
    coat: 'shiro',
    seed: 12345,
    face: { shape: 'maru', ears: 'big' },
    events: [null, 'box', null, null, null, null, null],
  });
  const game = {
    ...base,
    day: 4,
    trust: 63,
    catName: 'ゆき',
    mistakes: 3,
    seenCards: ['day:intro', 'sign:look'],
    nightChoice: 'treat',
    dere: true,
    handsOk: true,
  };
  const before = structuredClone(game);
  const SAME = ['day', 'trust', 'seed', 'events', 'catName', 'mistakes', 'seenCards', 'nightChoice', 'dere', 'handsOk'];
  for (let seed = 1; seed <= 30; seed++) {
    const g = rerollCat(game, NOT_FIXED, createRng(seed));
    assert.notEqual(g, game, `seed ${seed}: 入力と同じオブジェクトを返した`);
    assert.deepEqual(game, before, `seed ${seed}: 入力の game が書き換えられた`);
    assert.deepEqual(Object.keys(g).sort(), Object.keys(game).sort(), `seed ${seed}: フィールドの種類が変わった`);
    for (const k of SAME) assert.deepEqual(g[k], game[k], `seed ${seed}: ${k} が変わった`);
    assert.notEqual(g.coat, 'shiro', `seed ${seed}: 毛色が変わっていない`);
    assert.equal(g.personality, COAT_PERSONALITY[g.coat], `seed ${seed}: 毛色 ${g.coat} の性格でない`);
    assert.deepEqual(Object.keys(g.face).sort(), ['ears', 'shape'], `seed ${seed}: face の形 ${JSON.stringify(g.face)}`);
    assert.ok(FACES.shapes.includes(g.face.shape), `seed ${seed}: face.shape ${g.face.shape} が FACES.shapes にない`);
    assert.ok(FACES.ears.includes(g.face.ears), `seed ${seed}: face.ears ${g.face.ears} が FACES.ears にない`);
  }
});

// ---------------------------------------------------------------- 9. rerollCat：デバッグで固定しているもの（低）

test('rerollCat：fixed.coat があるときは毛色はそのままで personality はその毛色の性格、fixed.face.shape があるときは face.shape がそのまま', async () => {
  const { rerollCat, createGame } = await loadReroll();
  const { COAT_PERSONALITY, FACES, COAT_KEYS } = await loadParams();
  for (const from of COAT_KEYS) {
    const game = createGame({ personality: COAT_PERSONALITY[from], coat: from, seed: 1 });
    for (const fixedCoat of COAT_KEYS) {
      for (const v of [0, 0.5, 0.99]) {
        const g = rerollCat(game, { personality: null, coat: fixedCoat, face: {} }, constantRandom(v));
        const label = `${from} から・毛色を ${fixedCoat} に固定（random ${v}）`;
        assert.equal(g.coat, fixedCoat, `${label}: 毛色`);
        assert.equal(g.personality, COAT_PERSONALITY[fixedCoat], `${label}: 性格`);
      }
    }
  }
  const game = createGame({ personality: 'amaenbo', coat: 'chatora', seed: 1, face: { shape: 'mochi', ears: 'normal' } });
  for (const v of RANDOM_VALUES) {
    const g = rerollCat(game, { personality: null, coat: null, face: { shape: 'hoppe' } }, constantRandom(v));
    assert.equal(g.face.shape, 'hoppe', `random ${v}: 固定した輪郭にならない`);
    assert.ok(FACES.ears.includes(g.face.ears), `random ${v}: face.ears ${g.face.ears} が FACES.ears にない`);
  }
});

// ---------------------------------------------------------------- タイトル画面（偽 DOM）

// 何を呼んでも何もしない、偽の Canvas の描画コンテキスト
function nullContext() {
  return new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      return () => {};
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
}

// 簡単なセレクタ（'.a'・'button'・'button.a'・'.a.b'、カンマ区切り）に合うか
function matches(node, selector) {
  return selector.split(',').map((s) => s.trim()).filter(Boolean).some((sel) => {
    const m = sel.match(/^([a-zA-Z][\w-]*)?((?:\.[\w-]+)*)$/);
    if (!m) return false;
    const [, tag, classPart] = m;
    if (tag && node.tagName !== tag.toUpperCase()) return false;
    const classes = String(node.className ?? '').split(/\s+/);
    return classPart.split('.').filter(Boolean).every((c) => classes.includes(c));
  });
}

// 子要素・クラス名・文字・イベントを持つ、最小の偽 DOM 要素（tests/story.test.js の fakeElement と同じ作りに、
// closest・querySelector・canvas の getContext を足したもの）。イベントは親へ伝わる（stopPropagation で止まる）
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
    style: { setProperty() {}, removeProperty() {} },
    dataset: {},
    width: 0,
    height: 0,
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
    getContext: () => nullContext(),
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
    // 自分から親へたどって、セレクタに合う最初の要素
    closest(selector) {
      for (let cur = node; cur; cur = cur.parent) if (matches(cur, selector)) return cur;
      return null;
    },
    // 子孫から探す。なければ（innerHTML で作ったはずの要素）どこにもつながっていない要素を返す
    querySelector(selector) {
      return findAll(node, (n) => n !== node && matches(n, selector))[0] ?? fakeElement('div');
    },
    querySelectorAll(selector) {
      return findAll(node, (n) => n !== node && matches(n, selector));
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
        detail: 1,
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

function findAll(node, pred, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (pred(node)) out.push(node);
  for (const c of node.children ?? []) findAll(c, pred, out);
  return out;
}
// 要素の文章（textContent と子の文字列）を、canvas を除いてつなげる
function textOf(node) {
  if (typeof node === 'string') return node;
  if (!node || node.tagName === 'CANVAS') return '';
  return [node.textContent ?? '', ...(node.children ?? []).map(textOf)].join('');
}
const byClass = (root, cls) => findAll(root, (n) => n !== root && String(n.className ?? '').split(/\s+/).includes(cls));

// タイトル画面を作り、呼ばれた回数と、画面の要素を返す。操作は run の中で行う（document を差し替えている間）
async function setupTitle(run) {
  const { createTitleScene } = await import('../src/scenes/titleScene.js');
  return withGlobals({ document: { createElement: (tag) => fakeElement(tag), createTextNode: (s) => String(s) } }, () => {
    const root = fakeElement('div');
    const screenEl = fakeElement('div');
    root.append(screenEl);
    const calls = { start: 0, notebook: 0, reroll: 0 };
    createTitleScene({
      screenEl,
      onStart: () => { calls.start += 1; },
      onNotebook: () => { calls.notebook += 1; },
      onReroll: () => { calls.reroll += 1; },
    });
    const one = (cls) => {
      const list = byClass(screenEl, cls);
      assert.equal(list.length, 1, `class ${cls} の要素が1つでない（${list.length}個）`);
      return list[0];
    };
    return run({ screenEl, calls, one });
  });
}

// ---------------------------------------------------------------- 4. ボタンがある（高）

test('タイトルに class title-reroll のボタンが1つあり、文言は TITLE.reroll（＝「ちがう子にする」）', async () => {
  const { TITLE } = await import('../src/data/texts.js');
  assert.equal(TITLE.reroll, 'ちがう子にする', 'TITLE.reroll が「ちがう子にする」でない');
  await setupTitle(({ screenEl, one }) => {
    const title = one('title-screen');
    const buttons = byClass(title, 'title-reroll');
    assert.equal(buttons.length, 1, `タイトルの中に class title-reroll の要素が1つでない（${buttons.length}個）`);
    assert.equal(byClass(screenEl, 'title-reroll').length, 1, '画面全体で class title-reroll の要素が1つでない');
    const button = buttons[0];
    assert.equal(button.tagName, 'BUTTON', 'ボタン（button 要素）でない');
    assert.equal(button.type, 'button', 'type が button でない');
    assert.equal(textOf(button).trim(), 'ちがう子にする', `ボタンの文字: ${textOf(button)}`);
  });
});

// ---------------------------------------------------------------- 5. 押すたびに引き直し、はじめない（高）

test('「ちがう子にする」を3回押すと onReroll が3回呼ばれ、そのボタンでの pointerdown では onStart が呼ばれず、画面も空にならない', async () => {
  await setupTitle(({ screenEl, calls, one }) => {
    const title = one('title-screen');
    for (let i = 1; i <= 3; i++) {
      const button = one('title-reroll');
      // 指で押すと pointerdown → click の順に届く
      button.fire('pointerdown');
      assert.equal(calls.start, 0, `${i}回目: ボタンの pointerdown で onStart が呼ばれた`);
      assert.equal(calls.reroll, i - 1, `${i}回目: click の前に onReroll が呼ばれた`);
      button.fire('click');
      assert.equal(calls.reroll, i, `${i}回目: click で onReroll が1回呼ばれない（${calls.reroll}回）`);
      assert.equal(calls.start, 0, `${i}回目: onStart が呼ばれた`);
      assert.deepEqual(screenEl.children, [title], `${i}回目: 画面からタイトルが消えた`);
      assert.equal(byClass(screenEl, 'title-reroll').length, 1, `${i}回目: ボタンが消えた`);
    }
    assert.equal(calls.reroll, 3);
    assert.equal(calls.start, 0);
    assert.equal(calls.notebook, 0, 'ねこ手帳が開いた');
  });
});

// ---------------------------------------------------------------- 6. 押したあとでも、ほかの場所ではじまる（高）

test('「ちがう子にする」を押したあとでも、タイトルのほかの場所での pointerdown で onStart が1回呼ばれる', async () => {
  await setupTitle(({ calls, one }) => {
    const button = one('title-reroll');
    button.fire('pointerdown');
    button.fire('click');
    assert.equal(calls.reroll, 1, '前提：onReroll が1回呼ばれている');
    assert.equal(calls.start, 0, '前提：まだはじまっていない');
    one('title-screen').fire('pointerdown');
    assert.equal(calls.start, 1, `ほかの場所の pointerdown で onStart が1回呼ばれない（${calls.start}回）`);
    assert.equal(calls.reroll, 1, 'はじめるときに onReroll が呼ばれた');
  });
});

// ---------------------------------------------------------------- 7. 結合：ゲーム全体で、押すと違う毛色の猫になる（高）

// 生成した game.js と同じもの（bundle()）を、偽の画面で起動する（tests/story.test.js の bootGame と同じ作り。
// ただし closest は親へたどってクラス名・タグ名で探す）。records は端末に保存済みのねこ手帳の記録
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
      tag, tagName: String(tag).toUpperCase(), className: '', textContent: '', value: '', hidden: false, children: [], parentElement: null, dataset: {},
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
      closest(selector) {
        for (let cur = node; cur; cur = cur.parentElement) if (matches(cur, selector)) return cur;
        return null;
      },
      fire(type) {
        let stopped = false;
        const e = { type, target: node, detail: 1, preventDefault: noop, stopPropagation() { stopped = true; }, stopImmediatePropagation() { stopped = true; } };
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
  const one = (cls) => {
    const list = byClass(screen, cls);
    assert.equal(list.length, 1, `class ${cls} の要素が1つでない（${list.length}個）`);
    return list[0];
  };
  return {
    has: (cls) => byClass(screen, cls).length > 0,
    one,
    press(cls, type) {
      one(cls).fire(type);
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

test('結合：名前付けの候補の毛色を A として、「もどる」でタイトルへ戻り「ちがう子にする」を押してからはじめると、名前の候補は A と違う毛色 B のものになる', async () => {
  const { emptyRecords } = await import('../src/game/records.js');
  const { NAME_TEXT } = await import('../src/data/texts.js');
  const g = await bootGame({ ...emptyRecords(), metCount: 1 });

  // 名前の候補（4つ）がすべて入っている毛色。ちょうど1つに決まる
  const coatOfNameChoices = (label) => {
    const picks = g.one('name-chips').children.map((b) => b.textContent);
    assert.equal(picks.length, 4, `${label}: 名前の候補が4つでない: ${picks.join('・')}`);
    const coats = Object.keys(NAME_TEXT.byCoat).filter((c) => picks.every((p) => NAME_TEXT.byCoat[c].includes(p)));
    assert.equal(coats.length, 1, `${label}: 候補 ${picks.join('・')} から毛色が1つに決まらない（${coats.join('・')}）`);
    return coats[0];
  };
  // タイトル → はじめる → イントロをスキップ → 名前付け
  const startToName = (label) => {
    assert.ok(g.has('title-screen'), `${label}: タイトルでない`);
    g.press('title-screen', 'pointerdown');
    assert.ok(g.has('story'), `${label}: タイトルの次がイントロでない`);
    g.advance(0.6);
    g.press('story-skip', 'pointerdown');
    g.advance(1);
    assert.ok(g.has('name-screen'), `${label}: 名前付けに進まない`);
  };

  startToName('1回目');
  const coatA = coatOfNameChoices('1回目');
  g.press('name-back', 'click');
  assert.ok(g.has('title-screen'), '「もどる」でタイトルに戻らない');

  // 指で押すと pointerdown → click の順に届く
  g.press('title-reroll', 'pointerdown');
  g.press('title-reroll', 'click');
  g.advance(0.2);
  assert.ok(g.has('title-screen'), '「ちがう子にする」を押したらタイトルから離れた');
  assert.ok(!g.has('story'), '「ちがう子にする」を押したらイントロが始まった');

  startToName('2回目');
  const coatB = coatOfNameChoices('2回目');
  assert.notEqual(coatB, coatA, `「ちがう子にする」を押したのに、名前の候補が同じ毛色（${coatA}）のもの`);
});

// ---------------------------------------------------------------- 8. 描画：タイトルのまま毛色が変わったら、消えてから現れる（中）

// 何も記録しない偽の Canvas（tests/renderer.test.js の recordingCanvas と同じ振る舞い）
function quietCanvas() {
  const state = { strokeStyle: '#000', fillStyle: '#000', lineWidth: 1 };
  const stack = [];
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'save') return () => stack.push({ ...state });
      if (key === 'restore') return () => Object.assign(state, stack.pop());
      return () => {};
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
  return { width: 360, height: 640, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 640 }) };
}

const FRAME = 1 / 60;
// フレーム境界のずれの許容（2フレーム分）
const EDGE = 2 * FRAME;

test('描画：タイトルのまま毛色を変えると、前の毛色のまま alpha が下がって 0 になり、そのあと新しい毛色で alpha が上がって 1 になる。毛色が変わらない間は alpha 1 のまま', async () => {
  const R = await import('../src/render/renderer.js');
  assert.equal(typeof R.CAT_FADE_SEC, 'number', 'CAT_FADE_SEC が export されていない');
  const fade = R.CAT_FADE_SEC;
  const r = R.createRenderer(quietCanvas());
  assert.equal(typeof r.shownCat, 'function', 'shownCat() がない');
  const OLD = 'chatora';
  const NEW = 'kuro';
  // src/main.js と同じく、毎フレーム毛色と顔を渡す（顔は変えない）
  const face = { shape: 'mochi', ears: 'normal' };
  let t = 1;
  const drawFor = (coat, sec) => {
    const frames = [];
    const n = Math.round(sec / FRAME);
    for (let i = 0; i < n; i++) {
      const e = i * FRAME;
      r.draw({ scene: 'title', personality: 'amaenbo', coat, face }, t + e, FRAME);
      const c = r.shownCat();
      frames.push({ e, alpha: c.alpha, coat: c.coat });
    }
    t += n * FRAME;
    return frames;
  };
  const fmt = (f) => `e=${f.e.toFixed(3)}`;

  // ページを開いてタイトル。毛色が変わらない間は不透明のまま
  const first = drawFor(OLD, 2);
  for (const f of first) {
    assert.equal(f.coat, OLD, `はじめ ${fmt(f)}: 毛色`);
    assert.equal(f.alpha, 1, `はじめ ${fmt(f)}: 毛色が変わらないのに alpha ${f.alpha}`);
  }

  // タイトルのまま毛色を変える
  const swap = drawFor(NEW, 2 * fade + 0.5);
  const k = swap.findIndex((f) => f.coat === NEW);
  assert.ok(k >= 0, '新しい毛色にならない');
  const out = swap.slice(0, k);
  const into = swap.slice(k);
  assert.ok(out.length > 0, `新しい毛色がいきなり出た（最初のフレームの alpha ${swap[0].alpha}）`);
  for (const f of out) assert.equal(f.coat, OLD, `${fmt(f)}: 消える間の毛色`);
  for (const f of into) assert.equal(f.coat, NEW, `${fmt(f)}: 新しい毛色が出たあとに ${f.coat} に戻った`);

  // 消える段階：いまの濃さ（1）から下がり、0 になってから新しい毛色に変わる
  assert.ok(out[0].alpha >= 0.9, `変えた直後の alpha ${out[0].alpha}`);
  for (let i = 1; i < out.length; i++) {
    assert.ok(out[i].alpha <= out[i - 1].alpha, `${fmt(out[i])}: 消える途中で alpha が上がった ${out[i - 1].alpha} → ${out[i].alpha}`);
  }
  assert.ok(out.some((f) => f.alpha > 0.05 && f.alpha < 0.95), `だんだん消えていない: ${out.map((f) => f.alpha.toFixed(2)).join(',')}`);
  assert.ok(out.at(-1).alpha <= 0.05, `消えきる前に新しい毛色になった（前の毛色の最後の alpha ${out.at(-1).alpha}）`);
  assert.ok(Math.abs(into[0].e - fade) <= EDGE, `新しい毛色が出たのが ${fmt(into[0])}（CAT_FADE_SEC ${fade} のあたりのはず）`);

  // 現れる段階：0 から上がって 1 になる
  assert.ok(into[0].alpha <= 0.05, `新しい毛色が alpha ${into[0].alpha} でいきなり出た`);
  for (let i = 1; i < into.length; i++) {
    assert.ok(into[i].alpha >= into[i - 1].alpha, `${fmt(into[i])}: 現れる途中で alpha が下がった ${into[i - 1].alpha} → ${into[i].alpha}`);
  }
  assert.ok(into.some((f) => f.alpha > 0.05 && f.alpha < 0.95), `だんだん現れていない: ${into.map((f) => f.alpha.toFixed(2)).join(',')}`);
  const done = into.filter((f) => f.e > 2 * fade + EDGE);
  assert.ok(done.length > 0);
  for (const f of done) assert.equal(f.alpha, 1, `${fmt(f)}: 現れ終わったら不透明`);

  // そのあと毛色が変わらない間は、不透明のまま
  const after = drawFor(NEW, 1);
  for (const f of after) {
    assert.equal(f.coat, NEW, `そのあと ${fmt(f)}: 毛色`);
    assert.equal(f.alpha, 1, `そのあと ${fmt(f)}: 毛色が変わらないのに alpha ${f.alpha}`);
  }
});

// ---------------------------------------------------------------- 描画：連打・「もう一度あそぶ」・顔だけ変わったとき

// makeSegments(CAT_FADE_SEC) が返す [{ view, sec }] を順に毎フレーム描き、各フレームの { e（はじめからの秒）, alpha, coat, shape } を返す
async function drawSegments(makeSegments) {
  const R = await import('../src/render/renderer.js');
  const segments = makeSegments(R.CAT_FADE_SEC);
  const r = R.createRenderer(quietCanvas());
  const frames = [];
  let t = 1;
  let e = 0;
  for (const { view, sec } of segments) {
    const n = Math.round(sec / FRAME);
    for (let i = 0; i < n; i++) {
      r.draw(view, t, FRAME);
      const c = r.shownCat();
      frames.push({ e, alpha: c.alpha, coat: c.coat, shape: c.face?.shape });
      t += FRAME;
      e += FRAME;
    }
  }
  return { frames, fade: R.CAT_FADE_SEC };
}

const titleView = (coat, face = { shape: 'mochi', ears: 'normal' }) => ({ scene: 'title', personality: 'amaenbo', coat, face });

// どのフレームでも alpha が跳ねない（1フレームで動けるのは FRAME / CAT_FADE_SEC まで）
function assertNoJump(frames, fade, label) {
  const step = FRAME / fade + 1e-6;
  for (let i = 1; i < frames.length; i++) {
    const d = Math.abs(frames[i].alpha - frames[i - 1].alpha);
    assert.ok(d <= step, `${label} e=${frames[i].e.toFixed(3)}: alpha が跳ねた ${frames[i - 1].alpha} → ${frames[i].alpha}`);
  }
}

// alpha がほぼ 0 になった回数（消えきった回数）
function dips(frames) {
  let n = 0;
  for (let i = 0; i < frames.length; i++) if (frames[i].alpha <= 0.05 && (i === 0 || frames[i - 1].alpha > 0.05)) n += 1;
  return n;
}

test('描画：消えている途中で続けて押しても、そのまま消え続け、消えきったら最後に押した毛色だけが現れる（途中の毛色は出ない）', async () => {
  const { frames, fade } = await drawSegments((fade) => [
    { view: titleView('chatora'), sec: 1 },
    { view: titleView('kuro'), sec: fade * 0.25 },
    { view: titleView('shiro'), sec: fade * 0.25 },
    { view: titleView('sabatora'), sec: 2 * fade + 1 },
  ]);
  assertNoJump(frames, fade, '連打（消える途中）');
  const pressed = frames.filter((f) => f.e >= 1 - EDGE / 2);
  assert.ok(!pressed.some((f) => f.coat === 'kuro' || f.coat === 'shiro'), '途中で押した毛色が見えた');
  const k = pressed.findIndex((f) => f.coat === 'sabatora');
  assert.ok(k > 0, '最後に押した毛色にならない');
  // 1回目に押してから CAT_FADE_SEC のころに消えきって入れ替わる（押し直しで消える時間が延びない）
  assert.ok(Math.abs(pressed[k].e - 1 - fade) <= EDGE, `入れ替わったのが e=${pressed[k].e.toFixed(3)}（1+${fade} のあたりのはず）`);
  for (let i = 1; i < k; i++) assert.ok(pressed[i].alpha <= pressed[i - 1].alpha, `消える途中で alpha が上がった e=${pressed[i].e.toFixed(3)}`);
  assert.equal(dips(frames), 1, '消えきったのが1回でない');
  assert.equal(frames.at(-1).coat, 'sabatora');
  assert.equal(frames.at(-1).alpha, 1, '最後は不透明');
});

test('描画：現れている途中で押すと、いまの濃さから消え始め（跳ねない）、そのあといちばん新しい毛色が現れる', async () => {
  const { frames, fade } = await drawSegments((fade) => [
    { view: titleView('chatora'), sec: 1 },
    // 消えきって、半分くらい現れたところで、もう一度押す
    { view: titleView('kuro'), sec: fade * 1.5 },
    { view: titleView('kijitora'), sec: 2 * fade + 1 },
  ]);
  assertNoJump(frames, fade, '連打（現れる途中）');
  const second = frames.findIndex((f) => f.e >= 1 + fade * 1.5 - EDGE / 2);
  const before = frames[second - 1];
  assert.equal(before.coat, 'kuro', '2回目に押す前は、1回目の毛色が現れている途中のはず（このテストの前提）');
  assert.ok(before.alpha > 0.2 && before.alpha < 0.8, `2回目に押す前の alpha ${before.alpha}（現れている途中のはず）`);
  const rest = frames.slice(second);
  const k = rest.findIndex((f) => f.coat === 'kijitora');
  assert.ok(k > 0, '新しい毛色がいきなり出たか、出ない');
  for (let i = 0; i < k; i++) assert.equal(rest[i].coat, 'kuro', '消える間は、現れかけていた毛色のまま');
  for (let i = 1; i < k; i++) assert.ok(rest[i].alpha <= rest[i - 1].alpha, '消える途中で alpha が上がった');
  assert.ok(rest[k].alpha <= 0.05, `新しい毛色が alpha ${rest[k].alpha} で出た`);
  assert.equal(dips(frames), 2, '消えきったのが2回でない');
  assert.equal(frames.at(-1).coat, 'kijitora');
  assert.equal(frames.at(-1).alpha, 1);
});

test('描画：「もう一度あそぶ」で別の毛色の子になってタイトルに戻るとき、入れ替わりは1回だけ（二重に消えない）', async () => {
  const { endingView } = await import('../src/scenes/storySlides.js');
  const face = { shape: 'mochi', ears: 'normal' };
  const ending = { scene: 'ending', endingId: 'visitor', personality: 'tsundere', coat: 'shiro', face, ...endingView('visitor', 0) };
  const { frames, fade } = await drawSegments((fade) => [
    { view: ending, sec: 1 },
    { view: titleView('chatora', face), sec: 2 * fade + 1 },
  ]);
  const title = frames.filter((f) => f.e >= 1 - EDGE / 2);
  assertNoJump(title, fade, '「もう一度あそぶ」');
  assert.equal(dips(title), 1, '消えきったのが1回でない');
  const k = title.findIndex((f) => f.coat === 'chatora');
  assert.ok(k > 0, '前の毛色のまま消えていない');
  assert.ok(Math.abs(title[k].e - 1 - fade) <= EDGE, `入れ替わったのが e=${title[k].e.toFixed(3)}（1+${fade} のあたりのはず）`);
  for (const f of title.slice(k)) assert.equal(f.coat, 'chatora');
  assert.equal(title.at(-1).alpha, 1);
});

test('描画：タイトルのまま顔の形だけが変わっても、前の顔のまま消えてから、新しい顔で現れる', async () => {
  const { frames, fade } = await drawSegments((fade) => [
    { view: titleView('kuro', { shape: 'mochi', ears: 'normal' }), sec: 1 },
    { view: titleView('kuro', { shape: 'maru', ears: 'big' }), sec: 2 * fade + 1 },
  ]);
  assertNoJump(frames, fade, '顔だけ');
  for (const f of frames.filter((x) => x.e < 1 - EDGE / 2)) assert.equal(f.alpha, 1, '変わる前は不透明');
  const pressed = frames.filter((f) => f.e >= 1 - EDGE / 2);
  const k = pressed.findIndex((f) => f.shape === 'maru');
  assert.ok(k > 0, '新しい顔がいきなり出たか、出ない');
  for (let i = 0; i < k; i++) assert.equal(pressed[i].shape, 'mochi', '消える間は前の顔のまま');
  assert.ok(pressed[k].alpha <= 0.05, `新しい顔が alpha ${pressed[k].alpha} で出た`);
  assert.equal(dips(frames), 1);
  assert.equal(frames.at(-1).alpha, 1);
});
