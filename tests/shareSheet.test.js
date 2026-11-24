import { test } from 'node:test';
import assert from 'node:assert/strict';

// シェアに画像を付ける（共有メニュー・画像のコピー）のテスト。
// 対象のモジュールは、テストの中で読み込む

async function loadData() {
  const { SHARE } = await import('../src/data/params.js');
  const { SHARE_TEXT } = await import('../src/data/texts.js');
  assert.ok(SHARE, 'params.js に SHARE がない');
  assert.ok(SHARE_TEXT, 'texts.js に SHARE_TEXT がない');
  return { SHARE, SHARE_TEXT };
}
const loadPanel = () => import('../src/ui/sharePanel.js');

const FILE_NAME = 'neko-wakai.png';
// ほかの文に出てこない名前（文や URL に入っていないことを確かめるため）
const NAME = 'ヴェルサイユ姫';
const CASES = [
  { endingId: 'fate', day: 3, coat: 'chatora', firstLine: '3日目でネコと和解した。' },
  { endingId: 'patient', day: 5, coat: 'kuro', firstLine: '5日目でネコと和解した。' },
  { endingId: 'persistent', day: 6, coat: 'kijitora', firstLine: '6日目でネコと和解した。' },
  { endingId: 'visitor', day: 7, coat: 'shiro', firstLine: '7日かけても、ネコと和解できなかった。' },
];

// ---------------------------------------------------------------- 偽 DOM（tests/share.test.js と同じ作り）

