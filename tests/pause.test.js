import { test } from 'node:test';
import assert from 'node:assert/strict';

// pauseMenu.js・PAUSE_TEXT はまだないので、テストの中で読み込む
async function load() {
  const { createPauseMenu } = await import('../src/ui/pauseMenu.js');
  const { PAUSE_TEXT } = await import('../src/data/texts.js');
  assert.ok(PAUSE_TEXT, 'texts.js に PAUSE_TEXT がない');
  return { createPauseMenu, PAUSE_TEXT };
}

// ---------------------------------------------------------------- 偽 DOM

// 子要素・クラス名・文字・イベントを持つ、最小の偽 DOM 要素。
// textContent や innerHTML に代入すると、子要素はなくなる（本物の DOM と同じ）
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
    // テスト用：イベントを起こす
    fire(type) {
      const event = { type, target: node, currentTarget: node, preventDefault() {}, stopPropagation() {} };
      for (const l of [...listeners]) {
        if (l.type !== type) continue;
        if (l.once) listeners.splice(listeners.indexOf(l), 1);
        l.fn.call(node, event);
      }
      if (typeof node[`on${type}`] === 'function') node[`on${type}`](event);
    },
  };
  function adopt(nodes) {
    for (const n of nodes) if (n && typeof n === 'object') n.parent = node;
    return nodes;
  }
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
// 要素の中の文章（自分と子の textContent、子の文字列）を集める
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

// メニューを作り、呼ばれた回数と、ボタンを探す関数を返す。
// テストの間ずっと document を差し替えたままにするので、操作は run の中で行う
async function setup(run) {
  const { createPauseMenu, PAUSE_TEXT } = await load();
  const el = fakeElement('div');
  el.hidden = true;
  const calls = { resume: 0, quit: 0 };
  return withGlobals({ document: { createElement: (tag) => fakeElement(tag) } }, () => {
    const menu = createPauseMenu({ el, onResume: () => { calls.resume += 1; }, onQuit: () => { calls.quit += 1; } });
    const one = (cls) => {
      const list = byClass(el, cls);
      assert.equal(list.length, 1, `class ${cls} の要素が1つでない（${list.length}個）`);
      return list[0];
    };
    return run({ menu, el, calls, PAUSE_TEXT, one, count: (cls) => byClass(el, cls).length });
  });
}

// ---------------------------------------------------------------- テスト

test('一時停止の文章（PAUSE_TEXT）は、どれも空でない文字列', async () => {
  const { PAUSE_TEXT } = await import('../src/data/texts.js');
  assert.ok(PAUSE_TEXT, 'texts.js に PAUSE_TEXT がない');
  for (const key of ['title', 'resume', 'quit', 'confirm', 'confirmYes', 'confirmNo', 'button']) {
    assert.equal(typeof PAUSE_TEXT[key], 'string', `PAUSE_TEXT.${key}`);
    assert.ok(PAUSE_TEXT[key].length > 0, `PAUSE_TEXT.${key} が空`);
  }
});

test('一時停止メニューを開くと、見出しと「つづける」「タイトルにもどる」が見える', async () => {
  await setup(({ menu, el, PAUSE_TEXT, one }) => {
    assert.equal(menu.isOpen, false, '開く前');
    menu.open();
    assert.equal(menu.isOpen, true);
    assert.equal(el.hidden, false, 'メニューが見えていない');
    assert.ok(textsIn(el).some((t) => t.includes(PAUSE_TEXT.title)), `見出しがない: ${textsIn(el).join(' / ')}`);
    assert.equal(textOf(one('pause-resume')).trim(), PAUSE_TEXT.resume);
    assert.equal(textOf(one('pause-quit')).trim(), PAUSE_TEXT.quit);
  });
});

test('「つづける」を押すと、メニューを閉じて1回だけ再開する', async () => {
  await setup(({ menu, el, calls, one }) => {
    menu.open();
    one('pause-resume').fire('click');
    assert.equal(calls.resume, 1);
    assert.equal(calls.quit, 0);
    assert.equal(menu.isOpen, false);
    assert.equal(el.hidden, true);
    assert.equal(el.children.length, 0, '閉じたのに中身が残っている');
  });
});

