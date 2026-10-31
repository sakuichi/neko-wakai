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

// ---------------------------------------------------------------- 昼の画面を途中でやめる（stop）

// 1日目の昼の画面を作る。トーストに渡された文と、onEnd の呼ばれた回数を記録する
async function fleeDayScene() {
  const { createDayScene } = await import('../src/scenes/dayScene.js');
  const { createGame } = await import('../src/game/progression.js');
  const { CARDS } = await import('../src/data/texts.js');
  const { fixedRng } = await import('./helpers.js');
  const noop = () => {};
  const toasts = [];
  const overlay = { busy: false, splash: noop, card: noop, bubble: noop, toast: (text) => toasts.push(text), clear: noop };
  const hud = { show: noop, update: noop };
  const renderer = { addEffect: noop, hitTestCat: () => true };
  const input = { setBlinkEnabled: noop, holdMs: () => 0 };
  const sound = { purr: noop, meow: noop, bump: noop };
  const session = {
    game: { ...createGame({ personality: 'amaenbo', seed: 1 }), catName: 'たま', seenCards: Object.keys(CARDS) },
    misses: {},
  };
  const ends = [];
  const scene = createDayScene({ session, overlay, hud, renderer, input, sound, rng: fixedRng(0.5), onEnd: (r) => ends.push(r) });
  return { scene, toasts, ends };
}

test('昼に猫が逃げると、少しあとに「焦りは禁物」のトーストが出る（stop しなければ）', async (t) => {
  const { TUTORIAL } = await import('../src/data/texts.js');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { scene, toasts } = await fleeDayScene();
  // 1日目の始まりはくつろぎ。なでると逃げる（ミス）
  assert.equal(scene.state().cat.mode, 'relax', 'くつろぎから始まる（このテストの前提）');
  scene.act({ type: 'pet' });
  assert.equal(scene.state().cat.mode, 'flee', '逃げていない（このテストの前提）');
  assert.ok(!toasts.includes(TUTORIAL.flee), 'すぐには出ない');
  t.mock.timers.tick(2000);
  assert.ok(toasts.includes(TUTORIAL.flee), `トーストが出ていない: ${toasts.join(' / ')}`);
});

test('昼の画面を stop したら、予約していたトーストを出さず、時間が進んでも一日を終えない', async (t) => {
  const { TUTORIAL } = await import('../src/data/texts.js');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { scene, toasts, ends } = await fleeDayScene();
  scene.act({ type: 'pet' });
  assert.equal(scene.state().cat.mode, 'flee', '逃げていない（このテストの前提）');
  assert.equal(typeof scene.stop, 'function', 'stop() がない');
  scene.stop();
  t.mock.timers.tick(2000);
  assert.ok(!toasts.includes(TUTORIAL.flee), 'stop したのにトーストが出た');
  // 一日の長さ（40秒）を大きく超えて進めても、onEnd は呼ばれない
  for (let i = 0; i < 120; i++) scene.update(1);
  t.mock.timers.tick(10000);
  assert.deepEqual(ends, [], 'stop したのに一日が終わった');
  assert.ok(!toasts.includes(TUTORIAL.flee));
});

// ---------------------------------------------------------------- 我慢のごほうび

test('我慢のごほうびでは、効果音を鳴らさない', async () => {
  const { soundsFor } = await import('../src/scenes/dayScene.js');
  assert.deepEqual(soundsFor('relief'), []);
});

test('昼の画面：しっぽパタパタを我慢できたら、トーストと「ほっ」の効果が出て、初回だけ説明の吹き出しが出る（効果音は鳴らない）', async () => {
  const { createDayScene } = await import('../src/scenes/dayScene.js');
  const { createGame } = await import('../src/game/progression.js');
  const { CARDS, FEEDBACK, withName } = await import('../src/data/texts.js');
  const noop = () => {};
  assert.equal(FEEDBACK.relief, '（ほっとしたみたい）');
  const tip = CARDS['tip:patience'];
  assert.ok(tip, "CARDS['tip:patience'] がない");
  assert.ok(!tip.pause, "CARDS['tip:patience'] は止めない吹き出し（pause なし）");
  const toasts = [];
  const bubbles = [];
  const cards = [];
  const overlay = {
    busy: false,
    splash: noop,
    card: (c) => cards.push(c),
    bubble: (c) => bubbles.push(c),
    toast: (text, ms) => toasts.push({ text, ms }),
    clear: noop,
  };
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
  // 2日目（しっぽパタパタが出て、膝には乗らない日）。我慢の説明以外のカードは見たことにしておく
  const session = {
    game: {
      ...createGame({ personality: 'amaenbo', seed: 1 }),
      day: 2,
      catName: 'たま',
      seenCards: Object.keys(CARDS).filter((k) => k !== 'tip:patience'),
    },
    misses: {},
  };
  // 次の様子を選ぶとき、しっぽパタパタのあとは「くつろぎ」（候補の先頭）、それ以外のあとは「しっぽパタパタ」（2日目の候補の最後）にする
  let scene = null;
  const rng = () => (scene.state().cat.mode === 'tailFlick' ? 0 : 0.999);
  scene = createDayScene({ session, overlay, hud, renderer, input, sound, rng, onEnd: noop });

  // しっぽパタパタが（触られずに）終わった update で、新しく出たものを記録する
  const endings = [];
  for (let i = 0; i < 2000 && endings.length < 2; i++) {
    const before = scene.state().cat.mode;
    const n = { toasts: toasts.length, effects: effects.length, bubbles: bubbles.length };
    scene.update(0.05);
    if (before === 'tailFlick' && scene.state().cat.mode !== 'tailFlick') {
      endings.push({ toasts: toasts.slice(n.toasts), effects: effects.slice(n.effects), bubbles: bubbles.slice(n.bubbles) });
    }
  }
  assert.equal(endings.length, 2, 'しっぽパタパタが2回終わる前に上限に達した（このテストの前提）');

  // 1回目：トースト・効果・説明の吹き出し
  const [first, second] = endings;
  assert.deepEqual(first.toasts, [{ text: FEEDBACK.relief, ms: 1600 }]);
  assert.deepEqual(first.effects, ['relief']);
  assert.deepEqual(first.bubbles, [{ title: withName(tip.title, 'たま'), body: withName(tip.body, 'たま') }]);
  assert.ok(session.game.seenCards.includes('tip:patience'), 'seenCards に tip:patience が入っていない');
  // 2回目：トーストと効果は出るが、吹き出しは出ない
  assert.deepEqual(second.toasts, [{ text: FEEDBACK.relief, ms: 1600 }]);
  assert.deepEqual(second.effects, ['relief']);
  assert.deepEqual(second.bubbles, []);
  // 止めるカードは出さず、効果音も鳴らさない
  assert.deepEqual(cards, []);
  assert.deepEqual(played, []);
});

// ---------------------------------------------------------------- 我慢のごほうびと、ほかの表示が同じ update で重なるとき

