import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer, COATS, LINE_COLOR, LINE_WIDTH, LAP_COLORS } from '../src/render/renderer.js';
// まだない名前（CAT_FADE_SEC など）があっても読み込みが止まらないように、名前空間でも取り込む
import * as R from '../src/render/renderer.js';
import { ENDINGS } from '../src/data/texts.js';

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

// ---------------------------------------------------------------- タイトルに戻るときの「猫だけフェード」

const FRAME = 1 / 60;
// フレーム境界のずれの許容（2フレーム分）
const EDGE = 2 * FRAME;
// 位置が「大きく変わった」とみなす1フレームあたりの移動（px）
const JUMP_PX = 4;
const OLD_COAT = 'kijitora';
const NEW_COAT = 'kuro';
// 和解のエンド（膝の上）。'visitor' 以外のキー
const LAP_ENDING = Object.keys(ENDINGS).find((k) => k !== 'visitor');

function fadeSec() {
  assert.equal(typeof R.CAT_FADE_SEC, 'number', 'CAT_FADE_SEC が export されていない');
  assert.ok(R.CAT_FADE_SEC > 0);
  return R.CAT_FADE_SEC;
}

function catOf(r) {
  assert.equal(typeof r.shownCat, 'function', 'shownCat() がない');
  const c = r.shownCat();
  return { alpha: c.alpha, coat: c.coat, mode: c.mode };
}

// viewAt(経過秒) を sec 秒、60fps で描き、各フレームの { e, alpha, coat, mode, pos } を返す
function drawAt60(r, viewAt, t0, sec) {
  const frames = [];
  const n = Math.round(sec / FRAME);
  for (let i = 0; i < n; i++) {
    const e = i * FRAME;
    r.draw(viewAt(e), t0 + e, FRAME);
    frames.push({ e, ...catOf(r), pos: { ...r.shownPosition() } });
  }
  return frames;
}

// beforeAt の場面を beforeSec 秒描いてから title に切り替え、切り替え後 2*CAT_FADE_SEC+0.5 秒を記録する
function recordToTitle(beforeAt, beforeSec = 3) {
  const fade = fadeSec();
  const rec = recordingCanvas();
  const r = R.createRenderer(rec.canvas);
  const beforeFrames = drawAt60(r, beforeAt, 1, beforeSec);
  const before = beforeFrames[beforeFrames.length - 1];
  const tSwitch = 1 + beforeFrames.length * FRAME;
  const frames = drawAt60(r, () => ({ scene: 'title', coat: NEW_COAT }), tSwitch, 2 * fade + 0.5);
  return { beforeFrames, before, frames };
}

// ページを開いたときと同じく、最初から title を描いて落ち着いた位置（distance 55 の relax）
function titlePosition() {
  const rec = recordingCanvas();
  const r = R.createRenderer(rec.canvas);
  for (let i = 0; i < 6 / FRAME; i++) r.draw({ scene: 'title', coat: NEW_COAT }, 1 + i * FRAME, FRAME);
  return { ...r.shownPosition() };
}

const lapEndingAt = (e) => ({ scene: 'ending', endingId: LAP_ENDING, coat: OLD_COAT, lapTime: e });
const visitorEndingAt = () => ({ scene: 'ending', endingId: 'visitor', coat: OLD_COAT });
const dayLookAt = () => ({ scene: 'day', coat: OLD_COAT, cat: { mode: 'look', distance: 30 } });

const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const nearest = (frames, e) => frames.reduce((best, f) => (Math.abs(f.e - e) < Math.abs(best.e - e) ? f : best));

