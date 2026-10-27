import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COATS } from '../src/render/renderer.js';
import { COAT_PERSONALITY } from '../src/data/params.js';

// records.js・recordStore.js はまだないので、テストの中で読み込む
const loadRecordsModule = () => import('../src/game/records.js');
const loadStoreModule = () => import('../src/ui/recordStore.js');

const COAT_KEYS = Object.keys(COATS);
const ENDING_IDS = ['fate', 'patient', 'persistent', 'visitor'];

// エンディング1回分。毛色に合った性格にする
function ending(overrides = {}) {
  const coat = overrides.coat ?? 'chatora';
  return {
    name: 'たま',
    coat,
    personality: COAT_PERSONALITY[coat],
    endingId: 'patient',
    day: 5,
    mistakes: 1,
    date: '2026-10-27',
    ...overrides,
  };
}
const visitor = (overrides = {}) => ending({ endingId: 'visitor', day: 7, ...overrides });

// ending を順に足していき、最後の { records, newTitles } と、毎回の newTitles の一覧（all）を返す
function addAll(R, endings, records = R.emptyRecords()) {
  const all = [];
  let last = { records, newTitles: [] };
  for (const e of endings) {
    last = R.addEnding(last.records, e);
    all.push(last.newTitles);
  }
  return { ...last, all };
}
const sorted = (list) => [...list].sort();

// globalThis の値をテストの間だけ差し替え（REMOVE なら取り除き）、終わったら元に戻す
const REMOVE = Symbol('remove');
function withGlobals(values, fn) {
  const saved = Object.keys(values).map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
  for (const [k, v] of Object.entries(values)) {
    if (v === REMOVE) delete globalThis[k];
    else Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true, enumerable: true });
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

