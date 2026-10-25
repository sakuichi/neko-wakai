// BGM の楽譜（src/data/bgmSongs.js）を、16分音符ごとの発音リストに変換する。WebAudio には依存しない。
//
// 楽譜の書き方
// - メロディ：1小節を空白区切りの 8個（8分音符）・16個（16分音符）・4個（4分音符）で書く。
//   音名（C5, Bb4, F#5）＝ 鳴らす / '-' ＝ 前の音をのばす（小節をまたいでもよい）/ '.' ＝ 休み
// - リズム：1小節を16文字で書く。'.' ＝ 休み / 'x' ＝ 強く / 'o' ＝ 弱く
//   ベースだけは 'x' の代わりに '5'（5度上）'3'（3度上）'8'（1オクターブ上）も使える
// - コード：1小節に1つ。空白で区切って2つ書くと、半分ずつになる

export const STEPS_PER_BAR = 16;

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

export function noteToMidi(name) {
  const m = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!m) throw new Error(`音名が読めない: ${name}`);
  return 12 * (Number(m[3]) + 1) + PITCH[m[1]] + (ACCIDENTAL[m[2]] ?? 0);
}

/** @returns {{root: number, intervals: number[]}} root は 0（C）〜11（B） */
export function parseChord(name) {
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
export function compileSong(song) {
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
