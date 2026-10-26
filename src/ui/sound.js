// 効果音（WebAudio で合成。音声ファイルは使わない）と振動。
// ブラウザは操作の前に音を鳴らせないので、最初のタップで unlock() を呼ぶ。
const STORAGE_KEY = 'neko-wakai:sound';

export function createSound() {
  let ac = null;
  let noise = null;
  // 効果音の出口。声を大きくしても音割れしないよう、軽くまとめる（リミッター）
  let out = null;
  let enabled = load();
  // 音の準備に失敗した（この環境では効果音を鳴らせない）
  let failed = false;

  // 音を準備できない環境では、一度だけ知らせて効果音なしでゲームを続ける（src/ui/music.js の BGM と同じ）。
  // 失敗したら作りかけの AudioContext は捨て、以後は作り直さない
  function prepare(AC) {
    try {
      ac = new AC();
      noise = makeNoise(ac);
      out = ac.createDynamicsCompressor();
      out.threshold.value = -6;
      out.knee.value = 3;
      out.ratio.value = 8;
      out.attack.value = 0.003;
      out.release.value = 0.15;
      // WebAudio のリミッターは自動で音量を持ち上げる（メイクアップゲイン）ので、その分を下げて出す。
      // 0.8 で、ゴロゴロ・にゃーんが約4dB大きくなり、ピークは −1dB 未満に収まる（docs/spec.md 13.2）
      const trim = ac.createGain();
      trim.gain.value = 0.8;
      out.connect(trim).connect(ac.destination);
      return true;
    } catch (e) {
      console.warn('効果音を準備できませんでした', e);
      failed = true;
      ac?.close?.().catch(() => {});
      ac = null;
      noise = null;
      out = null;
      return false;
    }
  }

  function unlock() {
    if (!enabled || failed) return;
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC || !prepare(AC)) return;
    }
    if (ac.state === 'suspended') ac.resume();
  }

  function ready() {
    return enabled && !failed && ac && ac.state === 'running';
  }

  function vibrate(pattern) {
    if (enabled && navigator.vibrate) navigator.vibrate(pattern);
  }

  // ゴロゴロ：低くこもったノイズを、1秒に25回ほど強弱させる。
  // スマホのスピーカーでも聞こえるよう、こもり具合（lowpass）は 320Hz まで通す
  function purr(sec = 1.6, volume = 1.6) {
    vibrate([25, 35, 25, 35, 25, 35, 25]);
    if (!ready()) return;
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const am = ac.createGain();
    am.gain.value = 0.5;
    const lfo = ac.createOscillator();
    lfo.frequency.value = 25;
    const lfoDepth = ac.createGain();
    lfoDepth.gain.value = 0.5;
    lfo.connect(lfoDepth).connect(am.gain);
    const env = ac.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(volume, t + 0.25);
    env.gain.setValueAtTime(volume, t + sec - 0.4);
    env.gain.linearRampToValueAtTime(0, t + sec);
    src.connect(lp).connect(am).connect(env).connect(out);
    src.start(t);
    lfo.start(t);
    src.stop(t + sec);
    lfo.stop(t + sec);
  }

  // まばたきを返してくれた：「にゃーん」（試作 prototype/meow の4番。長さ0.55秒）。
  // のこぎり波（声の元）を、口の開き具合を表すフィルターに通す。高さは「にゃ」で上がって「ーん」で下がり、
  // 響きは n（閉じた口）→ a（開いた口）→ n と変わる
  function meow() {
    if (!ready()) return;
    const t = ac.currentTime + 0.02;
    const d = 0.55;
    const f0 = [660, 890, 670];
    const [closed, wide, end] = [460, 1400, 585];
    const src = ac.createOscillator();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(f0[0], t);
    src.frequency.linearRampToValueAtTime(f0[1], t + d * 0.35);
    src.frequency.linearRampToValueAtTime(f0[2], t + d);
    // ゆれ（ビブラート）は、のびる後半から
    const lfo = ac.createOscillator();
    lfo.frequency.value = 6;
    const depth = ac.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(f0[1] * 0.0125, t + d * 0.6);
    lfo.connect(depth).connect(src.frequency);
    // 全体の音量の形：ふわっと入って、最後はすっと消える（試作より約4dB大きい）
    const env = ac.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.8, t + 0.05);
    env.gain.setValueAtTime(0.8, t + d * 0.55);
    env.gain.linearRampToValueAtTime(0.5, t + d * 0.8);
    env.gain.linearRampToValueAtTime(0, t + d);
    // 口の開き具合：1つ目の響き（F1）と2つ目の響き（F2）
    for (const [k, q, level] of [[1, 3, 1], [1.9, 5, 0.55]]) {
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = q;
      f.frequency.setValueAtTime(closed * k, t);
      f.frequency.linearRampToValueAtTime(wide * k, t + d * 0.3);
      f.frequency.linearRampToValueAtTime(wide * 0.9 * k, t + d * 0.6);
      f.frequency.linearRampToValueAtTime(end * k, t + d);
      const g = ac.createGain();
      g.gain.value = level;
      src.connect(f).connect(g).connect(env);
    }
    // 鼻にかかった「n」の成分（低いところだけ）
    const nasal = ac.createBiquadFilter();
    nasal.type = 'lowpass';
    nasal.frequency.value = 450;
    const gn = ac.createGain();
    gn.gain.value = 0.35;
    src.connect(nasal).connect(gn).connect(env);
    env.connect(out);
    src.start(t);
    lfo.start(t);
    src.stop(t + d + 0.05);
    lfo.stop(t + d + 0.05);
  }

  // 逃げた・猫キック：短い「ぽふっ」
  function bump() {
    vibrate(70);
    if (!ready()) return;
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.15);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  return {
    unlock,
    purr,
    meow,
    bump,
    get enabled() {
      return enabled;
    },
    setEnabled(v) {
      enabled = v;
      save(v);
      if (v) unlock();
      else ac?.suspend();
    },
  };
}

function makeNoise(ac) {
  const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const data = buf.getChannelData(0);
  // 低い音が多いノイズ（ブラウンノイズ）
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  return buf;
}

// 設定の保存はこの端末の中だけ（外部には送らない）。使えない環境では毎回 ON から始める
function load() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function save(v) {
  try {
    localStorage.setItem(STORAGE_KEY, v ? 'on' : 'off');
  } catch {
    // 保存できなくても遊べる
  }
}
