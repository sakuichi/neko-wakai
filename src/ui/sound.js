// 効果音（WebAudio で合成。音声ファイルは使わない）と振動。
// ブラウザは操作の前に音を鳴らせないので、最初のタップで unlock() を呼ぶ。
const STORAGE_KEY = 'neko-wakai:sound';

export function createSound() {
  let ac = null;
  let noise = null;
  let enabled = load();

  function unlock() {
    if (!enabled) return;
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      noise = makeNoise(ac);
    }
    if (ac.state === 'suspended') ac.resume();
  }

  function ready() {
    return enabled && ac && ac.state === 'running';
  }

  function vibrate(pattern) {
    if (enabled && navigator.vibrate) navigator.vibrate(pattern);
  }

  // ゴロゴロ：低くこもったノイズを、1秒に25回ほど強弱させる。
  // スマホのスピーカーでも聞こえるよう、こもり具合（lowpass）は 320Hz まで通す
  function purr(sec = 1.6, volume = 1) {
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
    src.connect(lp).connect(am).connect(env).connect(ac.destination);
    src.start(t);
    lfo.start(t);
    src.stop(t + sec);
    lfo.stop(t + sec);
  }

  // まばたきを返してくれた：やわらかい2音
  function chime() {
    if (!ready()) return;
    const t = ac.currentTime;
    [660, 990].forEach((f, i) => tone(f, t + i * 0.12, 0.35, 0.12));
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
    osc.connect(g).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  function tone(freq, t, dur, volume) {
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  return {
    unlock,
    purr,
    chime,
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
