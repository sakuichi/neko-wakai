// src/ の ES Modules を、1つの通常スクリプト game.js にまとめる。
// これで index.html をダブルクリックするだけ（file://）で動く。
// 使い方: npm run build （src/ を変更したら必ず実行する。tests/bundle.test.js が忘れを検出する）
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = 'src/main.js';
const OUT = 'game.js';
// BGM の試聴ページ（ゲームには含めない）
export const PREVIEW = { entry: 'tools/bgm-preview/preview.js', out: 'tools/bgm-preview/preview.bundle.js' };

const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*'([^']+)';?[ \t]*$/gm;
const EXPORT_RE = /^export\s+(function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

const key = (abs) => relative(ROOT, abs).split('\\').join('/');

export function bundle(entry = ENTRY) {
  const order = [];
  const seen = new Set();

  function visit(abs) {
    const k = key(abs);
    if (seen.has(k)) return;
    seen.add(k);
    const src = readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
    for (const m of src.matchAll(IMPORT_RE)) visit(resolve(dirname(abs), m[2]));
    order.push({ k, abs, src });
  }
  visit(join(ROOT, entry));

  const parts = order.map(({ k, abs, src }) => {
    const exported = [];
    let code = src.replace(IMPORT_RE, (_, names, from) => {
      const binds = names
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.replace(/\s+as\s+/, ': '));
      return `const { ${binds.join(', ')} } = __modules['${key(resolve(dirname(abs), from))}'];`;
    });
    code = code.replace(EXPORT_RE, (_, kind, name) => {
      exported.push(name);
      return `${kind} ${name}`;
    });
    const body = code.trimEnd().split('\n').map((l) => (l ? `  ${l}` : l)).join('\n');
    return `// ---- ${k}\n__modules['${k}'] = (() => {\n${body}\n  return { ${exported.join(', ')} };\n})();\n`;
  });

  return [
    '// このファイルは tools/build.js が src/ から自動生成する。直接編集しない（npm run build）。',
    '(() => {',
    "'use strict';",
    'const __modules = {};',
    '',
    parts.join('\n'),
    '})();',
    '',
  ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const { entry, out } of [{ entry: ENTRY, out: OUT }, PREVIEW]) {
    writeFileSync(join(ROOT, out), bundle(entry));
    console.log(`built ${out}`);
  }
}
