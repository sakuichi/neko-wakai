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

// エンディング画面を作るための偽 DOM 要素。fakeElement に、要素を並べ替える操作を足したもの
function notebookElement() {
  const el = {
    ...fakeElement(),
    parent: null,
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  };
  const adopt = (nodes) => {
    for (const n of nodes) if (n && typeof n === 'object') n.parent = el;
    return nodes;
  };
  el.append = (...nodes) => { el.children.push(...adopt(nodes)); };
  el.appendChild = (node) => { el.append(node); return node; };
  el.prepend = (...nodes) => { el.children.unshift(...adopt(nodes)); };
  el.replaceChildren = (...nodes) => { el.children = adopt(nodes); };
  el.insertBefore = (node, ref) => {
    const i = el.children.indexOf(ref);
    el.children.splice(i < 0 ? el.children.length : i, 0, ...adopt([node]));
    return node;
  };
  const siblings = (offset, nodes) => {
    const p = el.parent;
    if (!p) return;
    const i = p.children.indexOf(el);
    for (const n of nodes) if (n && typeof n === 'object') n.parent = p;
    p.children.splice(i + offset, 0, ...nodes);
  };
  el.after = (...nodes) => siblings(1, nodes);
  el.before = (...nodes) => siblings(0, nodes);
  el.remove = () => {
    if (el.parent) el.parent.children = el.parent.children.filter((c) => c !== el);
  };
  return el;
}

// 画面に出ている文章（textContent）を、子要素までたどって集める
function collectTexts(el, out = []) {
  if (typeof el === 'string') {
    out.push(el);
    return out;
  }
  if (el.textContent) out.push(String(el.textContent));
  for (const c of el.children ?? []) collectTexts(c, out);
  return out;
}

async function endingTexts(extra) {
  const { createEndingScene } = await import('../src/scenes/endingScene.js');
  return withGlobals({ document: { createElement: () => notebookElement() } }, () => {
    const screenEl = notebookElement();
    createEndingScene({
      screenEl,
      session: { game: { day: 3, catName: 'たま', personality: 'amaenbo', coat: 'chatora', mistakes: 0 } },
      endingId: 'fate',
      onRetry: () => {},
      ...extra,
    });
    return collectTexts(screenEl);
  });
}

test('エンディング画面：思い出に残せたら「思い出に残しました」、新しい称号はその名前を出す', async () => {
  const { NOTEBOOK_TEXT, TITLES } = await import('../src/data/texts.js');
  assert.ok(NOTEBOOK_TEXT, 'texts.js に NOTEBOOK_TEXT がない');
  assert.equal(typeof NOTEBOOK_TEXT.saved, 'string');
  assert.equal(typeof NOTEBOOK_TEXT.newTitle, 'function');
  const texts = await endingTexts({ saved: true, newTitles: ['first', 'noMistake'] });
  assert.ok(texts.some((t) => t.includes(NOTEBOOK_TEXT.saved)), `「${NOTEBOOK_TEXT.saved}」が出ていない: ${texts.join(' / ')}`);
  for (const id of ['first', 'noMistake']) {
    const line = NOTEBOOK_TEXT.newTitle(TITLES[id].name);
    assert.ok(line.includes(TITLES[id].name), `newTitle の文に称号名が入っていない: ${line}`);
    assert.ok(texts.some((t) => t.includes(line)), `「${line}」が出ていない: ${texts.join(' / ')}`);
  }
});

test('エンディング画面：新しい称号がなければ、称号の文は出ない', async () => {
  const { NOTEBOOK_TEXT, TITLES } = await import('../src/data/texts.js');
  const { TITLE_IDS } = await import('../src/game/records.js');
  assert.ok(NOTEBOOK_TEXT, 'texts.js に NOTEBOOK_TEXT がない');
  const texts = await endingTexts({ saved: true, newTitles: [] });
  assert.ok(texts.some((t) => t.includes(NOTEBOOK_TEXT.saved)), `「${NOTEBOOK_TEXT.saved}」が出ていない: ${texts.join(' / ')}`);
  for (const id of TITLE_IDS) {
    const line = NOTEBOOK_TEXT.newTitle(TITLES[id].name);
    assert.ok(!texts.some((t) => t.includes(line)), `称号がないのに「${line}」が出ている`);
  }
});

