import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 公開用ファイルを作る道具（tools/site.js）のテスト。
// リポジトリの中（dist/ を含む）には書かない。tools/site.js も、一時フォルダに写しを置いて、そちらを読み込む・動かす
// （道具がまちがっていて既定の置き場所に書いても、書かれるのは一時フォルダの中だけ）。
// まだ無いもので、ファイル全体が読めなくならないよう、対象はテストの中で読み込む

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['index.html', 'style.css', 'game.js', 'ogp.png', 'icon.png'];
const OUT_FILES = [...FILES, '.nojekyll'];
const NOINDEX = '<meta name="robots" content="noindex">';
const PAGE_URL = 'https://sakuichi.github.io/neko-wakai/';

// ---------------------------------------------------------------- 一時フォルダ

const made = [];
after(() => {
  // 片付けるのは、ここで作った一時フォルダだけ
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

function tempDir() {
  // 短い名前（TSUKIN~1 など）のままだと、実行したファイルの場所の見え方がそろわないので、正式な名前にする
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'neko-wakai-site-')));
  made.push(dir);
  return dir;
}

// フォルダの中身 { 相対パス: 'フォルダ' または内容のハッシュ }。フォルダがなければ null
function snapshot(dir, skip = () => false) {
  if (!existsSync(dir)) return null;
  const out = {};
  const walk = (abs, rel) => {
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (skip(r)) continue;
      if (e.isDirectory()) {
        out[r] = 'フォルダ';
        walk(join(abs, e.name), r);
      } else out[r] = hash(readFileSync(join(abs, e.name)));
    }
  };
  walk(dir, '');
  return out;
}
const hash = (buf) => createHash('sha256').update(buf).digest('hex');
const names = (dir) => readdirSync(dir).sort();

function assertSameBytes(actualPath, expected, what) {
  assert.ok(existsSync(actualPath), `${what} が作られていない`);
  const actual = readFileSync(actualPath);
  assert.equal(actual.length, expected.length, `${what} の大きさ`);
  assert.equal(hash(actual), hash(expected), `${what} の中身`);
}

// 検索よけの行を足したあとの index.html（あるべき姿）
function withNoindex(html) {
  const at = html.indexOf('</head>');
  assert.ok(at >= 0, '</head> がない（このテストの前提）');
  return `${html.slice(0, at)}  ${NOINDEX}\n${html.slice(at)}`;
}

// 小さな「元のフォルダ」。公開しないはずのものも混ぜておく
const INDEX = [
  '<!doctype html>', '<html lang="ja">', '<head>', '  <meta charset="utf-8">', '  <title>ネコ $& と $1</title>',
  '  <link rel="stylesheet" href="style.css">', '</head>', '<body>', '  <script src="game.js"></script>', '</body>', '</html>', '',
].join('\n');
const GAME = "(() => {\n'use strict';\nconst にゃーん = '$& $1';\n})();\n";
const bundleGame = () => GAME;
const SOURCE = {
  'index.html': Buffer.from(INDEX),
  'style.css': Buffer.from('﻿/* 猫 */\r\n#game { color: #333; }\r\nbody { margin: 0 }'), // BOM・CRLF・最後に改行なし
  'game.js': Buffer.from(GAME),
  'ogp.png': Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(Array.from({ length: 512 }, (_, i) => i % 256))]),
  'icon.png': Buffer.from(Array.from({ length: 300 }, (_, i) => (i * 7 + 250) % 256)), // 文字としては読めない並び
};
function makeRoot(change = {}) {
  const root = join(tempDir(), 'moto');
  mkdirSync(root);
  for (const [name, buf] of Object.entries({ ...SOURCE, ...change })) if (buf !== null) writeFileSync(join(root, name), buf);
  for (const dir of ['src', 'docs', 'tools', '.git', '.claude']) {
    mkdirSync(join(root, dir));
    writeFileSync(join(root, dir, 'naka.txt'), `${dir} の中身`);
  }
  for (const name of ['CLAUDE.md', 'package.json', '.env', '.gitignore', 'memo.png']) writeFileSync(join(root, name), `${name} の中身`);
  return root;
}

// 前回の公開用フォルダ（同じ6つ。中身は古く、今回より長い）
function makeOldOut() {
  const out = join(tempDir(), 'dashi');
  mkdirSync(out);
  for (const name of OUT_FILES) writeFileSync(join(out, name), `${name} の古い中身\n`.repeat(200));
  return out;
}
const noOut = () => join(tempDir(), 'dashi');