// 昼の画面を作り、トースト・吹き出し・止めるカード・効果を記録する。
// pick(cat) は乱数の値を返す関数。cat はその update を始めたときの猫（次の様子を選ぶときの、終わる様子）
async function patienceDayScene({ day, trust = 0, seenCards, pick }) {
  const { createDayScene } = await import('../src/scenes/dayScene.js');
  const { createGame } = await import('../src/game/progression.js');
  const noop = () => {};
  const toasts = [];
  const bubbles = [];
  const cards = [];
  const overlay = {
    busy: false,
    splash: noop,
    card: (c) => cards.push(c),
    bubble: (c) => bubbles.push(c),
    toast: (text, ms) => toasts.push({ text, ms }),
    clear: noop,
  };
  const hud = { show: noop, update: noop };
  const effects = [];
  const renderer = { addEffect: (name) => effects.push(name), hitTestCat: () => false };
  const input = { setBlinkEnabled: noop, holdMs: () => 0 };
  const sound = { purr: noop, meow: noop, bump: noop };
  const session = {
    game: { ...createGame({ personality: 'amaenbo', seed: 1 }), day, trust, catName: 'たま', seenCards },
    misses: {},
  };
  let scene = null;
  const rng = () => pick(scene.state().cat);
  scene = createDayScene({ session, overlay, hud, renderer, input, sound, rng, onEnd: noop });
  // 1回 update して、その update で新しく出たものを返す
  function step(dt = 0.05) {
    const before = scene.state().cat;
    const n = { toasts: toasts.length, bubbles: bubbles.length, cards: cards.length, effects: effects.length };
    scene.update(dt);
    return {
      before: before.mode,
      after: scene.state().cat.mode,
      toasts: toasts.slice(n.toasts),
      bubbles: bubbles.slice(n.bubbles),
      cards: cards.slice(n.cards),
      effects: effects.slice(n.effects),
      seenCards: [...session.game.seenCards],
    };
  }
  return { scene, session, toasts, bubbles, cards, effects, step };
}

test('昼の画面：我慢のごほうびで信頼が100になり、同じ update で膝に乗ったら、膝に乗った文が最後のトーストとして残り、ほっとした表示も我慢の説明も出さない', async () => {
  const { CARDS, FEEDBACK, LAP_TEXT, withName } = await import('../src/data/texts.js');
  // 3日目（膝に乗れる日）。信頼97から始め、くつろぎで距離0まで歩いてから、お腹見せにする。
  // お腹見せが時間切れで終わる update で、我慢のごほうびを足すと信頼が100になる（甘えん坊の我慢のごほうびは likes.patience 倍で、ふつうより小さい）
  // 距離0のときの3日目の候補（甘えん坊の重み）：relax3, look2, tailUp2, tailFlick1, belly1, backTurn1, rub3（計13）。0.654 → belly
  const pick = (cat) => {
    if (cat.mode === 'relax') return cat.distance > 0 ? 0 : 0.654;
    return 0;
  };
  const { scene, session, toasts, step } = await patienceDayScene({
    day: 3,
    trust: 97,
    seenCards: Object.keys(CARDS).filter((k) => k !== 'tip:patience'),
    pick,
  });
  let lapStep = null;
  for (let i = 0; i < 2000 && !lapStep; i++) {
    const s = step();
    if (s.after === 'lap') lapStep = s;
  }
  assert.ok(lapStep, '膝に乗る前に上限に達した（このテストの前提）');
  assert.equal(lapStep.before, 'belly', 'お腹見せが終わる update で膝に乗っていない（このテストの前提）');
  assert.equal(scene.state().day.trust, 100);

  const lap = { text: withName(LAP_TEXT, 'たま'), ms: 3200 };
  // 膝に乗った文が最後のトーストとして残る
  assert.deepEqual(toasts[toasts.length - 1], lap);
  assert.deepEqual(lapStep.toasts, [lap]);
  // ほっとしたトースト・効果、我慢の説明の吹き出しは出さない
  assert.ok(!lapStep.toasts.some((t) => t.text === FEEDBACK.relief), 'ほっとしたトーストが出た');
  assert.deepEqual(lapStep.effects.filter((e) => e === 'relief'), []);
  assert.deepEqual(lapStep.bubbles, []);
  assert.ok(!session.game.seenCards.includes('tip:patience'), 'seenCards に tip:patience が入った');
});

test('昼の画面：我慢できた update で、初めての様子のサイン説明（吹き出し）が出るときは、我慢の説明を出さずに次に我慢できたときに出す', async () => {
  const { CARDS, FEEDBACK, withName } = await import('../src/data/texts.js');
  const card = (key) => ({ title: withName(CARDS[key].title, 'たま'), body: withName(CARDS[key].body, 'たま') });
  assert.ok(!CARDS['sign:tailUp'].pause, "CARDS['sign:tailUp'] は止めない吹き出し（このテストの前提）");
  // 2日目の候補（甘えん坊の重み）：relax3, look2, tailUp2, tailFlick1×(1+警戒/50)。
  // しっぽパタパタのあとは 0.7 → しっぽピン、それ以外のあとは 0.999 → しっぽパタパタ（候補の最後）
  const pick = (cat) => (cat.mode === 'tailFlick' ? 0.7 : 0.999);
  const { session, cards, step } = await patienceDayScene({
    day: 2,
    seenCards: Object.keys(CARDS).filter((k) => k !== 'tip:patience' && k !== 'sign:tailUp'),
    pick,
  });
  const endings = [];
  for (let i = 0; i < 2000 && endings.length < 2; i++) {
    const s = step();
    if (s.before === 'tailFlick' && s.after !== 'tailFlick') endings.push(s);
  }
  assert.equal(endings.length, 2, 'しっぽパタパタが2回終わる前に上限に達した（このテストの前提）');
  const [first, second] = endings;
  assert.equal(first.after, 'tailUp', '1回目のあとがしっぽピンでない（このテストの前提）');
  assert.equal(second.after, 'tailUp', '2回目のあとがしっぽピンでない（このテストの前提）');

  // 1回目：初めてのしっぽピンの説明だけが吹き出しで出る。我慢の説明は出さず、seenCards にも入れない
  assert.deepEqual(first.bubbles, [card('sign:tailUp')]);
  assert.ok(first.seenCards.includes('sign:tailUp'), 'seenCards に sign:tailUp が入っていない');
  assert.ok(!first.seenCards.includes('tip:patience'), '1回目で seenCards に tip:patience が入った');
  // ほっとしたトーストと効果は出す
  assert.deepEqual(first.toasts, [{ text: FEEDBACK.relief, ms: 1600 }]);
  assert.deepEqual(first.effects, ['relief']);

  // 2回目：新しい説明は出ないので、我慢の説明の吹き出しが出る
  assert.deepEqual(second.bubbles, [card('tip:patience')]);
  assert.ok(session.game.seenCards.includes('tip:patience'), '2回目で seenCards に tip:patience が入っていない');
  assert.deepEqual(second.toasts, [{ text: FEEDBACK.relief, ms: 1600 }]);
  assert.deepEqual(second.effects, ['relief']);
  assert.deepEqual(cards, []);
});

test('昼の画面：我慢できた update で、初めての様子の止めるカード（お腹見せ）が出るときも、その update では我慢の説明を出さない', async () => {
  const { CARDS, withName } = await import('../src/data/texts.js');
  const card = (key) => ({ title: withName(CARDS[key].title, 'たま'), body: withName(CARDS[key].body, 'たま') });
  assert.ok(CARDS['sign:belly'].pause, "CARDS['sign:belly'] は止めるカード（このテストの前提）");
  // 3日目・信頼0（距離の下限70なので、すり寄りは候補に入らない）。候補（甘えん坊の重み）：
  // relax3, look2, tailUp2, tailFlick1×(1+警戒/50), belly1, backTurn1。
  // しっぽパタパタのあとは 0.85 → お腹見せ、それ以外のあとは 0.75 → しっぽパタパタ
  const pick = (cat) => (cat.mode === 'tailFlick' ? 0.85 : 0.75);
  const { cards, step } = await patienceDayScene({
    day: 3,
    seenCards: Object.keys(CARDS).filter((k) => k !== 'tip:patience' && k !== 'sign:belly'),
    pick,
  });
  let ending = null;
  for (let i = 0; i < 2000 && !ending; i++) {
    const s = step();
    if (s.before === 'tailFlick' && s.after !== 'tailFlick') ending = s;
  }
  assert.ok(ending, 'しっぽパタパタが終わる前に上限に達した（このテストの前提）');
  assert.equal(ending.after, 'belly', 'しっぽパタパタのあとがお腹見せでない（このテストの前提）');

  assert.deepEqual(ending.cards, [card('sign:belly')]);
  assert.deepEqual(cards, [card('sign:belly')]);
  assert.deepEqual(ending.bubbles, []);
  assert.ok(!ending.seenCards.includes('tip:patience'), 'seenCards に tip:patience が入った');
});

