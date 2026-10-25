// 昼：猫との駆け引き。判定は src/game/ に任せ、ここでは時間・入力・表示をつなぐ。
import { startDay } from '../game/progression.js';
import { tick } from '../game/catBrain.js';
import { applyAction } from '../game/rules.js';
import { PERSONALITIES, MAX_VALUE } from '../data/params.js';
import { CARDS, TUTORIAL, FEEDBACK, DAY_TITLES, HINTS, LAP_TEXT, withName } from '../data/texts.js';

// 膝に乗ってから結果画面に移るまでの演出時間（ふみふみ → ゴロゴロ → 寝る）
const LAP_SHOW_SEC = 6.5;
// 膝の上でゴロゴロが始まる時刻（src/render/renderer.js の onLap と合わせる）
const LAP_PURR_AT = 2.6;
// 同じ様子でこの回数失敗したら、ヒントを出す
const HINT_AFTER = 2;

export function createDayScene({ session, overlay, hud, renderer, input, sound, rng, onEnd }) {
  const start = startDay(session.game);
  let { day, cat } = start;
  const startDistance = cat.distance;
  let elapsed = 0;
  let lapTime = 0;
  let ended = false;
  // まばたきボタンを押している間に、一度でも目が合ったか
  let sawLook = false;
  const tut = { wait: false, approach: false, flee: false };

  const personality = () => PERSONALITIES[session.game.personality];
  const text = (s) => withName(s, session.game.catName);
  const textCard = (c) => ({ title: text(c.title), body: text(c.body) });

  function showCardOnce(key) {
    const card = CARDS[key];
    if (!card || session.game.seenCards.includes(key)) return;
    session.game = { ...session.game, seenCards: [...session.game.seenCards, key] };
    if (card.pause) overlay.card(textCard(card));
    else overlay.bubble(textCard(card));
  }

  // 同じ失敗を繰り返したら、1回だけヒントを出す
  function countMiss(key) {
    session.misses[key] = (session.misses[key] ?? 0) + 1;
    if (session.misses[key] === HINT_AFTER && HINTS[key]) overlay.bubble(textCard(HINTS[key]), 6000);
  }

  overlay.splash(`${day.dayNumber}日目`, DAY_TITLES[day.dayNumber]);
  if (day.dayNumber === 1) showCardOnce('day:intro');
  for (const a of start.newActions) showCardOnce(`action:${a}`);
  if (day.canLap) showCardOnce('day:lap');
  hud.show(true);
  hud.update(day);
  input.setBlinkEnabled(day.actions.includes('blink'));

  function finish(lapped) {
    if (ended) return;
    ended = true;
    hud.show(false);
    input.setBlinkEnabled(false);
    onEnd({ lapped, trust: day.trust, mistakes: day.mistakes, cat: { mode: cat.mode, distance: cat.distance, walking: !!cat.walking } });
  }

  function act(action) {
    if (ended || overlay.busy || cat.mode === 'lap') return;
    const before = cat.mode;
    const a = action.type === 'blink' ? { ...action, sawLook: sawLook || cat.mode === 'look' } : action;
    sawLook = false;
    const r = applyAction(a, cat, day, personality());
    cat = r.cat;
    day = r.day;
    if (r.feedback) {
      overlay.toast(FEEDBACK[r.feedback], 1600);
      renderer.addEffect(r.feedback);
      playSound(r.feedback);
    }
    if (r.mistake) countMiss(before);
    if (r.feedback === 'stare') countMiss('stare');
    if (r.mistake && day.dayNumber === 1 && !tut.flee) {
      tut.flee = true;
      setTimeout(() => overlay.toast(TUTORIAL.flee, 3200), 1300);
    }
  }

  function playSound(feedback) {
    if (feedback === 'purr') sound.purr();
    else if (feedback === 'blinkBack') sound.chime();
    else if (feedback === 'flee' || feedback === 'kick') sound.bump();
  }

  return {
    name: 'day',
    update(dt) {
      if (ended || overlay.busy) return;
      if (cat.mode === 'lap') {
        const prev = lapTime;
        lapTime += dt;
        if (prev < LAP_PURR_AT && lapTime >= LAP_PURR_AT) sound.purr(2.4, 1.2);
        if (lapTime >= LAP_SHOW_SEC) finish(true);
        return;
      }
      elapsed += dt;
      const r = tick(cat, day, personality(), dt, rng);
      cat = r.cat;
      day = r.day;
      if (input.holdMs() > 0 && cat.mode === 'look') sawLook = true;
      if (r.enteredMode === 'lap') {
        hud.show(false);
        input.setBlinkEnabled(false);
        overlay.toast(text(LAP_TEXT), 3200);
      } else if (r.enteredMode) {
        showCardOnce(`sign:${r.enteredMode}`);
      }
      if (day.dayNumber === 1) {
        if (!tut.wait && elapsed > 3) {
          tut.wait = true;
          overlay.toast(TUTORIAL.wait, 3800);
        }
        if (!tut.approach && cat.distance < startDistance - 4) {
          tut.approach = true;
          overlay.toast(text(TUTORIAL.approach), 2600);
        }
      }
      hud.update(day);
      if (day.timeLeft <= 0) finish(false);
    },
    pet(x, y) {
      if (ended || overlay.busy) return;
      if (!renderer.hitTestCat(x, y)) {
        // 猫以外をタップしたときは、足あとだけ残す（タップが届いていることがわかるように）
        renderer.addEffect('paw', { x, y });
        return;
      }
      renderer.addEffect('reach');
      act({ type: 'pet' });
    },
    act,
    skipDay: () => finish(false),
    trustMax() {
      day = { ...day, trust: MAX_VALUE };
    },
    state: () => ({ day, cat }),
    view: () => ({
      scene: 'day',
      cat,
      lapTime,
      blinkHoldMs: input.holdMs(),
      wariness: day.wariness,
    }),
  };
}
