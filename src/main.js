// 起動・ゲームループ・画面切替。
import { createGame, finishDay, chooseNight, chooseCat } from './game/progression.js';
import { createRng } from './util/rng.js';
import { createRenderer } from './render/renderer.js';
import { createInput } from './ui/input.js';
import { createOverlay } from './ui/overlay.js';
import { createHud } from './ui/hud.js';
import { createDebugPanel } from './ui/debugPanel.js';
import { createSound } from './ui/sound.js';
import { createMusic } from './ui/music.js';
import { createTitleScene } from './scenes/titleScene.js';
import { createNameScene } from './scenes/nameScene.js';
import { createDayScene } from './scenes/dayScene.js';
import { createNightScene } from './scenes/nightScene.js';
import { createEndingScene } from './scenes/endingScene.js';
import { SOUND_LABEL } from './data/texts.js';

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
const hud = createHud({ root: $('hud'), dayEl: $('hud-day'), barEl: $('hud-timer-bar'), blinkBtn: $('blink-btn') });
const input = createInput({
  canvas,
  blinkBtn: $('blink-btn'),
  toLogical: renderer.toLogical,
  onPet: (x, y) => scene.pet?.(x, y),
  onBlink: (action) => scene.act?.(action),
});

// misses: 猫の様子ごとの失敗回数（ヒントを出すため。1回のプレイの間だけ覚える）
const session = { game: createGame(), misses: {} };
let rng = createRng(session.game.seed);
let scene;
// 試作中はデバッグパネルで性格・毛色を固定できる（null ならランダム。性格は毛色で決まる）
let fixedPersonality = null;
let fixedCoat = null;

function goTitle() {
  overlay.clear();
  hud.show(false);
  // BGM の切り替えは、はじめてから表示する
  bgmBtn.hidden = true;
  session.game = createGame(chooseCat({ personality: fixedPersonality, coat: fixedCoat }));
  session.misses = {};
  rng = createRng(session.game.seed);
  scene = createTitleScene({ screenEl, onStart: goName });
}

function goName() {
  bgmBtn.hidden = false;
  scene = createNameScene({
    screenEl,
    coat: session.game.coat,
    onDecide(name) {
      session.game = { ...session.game, catName: name };
      goDay();
    },
  });
}

function goDay() {
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
  scene = createEndingScene({ screenEl, session, endingId, onRetry: goTitle });
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
  for (let i = 0; i < speed && scene === current; i++) scene.update(dt);
  renderer.draw({ personality: session.game.personality, coat: session.game.coat, ...scene.view() }, now / 1000, dt);
  if (debug && now - debugAt > 100) {
    debugAt = now;
    const s = scene.state?.() ?? {};
    debug.update({ personality: session.game.personality, coat: session.game.coat, scene: scene.name, mistakes: session.game.mistakes, ...s });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
