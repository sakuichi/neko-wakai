// 昼：猫との駆け引き。判定は src/game/ に任せ、ここでは時間・入力・表示をつなぐ。
import { startDay } from '../game/progression.js';
import { tick } from '../game/catBrain.js';
import { applyAction, isShy, isTimid } from '../game/rules.js';
import { PERSONALITIES, MAX_VALUE, DAYS } from '../data/params.js';
import { CARDS, TUTORIAL, FEEDBACK, DAY_TITLES, HINTS, LAP_TEXT, DERE_TEXT, TIMID_GONE_TEXT, withName } from '../data/texts.js';

// 膝に乗ってから結果画面に移るまでの演出時間（ふみふみ → ゴロゴロ → 寝る）
const LAP_SHOW_SEC = 6.5;
// 膝の上でゴロゴロが始まる時刻（src/render/renderer.js の onLap と合わせる）
const LAP_PURR_AT = 2.6;
// 同じ様子でこの回数失敗したら、ヒントを出す
const HINT_AFTER = 2;
// 説明・ヒントの吹き出しを出しておく時間（秒。説明は src/ui/overlay.js の bubble の決まりの長さ）
const BUBBLE_SEC = 5;
const HINT_SEC = 6;

// 猫の反応（feedback）ごとに鳴らす効果音（src/ui/sound.js のメソッド名）
const SOUNDS = { purr: ['purr'], blinkBack: ['meow'], flee: ['bump'], kick: ['bump'] };
export function soundsFor(feedback) {
  return SOUNDS[feedback] ?? [];
}

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
  // 説明・ヒントの吹き出しが出ている間（昼の経過時間で、この時刻まで）。我慢の説明で消さないように使う
  let bubbleUntil = 0;
  // あとで出す予定のトースト（途中でやめたら取り消す）
  const timers = [];

  const personality = () => PERSONALITIES[session.game.personality];
  const text = (s) => withName(s, session.game.catName);
  const textCard = (c) => ({ title: text(c.title), body: text(c.body) });

  // 出したら true
  function showCardOnce(key) {
    const card = CARDS[key];
    if (!card || session.game.seenCards.includes(key)) return false;
    session.game = { ...session.game, seenCards: [...session.game.seenCards, key] };
    if (card.pause) overlay.card(textCard(card));
    else {
      overlay.bubble(textCard(card));
      bubbleUntil = elapsed + BUBBLE_SEC;
    }
    return true;
  }

  // 同じ失敗を繰り返したら、1回だけヒントを出す
  function countMiss(key) {
    session.misses[key] = (session.misses[key] ?? 0) + 1;
    if (session.misses[key] === HINT_AFTER && HINTS[key]) {
      overlay.bubble(textCard(HINTS[key]), HINT_SEC * 1000);
      bubbleUntil = elapsed + HINT_SEC;
    }
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
    syncPersonality();
    hud.show(false);
    input.setBlinkEnabled(false);
    onEnd({
      lapped,
      trust: day.trust,
      mistakes: day.mistakes,
      dere: day.dere,
      handsOk: day.handsOk,
      cat: { mode: cat.mode, distance: cat.distance, walking: !!cat.walking },
    });
  }

  function act(action) {
    if (ended || overlay.busy || cat.mode === 'lap') return;
    syncPersonality();
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
    if (r.feedback === 'blinkAway') countMiss('blinkAway');
    checkWarmUp();
    if (r.mistake && day.dayNumber === 1 && !tut.flee) {
      tut.flee = true;
      timers.push(setTimeout(() => overlay.toast(TUTORIAL.flee, 3200), 1300));
    }
  }

  // ツンがとれた・手が平気になった瞬間（信頼が shyUntil・timidUntil をまたいだとき）に、それぞれ1回だけ知らせる。
  // 覚えておき（day.dere・day.handsOk）、焦って触って信頼が下がっても戻さない
  // デバッグで性格を切り替えたら、デレた・手が平気になったかを、新しい性格と今の信頼で決め直す（トーストは出さない）
  let personalityKey = session.game.personality;
  function syncPersonality() {
    if (session.game.personality === personalityKey) return;
    personalityKey = session.game.personality;
    day = { ...day, dere: !isShy(day.trust, personality()), handsOk: !isTimid(day.trust, personality()) };
  }

  function checkWarmUp() {
    if (!day.dere && !isShy(day.trust, personality())) {
      day = { ...day, dere: true };
      overlay.toast(text(DERE_TEXT), 3200);
    }
    if (!day.handsOk && !isTimid(day.trust, personality())) {
      day = { ...day, handsOk: true };
      overlay.toast(text(TIMID_GONE_TEXT), 3200);
    }
  }

  function playSound(feedback) {
    for (const name of soundsFor(feedback)) sound[name]();
  }

  return {
    name: 'day',
    update(dt) {
      if (ended) return;
      // 説明カードの表示中に性格を切り替えても、すぐ決め直す
      syncPersonality();
      if (overlay.busy) return;
      if (cat.mode === 'lap') {
        const prev = lapTime;
        lapTime += dt;
        if (prev < LAP_PURR_AT && lapTime >= LAP_PURR_AT) sound.purr(2.4, 1.9);
        if (lapTime >= LAP_SHOW_SEC) finish(true);
        return;
      }
      elapsed += dt;
      const r = tick(cat, day, personality(), dt, rng);
      cat = r.cat;
      day = r.day;
      if (input.holdMs() > 0 && cat.mode === 'look') sawLook = true;
      let explained = false;
      if (r.enteredMode === 'lap') {
        hud.show(false);
        input.setBlinkEnabled(false);
        overlay.toast(text(LAP_TEXT), 3200);
      } else if (r.enteredMode) {
        explained = showCardOnce(`sign:${r.enteredMode}`);
      }
      // 触ると失敗するサインを、触らずにやり過ごせた。膝に乗った瞬間は、膝に乗った文だけを見せる。
      // 新しいサインの説明が同じときに出たり、説明・ヒントの吹き出しがまだ出ていたりしたら、
      // 我慢の説明はそれを消さないように次の機会に回す
      if (r.endured && r.enteredMode !== 'lap') {
        overlay.toast(FEEDBACK.relief, 1600);
        renderer.addEffect('relief');
        if (!explained && elapsed >= bubbleUntil) showCardOnce('tip:patience');
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
      checkWarmUp();
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
    // 一時停止メニューから途中でやめたとき：一日を終えず（onEnd を呼ばず）、予約していたトーストも出さない
    stop() {
      ended = true;
      for (const t of timers) clearTimeout(t);
    },
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
      // ツンの間か（ツンデレの見た目を変える。src/render/renderer.js の personalize）
      shy: isShy(day.trust, personality(), day.dere),
      // その日の進み具合 0〜1（窓の外の景色・部屋の明るさ。src/render/daylight.js）
      dayTime: Math.min(1, Math.max(0, 1 - day.timeLeft / DAYS[day.dayNumber - 1].durationSec)),
    }),
  };
}