test('昼の画面：サイン説明の吹き出しが表示中（5秒未満）に我慢できても我慢の説明は出さず、表示時間が過ぎてから我慢できたときに出す', async () => {
  const { CARDS, FEEDBACK, withName } = await import('../src/data/texts.js');
  const card = (key) => ({ title: withName(CARDS[key].title, 'たま'), body: withName(CARDS[key].body, 'たま') });
  assert.ok(!CARDS['sign:tailFlick'].pause, "CARDS['sign:tailFlick'] は止めない吹き出し（このテストの前提）");
  // 2日目の候補（甘えん坊の重み）：relax3, look2, tailUp2, tailFlick1×(1+警戒/50)。
  // しっぽパタパタのあとは 0 → くつろぎ（3秒）、それ以外のあとは 0.999 → しっぽパタパタ（候補の最後・約3秒）
  const pick = (cat) => (cat.mode === 'tailFlick' ? 0 : 0.999);
  const { session, cards, step } = await patienceDayScene({
    day: 2,
    seenCards: Object.keys(CARDS).filter((k) => k !== 'tip:patience' && k !== 'sign:tailFlick'),
    pick,
  });
  const dt = 0.05;
  let elapsed = 0;
  let shownAt = null;
  const endings = [];
  for (let i = 0; i < 2000 && endings.length < 2; i++) {
    const s = step(dt);
    elapsed += dt;
    if (s.bubbles.some((b) => b.title === CARDS['sign:tailFlick'].title)) shownAt = elapsed;
    if (s.before === 'tailFlick' && s.after !== 'tailFlick') endings.push({ ...s, at: elapsed });
  }
  assert.ok(shownAt !== null, 'しっぽパタパタの説明が出ていない（このテストの前提）');
  assert.equal(endings.length, 2, 'しっぽパタパタが2回終わる前に上限に達した（このテストの前提）');
  const [first, second] = endings;
  assert.ok(first.at - shownAt < 5, `1回目の我慢が説明から ${(first.at - shownAt).toFixed(2)} 秒後（このテストの前提）`);
  assert.ok(second.at - shownAt >= 5, `2回目の我慢が説明から ${(second.at - shownAt).toFixed(2)} 秒後（このテストの前提）`);

  // 1回目：説明の吹き出しが表示中なので、我慢の説明は出さず seenCards にも入れない。トーストと効果は出す
  assert.deepEqual(first.bubbles, []);
  assert.ok(!first.seenCards.includes('tip:patience'), '1回目で seenCards に tip:patience が入った');
  assert.deepEqual(first.toasts, [{ text: FEEDBACK.relief, ms: 1600 }]);
  assert.deepEqual(first.effects, ['relief']);

  // 2回目：説明の表示時間が過ぎたので、我慢の説明の吹き出しが出る
  assert.deepEqual(second.bubbles, [card('tip:patience')]);
  assert.ok(session.game.seenCards.includes('tip:patience'), '2回目で seenCards に tip:patience が入っていない');
  assert.deepEqual(second.toasts, [{ text: FEEDBACK.relief, ms: 1600 }]);
  assert.deepEqual(second.effects, ['relief']);
  assert.deepEqual(cards, []);
});

// ---------------------------------------------------------------- 性格ごとに効く行動（ツンデレのツン・デレ、性格のひとこと）

// 昼の画面を作り、トースト・吹き出し・止めるカード・効果・効果音を記録する。説明カードは見たことにしておく。
// trust はその日の始まりの信頼。rng(cat) を渡すと、そのとき（update を始めたとき）の猫に応じた乱数を返す。省くと fixedRng(0.5)
async function personalityDayScene({ personality, day, trust, rng = null }) {
  const { createDayScene } = await import('../src/scenes/dayScene.js');
  const { createGame } = await import('../src/game/progression.js');
  const { CARDS } = await import('../src/data/texts.js');
  const { fixedRng } = await import('./helpers.js');
  const noop = () => {};
  const toasts = [];
  const bubbles = [];
  const cards = [];
  const overlay = {
    busy: false,
    splash: noop,
    card: (c) => cards.push(c),
    bubble: (c) => bubbles.push(c),
    toast: (text, ms) => toasts.push({ text, ms }),
    clear: noop,
  };
  const hud = { show: noop, update: noop };
  const effects = [];
  const renderer = { addEffect: (name) => effects.push(name), hitTestCat: () => true };
  const input = { setBlinkEnabled: noop, holdMs: () => 0 };
  const played = [];
  const sound = {
    purr: () => played.push('purr'),
    meow: () => played.push('meow'),
    bump: () => played.push('bump'),
  };
  const session = {
    game: { ...createGame({ personality, seed: 1 }), day, trust, catName: 'たま', seenCards: Object.keys(CARDS) },
    misses: {},
  };
  let scene = null;
  const random = rng ? () => rng(scene.state().cat) : fixedRng(0.5);
  scene = createDayScene({ session, overlay, hud, renderer, input, sound, rng: random, onEnd: noop });
  // fn（update や act）を呼び、そのあいだに新しく出たものと、前後の信頼を返す
  function during(fn) {
    const n = { toasts: toasts.length, bubbles: bubbles.length, cards: cards.length, effects: effects.length, played: played.length };
    const trustBefore = scene.state().day.trust;
    fn();
    return {
      trustBefore,
      trustAfter: scene.state().day.trust,
      toasts: toasts.slice(n.toasts),
      bubbles: bubbles.slice(n.bubbles),
      cards: cards.slice(n.cards),
      effects: effects.slice(n.effects),
      played: played.slice(n.played),
    };
  }
  // 猫がこちらを見る（look）まで待つ
  function waitLook() {
    for (let i = 0; i < 400 && scene.state().cat.mode !== 'look'; i++) scene.update(0.05);
    assert.equal(scene.state().cat.mode, 'look', 'こちらを見る前に上限に達した（このテストの前提）');
  }
  return { scene, session, toasts, bubbles, cards, effects, played, during, waitLook };
}

test('ツンの間にまばたきして目をそらされても、効果音は鳴らさない', async () => {
  const { soundsFor } = await import('../src/scenes/dayScene.js');
  assert.deepEqual(soundsFor('blinkAway'), []);
});

test('昼の画面：ツンデレにまばたきすると blinkAway のトーストと効果が出て（効果音なし）、2回目でヒントの吹き出しが1回だけ出る。ミスには数えない', async () => {
  const { FEEDBACK, HINTS, withName } = await import('../src/data/texts.js');
  assert.equal(typeof FEEDBACK.blinkAway, 'string', 'FEEDBACK.blinkAway がない');
  assert.ok(FEEDBACK.blinkAway.length > 0, 'FEEDBACK.blinkAway が空');
  const hint = HINTS.blinkAway;
  assert.ok(hint && hint.title && hint.body, 'HINTS.blinkAway がない');
  // 2日目（まばたきが使える・膝に乗らない日）。信頼 0 のツンデレ
  const { scene, cards, during, waitLook } = await personalityDayScene({ personality: 'tsundere', day: 2, trust: 0 });
  const blinks = [];
  for (let n = 0; n < 3; n++) {
    waitLook();
    blinks.push(during(() => scene.act({ type: 'blink', holdMs: 1000 })));
  }
  for (const [i, b] of blinks.entries()) {
    assert.deepEqual(b.toasts, [{ text: FEEDBACK.blinkAway, ms: 1600 }], `${i + 1}回目のトースト`);
    assert.deepEqual(b.effects, ['blinkAway'], `${i + 1}回目の効果`);
    assert.deepEqual(b.played, [], `${i + 1}回目の効果音`);
  }
  // ヒントは2回目にだけ、名前入りで出る
  const shown = { title: withName(hint.title, 'たま'), body: withName(hint.body, 'たま') };
  assert.ok(shown.body.includes('たま'), `ヒントに名前が入っていない: ${shown.body}`);
  assert.deepEqual(blinks[0].bubbles, [], '1回目の吹き出し');
  assert.deepEqual(blinks[1].bubbles, [shown], '2回目の吹き出し');
  assert.deepEqual(blinks[2].bubbles, [], '3回目の吹き出し');
  assert.deepEqual(cards, []);
  assert.equal(scene.state().day.mistakes, 0);
});

