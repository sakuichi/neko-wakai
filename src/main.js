// 起動・ゲームループ・画面切替。
import { createGame, finishDay, chooseNight, chooseCat, chooseFace } from './game/progression.js';
import { createRng } from './util/rng.js';
import { createRenderer } from './render/renderer.js';
import { createInput } from './ui/input.js';
import { createOverlay } from './ui/overlay.js';
import { createHud } from './ui/hud.js';
import { createDebugPanel } from './ui/debugPanel.js';
import { createSound } from './ui/sound.js';
import { createMusic } from './ui/music.js';
import { createPauseMenu } from './ui/pauseMenu.js';
import { createTitleScene } from './scenes/titleScene.js';
import { createNameScene } from './scenes/nameScene.js';
import { createDayScene } from './scenes/dayScene.js';
import { createNightScene } from './scenes/nightScene.js';
import { createEndingScene } from './scenes/endingScene.js';
import { createNotebookScene } from './scenes/notebookScene.js';
import { addEnding, emptyRecords } from './game/records.js';
import { loadRecords, saveRecords, clearRecords } from './ui/recordStore.js';
import { SOUND_LABEL, PAUSE_TEXT } from './data/texts.js';

// 試作中はデバッグパネルを常に表示する。本番では ?debug=1 のときだけ表示する
const PROTOTYPE = true;
const SHOW_DEBUG = PROTOTYPE || new URLSearchParams(location.search).has('debug');

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const screenEl = $('screen');
const renderer = createRenderer(canvas);
const overlay = createOverlay($('overlay'), $('toast'), $('bubble'));
const sound = createSound();
const bgmBtn = $('bgm-btn');
const music = createMusic({ button: bgmBtn, titleEl: $('bgm-title') });
// 一時停止：昼と夜の画面だけで、右上の一時停止ボタン（#pause-btn）から開く。開いている間は scene.update を呼ばない
const pauseBtn = $('pause-btn');
pauseBtn.setAttribute('aria-label', PAUSE_TEXT.button);
const pauseMenu = createPauseMenu({
  el: $('pause'),
  // 一時停止中に押しかけたまばたき（Space）は、つづけても数えない
  onResume() {
    input.cancelHold();
  },
  // この猫とのプレイは途中でやめる（思い出には残さない）
  onQuit() {
    scene.stop?.();
    overlay.clear();
    hud.show(false);
    input.setBlinkEnabled(false);
    screenEl.replaceChildren();
    goTitle();
  },
});
// 開くときは、押しかけのまばたきも取り消す（閉じてから離しても、まばたきにしない）
function openPause() {
  pauseMenu.open();
  input.cancelHold();
}
pauseBtn.addEventListener('click', openPause);
const hud = createHud({ root: $('hud'), dayEl: $('hud-day'), barEl: $('hud-timer-bar'), blinkBtn: $('blink-btn') });
const input = createInput({
  canvas,
  blinkBtn: $('blink-btn'),
  toLogical: renderer.toLogical,
  // 一時停止中は、なでる・まばたきを通さない
  onPet: pauseMenu.whilePlaying((x, y) => scene.pet?.(x, y)),
  onBlink: pauseMenu.whilePlaying((action) => scene.act?.(action)),
});

// misses: 猫の様子ごとの失敗回数（ヒントを出すため。1回のプレイの間だけ覚える）
const session = { game: createGame(), misses: {} };
let rng = createRng(session.game.seed);
let scene;
// 試作中はデバッグパネルで性格・毛色を固定できる（null ならランダム。性格は毛色で決まる）
let fixedPersonality = null;
let fixedCoat = null;
// 顔の形も固定できる（null ならランダム）
let fixedFace = null;
// ねこ手帳の記録（端末の中に保存。src/ui/recordStore.js）
let records = loadRecords();

function goTitle() {
  overlay.clear();
  hud.show(false);
  // 一時停止はやめて、メニューも閉じる（デバッグの「最初から」などで、開いたまま場面が変わったとき）
  pauseBtn.hidden = true;
  pauseMenu.close();
  // BGM の切り替えは、はじめてから表示する
  bgmBtn.hidden = true;
  session.game = createGame({ ...chooseCat({ personality: fixedPersonality, coat: fixedCoat }), face: chooseFace(fixedFace ?? {}) });
  session.misses = {};
  rng = createRng(session.game.seed);
  showTitle();
}