// 仕様1：消える段階。切り替え直前と同じ場所・姿勢・毛色で、alpha が 1 から 0 へ単調に下がる
function assertFadeOut({ before, frames }, oldMode) {
  const fade = fadeSec();
  assert.equal(before.alpha, 1, '切り替え前は不透明');
  assert.equal(before.mode, oldMode);
  assert.equal(before.coat, OLD_COAT);
  const out = frames.filter((f) => f.e < fade - EDGE);
  assert.ok(out.length > 0);
  assert.ok(out[0].alpha >= 0.9, `切り替え直後の alpha ${out[0].alpha}`);
  for (const f of out) {
    assert.equal(f.coat, OLD_COAT, `e=${f.e.toFixed(3)}: 毛色`);
    assert.equal(f.mode, oldMode, `e=${f.e.toFixed(3)}: 姿勢`);
    assert.ok(dist(f.pos, before.pos) <= 3, `e=${f.e.toFixed(3)}: 位置 (${before.pos.x},${before.pos.y}) → (${f.pos.x},${f.pos.y})`);
    assert.ok(Math.abs(f.pos.s - before.pos.s) <= 0.02, `e=${f.e.toFixed(3)}: 大きさ ${before.pos.s} → ${f.pos.s}`);
  }
  for (let i = 1; i < out.length; i++) {
    assert.ok(out[i].alpha <= out[i - 1].alpha, `e=${out[i].e.toFixed(3)}: alpha が上がった ${out[i - 1].alpha} → ${out[i].alpha}`);
  }
  const mid = nearest(frames, fade / 2).alpha;
  assert.ok(mid > 0.05 && mid < 0.95, `消える途中の alpha ${mid}`);
  const edge = frames.filter((f) => Math.abs(f.e - fade) <= EDGE);
  assert.ok(Math.min(...edge.map((f) => f.alpha)) <= 0.05, 'CAT_FADE_SEC のあたりで alpha がほぼ 0 になる');
}

// 仕様2：現れる段階。タイトルの位置・新しい毛色・relax で、alpha が 0 から 1 へ単調に上がり、その後は 1
function assertFadeIn({ frames }) {
  const fade = fadeSec();
  const title = titlePosition();
  const into = frames.filter((f) => f.e > fade + EDGE);
  assert.ok(into.length > 0);
  for (const f of into) {
    assert.equal(f.coat, NEW_COAT, `e=${f.e.toFixed(3)}: 毛色`);
    assert.equal(f.mode, 'relax', `e=${f.e.toFixed(3)}: 姿勢`);
    assert.ok(Math.abs(f.pos.y - title.y) <= 2, `e=${f.e.toFixed(3)}: y ${f.pos.y}（タイトルの位置 ${title.y}）`);
    assert.ok(Math.abs(f.pos.s - title.s) <= 0.02, `e=${f.e.toFixed(3)}: 大きさ ${f.pos.s}（タイトルの位置 ${title.s}）`);
  }
  for (let i = 1; i < into.length; i++) {
    assert.ok(into[i].alpha >= into[i - 1].alpha, `e=${into[i].e.toFixed(3)}: alpha が下がった ${into[i - 1].alpha} → ${into[i].alpha}`);
  }
  const mid = nearest(frames, fade * 1.5).alpha;
  assert.ok(mid > 0.05 && mid < 0.95, `現れる途中の alpha ${mid}`);
  const done = frames.filter((f) => f.e > 2 * fade + EDGE);
  assert.ok(done.length > 0);
  for (const f of done) assert.equal(f.alpha, 1, `e=${f.e.toFixed(3)}: 現れ終わったら不透明`);
}

// 仕様3：大きな移動は alpha がほぼ 0 のフレームでだけ起きる（切り替え直前のフレームから数える）
function assertJumpOnlyWhenInvisible({ before, frames }) {
  const seq = [before, ...frames];
  for (let i = 1; i < seq.length; i++) {
    const d = dist(seq[i].pos, seq[i - 1].pos);
    if (d > JUMP_PX) assert.ok(seq[i].alpha <= 0.05, `e=${seq[i].e.toFixed(3)}: alpha ${seq[i].alpha} のまま ${d.toFixed(1)}px 動いた`);
  }
}

test('膝の上のエンドからタイトルに戻ると、猫は同じ場所・同じ姿勢・前の毛色のまま、だんだん消える', () => {
  const run = recordToTitle(lapEndingAt);
  assert.equal(run.before.mode, 'lap', '膝に乗り切ってから切り替える');
  assertFadeOut(run, 'lap');
});

test('膝の上のエンドからタイトルに戻ると、消えたあとタイトルの位置に新しい毛色で現れ、だんだん不透明になる', () => {
  const run = recordToTitle(lapEndingAt);
  assertFadeIn(run);
});