test('昼の画面：ツンデレの信頼が時間とともに shyUntil をまたいだ瞬間に、デレたトーストが1回だけ出る', async () => {
  const { DERE_TEXT, withName } = await import('../src/data/texts.js');
  const { PERSONALITIES } = await import('../src/data/params.js');
  assert.equal(typeof DERE_TEXT, 'string', 'texts.js に DERE_TEXT がない');
  const dere = { text: withName(DERE_TEXT, 'たま'), ms: 3200 };
  const S = PERSONALITIES.tsundere.shyUntil;
  assert.ok(S > 0, `ツンデレの shyUntil ${S}`);
  // 2日目、信頼 shyUntil−1 から、何もせず待つ（落ち着いている間に少しずつ信頼が増える）
  const { scene, toasts, during } = await personalityDayScene({ personality: 'tsundere', day: 2, trust: S - 1 });
  let crossing = null;
  for (let i = 0; i < 400; i++) {
    const s = during(() => scene.update(0.05));
    if (s.trustBefore < S && s.trustAfter >= S) crossing = s;
  }
  assert.ok(crossing, `信頼が shyUntil をまたがなかった（このテストの前提）。最後の信頼 ${scene.state().day.trust}`);
  assert.deepEqual(crossing.toasts.filter((t) => t.text === dere.text), [dere], 'またいだ update でデレたトーストが出ていない');
  assert.equal(toasts.filter((t) => t.text === dere.text).length, 1, 'デレたトーストの回数');
});

test('昼の画面：ツンデレの信頼が、なでて shyUntil をまたいだ瞬間にも、デレたトーストが1回だけ出る', async () => {
  const { DERE_TEXT, withName } = await import('../src/data/texts.js');
  const { PERSONALITIES, RULES } = await import('../src/data/params.js');
  assert.equal(typeof DERE_TEXT, 'string', 'texts.js に DERE_TEXT がない');
  const dere = { text: withName(DERE_TEXT, 'たま'), ms: 3200 };
  const tsundere = PERSONALITIES.tsundere;
  const S = tsundere.shyUntil;
  assert.ok(S > 0, `ツンデレの shyUntil ${S}`);
  assert.ok(tsundere.likes, 'PERSONALITIES.tsundere.likes がない');
  // 3日目、信頼 shyUntil−5。すり寄りが届く距離まではくつろぎ（候補の先頭）、届いたらすり寄り（候補の最後）にする
  const pick = (cat) => (cat.mode === 'relax' && cat.distance <= RULES.rubMaxDistance ? 0.999 : 0);
  const { scene, toasts, during } = await personalityDayScene({ personality: 'tsundere', day: 3, trust: S - 5, rng: pick });
  for (let i = 0; i < 1000 && scene.state().cat.mode !== 'rub'; i++) scene.update(0.05);
  assert.equal(scene.state().cat.mode, 'rub', 'すり寄りになる前に上限に達した（このテストの前提）');
  const before = scene.state().day.trust;
  assert.ok(before < S, `なでる前に信頼 ${before} が shyUntil 以上になった（このテストの前提）`);
  assert.ok(before + RULES.pet.rubTrust * tsundere.likes.pet >= S, 'なでても shyUntil に届かない（このテストの前提）');
  assert.equal(toasts.filter((t) => t.text === dere.text).length, 0, 'なでる前にデレたトーストが出た');

  const petted = during(() => scene.act({ type: 'pet' }));
  assert.ok(petted.trustAfter >= S, `なでたあとの信頼 ${petted.trustAfter}`);
  assert.deepEqual(petted.toasts.filter((t) => t.text === dere.text), [dere], 'なでた瞬間にデレたトーストが出ていない');
  // そのあと時間が進んでも、もう出ない
  for (let i = 0; i < 100; i++) scene.update(0.05);
  assert.equal(toasts.filter((t) => t.text === dere.text).length, 1, 'デレたトーストの回数');
});

test('昼の画面：その日の始まりから信頼が shyUntil 以上のツンデレには、デレたトーストを出さない', async () => {
  const { DERE_TEXT, withName } = await import('../src/data/texts.js');
  const { PERSONALITIES } = await import('../src/data/params.js');
  assert.equal(typeof DERE_TEXT, 'string', 'texts.js に DERE_TEXT がない');
  const dere = withName(DERE_TEXT, 'たま');
  const S = PERSONALITIES.tsundere.shyUntil;
  assert.ok(S > 0, `ツンデレの shyUntil ${S}`);
  const { scene, toasts } = await personalityDayScene({ personality: 'tsundere', day: 2, trust: S });
  for (let i = 0; i < 400; i++) scene.update(0.05);
  assert.ok(scene.state().day.trust > S, '信頼が増えていない（このテストの前提）');
  assert.deepEqual(toasts.filter((t) => t.text === dere), []);
});

test('昼の画面の view() の shy：ツンデレは信頼 shyUntil 未満の間だけ true。甘えん坊・ビビりは常に false', async () => {
  const { PERSONALITIES } = await import('../src/data/params.js');
  const S = PERSONALITIES.tsundere.shyUntil;
  assert.ok(S > 0, `ツンデレの shyUntil ${S}`);
  // ツンデレ：信頼 shyUntil−1 から待って、shyUntil をまたぐ
  const t = await personalityDayScene({ personality: 'tsundere', day: 2, trust: S - 1 });
  assert.equal(t.scene.view().shy, true, '始まり（信頼 shyUntil−1）');
  let crossed = false;
  for (let i = 0; i < 400; i++) {
    t.scene.update(0.05);
    const trust = t.scene.state().day.trust;
    if (trust >= S) crossed = true;
    assert.equal(t.scene.view().shy, trust < S, `信頼 ${trust}`);
  }
  assert.ok(crossed, '信頼が shyUntil をまたがなかった（このテストの前提）');
  // ツンデレ：始まりから shyUntil ちょうど
  const t2 = await personalityDayScene({ personality: 'tsundere', day: 2, trust: S });
  assert.equal(t2.scene.view().shy, false, '始まり（信頼 shyUntil）');
  // ほかの性格：信頼 0 から待っても、ずっと false
  for (const personality of ['amaenbo', 'bibiri']) {
    const o = await personalityDayScene({ personality, day: 2, trust: 0 });
    assert.equal(o.scene.view().shy, false, `${personality}: 始まり`);
    for (let i = 0; i < 400; i++) {
      o.scene.update(0.05);
      assert.equal(o.scene.view().shy, false, `${personality}: 信頼 ${o.scene.state().day.trust}`);
    }
  }
});

test('エンディング画面：その性格のひとこと（PERSONALITY_TIPS）の行が出る', async () => {
  const { PERSONALITY_TIPS } = await import('../src/data/texts.js');
  const { PERSONALITIES } = await import('../src/data/params.js');
  assert.ok(PERSONALITY_TIPS, 'texts.js に PERSONALITY_TIPS がない');
  const coats = { amaenbo: 'chatora', tsundere: 'shiro', bibiri: 'kuro' };
  for (const personality of Object.keys(PERSONALITIES)) {
    const tip = PERSONALITY_TIPS[personality];
    assert.equal(typeof tip, 'string', `PERSONALITY_TIPS.${personality} がない`);
    assert.ok(tip.length > 0, `PERSONALITY_TIPS.${personality} が空`);
    const texts = await endingTexts({
      session: { game: { day: 3, catName: 'たま', personality, coat: coats[personality], mistakes: 0 } },
    });
    assert.ok(texts.some((t) => t.includes(tip)), `${personality}: 「${tip}」が出ていない: ${texts.join(' / ')}`);
    for (const other of Object.keys(PERSONALITIES).filter((p) => p !== personality)) {
      assert.ok(!texts.some((t) => t.includes(PERSONALITY_TIPS[other])), `${personality} なのに ${other} のひとことが出ている`);
    }
  }
});

