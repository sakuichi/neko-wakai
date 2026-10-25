// 猫・部屋の描画（Canvas）。ゲームの判定には関わらず、渡された状態を描くだけ。
// 論理座標は 360×640。
//
// 猫の描き方ルール（目標：ねこあつめ・ねこさがし系のシンプルなデフォルメ）
// - 頭は横長の「おもち形」で、体より大きく（頭:体 ≒ 1.5:1）
// - 目は小さな縦長の点。口は「ω」だけ。ひげ・鼻は描かない
// - ほっぺに薄いピンク。色はベタ塗りでグラデーションを使わない
// - 線は均一な太さのこげ茶。角は丸く
import { MAX_VALUE, RULES } from '../data/params.js';

export const W = 360;
export const H = 640;

// 毛色（色違い）。キーは GameState.coat、名前は src/data/texts.js の COAT_LABELS、性格との対応は src/data/params.js の COAT_PERSONALITY。
// eye・face は省略可（目と口の色。省略すると共通の色）
// 柄そのものを増やすとき（ハチワレ・三毛など）は、描画の関数側に手を入れる
export const COATS = {
  chatora: { fur: '#f6bb78', stripe: '#e49a57', white: '#fffdf7' },
  kijitora: { fur: '#c9a27c', stripe: '#8e6a4c', white: '#fffdf7' },
  sabatora: { fur: '#c5c9cf', stripe: '#8b939d', white: '#fffdf7' },
  cream: { fur: '#f8ddb4', stripe: '#eec48f', white: '#fffdf7' },
  shiro: { fur: '#fffaf2', stripe: '#fffaf2', white: '#fffaf2' },
  // 黒い毛にこげ茶の目・口だと見えないので、目は金色、口は明るい色にする
  kuro: { fur: '#45414b', stripe: '#45414b', white: '#58535f', eye: '#f2d36b', face: '#d8cec6' },
};
// いま描いている猫の毛色。draw() の最初に view.coat から決める
let COAT = COATS.chatora;

const C = {
  line: '#4e3d36',
  eye: '#3b2f2a',
  earIn: '#f6c3c6',
  blush: 'rgba(246, 150, 168, 0.55)',
  skin: '#f6d6bf',
  pants: '#b9c6d3',
  pantsLine: '#8d9db0',
  sleeve: '#efb7a0',
  heart: '#f27a93',
  red: '#e0566f',
};
const LW = 3.2;
// テストで輪郭線を見分けるために公開する
export const LINE_COLOR = C.line;
export const LINE_WIDTH = LW;
export const LAP_COLORS = { pants: C.pants, sleeve: C.sleeve, skin: C.skin };

// 1日目の名前付けで、猫を大きく映すときの位置と大きさ
const CLOSEUP = { x: 180, y: 615, s: 2.1 };
// いちばん近づいたとき（膝に乗る前）の足もと。膝の上端（y≒548）より奥にとどまる
const NEAREST_Y = 546;
// 膝の上に座ったときの位置と大きさ
const LAP_SEAT = { x: 180, y: 612, s: 1.3 };
const LAP_JUMP_SEC = 0.5;
// 近づいてくる道すじの蛇行：距離100あたり約1.5往復、幅は猫の大きさ1あたり80
const PATH_FREQ = (Math.PI * 2 * 1.5) / MAX_VALUE;
const PATH_AMP = 80;
// なでようと手を伸ばして戻すまでの時間
const REACH_SEC = 0.45;

