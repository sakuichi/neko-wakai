import { test } from 'node:test';
import assert from 'node:assert/strict';

// シェア（結果画面 → シェア画面）のテスト。
// 対象のモジュールは、テストの中で読み込む

async function loadData() {
  const { SHARE } = await import('../src/data/params.js');
  const { SHARE_TEXT, ENDINGS, COAT_LABELS, TITLE } = await import('../src/data/texts.js');
  assert.ok(SHARE, 'params.js に SHARE がない');
  assert.ok(SHARE_TEXT, 'texts.js に SHARE_TEXT がない');
  return { SHARE, SHARE_TEXT, ENDINGS, COAT_LABELS, TITLE };
}
const loadCard = () => import('../src/game/shareCard.js');
const loadImage = () => import('../src/render/shareImage.js');
const loadPanel = () => import('../src/ui/sharePanel.js');

// ほかの文に出てこない名前（投稿文に入っていないことを確かめるため）
const NAME = 'ヴェルサイユ姫';
// 全角10文字
const LONG_NAME = 'ああああああああああ';
const URL_SAMPLE = 'https://example.com/neko/';

const CASES = [
  {
    endingId: 'fate', day: 3, coat: 'chatora',
    headline: ['3日目で', 'ネコと和解した'], type: '運命の膝', nameLine: `ネコの名前：${NAME}（茶トラ）`,
    post: ['3日目でネコと和解した。', 'たった3日で膝に乗ってきた。これは「運命の膝」。', '#ネコと和解せよ #ネコ和解ゲーム'],
  },
  {
    endingId: 'patient', day: 5, coat: 'kuro',
    headline: ['5日目で', 'ネコと和解した'], type: '待てる人間', nameLine: `ネコの名前：${NAME}（クロ）`,
    post: ['5日目でネコと和解した。', '焦らず、追わず。わたしは「待てる人間」。', '#ネコと和解せよ #ネコ和解ゲーム'],
  },
  {
    endingId: 'persistent', day: 6, coat: 'kijitora',
    headline: ['6日目で', 'ネコと和解した'], type: '根気の人', nameLine: `ネコの名前：${NAME}（キジトラ）`,
    post: ['6日目でネコと和解した。', '何度逃げられても待った。わたしは「根気の人」。', '#ネコと和解せよ #ネコ和解ゲーム'],
  },
  {
    endingId: 'visitor', day: 7, coat: 'shiro',
    headline: ['7日かけても、', 'ネコと和解できなかった'], type: '通い猫になりました', nameLine: `ネコの名前：${NAME}（シロ）`,
    post: ['7日かけても、ネコと和解できなかった。', 'でも、ときどき遊びに来てくれる。', '#ネコと和解せよ #ネコ和解ゲーム'],
  },
];
const ENDING_IDS = CASES.map((c) => c.endingId);

// ---------------------------------------------------------------- 偽 DOM・偽 Canvas

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
// 自分か親が隠れていない要素だけ
function isShown(node) {
  for (let cur = node; cur; cur = cur.parent) if (cur.hidden || cur.style?.display === 'none') return false;
  return true;
}
const shown = (root, cls) => byClass(root, cls).filter(isShown);
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
  return { promise, resolve, reject };
}

// 描画命令を記録する偽の Canvas。
// 文字の幅は、フォントの px から決める（全角は1文字 px、半角は 0.6px。wide はその倍率）
function recordingCanvas({ id = 0, wide = 1, context = true, toDataURLThrows = false } = {}) {
  const log = [];
  const fills = [];
  const texts = [];
  const state = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, globalCompositeOperation: 'source-over',
    font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic', lineJoin: 'miter', lineCap: 'butt',
  };
  const stack = [];
  const px = () => Number(/(\d+(?:\.\d+)?)px/.exec(state.font)?.[1] ?? NaN);
  const widthOf = (text) => [...String(text)].reduce((sum, ch) => sum + (ch.codePointAt(0) > 0xff ? 1 : 0.6), 0) * px() * wide;
  const gradient = () => ({ addColorStop() {} });
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key === 'canvas') return canvas;
      if (key in target) return target[key];
      if (key === 'measureText') return (text) => ({ width: widthOf(text), actualBoundingBoxAscent: px() * 0.8, actualBoundingBoxDescent: px() * 0.2 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient' || key === 'createPattern') return gradient;
      return (...args) => {
        log.push([String(key), ...args.map((v) => (v && typeof v === 'object' ? 'object' : v))]);
        if (key === 'save') stack.push({ ...state });
        if (key === 'restore' && stack.length) Object.assign(state, stack.pop());
        if (key === 'fill') fills.push(state.fillStyle);
        if (key === 'fillText') texts.push({ text: args[0], x: args[1], y: args[2], align: state.textAlign, px: px(), width: widthOf(args[0]) });
      };
    },
    set(target, key, value) {
      target[key] = value;
      log.push(['set', String(key), value && typeof value === 'object' ? 'object' : value]);
      return true;
    },
  });
  const canvas = {
    tagName: 'CANVAS', width: 360, height: 640, style: {}, log, fills, texts, dataUrls: [],
    getContext: () => (context ? ctx : null),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 640 }),
    toDataURL(type) {
      if (toDataURLThrows) throw new Error('SecurityError');
      canvas.dataUrls.push({ type, width: canvas.width, height: canvas.height });
      return `data:image/png;base64,FAKE${id}`;
    },
  };
  return canvas;
}

// createElement('canvas') で偽の Canvas、ほかは偽の要素を返す document。options(i) は i 枚目の Canvas の設定
function fakeDocument(options = () => ({})) {
  const canvases = [];
  return {
    canvases,
    createElement(tag) {
      if (String(tag).toLowerCase() !== 'canvas') return fakeElement(tag);
      const c = recordingCanvas({ id: canvases.length, ...options(canvases.length) });
      canvases.push(c);
      return c;
    },
    createTextNode: (s) => String(s),
  };
}

