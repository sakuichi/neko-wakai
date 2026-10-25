// BGM の再生（WebAudio で合成。音声ファイルは使わない）。
// 楽譜は src/data/bgmSongs.js、楽譜から発音リストへの変換は src/ui/bgmScore.js。
import { compileSong, STEPS_PER_BAR } from './bgmScore.js';

// 少し先まで予約しておく（タイマーが遅れても音が途切れないように）
const AHEAD_SEC = 0.3;
const TICK_MS = 50;
// 音色ごとの残響の量（ないものは残響なし）
const WET = { marimba: 0.3, piano: 0.25, pluck: 0.2, whistle: 0.35, epiano: 0.3, musicbox: 0.45, bell: 0.4, pad: 0.5, snap: 0.15 };

/**
 * @param ac AudioContext（OfflineAudioContext でもよい）
 * @param opts.aheadSec 先に予約する秒数。書き出しのときは曲の長さを渡すと一度に全部予約できる
 * @param opts.volume 全体の音量（最初からこの音量で鳴らす）
 */
export function createBgm(ac, { destination = ac.destination, aheadSec = AHEAD_SEC, volume = 0.6 } = {}) {
  const master = ac.createGain();
  master.gain.value = volume;
  // 音が重なったときに割れないように、軽くまとめる
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.knee.value = 6;
  limiter.ratio.value = 4;
  limiter.attack.value = 0.005;
  limiter.release.value = 0.2;
  master.connect(limiter).connect(destination);
  const noise = makeNoise(ac);
  const impulse = makeImpulse(ac, 2.2);
  let playing = null;

  function play(song) {
    stop(0.4);
    const score = compileSong(song);
    const bus = ac.createGain();
    bus.connect(master);
    const verb = ac.createConvolver();
    verb.buffer = impulse;
    verb.connect(bus);
    const p = { song, score, bus, verb, step: 0, time: ac.currentTime + 0.1, timer: null };
    playing = p;
    schedule(p);
    p.timer = setInterval(() => schedule(p), TICK_MS);
  }

  function schedule(p) {
    const now = ac.currentTime;
    // タブが裏に回ってタイマーが止まっていたら、今から鳴らし直す
    if (p.time < now - 0.2) p.time = now + 0.05;
    while (p.time < now + aheadSec) {
      const swing = p.step % 4 === 2 ? p.song.swing * p.score.stepSec : 0;
      for (const e of p.score.steps[p.step]) note(p, e, p.time + swing);
      p.time += p.score.stepSec;
      p.step = (p.step + 1) % p.score.totalSteps;
    }
  }

  function note(p, e, t) {
    const out = ac.createGain();
    // 機械っぽさを減らすため、強さを少しだけばらつかせる
    out.gain.value = e.vol * (0.9 + Math.random() * 0.1);
    out.connect(p.bus);
    if (WET[e.voice]) {
      const send = ac.createGain();
      send.gain.value = WET[e.voice];
      out.connect(send).connect(p.verb);
    }
    const dur = e.len * p.score.stepSec;
    const ctx = { ac, out, t, dur, noise };
    for (const m of [].concat(e.midi)) VOICES[e.voice]({ ...ctx, f: m === null ? 0 : 440 * 2 ** ((m - 69) / 12) });
  }

  function stop(fadeSec = 0.8) {
    if (!playing) return;
    const p = playing;
    playing = null;
    clearInterval(p.timer);
    const now = ac.currentTime;
    p.bus.gain.cancelScheduledValues(now);
    p.bus.gain.setValueAtTime(p.bus.gain.value, now);
    p.bus.gain.linearRampToValueAtTime(0, now + fadeSec);
    setTimeout(() => p.bus.disconnect(), (fadeSec + 3) * 1000);
  }

  return {
    play,
    stop,
    setVolume(v) {
      master.gain.setTargetAtTime(v, ac.currentTime, 0.05);
    },
    get current() {
      return playing?.song.id ?? null;
    },
    // いま鳴っている小節（0始まり）。止まっていれば null
    bar() {
      if (!playing) return null;
      const { score, step, time } = playing;
      const behind = Math.ceil((time - ac.currentTime) / score.stepSec);
      const now = (step - behind + score.totalSteps) % score.totalSteps;
      return Math.floor(now / STEPS_PER_BAR);
    },
  };
}

// ---- 音色。どれも ({ac, out, f, t, dur, noise}) を受け取り、out につなぐ

function osc(ac, type, freq, t, end) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.start(t);
  o.stop(end);
  return o;
}

// 叩く・はじく音：すぐ立ち上がり、decaySec でほぼ消える
function hitEnv(ac, out, t, decaySec, peak = 1) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.004);
  g.gain.setTargetAtTime(0, t + 0.004, decaySec / 5);
  g.connect(out);
  return g;
}

// のばす音：attack で立ち上がり、sustain まで下がって、dur のあと release で消える
function holdEnv(ac, out, t, dur, { attack, sustain = 1, decay = 0.3, release }) {
  const g = ac.createGain();
  const end = t + Math.max(dur, attack + 0.01);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(1, t + attack);
  g.gain.setTargetAtTime(sustain, t + attack, decay / 3);
  g.gain.setTargetAtTime(0, end, release / 4);
  g.connect(out);
  return { g, end: end + release };
}

