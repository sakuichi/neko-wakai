import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nightCatPose, NIGHT_FADE_SEC } from '../src/scenes/nightScene.js';

test('夜の画面が表示しきるまでは、猫は昼の終わりの場所にいる', () => {
  const last = { mode: 'look', distance: 20 };
  for (const t of [0, NIGHT_FADE_SEC / 2, NIGHT_FADE_SEC - 0.01]) {
    assert.deepEqual(nightCatPose(last, t), last, `${t}秒`);
  }
});

test('夜の画面が表示しきってから、猫は遠ざかる', () => {
  const pose = nightCatPose({ mode: 'look', distance: 20 }, NIGHT_FADE_SEC + 0.01);
  assert.equal(pose.mode, 'relax');
  assert.ok(pose.distance > 20);
});

test('名前の候補は、毛色に合ったものから4つ選ぶ（どの毛色にも候補がある）', async () => {
  const { namePicks } = await import('../src/scenes/nameScene.js');
  const { NAME_TEXT } = await import('../src/data/texts.js');
  const { COATS } = await import('../src/render/renderer.js');
  for (const coat of Object.keys(COATS)) {
    const list = NAME_TEXT.byCoat[coat];
    assert.ok(list && list.length >= 4, coat);
    const picks = namePicks(coat, Math.random);
    assert.equal(picks.length, 4, coat);
    assert.equal(new Set(picks).size, 4, `${coat}: 重複`);
    for (const p of picks) {
      assert.ok(list.includes(p), `${coat}: ${p}`);
      assert.ok([...p].length <= NAME_TEXT.maxLength, p);
    }
  }
  assert.ok(NAME_TEXT.byCoat.kuro.includes('くろ'));
  assert.ok(NAME_TEXT.byCoat.kuro.includes('Holy Night'));
});

// 文字の描画（fillText）だけを記録する偽の Canvas
function textRecordingCanvas() {
  const texts = [];
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'fillText') return (text) => texts.push(text);
      return () => {};
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
  const canvas = { width: 360, height: 640, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 640 }) };
  return { canvas, texts };
}

test('「チラッ」は昼の駆け引きの合図で、名前を付けるときのアップには出さない', async () => {
  const { createRenderer } = await import('../src/render/renderer.js');
  const day = textRecordingCanvas();
  createRenderer(day.canvas).draw({ scene: 'day', cat: { mode: 'look', distance: 50 } }, 1, 0.3);
  assert.ok(day.texts.includes('チラッ'));
  const name = textRecordingCanvas();
  createRenderer(name.canvas).draw({ scene: 'name', closeup: true, cat: { mode: 'look', distance: 0 } }, 1, 0.3);
  assert.ok(!name.texts.includes('チラッ'));
});

// 夜の画面・昼の画面を作るのに足りるだけの、最小の偽 DOM 要素
function fakeElement() {
  return {
    className: '',
    textContent: '',
    type: '',
    children: [],
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; },
    addEventListener() {},
    setAttribute() {},
  };
}

// globalThis の値をテストの間だけ差し替え、終わったら元に戻す
function withGlobals(values, fn) {
  const saved = Object.keys(values).map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
  for (const [k, v] of Object.entries(values)) {
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true, enumerable: true });
  }
  try {
    return fn();
  } finally {
    for (const [k, desc] of saved) {
      if (desc) Object.defineProperty(globalThis, k, desc);
      else delete globalThis[k];
    }
  }
}

test('夜の画面の待ち時間は実際の時間で数える（倍速で update が何回も呼ばれても、表示しきるまで猫は動かない）', async () => {
  const { createNightScene } = await import('../src/scenes/nightScene.js');
  withGlobals({ document: { createElement: () => fakeElement() } }, () => {
    let ms = 1000;
    const lastCat = { mode: 'look', distance: 20 };
    const scene = createNightScene({
      screenEl: fakeElement(),
      session: { game: { day: 1, catName: 'たま' } },
      lastCat,
      onChoose: () => {},
      now: () => ms,
    });
    // 実時間 0.1秒の間に、8倍速で update(0.1) が8回呼ばれる
    for (let i = 0; i < 8; i++) {
      ms += 100 / 8;
      scene.update(0.1);
    }
    assert.deepEqual(scene.view().cat, lastCat);
    // 実時間で 0.6秒たったら、遠ざかる
    ms = 1000 + 600;
    scene.update(0.016);
    const cat = scene.view().cat;
    assert.equal(cat.mode, 'relax');
    assert.ok(cat.distance > lastCat.distance, `distance ${cat.distance}`);
  });
});

