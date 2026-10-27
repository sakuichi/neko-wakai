// 試作ページ用に faces.js を1つの通常スクリプトにまとめる（ゲームには含めない）。
// 使い方: node prototype/faces/build.mjs
import { writeFileSync } from 'node:fs';
import { bundle } from '../../tools/build.js';

writeFileSync(new URL('./faces.bundle.js', import.meta.url), bundle('prototype/faces/faces.js'));
console.log('built prototype/faces/faces.bundle.js');