// 画像を作り、仕上げ用の Canvas（data URL にしたもの）を返す
async function renderShare({ endingId, day, catName = NAME, coat = 'chatora', face = { shape: 'maru', ears: 'big' }, personality = 'amaenbo', wide = 1 }) {
  const { shareCard, shareView } = await loadCard();
  const { createShareImage } = await loadImage();
  const doc = fakeDocument(() => ({ wide }));
  const card = shareCard({ day, endingId, catName, coat });
  const result = await withGlobals({ document: doc }, () => createShareImage({ card, shot: shareView(endingId), coat, face, personality }));
  const finals = doc.canvases.filter((c) => c.dataUrls.length);
  assert.equal(finals.length, 1, `data URL にした Canvas が1枚でない（${finals.length}枚）`);
  return { result, card, canvas: finals[0], canvases: doc.canvases };
}

// ---------------------------------------------------------------- 設定・画面の文

test('シェアの設定と画面の文が、決めたとおりになっている', async () => {
  const { SHARE, SHARE_TEXT } = await loadData();
  assert.equal(SHARE.xIntent, 'https://x.com/intent/post');
  assert.equal(SHARE.fileName, 'neko-wakai.png');
  assert.deepEqual(SHARE.image, { w: 1080, h: 1350 });
  assert.equal(SHARE_TEXT.open, 'シェア');
  assert.equal(SHARE_TEXT.x, 'Xに投稿');
  assert.equal(SHARE_TEXT.save, '画像を保存');
  assert.equal(SHARE_TEXT.copy, 'コピー');
  assert.equal(SHARE_TEXT.close, 'とじる');
  assert.equal(SHARE_TEXT.hint, '画像は長押しでも保存できます');
  assert.deepEqual(SHARE_TEXT.tags, ['#ネコと和解せよ', '#ネコ和解ゲーム']);
  const notices = ['copied', 'copyFailed', 'xFailed', 'imageFailed'].map((k) => SHARE_TEXT[k]);
  for (const s of notices) {
    assert.equal(typeof s, 'string');
    assert.notEqual(s.trim(), '');
  }
  assert.equal(new Set(notices).size, 4, `知らせの文が重なっている: ${notices.join(' / ')}`);
});

// ---------------------------------------------------------------- 1 画像の文

for (const c of CASES) {
  test(`1 画像の文（${c.endingId}）：見出し2行・結果の名前・猫の名前と毛色・ゲームの題名`, async () => {
    const { shareCard } = await loadCard();
    assert.deepEqual(shareCard({ day: c.day, endingId: c.endingId, catName: NAME, coat: c.coat }), {
      headline: c.headline,
      type: c.type,
      nameLine: c.nameLine,
      title: 'ネコと和解せよ',
    });
  });
}

test('1 画像の文：毛色の名前は、どの毛色でも全角のかっこで付く', async () => {
  const { shareCard } = await loadCard();
  const { COAT_LABELS } = await loadData();
  const expected = {
    chatora: 'ネコの名前：もち（茶トラ）',
    kijitora: 'ネコの名前：もち（キジトラ）',
    sabatora: 'ネコの名前：もち（サバトラ）',
    cream: 'ネコの名前：もち（クリーム）',
    shiro: 'ネコの名前：もち（シロ）',
    kuro: 'ネコの名前：もち（クロ）',
  };
  assert.deepEqual(Object.keys(COAT_LABELS).sort(), Object.keys(expected).sort());
  for (const [coat, line] of Object.entries(expected)) {
    assert.equal(shareCard({ day: 4, endingId: 'patient', catName: 'もち', coat }).nameLine, line);
  }
});

for (const c of CASES) {
  test(`1 画像の文（${c.endingId}）：1080×1350 の画像に、すべての文を中央（x=540）にそろえて描く`, async () => {
    const { result, canvas } = await renderShare(c);
    assert.match(result, /^data:image\/png;base64,FAKE\d$/);
    assert.deepEqual(canvas.dataUrls, [{ type: 'image/png', width: 1080, height: 1350 }]);
    assert.equal(result, canvas.toDataURL('image/png'), '仕上げ用の Canvas の data URL でない');
    const drawn = canvas.texts.map((t) => t.text);
    for (const line of [...c.headline, c.type, c.nameLine, 'ネコと和解せよ']) {
      assert.ok(drawn.includes(line), `「${line}」が描かれていない: ${drawn.join(' / ')}`);
    }
    for (const t of canvas.texts) {
      assert.equal(t.align, 'center', `「${t.text}」の textAlign`);
      assert.equal(t.x, 540, `「${t.text}」の x`);
      assert.ok(t.y > 0 && t.y < 1350, `「${t.text}」の y ${t.y} が画像の外`);
    }
  });
}

for (const endingId of ENDING_IDS) {
  test(`1 画像の絵（${endingId}）：結果画面の場面で、切り取りは 360×640 の中に収まる 4:3`, async () => {
    const { shareView } = await loadCard();
    const { view, crop } = shareView(endingId);
    assert.equal(view.scene, 'ending');
    assert.equal(view.endingId, endingId);
    assert.ok(crop.w > 0 && crop.h > 0, `大きさ ${crop.w}×${crop.h}`);
    assert.ok(Math.abs(crop.w / crop.h - 4 / 3) < 0.001, `縦横の比 ${crop.w}:${crop.h}`);
    assert.ok(crop.x >= 0 && crop.y >= 0, `左上 (${crop.x}, ${crop.y})`);
    assert.ok(crop.x + crop.w <= 360, `右端 ${crop.x + crop.w}`);
    assert.ok(crop.y + crop.h <= 640, `下端 ${crop.y + crop.h}`);
    if (endingId === 'visitor') {
      assert.equal(view.cat.mode, 'sit');
      assert.equal(view.catAt.outside, true);
      const { x, y } = view.catAt;
      assert.ok(x <= 80, `猫が窓の中央の枠に重なる（x ${x}）`);
      assert.ok(x >= crop.x && x <= crop.x + crop.w, `猫の x ${x} が切り取りの外`);
      assert.ok(y >= crop.y && y <= crop.y + crop.h, `猫の y ${y} が切り取りの外`);
    } else {
      assert.equal(view.cat.mode, 'lap');
      assert.equal(view.night, true);
    }
  });
}