test('夜に渡す猫の様子には、歩いていたかどうかも含める', async () => {
  const { createDayScene } = await import('./../src/scenes/dayScene.js');
  const { createGame } = await import('../src/game/progression.js');
  const { CARDS } = await import('../src/data/texts.js');
  const { fixedRng } = await import('./helpers.js');
  const noop = () => {};
  const overlay = { busy: false, splash: noop, card: noop, bubble: noop, toast: noop, clear: noop };
  const hud = { show: noop, update: noop };
  const renderer = { addEffect: noop, hitTestCat: () => false };
  const input = { setBlinkEnabled: noop, holdMs: () => 0 };
  const sound = { purr: noop, meow: noop, bump: noop };
  const session = {
    game: { ...createGame({ personality: 'amaenbo', seed: 1 }), catName: 'たま', seenCards: Object.keys(CARDS) },
    misses: {},
  };
  let result = null;
  const scene = createDayScene({ session, overlay, hud, renderer, input, sound, rng: fixedRng(0.5), onEnd: (r) => { result = r; } });
  // 1日目は、落ち着いたら「くつろぎ」のまま歩いて近づいてくる
  for (let i = 0; i < 400 && !scene.state().cat.walking; i++) scene.update(0.05);
  assert.equal(scene.state().cat.walking, true, '歩き出す前に上限に達した');
  scene.skipDay();
  assert.ok(result, 'onEnd が呼ばれていない');
  assert.equal(result.cat.walking, true);
});

// soundsFor はまだない場合もあるので、ファイルの読み込みを止めないよう、テストの中で読み込む
test('まばたきを返してくれたら「にゃーん」を鳴らし、チャイムは鳴らさない', async () => {
  const { soundsFor } = await import('../src/scenes/dayScene.js');
  const sounds = soundsFor('blinkBack');
  assert.deepEqual(sounds, ['meow']);
  assert.ok(!sounds.includes('chime'));
});

test('鳴らす効果音は、なでた → ゴロゴロ、逃げた・猫キック → ぽふっ、ほかの反応 → なし', async () => {
  const { soundsFor } = await import('../src/scenes/dayScene.js');
  const { FEEDBACK } = await import('../src/data/texts.js');
  assert.deepEqual(soundsFor('purr'), ['purr']);
  assert.deepEqual(soundsFor('flee'), ['bump']);
  assert.deepEqual(soundsFor('kick'), ['bump']);
  const others = Object.keys(FEEDBACK).filter((k) => !['purr', 'blinkBack', 'flee', 'kick'].includes(k));
  assert.ok(others.includes('stare'), 'FEEDBACK のほかのキーが読めていない');
  for (const key of others) assert.deepEqual(soundsFor(key), [], key);
  assert.deepEqual(soundsFor(null), []);
});

