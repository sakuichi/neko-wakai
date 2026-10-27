// 顔の形の試作：輪郭を毛色ごとに並べ、耳の大きさも見せる（ゲームに入れたもの：輪郭4種・耳3種）。
// ゲームと同じ描き方（src/render/renderer.js の drawCatPortrait）で描く。
// faces.bundle.js は node prototype/faces/build.mjs で作る（ゲームには含めない）
import { drawCatPortrait, FACE_SHAPES, EAR_SIZES } from '../../src/render/renderer.js';

const SHAPE_LABELS = {
  mochi: 'おもち（いまの形）',
  maru: 'まんまる',
  shimobukure: '下ぶくれ',
  hoppe: 'ほっぺもち',
};
const COAT_ORDER = [
  ['chatora', '茶トラ'],
  ['kijitora', 'キジトラ'],
  ['sabatora', 'サバトラ'],
  ['cream', 'クリーム'],
  ['shiro', 'シロ'],
  ['kuro', 'クロ'],
];
const EAR_LABELS = { small: '耳 小さめ', normal: '耳 ふつう', big: '耳 大きめ' };

function portrait(coat, face) {
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 240;
  drawCatPortrait(canvas, coat, { face });
  return canvas;
}

function cell(label, canvas) {
  const div = document.createElement('div');
  div.className = 'cell';
  const p = document.createElement('p');
  p.textContent = label;
  div.append(canvas, p);
  return div;
}

// 1. 輪郭6種（行）× 毛色6種（列）
const shapes = document.getElementById('shapes');
Object.keys(FACE_SHAPES).forEach((shape, i) => {
  const row = document.createElement('section');
  row.className = 'row';
  const h2 = document.createElement('h2');
  h2.textContent = `${String.fromCharCode(65 + i)}. ${SHAPE_LABELS[shape] ?? shape}`;
  const grid = document.createElement('div');
  grid.className = 'grid';
  for (const [coat, label] of COAT_ORDER) grid.append(cell(label, portrait(coat, { shape })));
  row.append(h2, grid);
  shapes.append(row);
});

// 2. 耳の大きさ。輪郭は選んだもの
const parts = document.getElementById('parts');
const select = document.getElementById('parts-shape');
for (const shape of Object.keys(FACE_SHAPES)) {
  const option = document.createElement('option');
  option.value = shape;
  option.textContent = SHAPE_LABELS[shape] ?? shape;
  select.append(option);
}
function showParts() {
  const grid = document.createElement('div');
  grid.className = 'grid three';
  let n = 1;
  for (const ears of Object.keys(EAR_SIZES)) {
    grid.append(cell(`${n++}. ${EAR_LABELS[ears]}`, portrait('chatora', { shape: select.value, ears })));
  }
  parts.replaceChildren(grid);
}
select.addEventListener('change', showParts);
showParts();
