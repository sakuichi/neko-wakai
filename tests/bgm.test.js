import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BGM_SONGS } from '../src/data/bgmSongs.js';
import { noteToMidi, parseChord, compileSong, STEPS_PER_BAR } from '../src/ui/bgmScore.js';
import { bundle, PREVIEW } from '../tools/build.js';
import { nextTrack, BGM_OFF } from '../src/ui/music.js';

test('音名を MIDI の番号に変換できる', () => {
  assert.equal(noteToMidi('A4'), 69);
  assert.equal(noteToMidi('C4'), 60);
  assert.equal(noteToMidi('Bb3'), 58);
  assert.equal(noteToMidi('F#5'), 78);
  assert.throws(() => noteToMidi('H4'));
});

test('コード名から根音と構成音を読み取れる', () => {
  assert.deepEqual(parseChord('Am'), { root: 9, intervals: [0, 3, 7] });
  assert.deepEqual(parseChord('Bbmaj7'), { root: 10, intervals: [0, 4, 7, 11] });
  assert.deepEqual(parseChord('F#m7'), { root: 6, intervals: [0, 3, 7, 10] });
  assert.throws(() => parseChord('Cdim'));
});

test('どの曲も楽譜の書式が正しい（小節の数・音符の数・リズムの長さ）', () => {
  const ids = new Set();
  for (const song of BGM_SONGS) {
    assert.ok(!ids.has(song.id), `${song.id} が重複`);
    ids.add(song.id);
    for (const [i, s] of song.sections.entries()) {
      assert.equal(s.chords.length, s.melody.length, `${song.id} ${i}: コードとメロディの小節数`);
      for (const bar of s.melody) {
        const n = bar.trim().split(/\s+/).length;
        assert.ok([4, 8, 16].includes(n), `${song.id}: 「${bar}」の音符が${n}個`);
      }
    }
    for (const r of [...song.comp, ...song.drums].map((l) => l.rhythm)) {
      assert.match(r, /^[.xo]{16}$/, `${song.id}: ${r}`);
    }
    assert.match(song.bass.rhythm, /^[.x358]{16}$/, `${song.id}: ${song.bass.rhythm}`);
    assert.notEqual(song.sections[0].melody[0].trim()[0], '-', `${song.id}: 最初の音がのばす記号`);
  }
});

test('楽譜を変換すると、曲の長さ分の発音リストになる', () => {
  for (const song of BGM_SONGS) {
    const score = compileSong(song);
    const bars = song.sections.reduce((n, s) => n + s.chords.length, 0);
    assert.equal(score.bars, bars, song.id);
    assert.equal(score.totalSteps, bars * STEPS_PER_BAR, song.id);
    assert.equal(score.stepSec, 60 / song.bpm / 4, song.id);
    const lead = score.steps.flat().filter((e) => e.voice === song.lead.voice);
    assert.ok(lead.length > bars, `${song.id}: メロディの音が少なすぎる`);
    for (const e of score.steps.flat()) assert.ok(e.len > 0 && e.vol > 0, song.id);
  }
});

test('のばす記号は、小節をまたいでも前の音をのばす', () => {
  const song = {
    bpm: 120,
    lead: { voice: 'marimba', vol: 1 },
    comp: [],
    bass: { voice: 'bass', vol: 1, rhythm: 'x...............' },
    drums: [],
    sections: [{ chords: ['C', 'C'], melody: ['. . . . . . C5 -', '- - E5 . . . . .'] }],
  };
  const lead = compileSong(song).steps.flatMap((evs, step) => evs.filter((e) => e.voice === 'marimba').map((e) => ({ step, ...e })));
  assert.deepEqual(lead.map(({ step, midi, len }) => ({ step, midi, len })), [
    { step: 12, midi: 72, len: 8 },
    { step: 20, midi: 76, len: 2 },
  ]);
});

test('メロディの長い音（4分音符以上）は、そのときのコードの音か9度の音になっている（不協和音を避ける）', () => {
  for (const song of BGM_SONGS) {
    const bars = song.sections.flatMap((s) => s.chords);
    const score = compileSong(song);
    score.steps.forEach((evs, step) => {
      for (const e of evs) {
        if (e.voice !== song.lead.voice || e.len < 4) continue;
        const names = bars[Math.floor(step / STEPS_PER_BAR)].split(' ');
        const name = names[Math.floor((step % STEPS_PER_BAR) / (STEPS_PER_BAR / names.length))];
        const { root, intervals } = parseChord(name);
        const ok = [...intervals, 2].map((i) => (root + i) % 12);
        const bar = Math.floor(step / STEPS_PER_BAR) + 1;
        assert.ok(ok.includes(e.midi % 12), `${song.id} ${bar}小節目: ${name} の上で音 ${e.midi}`);
      }
    });
  }
});

test('試聴ページのスクリプトは src/ から生成した最新の内容になっている（npm run build の忘れ防止）', () => {
  const actual = readFileSync(new URL(`../${PREVIEW.out}`, import.meta.url), 'utf8');
  assert.equal(actual, bundle(PREVIEW.entry));
});

test('曲名をタップするたびに、次の曲 → … → 最後の曲 → OFF → 最初の曲 と切り替わる', () => {
  const ids = BGM_SONGS.map((s) => s.id);
  let track = ids[0];
  const seen = [track];
  for (let i = 0; i < ids.length + 1; i++) {
    track = nextTrack(track, ids);
    seen.push(track);
  }
  assert.deepEqual(seen, [...ids, BGM_OFF, ids[0]]);
  // 保存されていた値が知らない曲なら、最初の曲から
  assert.equal(nextTrack('unknown', ids), ids[0]);
});

