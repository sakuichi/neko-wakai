// 公開用のファイルを dist/ に作る（公開はしない。公開の手順は docs/spec.md の13.3）
// 使い方：npm run site … 限定公開用（検索に載せないよう頼む1行を入れる）
// 　　　　npm run site -- --public … 告知用（その1行を入れない）
// 前の公開用フォルダに余計なものがあれば、何も書かずに止まる（勝手に片付けない）
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bundle } from './build.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 遊ぶのに必要なファイル（これ以外は公開しない）
export const SITE_FILES = ['index.html', 'style.css', 'game.js', 'ogp.png', 'icon.png'];
// 検索に載せないよう頼む行（限定公開の間だけ）
export const NOINDEX = '<meta name="robots" content="noindex">';
// GitHub Pages にファイルをそのまま出してもらうための、空のファイル
const NOJEKYLL = '.nojekyll';
const HEAD_END = '</head>';
const ROBOTS_RE = /<meta\b[^>]*\bname\s*=\s*["']?robots\b/i;

/**
 * root の公開するファイルを out に書く。おかしいところがあれば、何も書かずに Error を投げる（書き込みの失敗だけは、途中まで書いていることがある。Error の cause に元の失敗を入れる）
 * limited：false のときだけ、検索よけの行を入れない
 * @returns {string[]} 書いたファイル名
 */
export function buildSite({ root = ROOT, out = join(root, 'dist'), limited = true, bundleGame = () => bundle() } = {}) {
  const files = new Map();
  for (const name of SITE_FILES) {
    const path = join(root, name);
    if (!existsSync(path)) throw new Error(`公開するファイルがありません：${name}`);
    files.set(name, readFileSync(path));
  }
  if (files.get('game.js').toString('utf8') !== bundleGame()) throw new Error('game.js が古いままです。先に npm run build を実行してください');
  files.set('index.html', pageFor(files.get('index.html'), limited));
  files.set(NOJEKYLL, Buffer.alloc(0));
  checkOut(out, files);

  // index.html は最後に書く（途中で失敗したとき、新しい入口だけが公開用に残らないように）
  const names = [...files.keys()].sort((a, b) => (a === 'index.html') - (b === 'index.html'));
  mkdirSync(out, { recursive: true });
  for (const name of names) {
    try {
      writeFileSync(join(out, name), files.get(name));
    } catch (e) {
      throw new Error(`${name} を書くところで、途中で失敗しました。公開用フォルダは新旧が混ざっているので、使わないでください（${e.message}）`, { cause: e });
    }
  }
  return names;
}

// 公開用の index.html。元のバイトを変えないよう、latin1（1バイト＝1文字）で扱う
function pageFor(data, limited) {
  const html = data.toString('latin1');
  if (ROBOTS_RE.test(html)) throw new Error('index.html に、すでに robots の meta があります');
  if (limited === false) return data;
  const at = html.indexOf(HEAD_END);
  if (at < 0) throw new Error(`index.html に ${HEAD_END} がありません`);
  return Buffer.from(`${html.slice(0, at)}  ${NOINDEX}\n${html.slice(at)}`, 'latin1');
}

// 公開用フォルダに、これから書くファイルのほかに何もないか
function checkOut(out, files) {
  if (!existsSync(out)) return;
  const extra = readdirSync(out, { withFileTypes: true }).filter((e) => !e.isFile() || !files.has(e.name));
  if (extra.length > 0) throw new Error(`公開用フォルダに余計なものがあります（片付けてから、もう一度）：${extra.map((e) => e.name).join(', ')}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const args = process.argv.slice(2);
    const unknown = args.filter((a) => a !== '--public');
    if (unknown.length > 0) throw new Error(`知らない指定です：${unknown.join(' ')}`);
    const limited = !args.includes('--public');
    console.log(`${limited ? '限定公開用（検索よけあり）' : '告知用（検索よけなし）'}に作りました：dist/ の ${buildSite({ limited }).join(', ')}`);
  } catch (e) {
    console.error(e.cause ? e.message : `作りませんでした（dist/ があれば、前回のままです）。${e.message}`);
    process.exitCode = 1;
  }
}
