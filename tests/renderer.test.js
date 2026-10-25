import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer, COATS, LINE_COLOR, LINE_WIDTH, LAP_COLORS } from '../src/render/renderer.js';

// 描画命令を記録する偽の Canvas。塗り（fill）と線（stroke）を、そのときのパスと一緒に残す
function recordingCanvas() {
  const fills = [];
  const strokes = [];
  let path = [];
  const state = { strokeStyle: '#000', fillStyle: '#000', lineWidth: 1 };
  const stack = [];
  const pathOps = ['moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'ellipse', 'arc', 'arcTo', 'rect', 'closePath'];
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'beginPath') return () => { path = []; };
      if (pathOps.includes(key)) return (...args) => { path.push(`${key}(${args.map((v) => +v.toFixed(2)).join(',')})`); };
      if (key === 'save') return () => stack.push({ ...state });
      if (key === 'restore') return () => Object.assign(state, stack.pop());
      if (key === 'fill') return () => fills.push({ style: state.fillStyle, path: path.join(' ') });
      if (key === 'stroke') return () => strokes.push({ style: state.strokeStyle, lw: state.lineWidth, path: path.join(' ') });
      return () => {};
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
  const canvas = { width: 360, height: 640, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 640 }) };
  return { canvas, fills, strokes };
}

const MODES = ['relax', 'look', 'tailUp', 'tailFlick', 'belly', 'backTurn', 'rub', 'fakeRub', 'purr', 'flee', 'inBox'];

function drawPose(mode, lapTime = 0) {
  const rec = recordingCanvas();
  const r = createRenderer(rec.canvas);
  const view = mode === 'lap' ? { scene: 'day', cat: { mode, distance: 0 }, lapTime } : { scene: 'day', cat: { mode, distance: 50 } };
  r.draw(view, 1, 0.016);
  return rec;
}

const poses = [...MODES.map((m) => [m]), ['lap', 1], ['lap', 5]];
const furColors = Object.values(COATS).flatMap((c) => [c.fur]);

test('猫の毛色で塗った形には、必ずこげ茶の輪郭線が引かれている', () => {
  for (const [mode, lapTime] of poses) {
    const { fills, strokes } = drawPose(mode, lapTime);
    const outlined = new Set(strokes.filter((s) => s.style === LINE_COLOR).map((s) => s.path));
    const furFills = fills.filter((f) => furColors.includes(f.style));
    assert.ok(furFills.length > 0, mode);
    for (const f of furFills) assert.ok(outlined.has(f.path), `${mode}: 輪郭線のない形 ${f.path}`);
  }
});

test('輪郭でない線（柄・白い部分）を、こげ茶の輪郭線でなぞらない', () => {
  for (const [mode, lapTime] of poses) {
    const { fills, strokes } = drawPose(mode, lapTime);
    const filled = new Set(fills.map((f) => f.path));
    for (const s of strokes.filter((x) => x.style === LINE_COLOR && x.lw === LINE_WIDTH)) {
      assert.ok(filled.has(s.path), `${mode}: 塗っていない線をなぞっている ${s.path}`);
    }
  }
});

// 何フレームか描いて、最後のフレームの描画命令だけを返す
function drawFrames(view, sec, before = () => {}) {
  const rec = recordingCanvas();
  const r = createRenderer(rec.canvas);
  before(r);
  const dt = 0.05;
  for (let t = 0; t < sec; t += dt) {
    rec.fills.length = 0;
    rec.strokes.length = 0;
    r.draw(view, 1 + t, dt);
  }
  return rec;
}
const lastIndex = (list, pred) => list.map(pred).lastIndexOf(true);
const fur = COATS.chatora.fur;

test('近づいてきただけの猫は、膝の奥にいる（膝が猫より手前に描かれる）', () => {
  for (const mode of ['relax', 'look', 'tailUp', 'rub']) {
    const { fills } = drawFrames({ scene: 'day', cat: { mode, distance: 0 } }, 1);
    const lap = lastIndex(fills, (f) => f.style === LAP_COLORS.pants);
    const cat = lastIndex(fills, (f) => f.style === fur);
    assert.ok(lap > cat, `${mode}: 膝 ${lap} / 猫 ${cat}`);
  }
});

test('膝に乗った猫は、膝より手前に描かれる', () => {
  const { fills } = drawFrames({ scene: 'day', cat: { mode: 'lap', distance: 0 }, lapTime: 5 }, 1.5);
  const lap = lastIndex(fills, (f) => f.style === LAP_COLORS.pants);
  const cat = lastIndex(fills, (f) => f.style === fur);
  assert.ok(cat > lap, `膝 ${lap} / 猫 ${cat}`);
});

test('膝に置いた手は、袖口より手前に描かれる（袖口の輪郭が手に重ならない）', () => {
  const { fills } = drawFrames({ scene: 'day', cat: { mode: 'relax', distance: 80 } }, 0.2);
  const sleeves = fills.map((f, i) => (f.style === LAP_COLORS.sleeve ? i : -1)).filter((i) => i >= 0);
  const skins = fills.map((f, i) => (f.style === LAP_COLORS.skin ? i : -1)).filter((i) => i >= 0);
  assert.ok(sleeves.length >= 2 && skins.length >= 2);
  assert.ok(Math.max(...skins) > Math.max(...sleeves), '最後に描くのは手');
});