// 本物の写し（tools/site.js・tools/build.js・src/・公開する5つ）。ほかに、さわってはいけない .git の代わりも置く
function makeMirror() {
  assert.ok(existsSync(join(REPO, 'tools/site.js')), 'tools/site.js がない（未実装）');
  const top = tempDir();
  const repo = join(top, 'utsushi');
  const cwd = join(top, 'betsu'); // 動かすときの場所（写しの外）
  for (const dir of [repo, cwd, join(repo, 'tools'), join(repo, '.git')]) mkdirSync(dir);
  for (const name of [...FILES, 'package.json', 'tools/site.js', 'tools/build.js']) copyFileSync(join(REPO, name), join(repo, name));
  cpSync(join(REPO, 'src'), join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  return { top, repo, cwd, dist: join(repo, 'dist') };
}
function runNode(mirror, args) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, args, { cwd: mirror.cwd, env, encoding: 'utf8', timeout: 30000 });
  assert.equal(r.error, undefined, 'node を起動できない');
  return r;
}
const runSite = (mirror, ...args) => runNode(mirror, [join(mirror.repo, 'tools/site.js'), ...args]);

// 写しの tools/site.js を読み込む（1回だけ）
let lib = null;
async function loadSite() {
  lib ??= makeMirror();
  const mod = await import(pathToFileURL(join(lib.repo, 'tools/site.js')).href);
  assert.equal(typeof mod.buildSite, 'function', 'tools/site.js の buildSite');
  return mod;
}

// 止まること：Error を投げ（メッセージに includes を含む）、out も root も変わらない
function assertStops(buildSite, { root, out, includes = [], ...options }, what) {
  const before = { out: snapshot(out), root: snapshot(root) };
  assert.throws(() => buildSite({ root, out, bundleGame, ...options }), (e) => {
    assert.ok(e instanceof Error, `${what}：Error ではない`);
    for (const s of includes) assert.ok(e.message.includes(s), `${what}：メッセージに「${s}」がない：${e.message}`);
    return true;
  }, `${what}：止まらない`);
  assert.deepEqual(snapshot(out), before.out, `${what}：公開用のフォルダが変わった`);
  assert.deepEqual(snapshot(root), before.root, `${what}：元のフォルダが変わった`);
}

// out がないとき・前回の6つがあるときの両方で、limited の両方で、止まること
function assertStopsEverywhere(buildSite, makeRootFn, options, what, limitedValues = [true, false]) {
  for (const limited of limitedValues) {
    assertStops(buildSite, { root: makeRootFn(), out: noOut(), limited, ...options }, `${what}（limited ${limited}・公開用フォルダなし）`);
    assertStops(buildSite, { root: makeRootFn(), out: makeOldOut(), limited, ...options }, `${what}（limited ${limited}・前回の6つあり）`);
  }
}

// ---------------------------------------------------------------- 1 公開用が決めた6つだけ

test('1 公開用：SITE_FILES は決めた5つ、NOINDEX は決めた1行', async () => {
  const { SITE_FILES, NOINDEX: actual } = await loadSite();
  assert.deepEqual(SITE_FILES, FILES);
  assert.equal(actual, NOINDEX);
});

test('1 公開用：何でも入った元のフォルダから、決めた5つと空の .nojekyll だけを書き、その6つの名前を返す。元は変わらない', async () => {
  const { buildSite } = await loadSite();
  for (const limited of [true, false]) {
    const root = makeRoot();
    const out = noOut();
    const before = snapshot(root);
    const written = buildSite({ root, out, limited, bundleGame });
    assert.deepEqual(names(out), [...OUT_FILES].sort(), `limited ${limited}`);
    assert.deepEqual([...written].sort(), [...OUT_FILES].sort(), `limited ${limited} の戻り値`);
    assert.equal(readFileSync(join(out, '.nojekyll')).length, 0, '.nojekyll の大きさ');
    assert.deepEqual(snapshot(root), before, '元のフォルダが変わった');
  }
});

test('1 公開用：out を指定しなければ root の dist に書く（ほかには書かない）', async () => {
  const { buildSite } = await loadSite();
  const root = makeRoot();
  const before = snapshot(root);
  buildSite({ root, bundleGame });
  assert.ok(existsSync(join(root, 'dist')), 'root/dist が作られていない');
  assert.deepEqual(names(join(root, 'dist')), [...OUT_FILES].sort());
  assert.deepEqual(snapshot(root, (r) => r === 'dist'), before);
});