// ---------------------------------------------------------------- ねこ手帳の仕上げ

// 何を呼んでも何もしない、偽の Canvas の描画コンテキスト
function nullContext() {
  return new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      return () => {};
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
}

// タグ名を覚え、canvas なら getContext を持つ偽 DOM 要素。
// innerHTML は覚えるだけ、querySelector は何もない要素を返す（タイトル画面の作りに合わせる）
function taggedElement(tag) {
  const node = notebookElement();
  node.tagName = String(tag).toUpperCase();
  node.querySelector = () => notebookElement();
  if (node.tagName === 'CANVAS') node.getContext = () => nullContext();
  return node;
}
const fakeDocument = () => ({ createElement: (tag) => taggedElement(tag) });

// 子要素までたどって、条件に合う要素を集める
function findAll(node, pred, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (pred(node)) out.push(node);
  for (const c of node.children ?? []) findAll(c, pred, out);
  return out;
}
// 要素の文章（textContent と子の文字列）を、canvas を除いてつなげる
function textOf(node) {
  if (typeof node === 'string') return node;
  if (!node || node.tagName === 'CANVAS') return '';
  return [node.textContent ?? '', ...(node.children ?? []).map(textOf)].join('');
}

test('ねこ手帳の思い出には、エンディングの名前をそのまま出し、日付は別の行に YYYY/MM/DD で出す', async () => {
  const { createNotebookScene } = await import('../src/scenes/notebookScene.js');
  const { emptyRecords, addEnding } = await import('../src/game/records.js');
  const { ENDINGS } = await import('../src/data/texts.js');
  const lapped = { name: 'みかん', coat: 'chatora', personality: 'amaenbo', endingId: 'fate', day: 3, mistakes: 0, date: '2026-10-01' };
  const visited = { name: 'よる', coat: 'kuro', personality: 'bibiri', endingId: 'visitor', day: 7, mistakes: 2, date: '2026-10-02' };
  const records = addEnding(addEnding(emptyRecords(), lapped).records, visited).records;
  withGlobals({ document: fakeDocument() }, () => {
    const screenEl = taggedElement('div');
    createNotebookScene({ screenEl, records, onBack: () => {} });
    const all = findAll(screenEl, () => true);
    const texts = all.map(textOf);
    const lapLine = `「${ENDINGS.fate.name}」3日目で和解`;
    const visitLine = `「${ENDINGS.visitor.name}」`;
    assert.ok(texts.some((t) => t.includes(lapLine)), `「${lapLine}」が出ていない: ${texts.join(' / ')}`);
    assert.ok(texts.some((t) => t.includes(visitLine)), `「${visitLine}」が出ていない: ${texts.join(' / ')}`);
    assert.ok(!texts.some((t) => t.includes('通い猫になった')), '「通い猫になった」が出ている');
    // 日付は、結果の文とは別の要素に、日付だけで出る
    for (const date of ['2026/10/01', '2026/10/02']) {
      assert.ok(all.some((n) => String(n.textContent ?? '').trim() === date), `日付 ${date} だけの要素がない: ${texts.join(' / ')}`);
    }
    const resultEls = all.filter((n) => String(n.textContent ?? '').includes(lapLine) || String(n.textContent ?? '').includes(visitLine));
    assert.ok(resultEls.length > 0, '結果の文を持つ要素がない');
    for (const n of resultEls) assert.ok(!/\d{4}\/\d{2}\/\d{2}/.test(n.textContent), `結果の文と日付が同じ要素にある: ${n.textContent}`);
  });
});

