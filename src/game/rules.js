// プレイヤーの行動（なでる・まばたき）を判定する。描画や入力には依存しない。
import { RULES, MAX_VALUE } from '../data/params.js';

const clamp = (v) => Math.min(MAX_VALUE, Math.max(0, v));

// 不正解のなで方 → 上がる警戒
const WRONG_PET_WARINESS = {
  relax: RULES.pet.relaxWariness,
  look: RULES.pet.relaxWariness,
  backTurn: RULES.pet.relaxWariness,
  tailFlick: RULES.pet.tailFlickWariness,
  belly: RULES.pet.bellyWariness,
  fakeRub: RULES.pet.fakeRubWariness,
};

// なでると猫キックが返ってくる様子
const KICK_MODES = ['belly', 'fakeRub'];

/**
 * @returns {{cat, day, feedback: 'flee'|'kick'|'hide'|'stare'|'blinkBack'|'blinkAway'|'purr'|'timid'|'tooFar'|null, mistake: boolean}}
 */
// action: { type: 'pet' } または { type: 'blink', holdMs, sawLook }（sawLook = 押している間に目が合ったか）
export function applyAction(action, cat, day, personality) {
  const none = { cat, day, feedback: null, mistake: false };
  if (!day.actions.includes(action.type)) return none;

  if (action.type === 'blink') {
    const slow = action.holdMs >= RULES.blink.minHoldMs && action.holdMs <= RULES.blink.maxHoldMs;
    if (!slow || cat.mode === 'lap') return none;
    // 押している間に一度でも目が合っていれば成功（離す前に様子が変わっても失敗にしない）
    const eyeContact = cat.mode === 'look' || action.sawLook;
    if (!eyeContact) {
      // 目が合っていないのに見つめてくる人は、ちょっと落ち着かない
      return {
        cat,
        day: { ...day, wariness: clamp(day.wariness + RULES.blink.missWariness * personality.warinessMul) },
        feedback: 'stare',
        mistake: false,
      };
    }
    const relaxed = { ...cat, mode: 'relax', modeTimeLeft: RULES.modeSec.relax[0] };
    if (isShy(day.trust, personality, day.dere)) {
      // ツンの間は、見つめ合うと照れて目をそらす。焦って手を出したわけではないので、ミスには数えない
      return { cat: relaxed, day: { ...day, trust: clamp(day.trust - RULES.blink.shyPenalty) }, feedback: 'blinkAway', mistake: false };
    }
    return {
      cat: relaxed,
      day: gainTrust(day, RULES.blink.trust * personality.likes.blink * blinkReach(cat.distance)),
      feedback: 'blinkBack',
      mistake: false,
    };
  }

  // 以下は pet
  if (cat.mode === 'rub') {
    return petted(cat, day, RULES.pet.rubTrust, personality);
  }
  if (cat.mode === 'tailUp') {
    if (cat.distance > RULES.pet.tailUpReach) return { ...none, feedback: 'tooFar' };
    return petted(cat, day, RULES.pet.tailUpTrust, personality);
  }
  if (cat.mode === 'inBox') {
    return {
      cat,
      day: scare(day, RULES.pet.relaxWariness, personality),
      feedback: 'hide',
      mistake: true,
    };
  }
  const wariness = WRONG_PET_WARINESS[cat.mode];
  if (wariness === undefined) return none; // flee / purr / lap 中は何も起きない
  return {
    cat: { ...cat, mode: 'flee', modeTimeLeft: RULES.fleeSec, distance: clamp(cat.distance + RULES.fleeDistance) },
    day: scare(day, wariness, personality),
    feedback: KICK_MODES.includes(cat.mode) ? 'kick' : 'flee',
    mistake: true,
  };
}

// 手がこわい猫（timidHands）は、信頼が timidUntil 未満の間、なでられるとビクビクする。
// handsOk：一度平気になったら、焦って触って信頼が下がっても、もうこわがらない
export function isTimid(trust, personality, handsOk = false) {
  return !handsOk && !!personality.timidHands && trust < personality.timidUntil;
}

// 信頼が性格の shyUntil 未満の間は、まばたきに照れる（ツン）
// dere：一度デレたら、焦って触って信頼が下がっても、もうツンには戻らない
export function isShy(trust, personality, dere = false) {
  return !dere && trust < (personality.shyUntil ?? 0);
}

// 遠くからのまばたきは、近くからより効きにくい
function blinkReach(distance) {
  const { from, min } = RULES.blink.far;
  if (distance <= from) return 1;
  return Math.max(min, 1 - ((1 - min) * (distance - from)) / (MAX_VALUE - from));
}

function gainTrust(day, amount) {
  return { ...day, trust: clamp(day.trust + amount * day.trustRate) };
}

// 焦って触った（ミス）。警戒が上がり、信頼も減る（RULES.mistakeTrust）
function scare(day, amount, personality) {
  return {
    ...day,
    trust: clamp(day.trust - RULES.mistakeTrust),
    wariness: clamp(day.wariness + amount * personality.warinessMul),
    mistakes: day.mistakes + 1,
  };
}

// なでて喜ばれた（すり寄り・しっぽピン）。手がこわい猫（timidHands）は、信頼が timidUntil になるまでは、
// なでさせてはくれるが、ゴロゴロではなくビクビクする（効きは likes.pet 倍）。平気になったら、ふつうに効く
function petted(cat, day, amount, personality) {
  const timid = isTimid(day.trust, personality, day.handsOk);
  const mul = personality.timidHands && !timid ? 1 : personality.likes.pet;
  return purr(cat, gainTrust(day, amount * mul), timid);
}

function purr(cat, day, timid) {
  return {
    cat: { ...cat, mode: 'purr', modeTimeLeft: RULES.purrSec },
    day,
    feedback: timid ? 'timid' : 'purr',
    mistake: false,
  };
}