test('なでようと手を伸ばしたときも、腕に袖がある', () => {
  const rec = recordingCanvas();
  const r = createRenderer(rec.canvas);
  const view = { scene: 'day', cat: { mode: 'relax', distance: 30 } };
  r.draw(view, 1, 0.05);
  r.addEffect('reach');
  rec.fills.length = 0;
  rec.strokes.length = 0;
  // 手を伸ばしている途中（0.45秒で戻る）
  r.draw(view, 1.2, 0.05);
  const sleeveArms = rec.strokes.filter((s) => s.style === LAP_COLORS.sleeve && s.lw > 20);
  // 右手（膝の上）と、伸ばした左手の2本
  assert.equal(sleeveArms.length, 2);

  // 同じ時刻に、手を伸ばしていないときのフレームを描いて比べる
  const restRec = recordingCanvas();
  const rest = createRenderer(restRec.canvas);
  rest.draw(view, 1, 0.05);
  restRec.fills.length = 0;
  restRec.strokes.length = 0;
  rest.draw(view, 1.2, 0.05);
  const restArms = restRec.strokes.filter((s) => s.style === LAP_COLORS.sleeve && s.lw > 20);
  // 左腕の袖は、左肩（画面の外 x=4, y=670）から描き始める
  const isLeft = (s) => s.path.startsWith('moveTo(4,670)');
  const reachLeft = sleeveArms.filter(isLeft);
  const restLeft = restArms.filter(isLeft);
  assert.equal(reachLeft.length, 1, '手を伸ばしているときの左腕の袖');
  assert.equal(restLeft.length, 1, '膝に置いたときの左腕の袖');
  // 手を伸ばしている途中は、左腕の袖が膝に置いたときとは違う向きに伸びている
  assert.notEqual(reachLeft[0].path, restLeft[0].path);
});

test('歩いている姿にも、毛色で塗った形には輪郭線がある', () => {
  const { fills, strokes } = drawFrames({ scene: 'day', cat: { mode: 'relax', distance: 50, walking: true } }, 0.3);
  const outlined = new Set(strokes.filter((s) => s.style === LINE_COLOR).map((s) => s.path));
  const furFills = fills.filter((f) => furColors.includes(f.style));
  assert.ok(furFills.length > 0);
  for (const f of furFills) assert.ok(outlined.has(f.path), `輪郭線のない形 ${f.path}`);
});

// 塗り（fill）と線（stroke）を、発生した順に1本の配列に記録する偽の Canvas
function orderedRecordingCanvas() {
  const ops = [];
  let path = [];
  const state = { strokeStyle: '#000', fillStyle: '#000', lineWidth: 1 };
  const stack = [];
  const pathOps = ['moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'ellipse', 'arc', 'arcTo', 'rect', 'closePath'];
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'beginPath') return () => { path = []; };
      if (pathOps.includes(key)) return (...args) => { path.push(`${key}(${args.map((v) => +v.toFixed(2)).join(',')})`); };
      if (key === 'save') return () => stack.push({ ...state });
      if (key === 'restore') return () => Object.assign(state, stack.pop());
      if (key === 'fill') return () => ops.push({ op: 'fill', style: state.fillStyle, path: path.join(' ') });
      if (key === 'stroke') return () => ops.push({ op: 'stroke', style: state.strokeStyle, lw: state.lineWidth, path: path.join(' ') });
      return () => {};
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
  const canvas = { width: 360, height: 640, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 640 }) };
  return { canvas, ops };
}

test('お腹見せでは、手前の足2本だけを胴体より後に描く（奥の足2本としっぽは胴体の奥）', () => {
  const rec = orderedRecordingCanvas();
  const r = createRenderer(rec.canvas);
  r.draw({ scene: 'day', coat: 'chatora', cat: { mode: 'belly', distance: 50 } }, 1, 0.016);
  const furColor = COATS.chatora.fur;
  const body = rec.ops.findIndex((o) => o.op === 'fill' && o.style === furColor && o.path.includes('ellipse(0,-22,52,22'));
  assert.ok(body >= 0, '胴体の塗りが見つからない');
  // 足・しっぽの内側（毛色・太さ9の線）のうち、胴体より後に描くもの
  const after = rec.ops.slice(body + 1).filter((o) => o.op === 'stroke' && o.style === furColor && o.lw === 9);
  assert.equal(after.length, 2, after.map((o) => o.path).join(' / '));
});

test('昼が始まって道すじを選び直しても、猫が横に跳ばない', () => {
  const original = Math.random;
  // 呼ばれるたびに 0 と 0.5 を交互に返す（選び直しの前後で違う値になる）
  let n = 0;
  Math.random = () => (n++ % 2 === 0 ? 0 : 0.5);
  try {
    const rec = recordingCanvas();
    const r = createRenderer(rec.canvas);
    const dayView = { scene: 'day', cat: { mode: 'relax', distance: 80 } };
    const nightView = { scene: 'night', cat: { mode: 'relax', distance: 80 } };
    // 距離が 80 に落ち着くまで昼を描く
    let t = 1;
    for (let i = 0; i < 18; i++, t += 0.05) r.draw(dayView, t, 0.05);
    r.draw(nightView, t, 0.016);
    const before = r.shownPosition();
    r.draw(dayView, t + 0.016, 0.016);
    const after = r.shownPosition();
    assert.ok(Math.abs(after.x - before.x) <= 3, `x: ${before.x} → ${after.x}`);
  } finally {
    Math.random = original;
  }
});