// ---------------------------------------------------------------- 2 投稿文とタグ

for (const c of CASES) {
  test(`2 投稿文とタグ（${c.endingId}）：見出し・ひとこと・タグの3行`, async () => {
    const { sharePost } = await loadCard();
    assert.equal(sharePost({ day: c.day, endingId: c.endingId }, ''), c.post.join('\n'));
  });
}

// ---------------------------------------------------------------- 3 名前が投稿文・XのURLに入らない

for (const c of CASES) {
  test(`3 猫の名前（${c.endingId}）：名前を持つゲームの状態を渡しても、投稿文と X の URL に名前が入らない`, async () => {
    const { sharePost, xPostUrl } = await loadCard();
    const { createGame } = await import('../src/game/progression.js');
    const game = { ...createGame({ personality: 'amaenbo', seed: 1, coat: c.coat }), day: c.day, catName: NAME };
    const post = sharePost({ ...game, endingId: c.endingId }, URL_SAMPLE);
    assert.equal(post, [...c.post, URL_SAMPLE].join('\n'));
    assert.ok(!post.includes(NAME), `投稿文に名前が入っている: ${post}`);
    const url = xPostUrl(post);
    assert.ok(!url.includes(NAME), `URL に名前が入っている: ${url}`);
    assert.ok(!url.includes(encodeURIComponent(NAME)), `URL に名前が入っている: ${url}`);
    assert.ok(!decodeURIComponent(url).includes(NAME), `URL に名前が入っている: ${decodeURIComponent(url)}`);
  });
}

// ---------------------------------------------------------------- 5 XのURL

test('5 X の URL：改行・#・日本語・記号が、投稿画面に元の文のまま渡る', async () => {
  const { xPostUrl, sharePost } = await loadCard();
  const samples = [
    ...CASES.map((c) => sharePost({ day: c.day, endingId: c.endingId }, URL_SAMPLE)),
    'ネコ & 人 + 100% = 和解？\n#タグ1 #タグ2\nhttps://example.com/?a=1&b=2#top',
  ];
  for (const text of samples) {
    const url = xPostUrl(text);
    assert.ok(url.startsWith('https://x.com/intent/post?text='), url);
    assert.ok(!url.includes('#'), `# がそのまま残っている: ${url}`);
    assert.match(url, /^[\x21-\x7e]+$/, `改行・空白・日本語がそのまま残っている: ${url}`);
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('text'), text);
    assert.deepEqual([...parsed.searchParams.keys()], ['text']);
    assert.equal(parsed.hash, '');
  }
});

// ---------------------------------------------------------------- 6 url の有無

for (const c of CASES) {
  test(`6 URL の有無（${c.endingId}）：空なら3行で終わり、あれば4行目に付く。省略すると設定の URL`, async () => {
    const { sharePost } = await loadCard();
    const { SHARE } = await loadData();
    const result = { day: c.day, endingId: c.endingId };
    const without = sharePost(result, '');
    assert.equal(without.split('\n').length, 3);
    assert.ok(!without.endsWith('\n'), '末尾に改行がある');
    const withUrl = sharePost(result, URL_SAMPLE);
    assert.deepEqual(withUrl.split('\n'), [...c.post, URL_SAMPLE]);
    assert.equal(typeof SHARE.url, 'string');
    assert.equal(sharePost(result), SHARE.url ? [...c.post, SHARE.url].join('\n') : c.post.join('\n'));
  });
}

// ---------------------------------------------------------------- 7 全角10文字の名前

for (const coat of ['chatora', 'kijitora', 'sabatora', 'cream', 'shiro', 'kuro']) {
  test(`7 全角10文字の名前（${coat}）：字の幅が広い書体でも、文字を小さくして 1000 以内に収める`, async () => {
    const { COAT_LABELS } = await loadData();
    const nameLine = `ネコの名前：${LONG_NAME}（${COAT_LABELS[coat]}）`;
    const sizes = [];
    // wide：字の幅の倍率。広い書体では、必ず縮めないと収まらない
    for (const wide of [1, 1.6, 3]) {
      for (const endingId of ['fate', 'visitor']) {
        const { canvas } = await renderShare({ endingId, day: 7, catName: LONG_NAME, coat, wide });
        const line = canvas.texts.find((t) => t.text === nameLine);
        assert.ok(line, `「${nameLine}」が、そのままの1行で描かれていない`);
        assert.ok(line.px > 0, `文字の大きさ ${line.px}px`);
        sizes.push(line.px);
        for (const t of canvas.texts) {
          assert.ok(t.width <= 1000, `倍率 ${wide}・${endingId}：「${t.text}」の幅 ${t.width}（${t.px}px）`);
        }
      }
    }
    assert.ok(sizes.at(-1) < sizes[0], `幅が広いのに文字が小さくなっていない（${sizes[0]}px → ${sizes.at(-1)}px）`);
  });
}

// ---------------------------------------------------------------- シェア画面（sharePanel）

const POST = '投稿文の一行目。\n投稿文の二行目。\n#投稿文のタグ';
const X_URL = 'https://x.com/intent/post?text=test';
const IMAGE = 'data:image/png;base64,PANEL';