// 子要素・クラス名・文字・イベントを持つ、最小の偽 DOM 要素（tests/story.test.js と同じ作り）
function fakeElement(tag = 'div') {
  const listeners = [];
  let text = '';
  const node = {
    tagName: String(tag).toUpperCase(),
    className: '',
    type: '',
    src: '',
    alt: '',
    hidden: false,
    disabled: false,
    parent: null,
    children: [],
    attributes: {},
    style: {},
    dataset: {},
    classList: {
      add: (...c) => { node.className = [...new Set([...classes(node), ...c])].join(' '); },
      remove: (...c) => { node.className = classes(node).filter((x) => !c.includes(x)).join(' '); },
      toggle: (c, on) => {
        if (on ?? !classes(node).includes(c)) node.classList.add(c);
        else node.classList.remove(c);
      },
      contains: (c) => classes(node).includes(c),
    },
    setAttribute(k, v) { node.attributes[k] = String(v); },
    getAttribute(k) { return node.attributes[k] ?? null; },
    removeAttribute(k) { delete node.attributes[k]; },
    append(...nodes) { node.children.push(...adopt(nodes)); },
    appendChild(n) { node.append(n); return n; },
    prepend(...nodes) { node.children.unshift(...adopt(nodes)); },
    after(...nodes) {
      const up = node.parent;
      up.adopt(nodes);
      up.children.splice(up.children.indexOf(node) + 1, 0, ...nodes);
    },
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
        detail: 1,
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
    adopt,
  };
  function adopt(nodes) {
    for (const n of nodes) {
      if (n && typeof n === 'object') {
        if (n.parent) n.parent.children = n.parent.children.filter((c) => c !== n);
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
  return node;
}
const classes = (node) => String(node.className ?? '').split(/\s+/).filter(Boolean);

// globalThis の値をテストの間だけ差し替え、終わったら元に戻す（fn が Promise を返すときは、終わるまで待つ）
async function withGlobals(values, fn) {
  const saved = Object.keys(values).map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
  for (const [k, v] of Object.entries(values)) {
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true, enumerable: true });
  }
  try {
    return await fn();
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
const byClass = (root, cls) => findAll(root, (n) => n !== root && classes(n).includes(cls));
function one(root, cls) {
  const list = byClass(root, cls);
  assert.equal(list.length, 1, `class ${cls} の要素が1つでない（${list.length}個）`);
  return list[0];
}
function textsIn(node, out = []) {
  if (typeof node === 'string') {
    out.push(node);
    return out;
  }
  if (!node || typeof node !== 'object' || node.hidden) return out;
  if (node.textContent) out.push(node.textContent);
  for (const c of node.children ?? []) textsIn(c, out);
  return out;
}
const textOf = (node) => textsIn(node).join('');
const statusText = (root) => byClass(root, 'share-status').map(textOf).join('');
// ブラウザと同じく、disabled のボタンは押しても click が起きない
function press(root, cls) {
  const b = one(root, cls);
  if (!b.disabled) b.fire('click');
}
// Promise の続き（then・await）が終わるまで待つ
const settle = () => new Promise((r) => setImmediate(r));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // 誰も受け取らないうちに拒否しても、それだけではテストを落とさない（約束と違う動きとして失敗させる）
  promise.catch(() => {});
  return { promise, resolve, reject };
}

const fakeDocument = () => ({ createElement: (tag) => fakeElement(tag), createTextNode: (s) => String(s) });

// 待ち時間を、実際には待たずに進める（テストが終わると元に戻る）
function fakeTimers(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  return async (ms) => {
    t.mock.timers.tick(ms);
    await settle();
  };
}
// 共有・コピーの失敗のしかた
const named = (name) => Object.assign(new Error(name), { name });
const abort = () => Promise.reject(named('AbortError'));
const denied = () => Promise.reject(named('NotAllowedError'));
const thrown = () => { throw new TypeError('その場の例外'); };

// ---------------------------------------------------------------- シェア画面を開く道具

const POST = '投稿文の一行目。\n投稿文の二行目。\n#投稿文のタグ';
const X_URL = 'https://x.com/intent/post?text=test';
const IMAGE = 'data:image/png;base64,PANEL';
const SECOND = { image: 'data:image/png;base64,SECOND', post: '二回目の文', xUrl: 'https://x.com/intent/post?text=second' };

// 外に出る動き（呼んだ順に calls に残す）と、使えるかを調べるだけのもの（asked に残す）
const ACTIONS = ['openUrl', 'save', 'copy', 'share', 'copyImage'];
const QUERIES = ['device', 'canShare', 'canCopyImage'];

// impl にある関数だけを持つ actions を作る（share の text が undefined のときは、text がないものとして残す）
function recordActions(impl) {
  const calls = [];
  const asked = [];
  const actions = {};
  for (const name of [...ACTIONS, ...QUERIES]) {
    if (!impl[name]) continue;
    actions[name] = (...args) => {
      (QUERIES.includes(name) ? asked : calls).push([name, ...args.map(withoutUndefined)]);
      return impl[name](...args);
    };
  }
  return { actions, calls, asked };
}
function withoutUndefined(arg) {
  if (!arg || typeof arg !== 'object') return arg;
  return Object.fromEntries(Object.entries(arg).filter(([, v]) => v !== undefined));
}

// すべて使える端末。overrides に undefined を渡すと、その動きを持たない
const full = (device, overrides = {}) => ({
  openUrl: () => true,
  save: () => {},
  copy: () => Promise.resolve(),
  device: () => device,
  canShare: () => true,
  share: () => Promise.resolve(),
  canCopyImage: () => true,
  copyImage: () => Promise.resolve(),
  ...overrides,
});
const PHONES = ['ios', 'android'];
const DEVICES = ['ios', 'android', 'pc'];

const SHARE_X = ['share', { image: IMAGE, fileName: FILE_NAME, text: POST }];
const SHARE_SAVE = ['share', { image: IMAGE, fileName: FILE_NAME }];
const OPEN_X = ['openUrl', X_URL];
const SAVE = ['save', IMAGE, FILE_NAME];
const COPY = ['copy', POST];
const COPY_IMAGE = ['copyImage', IMAGE];

async function withPanel(impl, run) {
  const { createSharePanel } = await loadPanel();
  const { SHARE_TEXT } = await loadData();
  await withGlobals({ document: fakeDocument() }, async () => {
    const el = fakeElement('div');
    const { actions, calls, asked } = recordActions(impl);
    const panel = createSharePanel({ el, actions });
    const open = (opts = {}) => panel.open({ makeImage: () => IMAGE, post: POST, xUrl: X_URL, ...opts });
    const openSecond = () => open({ makeImage: () => SECOND.image, post: SECOND.post, xUrl: SECOND.xUrl });
    await run({ el, panel, calls, asked, open, openSecond, impl, SHARE_TEXT });
  });
}

// 結果画面から通す
async function withEnding({ c, impl, globals = {} }, run) {
  const { createEndingScene } = await import('../src/scenes/endingScene.js');
  const { createGame } = await import('../src/game/progression.js');
  await withGlobals({ document: fakeDocument(), ...globals }, async () => {
    const screenEl = fakeElement('div');
    const retries = { count: 0 };
    const game = { ...createGame({ personality: 'tsundere', seed: 1, coat: c.coat, face: { shape: 'hoppe', ears: 'big' } }), day: c.day, catName: NAME };
    const { actions, calls } = recordActions(impl);
    createEndingScene({
      screenEl,
      session: { game },
      endingId: c.endingId,
      onRetry: () => { retries.count += 1; },
      shareActions: actions,
      makeShareImage: () => IMAGE,
    });
    await run({ screenEl, calls, retries });
  });
}

// 知らせが、決めた文（空でない）になっている
function assertNotice(el, SHARE_TEXT, key) {
  assert.equal(typeof SHARE_TEXT[key], 'string', `SHARE_TEXT.${key} がない`);
  assert.notEqual(SHARE_TEXT[key].trim(), '', `SHARE_TEXT.${key} が空`);
  assert.equal(statusText(el), SHARE_TEXT[key]);
}

// ---------------------------------------------------------------- 設定・画面の文

test('設定：画像のコピーを待つのは1秒', async () => {
  const { SHARE } = await loadData();
  assert.equal(SHARE.copyWaitSec, 1);
});

test('画面の文：xPaste は「貼り付け」、xNoImage は「画像を保存」を案内し、ほかの知らせと重ならない', async () => {
  const { SHARE_TEXT } = await loadData();
  for (const [key, word] of [['xPaste', '貼り付け'], ['xNoImage', '画像を保存']]) {
    assert.equal(typeof SHARE_TEXT[key], 'string', `SHARE_TEXT.${key} がない`);
    assert.ok(SHARE_TEXT[key].includes(word), `SHARE_TEXT.${key} に「${word}」がない: ${SHARE_TEXT[key]}`);
  }
  const notices = ['hint', 'copied', 'copyFailed', 'xFailed', 'saved', 'saveFailed', 'imageFailed', 'xPaste', 'xNoImage'].map((k) => SHARE_TEXT[k]);
  assert.equal(new Set(notices).size, notices.length, `知らせの文が重なっている: ${notices.join(' / ')}`);
});

// ---------------------------------------------------------------- 1 開いただけでは何も起きない

for (const device of DEVICES) {
  test(`1 ${device}：シェア画面を開いて閉じるだけでは、共有・コピー・X・保存のどれも起きない`, async (t) => {
    const tick = fakeTimers(t);
    await withPanel(full(device), async ({ el, panel, calls, open }) => {
      open();
      await tick(5000);
      assert.equal(panel.isOpen, true);
      assert.deepEqual(calls, []);
      assert.equal(statusText(el), '');
      press(el, 'share-close');
      await tick(5000);
      assert.deepEqual(calls, []);
    });
  });

  test(`1 結果画面（${device}）：「シェア」を押して画面が開いただけでは、共有・コピー・X・保存のどれも起きない`, async (t) => {
    const tick = fakeTimers(t);
    await withEnding({ c: CASES[0], impl: full(device) }, async ({ screenEl, calls }) => {
      await tick(5000);
      assert.deepEqual(calls, []);
      press(screenEl, 'share-open');
      await tick(5000);
      assert.equal(one(screenEl, 'share').hidden, false);
      assert.deepEqual(calls, []);
    });
  });
}

// ---------------------------------------------------------------- 2 スマホの「Xに投稿」

for (const device of PHONES) {
  test(`2 ${device}の「Xに投稿」：押した操作の中で、画像と文を1回だけ共有メニューに渡す。Xは開かず、画像もコピーしない`, async (t) => {
    const tick = fakeTimers(t);
    await withPanel(full(device), async ({ el, calls, asked, open }) => {
      open();
      press(el, 'share-x');
      assert.deepEqual(calls, [SHARE_X], '押した操作の中で共有していない');
      await tick(5000);
      assert.deepEqual(calls, [SHARE_X]);
      assert.equal(statusText(el), '');
      const checks = asked.filter(([name]) => name === 'canShare');
      assert.ok(checks.length > 0, '共有できるか調べていない');
      for (const c of checks) assert.deepEqual(c, ['canShare', IMAGE, FILE_NAME]);
    });
  });

  test(`2 ${device}の「Xに投稿」：成功すると、前の知らせが消える。終わったあとはまた押せる`, async () => {
    await withPanel(full(device), async ({ el, calls, open, SHARE_TEXT }) => {
      open();
      press(el, 'share-copy');
      await settle();
      assertNotice(el, SHARE_TEXT, 'copied');
      press(el, 'share-x');
      await settle();
      assert.equal(statusText(el), '');
      press(el, 'share-x');
      await settle();
      assert.deepEqual(calls, [COPY, SHARE_X, SHARE_X]);
    });
  });
}

// ---------------------------------------------------------------- 3 文に猫の名前と debug が入らない

const DEBUG_LOCATION = {
  href: 'https://example.com/neko/?debug=1', search: '?debug=1', origin: 'https://example.com', pathname: '/neko/', hash: '',
};
function assertNoSecret(label, text) {
  for (const s of [text, decodeURIComponent(text)]) {
    assert.ok(!s.includes(NAME), `${label}に名前が入っている: ${s}`);
    assert.ok(!s.toLowerCase().includes('debug'), `${label}に debug が入っている: ${s}`);
  }
}

for (const c of CASES) {
  for (const device of PHONES) {
    test(`3 結果画面（${c.endingId}・${device}）：共有メニューに渡す文は投稿文と同じで、猫の名前と debug が入らない。ファイル名にも入らない`, async () => {
      const { sharePost } = await import('../src/game/shareCard.js');
      await withEnding({ c, impl: full(device), globals: { location: DEBUG_LOCATION } }, async ({ screenEl, calls }) => {
        press(screenEl, 'share-open');
        press(screenEl, 'share-x');
        await settle();
        const post = sharePost({ day: c.day, endingId: c.endingId });
        assert.deepEqual(calls, [['share', { image: IMAGE, fileName: FILE_NAME, text: post }]]);
        const [, { text, fileName }] = calls[0];
        assert.equal(text.split('\n')[0], c.firstLine);
        assertNoSecret('文', text);
        assertNoSecret('ファイル名', fileName);
      });
    });
  }

  test(`3 結果画面（${c.endingId}・ios）：「画像を保存」は文を渡さず、ファイル名に猫の名前と debug が入らない`, async () => {
    await withEnding({ c, impl: full('ios'), globals: { location: DEBUG_LOCATION } }, async ({ screenEl, calls }) => {
      press(screenEl, 'share-open');
      press(screenEl, 'share-save');
      await settle();
      assert.deepEqual(calls, [SHARE_SAVE]);
      assertNoSecret('ファイル名', calls[0][1].fileName);
    });
  });

  test(`3 結果画面（${c.endingId}・pc）：コピーするのは画像だけで、開く X の URL に猫の名前と debug が入らない`, async () => {
    const { sharePost, xPostUrl } = await import('../src/game/shareCard.js');
    await withEnding({ c, impl: full('pc'), globals: { location: DEBUG_LOCATION } }, async ({ screenEl, calls }) => {
      press(screenEl, 'share-open');
      press(screenEl, 'share-x');
      await settle();
      assert.deepEqual(calls, [COPY_IMAGE, ['openUrl', xPostUrl(sharePost({ day: c.day, endingId: c.endingId }))]]);
      assertNoSecret('URL', calls[1][1]);
    });
  });
}

// ---------------------------------------------------------------- 4・5 画像を保存

test('4 iPhoneの「画像を保存」：押した操作の中で、画像だけ（文なし）を1回だけ共有メニューに渡す。直接の保存はしない', async () => {
  await withPanel(full('ios'), async ({ el, calls, open, SHARE_TEXT }) => {
    open();
    press(el, 'share-copy');
    await settle();
    assertNotice(el, SHARE_TEXT, 'copied');
    calls.length = 0;
    press(el, 'share-save');
    assert.deepEqual(calls, [SHARE_SAVE], '押した操作の中で共有していない');
    await settle();
    assert.deepEqual(calls, [SHARE_SAVE]);
    assert.equal(statusText(el), '', '前の知らせが残っている');
    press(el, 'share-save');
    await settle();
    assert.deepEqual(calls, [SHARE_SAVE, SHARE_SAVE]);
  });
});

for (const device of ['android', 'pc']) {
  test(`5 ${device}の「画像を保存」：共有メニューを使わず、今のまま直接保存する`, async () => {
    await withPanel(full(device), async ({ el, calls, open, SHARE_TEXT }) => {
      open();
      press(el, 'share-save');
      assert.deepEqual(calls, [SAVE]);
      assertNotice(el, SHARE_TEXT, 'saved');
      press(el, 'share-save');
      await settle();
      assert.deepEqual(calls, [SAVE, SAVE]);
    });
  });
}

// ---------------------------------------------------------------- 6 使えないときは今の動き

for (const [label, device, overrides] of [
  ['ios：画像を共有できない', 'ios', { canShare: () => false }],
  ['android：画像を共有できない', 'android', { canShare: () => false }],
  ['ios：canShare が例外', 'ios', { canShare: thrown }],
  ['android：canShare が例外', 'android', { canShare: thrown }],
  ['ios：canShare がない', 'ios', { canShare: undefined }],
  ['android：canShare がない', 'android', { canShare: undefined }],
  ['ios：share がない', 'ios', { share: undefined }],
  ['android：share がない', 'android', { share: undefined }],
  ['pc：画像をコピーできない', 'pc', { canCopyImage: () => false }],
  ['pc：canCopyImage が例外', 'pc', { canCopyImage: thrown }],
  ['pc：canCopyImage がない', 'pc', { canCopyImage: undefined }],
  ['pc：copyImage がない', 'pc', { copyImage: undefined }],
  ['device がない', 'ios', { device: undefined }],
  ['device が例外', 'ios', { device: thrown }],
]) {
  test(`6 ${label}：「Xに投稿」はその場でXを開き、「画像を保存」は直接保存する`, async (t) => {
    const tick = fakeTimers(t);
    await withPanel(full(device, overrides), async ({ el, calls, open, SHARE_TEXT }) => {
      open();
      press(el, 'share-x');
      assert.deepEqual(calls, [OPEN_X]);
      assert.equal(statusText(el), '');
      press(el, 'share-save');
      assert.deepEqual(calls, [OPEN_X, SAVE]);
      assertNotice(el, SHARE_TEXT, 'saved');
      await tick(5000);
      assert.deepEqual(calls, [OPEN_X, SAVE]);
    });
  });
}

for (const device of DEVICES) {
  test(`6 ${device}：画像を作れなかったときは、共有も画像のコピーもせず、「Xに投稿」はその場でXを開く`, async (t) => {
    const tick = fakeTimers(t);
    await withPanel(full(device), async ({ el, calls, open }) => {
      open({ makeImage: () => null });
      press(el, 'share-x');
      assert.deepEqual(calls, [OPEN_X]);
      assert.equal(statusText(el), '');
      const save = one(el, 'share-save');
      assert.equal(save.disabled, true);
      // disabled を無視して click が届いても、何もしない
      save.fire('click');
      await tick(5000);
      assert.deepEqual(calls, [OPEN_X]);
    });
  });
}

// ---------------------------------------------------------------- 7 共有をやめたとき

for (const [device, cls, expected] of [
  ['ios', 'share-x', SHARE_X],
  ['android', 'share-x', SHARE_X],
  ['ios', 'share-save', SHARE_SAVE],
]) {
  test(`7 ${device}の ${cls}：共有をやめたら、知らせを出さずに戻り、もう一度押すとまた共有メニューを開く`, async () => {
    await withPanel(full(device, { share: abort }), async ({ el, panel, calls, open, impl, SHARE_TEXT }) => {
      open();
      press(el, 'share-copy');
      await settle();
      assertNotice(el, SHARE_TEXT, 'copied');
      calls.length = 0;
      press(el, cls);
      await settle();
      assert.deepEqual(calls, [expected]);
      assert.equal(statusText(el), '');
      assert.equal(panel.isOpen, true);
      press(el, cls);
      await settle();
      assert.deepEqual(calls, [expected, expected], 'もう一度押しても共有メニューを開かない');
      impl.share = () => Promise.resolve();
      press(el, cls);
      await settle();
      assert.deepEqual(calls, [expected, expected, expected]);
      assert.equal(statusText(el), '');
    });
  });
}

// ---------------------------------------------------------------- 共有が壊れたあとの戻り道

for (const [label, fail] of [['拒否', denied], ['その場の例外', thrown]]) {
  for (const device of PHONES) {
    test(`戻り道：${device}の「Xに投稿」で共有が失敗（${label}）したら知らせ、次に押すとその場でXを開く（共有メニューは使わない）`, async () => {
      await withPanel(full(device, { share: fail }), async ({ el, panel, calls, open, impl, SHARE_TEXT }) => {
        open();
        press(el, 'share-x');
        await settle();
        assert.deepEqual(calls, [SHARE_X], '押していないのに続けて動いている');
        assertNotice(el, SHARE_TEXT, 'xFailed');
        assert.equal(panel.isOpen, true);
        impl.share = () => Promise.resolve();
        press(el, 'share-x');
        assert.deepEqual(calls, [SHARE_X, OPEN_X]);
        assert.equal(statusText(el), '');
        press(el, 'share-x');
        await settle();
        assert.deepEqual(calls, [SHARE_X, OPEN_X, OPEN_X]);
      });
    });
  }

  test(`戻り道：iPhoneの「画像を保存」で共有が失敗（${label}）したら長押しの方法を知らせ、次に押すと直接保存する`, async () => {
    await withPanel(full('ios', { share: fail }), async ({ el, calls, open, impl, SHARE_TEXT }) => {
      open();
      press(el, 'share-save');
      await settle();
      assert.deepEqual(calls, [SHARE_SAVE], '押していないのに続けて動いている');
      assertNotice(el, SHARE_TEXT, 'saved');
      impl.share = () => Promise.resolve();
      press(el, 'share-save');
      assert.deepEqual(calls, [SHARE_SAVE, SAVE]);
      assertNotice(el, SHARE_TEXT, 'saved');
    });
  });

  test(`戻り道：共有が失敗（${label}）しても、「コピー」「とじる」は使え、開き直せばまた共有メニューを使う`, async () => {
    await withPanel(full('ios', { share: fail }), async ({ el, calls, open, openSecond, impl, SHARE_TEXT }) => {
      open();
      press(el, 'share-x');
      await settle();
      press(el, 'share-copy');
      await settle();
      assertNotice(el, SHARE_TEXT, 'copied');
      press(el, 'share-close');
      assert.equal(el.hidden, true);
      assert.deepEqual(calls, [SHARE_X, COPY]);
      impl.share = () => Promise.resolve();
      openSecond();
      assert.equal(statusText(el), '');
      press(el, 'share-x');
      await settle();
      assert.deepEqual(calls.slice(2), [['share', { image: SECOND.image, fileName: FILE_NAME, text: SECOND.post }]]);
    });
  });
}

for (const [label, device, overrides, expected] of [
  ['共有の拒否', 'ios', { share: denied }, ['share']],
  ['共有の中止', 'android', { share: abort }, ['share']],
  ['画像のコピーの拒否', 'pc', { copyImage: denied }, ['copyImage', 'openUrl']],
  ['終わらない共有', 'ios', { share: () => new Promise(() => {}) }, ['share']],
]) {
  test(`戻り道：結果画面は、${label}のあとも、閉じれば「もう一度あそぶ」が1回効く`, async (t) => {
    const tick = fakeTimers(t);
    await withEnding({ c: CASES[3], impl: full(device, overrides) }, async ({ screenEl, calls, retries }) => {
      press(screenEl, 'share-open');
      press(screenEl, 'share-x');
      await tick(5000);
      assert.deepEqual(calls.map(([name]) => name), expected);
      press(screenEl, 'share-close');
      assert.equal(one(screenEl, 'share').hidden, true);
      assert.equal(one(screenEl, 'ending-screen').inert, false);
      press(screenEl, 'retry');
      assert.equal(retries.count, 1);
    });
  });
}

// ---------------------------------------------------------------- 8 PC：画像をコピーしてからXを開く

test('8 PCの「Xに投稿」：画像をコピーし、終わってからXを1回だけ開き、貼り付けの案内を出す', async (t) => {
  const tick = fakeTimers(t);
  const d = deferred();
  await withPanel(full('pc', { copyImage: () => d.promise }), async ({ el, calls, open, SHARE_TEXT }) => {
    open();
    press(el, 'share-x');
    assert.deepEqual(calls, [COPY_IMAGE]);
    await tick(500);
    assert.deepEqual(calls, [COPY_IMAGE], 'コピーが終わる前にXを開いている');
    d.resolve();
    await settle();
    assert.deepEqual(calls, [COPY_IMAGE, OPEN_X]);
    assertNotice(el, SHARE_TEXT, 'xPaste');
    await tick(5000);
    assert.deepEqual(calls, [COPY_IMAGE, OPEN_X], '待ち時間が過ぎてから、もう一度開いている');
    assertNotice(el, SHARE_TEXT, 'xPaste');
  });
});

test('8 PCの「Xに投稿」：コピーに成功したあとにもう一度押すと、コピーし直さず、押した操作の中でXを開く', async (t) => {
  const tick = fakeTimers(t);
  await withPanel(full('pc'), async ({ el, calls, open, SHARE_TEXT }) => {
    open();
    press(el, 'share-x');
    await settle();
    assert.deepEqual(calls, [COPY_IMAGE, OPEN_X]);
    press(el, 'share-x');
    assert.deepEqual(calls, [COPY_IMAGE, OPEN_X, OPEN_X]);
    await tick(5000);
    assert.deepEqual(calls, [COPY_IMAGE, OPEN_X, OPEN_X]);
    assertNotice(el, SHARE_TEXT, 'xPaste');
  });
});

for (const [label, fail] of [['false', () => false], ['例外', thrown]]) {
  for (const [copied, copyImage] of [['成功', () => Promise.resolve()], ['失敗', denied]]) {
    test(`8 PCの「Xに投稿」：コピーに${copied}してもXを開けなかったら（${label}）、開かないときの知らせを出す`, async () => {
      await withPanel(full('pc', { openUrl: fail, copyImage }), async ({ el, panel, calls, open, SHARE_TEXT }) => {
        open();
        press(el, 'share-x');
        await settle();
        assert.deepEqual(calls, [COPY_IMAGE, OPEN_X]);
        assertNotice(el, SHARE_TEXT, 'xFailed');
        assert.equal(panel.isOpen, true);
      });
    });
  }

  test(`8 PCの「Xに投稿」：コピーのあとXを開けなかったら（${label}）、次に押すと、コピーし直さず押した操作の中で開く`, async () => {
    await withPanel(full('pc', { openUrl: fail }), async ({ el, calls, open, impl, SHARE_TEXT }) => {
      open();
      press(el, 'share-x');
      await settle();
      impl.openUrl = () => true;
      press(el, 'share-x');
      assert.deepEqual(calls, [COPY_IMAGE, OPEN_X, OPEN_X]);
      await settle();
      assert.deepEqual(calls, [COPY_IMAGE, OPEN_X, OPEN_X]);
      assertNotice(el, SHARE_TEXT, 'xPaste');
    });
  });
}

// ---------------------------------------------------------------- 9 PC：画像をコピーできなくてもXは開く

for (const [label, fail] of [['拒否', denied], ['その場の例外', thrown]]) {
  test(`9 PC：画像のコピーが${label}でも、Xは1回開き、画像を付ける別の方法を知らせる`, async (t) => {
    const tick = fakeTimers(t);
    await withPanel(full('pc', { copyImage: fail }), async ({ el, calls, open, SHARE_TEXT }) => {
      open();
      press(el, 'share-x');
      await settle();
      assert.deepEqual(calls, [COPY_IMAGE, OPEN_X]);
      assertNotice(el, SHARE_TEXT, 'xNoImage');
      await tick(5000);
      assert.deepEqual(calls, [COPY_IMAGE, OPEN_X]);
      press(el, 'share-save');
      assert.deepEqual(calls, [COPY_IMAGE, OPEN_X, SAVE]);
    });
  });
}

for (const late of ['成功', '拒否', '終わらないまま']) {
  test(`9 PC：画像のコピーが終わらないときは、1秒でXを開く。あとで終わっても（${late}）2回開かない`, async (t) => {
    const tick = fakeTimers(t);
    const d = deferred();
    await withPanel(full('pc', { copyImage: () => d.promise }), async ({ el, calls, open, SHARE_TEXT }) => {
      open();
      press(el, 'share-x');
      await tick(999);
      assert.deepEqual(calls, [COPY_IMAGE], '1秒たつ前にXを開いている');
      await tick(1);
      assert.deepEqual(calls, [COPY_IMAGE, OPEN_X]);
      assertNotice(el, SHARE_TEXT, 'xNoImage');
      if (late === '成功') d.resolve();
      if (late === '拒否') d.reject(named('NotAllowedError'));
      await tick(5000);
      assert.deepEqual(calls, [COPY_IMAGE, OPEN_X]);
      assertNotice(el, SHARE_TEXT, 'xNoImage');
      press(el, 'share-save');
      assert.deepEqual(calls, [COPY_IMAGE, OPEN_X, SAVE], '待ち終わったのに「画像を保存」が押せない');
    });
  });
}

// ---------------------------------------------------------------- 連打（待っている間）

for (const [device, cls, expected] of [
  ['ios', 'share-x', SHARE_X],
  ['android', 'share-x', SHARE_X],
  ['ios', 'share-save', SHARE_SAVE],
]) {
  for (const [end, finish] of [
    ['成功', (d) => d.resolve()],
    ['中止', (d) => d.reject(named('AbortError'))],
  ]) {
    test(`連打：${device}の ${cls} で共有メニューが開いている間は、「Xに投稿」「画像を保存」は何もしない。終われば（${end}）また押せる`, async () => {
      let d = deferred();
      await withPanel(full(device, { share: () => d.promise }), async ({ el, calls, open, SHARE_TEXT }) => {
        open();
        press(el, cls);
        press(el, cls);
        press(el, 'share-x');
        press(el, 'share-save');
        await settle();
        press(el, 'share-x');
        press(el, 'share-save');
        await settle();
        assert.deepEqual(calls, [expected]);
        press(el, 'share-copy');
        await settle();
        assert.deepEqual(calls, [expected, COPY], '「コピー」が使えない');
        assertNotice(el, SHARE_TEXT, 'copied');
        finish(d);
        await settle();
        d = deferred();
        press(el, cls);
        assert.deepEqual(calls, [expected, COPY, expected], '終わったあとに押せない');
        d.resolve();
        await settle();
        assert.equal(statusText(el), '');
      });
    });
  }
}

test('連打：PCで画像のコピーを待っている間は、「Xに投稿」「画像を保存」は何もしない。「コピー」は使え、終わればまた押せる', async (t) => {
  fakeTimers(t);
  const d = deferred();
  await withPanel(full('pc', { copyImage: () => d.promise }), async ({ el, calls, open, SHARE_TEXT }) => {
    open();
    press(el, 'share-x');
    press(el, 'share-x');
    press(el, 'share-save');
    await settle();
    press(el, 'share-x');
    press(el, 'share-save');
    assert.deepEqual(calls, [COPY_IMAGE]);
    press(el, 'share-copy');
    await settle();
    assert.deepEqual(calls, [COPY_IMAGE, COPY], '「コピー」が使えない');
    assertNotice(el, SHARE_TEXT, 'copied');
    d.resolve();
    await settle();
    assert.deepEqual(calls, [COPY_IMAGE, COPY, OPEN_X]);
    press(el, 'share-save');
    assert.deepEqual(calls, [COPY_IMAGE, COPY, OPEN_X, SAVE], '終わったあとに押せない');
  });
});

// ---------------------------------------------------------------- 待っている間に閉じる

const ENDS = {
  成功: (d) => d.resolve(),
  中止: (d) => d.reject(named('AbortError')),
  拒否: (d) => d.reject(named('NotAllowedError')),
};

for (const [device, cls, expected] of [
  ['ios', 'share-x', SHARE_X],
  ['android', 'share-x', SHARE_X],
  ['ios', 'share-save', SHARE_SAVE],
]) {
  for (const [end, finish] of Object.entries(ENDS)) {
    test(`待っている間に閉じる：${device}の ${cls}。あとで終わっても（${end}）何も起きず、次に開いた画面は普通に使える`, async () => {
      const first = deferred();
      const second = deferred();
      const queue = [first.promise, second.promise];
      await withPanel(full(device, { share: () => queue.shift() ?? Promise.resolve() }), async ({ el, panel, calls, open, openSecond, SHARE_TEXT }) => {
        const shareSecond = ['share', { image: SECOND.image, fileName: FILE_NAME, text: SECOND.post }];
        open();
        press(el, cls);
        press(el, 'share-close');
        assert.equal(el.hidden, true);
        assert.equal(panel.isOpen, false);

        // 前の共有が終わらないうちに開いた画面でも、押せる
        openSecond();
        press(el, 'share-x');
        assert.deepEqual(calls, [expected, shareSecond], '次に開いた画面で押せない');
        finish(first);
        await settle();
        assert.equal(statusText(el), '', '前の画面の知らせが出ている');
        // 前の共有が終わっても、今の共有はまだ開いている
        press(el, 'share-x');
        press(el, 'share-save');
        assert.deepEqual(calls, [expected, shareSecond], '今の共有が終わる前に押せてしまう');
        second.resolve();
        await settle();
        assert.equal(statusText(el), '');
        // 前の失敗を引きずらず、また共有メニューを使う
        press(el, 'share-x');
        await settle();
        assert.deepEqual(calls, [expected, shareSecond, shareSecond]);
        press(el, 'share-copy');
        await settle();
        assertNotice(el, SHARE_TEXT, 'copied');
      });
    });
  }
}

for (const [end, finish] of [['成功', ENDS.成功], ['拒否', ENDS.拒否], ['1秒たつ', () => {}]]) {
  test(`待っている間に閉じる：PCの画像のコピー。あとで終わっても（${end}）Xを開かず、知らせも出さない。次に開いた画面は普通に使える`, async (t) => {
    const tick = fakeTimers(t);
    const first = deferred();
    const queue = [first.promise];
    await withPanel(full('pc', { copyImage: () => queue.shift() ?? Promise.resolve() }), async ({ el, calls, open, openSecond, SHARE_TEXT }) => {
      open();
      press(el, 'share-x');
      press(el, 'share-close');
      finish(first);
      await tick(5000);
      assert.deepEqual(calls, [COPY_IMAGE], '閉じたのに動いている');
      assert.equal(el.hidden, true);
      openSecond();
      await tick(5000);
      assert.deepEqual(calls, [COPY_IMAGE]);
      assert.equal(statusText(el), '');
      press(el, 'share-x');
      await settle();
      assert.deepEqual(calls.slice(1), [['copyImage', SECOND.image], ['openUrl', SECOND.xUrl]]);
      assertNotice(el, SHARE_TEXT, 'xPaste');
    });
  });

  test(`待っている間に閉じる：PCで開き直したあとに、前のコピーが終わっても（${end}）Xを開かず、知らせも出さない`, async (t) => {
    const tick = fakeTimers(t);
    const first = deferred();
    await withPanel(full('pc', { copyImage: () => first.promise }), async ({ el, calls, open, openSecond, impl }) => {
      open();
      press(el, 'share-x');
      press(el, 'share-close');
      openSecond();
      finish(first);
      await tick(5000);
      assert.deepEqual(calls, [COPY_IMAGE]);
      assert.equal(statusText(el), '');
      // 前の画面のコピーの成功を引きずらず、今の画像をコピーする
      impl.copyImage = () => Promise.resolve();
      press(el, 'share-x');
      await settle();
      assert.deepEqual(calls.slice(1), [['copyImage', SECOND.image], ['openUrl', SECOND.xUrl]]);
    });
  });
}

// ---------------------------------------------------------------- ブラウザの実装（actions を渡さない）

// PNG の先頭と、文字として読むと壊れる値（0・128以上）を含む中身
const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x7f, 0x80, 0xc3, 0xfe, 0xff, 0x00, 0x01];
const PNG_IMAGE = `data:image/png;base64,${Buffer.from(PNG_BYTES).toString('base64')}`;

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipod: 'Mozilla/5.0 (iPod touch; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};
const IPHONE = { userAgent: UA.iphone, platform: 'iPhone', maxTouchPoints: 5 };
const ANDROID = { userAgent: UA.android, platform: 'Linux armv81', maxTouchPoints: 5 };
const WINDOWS = { userAgent: UA.windows, platform: 'Win32', maxTouchPoints: 0 };

// すべて使えるブラウザの navigator・window などを作る。log には外に出る動きが順に残る。
// impl の関数を差し替えると、失敗などを起こせる
function fakeBrowser(device) {
  const log = [];
  const checked = [];
  const impl = {
    share: async () => {},
    canShare: () => true,
    write: async () => {},
    open: () => ({ opener: 'game' }),
  };
  // ブラウザと同じく、持ち主から切り離して呼ぶと例外になる
  const owned = (self, owner) => {
    if (self !== owner) throw new TypeError('Illegal invocation');
  };
  const clipboard = {
    write(...args) {
      owned(this, clipboard);
      log.push(['write', ...args]);
      return impl.write(...args);
    },
    async writeText(...args) {
      owned(this, clipboard);
      log.push(['writeText', ...args]);
    },
  };
  const navigator = {
    ...device,
    clipboard,
    share(...args) {
      owned(this, navigator);
      log.push(['share', ...args]);
      return impl.share(...args);
    },
    canShare(...args) {
      owned(this, navigator);
      checked.push(args);
      return impl.canShare(...args);
    },
  };
  class ClipboardItem {
    constructor(items) {
      this.items = items;
    }
  }
  const window = {
    navigator,
    ClipboardItem,
    open(...args) {
      log.push(['open', ...args]);
      return impl.open(...args);
    },
  };
  const document = fakeDocument();
  document.body = fakeElement('body');
  document.createElement = (tag) => {
    const node = fakeElement(tag);
    node.click = () => log.push(['click', node.href, node.download]);
    return node;
  };
  return { log, impl, checked, navigator, clipboard, window, globals: { document, navigator, window, ClipboardItem } };
}

// setup: 開く前に、使えないもの・失敗のしかたを決める
async function withBrowser(device, run, setup = () => {}) {
  const { createSharePanel } = await loadPanel();
  const { SHARE_TEXT } = await loadData();
  const b = fakeBrowser(device);
  setup(b);
  await withGlobals(b.globals, async () => {
    const el = fakeElement('div');
    createSharePanel({ el }).open({ makeImage: () => PNG_IMAGE, post: POST, xUrl: X_URL });
    await run({ ...b, el, SHARE_TEXT });
  });
}
const names = (log) => log.map(([name]) => name);

async function assertPngFile(file) {
  assert.ok(file instanceof File, `File でない: ${file}`);
  assert.equal(file.name, FILE_NAME);
  assert.equal(file.type, 'image/png');
  assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], PNG_BYTES);
}

