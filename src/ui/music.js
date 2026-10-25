// BGM の選曲。画面左下の曲名（横に流れる）をタップすると、次の曲 → … → OFF → 最初の曲 と切り替わる。
// 選んだ曲はどの画面でも流れ続ける。効果音（src/ui/sound.js）の ON/OFF とは別。
import { BGM_SONGS } from '../data/bgmSongs.js';
import { BGM_TEXT } from '../data/texts.js';
import { createBgm } from './bgm.js';

const STORAGE_KEY = 'neko-wakai:bgm';
export const BGM_OFF = 'off';
// BGM は、なでたときのゴロゴロより十分小さく（約17dB）する。測り方と数値は docs/spec.md 13.2
const VOLUME = 0.035;

export function nextTrack(current, ids) {
  const order = [...ids, BGM_OFF];
  return order[(order.indexOf(current) + 1) % order.length];
}

export function createMusic({ button, titleEl }) {
  const ids = BGM_SONGS.map((s) => s.id);
  let track = load(ids);
  let ac = null;
  let bgm = null;
  // 音の準備に失敗した（この環境では BGM を鳴らせない）
  let failed = false;

  // ブラウザは操作の前に音を鳴らせないので、最初のタップで準備して鳴らし始める
  // 音を準備できない環境（古いブラウザ・制限のある設定）では、一度だけ知らせて BGM なしでゲームを続ける。
  // 失敗したら作りかけの AudioContext は捨て、以後は作り直さない（タップのたびにエラーを出さない）
  function prepare() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      failed = true;
      return false;
    }
    try {
      ac = new AC();
      bgm = createBgm(ac, { volume: VOLUME });
      return true;
    } catch (e) {
      console.warn('BGM を準備できませんでした', e);
      failed = true;
      ac?.close?.().catch(() => {});
      ac = null;
      bgm = null;
      return false;
    }
  }

  function unlock() {
    if (track === BGM_OFF || failed) return;
    if (!ac && !prepare()) return;
    if (ac.state === 'suspended' && !document.hidden) resume();
    if (bgm.current !== track) bgm.play(BGM_SONGS.find((s) => s.id === track));
  }

  // resume / suspend は Promise を返す。失敗しても遊べるので、未処理のエラーにしない
  function resume() {
    ac.resume().catch(() => {});
  }

  function show() {
    const label = track === BGM_OFF ? BGM_TEXT.off : BGM_SONGS.find((s) => s.id === track).title;
    titleEl.textContent = label;
    button.setAttribute('aria-label', BGM_TEXT.aria(label));
    button.classList.toggle('off', track === BGM_OFF);
  }

  button.addEventListener('click', () => {
    track = nextTrack(track, ids);
    save(track);
    show();
    if (track === BGM_OFF) bgm?.stop();
    else unlock();
  });

  // 別のタブやアプリに切り替えている間は止めておく
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) ac.suspend().catch(() => {});
    else if (track !== BGM_OFF) resume();
  });

  show();
  return { unlock };
}

// 設定の保存はこの端末の中だけ（外部には送らない）。使えない環境では毎回最初の曲から始める
function load(ids) {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === BGM_OFF || ids.includes(v) ? v : ids[0];
  } catch {
    return ids[0];
  }
}

function save(v) {
  try {
    localStorage.setItem(STORAGE_KEY, v);
  } catch {
    // 保存できなくても遊べる
  }
}