// シェア画面を作り、操作する関数を渡す。calls には actions の呼び出しが順に残る
async function withPanel(overrides, run) {
  const { createSharePanel } = await loadPanel();
  const { SHARE, SHARE_TEXT } = await loadData();
  const doc = fakeDocument();
  await withGlobals({ document: doc }, async () => {
    const el = fakeElement('div');
    const calls = [];
    const impl = { openUrl: () => true, save: () => {}, copy: () => Promise.resolve(), ...overrides };
    const actions = {};
    for (const name of ['openUrl', 'save', 'copy']) {
      actions[name] = (...args) => {
        calls.push([name, ...args]);
        return impl[name](...args);
      };
    }
    const panel = createSharePanel({ el, actions });
    const images = { count: 0 };
    const open = (opts = {}) => panel.open({
      makeImage: () => {
        images.count += 1;
        return IMAGE;
      },
      post: POST,
      xUrl: X_URL,
      ...opts,
    });
    await run({ el, panel, calls, images, open, impl, SHARE, SHARE_TEXT });
  });
}

const BUTTONS = { 'share-x': 'Xに投稿', 'share-save': '画像を保存', 'share-copy': 'コピー', 'share-close': 'とじる' };

// ---------------------------------------------------------------- 4 開いただけでは何も起きない

test('4 シェア画面：作った時点では隠れていて、何も起きない', async () => {
  await withPanel({}, async ({ el, panel, calls }) => {
    assert.equal(el.hidden, true);
    assert.equal(panel.isOpen, false);
    await settle();
    assert.deepEqual(calls, []);
  });
});

test('4 シェア画面：開くと画像とボタンが出るが、投稿・保存・コピーはどれも起きない', async () => {
  await withPanel({}, async ({ el, panel, calls, images, open, SHARE_TEXT }) => {
    open();
    await settle();
    assert.deepEqual(calls, [], '開いただけで動いている');
    assert.equal(images.count, 1, '画像を作る回数');
    assert.equal(el.hidden, false);
    assert.equal(panel.isOpen, true);
    const img = one(el, 'share-image');
    assert.equal(img.tagName, 'IMG');
    assert.equal(img.src, IMAGE);
    assert.equal(isShown(img), true);
    for (const [cls, text] of Object.entries(BUTTONS)) {
      const b = one(el, cls);
      assert.equal(b.tagName, 'BUTTON', cls);
      assert.equal(b.textContent, text, cls);
      assert.equal(b.disabled, false, cls);
      assert.equal(isShown(b), true, cls);
    }
    assert.equal(textOf(one(el, 'share-hint')), '画像は長押しでも保存できます');
    assert.equal(shown(el, 'share-hint').length, 1);
    assert.equal(statusText(el), '');
    const all = textOf(el);
    assert.ok(!all.includes(SHARE_TEXT.imageFailed), '画像があるのに、作れなかった知らせが出ている');
    // 投稿文は画面に出さない
    for (const line of POST.split('\n')) assert.ok(!all.includes(line), `投稿文「${line}」が画面に出ている`);
    for (const n of findAll(el, (x) => x.value)) assert.ok(!String(n.value).includes('投稿文'), '投稿文が入力欄に出ている');
  });
});

for (const [cls, expected] of [
  ['share-x', ['openUrl', X_URL]],
  ['share-save', ['save', IMAGE, 'neko-wakai.png']],
  ['share-copy', ['copy', POST]],
]) {
  test(`4 シェア画面：${cls} を押した回数だけ、対応する1つだけが動く`, async () => {
    await withPanel({}, async ({ el, calls, images, open }) => {
      open();
      press(el, cls);
      await settle();
      assert.deepEqual(calls, [expected]);
      press(el, cls);
      await settle();
      assert.deepEqual(calls, [expected, expected]);
      assert.equal(images.count, 1, '画像を作り直している');
    });
  });
}

test('4 シェア画面：「とじる」では、投稿・保存・コピーのどれも起きない', async () => {
  await withPanel({}, async ({ el, calls, open }) => {
    open();
    press(el, 'share-close');
    await settle();
    assert.deepEqual(calls, []);
    assert.equal(el.hidden, true);
  });
});

// ---------------------------------------------------------------- 8 とじる→もう一度開ける

for (const how of ['「とじる」ボタン', 'close()']) {
  test(`8 シェア画面：${how}で閉じて、もう一度開ける。前の知らせ・画像・投稿文は残らない`, async () => {
    await withPanel({}, async ({ el, panel, calls, open, SHARE_TEXT }) => {
      open();
      press(el, 'share-copy');
      await settle();
      assert.equal(statusText(el), SHARE_TEXT.copied);
      calls.length = 0;

      if (how === 'close()') panel.close();
      else press(el, 'share-close');
      assert.equal(el.hidden, true);
      assert.equal(panel.isOpen, false);

      let made = 0;
      open({
        makeImage: () => {
          made += 1;
          return 'data:image/png;base64,SECOND';
        },
        post: '二回目の文',
        xUrl: 'https://x.com/intent/post?text=second',
      });
      assert.equal(el.hidden, false);
      assert.equal(panel.isOpen, true);
      assert.equal(made, 1);
      assert.equal(statusText(el), '', '前の知らせが残っている');
      assert.equal(one(el, 'share-image').src, 'data:image/png;base64,SECOND');
      press(el, 'share-x');
      press(el, 'share-save');
      press(el, 'share-copy');
      await settle();
      assert.deepEqual(calls, [
        ['openUrl', 'https://x.com/intent/post?text=second'],
        ['save', 'data:image/png;base64,SECOND', 'neko-wakai.png'],
        ['copy', '二回目の文'],
      ]);
      press(el, 'share-close');
      assert.equal(el.hidden, true);
      assert.equal(panel.isOpen, false);
    });
  });
}