test('1日目の説明カード（day:intro）の最後に、猫の性格を観察するよう伝える1行が足されている', async () => {
  const { CARDS } = await import('../src/data/texts.js');
  const lines = CARDS['day:intro'].body.split('\n');
  // 今の本文（2行）の後ろに1行足す
  assert.ok(lines.length >= 3, `day:intro の行数 ${lines.length}`);
  const last = lines[lines.length - 1];
  assert.ok(last.includes('性格'), `最後の行: ${last}`);
});

// ---------------------------------------------------------------- ビビりの手（なでても「ビクビク」）

test('ビビりをなでてビクビクされても（timid）、効果音は鳴らさない', async () => {
  const { soundsFor } = await import('../src/scenes/dayScene.js');
  assert.deepEqual(soundsFor('timid'), []);
});

test('昼の画面：ビビりのすり寄りをなでると、timid のトーストと効果が出て、効果音（ゴロゴロ・にゃーん・ぽふっ）は鳴らない', async () => {
  const { FEEDBACK } = await import('../src/data/texts.js');
  const { RULES } = await import('../src/data/params.js');
  assert.equal(FEEDBACK.timid, '（ビクビク……手はまだこわいみたい）');
  // 3日目、信頼 40（すり寄りが届く距離まで近づけて、まだ手がこわい信頼）。届く距離まではくつろぎ（候補の先頭）、届いたらすり寄り（候補の最後）にする
  const pick = (cat) => (cat.mode === 'relax' && cat.distance <= RULES.rubMaxDistance ? 0.999 : 0);
  const { scene, during } = await personalityDayScene({ personality: 'bibiri', day: 3, trust: 40, rng: pick });
  for (let i = 0; i < 1000 && scene.state().cat.mode !== 'rub'; i++) scene.update(0.05);
  assert.equal(scene.state().cat.mode, 'rub', 'すり寄りになる前に上限に達した（このテストの前提）');

  const petted = during(() => scene.act({ type: 'pet' }));
  assert.equal(scene.state().cat.mode, 'purr');
  assert.deepEqual(petted.toasts, [{ text: FEEDBACK.timid, ms: 1600 }]);
  assert.deepEqual(petted.effects, ['timid']);
  assert.deepEqual(petted.played, []);
  // ゴロゴロの様子の間に時間が進んでも、ゴロゴロの音は鳴らさない
  const after = during(() => {
    for (let i = 0; i < Math.ceil(RULES.purrSec / 0.05); i++) scene.update(0.05);
  });
  assert.ok(!after.played.includes('purr'), `ゴロゴロの音が鳴った: ${after.played.join(' / ')}`);
  assert.equal(scene.state().day.mistakes, 0);
});

// ---------------------------------------------------------------- ビビりの手は、仲良くなると平気になる（timidUntil）

test('昼の画面：ビビり・3日目・信頼 timidUntil 以上ですり寄りをなでると、purr のトーストと効果が出る（timid のトーストは出ない）', async () => {
  const { FEEDBACK } = await import('../src/data/texts.js');
  const { RULES, PERSONALITIES } = await import('../src/data/params.js');
  const T = PERSONALITIES.bibiri.timidUntil;
  assert.equal(typeof T, 'number', 'PERSONALITIES.bibiri.timidUntil がない');
  assert.equal(typeof FEEDBACK.purr, 'string', 'FEEDBACK.purr がない');
  // 3日目、信頼 timidUntil。届く距離まではくつろぎ（候補の先頭）、届いたらすり寄り（候補の最後）にする
  const pick = (cat) => (cat.mode === 'relax' && cat.distance <= RULES.rubMaxDistance ? 0.999 : 0);
  const { scene, toasts, during } = await personalityDayScene({ personality: 'bibiri', day: 3, trust: T, rng: pick });
  for (let i = 0; i < 1000 && scene.state().cat.mode !== 'rub'; i++) scene.update(0.05);
  assert.equal(scene.state().cat.mode, 'rub', 'すり寄りになる前に上限に達した（このテストの前提）');
  assert.ok(scene.state().day.trust >= T, `なでる前の信頼 ${scene.state().day.trust} が timidUntil ${T} 未満（このテストの前提）`);

  const petted = during(() => scene.act({ type: 'pet' }));
  assert.equal(scene.state().cat.mode, 'purr');
  assert.deepEqual(petted.toasts, [{ text: FEEDBACK.purr, ms: 1600 }]);
  assert.deepEqual(petted.effects, ['purr']);
  assert.equal(toasts.filter((t) => t.text === FEEDBACK.timid).length, 0, 'timid のトーストが出た');
  assert.equal(scene.state().day.mistakes, 0);
});

test('まばたきの説明カード（action:blink）に「Space」「PC」が入っておらず、「ツンデレ」が入っている', async () => {
  const { CARDS } = await import('../src/data/texts.js');
  const body = CARDS['action:blink'].body;
  assert.ok(!body.includes('Space'), `「Space」が入っている: ${body}`);
  assert.ok(!body.includes('PC'), `「PC」が入っている: ${body}`);
  assert.ok(body.includes('ツンデレ'), `「ツンデレ」が入っていない: ${body}`);
});

// ---------------------------------------------------------------- ビビりの手が平気になった瞬間のトースト（TIMID_GONE_TEXT）

test('昼の画面：ビビりの信頼が時間とともに timidUntil をまたいだ瞬間に、手が平気になったトーストが1回だけ出る', async () => {
  const { TIMID_GONE_TEXT, withName } = await import('../src/data/texts.js');
  const { PERSONALITIES } = await import('../src/data/params.js');
  assert.equal(TIMID_GONE_TEXT, '（{name}は、手がこわくなくなったみたい）', 'texts.js の TIMID_GONE_TEXT');
  const gone = { text: withName(TIMID_GONE_TEXT, 'たま'), ms: 3200 };
  const T = PERSONALITIES.bibiri.timidUntil;
  assert.equal(typeof T, 'number', 'PERSONALITIES.bibiri.timidUntil がない');
  // 2日目、信頼 timidUntil−1 から、何もせず待つ（落ち着いている間に少しずつ信頼が増える）
  const { scene, toasts, during } = await personalityDayScene({ personality: 'bibiri', day: 2, trust: T - 1 });
  let crossing = null;
  for (let i = 0; i < 400; i++) {
    const s = during(() => scene.update(0.05));
    if (s.trustBefore < T && s.trustAfter >= T) crossing = s;
  }
  assert.ok(crossing, `信頼が timidUntil をまたがなかった（このテストの前提）。最後の信頼 ${scene.state().day.trust}`);
  assert.deepEqual(crossing.toasts.filter((t) => t.text === gone.text), [gone], 'またいだ update で手が平気になったトーストが出ていない');
  assert.equal(toasts.filter((t) => t.text === gone.text).length, 1, '手が平気になったトーストの回数');
});

