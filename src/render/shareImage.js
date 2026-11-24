// シェアする画像を描く。部屋と猫は、ゲームと同じ描画（renderer.js）で別の Canvas に描いて切り取る
import { SHARE } from '../data/params.js';
import { createRenderer, W, H } from './renderer.js';

// style.css の --font と同じ
const FONT = '"Hiragino Maru Gothic ProN", "Hiragino Maru Gothic Pro", "BIZ UDPGothic", "Yu Gothic UI", "Meiryo", sans-serif';
const COLOR = { paper: '#fdf6ec', ink: '#5a3e2b', soft: '#8a6d58', accent: '#d9823b', frame: '#e7cfb4', paw: 'rgba(244, 182, 194, 0.55)' };
// 部屋と猫を描く Canvas の幅。切り取って広げても線がぼやけない大きさにする
const SHOT_W = 1800;
// 膝に乗り終わった姿にするため、少し時間を進めてから使う（1.0秒ぶん。猫がまばたきを始める前）
const FRAMES = 10;
const FRAME_SEC = 0.1;

/**
 * card: shareCard の結果、shot: shareView の結果（src/game/shareCard.js）
 * @returns {string|null} PNG の data URL。作れなければ null
 */
export function createShareImage({ card, shot, coat, face, personality }) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = SHARE.image.w;
    canvas.height = SHARE.image.h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = COLOR.paper;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    paw(ctx, 110, 120, 1.7, -0.4);
    paw(ctx, 975, 110, 1.4, 0.4);
    paw(ctx, 100, 1270, 1.4, 0.3);
    paw(ctx, 985, 1265, 1.5, -0.3);
    const room = drawShot(shot, { coat, face, personality });
    drawPicture(ctx, room, shot.crop);
    // 大きな Canvas のメモリを、すぐに手放す（何度も開いたときに、iOS の上限に届かないように）
    room.width = 0;
    room.height = 0;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitText(ctx, card.headline[0], 62, 120, COLOR.ink, 700);
    fitText(ctx, card.headline[1], 112, 235, COLOR.accent, 920);
    fitText(ctx, card.type, 70, 1108, COLOR.ink, 900);
    fitText(ctx, card.nameLine, 44, 1194, COLOR.soft, 820);
    fitText(ctx, card.title, 40, 1284, COLOR.accent, 700);
    return canvas.toDataURL('image/png');
  } catch (e) {
    console.warn('シェアする画像を作れませんでした', e);
    return null;
  }
}

function drawShot(shot, look) {
  const canvas = document.createElement('canvas');
  const renderer = createRenderer(canvas);
  const draw = (i) => renderer.draw({ ...look, ...shot.view }, i * FRAME_SEC, FRAME_SEC);
  // 途中は小さく描いて（重くならないように）、最後の1枚だけ大きく描く
  canvas.width = W;
  canvas.height = H;
  for (let i = 0; i < FRAMES; i++) draw(i);
  canvas.width = SHOT_W;
  canvas.height = (SHOT_W / W) * H;
  draw(FRAMES);
  return canvas;
}

function drawPicture(ctx, canvas, crop) {
  const P = SHARE.picture;
  const k = SHOT_W / W;
  ctx.save();
  roundRect(ctx, P);
  ctx.clip();
  ctx.drawImage(canvas, crop.x * k, crop.y * k, crop.w * k, crop.h * k, P.x, P.y, P.w, P.h);
  ctx.restore();
  ctx.lineWidth = 10;
  ctx.strokeStyle = COLOR.frame;
  roundRect(ctx, P);
  ctx.stroke();
}

// 角の丸い四角（ctx.roundRect は古いブラウザにないので、自分で描く）
function roundRect(ctx, { x, y, w, h, r }) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 真ん中に1行。max の幅を超えるときは、文字を小さくして収める
function fitText(ctx, text, size, y, color, max) {
  ctx.font = `bold ${size}px ${FONT}`;
  const w = ctx.measureText(text).width;
  if (w > max) ctx.font = `bold ${Math.floor((size * max) / w)}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.fillText(text, SHARE.image.w / 2, y);
}

// すみの肉球
function paw(ctx, x, y, s, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.fillStyle = COLOR.paw;
  for (const [dx, dy, rx, ry] of [[0, 8, 20, 16], [-24, -12, 8, 9], [-8, -24, 8, 9], [8, -24, 8, 9], [24, -12, 8, 9]]) {
    ctx.beginPath();
    ctx.ellipse(dx, dy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