// タイトルの画面だけを出す（ねこ手帳から戻るときは、次の猫を選び直さない）
function showTitle() {
  scene = createTitleScene({ screenEl, onStart: goName, onNotebook: goNotebook });
}

function goNotebook() {
  scene = createNotebookScene({ screenEl, records, onBack: showTitle });
}

function goName() {
  bgmBtn.hidden = false;
  scene = createNameScene({
    screenEl,
    coat: session.game.coat,
    // 同じ猫のままタイトルに戻る（BGM の切り替えはタイトルでは出さない）
    onBack() {
      bgmBtn.hidden = true;
      showTitle();
    },
    onDecide(name) {
      session.game = { ...session.game, catName: name };
      goDay();
    },
  });
}

function goDay() {
  pauseBtn.hidden = false;
  scene = createDayScene({
    session, overlay, hud, renderer, input, sound, rng,
    onEnd(result) {
      const r = finishDay(session.game, result);
      session.game = r.game;
      if (r.next === 'night') goNight(result.cat);
      else goEnding(r.endingId);
    },
  });
}

function goNight(lastCat) {
  pauseBtn.hidden = false;
  scene = createNightScene({
    screenEl, session, lastCat,
    onChoose(choice) {
      session.game = chooseNight(session.game, choice);
      goDay();
    },
  });
}

function goEnding(endingId) {
  overlay.clear();
  pauseBtn.hidden = true;
  pauseMenu.close();
  // ねこ手帳に思い出を残す（visitor の day は7日目）
  const g = session.game;
  const r = addEnding(records, { name: g.catName, coat: g.coat, face: g.face, personality: g.personality, endingId, day: g.day, mistakes: g.mistakes, date: today() });
  records = r.records;
  const saved = saveRecords(records);
  scene = createEndingScene({ screenEl, session, endingId, onRetry: goTitle, saved, newTitles: r.newTitles });
}

// この端末の日付 'YYYY-MM-DD'
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let debug = null;
// デバッグ用の倍速。ゲームの更新を1フレームに何回まわすか
let speed = 1;
if (SHOW_DEBUG) {
  debug = createDebugPanel($('debug'), {
    onPersonality(key) {
      fixedPersonality = key;
      session.game = { ...session.game, personality: key };
    },
    onFace(face) {
      fixedFace = face;
      session.game = { ...session.game, face };
    },
    onCoat(key) {
      fixedCoat = key;
      session.game = { ...session.game, coat: key };
    },
    onSkipDay: () => scene.skipDay?.(),
    onTrustMax: () => scene.trustMax?.(),
    onReset() {
      screenEl.replaceChildren();
      goTitle();
    },
    onSpeed(s) {
      speed = s;
    },
    onClearRecords() {
      clearRecords();
      records = emptyRecords();
    },
  });
}

// 効果音の ON/OFF（BGM の切り替えは src/ui/music.js）。ブラウザは操作の前に音を鳴らせないので、最初のタップで準備する
const soundBtn = $('sound-btn');
const showSound = () => {
  soundBtn.textContent = sound.enabled ? SOUND_LABEL.on : SOUND_LABEL.off;
};
showSound();
soundBtn.addEventListener('click', () => {
  sound.setEnabled(!sound.enabled);
  showSound();
});
for (const type of ['pointerdown', 'keydown']) {
  window.addEventListener(type, sound.unlock);
  window.addEventListener(type, music.unlock);
}

// ほかのアプリやタブに切り替えたら、昼と夜の画面では一時停止しておく（戻ったら「つづける」で再開）
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !pauseBtn.hidden && !pauseMenu.isOpen) openPause();
});

window.addEventListener('resize', renderer.resize);
renderer.resize();
goTitle();

let last = performance.now();
let debugAt = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  // 更新中に画面が切り替わったら、残りの回数は新しい画面で回さない
  const current = scene;
  if (!pauseMenu.isOpen) for (let i = 0; i < speed && scene === current; i++) scene.update(dt);
  renderer.draw({ personality: session.game.personality, coat: session.game.coat, face: session.game.face, ...scene.view() }, now / 1000, dt);
  if (debug && now - debugAt > 100) {
    debugAt = now;
    const s = scene.state?.() ?? {};
    debug.update({ personality: session.game.personality, coat: session.game.coat, face: session.game.face, scene: scene.name, mistakes: session.game.mistakes, ...s });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