test('膝の上のエンドからタイトルに戻るとき、猫が大きく動くのは見えていない（alpha がほぼ 0 の）フレームだけ', () => {
  const run = recordToTitle(lapEndingAt);
  const title = titlePosition();
  assert.ok(Math.abs(run.before.pos.y - title.y) > 2 * JUMP_PX, '膝の上とタイトルで位置が違う（このテストの前提）');
  assertJumpOnlyWhenInvisible(run);
});

test('ページを開いていきなりタイトルのときは、猫はフェードしない', () => {
  const rec = recordingCanvas();
  const r = R.createRenderer(rec.canvas);
  const frames = drawAt60(r, () => ({ scene: 'title', coat: NEW_COAT }), 1, 2 * fadeSec() + 0.5);
  for (const f of frames) {
    assert.equal(f.alpha, 1, `e=${f.e.toFixed(3)}: alpha`);
    assert.equal(f.coat, NEW_COAT);
    assert.equal(f.mode, 'relax');
  }
});

test('昼→夜→昼の切り替えでは、猫はフェードしない', () => {
  const rec = recordingCanvas();
  const r = R.createRenderer(rec.canvas);
  const cat = { mode: 'relax', distance: 60 };
  const day = drawAt60(r, () => ({ scene: 'day', coat: OLD_COAT, cat }), 1, 1);
  const night = drawAt60(r, () => ({ scene: 'night', coat: OLD_COAT, cat }), 2, 2 * fadeSec() + 0.5);
  const day2 = drawAt60(r, () => ({ scene: 'day', coat: OLD_COAT, cat }), 4, 2 * fadeSec() + 0.5);
  for (const f of [...day, ...night, ...day2]) assert.equal(f.alpha, 1, `e=${f.e.toFixed(3)}: alpha`);
});

test('訪問者エンドからタイトルに戻るときも、猫は消えてから新しい毛色で現れる', () => {
  const run = recordToTitle(visitorEndingAt);
  assertFadeOut(run, 'tailUp');
  assertFadeIn(run);
  assertJumpOnlyWhenInvisible(run);
});

test('デバッグのリセットで昼からタイトルに戻るときも、猫は消えてから新しい毛色で現れる', () => {
  const run = recordToTitle(dayLookAt);
  assertFadeOut(run, 'look');
  assertFadeIn(run);
  assertJumpOnlyWhenInvisible(run);
});

// ---------------------------------------------------------------- フェードの抜け（レビューで見つかったもの）

// segments: [{ at: (経過秒) => view, frames: フレーム数 }] を、60fps で続けて描く。
// 各フレームの { seg, e（その区間の経過秒）, alpha, coat, mode, pos } を返す
function drawSegments(segments) {
  fadeSec();
  const rec = recordingCanvas();
  const r = R.createRenderer(rec.canvas);
  const out = [];
  let t = 1;
  segments.forEach((sg, seg) => {
    const frames = drawAt60(r, sg.at, t, sg.frames * FRAME);
    for (const f of frames) out.push({ seg, ...f });
    t += sg.frames * FRAME;
  });
  return out;
}
const framesOf = (sec) => Math.round(sec / FRAME);
const nameCloseupAt = (coat) => () => ({ scene: 'name', closeup: true, coat, cat: { mode: 'look', distance: 0 } });
const titleAt = (coat) => () => ({ scene: 'title', coat });
const fmt = (f) => `区間${f.seg} e=${f.e.toFixed(3)}`;

// 最初の場面に落ち着くまで（ページを開いた直後）の動きは数えず、最初に場面が切り替わる直前のフレームから数える
function assertJumpOnlyWhenInvisibleAll(seq) {
  for (let i = seq.findIndex((f) => f.seg === 1); i < seq.length; i++) {
    const d = dist(seq[i].pos, seq[i - 1].pos);
    if (d > JUMP_PX) assert.ok(seq[i].alpha <= 0.05, `${fmt(seq[i])}: alpha ${seq[i].alpha} のまま ${d.toFixed(1)}px 動いた`);
  }
}