for (const [label, device] of [['iPhone', IPHONE], ['Android', ANDROID], ['PC', WINDOWS]]) {
  test(`1 ブラウザの実装（${label}）：画面を開いて閉じるだけでは、共有・クリップボード・新しいタブ・保存のどれも使わない`, async (t) => {
    const tick = fakeTimers(t);
    await withBrowser(device, async ({ el, log }) => {
      await tick(5000);
      assert.equal(el.hidden, false);
      assert.deepEqual(log, []);
      press(el, 'share-close');
      await tick(5000);
      assert.deepEqual(log, []);
    });
  });
}

// 端末の判定は、押したときの動きで見分ける
for (const [label, device, kind] of [
  ['iPhone', IPHONE, 'ios'],
  ['iPod', { userAgent: UA.ipod, platform: 'iPod', maxTouchPoints: 5 }, 'ios'],
  ['iPad（userAgent に iPad）', { userAgent: UA.ipad, platform: 'iPad', maxTouchPoints: 5 }, 'ios'],
  ['iPad（Mac を名乗り、タッチ5点）', { userAgent: UA.mac, platform: 'MacIntel', maxTouchPoints: 5 }, 'ios'],
  ['Android', ANDROID, 'android'],
  ['Mac（タッチ0点）', { userAgent: UA.mac, platform: 'MacIntel', maxTouchPoints: 0 }, 'pc'],
  ['Mac（タッチ1点）', { userAgent: UA.mac, platform: 'MacIntel', maxTouchPoints: 1 }, 'pc'],
  ['Windows', WINDOWS, 'pc'],
  ['Windows（タッチ10点）', { userAgent: UA.windows, platform: 'Win32', maxTouchPoints: 10 }, 'pc'],
]) {
  test(`端末の判定：${label}は ${kind} として動く`, async () => {
    await withBrowser(device, async ({ el, log }) => {
      press(el, 'share-x');
      await settle();
      assert.deepEqual(names(log), kind === 'pc' ? ['write', 'open'] : ['share']);
      log.length = 0;
      press(el, 'share-save');
      await settle();
      assert.deepEqual(names(log), kind === 'ios' ? ['share'] : ['click']);
    });
  });
}