test('タイトルの「ねこ手帳」ボタンには、猫の小さな絵（canvas）と「ねこ手帳」の文字がある', async () => {
  const { createTitleScene } = await import('../src/scenes/titleScene.js');
  const { NOTEBOOK_TEXT } = await import('../src/data/texts.js');
  withGlobals({ document: fakeDocument() }, () => {
    const screenEl = taggedElement('div');
    createTitleScene({ screenEl, onStart: () => {}, onNotebook: () => {} });
    const buttons = findAll(screenEl, (n) => String(n.className ?? '').split(/\s+/).includes('title-notebook'));
    assert.equal(buttons.length, 1, 'class title-notebook のボタンが1つない');
    const button = buttons[0];
    const canvases = findAll(button, (n) => n.tagName === 'CANVAS');
    assert.ok(canvases.length >= 1, 'ボタンの中に canvas がない');
    assert.ok(textOf(button).includes(NOTEBOOK_TEXT.open), `ボタンの文字: ${textOf(button)}`);
  });
});

// ---------------------------------------------------------------- 名前付け画面の「もどる」

// イベントを記録して、あとから発火できる偽 DOM 要素（{ once: true } と onclick なども扱う）
function eventElement(tag) {
  const node = taggedElement(tag);
  const listeners = [];
  node.value = '';
  node.addEventListener = (type, fn, opts) => {
    listeners.push({ type, fn, once: typeof opts === 'object' && !!opts?.once });
  };
  node.removeEventListener = (type, fn) => {
    const i = listeners.findIndex((l) => l.type === type && l.fn === fn);
    if (i >= 0) listeners.splice(i, 1);
  };
  node.blur = () => {};
  node.focus = () => {};
  node.fire = (type, extra = {}) => {
    const event = { type, target: node, currentTarget: node, preventDefault() {}, stopPropagation() {}, ...extra };
    for (const l of [...listeners]) {
      if (l.type !== type) continue;
      if (l.once) listeners.splice(listeners.indexOf(l), 1);
      l.fn.call(node, event);
    }
    if (typeof node[`on${type}`] === 'function') node[`on${type}`](event);
  };
  return node;
}

// 名前付け画面を作り、呼ばれた回数と、ボタンを返す
async function nameScreen() {
  const { createNameScene } = await import('../src/scenes/nameScene.js');
  const calls = { decide: [], back: 0 };
  const screenEl = eventElement('div');
  withGlobals({ document: { createElement: (tag) => eventElement(tag) } }, () => {
    createNameScene({
      screenEl,
      coat: 'chatora',
      onDecide: (name) => calls.decide.push(name),
      onBack: () => { calls.back += 1; },
    });
  });
  const byClass = (cls) => findAll(screenEl, (n) => String(n.className ?? '').split(/\s+/).includes(cls));
  return { screenEl, calls, back: byClass('name-back'), ok: byClass('name-ok') };
}

test('名前付け画面には「もどる」ボタンがある', async () => {
  const { NAME_TEXT } = await import('../src/data/texts.js');
  assert.equal(typeof NAME_TEXT.back, 'string', 'NAME_TEXT.back がない');
  assert.ok(NAME_TEXT.back.length > 0);
  const { back } = await nameScreen();
  assert.equal(back.length, 1, 'class name-back のボタンが1つない');
  assert.equal(textOf(back[0]).trim(), NAME_TEXT.back);
});

test('「もどる」を押すと一度だけ戻り、名前は決まらず、画面は空になる（そのあと押しても何も起きない）', async () => {
  const { screenEl, calls, back, ok } = await nameScreen();
  assert.equal(back.length, 1, 'class name-back のボタンが1つない');
  assert.equal(ok.length, 1, 'class name-ok のボタンが1つない');
  back[0].fire('click');
  assert.equal(calls.back, 1);
  assert.deepEqual(calls.decide, []);
  assert.equal(screenEl.children.length, 0, '画面が空になっていない');
  back[0].fire('click');
  assert.equal(calls.back, 1, 'もう一度押したら、また戻った');
  ok[0].fire('click');
  assert.deepEqual(calls.decide, [], '戻ったあとに「この名前にする」で名前が決まった');
  assert.equal(calls.back, 1);
});

test('名前を決めたあとで「もどる」を押しても、戻らない', async () => {
  const { calls, back, ok } = await nameScreen();
  assert.equal(back.length, 1, 'class name-back のボタンが1つない');
  ok[0].fire('click');
  assert.equal(calls.decide.length, 1, '名前が決まっていない（このテストの前提）');
  back[0].fire('click');
  assert.equal(calls.back, 0);
  assert.equal(calls.decide.length, 1);
});
