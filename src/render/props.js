// イベントの小道具（4〜6日目）。描く位置・大きさは src/render/renderer.js が決め、ここではそれぞれの座標で描く
// （箱は底の真ん中、小鳥は胴の真ん中、本は真ん中が原点。枝は窓の座標のまま）。
// 線の色・太さは renderer の猫と同じ

const LINE = '#4e3d36';
const LW = 3.5;

function line(ctx, x0, y0, x1, y1) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/**
 * 通販の箱。夜に置く無地の段ボール（renderer の inBox）と見分けがつくよう、明るい色・ガムテープ・宛名ラベル・
 * 「ワレモノ」シール・詰め物の紙を付ける。前面とフタは、伏せた猫の体をすっかり隠す大きさ
 * inside：箱の内側（奥）を描く。猫が顔を出している間は、首の前に奥の壁が来ないよう描かない
 * pile：詰め物の紙を山盛りにする（もぐっている間。猫の頭を隠し、耳の先だけ出る）
 */
export function drawParcel(ctx, { inside = true, paper = true, pile = false } = {}) {
  ctx.save();
  ctx.lineWidth = LW;
  ctx.strokeStyle = LINE;
  if (inside) {
    ctx.fillStyle = '#b98a56';
    ctx.beginPath();
    ctx.moveTo(-64, -66);
    ctx.lineTo(64, -66);
    ctx.lineTo(52, -78);
    ctx.lineTo(-52, -78);
    ctx.closePath();
    ctx.fill();
  }
  if (paper) {
    ctx.fillStyle = '#fffaf2';
    const balls = pile
      ? [[-46, -70, 13], [-24, -76, 15], [2, -80, 17], [28, -76, 15], [48, -70, 12], [-34, -88, 12], [-10, -94, 13], [18, -92, 12], [40, -86, 10]]
      : [[-44, -68, 8], [-24, -70, 7], [26, -70, 7], [46, -68, 8]];
    for (const [x, y, r] of balls) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  // フタ（外に開いている）
  ctx.fillStyle = '#d9a86c';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 64, -66);
    ctx.lineTo(side * 98, -86);
    ctx.lineTo(side * 92, -44);
    ctx.lineTo(side * 64, -38);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // 前面
  ctx.fillStyle = '#ebc48e';
  ctx.beginPath();
  ctx.rect(-64, -66, 128, 66);
  ctx.fill();
  ctx.stroke();
  // ガムテープ（真ん中を縦に）
  ctx.fillStyle = 'rgba(196, 150, 92, 0.85)';
  ctx.fillRect(-11, -66, 22, 66);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.fillRect(-11, -66, 5, 66);
  // 宛名ラベル
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(20, -52, 36, 26);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(78, 61, 54, 0.5)';
  for (let i = 0; i < 3; i++) line(ctx, 25, -45 + i * 7, 51 - i * 6, -45 + i * 7);
  // 「ワレモノ」シール
  ctx.fillStyle = '#e46d5c';
  ctx.fillRect(-58, -54, 42, 16);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('ワレモノ', -55, -43);
  ctx.restore();
}

