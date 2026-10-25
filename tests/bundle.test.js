import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { bundle } from '../tools/build.js';

test('game.js は src/ から生成した最新の内容になっている（npm run build の忘れ防止）', () => {
  const actual = readFileSync(new URL('../game.js', import.meta.url), 'utf8');
  assert.equal(actual, bundle());
});

test('game.js は通常の <script> として読み込める（import/export が残っていない）', () => {
  const code = bundle();
  assert.doesNotThrow(() => new vm.Script(code));
  assert.doesNotMatch(code, /^\s*(import|export)\s/m);
});