test('昼の画面で、まばたきを返してくれたら「にゃーん」を1回鳴らし、ほかの効果音は鳴らさない', async () => {
  const { createDayScene } = await import('../src/scenes/dayScene.js');
  const { createGame } = await import('../src/game/progression.js');
  const { CARDS } = await import('../src/data/texts.js');
  const { fixedRng } = await import('./helpers.js');
  const noop = () => {};
  const overlay = { busy: false, splash: noop, card: noop, bubble: noop, toast: noop, clear: noop };
  const hud = { show: noop, update: noop };
  const effects = [];
  const renderer = { addEffect: (name) => effects.push(name), hitTestCat: () => false };
  const input = { setBlinkEnabled: noop, holdMs: () => 0 };
  const played = [];
  const sound = {
    purr: () => played.push('purr'),
    meow: () => played.push('meow'),
    bump: () => played.push('bump'),
  };
  // 2日目から、まばたきが使える
  const session = {
    game: { ...createGame({ personality: 'amaenbo', seed: 1 }), day: 2, catName: 'たま', seenCards: Object.keys(CARDS) },
    misses: {},
  };
  const scene = createDayScene({ session, overlay, hud, renderer, input, sound, rng: fixedRng(0.5), onEnd: noop });
  // 猫がこちらを見る（look）まで待つ
  for (let i = 0; i < 400 && scene.state().cat.mode !== 'look'; i++) scene.update(0.05);
  assert.equal(scene.state().cat.mode, 'look', 'こちらを見る前に上限に達した');
  assert.deepEqual(played, [], 'まばたきの前に効果音が鳴っている');
  // ゆっくりまばたき（1秒押して離す）
  scene.act({ type: 'blink', holdMs: 1000 });
  assert.deepEqual(effects, ['blinkBack']);
  assert.deepEqual(played, ['meow']);
});

test('夜の画面が表示しきってからは、猫は帰っていて見えない（relax・距離80・hidden）', () => {
  for (const t of [NIGHT_FADE_SEC, NIGHT_FADE_SEC + 0.01, 10]) {
    const pose = nightCatPose({ mode: 'look', distance: 20 }, t);
    assert.equal(pose.mode, 'relax', `${t}秒`);
    assert.equal(pose.distance, 80, `${t}秒`);
    assert.equal(pose.hidden, true, `${t}秒`);
  }
});

test('昼の画面は、その日の進み具合（dayTime：始まり 0 → 時間切れ 1）を描画に渡す', async () => {
  const { createDayScene } = await import('../src/scenes/dayScene.js');
  const { createGame } = await import('../src/game/progression.js');
  const { DAYS } = await import('../src/data/params.js');
  const { CARDS } = await import('../src/data/texts.js');
  const { fixedRng } = await import('./helpers.js');
  const noop = () => {};
  const overlay = { busy: false, splash: noop, card: noop, bubble: noop, toast: noop, clear: noop };
  const hud = { show: noop, update: noop };
  const renderer = { addEffect: noop, hitTestCat: () => false };
  const input = { setBlinkEnabled: noop, holdMs: () => 0 };
  const sound = { purr: noop, meow: noop, bump: noop };
  // 2日目（膝に乗らない日なので、時間切れまで進む）
  const session = {
    game: { ...createGame({ personality: 'amaenbo', seed: 1 }), day: 2, catName: 'たま', seenCards: Object.keys(CARDS) },
    misses: {},
  };
  const duration = DAYS[1].durationSec;
  const scene = createDayScene({ session, overlay, hud, renderer, input, sound, rng: fixedRng(0.5), onEnd: noop });
  const first = scene.view().dayTime;
  assert.equal(typeof first, 'number', 'view() に dayTime がない');
  assert.ok(first >= 0 && first <= 0.01, `始まった直後の dayTime ${first}`);
  const dt = 0.05;
  let prev = first;
  const steps = Math.round((duration + 2) / dt);
  for (let i = 1; i <= steps; i++) {
    scene.update(dt);
    const v = scene.view().dayTime;
    assert.ok(v >= 0 && v <= 1, `${(i * dt).toFixed(2)}秒: dayTime ${v}`);
    assert.ok(v >= prev, `${(i * dt).toFixed(2)}秒: dayTime が減った ${prev} → ${v}`);
    if (i === Math.round(duration / 2 / dt)) assert.ok(Math.abs(v - 0.5) <= 0.01, `半分の時間での dayTime ${v}`);
    if (i === Math.round((duration - 0.2) / dt)) assert.ok(v >= 0.99, `時間切れ近くの dayTime ${v}`);
    prev = v;
  }
  assert.ok(prev > 0.99 && prev <= 1, `時間切れのあとの dayTime ${prev}`);
});
