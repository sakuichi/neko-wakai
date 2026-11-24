// リンク用の絵（ogp.png）とアイコン（icon.png）を、ゲームと同じ描画で書き出す道具。ゲームには含めない
// 使い方：npm run build のあと tools/ogp/index.html を開き、「保存」で書き出してリポジトリの直下に置く
import { createRenderer, drawCatPortrait } from '../../src/render/renderer.js';
import { TITLE } from '../../src/data/texts.js';

const FONT = '"Hiragino Maru Gothic ProN", "Hiragino Maru Gothic Pro", "BIZ UDPGothic", "Yu Gothic UI", "Meiryo", sans-serif';
const COLOR = { paper: '#fdf6ec', ink: '#5a3e2b', soft: '#8a6d58', accent: '#d9823b', paw: 'rgba(244, 182, 194, 0.55)', icon: '#fbe3cf' };
const COAT = 'chatora';
const CATCH = '膝に乗ってくれるまで、7日間。';
const OGP_W = 1200;
const OGP_H = 630;
const ICON_SIZE = 180;
// ゲームの画面（論理座標 360×640）を、何倍の細かさで描くか
const SHOT_K = 5;
// 絵の右側に入れる範囲（論理座標）：横の真ん中と幅。縦は下端にそろえる
const SHOT = { cx: 184, w: 318 };
// 猫の絵を入れる、右側の左端
const PICTURE_X = 640;

function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// 名前付けの画面と同じ、猫のアップ（途中は小さく描き、最後の1枚だけ大きく描く）
function drawCloseup() {
  const canvas = newCanvas(360, 640);
  const r = createRenderer(canvas);
  const view = { scene: 'name', closeup: true, coat: COAT, personality: 'amaenbo', face: { shape: 'mochi', ears: 'normal' }, cat: { mode: 'look', distance: 0 } };
  for (let i = 0; i < 8; i++) r.draw(view, i * 0.1, 0.1);
  canvas.width = 360 * SHOT_K;
  canvas.height = 640 * SHOT_K;
  r.draw(view, 0.8, 0.1);
  return canvas;
}

function paw(ctx, x, y, s, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.fillStyle = COLOR.paw;
  for (const [px, py, rx, ry] of [[0, 10, 22, 18], [-24, -12, 8, 10], [-9, -26, 8, 10], [9, -26, 8, 10], [24, -12, 8, 10]]) {
    ctx.beginPath();
    ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawOgp() {
  const canvas = newCanvas(OGP_W, OGP_H);
  const ctx = canvas.getContext('2d');
  const K = SHOT_K;
  const w = OGP_W - PICTURE_X;
  const sh = (SHOT.w * OGP_H) / w;
  ctx.drawImage(drawCloseup(), (SHOT.cx - SHOT.w / 2) * K, (640 - sh) * K, SHOT.w * K, sh * K, PICTURE_X, 0, w, OGP_H);
  // 左の紙。右の端は、ゆるい曲線
  ctx.fillStyle = COLOR.paper;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(665, 0);
  ctx.bezierCurveTo(735, 200, 610, 420, 690, OGP_H);
  ctx.lineTo(0, OGP_H);
  ctx.closePath();
  ctx.fill();
  paw(ctx, 95, 95, 1.2, -0.4);
  paw(ctx, 590, 555, 1.1, 0.35);
  paw(ctx, 85, 560, 0.9, 0.2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const text = (s, size, x, y, color) => {
    ctx.fillStyle = color;
    ctx.font = `bold ${size}px ${FONT}`;
    ctx.fillText(s, x, y);
  };
  text(CATCH, 38, 70, 185, COLOR.soft);
  // 題名は「ネコと」で改行する
  const cut = TITLE.main.indexOf('と') + 1;
  text(TITLE.main.slice(0, cut), 124, 64, 300, COLOR.ink);
  text(TITLE.main.slice(cut), 124, 64, 440, COLOR.accent);
  return canvas;
}

// 猫の頭だけ。角は塗ったまま（iPhone のホーム画面では、角が自動で丸くなる。透明だと黒くなる）
function drawIcon() {
  const size = 960;
  const cat = newCanvas(size, size);
  drawCatPortrait(cat, COAT);
  const head = newCanvas(size, size);
  const h = head.getContext('2d');
  // 体と尻尾を切り落とす：耳のある上側はそのまま、下側はあごの形（renderer.js の FACE_SHAPES.mochi と同じ曲線）
  const cx = 480, cy = 476, w = 259, d = 204;
  h.beginPath();
  h.rect(0, 0, size, cy);
  h.moveTo(cx + w, cy - 1);
  h.bezierCurveTo(cx + w, cy + d * 0.71, cx + w * 0.56, cy + d, cx, cy + d);
  h.bezierCurveTo(cx - w * 0.56, cy + d, cx - w, cy + d * 0.71, cx - w, cy - 1);
  h.closePath();
  h.clip();
  h.drawImage(cat, 0, 0);
  const canvas = newCanvas(ICON_SIZE, ICON_SIZE);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLOR.icon;
  ctx.fillRect(0, 0, ICON_SIZE, ICON_SIZE);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(head, 150, 60, 660, 660, 0, -ICON_SIZE * 0.01, ICON_SIZE, ICON_SIZE);
  return canvas;
}

for (const [name, draw] of [['ogp.png', drawOgp], ['icon.png', drawIcon]]) {
  const canvas = draw();
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = name;
  link.textContent = `${name} を保存（${canvas.width}×${canvas.height}）`;
  const p = document.createElement('p');
  p.append(link);
  document.body.append(canvas, p);
}
