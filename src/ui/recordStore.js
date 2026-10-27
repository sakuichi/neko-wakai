// ねこ手帳の記録の保存。保存はこの端末の中だけ（外部には送らない）。
// 使えない環境（保存が禁止されている・容量がいっぱいなど）でも、記録なしでそのまま遊べる
import { emptyRecords, parseRecords } from '../game/records.js';

export const RECORDS_KEY = 'neko-wakai:records';

export function loadRecords() {
  try {
    return parseRecords(localStorage.getItem(RECORDS_KEY));
  } catch {
    return emptyRecords();
  }
}

// 保存できたら true
export function saveRecords(records) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

// デバッグパネル用（遊ぶ人の画面には置かない）
export function clearRecords() {
  try {
    localStorage.removeItem(RECORDS_KEY);
  } catch {
    // 消せなくても遊べる
  }
}