// もぐった瞬間に舞う紙くず。u は 0〜1（舞い上がって、消えていく）
export function drawPaperBits(ctx, u) {
  ctx.save();
  ctx.globalAlpha = 1 - u;
  ctx.fillStyle = '#fffaf2';
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  for (const [dx, h] of [[-50, 1], [-20, 1.3], [16, 1.2], [46, 0.9]]) {
    const x = dx * (1 + u * 0.6);
    const y = -80 - Math.sin(u * Math.PI) * 50 * h;
    ctx.beginPath();
    ctx.rect(x - 5, y - 4, 10, 8);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// 小道具に添える短い文字（「ドサッ」「？」「カサカサ」）。遠くて小さく描かれるときも読めるよう、fit で大きさを補う
export function drawPropText(ctx, text, x, y, size, fit = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(fit, fit);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = LINE;
  ctx.font = `bold ${size}px sans-serif`;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/**
 * 窓の外の木の枝と葉（窓の外に鳥の日）。窓（renderer の drawRoom。x 36〜168, y 76〜194）の座標でそのまま描く。
 * 窓の形で切り抜いた中に描くので、はみ出した分は見えない
 */
export function drawBranch(ctx) {
  ctx.save();
  ctx.strokeStyle = '#8a6748';
  ctx.lineCap = 'round';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(20, 176);
  ctx.quadraticCurveTo(80, 166, 150, 172);
  ctx.stroke();
  ctx.lineWidth = 3;
  line(ctx, 70, 170, 84, 154);
  ctx.fillStyle = '#9cc58a';
  for (const [x, y] of [[86, 151], [52, 168], [128, 166], [100, 175]]) {
    ctx.beginPath();
    ctx.ellipse(x, y, 7, 4, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// 小鳥（右向き。原点は胴の真ん中）。flying：飛んでいる間は羽ばたき、足をたたむ
export function drawBird(ctx, t, flying) {
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = LINE;
  ctx.fillStyle = '#8fb7d9';
  ctx.beginPath();
  ctx.ellipse(0, 0, 11, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(9, -5, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f0b44c';
  ctx.beginPath();
  ctx.moveTo(15, -5);
  ctx.lineTo(20, -3);
  ctx.lineTo(15, -1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = LINE;
  ctx.beginPath();
  ctx.arc(10, -6, 1.3, 0, Math.PI * 2);
  ctx.fill();
  const flap = flying ? Math.sin(t * 30) * 8 : Math.sin(t * 3) * 1.5;
  ctx.fillStyle = '#6f9ac2';
  ctx.beginPath();
  ctx.moveTo(-4, -2);
  ctx.lineTo(-10, -10 - flap);
  ctx.lineTo(4, -4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (!flying) {
    line(ctx, -2, 7, -3, 12);
    line(ctx, 3, 7, 3, 12);
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 開いた本（読書中）。原点は本の真ん中（背）。大きさは renderer の BOOK_RECT。flip（0〜1）はページをめくる動き（範囲外なら描かない）
export function drawOpenBook(ctx, flip) {
  ctx.save();
  ctx.lineWidth = LW;
  ctx.strokeStyle = LINE;
  ctx.fillStyle = '#c96f5a';
  roundRect(ctx, -112, -60, 224, 92, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fffaf0';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, -48);
    ctx.quadraticCurveTo(side * 50, -62, side * 102, -50);
    ctx.lineTo(side * 102, 22);
    ctx.quadraticCurveTo(side * 50, 10, 0, 24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // 文字の行
  ctx.strokeStyle = 'rgba(78, 61, 54, 0.3)';
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++) line(ctx, side * 18, -34 + i * 11, side * 86, -38 + i * 11);
  if (flip > 0 && flip < 1) {
    // めくれているページ
    ctx.fillStyle = '#fff3dc';
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 3;
    const w = Math.cos(flip * Math.PI) * 100;
    ctx.beginPath();
    ctx.moveTo(0, -48);
    ctx.quadraticCurveTo(w / 2, -70 - Math.sin(flip * Math.PI) * 12, w, -52);
    ctx.lineTo(w, 20);
    ctx.quadraticCurveTo(w / 2, 6, 0, 24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// 閉じた本を右手に持つ（猫が本の上に乗ったあと。開いた本の片側ぶんの大きさ）。原点は本の真ん中。skin：親指の色（renderer の LAP_COLORS.skin）
export function drawClosedBook(ctx, skin) {
  ctx.save();
  ctx.lineWidth = LW;
  ctx.strokeStyle = LINE;
  // ページの小口
  ctx.fillStyle = '#fffaf0';
  roundRect(ctx, -50, -44, 104, 88, 6);
  ctx.fill();
  ctx.stroke();
  // 表紙
  ctx.fillStyle = '#c96f5a';
  roundRect(ctx, -56, -48, 104, 92, 8);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(78, 61, 54, 0.35)';
  ctx.lineWidth = 2;
  line(ctx, -44, -48, -44, 44);
  ctx.fillStyle = '#f3d9a6';
  ctx.fillRect(-28, -24, 56, 14);
  // 本をつかむ親指
  ctx.fillStyle = skin;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = LW;
  ctx.beginPath();
  ctx.ellipse(-52, 8, 11, 15, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
