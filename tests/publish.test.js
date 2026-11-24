import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

// 公開の準備のテスト（デバッグパネルを既定で出さない・リンク用の情報・OGP 画像とアイコン・「カカカ」の位置）。
// まだ無いもの（OGP・ogp.png など）でファイル全体が読めなくならないよう、対象はテストの中で読み込む

const PAGE_URL = 'https://sakuichi.github.io/neko-wakai/';
const PAGE_TITLE = 'ネコと和解せよ 〜猫が来るまでの7日間〜';
const PAGE_DESCRIPTION = '膝に乗ってくれるまで、7日間。ネコのサインを読みとって、少しずつ仲良くなって、ネコと和解せよ。すぐに遊べるブラウザゲーム。';

const fileUrl = (path) => new URL(`../${path}`, import.meta.url);
function readText(path) {
  assert.ok(existsSync(fileUrl(path)), `${path} がない`);
  return readFileSync(fileUrl(path), 'utf8');
}

// ---------------------------------------------------------------- 1〜3 デバッグパネル（ゲーム全体を動かす）

// className に cls を持つ要素を、子孫から集める
function byClass(node, cls) {
  const out = [];
  for (const c of node.children ?? []) {
    if (typeof c !== 'object') continue;
    if (String(c.className).split(/\s+/).includes(cls)) out.push(c);
    out.push(...byClass(c, cls));
  }
  return out;
}

// 生成する game.js と同じもの（bundle()）を、偽の画面で、アドレスの後ろ（search）を付けて起動する（tests/story.test.js の bootGame と同じ作り）
async function bootAt(search) {
  const { bundle } = await import('../tools/build.js');
  const noop = () => {};
  const ctx2d = new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : k === 'measureText' ? () => ({ width: 0 }) : k === 'getImageData' ? () => ({ data: [] }) : () => ctx2d),
  });
  const byId = {};
  function el(tag) {
    const found = {};
    const node = {
      tag, className: '', textContent: '', innerHTML: '', value: '', hidden: false, children: [], parentElement: null, dataset: {},
      style: { setProperty: noop, removeProperty: noop },
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      width: 360, height: 640, clientWidth: 360, clientHeight: 640, offsetWidth: 100, scrollWidth: 100,
      getContext: () => ctx2d,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 640 }),
      setAttribute: noop, removeAttribute: noop, focus: noop, blur: noop, animate: () => ({ cancel: noop }),
      addEventListener: noop, removeEventListener: noop,
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
      querySelector: (sel) => (found[sel] ??= el(sel)),
      querySelectorAll: () => [],
      closest: () => null,
    };
    return node;
  }
  const root = el('div');
  const get = (id) => {
    if (!byId[id]) root.append((byId[id] = el(id)));
    return byId[id];
  };
  const store = {};
  let queue = [];
  const win = { addEventListener: noop, devicePixelRatio: 1, innerWidth: 400 };
  assert.doesNotThrow(() => vm.runInNewContext(bundle(), {
    window: win, console, URLSearchParams, performance: { now: () => 0 }, location: { search }, navigator: {},
    document: { getElementById: get, createElement: el, addEventListener: noop, hidden: false, body: root },
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    Option: function Option(text, value) { return Object.assign(el('option'), { textContent: text, value }); },
    Path2D: function Path2D() { return ctx2d; },
    requestAnimationFrame: (fn) => queue.push(fn), setTimeout: noop, clearTimeout: noop,
  }), `「${search}」で起動すると例外が出る`);
  // 1秒動かす（デバッグパネルの数値の更新も通る）
  let now = 0;
  assert.doesNotThrow(() => {
    for (let i = 0; i < 20; i++) {
      now += 50;
      const fns = queue;
      queue = [];
      for (const fn of fns) fn(now);
    }
  }, `「${search}」で起動して1秒動かすと例外が出る`);
  assert.equal(now, 1000);
  assert.equal(queue.length, 1, '1秒後も、次のフレームを待っている');
  assert.equal(byClass(get('screen'), 'title-screen').length, 1, `「${search}」で起動して、タイトル画面が出ていない`);
  return { debug: get('debug') };
}

// #debug の中が空（CSS の #debug:empty が効く）
function assertNoPanel(debug, search) {
  assert.deepEqual(debug.children.map((c) => c.tag ?? c), [], `「${search}」で #debug に要素が入っている`);
  assert.equal(debug.textContent, '', `「${search}」で #debug に文字が入っている`);
  assert.equal(debug.innerHTML, '', `「${search}」で #debug に HTML が入っている`);
}