for (const [label, device] of [['iPhone', IPHONE], ['Android', ANDROID]]) {
  test(`2 ブラウザの実装（${label}）：「Xに投稿」は押した操作の中で、画像ファイルと文だけを共有メニューに1回渡す`, async () => {
    await withBrowser(device, async ({ el, log, checked }) => {
      press(el, 'share-x');
      assert.deepEqual(names(log), ['share'], '押した操作の中で共有していない');
      await settle();
      assert.deepEqual(names(log), ['share']);
      const [, ...args] = log[0];
      assert.equal(args.length, 1);
      assert.deepEqual(Object.keys(args[0]).sort(), ['files', 'text']);
      assert.equal(args[0].text, POST);
      assert.equal(args[0].files.length, 1);
      await assertPngFile(args[0].files[0]);
      assert.equal(statusText(el), '');
      // 共有できるかは、同じ中身のファイルで調べる
      assert.ok(checked.length > 0, '共有できるか調べていない');
      for (const c of checked) {
        assert.equal(c.length, 1);
        assert.deepEqual(Object.keys(c[0]), ['files']);
        assert.equal(c[0].files.length, 1);
        await assertPngFile(c[0].files[0]);
      }
    });
  });
}

test('4 ブラウザの実装（iPhone）：「画像を保存」は押した操作の中で、画像ファイルだけを渡す（text のキーもない）', async () => {
  await withBrowser(IPHONE, async ({ el, log }) => {
    press(el, 'share-save');
    assert.deepEqual(names(log), ['share'], '押した操作の中で共有していない');
    await settle();
    assert.deepEqual(names(log), ['share']);
    const [, ...args] = log[0];
    assert.equal(args.length, 1);
    assert.deepEqual(Object.keys(args[0]), ['files']);
    assert.equal(args[0].files.length, 1);
    await assertPngFile(args[0].files[0]);
    assert.equal(statusText(el), '');
  });
});

