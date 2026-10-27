// ねこ手帳の記録：思い出（遊んだ猫）・図鑑（毛色ごとのスタンプと最短日数）・称号。
// 描画や保存には依存しない純粋な関数（保存は src/ui/recordStore.js、表示は src/scenes/notebookScene.js）
import { COAT_PERSONALITY, PERSONALITIES } from '../data/params.js';
import { ENDINGS } from '../data/texts.js';

// 思い出は新しいものからこの件数まで残す（図鑑のスタンプと称号は消えない）
export const MEMORY_LIMIT = 50;
// 称号の表示名と条件の説明は src/data/texts.js の TITLES
export const TITLE_IDS = ['first', 'fate', 'noMistake', 'amaenbo', 'tsundere', 'bibiri', 'visitor', 'allCoats', 'allStamps', 'tenCats'];
// 図鑑のスタンプになるエンディング・毛色・性格。あとで足したときに直し忘れないよう、元のデータから取る
const ENDING_IDS = Object.keys(ENDINGS);
const COAT_KEYS = Object.keys(COAT_PERSONALITY);
const PERSONALITY_IDS = Object.keys(PERSONALITIES);

export function emptyRecords() {
  return { v: 1, memories: [], dex: {}, titles: [], metCount: 0 };
}

const reconciled = (endingId) => endingId !== 'visitor';

// 称号ごとの条件。records は今回のエンディングを足したあとの記録
const TITLE_RULES = {
  first: (r, e) => reconciled(e.endingId),
  fate: (r, e) => e.endingId === 'fate',
  noMistake: (r, e) => reconciled(e.endingId) && e.mistakes === 0,
  amaenbo: (r, e) => reconciled(e.endingId) && e.personality === 'amaenbo',
  tsundere: (r, e) => reconciled(e.endingId) && e.personality === 'tsundere',
  bibiri: (r, e) => reconciled(e.endingId) && e.personality === 'bibiri',
  visitor: (r, e) => e.endingId === 'visitor',
  allCoats: (r) => COAT_KEYS.every((c) => r.dex[c] && r.dex[c].bestDay !== null),
  allStamps: (r) => COAT_KEYS.every((c) => r.dex[c] && ENDING_IDS.every((id) => r.dex[c].stamps.includes(id))),
  tenCats: (r) => r.metCount >= 10,
};

/**
 * エンディングを1件記録する。
 * ending: { name, coat, personality, endingId, day, mistakes, date }
 * @returns {{ records, newTitles: string[] }}
 */
export function addEnding(records, ending) {
  const { name, coat, personality, endingId, day, mistakes, date } = ending;
  const memory = { name, coat, personality, endingId, day, mistakes, date };
  const prev = records.dex[coat] ?? { stamps: [], bestDay: null };
  const bestDay = reconciled(endingId) && (prev.bestDay === null || day < prev.bestDay) ? day : prev.bestDay;
  const entry = { stamps: prev.stamps.includes(endingId) ? [...prev.stamps] : [...prev.stamps, endingId], bestDay };
  const next = {
    v: 1,
    memories: [memory, ...records.memories].slice(0, MEMORY_LIMIT),
    dex: { ...records.dex, [coat]: entry },
    titles: [...records.titles],
    metCount: records.metCount + 1,
  };
  const newTitles = TITLE_IDS.filter((id) => !next.titles.includes(id) && TITLE_RULES[id](next, memory));
  next.titles.push(...newTitles);
  return { records: next, newTitles };
}

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

// 1件の思い出として正しい形か
function validMemory(m) {
  return isObject(m)
    && typeof m.name === 'string'
    && COAT_KEYS.includes(m.coat)
    && PERSONALITY_IDS.includes(m.personality)
    && ENDING_IDS.includes(m.endingId)
    && isNumber(m.day)
    && isNumber(m.mistakes)
    && typeof m.date === 'string';
}

// 図鑑のうち、正しい形の毛色だけ残す。スタンプは知っているエンディングだけにして、重複を除く
function cleanDex(dex) {
  const out = {};
  for (const coat of COAT_KEYS) {
    const e = dex[coat];
    if (!isObject(e) || !Array.isArray(e.stamps) || !(e.bestDay === null || isNumber(e.bestDay))) continue;
    out[coat] = { stamps: [...new Set(e.stamps.filter((id) => ENDING_IDS.includes(id)))], bestDay: e.bestDay };
  }
  return out;
}

// 端末に保存した文字列を読む。全体の形が違うときは空の記録にし、中身の一部だけ壊れているときは
// その要素だけ捨てて残りの記録を守る（どちらでも遊べなくならないように）
export function parseRecords(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return emptyRecords();
  }
  if (!isObject(data) || data.v !== 1) return emptyRecords();
  const { memories, dex, titles, metCount } = data;
  if (!Array.isArray(memories) || !isObject(dex) || !Array.isArray(titles)) return emptyRecords();
  if (typeof metCount !== 'number' || !Number.isFinite(metCount) || metCount < 0) return emptyRecords();
  return {
    v: 1,
    memories: memories.filter(validMemory).slice(0, MEMORY_LIMIT),
    dex: cleanDex(dex),
    titles: [...new Set(titles.filter((id) => TITLE_IDS.includes(id)))],
    metCount,
  };
}