for (const end of ['成功', '拒否']) {
  test(`8 シェア画面：閉じたあとにコピーが終わっても（${end}）エラーにならず、次に開いたとき知らせは出ていない`, async () => {
    const d = deferred();
    await withPanel({ copy: () => d.promise }, async ({ el, panel, calls, open }) => {
      open();
      press(el, 'share-copy');
      press(el, 'share-close');
      if (end === '成功') d.resolve();
      else d.reject(new Error('NotAllowedError'));
      await settle();
      assert.equal(el.hidden, true);
      assert.equal(panel.isOpen, false);
      assert.deepEqual(calls, [['copy', POST]]);
      open();
      assert.equal(el.hidden, false);
      assert.equal(statusText(el), '');
    });
  });
}

// ---------------------------------------------------------------- 9 コピー拒否・Xを開けない

for (const [label, fail] of [
  ['拒否されたとき', () => Promise.reject(new Error('NotAllowedError'))],
  ['その場で例外のとき', () => { throw new Error('clipboard がない'); }],
]) {
  test(`9 コピーが${label}：知らせが出て、もう一度押すとコピーできる`, async () => {
    await withPanel({ copy: fail }, async ({ el, calls, open, impl, SHARE_TEXT }) => {
      open();
      press(el, 'share-copy');
      await settle();
      assert.equal(statusText(el), SHARE_TEXT.copyFailed);
      impl.copy = () => Promise.resolve();
      press(el, 'share-copy');
      await settle();
      assert.equal(statusText(el), SHARE_TEXT.copied);
      assert.deepEqual(calls, [['copy', POST], ['copy', POST]]);
    });
  });
}

test('9 コピーの結果が出るまでの連打は無視し、終わったらまた押せる', async () => {
  let d = deferred();
  await withPanel({ copy: () => d.promise }, async ({ el, calls, open, SHARE_TEXT }) => {
    open();
    press(el, 'share-copy');
    press(el, 'share-copy');
    await settle();
    press(el, 'share-copy');
    assert.equal(calls.length, 1, `結果が出る前に ${calls.length} 回コピーしている`);
    assert.notEqual(statusText(el), SHARE_TEXT.copied, '終わる前に「コピーした」と出ている');
    d.resolve();
    await settle();
    assert.equal(statusText(el), SHARE_TEXT.copied);

    d = deferred();
    press(el, 'share-copy');
    assert.equal(calls.length, 2, '終わったあとに押しても動かない');
    d.resolve();
    await settle();
    assert.equal(statusText(el), SHARE_TEXT.copied);
  });
});

for (const [label, fail] of [
  ['X を開けなかった（false）とき', () => false],
  ['X を開こうとして例外のとき', () => { throw new Error('window.open できない'); }],
]) {
  test(`9 ${label}：知らせが出て、もう一度押せる。ほかのボタンも使える`, async () => {
    await withPanel({ openUrl: fail }, async ({ el, panel, calls, open, impl, SHARE_TEXT }) => {
      open();
      press(el, 'share-x');
      assert.equal(statusText(el), SHARE_TEXT.xFailed);
      assert.equal(panel.isOpen, true);
      impl.openUrl = () => true;
      press(el, 'share-x');
      press(el, 'share-copy');
      await settle();
      assert.deepEqual(calls, [['openUrl', X_URL], ['openUrl', X_URL], ['copy', POST]]);
      assert.equal(statusText(el), SHARE_TEXT.copied);
      press(el, 'share-close');
      assert.equal(el.hidden, true);
    });
  });
}

test('9 保存で例外が起きても落ちず、知らせが出て、ほかのボタンは使える', async () => {
  await withPanel({ save: () => { throw new Error('保存できない'); } }, async ({ el, panel, calls, open, SHARE_TEXT }) => {
    open();
    press(el, 'share-save');
    assert.notEqual(statusText(el).trim(), '', '知らせが出ていない');
    assert.equal(panel.isOpen, true);
    press(el, 'share-save');
    press(el, 'share-copy');
    await settle();
    assert.equal(statusText(el), SHARE_TEXT.copied);
    assert.deepEqual(calls, [['save', IMAGE, 'neko-wakai.png'], ['save', IMAGE, 'neko-wakai.png'], ['copy', POST]]);
  });
});

// ---------------------------------------------------------------- 10 画像を作れないとき

for (const [label, makeImage] of [
  ['作れない（null）とき', () => null],
  ['作る途中で例外のとき', () => { throw new Error('画像を作れない'); }],
]) {
  test(`10 シェア画面：画像を${label}：知らせが出て「画像を保存」だけ使えず、ほかのボタンは使える`, async () => {
    await withPanel({}, async ({ el, panel, calls, open, SHARE_TEXT }) => {
      let made = 0;
      open({
        makeImage: () => {
          made += 1;
          return makeImage();
        },
      });
      assert.equal(made, 1, '画像を作る回数');
      assert.equal(el.hidden, false);
      assert.equal(panel.isOpen, true);
      assert.equal(shown(el, 'share-image').length, 0, '画像がないのに img が出ている');
      assert.equal(shown(el, 'share-hint').length, 0, '画像がないのに長押しの案内が出ている');
      assert.deepEqual(shown(el, 'share-noimage').map(textOf), [SHARE_TEXT.imageFailed]);
      const save = one(el, 'share-save');
      assert.equal(save.disabled, true);
      // disabled を無視して click が届いても、保存しない
      save.fire('click');
      assert.deepEqual(calls, []);
      press(el, 'share-x');
      assert.deepEqual(calls, [['openUrl', X_URL]]);
      press(el, 'share-copy');
      await settle();
      assert.deepEqual(calls, [['openUrl', X_URL], ['copy', POST]]);
      assert.equal(statusText(el), SHARE_TEXT.copied);
      press(el, 'share-close');
      assert.equal(el.hidden, true);
      assert.equal(panel.isOpen, false);
    });
  });
}