function lowpass(ac, out, freq, q = 0.7) {
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  f.Q.value = q;
  f.connect(out);
  return f;
}

function noiseBurst({ ac, out, t, noise }, type, freq, q, decaySec) {
  const src = ac.createBufferSource();
  src.buffer = noise;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  src.connect(f).connect(hitEnv(ac, out, t, decaySec));
  src.start(t, Math.random() * 0.5);
  src.stop(t + decaySec);
}

const VOICES = {
  // 木の板を叩いたような音
  marimba({ ac, out, f, t }) {
    const g = hitEnv(ac, out, t, 0.9);
    osc(ac, 'sine', f, t, t + 0.9).connect(g);
    osc(ac, 'sine', f * 4, t, t + 0.12).connect(hitEnv(ac, g, t, 0.1, 0.25));
  },
  piano({ ac, out, f, t, dur }) {
    const { g, end } = holdEnv(ac, out, t, dur, { attack: 0.005, sustain: 0.25, decay: 0.9, release: 0.25 });
    const lp = lowpass(ac, g, 2500);
    osc(ac, 'triangle', f, t, end).connect(lp);
    osc(ac, 'sine', f * 2, t, end).connect(hitEnv(ac, lp, t, 0.4, 0.3));
  },
  // ウクレレのような、はじく音
  pluck({ ac, out, f, t }) {
    const g = hitEnv(ac, out, t, 0.5);
    const lp = lowpass(ac, g, 2600, 1);
    lp.frequency.setTargetAtTime(700, t, 0.04);
    osc(ac, 'triangle', f, t, t + 0.5).connect(lp);
    osc(ac, 'sawtooth', f, t, t + 0.5).connect(hitEnv(ac, lp, t, 0.3, 0.35));
  },
  // 口笛：やわらかく入って、のばすと少しゆれる
  whistle({ ac, out, f, t, dur }) {
    const { g, end } = holdEnv(ac, out, t, dur, { attack: 0.04, sustain: 0.85, decay: 0.2, release: 0.12 });
    const o = osc(ac, 'sine', f, t, end);
    const vib = osc(ac, 'sine', 5.5, t, end);
    const depth = ac.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(f * 0.012, t + 0.25);
    vib.connect(depth).connect(o.frequency);
    o.connect(g);
  },
  // エレクトリックピアノ：丸い音に、叩いた瞬間の金属っぽさを少し
  epiano({ ac, out, f, t, dur }) {
    const { g, end } = holdEnv(ac, out, t, dur, { attack: 0.005, sustain: 0.35, decay: 0.9, release: 0.3 });
    osc(ac, 'sine', f, t, end).connect(g);
    osc(ac, 'sine', f * 2, t, end).connect(hitEnv(ac, g, t, 0.6, 0.18));
    osc(ac, 'sine', f * 7, t, t + 0.06).connect(hitEnv(ac, g, t, 0.05, 0.06));
  },
  musicbox({ ac, out, f, t }) {
    const g = hitEnv(ac, out, t, 1.6);
    osc(ac, 'sine', f, t, t + 1.6).connect(g);
    osc(ac, 'sine', f * 3, t, t + 0.3).connect(hitEnv(ac, g, t, 0.3, 0.18));
  },
  // 鉄琴
  bell({ ac, out, f, t }) {
    const g = hitEnv(ac, out, t, 1.1);
    osc(ac, 'sine', f, t, t + 1.1).connect(g);
    osc(ac, 'sine', f * 2.76, t, t + 0.3).connect(hitEnv(ac, g, t, 0.25, 0.3));
    osc(ac, 'sine', f * 5.4, t, t + 0.12).connect(hitEnv(ac, g, t, 0.1, 0.1));
  },
  // ふんわりした和音の背景
  pad({ ac, out, f, t, dur }) {
    const { g, end } = holdEnv(ac, out, t, dur, { attack: 0.5, release: 0.8 });
    const lp = lowpass(ac, g, 900, 0.5);
    for (const cents of [-7, 7]) osc(ac, 'sawtooth', f * 2 ** (cents / 1200), t, end).connect(lp);
  },
  bass({ ac, out, f, t, dur }) {
    const { g, end } = holdEnv(ac, out, t, dur * 0.9, { attack: 0.008, sustain: 0.6, decay: 0.4, release: 0.08 });
    const lp = lowpass(ac, g, 700);
    osc(ac, 'triangle', f, t, end).connect(lp);
    osc(ac, 'sine', f, t, end).connect(lp);
  },
  // やわらかいバスドラム
  kick({ ac, out, t }) {
    const o = osc(ac, 'sine', 130, t, t + 0.3);
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.1);
    o.connect(hitEnv(ac, out, t, 0.3));
  },
  hat: (c) => noiseBurst(c, 'highpass', 8000, 0.7, 0.05),
  shaker: (c) => noiseBurst(c, 'bandpass', 6000, 0.8, 0.09),
  // 指パッチン
  snap: (c) => noiseBurst(c, 'bandpass', 2200, 3, 0.08),
};

function makeNoise(ac) {
  const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// 部屋の残響：だんだん小さくなるノイズ（左右で別のノイズにして広がりを出す）
function makeImpulse(ac, sec) {
  const len = Math.floor(ac.sampleRate * sec);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  return buf;
}