test('名前付けのアップからデバッグのリセットでタイトルに戻ると、猫はアップの位置のまま消えてから現れる', () => {
  const fade = fadeSec();
  const seq = drawSegments([
    { at: nameCloseupAt(OLD_COAT), frames: framesOf(3) },
    { at: titleAt(NEW_COAT), frames: framesOf(2 * fade + 0.5) },
  ]);
  const before = seq.filter((f) => f.seg === 0).at(-1);
  const after = seq.filter((f) => f.seg === 1);
  const out = after.filter((f) => f.e < fade - EDGE);
  const into = after.filter((f) => f.e > fade + EDGE);
  assert.ok(out.length > 0 && into.length > 0);
  for (const f of out) {
    assert.ok(dist(f.pos, before.pos) <= 3, `${fmt(f)}: 位置 (${before.pos.x},${before.pos.y}) → (${f.pos.x},${f.pos.y})`);
    assert.ok(Math.abs(f.pos.s - before.pos.s) <= 0.02, `${fmt(f)}: 大きさ ${before.pos.s} → ${f.pos.s}`);
    assert.equal(f.coat, OLD_COAT, `${fmt(f)}: 消える間の毛色`);
  }
  for (const f of into) assert.equal(f.coat, NEW_COAT, `${fmt(f)}: 現れる間の毛色`);
  assertJumpOnlyWhenInvisibleAll(seq);
});

test('消えている途中で名前付けのアップに変わったら、最初のフレームから新しい毛色・アップの姿勢で、見えないところから現れる', () => {
  const fade = fadeSec();
  const seq = drawSegments([
    { at: lapEndingAt, frames: framesOf(3) },
    { at: titleAt(NEW_COAT), frames: framesOf(fade / 2) },
    { at: nameCloseupAt(NEW_COAT), frames: framesOf(fade + 0.5) },
  ]);
  assert.equal(seq.filter((f) => f.seg === 0).at(-1).mode, 'lap', '膝に乗り切ってから切り替える');
  const name = seq.filter((f) => f.seg === 2);
  for (const f of name) {
    assert.equal(f.coat, NEW_COAT, `${fmt(f)}: 毛色`);
    assert.equal(f.mode, 'look', `${fmt(f)}: 姿勢`);
  }
  assert.ok(name[0].alpha <= 0.05, `アップに変わった直後の alpha ${name[0].alpha}`);
  for (let i = 1; i < name.length; i++) {
    assert.ok(name[i].alpha >= name[i - 1].alpha, `${fmt(name[i])}: alpha が下がった ${name[i - 1].alpha} → ${name[i].alpha}`);
  }
  const done = name.filter((f) => f.e >= fade + EDGE);
  assert.ok(done.length > 0);
  for (const f of done) assert.equal(f.alpha, 1, `${fmt(f)}: 現れ終わったら不透明`);
  assertJumpOnlyWhenInvisibleAll(seq);
});

test('現れている途中でアップ→タイトルとリセットを連打しても、猫がぱっと濃くならず、最後は新しい毛色で不透明になる', () => {
  const fade = fadeSec();
  const LAST_COAT = 'shiro';
  const seq = drawSegments([
    { at: lapEndingAt, frames: framesOf(3) },
    { at: titleAt(NEW_COAT), frames: framesOf(1.5 * fade) },
    { at: nameCloseupAt(NEW_COAT), frames: 3 },
    { at: titleAt(LAST_COAT), frames: framesOf(2 * fade + 0.5) },
  ]);
  const midAlpha = seq.filter((f) => f.seg === 1).at(-1).alpha;
  assert.ok(midAlpha > 0.2 && midAlpha < 0.8, `アップに変える前は現れる途中（alpha ${midAlpha}）`);
  for (let i = 1; i < seq.length; i++) {
    const d = Math.abs(seq[i].alpha - seq[i - 1].alpha);
    assert.ok(d <= 0.1, `${fmt(seq[i])}: alpha が1フレームで ${seq[i - 1].alpha} → ${seq[i].alpha} に変わった`);
  }
  const last = seq.at(-1);
  assert.equal(last.coat, LAST_COAT, '最後の毛色');
  assert.equal(last.alpha, 1, '最後は不透明');
  assertJumpOnlyWhenInvisibleAll(seq);
});