test('昼の画面：ビビりの信頼が、なでて timidUntil をまたいだ瞬間にも、手が平気になったトーストが1回だけ出る', async () => {
  const { TIMID_GONE_TEXT, withName } = await import('../src/data/texts.js');
  const { PERSONALITIES, RULES } = await import('../src/data/params.js');
  assert.equal(typeof TIMID_GONE_TEXT, 'string', 'texts.js に TIMID_GONE_TEXT がない');
  const gone = { text: withName(TIMID_GONE_TEXT, 'たま'), ms: 3200 };
  const bibiri = PERSONALITIES.bibiri;
  const T = bibiri.timidUntil;
  assert.equal(typeof T, 'number', 'PERSONALITIES.bibiri.timidUntil がない');
  // 3日目、信頼 timidUntil−5。すり寄りが届く距離まではくつろぎ（候補の先頭）、届いたらすり寄り（候補の最後）にする
  const pick = (cat) => (cat.mode === 'relax' && cat.distance <= RULES.rubMaxDistance ? 0.999 : 0);
  const { scene, toasts, during } = await personalityDayScene({ personality: 'bibiri', day: 3, trust: T - 5, rng: pick });
  for (let i = 0; i < 1000 && scene.state().cat.mode !== 'rub'; i++) scene.update(0.05);
  assert.equal(scene.state().cat.mode, 'rub', 'すり寄りになる前に上限に達した（このテストの前提）');
  const before = scene.state().day.trust;
  assert.ok(before < T, `なでる前に信頼 ${before} が timidUntil 以上になった（このテストの前提）`);
  assert.ok(before + RULES.pet.rubTrust * bibiri.likes.pet >= T, 'なでても timidUntil に届かない（このテストの前提）');
  assert.equal(toasts.filter((t) => t.text === gone.text).length, 0, 'なでる前に手が平気になったトーストが出た');

  const petted = during(() => scene.act({ type: 'pet' }));
  assert.ok(petted.trustAfter >= T, `なでたあとの信頼 ${petted.trustAfter}`);
  assert.deepEqual(petted.toasts.filter((t) => t.text === gone.text), [gone], 'なでた瞬間に手が平気になったトーストが出ていない');
  // そのあと時間が進んでも、もう出ない
  for (let i = 0; i < 100; i++) scene.update(0.05);
  assert.equal(toasts.filter((t) => t.text === gone.text).length, 1, '手が平気になったトーストの回数');
});

test('昼の画面：その日の始まりから信頼が timidUntil 以上のビビりには、手が平気になったトーストを出さない', async () => {
  const { TIMID_GONE_TEXT, withName } = await import('../src/data/texts.js');
  const { PERSONALITIES } = await import('../src/data/params.js');
  assert.equal(typeof TIMID_GONE_TEXT, 'string', 'texts.js に TIMID_GONE_TEXT がない');
  const gone = withName(TIMID_GONE_TEXT, 'たま');
  const T = PERSONALITIES.bibiri.timidUntil;
  assert.equal(typeof T, 'number', 'PERSONALITIES.bibiri.timidUntil がない');
  const { scene, toasts } = await personalityDayScene({ personality: 'bibiri', day: 2, trust: T });
  for (let i = 0; i < 400; i++) scene.update(0.05);
  assert.ok(scene.state().day.trust > T, '信頼が増えていない（このテストの前提）');
  assert.deepEqual(toasts.filter((t) => t.text === gone), []);
});

test('昼の画面：甘えん坊・ツンデレは、信頼がビビりの timidUntil をまたいでも、手が平気になったトーストを出さない', async () => {
  const { TIMID_GONE_TEXT, withName } = await import('../src/data/texts.js');
  const { PERSONALITIES } = await import('../src/data/params.js');
  assert.equal(typeof TIMID_GONE_TEXT, 'string', 'texts.js に TIMID_GONE_TEXT がない');
  const gone = withName(TIMID_GONE_TEXT, 'たま');
  const T = PERSONALITIES.bibiri.timidUntil;
  assert.equal(typeof T, 'number', 'PERSONALITIES.bibiri.timidUntil がない');
  for (const personality of ['amaenbo', 'tsundere']) {
    const { scene, toasts } = await personalityDayScene({ personality, day: 2, trust: T - 1 });
    for (let i = 0; i < 400; i++) scene.update(0.05);
    assert.ok(scene.state().day.trust >= T, `${personality}: 信頼が timidUntil をまたがなかった（このテストの前提）`);
    assert.deepEqual(toasts.filter((t) => t.text === gone), [], personality);
  }
});

test('チラッの説明カード（sign:look）に「ツンデレ」が入っている', async () => {
  const { CARDS } = await import('../src/data/texts.js');
  const body = CARDS['sign:look'].body;
  assert.ok(body.includes('ツンデレ'), `「ツンデレ」が入っていない: ${body}`);
});

// ---------------------------------------------------------------- 一度デレた・手が平気になったら、ミスで信頼が境目を下回っても戻らない（dere・handsOk）

test('昼の画面：ツンデレがデレたあとにミスして信頼が shyUntil を下回っても、view().shy は false のまま、まばたきは blinkBack、もう一度 shyUntil を越えてもデレたトーストは増えない', async () => {
  const { DERE_TEXT, FEEDBACK, withName } = await import('../src/data/texts.js');
  const { PERSONALITIES, RULES, MAX_VALUE } = await import('../src/data/params.js');
  assert.equal(typeof DERE_TEXT, 'string', 'texts.js に DERE_TEXT がない');
  const dere = withName(DERE_TEXT, 'たま');
  const tsundere = PERSONALITIES.tsundere;
  const S = tsundere.shyUntil;
  assert.ok(S > 0, `ツンデレの shyUntil ${S}`);
  const M = RULES.mistakeTrust;
  // 2日目、信頼 shyUntil−1 から、何もせず待ってデレさせる
  const { scene, toasts, during, waitLook } = await personalityDayScene({ personality: 'tsundere', day: 2, trust: S - 1 });
  for (let i = 0; i < 400 && scene.state().day.trust < S; i++) scene.update(0.05);
  assert.ok(scene.state().day.trust >= S, `信頼が shyUntil をまたがなかった（このテストの前提）。信頼 ${scene.state().day.trust}`);
  assert.equal(toasts.filter((t) => t.text === dere).length, 1, 'デレたトーストが出ていない（このテストの前提）');
  assert.equal(scene.view().shy, false, 'デレた直後');

  // こちらを見ているときになでる（ミス）。信頼が shyUntil を下回るまで繰り返す
  for (let n = 0; n < 5 && scene.state().day.trust >= S; n++) {
    waitLook();
    const m = during(() => scene.act({ type: 'pet' }));
    assert.equal(m.trustAfter, Math.max(0, m.trustBefore - M), `${n + 1}回目のミスで信頼が mistakeTrust 減っていない（このテストの前提）`);
  }
  assert.ok(scene.state().day.trust < S, `ミスしても信頼 ${scene.state().day.trust} が shyUntil 未満にならない（このテストの前提）`);
  assert.equal(scene.view().shy, false, 'ミスで信頼が shyUntil を下回ったあと');

  // 信頼 shyUntil 未満のまま、まばたき：ツンには戻らず blinkBack
  waitLook();
  assert.ok(scene.state().day.trust < S, `まばたきの前に信頼 ${scene.state().day.trust} が shyUntil 以上になった（このテストの前提）`);
  const d = scene.state().cat.distance;
  const { from, min } = RULES.blink.far;
  const reach = d <= from ? 1 : Math.max(min, 1 - ((1 - min) * (d - from)) / (MAX_VALUE - from));
  const b = during(() => scene.act({ type: 'blink', holdMs: 1000 }));
  assert.deepEqual(b.toasts.filter((t) => t.text === FEEDBACK.blinkBack || t.text === FEEDBACK.blinkAway), [{ text: FEEDBACK.blinkBack, ms: 1600 }], 'まばたきのトースト');
  assert.deepEqual(b.effects, ['blinkBack'], 'まばたきの効果');
  assert.ok(Math.abs(b.trustAfter - Math.min(MAX_VALUE, b.trustBefore + RULES.blink.trust * tsundere.likes.blink * reach)) < 1e-9, `まばたき後の信頼 ${b.trustAfter}（前 ${b.trustBefore}・距離 ${d}）`);
  assert.equal(scene.view().shy, false, 'まばたきのあと');

  // もう一度 shyUntil 未満にしてから、待って shyUntil を越えさせる
  for (let n = 0; n < 5 && scene.state().day.trust >= S; n++) {
    waitLook();
    scene.act({ type: 'pet' });
  }
  assert.ok(scene.state().day.trust < S, `信頼 ${scene.state().day.trust} が shyUntil 未満にならない（このテストの前提）`);
  let recrossed = false;
  for (let i = 0; i < 800 && !recrossed; i++) {
    const s = during(() => scene.update(0.05));
    if (s.trustBefore < S && s.trustAfter >= S) recrossed = true;
    assert.equal(scene.view().shy, false, `もう一度越えるまでの間・信頼 ${scene.state().day.trust}`);
  }
  assert.ok(recrossed, `もう一度 shyUntil を越えなかった（このテストの前提）。信頼 ${scene.state().day.trust}`);
  for (let i = 0; i < 100; i++) scene.update(0.05);
  assert.equal(toasts.filter((t) => t.text === dere).length, 1, 'デレたトーストの回数');
});

