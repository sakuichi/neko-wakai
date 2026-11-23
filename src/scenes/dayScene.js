// 昼：猫との駆け引き。判定は src/game/ に任せ、ここでは時間・入力・表示をつなぐ。
import { startDay } from '../game/progression.js';
import { tick } from '../game/catBrain.js';
import { applyAction, isShy, isTimid } from '../game/rules.js';
import { createEventState, eventTick, eventAct, eventProp } from '../game/events.js';
import { PERSONALITIES, MAX_VALUE, DAYS, EVENTS } from '../data/params.js';
import { CARDS, TUTORIAL, FEEDBACK, DAY_TITLES, HINTS, LAP_TEXT, DERE_TEXT, TIMID_GONE_TEXT, EVENT_TEXT, withName } from '../data/texts.js';

// 膝に乗ってから結果画面に移るまでの演出時間（ふみふみ → ゴロゴロ → 寝る）
const LAP_SHOW_SEC = 6.5;
// 膝の上でゴロゴロが始まる時刻（src/render/renderer.js の onLap と合わせる）
const LAP_PURR_AT = 2.6;
// 同じ様子でこの回数失敗したら、ヒントを出す
const HINT_AFTER = 2;
// 説明・ヒントの吹き出しを出しておく時間（秒。説明は src/ui/overlay.js の bubble の決まりの長さ）
const BUBBLE_SEC = 5;
const HINT_SEC = 6;
// トーストを出しておく時間（ミリ秒）：イベントで起きたこと／ツンが取れた・手が平気になった
const EVENT_TOAST_MS = 1800;
const WARM_UP_TOAST_MS = 3200;

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
  // その日のイベントの進み具合（イベントのない日は null。終わったら done になり、いつもの日の動きに戻る）
  let ev = day.event ? createEventState(day.event) : null;
  // あとで出す予定のトースト（途中でやめたら取り消す）
  const timers = [];
  // イベントのトーストを出したら、その表示が終わる（eventToastUntil）まで、ツンが取れた・手が平気になったトーストを待たせる
  // （トーストは1つしか出せないので、同じ瞬間に出すとイベントのほうが消えてしまう）。時間はゲームの経過（elapsed）で数える
  let eventToastUntil = 0;
  // 読書の日：猫が本をのぞき込むのをやめたあと、この時刻（elapsed）までは、本のあった場所のタップを猫へのタッチにしない
  let bookGuardUntil = 0;
  const laterToasts = [];

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
  if (day.event) showCardOnce(`event:${day.event}`);
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
      // 本をのぞき込む姿（peekBook）は読書中の昼だけの姿。夜の画面には、膝の前でくつろいでいる姿として渡す
      cat: { mode: cat.mode === 'peekBook' ? 'relax' : cat.mode, distance: cat.distance, walking: !!cat.walking },
    });
  }

  function act(action) {
    if (ended || overlay.busy || cat.mode === 'lap') return;
    syncPersonality();
    // ヒントは、失敗したときの猫の様子で選ぶ（イベントで箱の中にいるときは、箱の中のヒント）
    const before = ev && !ev.done && ev.id === 'box' && ['hide', 'peek', 'happy'].includes(ev.phase) ? 'inBox' : cat.mode;
    const a = action.type === 'blink' ? { ...action, sawLook: sawLook || cat.mode === 'look' } : action;
    sawLook = false;
    const r = (ev && eventAct(a, ev, cat, day, personality())) || applyAction(a, cat, day, personality());
    if (r.ev) ev = r.ev;
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
      warmUpToast(text(DERE_TEXT));
    }
    if (!day.handsOk && !isTimid(day.trust, personality())) {
      day = { ...day, handsOk: true };
      warmUpToast(text(TIMID_GONE_TEXT));
    }
  }

  function warmUpToast(t) {
    if (elapsed < eventToastUntil) laterToasts.push({ at: eventToastUntil, text: t });
    else overlay.toast(t, WARM_UP_TOAST_MS);
  }

  function flushLaterToasts() {
    while (laterToasts.length > 0 && laterToasts[0].at <= elapsed + 1e-9) overlay.toast(laterToasts.shift().text, WARM_UP_TOAST_MS);
  }

  // いつもの日：様子の切り替え・移動（src/game/catBrain.js）。イベントが終わったあとも、これに戻る
  function updateCat(dt) {
    const r = tick(cat, day, personality(), dt, rng);
    cat = r.cat;
    day = r.day;
    let explained = false;
    if (r.enteredMode === 'lap') {
      enterLap();
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
  }

  // 膝に乗った（和解）。いつもの日も、読書中に本をのぞき込んだあと膝に乗ったときも同じ
  function enterLap() {
    hud.show(false);
    input.setBlinkEnabled(false);
    overlay.toast(text(LAP_TEXT), 3200);
  }

  // イベントの日：イベントの進行（src/game/events.js）。起きたことをトーストで知らせる
  function updateEvent(dt) {
    const prevMode = cat.mode;
    const wasDone = ev.done;
    const r = eventTick(ev, cat, day, personality(), dt, rng);
    ev = r.ev;
    cat = r.cat;
    day = r.day;
    for (const cue of r.cues) {
      const t = EVENT_TEXT[ev.id]?.[cue];
      if (t) {
        overlay.toast(text(t), EVENT_TOAST_MS);
        eventToastUntil = elapsed + EVENT_TOAST_MS / 1000;
      }
      // 鳥が去って・箱の中で見つめずにいてもらえて、ほっとした（いつもの「やり過ごせた」と同じ演出）
      if (cue === 'left' || cue === 'understood' || cue === 'watched') renderer.addEffect('relief');
    }
    if (ev.id === 'read' && ev.done && !wasDone) bookGuardUntil = elapsed + EVENTS.read.tapGuardSec;
    if (cat.mode === 'lap' && prevMode !== 'lap') enterLap();
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
      if (ev && !ev.done) updateEvent(dt);
      else updateCat(dt);
      if (input.holdMs() > 0 && cat.mode === 'look') sawLook = true;
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
      flushLaterToasts();
      hud.update(day);
      if (day.timeLeft <= 0) finish(false);
    },
    pet(x, y) {
      if (ended || overlay.busy) return;
      // 読書中は、本のタップでページをめくる（猫と重なっていても本を優先する。触ってミスにならないように）
      if (ev && !ev.done && ev.id === 'read' && ev.phase === 'read' && renderer.hitTestBook(x, y)) {
        ev = eventAct({ type: 'page' }, ev, cat, day, personality()).ev;
        sound.page();
        return;
      }
      // 猫が本をのぞき込んでいる間と、やめた直後は、本のあった場所のタップを猫へのタッチにしない（連打していた指で触ってしまわないように）
      const guarding = ev?.id === 'read' && (ev.done ? elapsed < bookGuardUntil : ev.phase === 'peekBook');
      if (guarding && renderer.inBookArea(x, y)) {
        renderer.addEffect('paw', { x, y });
        return;
      }
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
      // イベントの小道具（イベントのない日は null。src/render/props.js）
      prop: ev ? eventProp(ev) : null,
      // その日の進み具合 0〜1（窓の外の景色・部屋の明るさ。src/render/daylight.js）
      dayTime: Math.min(1, Math.max(0, 1 - day.timeLeft / DAYS[day.dayNumber - 1].durationSec)),
    }),
  };
}