// 画像を作る側：どこで失敗しても null（例外を外に出さない）
for (const [label, broken] of [
  ['document.createElement が例外', () => ({ createElement: () => { throw new Error('作れない'); } })],
  ['getContext がどれも null', () => fakeDocument(() => ({ context: false }))],
  ['1枚目の getContext だけ null', () => fakeDocument((i) => ({ context: i !== 0 }))],
  ['2枚目の getContext だけ null', () => fakeDocument((i) => ({ context: i !== 1 }))],
  ['toDataURL が例外', () => fakeDocument(() => ({ toDataURLThrows: true }))],
]) {
  test(`10 画像を作れない（${label}）：null を返す`, async () => {
    const { shareCard, shareView } = await loadCard();
    const { createShareImage } = await loadImage();
    const args = {
      card: shareCard({ day: 3, endingId: 'fate', catName: NAME, coat: 'kuro' }),
      shot: shareView('fate'),
      coat: 'kuro',
      face: { shape: 'maru', ears: 'big' },
      personality: 'bibiri',
    };
    const good = await withGlobals({ document: fakeDocument() }, () => createShareImage(args));
    assert.match(good, /^data:image\/png;base64,FAKE\d$/, '壊れていないときに作れていない');
    const result = await withGlobals({ document: broken() }, () => createShareImage(args));
    assert.equal(result, null);
  });
}

// ---------------------------------------------------------------- 11 ゲーム側の描画に影響しない

for (const [label, gameView] of [
  ['昼', { scene: 'day', cat: { mode: 'relax', distance: 40, walking: true }, dayTime: 0.4 }],
  ['和解の結果画面', { scene: 'ending', endingId: 'fate', cat: { mode: 'lap', distance: 0 }, lapTime: 8, night: true }],
  ['通い猫の結果画面', { scene: 'ending', endingId: 'visitor', cat: { mode: 'sit', distance: 100 }, catAt: { x: 100, y: 326, s: 0.42, outside: true }, dayTime: 0.05 }],
]) {
  test(`11 ${label}を描いている途中で画像を作っても、ゲームの猫の色・顔・位置と、そのあとの絵は変わらない`, async () => {
    const { shareCard, shareView } = await loadCard();
    const { createShareImage } = await loadImage();
    const { createRenderer, COATS } = await import('../src/render/renderer.js');
    const view = { ...gameView, coat: 'chatora', face: { shape: 'maru', ears: 'small' }, personality: 'amaenbo', wariness: 0 };
    const DT = 0.05;

    async function play(withShare) {
      const doc = fakeDocument();
      return withGlobals({ document: doc }, () => {
        const stage = recordingCanvas();
        const A = createRenderer(stage);
        let t = 1;
        const frames = (n) => {
          for (let i = 0; i < n; i++) A.draw(view, (t += DT), DT);
        };
        frames(10);
        const before = structuredClone({ cat: A.shownCat(), at: A.shownPosition() });
        const logged = stage.log.length;
        if (withShare) {
          for (const endingId of ['patient', 'visitor']) {
            const made = createShareImage({
              card: shareCard({ day: 5, endingId, catName: NAME, coat: 'kuro' }),
              shot: shareView(endingId),
              coat: 'kuro',
              face: { shape: 'hoppe', ears: 'big' },
              personality: 'bibiri',
            });
            assert.match(made, /^data:image\/png;base64,FAKE\d$/, `${endingId}：画像を作れていない`);
          }
          // 部屋と猫を描いた Canvas（data URL にしていないほう）の色
          const colors = doc.canvases.filter((c) => c.dataUrls.length === 0).flatMap((c) => c.fills);
          assert.ok(colors.includes(COATS.kuro.fur), '画像に、渡した毛色の猫が描かれていない');
          assert.ok(!colors.includes(COATS.chatora.fur), '画像に、ゲーム側の毛色の猫が描かれている');
        }
        assert.equal(stage.log.length, logged, 'ゲームの Canvas に描いている');
        assert.deepEqual({ cat: A.shownCat(), at: A.shownPosition() }, before, '画像を作った直後の猫');
        frames(10);
        assert.ok(stage.fills.includes(COATS.chatora.fur), 'ゲームの猫が描かれていない');
        return { log: stage.log.slice(logged), fills: stage.fills, cat: structuredClone(A.shownCat()), at: structuredClone(A.shownPosition()) };
      });
    }

    const random = Math.random;
    Math.random = () => 0.5;
    try {
      const plain = await play(false);
      const shared = await play(true);
      assert.equal(shared.cat.coat, 'chatora');
      assert.deepEqual(shared.cat.face, { shape: 'maru', ears: 'small' });
      assert.deepEqual(shared.cat, plain.cat);
      assert.deepEqual(shared.at, plain.at);
      assert.deepEqual(shared.fills, plain.fills, '塗った色');
      assert.deepEqual(shared.log, plain.log, '描画命令');
    } finally {
      Math.random = random;
    }
  });
}

// ---------------------------------------------------------------- 結果画面（endingScene）

// 結果画面を作り、操作する関数を渡す。makeShareImage に undefined を渡すと、既定のまま（createShareImage）にする
async function withEnding({ c = CASES[0], makeShareImage, documentOptions }, run) {
  const { createEndingScene } = await import('../src/scenes/endingScene.js');
  const { createGame } = await import('../src/game/progression.js');
  const { SHARE_TEXT } = await loadData();
  const doc = fakeDocument(documentOptions);
  await withGlobals({ document: doc }, async () => {
    const screenEl = fakeElement('div');
    const calls = [];
    const made = [];
    const retries = { count: 0 };
    const game = { ...createGame({ personality: 'tsundere', seed: 1, coat: c.coat, face: { shape: 'hoppe', ears: 'big' } }), day: c.day, catName: NAME };
    const opts = {
      screenEl,
      session: { game },
      endingId: c.endingId,
      onRetry: () => { retries.count += 1; },
      shareActions: {
        openUrl: (...a) => { calls.push(['openUrl', ...a]); return true; },
        save: (...a) => { calls.push(['save', ...a]); },
        copy: (...a) => { calls.push(['copy', ...a]); return Promise.resolve(); },
      },
    };
    if (makeShareImage) {
      opts.makeShareImage = (arg) => {
        made.push(arg);
        return makeShareImage(arg);
      };
    }
    createEndingScene(opts);
    await run({ screenEl, calls, made, retries, game, doc, SHARE_TEXT });
  });
}