test('昼の画面：ビビりの手が平気になったあとにミスして信頼が timidUntil を下回っても、すり寄りをなでると purr（timid のトーストは出ない）', async () => {
  const { TIMID_GONE_TEXT, FEEDBACK, withName } = await import('../src/data/texts.js');
  const { PERSONALITIES, RULES } = await import('../src/data/params.js');
  assert.equal(typeof TIMID_GONE_TEXT, 'string', 'texts.js に TIMID_GONE_TEXT がない');
  const gone = withName(TIMID_GONE_TEXT, 'たま');
  const bibiri = PERSONALITIES.bibiri;
  const T = bibiri.timidUntil;
  assert.equal(typeof T, 'number', 'PERSONALITIES.bibiri.timidUntil がない');
  const M = RULES.mistakeTrust;
  // 3日目、信頼 timidUntil−5。すり寄りが届く距離まではくつろぎ（候補の先頭）、届いたらすり寄り（候補の最後）にする
  const pick = (cat) => (cat.mode === 'relax' && cat.distance <= RULES.rubMaxDistance ? 0.999 : 0);
  const { scene, toasts, during } = await personalityDayScene({ personality: 'bibiri', day: 3, trust: T - 5, rng: pick });
  const waitMode = (mode) => {
    for (let i = 0; i < 2000 && scene.state().cat.mode !== mode; i++) scene.update(0.05);
    assert.equal(scene.state().cat.mode, mode, `${mode} になる前に上限に達した（このテストの前提）`);
  };
  // すり寄りをなでて、手が平気になる
  waitMode('rub');
  scene.act({ type: 'pet' });
  assert.ok(scene.state().day.trust >= T, `なでても信頼 ${scene.state().day.trust} が timidUntil に届かない（このテストの前提）`);
  assert.equal(toasts.filter((t) => t.text === gone).length, 1, '手が平気になったトーストが出ていない（このテストの前提）');
  // 平気になる前になでた1回は、仕様どおりビクビクする（なでる前の信頼で決まる）。ここから増えないことを確かめる
  const timidBefore = toasts.filter((t) => t.text === FEEDBACK.timid).length;

  // くつろぎのときになでる（ミス）。信頼が timidUntil−mistakeTrust を下回るまで繰り返す（すり寄りを待つ間に timidUntil に戻らないように）
  for (let n = 0; n < 5 && scene.state().day.trust >= T - M; n++) {
    waitMode('relax');
    const m = during(() => scene.act({ type: 'pet' }));
    assert.equal(m.trustAfter, Math.max(0, m.trustBefore - M), `${n + 1}回目のミスで信頼が mistakeTrust 減っていない（このテストの前提）`);
  }
  assert.ok(scene.state().day.trust < T - M, `ミスしても信頼 ${scene.state().day.trust} が下がらない（このテストの前提）`);

  // 信頼 timidUntil 未満のまま、すり寄りをなでる：ビクビクには戻らず purr・ふつうの効き
  waitMode('rub');
  assert.ok(scene.state().day.trust < T, `なでる前に信頼 ${scene.state().day.trust} が timidUntil 以上になった（このテストの前提）`);
  const petted = during(() => scene.act({ type: 'pet' }));
  assert.equal(scene.state().cat.mode, 'purr');
  assert.deepEqual(petted.toasts.filter((t) => t.text === FEEDBACK.purr || t.text === FEEDBACK.timid), [{ text: FEEDBACK.purr, ms: 1600 }], 'なでたときのトースト');
  assert.deepEqual(petted.effects, ['purr'], 'なでたときの効果');
  assert.ok(Math.abs(petted.trustAfter - (petted.trustBefore + RULES.pet.rubTrust)) < 1e-9, `なでたあとの信頼 ${petted.trustAfter}（前 ${petted.trustBefore}）`);
  assert.equal(toasts.filter((t) => t.text === FEEDBACK.timid).length, timidBefore, '平気になったあとに timid のトーストが出た');
});

// 昼の画面を作り、onEnd に渡された結果を記録する（personalityDayScene と同じ作り。fixedRng(0.5)）
async function endRecordingDayScene({ personality, day, trust }) {
  const { createDayScene } = await import('../src/scenes/dayScene.js');
  const { createGame } = await import('../src/game/progression.js');
  const { CARDS } = await import('../src/data/texts.js');
  const { fixedRng } = await import('./helpers.js');
  const noop = () => {};
  const toasts = [];
  const overlay = { busy: false, splash: noop, card: noop, bubble: noop, toast: (text, ms) => toasts.push({ text, ms }), clear: noop };
  const hud = { show: noop, update: noop };
  const renderer = { addEffect: noop, hitTestCat: () => true };
  const input = { setBlinkEnabled: noop, holdMs: () => 0 };
  const sound = { purr: noop, meow: noop, bump: noop };
  const session = {
    game: { ...createGame({ personality, seed: 1 }), day, trust, catName: 'たま', seenCards: Object.keys(CARDS) },
    misses: {},
  };
  const ends = [];
  const scene = createDayScene({ session, overlay, hud, renderer, input, sound, rng: fixedRng(0.5), onEnd: (r) => ends.push(r) });
  return { scene, toasts, ends };
}

test('昼の画面：昼の終わり（skipDay）に onEnd に渡す結果に dere・handsOk が入っていて、その日にデレた・手が平気になったら true', async () => {
  const { PERSONALITIES } = await import('../src/data/params.js');
  const S = PERSONALITIES.tsundere.shyUntil;
  const T = PERSONALITIES.bibiri.timidUntil;
  assert.ok(S > 0, `ツンデレの shyUntil ${S}`);
  assert.equal(typeof T, 'number', 'PERSONALITIES.bibiri.timidUntil がない');

  // ツンデレ・信頼 0：デレないまま終わる
  {
    const { scene, ends } = await endRecordingDayScene({ personality: 'tsundere', day: 2, trust: 0 });
    scene.skipDay();
    assert.equal(ends.length, 1, 'ツンデレ・信頼 0：onEnd が1回呼ばれていない');
    assert.equal(ends[0].dere, false, 'ツンデレ・信頼 0：dere');
    assert.equal(ends[0].handsOk, true, 'ツンデレ・信頼 0：handsOk（手はこわくない性格）');
  }
  // ツンデレ・信頼 shyUntil−1：待ってデレてから終わる
  {
    const { scene, ends } = await endRecordingDayScene({ personality: 'tsundere', day: 2, trust: S - 1 });
    for (let i = 0; i < 400 && scene.state().day.trust < S; i++) scene.update(0.05);
    assert.ok(scene.state().day.trust >= S, `ツンデレ：信頼が shyUntil をまたがなかった（このテストの前提）。信頼 ${scene.state().day.trust}`);
    scene.skipDay();
    assert.equal(ends.length, 1, 'ツンデレ・デレた：onEnd が1回呼ばれていない');
    assert.equal(ends[0].dere, true, 'ツンデレ・デレた：dere');
    assert.equal(ends[0].handsOk, true, 'ツンデレ・デレた：handsOk');
  }
  // ビビり・信頼 0：手が平気にならないまま終わる
  {
    const { scene, ends } = await endRecordingDayScene({ personality: 'bibiri', day: 2, trust: 0 });
    scene.skipDay();
    assert.equal(ends.length, 1, 'ビビり・信頼 0：onEnd が1回呼ばれていない');
    assert.equal(ends[0].handsOk, false, 'ビビり・信頼 0：handsOk');
    assert.equal(ends[0].dere, true, 'ビビり・信頼 0：dere（ツンのない性格）');
  }
  // ビビり・信頼 timidUntil−1：待って手が平気になってから終わる
  {
    const { scene, ends } = await endRecordingDayScene({ personality: 'bibiri', day: 2, trust: T - 1 });
    for (let i = 0; i < 400 && scene.state().day.trust < T; i++) scene.update(0.05);
    assert.ok(scene.state().day.trust >= T, `ビビり：信頼が timidUntil をまたがなかった（このテストの前提）。信頼 ${scene.state().day.trust}`);
    scene.skipDay();
    assert.equal(ends.length, 1, 'ビビり・平気になった：onEnd が1回呼ばれていない');
    assert.equal(ends[0].handsOk, true, 'ビビり・平気になった：handsOk');
    assert.equal(ends[0].dere, true, 'ビビり・平気になった：dere');
  }
});