// ---------------------------------------------------------------- 2 使うファイルがすべて入っている

// 参照のうち、自分のサイトのファイルの名前（index.html のあるフォルダからの相対）。よそのサイトや data: は数えない
function ownFiles(refs, base = PAGE_URL) {
  const out = new Set();
  for (const ref of refs) {
    const url = new URL(ref, base);
    if (url.origin !== new URL(PAGE_URL).origin) continue;
    const href = url.origin + url.pathname;
    assert.ok(href.startsWith(PAGE_URL), `公開ページのフォルダの外を指している：${ref}`);
    out.add(decodeURIComponent(href.slice(PAGE_URL.length)) || 'index.html');
  }
  return [...out].sort();
}

test('2 使うファイル：本物の index.html の href・src・og:image が指す自分のサイトのファイルは、すべて SITE_FILES に入っている', async () => {
  const html = readFileSync(join(REPO, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const refs = [...html.matchAll(/\s(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((m) => m[1] ?? m[2]);
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (/\bproperty\s*=\s*["']og:image["']/i.test(tag)) refs.push(tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)[1]);
  }
  const used = ownFiles(refs);
  for (const name of ['game.js', 'icon.png', 'ogp.png', 'style.css']) assert.ok(used.includes(name), `${name} を見つけられていない（このテストの前提）`);
  const { SITE_FILES } = await loadSite();
  assert.deepEqual(used.filter((name) => !SITE_FILES.includes(name)), [], '公開用に入っていないファイル');
});

test('2 使うファイル：本物の style.css の url(...) が指す自分のサイトのファイルは、すべて SITE_FILES に入っている', async () => {
  const css = readFileSync(join(REPO, 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const refs = [...css.matchAll(/\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]*?))\s*\)/gi)].map((m) => m[1] ?? m[2] ?? m[3]);
  const used = refs.length ? ownFiles(refs, `${PAGE_URL}style.css`) : [];
  const { SITE_FILES } = await loadSite();
  assert.deepEqual(used.filter((name) => !SITE_FILES.includes(name)), [], '公開用に入っていないファイル');
});

// ---------------------------------------------------------------- 3 index.html 以外は1バイトも違わない

test('3 同じ中身：index.html 以外の4つは、元とバイト単位で同じ（文字として読めない PNG・BOM・CRLF も）', async () => {
  const { buildSite } = await loadSite();
  for (const limited of [true, false]) {
    const out = noOut();
    buildSite({ root: makeRoot(), out, limited, bundleGame });
    for (const name of FILES.filter((n) => n !== 'index.html')) assertSameBytes(join(out, name), SOURCE[name], `${name}（limited ${limited}）`);
  }
});

test('3 同じ中身：本物のゲームから作っても、index.html 以外の4つは本物とバイト単位で同じ', async () => {
  const { buildSite } = await loadSite();
  const out = noOut();
  buildSite({ root: lib.repo, out }); // 写しから。bundleGame は既定（tools/build.js の bundle）
  for (const name of FILES.filter((n) => n !== 'index.html')) assertSameBytes(join(out, name), readFileSync(join(REPO, name)), name);
});

// ---------------------------------------------------------------- 4・5 検索よけ

test('4 検索よけ：指定なしなら、</head> の直前に決めた1行が1つだけ入り、ほかは元とバイト単位で同じ', async () => {
  const { buildSite } = await loadSite();
  const out = noOut();
  buildSite({ root: makeRoot(), out, bundleGame });
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  assert.equal(html, withNoindex(INDEX));
  assert.equal(html.split(NOINDEX).length - 1, 1, '検索よけの行の数');
  assertSameBytes(join(out, 'index.html'), Buffer.from(withNoindex(INDEX)), 'index.html');
});

test('4 検索よけ：改行が CRLF の index.html でも、足した1行のほかは元とバイト単位で同じ', async () => {
  const { buildSite } = await loadSite();
  const crlf = INDEX.replaceAll('\n', '\r\n');
  const out = noOut();
  buildSite({ root: makeRoot({ 'index.html': Buffer.from(crlf) }), out, limited: true, bundleGame });
  assertSameBytes(join(out, 'index.html'), Buffer.from(withNoindex(crlf)), 'index.html');
});

test('4 検索よけ：本物の index.html でも、決めた1行が1つだけ入り、ほかは本物とバイト単位で同じ', async () => {
  const { buildSite } = await loadSite();
  const out = noOut();
  buildSite({ root: lib.repo, out });
  const real = readFileSync(join(REPO, 'index.html'), 'utf8');
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  assert.equal(html, withNoindex(real));
  assert.equal(html.split(NOINDEX).length - 1, 1, '検索よけの行の数');
});

test('5 検索よけ：limited: false では入らず、index.html も元とバイト単位で同じ', async () => {
  const { buildSite } = await loadSite();
  const out = noOut();
  buildSite({ root: makeRoot(), out, limited: false, bundleGame });
  assertSameBytes(join(out, 'index.html'), SOURCE['index.html'], 'index.html');
  assert.doesNotMatch(readFileSync(join(out, 'index.html'), 'utf8'), /robots|noindex/i);
});

// ---------------------------------------------------------------- 6 足りない・古いときは作らずに止まる

for (const name of FILES) {
  test(`6 止まる：元の ${name} がなければ、名前を知らせて止まり、何も書かない`, async () => {
    const { buildSite } = await loadSite();
    assertStopsEverywhere(buildSite, () => makeRoot({ [name]: null }), { includes: [name] }, `${name} なし`);
  });
}

test('6 止まる：game.js が bundleGame() と違えば、「npm run build」と知らせて止まり、何も書かない', async () => {
  const { buildSite } = await loadSite();
  for (const [what, latest] of [['中身が違う', GAME.replace('にゃーん', 'わん')], ['最後の改行だけ違う', `${GAME}\n`], ['同じ長さで1文字だけ違う', GAME.replace('$1', '$2')]]) {
    assertStopsEverywhere(buildSite, () => makeRoot(), { bundleGame: () => latest, includes: ['npm run build'] }, what);
  }
});

test('6 止まる：limited で index.html に </head> がなければ止まり、何も書かない', async () => {
  const { buildSite } = await loadSite();
  const html = Buffer.from(INDEX.replace('</head>\n', ''));
  assertStopsEverywhere(buildSite, () => makeRoot({ 'index.html': html }), {}, '</head> なし', [true]);
});

test('6 止まる：index.html に既に robots の meta があれば止まり、何も書かない（limited でも、そうでなくても）', async () => {
  const { buildSite } = await loadSite();
  for (const meta of [NOINDEX, '<meta name="robots" content="index,follow">', '<meta content="noindex" name="robots">', "<META NAME='ROBOTS' CONTENT='noindex'>"]) {
    const html = Buffer.from(INDEX.replace('</head>', `  ${meta}\n</head>`));
    assertStopsEverywhere(buildSite, () => makeRoot({ 'index.html': html }), {}, meta);
  }
});

// ---------------------------------------------------------------- 7 前回の公開用フォルダ

const EXTRAS = [
  ['ファイル', 'yokei-na-memo.txt', (p) => writeFileSync(p, '前回の余計なファイル')],
  ['点で始まるファイル', '.himitsu-no-env', (p) => writeFileSync(p, 'SECRET=dummy')],
  ['空のフォルダ', 'kara-no-folder', (p) => mkdirSync(p)],
  ['中身のあるフォルダ', 'nakami-no-folder', (p) => { mkdirSync(p); writeFileSync(join(p, 'index.html'), '古い'); }],
  ['.git', '.git', (p) => { mkdirSync(p); writeFileSync(join(p, 'HEAD'), 'ref: refs/heads/main\n'); }],
];
for (const [what, name, put] of EXTRAS) {
  test(`7 余計なもの：公開用のフォルダに${what}（${name}）があれば、名前を知らせて止まる（消さない・書かない）`, async () => {
    const { buildSite } = await loadSite();
    for (const limited of [true, false]) {
      const old = makeOldOut();
      put(join(old, name));
      assertStops(buildSite, { root: makeRoot(), out: old, limited, includes: [name] }, `前回の6つと${what}（limited ${limited}）`);
      const only = noOut();
      mkdirSync(only);
      put(join(only, name));
      assertStops(buildSite, { root: makeRoot(), out: only, limited, includes: [name] }, `${what}だけ（limited ${limited}）`);
    }
  });
}

test('7 上書き：前回の6つだけ（または一部だけ・空）なら、今回の中身に上書きする', async () => {
  const { buildSite } = await loadSite();
  for (const [what, keep] of [['6つ', OUT_FILES], ['一部', ['game.js', '.nojekyll']], ['空', []]]) {
    const out = makeOldOut();
    for (const name of OUT_FILES) if (!keep.includes(name)) unlinkSync(join(out, name));
    assert.deepEqual(names(out), [...keep].sort(), '前回の公開用（このテストの前提）');
    const written = buildSite({ root: makeRoot(), out, bundleGame });
    assert.deepEqual([...written].sort(), [...OUT_FILES].sort(), `${what}：戻り値`);
    assert.deepEqual(names(out), [...OUT_FILES].sort(), `${what}：公開用の中身`);
    for (const name of FILES.filter((n) => n !== 'index.html')) assertSameBytes(join(out, name), SOURCE[name], `${what}：${name}`);
    assertSameBytes(join(out, 'index.html'), Buffer.from(withNoindex(INDEX)), `${what}：index.html`);
    assertSameBytes(join(out, '.nojekyll'), Buffer.alloc(0), `${what}：.nojekyll`);
  }
});

// ---------------------------------------------------------------- 8 Git・通信・削除をしない

// 行まるごとのコメントを除いたソース（行の途中のコメントは残す。文字列の中の // を切らないため）
function siteCode() {
  assert.ok(existsSync(join(REPO, 'tools/site.js')), 'tools/site.js がない（未実装）');
  return readFileSync(join(REPO, 'tools/site.js'), 'utf8')
    .replace(/^[ \t]*\/\*(?:(?!\*\/)[\s\S])*\*\/[ \t]*$/gm, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

test('8 しないこと：tools/site.js が読み込むのは、Node の標準機能（子プロセス・通信を除く）と ./build.js だけ', () => {
  const code = siteCode();
  const specs = [
    ...[...code.matchAll(/\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
    ...[...code.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
    ...[...code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
  ];
  const allowed = ['fs', 'path', 'url', 'process', 'buffer', 'os', 'util'].map((n) => `node:${n}`);
  assert.ok(specs.includes('./build.js'), '読み込みを見つけられていない、または ./build.js を使っていない');
  assert.deepEqual(specs.filter((s) => s !== './build.js' && !allowed.includes(s)), []);
  // 名前を決めずに読み込む書き方もしない
  assert.doesNotMatch(code, /\bimport\s*\(\s*[^'"\s]/);
  assert.doesNotMatch(code, /\b(?:require|createRequire|getBuiltinModule)\b/);
});

test('8 しないこと：tools/site.js に、子プロセス・通信・削除の命令がない', () => {
  const code = siteCode();
  // .exec( は正規表現のものかもしれないので、前に点のない exec( だけを見る
  const ng = /\b(?:child_process|spawn|spawnSync|execSync|execFile|execFileSync|fork|fetch|WebSocket|EventSource|XMLHttpRequest|rm|rmSync|unlink|unlinkSync|rmdir|rmdirSync)\b|(?<![.\w])exec\s*\(/g;
  assert.deepEqual([...code.matchAll(ng)].map((m) => m[0]), []);
});

test('8 しないこと：import しただけでは、何も書かない', () => {
  const mirror = makeMirror();
  writeFileSync(join(mirror.cwd, 'yomu.mjs'), [
    `const mod = await import(${JSON.stringify(pathToFileURL(join(mirror.repo, 'tools/site.js')).href)});`,
    'console.log(`buildSite=${typeof mod.buildSite}`);',
  ].join('\n'));
  const before = snapshot(mirror.top);
  // --public が付いた別の道具から読み込まれても同じ
  for (const args of [[], ['--public']]) {
    const r = runNode(mirror, [join(mirror.cwd, 'yomu.mjs'), ...args]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^buildSite=function$/m);
    assert.deepEqual(snapshot(mirror.top), before, `引数 ${args.join(' ') || 'なし'}`);
  }
});

// ---------------------------------------------------------------- 追加 直接実行（本物の写しで動かす）

for (const [what, args, expected] of [['引数なし：検索よけ入り', [], withNoindex], ['--public：検索よけなし', ['--public'], (html) => html]]) {
  test(`追加 直接実行：${what}の6つを、どこから動かしても dist/ に作り、ほかは何も変えない`, () => {
    const mirror = makeMirror();
    const before = snapshot(mirror.top);
    const r = runSite(mirror, ...args);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(mirror.dist), 'dist/ が作られていない');
    assert.deepEqual(names(mirror.dist), [...OUT_FILES].sort());
    assert.equal(readFileSync(join(mirror.dist, 'index.html'), 'utf8'), expected(readFileSync(join(REPO, 'index.html'), 'utf8')));
    for (const name of FILES.filter((n) => n !== 'index.html')) assertSameBytes(join(mirror.dist, name), readFileSync(join(REPO, name)), name);
    assertSameBytes(join(mirror.dist, '.nojekyll'), Buffer.alloc(0), '.nojekyll');
    assert.deepEqual(snapshot(mirror.top, (rel) => rel === 'utsushi/dist'), before, 'dist/ のほかが変わった');
  });
}

for (const args of [['--publik'], ['--public=true'], ['public'], ['--limited'], ['--public', '--yes'], ['--yes', '--public']]) {
  test(`追加 直接実行：知らない引数（${args.join(' ')}）なら、何も書かずに 0 以外で終わる`, () => {
    const mirror = makeMirror();
    const before = snapshot(mirror.top);
    const r = runSite(mirror, ...args);
    assert.equal(typeof r.status, 'number', '途中で打ち切られた');
    assert.notEqual(r.status, 0);
    assert.deepEqual(snapshot(mirror.top), before);
  });
}

test('追加 直接実行：game.js が古ければ、「npm run build」と知らせて、何も書かずに 0 以外で終わる', () => {
  const mirror = makeMirror();
  writeFileSync(join(mirror.repo, 'game.js'), '// 古い game.js\n');
  const before = snapshot(mirror.top);
  const r = runSite(mirror);
  assert.equal(typeof r.status, 'number', '途中で打ち切られた');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /npm run build/);
  assert.deepEqual(snapshot(mirror.top), before);
});

// ---------------------------------------------------------------- 追加 package.json・.gitignore

test('追加 package.json：scripts の site は「node tools/site.js」（--public を付けない）', () => {
  const { scripts } = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
  assert.equal(scripts.site, 'node tools/site.js');
});

test('追加 .gitignore：dist/ が入っている', () => {
  assert.ok(existsSync(join(REPO, '.gitignore')), '.gitignore がない（未実装）');
  const lines = readFileSync(join(REPO, '.gitignore'), 'utf8').split(/\r?\n/).map((l) => l.trim());
  assert.ok(lines.includes('dist/'), `.gitignore の中身：${lines.join(' / ')}`);
});

// ---------------------------------------------------------------- レビューの指摘の再現（追加）

// 前回の game.js が書き換えられない（読み取り専用）とき。書いている途中で失敗する
async function withLockedGame(out, fn) {
  const { chmodSync } = await import('node:fs');
  const path = join(out, 'game.js');
  chmodSync(path, 0o444);
  try {
    await fn();
  } finally {
    chmodSync(path, 0o644);
  }
}

test('レビュー：書いている途中で失敗したら「途中で失敗」と知らせる。index.html は最後に書くので、前回のまま', async () => {
  const { buildSite } = await loadSite();
  for (const limited of [true, false]) {
    const out = makeOldOut();
    const before = readFileSync(join(out, 'index.html'));
    await withLockedGame(out, () => {
      assert.throws(() => buildSite({ root: makeRoot(), out, bundleGame, limited }), (e) => e instanceof Error && /途中で失敗/.test(e.message) && e.message.includes('game.js'));
    });
    assertSameBytes(join(out, 'index.html'), before, 'index.html');
  }
});

test('レビュー：直接実行でも、途中で失敗したときは「作りませんでした」ではなく「途中で失敗」と知らせて 0 以外で終わる', async () => {
  const mirror = makeMirror();
  assert.equal(runSite(mirror).status, 0);
  await withLockedGame(mirror.dist, () => {
    const r = runSite(mirror, '--public');
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /途中で失敗/);
    assert.doesNotMatch(r.stderr, /作りませんでした/);
  });
});

test('レビュー：何も書かずに止まったときは、dist/ が前回のままだと知らせる', () => {
  const r = runSite(makeMirror(), '--publik');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /前回のまま/);
});

test('レビュー：limited が false 以外のまちがった値（0・null・空文字・文字列）なら、検索よけを入れる', async () => {
  const { buildSite } = await loadSite();
  for (const limited of [0, null, '', 'false', undefined]) {
    const out = noOut();
    buildSite({ root: makeRoot(), out, bundleGame, limited });
    assert.equal(readFileSync(join(out, 'index.html'), 'utf8'), withNoindex(INDEX), `limited ${JSON.stringify(limited)}`);
  }
});

test('レビュー：公開用のフォルダに game.js という名前のフォルダがあれば、名前を知らせて止まり、何も書かない', async () => {
  const { buildSite } = await loadSite();
  const out = noOut();
  mkdirSync(join(out, 'game.js'), { recursive: true });
  assertStops(buildSite, { root: makeRoot(), out, includes: ['game.js'] }, 'game.js というフォルダ');
});