test('4 結果画面：「シェア」「もう一度あそぶ」の順に並び、押すまで画像も作らず何も起きない', async () => {
  await withEnding({ makeShareImage: () => IMAGE }, async ({ screenEl, calls, made, retries }) => {
    const box = one(screenEl, 'end-buttons');
    const buttons = box.children.filter((n) => n.tagName === 'BUTTON');
    assert.deepEqual(buttons.map((b) => b.textContent), ['シェア', 'もう一度あそぶ']);
    assert.ok(classes(buttons[0]).includes('share-open'), buttons[0].className);
    assert.ok(classes(buttons[1]).includes('retry'), buttons[1].className);
    await settle();
    assert.equal(made.length, 0, '押す前に画像を作っている');
    assert.deepEqual(calls, []);
    assert.equal(retries.count, 0);
    assert.equal(shown(screenEl, 'share').length, 0, '押す前にシェア画面が出ている');
  });
});

for (const c of CASES) {
  test(`4 結果画面（${c.endingId}）：「シェア」で画像が1回作られて画面が開き、ボタンを押すまで投稿・保存・コピーは起きない`, async () => {
    const { shareCard, shareView } = await loadCard();
    await withEnding({ c, makeShareImage: () => IMAGE }, async ({ screenEl, calls, made, retries, game }) => {
      press(screenEl, 'share-open');
      await settle();
      assert.equal(made.length, 1);
      assert.deepEqual(made[0], {
        card: shareCard({ day: c.day, endingId: c.endingId, catName: NAME, coat: c.coat }),
        shot: shareView(c.endingId),
        coat: c.coat,
        face: { shape: 'hoppe', ears: 'big' },
        personality: game.personality,
      });
      const panel = one(screenEl, 'share');
      assert.equal(panel.parent, screenEl, 'シェア画面が screenEl の直下にない');
      assert.equal(panel.hidden, false);
      assert.equal(one(panel, 'share-image').src, IMAGE);
      assert.deepEqual(calls, []);
      assert.equal(retries.count, 0);
      press(panel, 'share-save');
      assert.deepEqual(calls, [['save', IMAGE, 'neko-wakai.png']]);
    });
  });

  test(`3 結果画面（${c.endingId}）：X に渡す URL とコピーする文は投稿文と同じで、猫の名前を含まない`, async () => {
    const { sharePost, xPostUrl } = await loadCard();
    await withEnding({ c, makeShareImage: () => IMAGE }, async ({ screenEl, calls }) => {
      press(screenEl, 'share-open');
      press(screenEl, 'share-x');
      press(screenEl, 'share-copy');
      await settle();
      const post = sharePost({ day: c.day, endingId: c.endingId });
      assert.deepEqual(calls, [['openUrl', xPostUrl(post)], ['copy', post]]);
      assert.ok(post.startsWith(c.post.join('\n')), post);
      const [, url] = calls[0];
      assert.ok(!decodeURIComponent(url).includes(NAME), `URL に名前が入っている: ${url}`);
      assert.ok(!calls[1][1].includes(NAME), `コピーする文に名前が入っている: ${calls[1][1]}`);
    });
  });
}

test('1 結果画面：画像の作り方を渡さなければ、シェア画像（名前・毛色入り）を作って出す', async () => {
  const c = CASES[1];
  await withEnding({ c }, async ({ screenEl, doc }) => {
    assert.equal(doc.canvases.length, 0, '押す前に Canvas を作っている');
    press(screenEl, 'share-open');
    const finals = doc.canvases.filter((x) => x.dataUrls.length);
    assert.equal(finals.length, 1);
    assert.equal(one(screenEl, 'share-image').src, finals[0].toDataURL('image/png'));
    assert.ok(finals[0].texts.some((t) => t.text === c.nameLine), `「${c.nameLine}」が描かれていない`);
  });
});

test('8 結果画面：シェア画面を閉じて、もう一度開ける。閉じたあとも「もう一度あそぶ」が1回効く', async () => {
  await withEnding({ makeShareImage: () => IMAGE }, async ({ screenEl, calls, made, retries }) => {
    for (const times of [1, 2]) {
      press(screenEl, 'share-open');
      assert.equal(shown(screenEl, 'share').length, 1, `${times}回目：開いていない`);
      assert.equal(made.length, times);
      press(screenEl, 'share-close');
      assert.equal(shown(screenEl, 'share').length, 0, `${times}回目：閉じていない`);
    }
    assert.deepEqual(calls, []);
    assert.equal(retries.count, 0);
    press(screenEl, 'retry');
    assert.equal(retries.count, 1);
  });
});

for (const [label, setup] of [
  ['画像を作る途中で例外のとき', { makeShareImage: () => { throw new Error('画像を作れない'); } }],
  ['画像が null のとき', { makeShareImage: () => null }],
  ['既定の画像の作り方で Canvas が使えないとき', { documentOptions: () => ({ context: false }) }],
]) {
  test(`10 結果画面：${label}も、X・コピーは使えて、閉じたあと「もう一度あそぶ」が効く`, async () => {
    const { sharePost, xPostUrl } = await loadCard();
    const c = CASES[3];
    await withEnding({ c, ...setup }, async ({ screenEl, calls, retries, SHARE_TEXT }) => {
      press(screenEl, 'share-open');
      assert.equal(shown(screenEl, 'share').length, 1, 'シェア画面が開いていない');
      assert.deepEqual(shown(screenEl, 'share-noimage').map(textOf), [SHARE_TEXT.imageFailed]);
      assert.equal(one(screenEl, 'share-save').disabled, true);
      press(screenEl, 'share-x');
      press(screenEl, 'share-copy');
      await settle();
      const post = sharePost({ day: c.day, endingId: c.endingId });
      assert.deepEqual(calls, [['openUrl', xPostUrl(post)], ['copy', post]]);
      press(screenEl, 'share-close');
      assert.equal(shown(screenEl, 'share').length, 0);
      assert.equal(retries.count, 0);
      press(screenEl, 'retry');
      assert.equal(retries.count, 1);
    });
  });
}

