import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSound } from '../src/ui/sound.js';

const SOUND_KEY = 'neko-wakai:sound';

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

// 効果音に足りるだけの、偽の AudioContext。作られた回数・createOscillator が呼ばれた回数・close された回数を数える。
// failOn にメソッド名を渡すと、そのメソッドが例外を投げる（準備の失敗を再現する）。
// strictConnect を true にすると、本物の WebAudio と同じく、つなぎ先がないときに connect が例外を投げる
function fakeAudio({ failOn = null, strictConnect = false } = {}) {
  const counts = { created: 0, oscillators: 0, closed: 0 };
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
    connect(to) {
      if (strictConnect && !to) throw new TypeError('connect: つなぎ先がない');
      return to;
    },
    disconnect() {},
    ...extra,
  });
  class FakeAudioContext {
    constructor() {
      counts.created++;
      this.state = 'running';
      this.currentTime = 0;
      this.sampleRate = 100;
      this.destination = node('destination');
      if (failOn) {
        this[failOn] = () => {
          throw new Error(`${failOn} に失敗（テスト用）`);
        };
      }
    }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
    suspend() {
      this.state = 'suspended';
      return Promise.resolve();
    }
    close() {
      counts.closed++;
      this.state = 'closed';
      return Promise.resolve();
    }
    createBuffer(channels, length) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { getChannelData: (ch) => data[ch] };
    }
    createBufferSource() {
      return node('bufferSource', { buffer: null, loop: false, playbackRate: param(1), start() {}, stop() {} });
    }
    createGain() {
      return node('gain', { gain: param(1) });
    }
    createBiquadFilter() {
      return node('filter', { type: 'lowpass', frequency: param(350), Q: param(1), gain: param(0) });
    }
    createOscillator() {
      counts.oscillators++;
      return node('oscillator', { type: 'sine', frequency: param(440), detune: param(0), start() {}, stop() {} });
    }
    createDynamicsCompressor() {
      return node('compressor', { threshold: param(0), knee: param(0), ratio: param(1), attack: param(0), release: param(0) });
    }
  }
  return { FakeAudioContext, counts };
}

function audioGlobals(FakeAudioContext, storedSound) {
  return {
    window: { AudioContext: FakeAudioContext },
    localStorage: { getItem: (k) => (k === SOUND_KEY ? storedSound : null), setItem() {} },
    navigator: {},
  };
}

test('効果音が OFF のときは、「にゃーん」を鳴らさない（AudioContext も作らない）', () => {
  const { FakeAudioContext, counts } = fakeAudio();
  withGlobals(audioGlobals(FakeAudioContext, 'off'), () => {
    const sound = createSound();
    sound.unlock();
    sound.meow();
    assert.equal(counts.oscillators, 0);
    assert.equal(counts.created, 0);
  });
});

test('効果音が ON のときは、「にゃーん」を鳴らす', () => {
  const { FakeAudioContext, counts } = fakeAudio();
  withGlobals(audioGlobals(FakeAudioContext, null), () => {
    const sound = createSound();
    sound.unlock();
    const before = counts.oscillators;
    assert.doesNotThrow(() => sound.meow());
    assert.ok(counts.oscillators - before >= 1, `createOscillator が呼ばれた回数 ${counts.oscillators - before}`);
  });
});

test('効果音にチャイムはない（まばたきの音は「にゃーん」に置き換えた）', () => {
  const { FakeAudioContext } = fakeAudio();
  withGlobals(audioGlobals(FakeAudioContext, null), () => {
    const sound = createSound();
    assert.equal(typeof sound.chime, 'undefined');
  });
});

test('効果音の準備に失敗したら、一度だけ知らせて作りかけの AudioContext を閉じ、以後は作り直さず例外も出さない', () => {
  const { FakeAudioContext, counts } = fakeAudio({ failOn: 'createDynamicsCompressor', strictConnect: true });
  const originalWarn = console.warn;
  let warns = 0;
  console.warn = () => {
    warns++;
  };
  try {
    withGlobals(audioGlobals(FakeAudioContext, null), () => {
      const sound = createSound();
      assert.doesNotThrow(() => sound.unlock(), '1回目の unlock');
      assert.doesNotThrow(() => sound.unlock(), '2回目の unlock');
      assert.doesNotThrow(() => sound.unlock(), '3回目の unlock');
      assert.doesNotThrow(() => sound.purr(), 'purr');
      assert.doesNotThrow(() => sound.meow(), 'meow');
      assert.doesNotThrow(() => sound.bump(), 'bump');
      assert.equal(counts.created, 1, 'AudioContext を作った回数');
      assert.equal(counts.closed, 1, '作りかけの AudioContext を close した回数');
      assert.equal(warns, 1, 'console.warn の回数');
    });
  } finally {
    console.warn = originalWarn;
  }
});