test('5 ブラウザの実装（Android）：「画像を保存」は、ファイル名付きのリンクで直接保存する', async () => {
  await withBrowser(ANDROID, async ({ el, log, SHARE_TEXT }) => {
    press(el, 'share-save');
    assert.deepEqual(log, [['click', PNG_IMAGE, FILE_NAME]]);
    assertNotice(el, SHARE_TEXT, 'saved');
  });
});

for (const [label, setup] of [
  ['navigator.share がない', (b) => { delete b.navigator.share; }],
  ['navigator.canShare がない', (b) => { delete b.navigator.canShare; }],
  ['navigator.canShare が false の', (b) => { b.impl.canShare = () => false; }],
  ['navigator.canShare が例外の', (b) => { b.impl.canShare = thrown; }],
]) {
  for (const [name, device] of [['iPhone', IPHONE], ['Android', ANDROID]]) {
    test(`6 ブラウザの実装（${name}）：${label}ときは、その場でXを開き、直接保存する`, async () => {
      await withBrowser(device, async ({ el, log }) => {
        press(el, 'share-x');
        press(el, 'share-save');
        assert.deepEqual(log, [['open', X_URL, '_blank'], ['click', PNG_IMAGE, FILE_NAME]]);
        await settle();
        assert.equal(log.length, 2);
      }, setup);
    });
  }
}