function fakeStorage() {
  const store = new Map();
  return {
    store,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
}
function brokenStorage() {
  const fail = () => { throw new Error('storage is not available'); };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

// ---------------------------------------------------------------- 1. 空の記録

test('空の記録は、思い出・図鑑・称号がなく、出会った回数 0', async () => {
  const R = await loadRecordsModule();
  assert.deepEqual(R.emptyRecords(), { v: 1, memories: [], dex: {}, titles: [], metCount: 0 });
});

// ---------------------------------------------------------------- 2. 思い出

test('エンディングを迎えると、思い出の先頭にその猫が入る（新しい順）', async () => {
  const R = await loadRecordsModule();
  const e1 = ending({ name: 'みかん', date: '2026-10-01' });
  const e2 = visitor({ name: 'くろまめ', coat: 'kuro', date: '2026-10-02' });
  const r1 = R.addEnding(R.emptyRecords(), e1).records;
  assert.deepEqual(r1.memories, [e1]);
  const r2 = R.addEnding(r1, e2).records;
  assert.deepEqual(r2.memories, [e2, e1]);
  assert.equal(r2.metCount, 2);
});

test('思い出は50件まで。51件目を足すと、いちばん古いものが消え、出会った回数は51になる', async () => {
  const R = await loadRecordsModule();
  assert.equal(R.MEMORY_LIMIT, 50);
  const endings = Array.from({ length: 51 }, (_, i) => visitor({ name: `ねこ${i + 1}` }));
  const { records } = addAll(R, endings);
  assert.equal(records.memories.length, 50);
  assert.equal(records.memories[0].name, 'ねこ51');
  assert.equal(records.memories[49].name, 'ねこ2');
  assert.ok(!records.memories.some((m) => m.name === 'ねこ1'), 'いちばん古い思い出が残っている');
  assert.equal(records.metCount, 51);
});

test('エンディングを足しても、渡した記録とエンディングは書き換えない', async () => {
  const R = await loadRecordsModule();
  const base = addAll(R, [ending({ mistakes: 0 }), visitor({ coat: 'kuro' })]).records;
  const baseCopy = structuredClone(base);
  const e = ending({ coat: 'shiro', endingId: 'fate', day: 3 });
  const eCopy = structuredClone(e);
  const { records } = R.addEnding(base, e);
  assert.deepEqual(base, baseCopy);
  assert.deepEqual(e, eCopy);
  assert.equal(records.memories.length, 3);
  assert.equal(base.memories.length, 2);
});

// ---------------------------------------------------------------- 3. 図鑑

test('通い猫エンドでも、その毛色は図鑑に載る（スタンプは visitor、いちばん早く和解した日はなし）', async () => {
  const R = await loadRecordsModule();
  const { records } = R.addEnding(R.emptyRecords(), visitor({ coat: 'kijitora' }));
  assert.deepEqual(records.dex, { kijitora: { stamps: ['visitor'], bestDay: null } });
});

test('和解すると、いちばん早く和解した日が図鑑に入り、早い日で上書き・遅い日では変わらず、スタンプは重複しない', async () => {
  const R = await loadRecordsModule();
  // [エンディング, そのあとの bestDay, そのあとの stamps（並べ替えたもの）]
  const steps = [
    [visitor(), null, ['visitor']],
    [ending({ endingId: 'patient', day: 5 }), 5, ['patient', 'visitor']],
    [ending({ endingId: 'fate', day: 3 }), 3, ['fate', 'patient', 'visitor']],
    [ending({ endingId: 'persistent', day: 6 }), 3, ['fate', 'patient', 'persistent', 'visitor']],
    [ending({ endingId: 'patient', day: 4 }), 3, ['fate', 'patient', 'persistent', 'visitor']],
    [visitor(), 3, ['fate', 'patient', 'persistent', 'visitor']],
  ];
  let records = R.emptyRecords();
  for (const [e, bestDay, stamps] of steps) {
    records = R.addEnding(records, e).records;
    const at = `${e.endingId} ${e.day}日目のあと`;
    assert.deepEqual(Object.keys(records.dex), ['chatora'], at);
    assert.equal(records.dex.chatora.bestDay, bestDay, at);
    assert.deepEqual(sorted(records.dex.chatora.stamps), stamps, at);
  }
});

// ---------------------------------------------------------------- 4. 称号

test('初めての和解・運命の膝・ミスなし・性格の称号は、条件を満たしたエンディングで手に入る', async () => {
  const R = await loadRecordsModule();
  const first = R.addEnding(R.emptyRecords(), ending({ coat: 'chatora', endingId: 'fate', day: 3, mistakes: 0 }));
  assert.deepEqual(sorted(first.newTitles), ['amaenbo', 'fate', 'first', 'noMistake']);
  assert.deepEqual(sorted(first.records.titles), ['amaenbo', 'fate', 'first', 'noMistake']);
  for (const [coat, title] of [['shiro', 'tsundere'], ['kijitora', 'bibiri']]) {
    const r = R.addEnding(R.emptyRecords(), ending({ coat, mistakes: 1 }));
    assert.deepEqual(sorted(r.newTitles), sorted(['first', title]), coat);
  }
});

test('条件を満たさないと称号は手に入らない（通い猫では和解の称号なし、ミス1回では noMistake なし、patient では fate なし）', async () => {
  const R = await loadRecordsModule();
  // 通い猫：ミス0・甘えん坊でも、手に入るのは visitor だけ
  const v = R.addEnding(R.emptyRecords(), visitor({ coat: 'chatora', mistakes: 0 }));
  assert.deepEqual(v.newTitles, ['visitor']);
  assert.deepEqual(v.records.titles, ['visitor']);
  // ミス1回の和解（patient）：noMistake・fate・visitor はない
  const m = R.addEnding(R.emptyRecords(), ending({ coat: 'chatora', endingId: 'patient', mistakes: 1 }));
  assert.deepEqual(sorted(m.newTitles), ['amaenbo', 'first']);
});

test('同じ条件をもう一度満たしても、新しく手に入る称号はなく、称号は手に入れた順に重複なく並ぶ', async () => {
  const R = await loadRecordsModule();
  const e = ending({ endingId: 'fate', day: 3, mistakes: 0 });
  const { records, all } = addAll(R, [visitor(), e, e, visitor()]);
  assert.deepEqual(all[0], ['visitor']);
  assert.deepEqual(sorted(all[1]), ['amaenbo', 'fate', 'first', 'noMistake']);
  assert.deepEqual(all[2], []);
  assert.deepEqual(all[3], []);
  assert.deepEqual(records.titles, [...all[0], ...all[1]]);
});

test('全毛色の称号は、6種すべてと和解したときにだけ手に入る（通い猫で会っただけでは数えない）', async () => {
  const R = await loadRecordsModule();
  assert.equal(COAT_KEYS.length, 6);
  const [lastCoat, ...others] = COAT_KEYS;
  const five = addAll(R, [...others.map((coat) => ending({ coat })), visitor({ coat: lastCoat })]);
  assert.ok(!five.records.titles.includes('allCoats'), '5種と和解・1種は通い猫だけなのに手に入った');
  const six = R.addEnding(five.records, ending({ coat: lastCoat }));
  assert.ok(six.newTitles.includes('allCoats'), `6種目と和解したときの newTitles ${six.newTitles}`);
});

test('スタンプの称号は、6種×4エンディング＝24個そろったときにだけ手に入る', async () => {
  const R = await loadRecordsModule();
  const all = COAT_KEYS.flatMap((coat) => ENDING_IDS.map((endingId) => ending({ coat, endingId, day: endingId === 'visitor' ? 7 : 5 })));
  assert.equal(all.length, 24);
  const before = addAll(R, all.slice(0, 23));
  assert.ok(!before.records.titles.includes('allStamps'), '23個で手に入った');
  const after = R.addEnding(before.records, all[23]);
  assert.ok(after.newTitles.includes('allStamps'), `24個目の newTitles ${after.newTitles}`);
});

test('10回目のエンディングで、10匹の称号が手に入る', async () => {
  const R = await loadRecordsModule();
  const nine = addAll(R, Array.from({ length: 9 }, () => visitor()));
  assert.equal(nine.records.metCount, 9);
  assert.ok(!nine.records.titles.includes('tenCats'), '9回で手に入った');
  const ten = R.addEnding(nine.records, visitor());
  assert.deepEqual(ten.newTitles, ['tenCats']);
});

test('称号の一覧のすべてに、表示名と条件の説明がある', async () => {
  const R = await loadRecordsModule();
  const { TITLES } = await import('../src/data/texts.js');
  assert.deepEqual(R.TITLE_IDS, ['first', 'fate', 'noMistake', 'amaenbo', 'tsundere', 'bibiri', 'visitor', 'allCoats', 'allStamps', 'tenCats']);
  assert.ok(TITLES, 'texts.js に TITLES がない');
  for (const id of R.TITLE_IDS) {
    assert.ok(TITLES[id], `TITLES.${id} がない`);
    assert.equal(typeof TITLES[id].name, 'string', `${id}.name`);
    assert.ok(TITLES[id].name.length > 0, `${id}.name が空`);
    assert.equal(typeof TITLES[id].how, 'string', `${id}.how`);
    assert.ok(TITLES[id].how.length > 0, `${id}.how が空`);
  }
});

// ---------------------------------------------------------------- 5. 保存した文字列の読み込み

test('壊れた・形の違う保存データは、空の記録として読む', async () => {
  const R = await loadRecordsModule();
  const ok = { v: 1, memories: [], dex: {}, titles: [], metCount: 0 };
  const bad = [
    null,
    '',
    'abc',
    'null',
    '123',
    '[]',
    '{"v":2}',
    JSON.stringify({ ...ok, v: 2 }),
    JSON.stringify({ v: 1 }),
    JSON.stringify({ ...ok, memories: {} }),
    JSON.stringify({ ...ok, memories: 'x' }),
    JSON.stringify({ ...ok, titles: 'first' }),
    JSON.stringify({ ...ok, dex: null }),
    JSON.stringify({ ...ok, metCount: '3' }),
  ];
  for (const text of bad) assert.deepEqual(R.parseRecords(text), R.emptyRecords(), `${text}`);
});

test('保存した記録は、JSON にして読み直すと同じものに戻る', async () => {
  const R = await loadRecordsModule();
  const { records } = addAll(R, [
    visitor({ coat: 'kuro', name: 'よる' }),
    ending({ coat: 'shiro', endingId: 'fate', day: 3, mistakes: 0, name: 'ゆき' }),
    ending({ coat: 'chatora', endingId: 'persistent', day: 6, mistakes: 4, name: 'みかん' }),
  ]);
  assert.deepEqual(R.parseRecords(JSON.stringify(records)), records);
  assert.deepEqual(R.parseRecords(JSON.stringify(R.emptyRecords())), R.emptyRecords());
});

test('思い出が50件を超えて保存されていたら、新しいほうの50件に切って読む', async () => {
  const R = await loadRecordsModule();
  // 先頭ほど新しい
  const memories = Array.from({ length: 60 }, (_, i) => visitor({ name: `ねこ${60 - i}` }));
  const saved = { v: 1, memories, dex: { chatora: { stamps: ['visitor'], bestDay: null } }, titles: ['visitor', 'tenCats'], metCount: 60 };
  const r = R.parseRecords(JSON.stringify(saved));
  assert.equal(r.memories.length, 50);
  assert.deepEqual(r.memories, memories.slice(0, 50));
  assert.equal(r.metCount, 60);
  assert.deepEqual(r.titles, ['visitor', 'tenCats']);
  assert.deepEqual(r.dex, saved.dex);
});

// ---------------------------------------------------------------- 6. 端末への保存

test('記録は neko-wakai:records に保存され、読み込むと同じものに戻る', async () => {
  const R = await loadRecordsModule();
  const S = await loadStoreModule();
  assert.equal(S.RECORDS_KEY, 'neko-wakai:records');
  const { records } = addAll(R, [visitor({ coat: 'kuro' }), ending({ mistakes: 0 })]);
  const storage = fakeStorage();
  withGlobals({ localStorage: storage }, () => {
    assert.deepEqual(S.loadRecords(), R.emptyRecords(), 'まだ保存していないとき');
    S.saveRecords(records);
    assert.deepEqual([...storage.store.keys()], ['neko-wakai:records']);
    assert.deepEqual(JSON.parse(storage.store.get('neko-wakai:records')), records);
    assert.deepEqual(S.loadRecords(), records);
  });
});

test('端末の保存が例外を投げても、読み込みは空の記録、保存と消去は例外を出さない', async () => {
  const R = await loadRecordsModule();
  const S = await loadStoreModule();
  const { records } = R.addEnding(R.emptyRecords(), ending());
  withGlobals({ localStorage: brokenStorage() }, () => {
    assert.deepEqual(S.loadRecords(), R.emptyRecords());
    assert.doesNotThrow(() => S.saveRecords(records));
    assert.doesNotThrow(() => S.clearRecords());
  });
});

test('localStorage そのものがなくても、読み込みは空の記録、保存と消去は例外を出さない', async () => {
  const R = await loadRecordsModule();
  const S = await loadStoreModule();
  const { records } = R.addEnding(R.emptyRecords(), ending());
  withGlobals({ localStorage: REMOVE }, () => {
    assert.equal(typeof globalThis.localStorage, 'undefined');
    assert.deepEqual(S.loadRecords(), R.emptyRecords());
    assert.doesNotThrow(() => S.saveRecords(records));
    assert.doesNotThrow(() => S.clearRecords());
  });
});

// ---------------------------------------------------------------- 中身の壊れた保存データ（要素ごとに確かめる）

// 外側の形は正しい保存データ。上書きしたいところだけ渡す
const savedText = (overrides) => JSON.stringify({ v: 1, memories: [], dex: {}, titles: [], metCount: 3, ...overrides });

test('思い出の中の壊れた要素だけを捨て、正しい思い出は同じ順で残す', async () => {
  const R = await loadRecordsModule();
  const m1 = ending({ name: 'みかん', date: '2026-10-03' });
  const m2 = visitor({ name: 'よる', coat: 'kuro', date: '2026-10-02' });
  const m3 = ending({ name: 'ゆき', coat: 'shiro', endingId: 'fate', day: 3, mistakes: 0, date: '2026-10-01' });
  const memories = [
    m1,
    null,
    42,
    { ...m1, name: 5 },
    { ...m1, coat: 'mike' },
    m2,
    { ...m1, endingId: 'happy' },
    { ...m1, day: '3' },
    m3,
  ];
  const titles = ['first', 'visitor'];
  const dex = { chatora: { stamps: ['patient'], bestDay: 5 } };
  const r = R.parseRecords(savedText({ memories, dex, titles }));
  assert.deepEqual(r.memories, [m1, m2, m3]);
  // ほかの記録は守る
  assert.equal(r.v, 1);
  assert.equal(r.metCount, 3);
  assert.deepEqual(r.titles, titles);
  assert.deepEqual(r.dex, dex);
});

test('図鑑の中の壊れた毛色だけを捨て、正しい毛色は残す（スタンプの知らない id と重複は除く）', async () => {
  const R = await loadRecordsModule();
  const dex = {
    chatora: {},
    kijitora: null,
    sabatora: { stamps: 'visitor', bestDay: null },
    cream: { stamps: ['visitor'], bestDay: '3' },
    mike: { stamps: ['visitor'], bestDay: null },
    shiro: { stamps: ['visitor'], bestDay: null },
    kuro: { stamps: ['fate', 'happy', 'fate', 'visitor', 3, null], bestDay: 3 },
  };
  const r = R.parseRecords(savedText({ dex }));
  assert.deepEqual(sorted(Object.keys(r.dex)), ['kuro', 'shiro']);
  assert.deepEqual(r.dex.shiro, { stamps: ['visitor'], bestDay: null });
  assert.equal(r.dex.kuro.bestDay, 3);
  assert.deepEqual(sorted(r.dex.kuro.stamps), ['fate', 'visitor']);
  assert.equal(r.metCount, 3, 'ほかの記録は守る');
});

test('称号の知らない id・文字列でないもの・重複は除き、手に入れた順は保つ', async () => {
  const R = await loadRecordsModule();
  const titles = ['visitor', 'unknown', 3, null, 'first', 'visitor', { id: 'fate' }, 'tenCats', 'first'];
  const r = R.parseRecords(savedText({ titles }));
  assert.deepEqual(r.titles, ['visitor', 'first', 'tenCats']);
  assert.equal(r.metCount, 3, 'ほかの記録は守る');
});

test('中身の壊れた保存データを読んでからエンディングを足しても、例外を出さずに正しく記録する', async () => {
  const R = await loadRecordsModule();
  const loaded = R.parseRecords(savedText({ memories: [null], dex: { kuro: {} } }));
  const e = ending({ coat: 'kuro', endingId: 'fate', day: 3, mistakes: 1 });
  let result;
  assert.doesNotThrow(() => { result = R.addEnding(loaded, e); });
  assert.deepEqual(result.records.dex.kuro, { stamps: ['fate'], bestDay: 3 });
  assert.deepEqual(result.records.memories, [e]);
  assert.equal(result.records.metCount, 4);
});