// createBgm に足りるだけの、偽の AudioContext。作ったノードとつなぎ先を記録する
function fakeAudioContext() {
  const param = (value) => ({
    value,
    setValueAtTime() {},
    setTargetAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
  });
  const node = (kind, extra = {}) => ({
    kind,
    connections: [],
    connect(to) {
      this.connections.push(to);
      return to;
    },
    disconnect() {},
    ...extra,
  });
  const gains = [];
  const compressors = [];
  const ac = {
    sampleRate: 100,
    currentTime: 0,
    state: 'running',
    destination: node('destination'),
    createGain() {
      const g = node('gain', { gain: param(1) });
      gains.push(g);
      return g;
    },
    createDynamicsCompressor() {
      const c = node('compressor', { threshold: param(0), knee: param(0), ratio: param(1), attack: param(0), release: param(0) });
      compressors.push(c);
      return c;
    },
    createBuffer(channels, length) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { getChannelData: (ch) => data[ch] };
    },
    createConvolver: () => node('convolver', { buffer: null }),
    createOscillator: () => node('oscillator', { type: 'sine', frequency: param(440), start() {}, stop() {} }),
    createBiquadFilter: () => node('filter', { type: 'lowpass', frequency: param(350), Q: param(1) }),
    createBufferSource: () => node('bufferSource', { buffer: null, start() {}, stop() {} }),
  };
  return { ac, gains, compressors };
}

test('BGM は、作ったときから指定した音量で鳴る（あとから下げるまでの間に大きな音が出ない）', async () => {
  const { createBgm } = await import('../src/ui/bgm.js');
  const { ac, gains, compressors } = fakeAudioContext();
  createBgm(ac, { volume: 0.05 });
  assert.equal(compressors.length, 1);
  const masters = gains.filter((g) => g.connections.includes(compressors[0]));
  assert.equal(masters.length, 1);
  assert.equal(masters[0].gain.value, 0.05);
});

test('音の準備（AudioContext の作成）に失敗しても、unlock は例外を出さない（ゲームは続く）', async () => {
  const { createMusic } = await import('../src/ui/music.js');
  const values = {
    window: { AudioContext: class { constructor() { throw new Error('no audio'); } } },
    document: { hidden: false, addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} },
  };
  const saved = Object.keys(values).map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
  for (const [k, v] of Object.entries(values)) {
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true, enumerable: true });
  }
  try {
    const button = { addEventListener() {}, setAttribute() {}, classList: { toggle() {} } };
    const titleEl = { textContent: '' };
    const music = createMusic({ button, titleEl });
    assert.doesNotThrow(() => music.unlock());
  } finally {
    for (const [k, desc] of saved) {
      if (desc) Object.defineProperty(globalThis, k, desc);
      else delete globalThis[k];
    }
  }
});

test('音の準備の途中で失敗したら、あとのタップで壊れた状態のまま再挑戦しない（毎回エラーを出さない）', async () => {
  const { createMusic } = await import('../src/ui/music.js');
  let created = 0;
  const values = {
    // AudioContext は作れるが、BGM の部品（GainNode）を作るところで失敗する環境
    window: {
      AudioContext: class {
        constructor() {
          created++;
          this.state = 'running';
        }
        createGain() {
          throw new Error('broken audio');
        }
        close() {
          return Promise.resolve();
        }
      },
    },
    document: { hidden: false, addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} },
  };
  const saved = Object.keys(values).map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
  for (const [k, v] of Object.entries(values)) {
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true, enumerable: true });
  }
  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    const button = { addEventListener() {}, setAttribute() {}, classList: { toggle() {} } };
    const music = createMusic({ button, titleEl: { textContent: '' } });
    assert.doesNotThrow(() => music.unlock());
    assert.doesNotThrow(() => music.unlock());
    assert.doesNotThrow(() => music.unlock());
    // 失敗は1回だけ知らせて、以後は作り直さない
    assert.equal(created, 1);
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = warn;
    for (const [k, desc] of saved) {
      if (desc) Object.defineProperty(globalThis, k, desc);
      else delete globalThis[k];
    }
  }
});

// BGM_VOLUME はまだない場合もあるので、ファイルの読み込みを止めないよう、テストの中で読み込む
test('BGM の音量は 0.08', async () => {
  const { BGM_VOLUME } = await import('../src/ui/music.js');
  assert.equal(BGM_VOLUME, 0.08);
});

test('最初のタップで鳴り始めた BGM は、全体の音量が 0.08 になっている', async () => {
  const { createMusic } = await import('../src/ui/music.js');
  const { ac, gains, compressors } = fakeAudioContext();
  const values = {
    // new したら、作ったノードを記録する偽の AudioContext を返す
    window: { AudioContext: function () { return ac; } },
    document: { hidden: false, addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} },
    // 曲の先読みのタイマーを本当に動かすと、テストが終わらなくなるので止めておく
    setInterval: () => 0,
    clearInterval() {},
  };
  const saved = Object.keys(values).map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
  for (const [k, v] of Object.entries(values)) {
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true, enumerable: true });
  }
  try {
    const button = { addEventListener() {}, setAttribute() {}, classList: { toggle() {} } };
    const music = createMusic({ button, titleEl: { textContent: '' } });
    music.unlock();
    assert.equal(compressors.length, 1);
    const masters = gains.filter((g) => g.connections.includes(compressors[0]));
    assert.equal(masters.length, 1);
    assert.equal(masters[0].gain.value, 0.08);
  } finally {
    for (const [k, desc] of saved) {
      if (desc) Object.defineProperty(globalThis, k, desc);
      else delete globalThis[k];
    }
  }
});