test('「タイトルにもどる」は確認を挟み、「やめておく」で最初のメニューに戻り、確認してから1回だけやめる', async () => {
  await setup(({ menu, el, calls, PAUSE_TEXT, one, count }) => {
    menu.open();
    one('pause-quit').fire('click');
    // 確認に切り替わる。まだどちらも呼ばれない
    assert.deepEqual(calls, { resume: 0, quit: 0 });
    assert.equal(menu.isOpen, true);
    assert.equal(el.hidden, false);
    assert.ok(textsIn(el).some((t) => t.includes(PAUSE_TEXT.confirm)), `確認の文がない: ${textsIn(el).join(' / ')}`);
    assert.equal(textOf(one('pause-confirm')).trim(), PAUSE_TEXT.confirmYes);
    assert.equal(textOf(one('pause-cancel')).trim(), PAUSE_TEXT.confirmNo);
    assert.equal(count('pause-resume'), 0, '確認中に「つづける」が残っている');
    assert.equal(count('pause-quit'), 0, '確認中に最初の「タイトルにもどる」が残っている');

    // やめておく → 最初のメニュー
    one('pause-cancel').fire('click');
    assert.deepEqual(calls, { resume: 0, quit: 0 });
    assert.equal(menu.isOpen, true);
    assert.equal(count('pause-confirm'), 0);
    assert.equal(count('pause-cancel'), 0);
    assert.equal(textOf(one('pause-resume')).trim(), PAUSE_TEXT.resume);
    assert.equal(textOf(one('pause-quit')).trim(), PAUSE_TEXT.quit);

    // もう一度「タイトルにもどる」→ 確認して、やめる
    one('pause-quit').fire('click');
    one('pause-confirm').fire('click');
    assert.deepEqual(calls, { resume: 0, quit: 1 });
    assert.equal(menu.isOpen, false);
    assert.equal(el.hidden, true);
  });
});

test('2回開いてもメニューは1組だけで、閉じたあとに前のボタンを押しても何も起きない', async () => {
  await setup(({ menu, el, calls, count }) => {
    menu.open();
    menu.open();
    assert.equal(count('pause-resume'), 1, '「つづける」が重なっている');
    assert.equal(count('pause-quit'), 1, '「タイトルにもどる」が重なっている');
    const resume = byClass(el, 'pause-resume')[0];
    const quit = byClass(el, 'pause-quit')[0];
    // 確認画面のボタンも取っておく
    quit.fire('click');
    const confirm = byClass(el, 'pause-confirm')[0];
    const cancel = byClass(el, 'pause-cancel')[0];
    assert.ok(confirm && cancel, '確認のボタンがない');
    assert.deepEqual(calls, { resume: 0, quit: 0 });
    menu.close();
    assert.equal(menu.isOpen, false);
    assert.equal(el.hidden, true);
    for (const b of [resume, quit, confirm, cancel]) b.fire('click');
    assert.deepEqual(calls, { resume: 0, quit: 0 }, '閉じたあとのボタンが効いた');
  });
});

test('メニューを開いている間は、遊びの操作（whilePlaying で包んだ関数）を通さない', async () => {
  await setup(({ menu, one }) => {
    assert.equal(typeof menu.whilePlaying, 'function', 'whilePlaying がない');
    const got = [];
    const wrapped = menu.whilePlaying((...args) => got.push(args));
    wrapped(10, 20);
    assert.deepEqual(got, [[10, 20]], '閉じている間は引数どおり呼ぶ');
    menu.open();
    wrapped(30, 40);
    wrapped({ type: 'blink', holdMs: 900 });
    assert.deepEqual(got, [[10, 20]], '開いている間に呼ばれた');
    one('pause-resume').fire('click');
    wrapped({ type: 'blink', holdMs: 700 });
    assert.deepEqual(got, [[10, 20], [{ type: 'blink', holdMs: 700 }]], '閉じたあとは、また呼ぶ');
    menu.open();
    menu.close();
    wrapped(50, 60);
    assert.deepEqual(got.at(-1), [50, 60], 'close() で閉じたあとも、また呼ぶ');
  });
});