const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const a = {
    shownDistance: MAX_VALUE,
    lastMode: null,
    modeStart: 0,
    nextBlink: 2,
    blinkStart: -10,
    effects: [],
    shakeUntil: 0,
    lid: 0,
    now: 0,
    // 膝に跳び乗る途中（0=膝の奥、1=膝の上）
    lapBlend: 0,
    shownP: null,
    // 近づいてくる道すじ（蛇行）のずれ。昼が始まるたびに選び直す
    pathPhase: Math.random() * Math.PI * 2,
    // 道すじを選び直したときの横のずれ。いまの位置から急に跳ばないように、少しずつ0に戻す
    pathOffset: 0,
    lastScene: null,
    // 歩いている向き（-1=左、0=正面、1=右）。顔と体の傾きに使う
    facing: 0,
  };

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
  }

  function toLogical(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * H };
  }

  // 猫は、ゆるく左右に蛇行しながら近づいてくる（道すじは日ごとに変わる）。
  // 膝の前では真ん中に来るように、近いほど左右の幅を小さくする
  function placement(distance) {
    const u = distance / MAX_VALUE;
    const s = lerp(1.2, 0.55, u);
    const sway = Math.sin(distance * PATH_FREQ + a.pathPhase) * PATH_AMP * s * clamp01(distance / 25);
    return { x: lerp(180, 214, u) + sway + a.pathOffset, y: lerp(NEAREST_Y, 372, u), s };
  }

  // 膝に乗るときは、膝の奥から膝の上へ、ぴょんと跳び乗る
  function catPosition(distance) {
    const p = placement(distance);
    if (a.lapBlend <= 0) return p;
    const u = a.lapBlend;
    return { x: lerp(p.x, LAP_SEAT.x, u), y: lerp(p.y, LAP_SEAT.y, u) - Math.sin(u * Math.PI) * 40, s: lerp(p.s, LAP_SEAT.s, u) };
  }

  function hitTestCat(x, y) {
    const p = a.shownP ?? placement(a.shownDistance);
    const cy = p.y - 55 * p.s;
    const r = Math.max(48, 72 * p.s);
    return (x - p.x) ** 2 + (y - cy) ** 2 <= r * r;
  }

  // data: 足あと（paw）なら { x, y }（論理座標）
  function addEffect(type, data = {}) {
    a.effects.push({ type, t0: a.now, ...data });
    if (type === 'kick') a.shakeUntil = a.now + 0.35;
  }

  /**
   * view: { scene, cat?: {mode, distance}, coat?, personality?, wariness?, closeup?, blinkHoldMs?, lapTime?, endingId? }
   */
  function draw(view, t, dt) {
    a.now = t;
    COAT = COATS[view.coat] ?? COATS.chatora;
    const cat = poseFor(view);
    if (view.scene !== a.lastScene) {
      if (view.scene === 'day') {
        const before = placement(a.shownDistance).x;
        a.pathPhase = Math.random() * Math.PI * 2;
        a.pathOffset += before - placement(a.shownDistance).x;
      }
      a.lastScene = view.scene;
    }
    if (cat.mode !== a.lastMode) {
      a.lastMode = cat.mode;
      a.modeStart = t;
    }
    const follow = cat.mode === 'flee' ? 10 : 5;
    // アップの間は、次の画面（部屋の隅から始まる）に合わせて距離を先に戻しておく
    if (view.closeup) a.shownDistance = MAX_VALUE;
    else a.shownDistance += (cat.distance - a.shownDistance) * clamp01(dt * follow);
    a.pathOffset *= Math.exp(-dt * 1.5);
    updateIdleBlink(t);
    a.lapBlend = cat.mode === 'lap' ? Math.min(1, a.lapBlend + dt / LAP_JUMP_SEC) : 0;

    const scale = canvas.width / W;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.save();
    if (t < a.shakeUntil) ctx.translate(Math.sin(t * 90) * 4, Math.cos(t * 70) * 2);
    drawRoom(ctx, view.scene === 'night');
    // なでようと手を伸ばしている間は、左手を膝から離す（腕が3本に見えないように）
    const reaching = a.effects.some((e) => e.type === 'reach' && t - e.t0 < REACH_SEC);
    const lap = () => {
      if (!view.closeup) drawLap(ctx, { leftHand: !reaching });
    };

    const p = view.closeup ? CLOSEUP : catPosition(a.shownDistance);
    const dx = a.shownP ? p.x - a.shownP.x : 0;
    const facingTo = cat.walking && Math.abs(dx) > 0.02 ? Math.sign(dx) : 0;
    a.facing += (facingTo - a.facing) * clamp01(dt * 6);
    a.shownP = p;
    // 膝に乗るまでは、猫は膝の奥（膝を手前に描く）。跳び乗ったら膝の上（猫を手前に描く）
    const onLap = cat.mode === 'lap' && a.lapBlend > 0.6;
    if (onLap) lap();
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(p.s, p.s);
    drawShadow(ctx, cat.mode);
    drawCat(ctx, cat.mode, {
      t,
      modeT: t - a.modeStart,
      blink: eyelidAmount(t),
      lapT: view.lapTime ?? 0,
      scale: p.s,
      walking: !!cat.walking,
      closeup: !!view.closeup,
      facing: a.facing,
      personality: view.personality,
      wariness: view.wariness ?? 0,
    });
    drawEffects(ctx, t);
    ctx.restore();
    if (!onLap) lap();

    drawReach(ctx, t, p);
    drawPaws(ctx, t);
    ctx.restore();

    drawPlayerEyelids(ctx, view.blinkHoldMs ?? 0, dt);
    drawBlinkGauge(ctx, view.blinkHoldMs ?? 0);
    a.effects = a.effects.filter((e) => t - e.t0 < 2);
  }

  function poseFor(view) {
    if (view.scene === 'title') return { mode: 'relax', distance: 55 };
    if (view.scene === 'ending') {
      return view.endingId === 'visitor' ? { mode: 'tailUp', distance: 55 } : { mode: 'lap', distance: 0 };
    }
    if (view.cat) return view.cat;
    return { mode: 'relax', distance: MAX_VALUE };
  }

  function updateIdleBlink(t) {
    if (t >= a.nextBlink) {
      a.blinkStart = t;
      a.nextBlink = t + 2.5 + Math.random() * 3;
    }
  }

  // 0=開いている 1=閉じている
  function eyelidAmount(t) {
    const back = a.effects.find((e) => e.type === 'blinkBack');
    if (back) {
      const u = (t - back.t0) / 1.4;
      if (u < 1) return Math.sin(u * Math.PI) ** 0.6;
    }
    const u = (t - a.blinkStart) / 0.18;
    return u >= 0 && u < 1 ? Math.sin(u * Math.PI) : 0;
  }

  function drawEffects(ctx, t) {
    for (const e of a.effects) {
      const u = t - e.t0;
      if (e.type === 'purr' || e.type === 'blinkBack') {
        const n = e.type === 'purr' ? 4 : 1;
        for (let i = 0; i < n; i++) {
          const k = u - i * 0.18;
          if (k < 0 || k > 1.4) continue;
          const x = (i % 2 ? 1 : -1) * (24 + i * 8) + Math.sin(k * 6 + i) * 5;
          heart(ctx, x, -135 - k * 50, 9 - k * 2, 1 - k / 1.4);
        }
      } else if (e.type === 'kick' && u < 0.5) {
        burst(ctx, -45, -70, u / 0.5);
      } else if (e.type === 'stare' && u < 1.2) {
        sweat(ctx, 44, -118, u);
      }
    }
  }

  // なでようとしたとき、膝に置いていた左手が猫のほうへ伸びる
  function drawReach(ctx, t, p) {
    const reach = a.effects.find((e) => e.type === 'reach' && t - e.t0 < REACH_SEC);
    if (!reach) return;
    const k = Math.sin(((t - reach.t0) / REACH_SEC) * Math.PI);
    const rest = restingHand(-1);
    drawArm(ctx, -1, lerp(rest.x, p.x - 30 * p.s, k * 0.9), lerp(rest.y, p.y - 60 * p.s, k * 0.9));
  }

  // 猫以外をタップしたところに、肉球の足あとを残す
  function drawPaws(ctx, t) {
    for (const e of a.effects) {
      if (e.type !== 'paw') continue;
      const u = (t - e.t0) / 0.9;
      if (u >= 1) continue;
      ctx.save();
      ctx.globalAlpha = (1 - u) * 0.85;
      ctx.translate(e.x, e.y - u * 6);
      ctx.scale(0.8 + u * 0.2, 0.8 + u * 0.2);
      ellipse(ctx, 0, 3, 7, 6, C.heart);
      for (const [dx, dy] of [[-8, -6], [-3, -10], [3, -10], [8, -6]]) ellipse(ctx, dx, dy, 2.6, 3, C.heart);
      ctx.restore();
    }
  }

  function drawPlayerEyelids(ctx, holdMs, dt) {
    const target = holdMs > 0 ? clamp01(holdMs / 600) * 0.46 : 0;
    a.lid += (target - a.lid) * clamp01(dt * (holdMs > 0 ? 8 : 12));
    if (a.lid < 0.003) return;
    const h = a.lid * H;
    ctx.save();
    ctx.fillStyle = 'rgba(59, 44, 37, 0.92)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W, 0);
    ctx.lineTo(W, h);
    ctx.quadraticCurveTo(W / 2, h + 40, 0, h);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(W, H);
    ctx.lineTo(W, H - h);
    ctx.quadraticCurveTo(W / 2, H - h - 40, 0, H - h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // まばたきの長さのゲージ。ちょうどいい長さ（minHoldMs〜maxHoldMs）を緑で示す
  function drawBlinkGauge(ctx, holdMs) {
    if (holdMs <= 0) return;
    const { minHoldMs, maxHoldMs } = RULES.blink;
    const full = maxHoldMs + 500;
    const x0 = 90;
    const w = 180;
    const y = H / 2;
    const at = (ms) => x0 + (Math.min(ms, full) / full) * w;
    const ok = holdMs >= minHoldMs && holdMs <= maxHoldMs;
    ctx.save();
    ctx.globalAlpha = clamp01(holdMs / 200);
    roundRect(ctx, x0 - 4, y - 9, w + 8, 18, 9);
    ctx.fillStyle = 'rgba(255, 250, 243, 0.92)';
    ctx.fill();
    roundRect(ctx, at(minHoldMs), y - 5, at(maxHoldMs) - at(minHoldMs), 10, 5);
    ctx.fillStyle = ok ? '#8fcf7e' : '#c7e6bd';
    ctx.fill();
    ellipse(ctx, at(holdMs), y, 7, 7, ok ? '#5aa548' : '#fffaf3', C.line, 0, 2.4);
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    const label = holdMs < minHoldMs ? 'ゆっくり……' : ok ? 'いま離す！' : 'ながすぎ……';
    ctx.lineWidth = 4;
    ctx.strokeStyle = C.line;
    ctx.strokeText(label, W / 2, y - 18);
    ctx.fillStyle = '#fffaf3';
    ctx.fillText(label, W / 2, y - 18);
    ctx.restore();
  }

  // 直前に猫を描いた位置 {x, y, s}（まだ描いていなければ null）
  const shownPosition = () => a.shownP;

  return { resize, toLogical, hitTestCat, addEffect, draw, shownPosition };
}

// ---------------------------------------------------------------- 部屋（ベタ塗り）

function drawRoom(ctx, night) {
  ctx.fillStyle = night ? '#454160' : '#f7ead8';
  ctx.fillRect(0, 0, W, 345);

  // 窓とカーテン
  ctx.save();
  roundRect(ctx, 36, 76, 132, 118, 10);
  ctx.fillStyle = night ? '#2c3156' : '#cbe7f3';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#fffdf7';
  ctx.stroke();
  ctx.lineWidth = 4;
  line(ctx, 102, 78, 102, 192);
  line(ctx, 38, 135, 166, 135);
  ctx.fillStyle = night ? '#9b7a8c' : '#f5c8bf';
  for (const side of [0, 1]) {
    const x0 = side ? 160 : 24;
    ctx.beginPath();
    ctx.moveTo(x0, 66);
    ctx.lineTo(x0 + 20, 66);
    ctx.quadraticCurveTo(x0 + (side ? 2 : 18), 140, x0 + (side ? 14 : 6), 204);
    ctx.lineTo(x0 + (side ? 20 : 0), 204);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 壁の額（肉球）
  ctx.save();
  roundRect(ctx, 240, 96, 72, 58, 8);
  ctx.fillStyle = '#fffdf7';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#d0a57a';
  ctx.stroke();
  ellipse(ctx, 276, 132, 10, 8, '#f4b6c2');
  for (const [dx, dy] of [[-12, -10], [-4, -16], [4, -16], [12, -10]]) ellipse(ctx, 276 + dx, 132 + dy, 4, 4.5, '#f4b6c2');
  ctx.restore();

  // 床
  ctx.fillStyle = night ? '#6f5d56' : '#ead0a8';
  ctx.fillRect(0, 345, W, H - 345);
  ctx.fillStyle = night ? '#5a4c48' : '#dcbd92';
  ctx.fillRect(0, 338, W, 9);
  ctx.save();
  ctx.strokeStyle = night ? 'rgba(0,0,0,0.1)' : 'rgba(170, 120, 72, 0.16)';
  ctx.lineWidth = 2;
  for (let i = -4; i <= 4; i++) line(ctx, 180 + i * 40, 347, 180 + i * 130, H);
  ctx.restore();

  // ラグ
  ellipse(ctx, 185, 520, 150, 62, night ? '#86677a' : '#f7d4c6');
  ellipse(ctx, 185, 520, 124, 48, null, night ? '#9b7d8e' : '#fae4da', 0, 3);

  // 植木鉢
  for (const [dx, rot] of [[-8, -0.5], [0, 0], [8, 0.5]]) ellipse(ctx, 318 + dx, 296, 8, 22, '#8dbb7f', null, rot);
  ctx.save();
  roundRect(ctx, 302, 308, 32, 34, 6);
  ctx.fillStyle = '#dd9469';
  ctx.fill();
  ctx.restore();
}

// 画面手前の、プレイヤーの膝（正座しているのを上から見たところ）。
// 丸を2つ並べるだけだと胸に見えるので、太ももの長さ・ひざ頭・膝に置いた手と袖で「自分の膝」とわかるようにする
function drawLap(ctx, { leftHand = true } = {}) {
  ctx.save();
  for (const side of [-1, 1]) {
    // 太もも：左右のひざをそろえて座っている。外側は手前（画面の下）に向かって少し広がる
    const cx = 180 + side * 80;
    const x = (dx) => 180 + side * dx;
    ctx.beginPath();
    ctx.moveTo(x(0), H + 10);
    ctx.lineTo(x(2), 592);
    ctx.bezierCurveTo(x(4), 548, x(150), 546, x(152), 592);
    ctx.lineTo(x(170), H + 10);
    ctx.closePath();
    ctx.fillStyle = C.pants;
    ctx.fill();
    ctx.lineWidth = LW;
    ctx.strokeStyle = C.line;
    ctx.stroke();
    // ひざ頭と、ももの外側の縫い目
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = C.pantsLine;
    ctx.beginPath();
    ctx.moveTo(cx - 24, 584);
    ctx.quadraticCurveTo(cx, 572, cx + 24, 584);
    ctx.stroke();
    ctx.setLineDash([5, 6]);
    line(ctx, x(140), 604, x(150), H);
    ctx.setLineDash([]);
  }
  if (leftHand) drawRestingHand(ctx, -1);
  drawRestingHand(ctx, 1);
  ctx.restore();
}

// 膝に置いた手の位置（side: -1=左手, 1=右手）
function restingHand(side) {
  return { x: 180 + side * 116, y: 584 };
}

// 袖は画面の外（体のほう）から続く
function shoulderOf(side) {
  return { x: 180 + side * 176, y: H + 30 };
}

function drawRestingHand(ctx, side) {
  const h = restingHand(side);
  drawArm(ctx, side, h.x, h.y);
}

// 腕：袖 → 袖口 → 手 の順に描く。袖口と手は、肩から手へ向かう腕の向きにそろえる
// （向きがずれると、袖口の輪郭が腕から浮いて見える）。袖の先は手のひらの下に隠す
function drawArm(ctx, side, hx, hy) {
  const sh = shoulderOf(side);
  const ang = Math.atan2(hy - sh.y, hx - sh.x);
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  // 袖口は手首（手のひらの下に少し入る）から、肩のほうへ CUFF だけの帯
  const at = (d, w = 0) => ({ x: hx - ux * d - uy * w, y: hy - uy * d + ux * w });
  const WRIST = 14;
  const CUFF = 13;
  const wrist = at(WRIST);
  const seam = at(WRIST + CUFF);
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 32;
  line(ctx, sh.x, sh.y, wrist.x, wrist.y);
  ctx.strokeStyle = C.sleeve;
  ctx.lineWidth = 25.6;
  line(ctx, sh.x, sh.y, seam.x, seam.y);
  // 袖口：袖と同じ色の帯に、ゴム編みの筋と、袖との境目の線
  const W = 15;
  const corners = [at(WRIST, -W), at(WRIST, W), at(WRIST + CUFF, W), at(WRIST + CUFF, -W)];
  ctx.beginPath();
  corners.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
  ctx.closePath();
  ctx.fillStyle = C.sleeve;
  ctx.fill();
  ctx.strokeStyle = 'rgba(160, 84, 60, 0.4)';
  ctx.lineWidth = 1.6;
  for (const w of [-8, 0, 8]) {
    const a0 = at(WRIST, w);
    const a1 = at(WRIST + CUFF, w);
    line(ctx, a0.x, a0.y, a1.x, a1.y);
  }
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  corners.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  // 手：指先は腕の向きの先
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(ang + Math.PI / 2);
  // 親指は内側（体の真ん中のほう）
  ellipse(ctx, side * -14, 4, 6.5, 10, C.skin, C.line, side * 0.4);
  ellipse(ctx, 0, -2, 17, 20, C.skin, C.line);
  ctx.lineWidth = 2;
  ctx.strokeStyle = C.line;
  for (const fx of [-7, 0, 7]) line(ctx, fx, -21, fx, -11);
  ctx.restore();
}

function drawShadow(ctx, mode) {
  const w = mode === 'belly' || mode === 'lap' ? 62 : mode === 'inBox' ? 60 : 42;
  ellipse(ctx, mode === 'belly' ? -8 : 0, 0, w, 8, 'rgba(90, 62, 43, 0.13)');
}

// ---------------------------------------------------------------- 猫

// 性格ごとの仕草。サインの見分けやすさは変えず、雰囲気だけを変える
// - 甘えん坊：いつも首をかしげて、ゆらゆらしている
// - ツンデレ：ごきげんなときほど、目をそらす
// - ビビり：警戒しているあいだは耳を伏せて、小さく震える
function personalize(mode, k, opts) {
  const o = { ...opts };
  if (k.personality === 'amaenbo') {
    o.tilt = (o.tilt ?? 0) + 0.08 + Math.sin(k.t * 1.8) * 0.06;
  } else if (k.personality === 'tsundere' && (mode === 'tailUp' || mode === 'purr')) {
    o.faceDx = -8;
  } else if (k.personality === 'bibiri' && k.wariness >= 20 && (o.ears ?? 'up') === 'up') {
    o.ears = 'half';
  }
  return o;
}

function drawCat(ctx, mode, k) {
  const breath = 1 + 0.025 * Math.sin(k.t * 2.4);
  const sit = (opts) => sitting(ctx, k, breath, personalize(mode, k, opts));
  if (k.personality === 'bibiri' && k.wariness >= 30 && mode !== 'flee' && mode !== 'lap') {
    ctx.translate(Math.sin(k.t * 47) * 0.9, 0);
  }
  switch (mode) {
    case 'relax':
      // 近づいている間は歩く。止まったら香箱座り
      if (k.walking) return walk(ctx, k, breath, personalize(mode, k, {}));
      return loaf(ctx, k, breath, 'sleep', personalize(mode, k, {}).ears);
    case 'look':
      sit({ eyes: 'dotBig', tail: 'sway', tilt: Math.sin(k.t * 1.5) * 0.07 });
      // 「チラッ」は昼の駆け引きの合図。名前を付けるときのアップでは出さない
      if (!k.closeup) lookCue(ctx, k);
      return;
    case 'tailUp':
      ctx.translate(0, -Math.abs(Math.sin(k.t * 4)) * 2);
      return sit({ eyes: 'dot', tail: 'up' });
    case 'tailFlick':
      sit({ eyes: 'grumpy', mouth: 'he', tail: 'flick', ears: 'back' });
      return angerMark(ctx, 38, -126, k.t);
    case 'belly':
      return belly(ctx, k, breath);
    case 'backTurn':
      return backView(ctx, k, breath);
    case 'rub':
      ctx.rotate(Math.sin(k.t * 3) * 0.06);
      return sit({ eyes: 'happy', tail: 'up', tilt: 0.3 + Math.sin(k.t * 3) * 0.1 });
    case 'fakeRub':
      // すり寄りと同じ仕草だが、しっぽはパタパタ、目は笑っていない
      ctx.rotate(Math.sin(k.t * 3) * 0.06);
      return sit({ eyes: 'dot', tail: 'flick', tilt: 0.3 + Math.sin(k.t * 3) * 0.1 });
    case 'purr':
      return sit({ eyes: 'happy', tail: 'sway', tilt: 0.12 });
    case 'flee': {
      const jump = Math.sin(clamp01(k.modeT / 0.4) * Math.PI) * 26;
      ctx.translate(0, -jump);
      ctx.scale(1.08, 1.08);
      sitting(ctx, k, breath, { eyes: 'shock', mouth: 'o', tail: 'puff', ears: 'back' });
      return exclaim(ctx, 44, -132);
    }
    case 'inBox':
      return inBox(ctx, k);
    case 'lap':
      return onLap(ctx, k, breath);
    default:
      return loaf(ctx, k, breath, 'sleep');
  }
}

function sitting(ctx, k, breath, { eyes, mouth = 'w', tail, tilt = 0, ears = 'up', faceDx = 0, kneadT = null }) {
  drawTail(ctx, tail, k.t);
  // 後ろ足
  for (const side of [-1, 1]) ellipse(ctx, side * 25, -7, 13, 8, COAT.fur, C.line);
  // 胴体（小さめの豆形）
  ctx.save();
  ctx.translate(0, -2);
  ctx.scale(1, breath);
  furShape(ctx, (c) => c.ellipse(0, -28, 33, 30, 0, 0, Math.PI * 2), () => ellipse(ctx, 0, -22, 18, 22, COAT.white));
  ctx.restore();
  // 前足（ふみふみ中は交互に上下）
  for (const side of [-1, 1]) {
    let lift = 0;
    if (kneadT !== null) lift = Math.max(0, Math.sin(kneadT * 7 + (side > 0 ? Math.PI : 0))) * 7;
    paw(ctx, side * 11, -5 - lift);
  }
  head(ctx, 0, -80, { tilt, eyes, mouth, ears, faceDx, blink: k.blink });
}

// 歩く：小さく弾みながら前足を交互に出し、進む向きに少し体を傾けて顔を向ける。
// しっぽは立てない（しっぽピンのサインと見分けがつくように）
function walk(ctx, k, breath, opts) {
  const step = k.t * 9;
  ctx.translate(0, -Math.abs(Math.sin(step)) * 3);
  ctx.rotate(k.facing * 0.07 + Math.sin(step) * 0.03);
  sitting(ctx, k, breath, { eyes: 'dot', tail: 'sway', kneadT: k.t * 1.3, faceDx: k.facing * 7, ...opts });
}

function loaf(ctx, k, breath, eyes, ears = 'up') {
  ctx.save();
  ctx.scale(1, breath);
  furShape(ctx, (c) => c.ellipse(0, -24, 50, 25, 0, 0, Math.PI * 2), () => bodyStripes(ctx, 26, -36));
  ctx.restore();
  drawTail(ctx, 'curl', k.t);
  head(ctx, -4, -52, { eyes, ears, blink: k.blink, scale: 0.92 });
  // 香箱座りで、たたんだ前足が少しだけのぞく
  for (const side of [-1, 1]) ellipse(ctx, -4 + side * 13, -3, 9, 5.5, COAT.white, C.line, 0, LW);
}

function belly(ctx, k, breath) {
  // しっぽ
  tube(ctx, (c) => {
    c.moveTo(44, -14);
    c.quadraticCurveTo(72, -12 + Math.sin(k.t * 2) * 6, 86, -28 + Math.sin(k.t * 2) * 8);
  });
  // 上に向けた足。奥の2本（前足・後ろ足）は胴体の後ろ、手前の2本は胴体に重ねて描く
  const leg = (x, y) => {
    const wave = Math.sin(k.t * 2.5 + x) * 2;
    tube(ctx, (c) => {
      c.moveTo(x * 0.8, -30);
      c.lineTo(x, y + wave);
    }, 15, 9);
    ellipse(ctx, x, y + wave - 2, 8, 6.5, COAT.white, C.line, 0, LW);
  };
  leg(-26, -52);
  leg(16, -54);
  ctx.save();
  ctx.scale(1, breath);
  furShape(ctx, (c) => c.ellipse(0, -22, 52, 22, 0, 0, Math.PI * 2), () => ellipse(ctx, 6, -28, 32, 12, COAT.white));
  ctx.restore();
  leg(-9, -56);
  leg(32, -47);
  head(ctx, -56, -30, { tilt: -0.45, eyes: 'dotBig', blink: k.blink, scale: 0.84 });
}

function backView(ctx, k, breath) {
  for (const side of [-1, 1]) ellipse(ctx, side * 25, -7, 13, 8, COAT.fur, C.line);
  ctx.save();
  ctx.scale(1, breath);
  furShape(ctx, (c) => c.ellipse(0, -28, 34, 31, 0, 0, Math.PI * 2), () => bodyStripes(ctx, 0, -40));
  ctx.restore();
  // 後ろ頭（顔は描かない）
  ctx.save();
  ctx.translate(0, -80);
  for (const side of [-1, 1]) ear(ctx, side, 'up', false);
  furShape(ctx, mochi, () => {
    ctx.strokeStyle = COAT.stripe;
    ctx.lineWidth = 6;
    for (const dx of [-14, 0, 14]) line(ctx, dx, -42, dx * 0.9, -20);
  });
  ctx.restore();
  drawTail(ctx, 'curl', k.t);
}

function inBox(ctx, k) {
  // 箱の内側
  ctx.save();
  ctx.fillStyle = '#a3754a';
  ctx.beginPath();
  ctx.moveTo(-56, -64);
  ctx.lineTo(56, -64);
  ctx.lineTo(44, -74);
  ctx.lineTo(-44, -74);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // 顔をのぞかせる
  const peek = Math.sin(k.t * 1.2) * 3;
  ctx.save();
  ctx.beginPath();
  ctx.rect(-90, -200, 180, 136);
  ctx.clip();
  head(ctx, 0, -70 + peek, { eyes: 'dot', blink: k.blink, scale: 0.85 });
  ctx.restore();
  // 箱の前面とフタ
  ctx.save();
  ctx.lineWidth = LW;
  ctx.strokeStyle = C.line;
  ctx.fillStyle = '#dcae74';
  ctx.beginPath();
  ctx.rect(-56, -64, 112, 64);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#cd9b5f';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 56, -64);
    ctx.lineTo(side * 82, -80);
    ctx.lineTo(side * 76, -46);
    ctx.lineTo(side * 56, -40);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(78, 61, 54, 0.35)';
  line(ctx, -20, -40, 20, -40);
  ctx.restore();
}

// 膝の上：ふみふみ → ゴロゴロ → 寝る
function onLap(ctx, k, breath) {
  if (k.lapT < 2.6) {
    sitting(ctx, k, breath, { eyes: 'happy', tail: 'up', kneadT: k.lapT });
    floatText(ctx, 'ふみふみ', 50, -128, k.t);
    return;
  }
  ctx.save();
  ctx.scale(1, breath);
  furShape(ctx, (c) => c.ellipse(6, -26, 58, 27, 0, 0, Math.PI * 2), () => bodyStripes(ctx, 26, -40));
  ctx.restore();
  head(ctx, -28, -38, { eyes: 'sleep', scale: 0.82, tilt: -0.22 });
  drawTail(ctx, 'curl', k.t);
  if (k.lapT < 4.4) {
    floatText(ctx, 'ゴロゴロ', 44, -92, k.t);
  } else {
    const z = (k.t * 0.6) % 1;
    ctx.save();
    ctx.globalAlpha = 1 - z;
    ctx.fillStyle = C.line;
    ctx.font = `bold ${14 + z * 6}px sans-serif`;
    ctx.fillText('z', 8 + z * 18, -80 - z * 30);
    ctx.restore();
  }
}

// 毛色で塗り、内側に柄を描いて、こげ茶の輪郭線を引く。
// 柄を描くとパスが置き換わるので、輪郭線を引く前にパスを作り直す
function furShape(ctx, pathFn, pattern) {
  ctx.beginPath();
  pathFn(ctx);
  ctx.fillStyle = COAT.fur;
  ctx.fill();
  ctx.save();
  ctx.clip();
  pattern();
  ctx.restore();
  ctx.beginPath();
  pathFn(ctx);
  ctx.lineWidth = LW;
  ctx.strokeStyle = C.line;
  ctx.stroke();
}

// 頭の輪郭：上下が少し平らな横長の「おもち形」
function mochi(ctx) {
  ctx.moveTo(-50, 0);
  ctx.bezierCurveTo(-50, -30, -30, -40, 0, -40);
  ctx.bezierCurveTo(30, -40, 50, -30, 50, 0);
  ctx.bezierCurveTo(50, 27, 28, 38, 0, 38);
  ctx.bezierCurveTo(-28, 38, -50, 27, -50, 0);
  ctx.closePath();
}

// faceDx: 顔のパーツを横にずらして、そっぽを向かせる
function head(ctx, x, y, { tilt = 0, eyes = 'dot', mouth = 'w', ears = 'up', faceDx = 0, blink = 0, scale = 1 }) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(scale, scale);
  for (const side of [-1, 1]) ear(ctx, side, ears, true);
  furShape(ctx, mochi, () => {
    ctx.strokeStyle = COAT.stripe;
    ctx.lineWidth = 6;
    for (const dx of [-12, 0, 12]) line(ctx, dx, -44, dx * 0.9, -27);
  });

  ctx.translate(faceDx, 0);
  ellipse(ctx, -31, 12, 7.5, 4.5, C.blush);
  ellipse(ctx, 31, 12, 7.5, 4.5, C.blush);
  for (const side of [-1, 1]) eye(ctx, side * 20, 2, eyes, blink, side);
  drawMouth(ctx, mouth);
  ctx.restore();
}

function ear(ctx, side, ears, inner) {
  // up：ピンと立つ / half：少し伏せる（不安） / back：横に寝かせる（怒り・驚き）
  const tip = { up: [side * 40, -60], half: [side * 54, -46], back: [side * 60, -26] }[ears];
  ctx.save();
  ctx.lineWidth = LW;
  ctx.strokeStyle = C.line;
  ctx.fillStyle = COAT.fur;
  ctx.beginPath();
  ctx.moveTo(side * 12, -36);
  ctx.quadraticCurveTo(tip[0] - side * 6, tip[1] + 2, tip[0], tip[1]);
  ctx.quadraticCurveTo(tip[0] + side * 4, tip[1] + 8, side * 47, -16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (inner) {
    ctx.fillStyle = C.earIn;
    ctx.beginPath();
    ctx.moveTo(side * 20, -34);
    ctx.lineTo(tip[0] * 0.84, tip[1] * 0.8);
    ctx.lineTo(side * 40, -20);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function eye(ctx, x, y, kind, blink, side) {
  ctx.save();
  const color = COAT.eye ?? C.eye;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.6;
  const shut = (kind === 'dot' || kind === 'dotBig') && blink > 0.75;
  if (kind === 'happy' || shut) {
    // にっこり閉じ目（∩）
    ctx.beginPath();
    ctx.arc(x, y + 3, 5, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
  } else if (kind === 'sleep') {
    // 眠り目（－）
    ctx.beginPath();
    ctx.arc(x, y - 7, 8, Math.PI * 0.32, Math.PI * 0.68);
    ctx.stroke();
  } else if (kind === 'grumpy') {
    // 半目でむっとする
    ctx.beginPath();
    ctx.ellipse(x, y + 1, 3.8, 3.2, 0, 0, Math.PI);
    ctx.fill();
    line(ctx, x - 6 * side, y - 2, x + 5 * side, y + 1);
  } else if (kind === 'shock') {
    ellipse(ctx, x, y, 5.5, 6, '#fffdf7', color, 0, 2.2);
    ellipse(ctx, x, y + 0.5, 2.2, 2.6, color);
  } else {
    const big = kind === 'dotBig';
    const rx = big ? 4.6 : 3.6;
    const ry = (big ? 6.2 : 5) * (1 - blink);
    ellipse(ctx, x, y, rx, Math.max(0.8, ry), color);
    if (big && blink < 0.4) ellipse(ctx, x + 1.4, y - 2.2, 1.5, 1.5, '#ffffff');
  }
  ctx.restore();
}

function drawMouth(ctx, kind) {
  ctx.save();
  ctx.strokeStyle = COAT.face ?? C.line;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  if (kind === 'o') {
    ctx.ellipse(0, 11, 2.6, 3.2, 0, 0, Math.PI * 2);
  } else if (kind === 'he') {
    ctx.moveTo(-4, 12);
    ctx.lineTo(0, 9);
    ctx.lineTo(4, 12);
  } else {
    ctx.arc(-3.2, 9, 3.2, 0.15, Math.PI - 0.15);
    ctx.moveTo(6.3, 9.5);
    ctx.arc(3.2, 9, 3.2, 0.15, Math.PI - 0.15);
  }
  ctx.stroke();
  ctx.restore();
}

function paw(ctx, x, y) {
  ellipse(ctx, x, y, 9.5, 7, COAT.white, C.line, 0, LW);
  ctx.save();
  ctx.strokeStyle = 'rgba(78, 61, 54, 0.55)';
  ctx.lineWidth = 1.6;
  line(ctx, x - 2.5, y + 2, x - 2.5, y + 5);
  line(ctx, x + 2.5, y + 2, x + 2.5, y + 5);
  ctx.restore();
}

function bodyStripes(ctx, cx, cy) {
  ctx.save();
  ctx.strokeStyle = COAT.stripe;
  ctx.lineWidth = 6;
  for (const dx of [-16, 0, 16]) line(ctx, cx + dx, cy - 14, cx + dx * 1.1, cy + 2);
  ctx.restore();
}

function drawTail(ctx, kind, t) {
  ctx.save();
  if (kind === 'up') {
    const q = Math.sin(t * 11) * 1.5;
    // 頭の陰に隠れないよう、頭の横幅より外側を通す
    tube(ctx, (c) => {
      c.moveTo(26, -14);
      c.quadraticCurveTo(68, -40, 64 + q, -96);
      c.quadraticCurveTo(63 + q, -112, 52 + q, -114);
    });
  } else if (kind === 'flick') {
    const s = Math.sin(t * 9);
    tube(ctx, (c) => {
      c.moveTo(26, -8);
      c.quadraticCurveTo(52, -2, 62 + s * 22, -6 - Math.abs(s) * 14);
    });
  } else if (kind === 'puff') {
    tube(ctx, (c) => {
      c.moveTo(24, -18);
      c.quadraticCurveTo(46, -64, 34, -110);
    }, 24, 18);
  } else if (kind === 'curl') {
    const s = Math.sin(t * 1.3) * 3;
    tube(ctx, (c) => {
      c.moveTo(40, -8);
      c.quadraticCurveTo(50, 6, 0, 6);
      c.quadraticCurveTo(-28, 6, -36 + s, -6);
    });
  } else {
    const s = Math.sin(t * 1.6);
    tube(ctx, (c) => {
      c.moveTo(26, -12);
      c.bezierCurveTo(58, -8, 64, -36 + s * 6, 52 + s * 8, -58);
    });
  }
  ctx.restore();
}

// 縁取り付きの太い線（しっぽ・足）
function tube(ctx, pathFn, outer = 15, innerW = 9) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.beginPath();
  pathFn(ctx);
  ctx.strokeStyle = C.line;
  ctx.lineWidth = outer;
  ctx.stroke();
  ctx.beginPath();
  pathFn(ctx);
  ctx.strokeStyle = COAT.fur;
  ctx.lineWidth = innerW;
  ctx.stroke();
  ctx.restore();
}

function angerMark(ctx, x, y, t) {
  const s = 1 + Math.sin(t * 8) * 0.08;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.strokeStyle = C.red;
  ctx.lineWidth = 3;
  for (const r of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    ctx.save();
    ctx.rotate(r);
    ctx.beginPath();
    ctx.moveTo(3, -9);
    ctx.quadraticCurveTo(3, -3, 9, -3);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function sweat(ctx, x, y, u) {
  ctx.save();
  ctx.globalAlpha = 1 - u / 1.2;
  ctx.fillStyle = '#9fd0ee';
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  const yy = y + u * 10;
  ctx.beginPath();
  ctx.moveTo(x, yy - 9);
  ctx.quadraticCurveTo(x + 7, yy, x, yy + 4);
  ctx.quadraticCurveTo(x - 7, yy, x, yy - 9);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// 見つめているときの合図：頭の横に、控えめな「チラッ」（まばたきのチャンス）。
// 遠くにいて小さく描かれるときも読めるように、文字だけは大きさを補う
function lookCue(ctx, k) {
  const fit = Math.max(1, 0.85 / (k.scale ?? 1));
  ctx.save();
  ctx.translate(50, -128);
  ctx.scale(fit, fit);
  // 出た瞬間だけ、少し横にすべり込む
  const u = clamp01(k.modeT / 0.25);
  ctx.globalAlpha = 0.85 * u;
  ctx.fillStyle = C.line;
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('チラッ', (1 - u) * -6, 0);
  ctx.restore();
}

function exclaim(ctx, x, y) {
  ctx.save();
  ctx.fillStyle = C.red;
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText('!', x, y);
  ctx.restore();
}

function floatText(ctx, text, x, y, t) {
  ctx.save();
  ctx.fillStyle = C.line;
  ctx.globalAlpha = 0.75 + Math.sin(t * 4) * 0.2;
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(text, x, y + Math.sin(t * 3) * 3);
  ctx.restore();
}

function heart(ctx, x, y, r, alpha) {
  ctx.save();
  ctx.globalAlpha = clamp01(alpha);
  ctx.fillStyle = C.heart;
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.4, x, y - r * 0.5);
  ctx.bezierCurveTo(x + r * 0.6, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
  ctx.fill();
  ctx.restore();
}

function burst(ctx, x, y, u) {
  ctx.save();
  ctx.globalAlpha = 1 - u;
  ctx.strokeStyle = C.red;
  ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const r0 = 8 + u * 10;
    const r1 = 18 + u * 18;
    line(ctx, x + Math.cos(ang) * r0, y + Math.sin(ang) * r0, x + Math.cos(ang) * r1, y + Math.sin(ang) * r1);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- 図形の小道具

function ellipse(ctx, x, y, rx, ry, fill, stroke, rot = 0, lw = 3) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

function line(ctx, x0, y0, x1, y1) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
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
