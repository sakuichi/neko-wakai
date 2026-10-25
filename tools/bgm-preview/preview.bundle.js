// このファイルは tools/build.js が src/ から自動生成する。直接編集しない（npm run build）。
(() => {
'use strict';
const __modules = {};

// ---- src/data/bgmSongs.js
__modules['src/data/bgmSongs.js'] = (() => {
  // BGM の楽譜。書き方は src/ui/bgmScore.js の先頭を参照。
  // どの曲も 8小節 × 2（A・B）をくり返す。穏やかで明るいポップス（試聴：tools/bgm-preview/index.html）

  const BGM_SONGS = [
    {
      id: 'hidamari',
      title: 'ひだまり',
      mood: 'マリンバとエレピの、のんびりした昼さがり',
      scene: '昼（猫を待つ時間）',
      key: 'F',
      bpm: 92,
      swing: 0,
      lead: { voice: 'marimba', vol: 0.5 },
      comp: [{ voice: 'epiano', vol: 0.16, rhythm: '..x...x...x...x.', len: 2 }],
      bass: { voice: 'bass', vol: 0.15, rhythm: 'x.......5.....x.' },
      drums: [
        { voice: 'kick', vol: 0.7, rhythm: 'x.......x.......' },
        { voice: 'shaker', vol: 0.17, rhythm: 'o.x.o.x.o.x.o.x.' },
        { voice: 'snap', vol: 0.22, rhythm: '....x.......x...' },
      ],
      sections: [
        {
          chords: ['F', 'Am', 'Bb', 'C', 'F', 'Am', 'Bb C', 'F'],
          melody: [
            'A4 C5 F5 - E5 F5 C5 -',
            'E5 - C5 - A4 - - .',
            'D5 F5 Bb5 - F5 - D5 -',
            'G5 - - - . E5 F5 G5',
            'A5 - G5 F5 C5 - A4 -',
            'C5 - E5 - A5 - E5 -',
            'F5 - D5 - E5 - G5 -',
            'F5 - - - . . . .',
          ],
        },
        {
          chords: ['Bb', 'C', 'Am', 'Dm', 'Gm', 'C', 'Bb', 'C'],
          melody: [
            'D5 - - C5 D5 - F5 -',
            'E5 - - D5 C5 - G4 -',
            'A4 - C5 - E5 - D5 C5',
            'D5 - - - F5 - A5 -',
            'Bb5 - A5 - G5 - D5 -',
            'E5 - G5 - C5 - - .',
            'D5 - F5 - Bb4 - D5 -',
            'E5 - D5 - C5 - - .',
          ],
        },
      ],
    },
    {
      id: 'osanpo',
      title: 'おさんぽ日和',
      mood: '口笛とウクレレの、軽い足取り',
      scene: 'タイトル・昼',
      key: 'C',
      bpm: 112,
      swing: 0,
      lead: { voice: 'whistle', vol: 0.3 },
      comp: [{ voice: 'pluck', vol: 0.2, rhythm: 'x..x..x.x..x.x..', len: 2 }],
      bass: { voice: 'bass', vol: 0.15, rhythm: 'x...5...x...5...' },
      drums: [
        { voice: 'kick', vol: 0.63, rhythm: 'x.......x.......' },
        { voice: 'hat', vol: 0.13, rhythm: 'x.o.x.o.x.o.x.o.' },
        { voice: 'snap', vol: 0.28, rhythm: '....x.......x...' },
      ],
      sections: [
        {
          chords: ['C', 'G', 'Am', 'F', 'C', 'G', 'F G', 'C'],
          melody: [
            'G4 . C5 . E5 - D5 C5',
            'D5 - B4 - G4 - . .',
            'A4 . C5 . E5 - D5 C5',
            'C5 - A4 - F4 - . .',
            'G4 . C5 . E5 - G5 -',
            'G5 - D5 - B4 - G4 -',
            'A4 - C5 - B4 - D5 -',
            'C5 - - - . . . .',
          ],
        },
        {
          chords: ['F', 'G', 'Em', 'Am', 'Dm', 'G', 'C', 'G'],
          melody: [
            'A5 - G5 - F5 - C5 -',
            'D5 - G5 - - - . .',
            'G5 - E5 - B4 - E5 -',
            'C5 - - - A4 - . .',
            'D5 - F5 - A5 - G5 F5',
            'D5 - - - B4 - . .',
            'C5 - E5 - G5 - E5 -',
            'D5 - - - . . . .',
          ],
        },
      ],
    },
    {
      id: 'ohirune',
      title: 'おひるね',
      mood: 'オルゴールとやわらかい和音の、ゆったりした曲',
      scene: '夜・名前を付けるとき',
      key: 'G',
      bpm: 76,
      swing: 0,
      lead: { voice: 'musicbox', vol: 0.4, octave: 1 },
      comp: [
        { voice: 'pad', vol: 0.07, rhythm: 'x...............', len: 16 },
        { voice: 'epiano', vol: 0.1, rhythm: 'o.o.o.o.o.o.o.o.', len: 3, arp: true },
      ],
      bass: { voice: 'bass', vol: 0.13, rhythm: 'x.......5.......' },
      drums: [{ voice: 'shaker', vol: 0.3, rhythm: '..o...o...o...o.' }],
      sections: [
        {
          chords: ['Gmaj7', 'Cmaj7', 'Gmaj7', 'Cmaj7', 'Am7', 'D', 'Bm7 Em7', 'Am7 D'],
          melody: [
            'B4 - D5 - F#5 - - .',
            'E5 - D5 - B4 - - .',
            'B4 - D5 - G5 - F#5 -',
            'E5 - - - - - . .',
            'C5 - E5 - G5 - E5 -',
            'F#5 - - - A4 - . .',
            'D5 - B4 - G5 - E5 -',
            'C5 - - - F#4 - A4 -',
          ],
        },
        {
          chords: ['Em7', 'Am7', 'D', 'G', 'Em7', 'Am7', 'Cmaj7 D', 'G'],
          melody: [
            'G5 - F#5 - E5 - B4 -',
            'C5 - - - E5 - . .',
            'D5 - E5 - F#5 - A5 -',
            'G5 - - - - - . .',
            'B5 - G5 - E5 - D5 -',
            'E5 - G5 - C5 - - .',
            'B4 - C5 - D5 - F#5 -',
            'G5 - - - . . . .',
          ],
        },
      ],
    },
    {
      id: 'shippo',
      title: 'しっぽふりふり',
      mood: '鉄琴とはずむリズムの、ごきげんな曲',
      scene: 'エンディング（和解できたとき）',
      key: 'D',
      bpm: 100,
      swing: 0.6,
      lead: { voice: 'bell', vol: 0.42, octave: 1 },
      comp: [{ voice: 'epiano', vol: 0.16, rhythm: '..x...x...x...x.', len: 2 }],
      bass: { voice: 'bass', vol: 0.15, rhythm: 'x...3...5...3...' },
      drums: [
        { voice: 'kick', vol: 0.63, rhythm: 'x.......x.......' },
        { voice: 'hat', vol: 0.11, rhythm: 'x.o.x.o.x.o.x.o.' },
        { voice: 'snap', vol: 0.28, rhythm: '....x.......x...' },
      ],
      sections: [
        {
          chords: ['D', 'Bm', 'G', 'A', 'D', 'Bm', 'Em A', 'D'],
          melody: [
            'F#5 - A5 - F#5 - D5 -',
            'B4 - D5 - F#5 - - .',
            'G5 - B5 - G5 - D5 -',
            'E5 - - - C#5 - . .',
            'D5 - F#5 - A5 - B5 A5',
            'F#5 - D5 - B4 - D5 -',
            'E5 - G5 - C#5 - E5 -',
            'D5 - - - . . . .',
          ],
        },
        {
          chords: ['G', 'A', 'F#m', 'Bm', 'Em', 'A', 'G', 'A'],
          melody: [
            'B4 - D5 - G5 - - .',
            'A4 - C#5 - E5 - - .',
            'F#5 - C#5 - A4 - C#5 -',
            'B4 - - - D5 - . .',
            'G5 - F#5 - E5 - B4 -',
            'C#5 - E5 - A5 - - .',
            'B5 - A5 - G5 - D5 -',
            'E5 - - - C#5 - A4 -',
          ],
        },
      ],
    },
  ];
  return { BGM_SONGS };
})();

// ---- src/ui/bgmScore.js
__modules['src/ui/bgmScore.js'] = (() => {
  // BGM の楽譜（src/data/bgmSongs.js）を、16分音符ごとの発音リストに変換する。WebAudio には依存しない。
  //
  // 楽譜の書き方
  // - メロディ：1小節を空白区切りの 8個（8分音符）・16個（16分音符）・4個（4分音符）で書く。
  //   音名（C5, Bb4, F#5）＝ 鳴らす / '-' ＝ 前の音をのばす（小節をまたいでもよい）/ '.' ＝ 休み
  // - リズム：1小節を16文字で書く。'.' ＝ 休み / 'x' ＝ 強く / 'o' ＝ 弱く
  //   ベースだけは 'x' の代わりに '5'（5度上）'3'（3度上）'8'（1オクターブ上）も使える
  // - コード：1小節に1つ。空白で区切って2つ書くと、半分ずつになる

  const STEPS_PER_BAR = 16;

  const PITCH = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const ACCIDENTAL = { '#': 1, b: -1 };
  const QUALITY = {
    '': [0, 4, 7],
    m: [0, 3, 7],
    7: [0, 4, 7, 10],
    maj7: [0, 4, 7, 11],
    m7: [0, 3, 7, 10],
    sus4: [0, 5, 7],
    add9: [0, 4, 7, 14],
  };
  const ACCENT = { x: 1, o: 0.55 };
  const BASS_DEGREE = { x: 0, 3: 1, 5: 2 };

  function noteToMidi(name) {
    const m = /^([A-G])([#b]?)(\d)$/.exec(name);
    if (!m) throw new Error(`音名が読めない: ${name}`);
    return 12 * (Number(m[3]) + 1) + PITCH[m[1]] + (ACCIDENTAL[m[2]] ?? 0);
  }

  /** @returns {{root: number, intervals: number[]}} root は 0（C）〜11（B） */
  function parseChord(name) {
    const m = /^([A-G])([#b]?)(maj7|m7|m|7|sus4|add9)?$/.exec(name);
    if (!m) throw new Error(`コード名が読めない: ${name}`);
    return { root: (PITCH[m[1]] + (ACCIDENTAL[m[2]] ?? 0) + 12) % 12, intervals: QUALITY[m[3] ?? ''] };
  }

  // 伴奏は F#3〜F4 あたり、ベースは E2〜D#3 あたりに収める
  function compVoicing({ root, intervals }) {
    const base = 60 + root > 66 ? 48 + root : 60 + root;
    return intervals.map((i) => base + i);
  }

  function bassNote({ root, intervals }, ch) {
    const base = 40 + ((root - 4 + 12) % 12);
    return ch === '8' ? base + 12 : base + intervals[BASS_DEGREE[ch]];
  }

  /**
   * @returns {{stepSec: number, totalSteps: number, bars: number, steps: Array<Array<{voice, midi, len, vol}>>}}
   *   steps[i] はその16分音符で鳴らし始める音。midi は数値か、和音なら数値の配列。len は16分音符いくつ分か
   */
  function compileSong(song) {
    const bars = song.sections.flatMap((s) => s.chords.map((chords, i) => ({ chords, melody: s.melody[i] })));
    const totalSteps = bars.length * STEPS_PER_BAR;
    const steps = Array.from({ length: totalSteps }, () => []);
    const add = (step, e) => steps[step].push(e);

    // メロディ（のばす記号は小節をまたいでつながる）
    const lead = song.lead;
    let last = null;
    bars.forEach((bar, b) => {
      const tokens = bar.melody.trim().split(/\s+/);
      const per = STEPS_PER_BAR / tokens.length;
      tokens.forEach((tok, i) => {
        const step = b * STEPS_PER_BAR + i * per;
        if (tok === '-') {
          if (last) last.len += per;
        } else if (tok === '.') {
          last = null;
        } else {
          last = { voice: lead.voice, midi: noteToMidi(tok) + 12 * (lead.octave ?? 0), len: per, vol: lead.vol };
          add(step, last);
        }
      });
    });

    bars.forEach((bar, b) => {
      const names = bar.chords.trim().split(/\s+/);
      const span = STEPS_PER_BAR / names.length;
      const chordAt = (s) => parseChord(names[Math.floor(s / span)]);
      const at = (s) => b * STEPS_PER_BAR + s;

      // 伴奏：和音で鳴らすか、分散和音（アルペジオ）で鳴らす
      for (const layer of song.comp) {
        let arp = 0;
        for (let s = 0; s < STEPS_PER_BAR; s++) {
          if (s % span === 0) arp = 0;
          const ch = layer.rhythm[s];
          if (ch === '.') continue;
          const tones = compVoicing(chordAt(s));
          const midi = layer.arp ? [...tones, tones[0] + 12][arp++ % (tones.length + 1)] : tones;
          add(at(s), { voice: layer.voice, midi, len: layer.len, vol: layer.vol * ACCENT[ch] });
        }
      }

      // ベース：次の音まで（なければ小節の終わりまで）のばす
      const hits = [...song.bass.rhythm].flatMap((ch, s) => (ch === '.' ? [] : [s]));
      hits.forEach((s, i) => {
        const end = hits[i + 1] ?? STEPS_PER_BAR;
        add(at(s), { voice: song.bass.voice, midi: bassNote(chordAt(s), song.bass.rhythm[s]), len: end - s, vol: song.bass.vol });
      });

      for (const d of song.drums) {
        for (let s = 0; s < STEPS_PER_BAR; s++) {
          const ch = d.rhythm[s];
          if (ch !== '.') add(at(s), { voice: d.voice, midi: null, len: 1, vol: d.vol * ACCENT[ch] });
        }
      }
    });

    return { stepSec: 60 / song.bpm / 4, totalSteps, bars: bars.length, steps };
  }
  return { STEPS_PER_BAR, noteToMidi, parseChord, compileSong };
})();

// ---- src/ui/bgm.js
__modules['src/ui/bgm.js'] = (() => {
  // BGM の再生（WebAudio で合成。音声ファイルは使わない）。
  // 楽譜は src/data/bgmSongs.js、楽譜から発音リストへの変換は src/ui/bgmScore.js。
  const { compileSong, STEPS_PER_BAR } = __modules['src/ui/bgmScore.js'];

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
  function createBgm(ac, { destination = ac.destination, aheadSec = AHEAD_SEC, volume = 0.6 } = {}) {
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
  return { createBgm };
})();

// ---- tools/bgm-preview/preview.js
__modules['tools/bgm-preview/preview.js'] = (() => {
  // BGM の試聴ページ。npm run build で preview.bundle.js にまとめ、index.html から読み込む。
  const { BGM_SONGS } = __modules['src/data/bgmSongs.js'];
  const { createBgm } = __modules['src/ui/bgm.js'];

  const list = document.getElementById('songs');
  const volume = document.getElementById('volume');
  let ac = null;
  let bgm = null;
  const cards = new Map();

  // ブラウザはタップの前に音を鳴らせないので、最初の再生ボタンで準備する
  function ensureAudio() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ac = new AC();
      bgm = createBgm(ac);
      bgm.setVolume(Number(volume.value));
    }
    if (ac.state === 'suspended') ac.resume();
  }

  BGM_SONGS.forEach((song, i) => {
    const card = document.createElement('article');
    card.className = 'song';
    const bars = song.sections.reduce((n, s) => n + s.chords.length, 0);
    const loopSec = Math.round((bars * 4 * 60) / song.bpm);
    card.innerHTML = `
      <div class="no">${i + 1}</div>
      <div class="body">
        <h2></h2>
        <p class="mood"></p>
        <p class="meta"></p>
        <p class="pos" aria-live="off"></p>
      </div>
      <button type="button" class="play" aria-label="再生">▶</button>`;
    card.querySelector('h2').textContent = song.title;
    card.querySelector('.mood').textContent = song.mood;
    card.querySelector('.meta').textContent = `おすすめ：${song.scene}\n${song.key}調・テンポ${song.bpm}・${loopSec}秒でくり返し`;
    const btn = card.querySelector('.play');
    btn.addEventListener('click', () => {
      ensureAudio();
      if (bgm.current === song.id) bgm.stop();
      else bgm.play(song);
      refresh();
    });
    cards.set(song.id, { card, btn, pos: card.querySelector('.pos'), bars });
    list.append(card);
  });

  document.getElementById('stop').addEventListener('click', () => {
    bgm?.stop();
    refresh();
  });
  volume.addEventListener('input', () => bgm?.setVolume(Number(volume.value)));

  function refresh() {
    for (const [id, c] of cards) {
      const on = bgm?.current === id;
      c.card.classList.toggle('on', on);
      c.btn.textContent = on ? '■' : '▶';
      c.btn.setAttribute('aria-label', on ? '停止' : '再生');
      if (!on) c.pos.textContent = '';
    }
  }

  // 再生中の曲の、いまの小節を表示する
  (function loop() {
    const id = bgm?.current;
    if (id) {
      const c = cards.get(id);
      const bar = bgm.bar();
      const half = c.bars / 2;
      c.pos.textContent = `${bar < half ? 'A' : 'B'}メロ ${(bar % half) + 1} / ${half}小節`;
    }
    requestAnimationFrame(loop);
  })();
  return {  };
})();

})();