// ---------------------------------------------------------------- 昼の途中で性格が切り替わったら（デバッグパネル）、dere・handsOk を新しい性格と今の信頼で計算し直す

test('昼の画面：昼の途中で session.game.personality を切り替えたら、dere・handsOk を新しい性格と今の信頼で計算し直す（ツンデレなら view().shy が true・デレたトーストなし、ビビりなら handsOk が false）', async () => {
  const { DERE_TEXT, withName } = await import('../src/data/texts.js');
  const { PERSONALITIES } = await import('../src/data/params.js');
  assert.equal(typeof DERE_TEXT, 'string', 'texts.js に DERE_TEXT がない');
  const dere = withName(DERE_TEXT, 'たま');
  const S = PERSONALITIES.tsundere.shyUntil;
  const T = PERSONALITIES.bibiri.timidUntil;
  assert.ok(S - 10 >= 0, `ツンデレの shyUntil ${S}`);
  assert.equal(typeof T, 'number', 'PERSONALITIES.bibiri.timidUntil がない');
  assert.ok(T - 10 >= 0, `ビビりの timidUntil ${T}`);

  // 甘えん坊・2日目・信頼 shyUntil−10 で始め、数回 update してからツンデレに切り替える
  {
    const { scene, session, toasts } = await personalityDayScene({ personality: 'amaenbo', day: 2, trust: S - 10 });
    for (let i = 0; i < 5; i++) scene.update(0.05);
    assert.equal(scene.view().shy, false, '甘えん坊のうちはツンがない（このテストの前提）');
    session.game.personality = 'tsundere';
    scene.update(0.05);
    assert.ok(scene.state().day.trust < S, `切り替えたあとの信頼 ${scene.state().day.trust} が shyUntil 以上（このテストの前提）`);
    assert.equal(scene.view().shy, true, 'ツンデレに切り替えたあとの view().shy');
    assert.deepEqual(toasts.filter((t) => t.text === dere), [], '切り替えでデレたトーストが出た');
  }
  // 甘えん坊・3日目・信頼 timidUntil−10 で始め、数回 update してからビビりに切り替える
  {
    const { scene, session } = await personalityDayScene({ personality: 'amaenbo', day: 3, trust: T - 10 });
    for (let i = 0; i < 5; i++) scene.update(0.05);
    assert.equal(scene.state().day.handsOk, true, '甘えん坊のうちは手が平気（このテストの前提）');
    session.game.personality = 'bibiri';
    scene.update(0.05);
    assert.ok(scene.state().day.trust < T, `切り替えたあとの信頼 ${scene.state().day.trust} が timidUntil 以上（このテストの前提）`);
    assert.equal(scene.state().day.handsOk, false, 'ビビりに切り替えたあとの state().day.handsOk');
  }
});

// 昼の画面を作り、onEnd に渡された結果を記録する。overlay・session も返し、overlay.busy を外から切り替えられる（endRecordingDayScene と同じ作り。fixedRng(0.5)）
async function busyEndRecordingDayScene({ personality, day, trust }) {
  const { createDayScene } = await import('../src/scenes/dayScene.js');
  const { createGame } = await import('../src/game/progression.js');
  const { CARDS } = await import('../src/data/texts.js');
  const { fixedRng } = await import('./helpers.js');
  const noop = () => {};
  const toasts = [];
  const overlay = { busy: false, splash: noop, card: noop, bubble: noop, toast: (text, ms) => toasts.push({ text, ms }), clear: noop };
  const hud = { show: noop, update: noop };
  const renderer = { addEffect: noop, hitTestCat: () => true };
  const input = { setBlinkEnabled: noop, holdMs: () => 0 };
  const sound = { purr: noop, meow: noop, bump: noop };
  const session = {
    game: { ...createGame({ personality, seed: 1 }), day, trust, catName: 'たま', seenCards: Object.keys(CARDS) },
    misses: {},
  };
  const ends = [];
  const scene = createDayScene({ session, overlay, hud, renderer, input, sound, rng: fixedRng(0.5), onEnd: (r) => ends.push(r) });
  return { scene, session, overlay, toasts, ends };
}

test('昼の画面：説明カードや日付の表示中（overlay.busy）に session.game.personality を切り替えてすぐ skipDay しても、onEnd の handsOk は新しい性格と今の信頼で決め直す（甘えん坊からビビりなら false）', async () => {
  const { PERSONALITIES } = await import('../src/data/params.js');
  const T = PERSONALITIES.bibiri.timidUntil;
  assert.equal(typeof T, 'number', 'PERSONALITIES.bibiri.timidUntil がない');
  assert.ok(T - 10 >= 0, `ビビりの timidUntil ${T}`);

  // 甘えん坊・3日目・信頼 timidUntil−10 で始め、busy の間にビビりに切り替え、update を1回呼んでから skipDay
  {
    const { scene, session, overlay, ends } = await busyEndRecordingDayScene({ personality: 'amaenbo', day: 3, trust: T - 10 });
    assert.equal(scene.state().day.handsOk, true, '甘えん坊のうちは手が平気（このテストの前提）');
    overlay.busy = true;
    session.game.personality = 'bibiri';
    scene.update(0.05);
    assert.ok(scene.state().day.trust < T, `切り替えたあとの信頼 ${scene.state().day.trust} が timidUntil 以上（このテストの前提）`);
    scene.skipDay();
    assert.equal(ends.length, 1, 'update あり：onEnd が1回呼ばれていない');
    assert.equal(ends[0].handsOk, false, 'busy 中にビビりへ切り替え・update 1回・skipDay：onEnd の handsOk');
  }
  // 同じ条件で、update を呼ばずに切り替えてすぐ skipDay
  {
    const { scene, session, overlay, ends } = await busyEndRecordingDayScene({ personality: 'amaenbo', day: 3, trust: T - 10 });
    assert.equal(scene.state().day.handsOk, true, '甘えん坊のうちは手が平気（このテストの前提）');
    overlay.busy = true;
    session.game.personality = 'bibiri';
    assert.ok(scene.state().day.trust < T, `切り替えたあとの信頼 ${scene.state().day.trust} が timidUntil 以上（このテストの前提）`);
    scene.skipDay();
    assert.equal(ends.length, 1, 'update なし：onEnd が1回呼ばれていない');
    assert.equal(ends[0].handsOk, false, 'busy 中にビビりへ切り替え・すぐ skipDay：onEnd の handsOk');
  }
});