for (const [label, setup] of [
  ['navigator.clipboard がない', (b) => { delete b.navigator.clipboard; }],
  ['navigator.clipboard.write がない', (b) => { delete b.clipboard.write; }],
  ['ClipboardItem がない', (b) => {
    delete b.globals.ClipboardItem;
    delete b.window.ClipboardItem;
  }],
]) {
  test(`6 ブラウザの実装（PC）：${label}ときは、その場でXを開く`, async () => {
    await withBrowser(WINDOWS, async ({ el, log }) => {
      press(el, 'share-x');
      assert.deepEqual(log, [['open', X_URL, '_blank']]);
      assert.equal(statusText(el), '');
      await settle();
      assert.equal(log.length, 1);
    }, setup);
  });
}

for (const cls of ['share-x', 'share-save']) {
  test(`7 ブラウザの実装（iPhone・${cls}）：共有をやめたとき（DOMException の AbortError）は知らせを出さず、もう一度共有できる`, async () => {
    await withBrowser(IPHONE, async ({ el, log }) => {
      press(el, cls);
      await settle();
      assert.equal(statusText(el), '');
      press(el, cls);
      await settle();
      assert.deepEqual(names(log), ['share', 'share']);
      assert.equal(statusText(el), '');
    }, (b) => { b.impl.share = async () => { throw new DOMException('Share canceled', 'AbortError'); }; });
  });
}