test('1 デバッグパネル：指定なしで起動すると、例外なくタイトルが出て、#debug には何も作らない', async () => {
  const { debug } = await bootAt('');
  assertNoPanel(debug, '');
});

for (const search of ['?debug=1', '?a=1&debug=1']) {
  test(`2 デバッグパネル：「${search}」で起動すると、#debug にパネル（details）が1つ出る`, async () => {
    const { debug } = await bootAt(search);
    assert.deepEqual(debug.children.map((c) => c.tag), ['details']);
    const summary = debug.children[0].children.find((c) => c.tag === 'summary');
    assert.equal(summary?.textContent, 'DEBUG');
  });
}

for (const search of ['?debug=0', '?debug', '?debug=', '?debugger=1', '?debug=11']) {
  test(`3 デバッグパネル：「${search}」では、#debug に何も作らない`, async () => {
    const { debug } = await bootAt(search);
    assertNoPanel(debug, search);
  });
}

// ---------------------------------------------------------------- 4 空のパネルの枠

test('4 空のパネル：style.css に「#debug が空なら隠す」指定があり、index.html の #debug は中身が空（空白もない）', () => {
  const css = readText('style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = css.match(/(?:^|\})\s*#debug:empty\s*\{([^}]*)\}/);
  assert.ok(rule, 'style.css に #debug:empty の指定がない');
  assert.match(rule[1], /(?:^|;)\s*display\s*:\s*none\s*(?:!important\s*)?(?:;|$)/, `#debug:empty が display: none でない: ${rule[1]}`);
  assert.match(readText('index.html'), /<aside id="debug"><\/aside>/, 'index.html の #debug が空でない（:empty にあたらない）');
});

// ---------------------------------------------------------------- 5・7 シェアの文とリンク

const ENDING_IDS = ['fate', 'patient', 'persistent', 'visitor'];
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

async function loadShare() {
  const { SHARE } = await import('../src/data/params.js');
  const { ENDINGS } = await import('../src/data/texts.js');
  const { sharePost, xPostUrl } = await import('../src/game/shareCard.js');
  assert.deepEqual(Object.keys(ENDINGS).sort(), [...ENDING_IDS].sort(), 'エンディングの種類（このテストの前提）');
  return { SHARE, sharePost, xPostUrl };
}

test('5 シェア：全エンディング×全日数の投稿文と X の URL に「debug」が入らない', async () => {
  const { sharePost, xPostUrl } = await loadShare();
  for (const endingId of ENDING_IDS) {
    for (const day of ALL_DAYS) {
      const post = sharePost({ day, endingId });
      const url = xPostUrl(post);
      for (const s of [post, url, decodeURIComponent(url)]) {
        assert.doesNotMatch(s, /debug/i, `${endingId}・${day}日目: ${s}`);
      }
    }
  }
});

test('5 シェア：SHARE.url は公開ページの URL で、クエリ（?）もハッシュ（#）もない', async () => {
  const { SHARE } = await loadShare();
  assert.equal(SHARE.url, PAGE_URL);
  assert.doesNotMatch(SHARE.url, /[?#]/);
  const u = new URL(SHARE.url);
  assert.equal(u.search, '');
  assert.equal(u.hash, '');
});

test('7 シェア：og:url と SHARE.url が同じで、全エンディング×全日数の投稿文の最後の行が SHARE.url（空でない）', async () => {
  const { SHARE, sharePost } = await loadShare();
  assert.notEqual(SHARE.url, '', 'SHARE.url が空');
  assert.deepEqual(metaContents('property', 'og:url'), [SHARE.url]);
  for (const endingId of ENDING_IDS) {
    for (const day of ALL_DAYS) {
      const lines = sharePost({ day, endingId }).split('\n');
      assert.equal(lines.at(-1), SHARE.url, `${endingId}・${day}日目`);
    }
  }
});

// ---------------------------------------------------------------- 6 リンク用の情報（index.html）

function head() {
  const m = readText('index.html').replace(/<!--[\s\S]*?-->/g, '').match(/<head>([\s\S]*?)<\/head>/);
  assert.ok(m, 'index.html に <head> がない');
  return m[1];
}

// <head> の中の tag の属性を { 名前: 値 } にして並べる
function headTags(tag) {
  return [...head().matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'g'))].map(([, attrs]) =>
    Object.fromEntries([...attrs.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map(([, name, value]) => [name, value])));
}

// attr（name か property）が key の meta の content
const metaContents = (attr, key) => headTags('meta').filter((m) => m[attr] === key).map((m) => m.content);

test('6 リンク用の情報：<title> は今のまま、description は決めた文', () => {
  assert.deepEqual([...head().matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]), [PAGE_TITLE]);
  assert.deepEqual(metaContents('name', 'description'), [PAGE_DESCRIPTION]);
});

for (const [key, value] of [
  ['og:type', 'website'],
  ['og:title', PAGE_TITLE],
  ['og:description', PAGE_DESCRIPTION],
  ['og:url', PAGE_URL],
  ['og:image', `${PAGE_URL}ogp.png`],
  ['og:image:width', '1200'],
  ['og:image:height', '630'],
  ['og:locale', 'ja_JP'],
]) {
  test(`6 リンク用の情報：${key}（property）が1つだけあり、${value}`, () => {
    assert.deepEqual(metaContents('property', key), [value]);
  });
}

for (const key of ['og:image:alt', 'og:site_name']) {
  test(`6 リンク用の情報：${key}（property）が1つだけあり、空でない`, () => {
    const list = metaContents('property', key);
    assert.equal(list.length, 1, `${key} が ${list.length} 個`);
    assert.notEqual(String(list[0] ?? '').trim(), '', `${key} が空`);
  });
}

test('6 リンク用の情報：twitter:card（name）は summary_large_image', () => {
  assert.deepEqual(metaContents('name', 'twitter:card'), ['summary_large_image']);
});

test('6 リンク用の情報：og:image と og:url は https:// で始まる', () => {
  for (const key of ['og:image', 'og:url']) {
    const list = metaContents('property', key);
    assert.equal(list.length, 1, `${key} が ${list.length} 個`);
    assert.ok(list[0].startsWith('https://'), `${key}: ${list[0]}`);
  }
});

// ---------------------------------------------------------------- 8・12 OGP 画像とアイコン

// PNG のヘッダ（シグネチャと IHDR）から大きさを読む
function pngSize(path) {
  assert.ok(existsSync(fileUrl(path)), `${path} がない`);
  const buf = readFileSync(fileUrl(path));
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${path} が PNG でない`);
  assert.equal(buf.readUInt32BE(8), 13, `${path} の IHDR の長さ`);
  assert.equal(buf.subarray(12, 16).toString('latin1'), 'IHDR', `${path} の最初のチャンク`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.length };
}

test('8 OGP 画像：ogp.png が 1200×630 で、1MB 以下', () => {
  const { width, height, bytes } = pngSize('ogp.png');
  assert.deepEqual({ width, height }, { width: 1200, height: 630 });
  assert.ok(bytes <= 1024 * 1024, `${bytes} バイト`);
});

test('12 アイコン：icon.png が 180×180', () => {
  const { width, height } = pngSize('icon.png');
  assert.deepEqual({ width, height }, { width: 180, height: 180 });
});

test('12 アイコン：index.html の rel="icon" と rel="apple-touch-icon" が、それぞれ1つだけあり icon.png を指す', () => {
  const hrefs = (rel) => headTags('link').filter((l) => l.rel === rel).map((l) => l.href);
  assert.deepEqual(hrefs('icon'), ['icon.png']);
  assert.deepEqual(hrefs('apple-touch-icon'), ['icon.png']);
});

// ---------------------------------------------------------------- 9・10 「カカカ」の位置

// 文字を描いた位置を、座標の変換（translate・scale・rotate・setTransform・save・restore）を追って、Canvas 上の座標で記録する偽の Canvas
function trackedCanvas() {
  const frame = { texts: [] };
  const IDENTITY = [1, 0, 0, 1, 0, 0];
  let m = IDENTITY;
  const stack = [];
  const props = { font: '10px sans-serif', textAlign: 'start' };
  const KEPT = ['font', 'textAlign'];
  const mul = ([a, b, c, d, e, f], [A, B, C, D, E, F]) =>
    [a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f];
  const methods = {
    save: () => stack.push({ m, kept: KEPT.map((k) => props[k]) }),
    restore() {
      const s = stack.pop();
      if (!s) return;
      m = s.m;
      KEPT.forEach((k, i) => { props[k] = s.kept[i]; });
    },
    setTransform: (...v) => { m = v; },
    translate: (x, y) => { m = mul(m, [1, 0, 0, 1, x, y]); },
    scale: (x, y) => { m = mul(m, [x, 0, 0, y, 0, 0]); },
    rotate: (r) => { m = mul(m, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]); },
    fillText(text, x, y) {
      const [a, b, c, d, e, f] = m;
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(props.font)?.[1]);
      frame.texts.push({
        text: String(text), x: a * x + c * y + e, y: b * x + d * y + f,
        // 全角の文字の幅は、文字の大きさと同じとみなす
        width: [...String(text)].length * size * Math.hypot(a, b),
        align: props.textAlign, slope: b,
      });
    },
  };
  const noop = () => {};
  const ctx = new Proxy(props, {
    get: (o, k) => methods[k] ?? (k in o ? o[k] : noop),
    set: (o, k, v) => {
      o[k] = v;
      return true;
    },
  });
  // 薄く描くときの下書きを使わず、この Canvas にそのまま描く（node では document がない）
  const canvas = { width: 360, height: 640, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 640 }) };
  return { canvas, frame };
}

const DT = 0.05;
// Math.random を一時的に差し替える（終わったら必ず戻す）
function withRandom(run) {
  const original = Math.random;
  let value = 0;
  Math.random = () => value;
  try {
    run((v) => { value = v; });
  } finally {
    Math.random = original;
  }
}

// 狩りになるまでを、ふつうに遊んだときと同じ順番で描く：
// 名前付け（アップ）→ 昼（部屋の隅から、いちばん速い猫の速さで窓の前まで歩く）→ 鳥が来る。
// 道すじの乱数は、ページを開いたとき（first）と、昼になったとき（second）に選ばれる。その差が横のずれ（pathOffset）になる
async function setupBird() {
  const P = await import('../src/data/params.js');
  const R = await import('../src/render/renderer.js');
  const BIRD = P.EVENTS.bird;
  const speed = Math.max(...Object.values(P.PERSONALITIES).map((p) => p.approachSpeed)) * Math.max(...P.DAYS.map((d) => d.approachMul));
  const dayView = (phase, mode, distance, extra = {}) => ({
    scene: 'day', wariness: 0, coat: 'chatora', cat: { mode, distance, walking: phase === 'approach' }, prop: { kind: 'bird', phase, phaseT: 0 }, ...extra,
  });
  function walkToHunt(renderer, setRandom, second) {
    setRandom(second);
    let t = DT;
    renderer.draw({ scene: 'name', closeup: true, coat: 'chatora' }, t, DT);
    for (let d = P.MAX_VALUE; d > BIRD.birdDistance; d -= speed * DT) renderer.draw(dayView('approach', 'relax', d), (t += DT), DT);
    for (let k = 0; k < BIRD.arriveSec; k += DT) renderer.draw(dayView('arrive', 'backTurn', BIRD.birdDistance), (t += DT), DT);
    return t;
  }
  return { P, R, BIRD, dayView, walkToHunt };
}

test('9 「カカカ」：顔12種×立ち位置の端でも、頭の左側に出て、頭と重ならず、離れすぎず、画面からはみ出さない', async () => {
  const { P, R, BIRD, dayView, walkToHunt } = await setupBird();
  const faces = P.FACES.shapes.flatMap((shape) => P.FACES.ears.map((ears) => ({ shape, ears })));
  assert.equal(faces.length, 12, '顔の種類（このテストの前提）');
  for (const { shape } of faces) assert.ok(R.FACE_SHAPES[shape], `FACE_SHAPES に ${shape} がない`);

  // 窓の前（距離45）で猫がいちばん左（0.075）・いちばん右（0.575）に来る値と、そのあいだの値
  const seconds = [0, 0.075, 0.2, 0.325, 0.45, 0.575, 0.7, 0.825, 0.95];
  // 部屋の隅（距離100）で猫がいちばん右（0.75）・いちばん左（0.25）に来る値と、そのあいだの値
  const firsts = [0, 0.25, 0.5, 0.75];
  let minX = Infinity;
  let maxX = -Infinity;
  const problems = [];
  withRandom((setRandom) => {
    for (const first of firsts) {
      for (const second of seconds) {
        setRandom(first);
        const { canvas, frame } = trackedCanvas();
        const renderer = R.createRenderer(canvas);
        let t = walkToHunt(renderer, setRandom, second);
        const seen = new Map(faces.map((f) => [f, 0]));
        // 同じ時刻のまま（dt 0）、顔だけ変えて描く
        for (let u = 0; u < BIRD.huntSec[0]; u += DT) {
          t += DT;
          for (const [i, face] of faces.entries()) {
            frame.texts = [];
            renderer.draw(dayView('hunt', 'backTurn', BIRD.birdDistance, { face }), t, i === 0 ? DT : 0);
            const list = frame.texts.filter((x) => x.text === 'カカカ');
            // 1.4秒ごとに0.9秒だけ出る。出ていないフレームは見ない
            if (list.length === 0) continue;
            seen.set(face, seen.get(face) + 1);
            const p = renderer.shownPosition();
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            const c = list[0];
            const left = c.x;
            const right = c.x + c.width;
            const headLeft = p.x - R.FACE_SHAPES[face.shape].w * p.s;
            const bad = [];
            if (list.length !== 1) bad.push(`1フレームに${list.length}回描いている`);
            if (!['start', 'left'].includes(c.align) || c.slope !== 0) bad.push(`左揃え・水平でない（${c.align}）`);
            if (!(Math.abs(c.width - 42 * Math.max(1, 0.85 / p.s)) < 0.01)) bad.push(`文字の幅が ${c.width}`);
            if (!(right < headLeft)) bad.push(`文字の右端 ${right.toFixed(1)} が頭の左端 ${headLeft.toFixed(1)} より左でない`);
            if (!(headLeft - right <= 30)) bad.push(`頭の左端から ${(headLeft - right).toFixed(1)}px 離れている`);
            if (!(left >= 0 && right <= 360)) bad.push(`画面からはみ出す（${left.toFixed(1)}〜${right.toFixed(1)}）`);
            // 頭の高さ（耳の先〜あご）にある
            if (!(c.y >= p.y - 150 * p.s && c.y <= p.y - 35 * p.s)) bad.push(`頭の高さにない（頭の足もとから ${((c.y - p.y) / p.s).toFixed(1)}）`);
            for (const b of bad) problems.push(`${face.shape}/${face.ears}・乱数 ${first}→${second}・猫の x ${p.x.toFixed(1)}：${b}`);
          }
        }
        for (const [face, n] of seen) if (n === 0) problems.push(`${face.shape}/${face.ears}・乱数 ${first}→${second}：「カカカ」が一度も出ない`);
      }
    }
  });
  // 立ち位置の端（真ん中 195.3 ± 72.6）まで試せている
  assert.ok(minX < 124, `いちばん左の猫の x ${minX}（このテストの前提）`);
  assert.ok(maxX > 266, `いちばん右の猫の x ${maxX}（このテストの前提）`);
  assert.equal(problems.length, 0, `${problems.length}件。はじめの3件:\n${problems.slice(0, 3).join('\n')}`);
});

test('10 「カカカ」：狩りの前（arrive）と、狩りのあと（leave・turn）では出ない', async () => {
  const { R, BIRD, dayView, walkToHunt } = await setupBird();
  const counts = { arrive: 0, hunt: 0, leave: 0, turn: 0 };
  const { canvas, frame } = trackedCanvas();
  withRandom((setRandom) => {
    const renderer = R.createRenderer(canvas);
    frame.texts = [];
    let t = walkToHunt(renderer, setRandom, 0);
    counts.arrive = frame.texts.filter((x) => x.text === 'カカカ').length;
    for (const [phase, mode, sec] of [['hunt', 'backTurn', BIRD.huntSec[0]], ['leave', 'backTurn', BIRD.leaveSec], ['turn', 'look', BIRD.turnSec]]) {
      frame.texts = [];
      for (let k = 0; k < sec; k += DT) renderer.draw(dayView(phase, mode, BIRD.birdDistance), (t += DT), DT);
      counts[phase] = frame.texts.filter((x) => x.text === 'カカカ').length;
    }
  });
  assert.ok(counts.hunt > 0, '狩りで「カカカ」が出ていない（このテストの前提）');
  assert.deepEqual({ arrive: counts.arrive, leave: counts.leave, turn: counts.turn }, { arrive: 0, leave: 0, turn: 0 });
});

// ---------------------------------------------------------------- 追加 OGP 画像を作るページ（ゲームには含めない）

test('追加 OGP のページ：tools/build.js に OGP があり、ogp.bundle.js は最新の内容になっている（npm run build の忘れ防止）', async () => {
  const { bundle, OGP } = await import('../tools/build.js');
  assert.deepEqual(OGP, { entry: 'tools/ogp/ogp.js', out: 'tools/ogp/ogp.bundle.js' }, 'tools/build.js の OGP');
  assert.equal(readText(OGP.out), bundle(OGP.entry));
});

test('追加 OGP のページ：tools/ogp/index.html は ogp.bundle.js を読む', () => {
  const srcs = [...readText('tools/ogp/index.html').matchAll(/<script\b[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1].replace(/^\.\//, ''));
  assert.ok(srcs.includes('ogp.bundle.js'), `読んでいるスクリプト: ${srcs.join(' / ')}`);
});

test('追加 OGP のページ：game.js に tools/ogp の中身が含まれない', async () => {
  const { bundle } = await import('../tools/build.js');
  assert.ok(!readText('game.js').includes('tools/ogp'), 'game.js に tools/ogp が含まれている');
  assert.ok(!bundle().includes('tools/ogp'), 'bundle() に tools/ogp が含まれている');
});