// ---------------------------------------------------------------- レビューの指摘の再現

test('レビュー：シェア画面を開いている間は、後ろの結果画面を操作できず、フォーカスは「とじる」に移る。閉じると「シェア」に戻る', async () => {
  await withEnding({ makeShareImage: () => IMAGE }, async ({ screenEl }) => {
    const back = one(screenEl, 'ending-screen');
    const shareBtn = one(screenEl, 'share-open');
    const focused = [];
    shareBtn.focus = () => focused.push('share-open');
    const create = globalThis.document.createElement;
    globalThis.document.createElement = (tag) => {
      const node = create.call(globalThis.document, tag);
      node.focus = () => focused.push(node.className);
      return node;
    };
    press(screenEl, 'share-open');
    assert.equal(back.inert, true, '後ろの結果画面が操作できる');
    assert.deepEqual(focused, ['share-close']);
    press(screenEl, 'share-close');
    assert.equal(back.inert, false, '閉じても結果画面が操作できない');
    assert.deepEqual(focused, ['share-close', 'share-open']);
  });
});

// ブラウザの実装（actions を渡さない）で開く
async function withBrowserPanel(globals, run) {
  const { createSharePanel } = await loadPanel();
  const { SHARE, SHARE_TEXT } = await loadData();
  const doc = fakeDocument();
  doc.body = fakeElement('body');
  await withGlobals({ document: doc, ...globals }, async () => {
    const el = fakeElement('div');
    createSharePanel({ el }).open({ makeImage: () => IMAGE, post: POST, xUrl: X_URL });
    await run({ el, doc, SHARE, SHARE_TEXT });
  });
}

test('レビュー：ブラウザの実装でも、開いただけでは何も起きず、「Xに投稿」は新しいタブを1回だけ開いて opener を切る', async () => {
  const opened = [];
  const tab = { opener: 'game' };
  await withBrowserPanel({ window: { open: (...a) => { opened.push(a); return tab; } } }, async ({ el }) => {
    assert.deepEqual(opened, []);
    press(el, 'share-x');
    assert.deepEqual(opened, [[X_URL, '_blank']]);
    assert.equal(tab.opener, null);
    assert.equal(statusText(el), '');
  });
});

test('レビュー：タブが開けたら、opener を切れなくても失敗と知らせない。開けなければ（null）知らせる', async () => {
  const tab = Object.defineProperty({}, 'opener', { set() { throw new Error('切れない'); } });
  await withBrowserPanel({ window: { open: () => tab } }, async ({ el }) => {
    press(el, 'share-x');
    assert.equal(statusText(el), '', '開けたのに知らせが出た');
  });
  await withBrowserPanel({ window: { open: () => null } }, async ({ el, SHARE_TEXT }) => {
    press(el, 'share-x');
    assert.equal(statusText(el), SHARE_TEXT.xFailed);
  });
});

test('レビュー：ブラウザの実装の「画像を保存」は、ファイル名付きのリンクを1回だけ押して片付け、保存できないときの手も知らせる', async () => {
  await withBrowserPanel({}, async ({ el, doc, SHARE, SHARE_TEXT }) => {
    const clicked = [];
    const create = doc.createElement;
    doc.createElement = (tag) => {
      const node = create.call(doc, tag);
      node.click = () => clicked.push([node.tagName, node.href, node.download]);
      return node;
    };
    press(el, 'share-save');
    assert.deepEqual(clicked, [['A', IMAGE, SHARE.fileName]]);
    assert.equal(doc.body.children.length, 0, 'リンクが残っている');
    assert.ok(SHARE_TEXT.saved, '知らせの文がない');
    assert.equal(statusText(el), SHARE_TEXT.saved);
  });
});

test('レビュー：ブラウザの実装の「コピー」は投稿文を写す。クリップボードが使えなければ失敗を知らせる', async () => {
  const copied = [];
  await withBrowserPanel({ navigator: { clipboard: { writeText: async (t) => { copied.push(t); } } } }, async ({ el, SHARE_TEXT }) => {
    press(el, 'share-copy');
    await settle();
    assert.deepEqual(copied, [POST]);
    assert.equal(statusText(el), SHARE_TEXT.copied);
  });
  await withBrowserPanel({ navigator: {} }, async ({ el, SHARE_TEXT }) => {
    press(el, 'share-copy');
    await settle();
    assert.equal(statusText(el), SHARE_TEXT.copyFailed);
  });
});

test('レビュー：画像を作り終えたら、部屋と猫を描いた Canvas の大きさを 0 に戻す（メモリを残さない）', async () => {
  const { shareCard, shareView } = await loadCard();
  const { createShareImage } = await loadImage();
  const doc = fakeDocument();
  const made = [];
  const create = doc.createElement;
  doc.createElement = (tag) => {
    const node = create.call(doc, tag);
    if (String(tag).toLowerCase() === 'canvas') made.push(node);
    return node;
  };
  await withGlobals({ document: doc }, async () => {
    const c = CASES[0];
    assert.ok(createShareImage({ card: shareCard({ ...c, catName: NAME }), shot: shareView(c.endingId), coat: c.coat, face: { shape: 'maru', ears: 'big' }, personality: 'amaenbo' }));
  });
  const rest = made.filter((n) => !(n.width === 1080 && n.height === 1350));
  assert.ok(rest.length > 0, '部屋と猫を描く Canvas がない');
  for (const n of rest) assert.deepEqual([n.width, n.height], [0, 0]);
});