test('8 ブラウザの実装（PC）：画像（image/png・中身は data URL のとおり）をクリップボードに1回書き、終わってからXを開く', async (t) => {
  fakeTimers(t);
  const d = deferred();
  await withBrowser(WINDOWS, async ({ el, log, globals, SHARE_TEXT }) => {
    press(el, 'share-x');
    await settle();
    assert.deepEqual(names(log), ['write'], 'コピーが終わる前にXを開いている');
    const [, ...args] = log[0];
    assert.equal(args.length, 1);
    assert.equal(args[0].length, 1);
    const [item] = args[0];
    assert.ok(item instanceof globals.ClipboardItem, 'ClipboardItem でない');
    assert.deepEqual(Object.keys(item.items), ['image/png']);
    const blob = item.items['image/png'];
    assert.ok(blob instanceof Blob, 'Blob でない');
    assert.equal(blob.type, 'image/png');
    assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], PNG_BYTES);
    d.resolve();
    await settle();
    assert.deepEqual(names(log), ['write', 'open']);
    assert.deepEqual(log[1], ['open', X_URL, '_blank']);
    assertNotice(el, SHARE_TEXT, 'xPaste');
  }, (b) => { b.impl.write = () => d.promise; });
});

test('9 ブラウザの実装（PC）：クリップボードに書けなくても、Xは1回開き、画像を付ける別の方法を知らせる', async () => {
  await withBrowser(WINDOWS, async ({ el, log, SHARE_TEXT }) => {
    press(el, 'share-x');
    await settle();
    assert.deepEqual(names(log), ['write', 'open']);
    assertNotice(el, SHARE_TEXT, 'xNoImage');
  }, (b) => { b.impl.write = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
});

// ---------------------------------------------------------------- 追加：画像のコピーのあとに文をコピーしたとき

test('8 PCの「Xに投稿」：画像のコピーのあとに「コピー」（文）を押したら、次は画像をコピーし直してからXを開く', async (t) => {
  fakeTimers(t);
  await withPanel(full('pc'), async ({ el, calls, open, SHARE_TEXT }) => {
    open();
    press(el, 'share-x');
    await settle();
    press(el, 'share-copy');
    await settle();
    calls.length = 0;
    press(el, 'share-x');
    assert.deepEqual(calls, [COPY_IMAGE], '文が入ったまま、貼り付けてと案内してしまう');
    await settle();
    assert.deepEqual(calls, [COPY_IMAGE, OPEN_X]);
    assertNotice(el, SHARE_TEXT, 'xPaste');
  });
});

// ---------------------------------------------------------------- レビューの指摘の再現（追加）

test('レビュー：PCで画像のコピーに失敗し、Xも開けなかったら、次に押すとコピーを待たずに押した操作の中でXを開く', async (t) => {
  fakeTimers(t);
  await withPanel(full('pc', { copyImage: denied, openUrl: () => false }), async ({ el, calls, open, impl, SHARE_TEXT }) => {
    open();
    press(el, 'share-x');
    await settle();
    assertNotice(el, SHARE_TEXT, 'xFailed');
    impl.openUrl = () => true;
    calls.length = 0;
    press(el, 'share-x');
    assert.deepEqual(calls, [OPEN_X]);
    assertNotice(el, SHARE_TEXT, 'xNoImage');
  });
});

for (const device of ['ios', 'android']) {
  test(`レビュー：${device}で共有メニューがいつまでも終わらないとき、しばらくしてから押すと、共有メニューを使わずにXを開く・保存する`, async (t) => {
    const tick = fakeTimers(t);
    const { SHARE } = await loadData();
    await withPanel(full(device, { share: () => new Promise(() => {}) }), async ({ el, calls, open }) => {
      open();
      press(el, 'share-x');
      await tick(SHARE.sheetWaitSec * 1000 - 100);
      calls.length = 0;
      press(el, 'share-x');
      press(el, 'share-save');
      assert.deepEqual(calls, [], '待ち時間のうちに動いている');
      await tick(200);
      press(el, 'share-x');
      press(el, 'share-save');
      assert.deepEqual(calls.map((c) => c[0]), ['openUrl', 'save']);
    });
  });
}

test('レビュー：共有メニューで長く迷ってから投稿しても（またはやめても）、次もまた共有メニューを使う', async (t) => {
  for (const end of ['resolve', 'reject']) {
    await t.test(end, async (tt) => {
      const tick = fakeTimers(tt);
      const { SHARE } = await loadData();
      const d = deferred();
      await withPanel(full('ios', { share: () => d.promise }), async ({ el, calls, open }) => {
        open();
        press(el, 'share-x');
        await tick(SHARE.sheetWaitSec * 10000);
        if (end === 'resolve') d.resolve();
        else d.reject(Object.assign(new Error('やめた'), { name: 'AbortError' }));
        await settle();
        assert.equal(statusText(el), '');
        calls.length = 0;
        press(el, 'share-x');
        assert.deepEqual(calls.map((c) => c[0]), ['share']);
      });
    });
  }
});

test('レビュー：PCで画像のコピーを待つ間に「コピー」（文）を押したら、「画像をコピーしました」と案内せず、次はコピーし直す', async (t) => {
  fakeTimers(t);
  const d = deferred();
  await withPanel(full('pc', { copyImage: () => d.promise }), async ({ el, calls, open, impl, SHARE_TEXT }) => {
    open();
    press(el, 'share-x');
    press(el, 'share-copy');
    await settle();
    d.resolve();
    await settle();
    assertNotice(el, SHARE_TEXT, 'xNoImage');
    impl.copyImage = () => Promise.resolve();
    calls.length = 0;
    press(el, 'share-x');
    assert.deepEqual(calls, [COPY_IMAGE]);
    await settle();
    assertNotice(el, SHARE_TEXT, 'xPaste');
  });
});

test('レビュー：PCで画像をコピーできるときは、押す前から、貼り付けで画像が付くことを知らせておく', async () => {
  await withPanel(full('pc'), async ({ el, open, SHARE_TEXT }) => {
    open();
    assert.match(SHARE_TEXT.hintPc, /貼り付け/);
    assert.equal(one(el, 'share-hint').textContent, SHARE_TEXT.hintPc);
  });
  for (const impl of [full('ios'), full('android'), full('pc', { canCopyImage: () => false })]) {
    await withPanel(impl, async ({ el, open, SHARE_TEXT }) => {
      open();
      assert.equal(one(el, 'share-hint').textContent, SHARE_TEXT.hint);
    });
  }
});
