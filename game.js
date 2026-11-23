// このファイルは tools/build.js が src/ から自動生成する。直接編集しない（npm run build）。
(() => {
'use strict';
const __modules = {};

// ---- src/data/params.js
__modules['src/data/params.js'] = (() => {
  // ゲームの数値はすべてここに置く。調整はこのファイルだけで行う。
  // 値の意味は docs/spec.md の 4〜9章を参照。

  const MAX_VALUE = 100;
  const MAX_DAY = 7;

  const RULES = {
    // 待っている間、警戒は1秒ごとにこれだけ下がる
    warinessDecayPerSec: 5,
    // 警戒がこれ未満のとき、猫は近づき、落ち着いて一緒にいる分だけ信頼が増える
    calmThreshold: 30,
    // 待つだけで和解できないように、低めにしている（難易度の調整。docs/spec.md 6.0）
    calmTrustPerSec: 0.18,
    // 背中を向けて座っている間、1秒ごとに増える信頼
    backTurnTrustPerSec: 0.8,
    // 触ると失敗するサイン（お腹見せ・しっぽパタパタ・気まぐれすりすり）を、触らずにやり過ごせたら増える信頼
    patienceTrust: 2,

    // 距離の下限は「100 − 信頼 − この値」。信頼が低くても、ある程度までは近づいてくる
    distanceFloorOffset: 30,
    // 下限に着いて座った猫が、また歩き出すまでの余裕（下限がこれだけ下がったら歩く）。
    // 毎フレーム少しずつ寄ると、止まったまま足踏みして見えるので、まとめて歩かせる（信頼 0.25/秒 なら約16秒ごと。我慢やまばたきで信頼が増えると、すぐ歩く）
    walkResumeGap: 4,

    // missWariness: 目が合っていないのにゆっくりまばたきしたときの警戒（連打対策）
    // shyPenalty: ツンの間（信頼が性格の shyUntil 未満）にまばたきしたとき、照れて減る信頼
    // far: 猫までの距離が from より遠いと、まばたきの効きが下がる（距離100で min 倍。そのあいだは直線）
    blink: { minHoldMs: 500, maxHoldMs: 2000, trust: 6, missWariness: 8, shyPenalty: 3, far: { from: 50, min: 0.5 } },

    pet: {
      rubTrust: 10,
      tailUpTrust: 5,
      tailUpReach: 40,
      relaxWariness: 20,
      tailFlickWariness: 30,
      bellyWariness: 40,
      fakeRubWariness: 30,
    },

    // すり寄り（とそのフェイント）は、この距離以下でしか出ない
    rubMaxDistance: 30,
    // すり寄りを放っておくと、猫はこれだけ離れる
    rubIgnoredDistance: 10,

    // 焦って触った（ミス）ときに減る信頼。焦らない人ほど早く仲良くなれるように（trustRate はかけない）。焦ってばかりだと通い猫になるくらい重くしている
    mistakeTrust: 15,

    fleeDistance: 25,
    fleeSec: 1,
    purrSec: 2,

    // 猫の様子ごとの継続時間 [最短, 最長] 秒
    modeSec: {
      relax: [3, 5],
      look: [2.5, 3],
      tailUp: [2, 3],
      tailFlick: [2, 3],
      belly: [2, 3],
      backTurn: [3, 4],
      rub: [2, 2],
      fakeRub: [2, 2],
    },
    // 不機嫌なほど、しっぽパタパタが出やすくなる（重み × (1 + 警戒 / この値)）
    tailFlickWarinessScale: 50,
  };

  const DAY3_SIGNS = ['relax', 'look', 'tailUp', 'tailFlick', 'belly', 'backTurn', 'rub'];
  // 4日目からは、すり寄りに見せかけたフェイントが加わる
  const LATE_SIGNS = [...DAY3_SIGNS, 'fakeRub'];

  // イベントの日（7章）。ゲームの始めに、イベントをこの日のどれかに1つずつ割り当てる（src/game/progression.js の chooseEvents）
  const EVENT_DAYS = [4, 5, 6];

  // イベントごとの数値（進め方は src/game/events.js）
  const EVENTS = {
    // 箱が届いた：猫が箱の位置（boxDistance）まで来ると箱が置かれ、もぐる。もぐる長さは hideSec の範囲、顔を出すのは peekSec。
    // 顔を出したときに blinksToFinish 回まばたきが通じると、箱から出てくる（ごほうび doneTrust）。箱の中で触られたら afterPetHideSec は顔を出さない
    // ツンの間（まばたきに照れる）は、顔を出したときに、まばたきせずに見送れたら1回と数える
    // 箱から出てくるのが遅いと、その日のうちに膝まで来られず、和解が1日遅れやすい。出てくるまでを20秒台に収めている（docs/spec.md 7章）
    box: { boxDistance: 45, arriveSec: 1.6, hopSec: 0.6, hideSec: [2, 3.5], peekSec: 2.8, happySec: 2, afterPetHideSec: 5, blinksToFinish: 2, doneTrust: 8 },
    // 窓の外に鳥：猫が窓の前（birdDistance）まで来ると背中を向け、鳥が来る（arriveSec）→狩り（huntSec の範囲）→鳥が去る（leaveSec）→
    // 振り向く（turnSec。まばたきが通じたら happySec ゴロゴロ）。これを rounds 回で終わり。まばたきしなくても終わる。
    // 狩りを最初に最後まで見守れた回に、その場でごほうび doneTrust（2回目以降は、いつもの我慢のごほうびだけ）
    bird: { birdDistance: 45, arriveSec: 1.6, huntSec: [3, 4], leaveSec: 1.2, turnSec: 2.5, happySec: 1, rounds: 2, doneTrust: 6 },
    // 読書中：ページをめくってから readSec の間は「読んでいる」。その間だけ、いつもの距離の下限を気にせず readSpeed で近づく。
    // 膝の前（距離0）まで来たら、本をのぞき込む（ごほうび doneTrust。膝には乗らない）。onBookSec たったら、いつもの日に戻る（信頼100なら、そのまま膝に乗って和解）
    // のぞき込んでいる間と、やめてから tapGuardSec の間は、本のあった場所のタップを猫へのタッチにしない（ページを連打していた指で、うっかり触らないように）
    read: { readSec: 2.5, readSpeed: 6, onBookSec: 4, doneTrust: 6, tapGuardSec: 1 },
  };

  // trustMul：その日の信頼の増え方の倍率（書いていない日は1）。1〜2日目は最初の出会いが大事なので、少し増えやすい
  // lapTrust：膝に乗る信頼（書いていない日は MAX_VALUE）。3日目は「運命の日」で、少し手前でも乗ってくれる
  // この2つで、うまい人がときどき（1割ほど）3日目に和解できるようにしている（docs/spec.md 6.0）
  const DAYS = [
    { day: 1, durationSec: 40, startWariness: 35, actions: ['pet'], signs: ['relax'], canLap: false, approachMul: 1, trustMul: 1.2 },
    { day: 2, durationSec: 40, startWariness: 45, actions: ['pet', 'blink'], signs: ['relax', 'look', 'tailUp', 'tailFlick'], canLap: false, approachMul: 1, trustMul: 1.2 },
    { day: 3, durationSec: 40, startWariness: 40, actions: ['pet', 'blink'], signs: DAY3_SIGNS, canLap: true, approachMul: 1, lapTrust: 85 },
    { day: 4, durationSec: 40, startWariness: 40, actions: ['pet', 'blink'], signs: LATE_SIGNS, canLap: true, approachMul: 1 },
    { day: 5, durationSec: 40, startWariness: 40, actions: ['pet', 'blink'], signs: LATE_SIGNS, canLap: true, approachMul: 1 },
    { day: 6, durationSec: 40, startWariness: 40, actions: ['pet', 'blink'], signs: LATE_SIGNS, canLap: true, approachMul: 1 },
    { day: 7, durationSec: 45, startWariness: 30, actions: ['pet', 'blink'], signs: LATE_SIGNS, canLap: true, approachMul: 1.5 },
  ];

  // 昼の景色の時間帯（昼の進み具合 0〜1 で）。0〜noonAt で朝→昼、eveningFrom〜eveningAt で昼→夕方に変わる。
  // 40秒の日なら、8秒で昼になり、残り14秒から夕焼けが始まり、残り8秒で夕方になる（色は src/render/daylight.js）
  const DAYLIGHT = { noonAt: 0.2, eveningFrom: 0.65, eveningAt: 0.8 };

  // 猫の顔の種類（猫ごとにランダムで選ぶ）。形そのものは src/render/renderer.js の FACE_SHAPES・EAR_SIZES
  const FACES = {
    shapes: ['mochi', 'maru', 'shimobukure', 'hoppe'],
    ears: ['small', 'normal', 'big'],
  };

  const NIGHT = {
    // おやつを置くと、その場で信頼が増える。代わりに翌日の信頼の増え方が下がる
    treatTrust: 8,
    treatTrustRate: 0.85,
    // おやつの翌日の、開始時の警戒（落ち着きの境目より低いので、すぐ動き出す）
    treatStartWariness: 0,
    // おやつの日は、距離の下限がこれだけ近くなる
    treatFloorBonus: 20,
    nothingTrust: 3,
  };

  // approachSpeed：くつろぎで歩いている間に、1秒で近づく距離（座っている間は近づかない）
  // likes：行動ごとの信頼の増え方の倍率。pet＝なでる（しっぽピン・すり寄り）、blink＝ゆっくりまばたき、patience＝我慢のごほうびと背中を向けている間
  // shyUntil：信頼がこれ未満の間は、まばたきすると照れて逆効果（ツン）。0 ならツンはない
  // timidHands：なでられても、手がこわくてビクビクする（反応が「ゴロゴロ」ではなく「ビクビク」になる。信頼の増え方は likes.pet）
  // timidUntil：timidHands の猫は、信頼がこれ以上になると手が平気になる（ゴロゴロに戻り、なでる効きもふつう＝×1）
  const PERSONALITIES = {
    amaenbo: {
      label: '甘えん坊',
      approachSpeed: 16,
      warinessMul: 0.7,
      treatDistance: 30,
      boxLockSec: 5,
      likes: { pet: 1.6, blink: 0.5, patience: 0.3 },
      shyUntil: 0,
      signWeights: { relax: 3, look: 2, tailUp: 2, tailFlick: 1, belly: 1, backTurn: 1, rub: 3, fakeRub: 1 },
    },
    tsundere: {
      label: 'ツンデレ',
      approachSpeed: 10,
      warinessMul: 1.0,
      treatDistance: 10,
      boxLockSec: 5,
      likes: { pet: 1.2, blink: 1.6, patience: 1.5 },
      shyUntil: 33,
      signWeights: { relax: 3, look: 2, tailUp: 1, tailFlick: 1, belly: 3, backTurn: 1, rub: 1, fakeRub: 2 },
    },
    bibiri: {
      label: 'ビビり',
      approachSpeed: 8,
      warinessMul: 1.3,
      treatDistance: 20,
      boxLockSec: 3,
      likes: { pet: 0.5, blink: 1.3, patience: 1 },
      shyUntil: 0,
      timidHands: true,
      timidUntil: 50,
      // 目を合わせるのが苦手なので、こっちを見る（チラッ）が出にくい
      signWeights: { relax: 3, look: 1, tailUp: 1, tailFlick: 2.5, belly: 1, backTurn: 1, rub: 1, fakeRub: 1 },
    },
  };

  const DEFAULT_PERSONALITY = 'tsundere';

  // 毛色と性格の対応。「茶トラは甘えん坊」など、よく言われる柄と性格の話に合わせる（言い伝えは src/data/texts.js の COAT_LORE）
  // 毛色のキーは src/render/renderer.js の COATS
  const COAT_PERSONALITY = {
    chatora: 'amaenbo',
    cream: 'amaenbo',
    shiro: 'tsundere',
    sabatora: 'tsundere',
    kijitora: 'bibiri',
    kuro: 'bibiri',
  };
  return { MAX_VALUE, MAX_DAY, RULES, EVENT_DAYS, EVENTS, DAYS, DAYLIGHT, FACES, NIGHT, PERSONALITIES, DEFAULT_PERSONALITY, COAT_PERSONALITY };
})();

// ---- src/game/rules.js
__modules['src/game/rules.js'] = (() => {
  // プレイヤーの行動（なでる・まばたき）を判定する。描画や入力には依存しない。
  const { RULES, MAX_VALUE } = __modules['src/data/params.js'];

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
  function applyAction(action, cat, day, personality) {
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
  function isTimid(trust, personality, handsOk = false) {
    return !handsOk && !!personality.timidHands && trust < personality.timidUntil;
  }

  // 信頼が性格の shyUntil 未満の間は、まばたきに照れる（ツン）
  // dere：一度デレたら、焦って触って信頼が下がっても、もうツンには戻らない
  function isShy(trust, personality, dere = false) {
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
  return { applyAction, isTimid, isShy };
})();

// ---- src/game/progression.js
__modules['src/game/progression.js'] = (() => {
  // 日の進行・夜の選択の効果・エンディング判定。描画や入力には依存しない。
  const { DAYS, NIGHT, PERSONALITIES, MAX_DAY, MAX_VALUE, DEFAULT_PERSONALITY, COAT_PERSONALITY, FACES, EVENTS, EVENT_DAYS } = __modules['src/data/params.js'];
  const { isShy, isTimid } = __modules['src/game/rules.js'];

  // catName は1日目の最初にプレイヤーが付ける。coat は毛色（src/render/renderer.js の COATS のキー）、face は顔の形（chooseFace）
  // events：日ごとのイベント（添字は日−1。なければ null。chooseEvents）
  function createGame({ personality = DEFAULT_PERSONALITY, seed = Date.now(), coat = 'chatora', face = { shape: 'mochi', ears: 'normal' }, events = Array(MAX_DAY).fill(null) } = {}) {
    // dere・handsOk：ツンデレがデレた・ビビりの手が平気になったか（一度なったら戻らない。src/game/rules.js の isShy・isTimid）
    return { day: 1, trust: 0, personality, coat, face, catName: null, nightChoice: null, mistakes: 0, seed, seenCards: [], dere: false, handsOk: false, events };
  }

  /**
   * 今回の猫の顔（輪郭と耳の大きさ）を決める。毛色や性格とは関係なく、それぞれ同じくらい出る。
   * shape / ears はデバッグで固定したいときだけ渡す
   */
  function chooseFace({ shape = null, ears = null } = {}, random = Math.random) {
    return {
      shape: shape ?? FACES.shapes[Math.floor(random() * FACES.shapes.length)],
      ears: ears ?? FACES.ears[Math.floor(random() * FACES.ears.length)],
    };
  }

  /**
   * イベントを、イベントの日（EVENT_DAYS）のどれかに1つずつ、重ならないように割り当てる。
   * @returns {(string|null)[]} 長さ MAX_DAY。添字は日−1、イベントのない日は null
   */
  function chooseEvents(random = Math.random) {
    const days = [...EVENT_DAYS];
    for (let i = days.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [days[i], days[j]] = [days[j], days[i]];
    }
    const events = Array(MAX_DAY).fill(null);
    Object.keys(EVENTS).forEach((id, i) => {
      if (i < days.length) events[days[i] - 1] = id;
    });
    return events;
  }

  /**
   * 今回の猫の性格と毛色を決める。性格は毛色で決まる（COAT_PERSONALITY）。
   * どの性格も同じくらい出るように、先に性格を選んでから、その性格の毛色を選ぶ。
   * personality / coat はデバッグで固定したいときだけ渡す
   */
  function chooseCat({ personality = null, coat = null } = {}, random = Math.random) {
    if (coat) return { personality: personality ?? COAT_PERSONALITY[coat], coat };
    const keys = Object.keys(PERSONALITIES);
    const p = personality ?? keys[Math.floor(random() * keys.length)];
    const coats = Object.keys(COAT_PERSONALITY).filter((c) => COAT_PERSONALITY[c] === p);
    return { personality: p, coat: coats[Math.floor(random() * coats.length)] };
  }

  /**
   * その日の初期状態を作る。前の晩の選択の効果をここで反映する。
   * @returns {{day, cat, newActions: string[]}}
   */
  function startDay(game) {
    const def = DAYS[game.day - 1];
    const prevActions = game.day > 1 ? DAYS[game.day - 2].actions : [];
    const p = PERSONALITIES[game.personality];

    const day = {
      dayNumber: def.day,
      trust: game.trust,
      wariness: def.startWariness,
      timeLeft: def.durationSec,
      trustRate: def.trustMul ?? 1,
      // 膝に乗る信頼（3日目だけ低い）
      lapTrust: def.lapTrust ?? MAX_VALUE,
      boxLockLeft: 0,
      floorBonus: 0,
      mistakes: 0,
      actions: def.actions,
      signs: def.signs,
      canLap: def.canLap,
      approachMul: def.approachMul,
      // その日のイベント（なければ null。src/game/events.js）
      event: game.events?.[game.day - 1] ?? null,
      // 夜のあいだ（おやつなど）に信頼が境目を越えていたら、その日は最初からデレて・平気になっている
      dere: !!game.dere || !isShy(game.trust, p),
      handsOk: !!game.handsOk || !isTimid(game.trust, p),
    };
    const cat = { mode: 'relax', distance: MAX_VALUE, modeTimeLeft: 3 };

    if (game.nightChoice === 'treat') {
      // おやつに釣られて、最初から落ち着いて近くにいる
      cat.distance = MAX_VALUE - p.treatDistance;
      day.wariness = NIGHT.treatStartWariness;
      day.floorBonus = NIGHT.treatFloorBonus;
      day.trustRate = NIGHT.treatTrustRate * (def.trustMul ?? 1);
    } else if (game.nightChoice === 'box') {
      day.wariness = 0;
      day.boxLockLeft = p.boxLockSec;
      cat.mode = 'inBox';
    }

    return { day, cat, newActions: def.actions.filter((a) => !prevActions.includes(a)) };
  }

  /**
   * @param dayResult {{lapped: boolean, trust: number, mistakes: number}}
   * @returns {{game, next: 'night'|'ending', endingId: string|null}}
   */
  function finishDay(game, dayResult) {
    const g = {
      ...game,
      trust: dayResult.trust,
      mistakes: game.mistakes + dayResult.mistakes,
      dere: dayResult.dere ?? game.dere,
      handsOk: dayResult.handsOk ?? game.handsOk,
    };
    if (dayResult.lapped || game.day >= MAX_DAY) {
      return { game: g, next: 'ending', endingId: endingFor(game.day, dayResult.lapped) };
    }
    return { game: g, next: 'night', endingId: null };
  }

  function chooseNight(game, choice) {
    const gain = { nothing: NIGHT.nothingTrust, treat: NIGHT.treatTrust }[choice] ?? 0;
    const trust = Math.min(MAX_VALUE, game.trust + gain);
    return { ...game, day: game.day + 1, trust, nightChoice: choice };
  }

  function endingFor(dayNumber, lapped) {
    if (!lapped) return 'visitor';
    if (dayNumber <= 3) return 'fate';
    if (dayNumber <= 5) return 'patient';
    return 'persistent';
  }
  return { createGame, chooseFace, chooseEvents, chooseCat, startDay, finishDay, chooseNight, endingFor };
})();

// ---- src/util/rng.js
__modules['src/util/rng.js'] = (() => {
  // シード付き乱数（mulberry32）。同じシードなら同じ並びになる。
  function createRng(seed) {
    let a = seed >>> 0;
    return function rng() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  return { createRng };
})();

// ---- src/render/daylight.js
__modules['src/render/daylight.js'] = (() => {
  // 時間帯の景色：窓の外の空・太陽（夜は月）・部屋にかける薄い色・床の日だまり・スタンドライトの明るさ。
  // 昼は 朝 → 昼 → 夕方 となめらかに変わり、夜は夜の景色（夜の画面）。区切りは src/data/params.js の DAYLIGHT
  const { DAYLIGHT } = __modules['src/data/params.js'];

  // 窓の中の座標（窓は x 36〜168・y 76〜194。src/render/renderer.js の drawRoom）
  const LOOKS = {
    morning: {
      skyTop: '#bfe0f2', skyBottom: '#fde3cf', hill: '#a9cfa0', cloud: 0.4,
      tint: { color: '#ffd9b0', alpha: 0.06 },
      sun: { x: 66, y: 172, color: '#fff3c4' },
      patch: { alpha: 0.22, color: '#fff1c9', length: 150, skew: 70 },
    },
    noon: {
      skyTop: '#8fcdf0', skyBottom: '#d4eefa', hill: '#9cc98f', cloud: 0.9,
      tint: { color: '#ffffff', alpha: 0 },
      sun: { x: 112, y: 100, color: '#fffbe0' },
      patch: { alpha: 0.18, color: '#fff6d8', length: 70, skew: 10 },
    },
    // 昼から夕方へ移る途中：空の下のほうから先に色づく（青と橙をそのまま混ぜると灰色ににごるため）
    golden: {
      skyTop: '#a8c4e6', skyBottom: '#ffd6a0', hill: '#b5b98a', cloud: 0.6,
      tint: { color: '#ffc890', alpha: 0.06 },
      sun: { x: 132, y: 140, color: '#ffe9a8' },
      patch: { alpha: 0.22, color: '#ffe2a8', length: 110, skew: -30 },
    },
    evening: {
      skyTop: '#e58d86', skyBottom: '#ffc27a', hill: '#c98a7a', cloud: 0.3,
      tint: { color: '#ff9d5c', alpha: 0.12 },
      sun: { x: 146, y: 176, color: '#ffd27a' },
      patch: { alpha: 0.24, color: '#ffbd80', length: 170, skew: -80 },
    },
  };
  const NIGHT_LOOK = {
    phase: 'night', skyTop: '#1f2448', skyBottom: '#3a3f6e', hill: '#2a2f50', cloud: 0,
    tint: { color: '#2a2850', alpha: 0 },
    sun: { x: 132, y: 104, kind: 'moon', color: '#fdf6d8' },
    patch: { alpha: 0, color: '#000000', length: 0, skew: 0 },
    lamp: 1,
  };
  // 夕方になったときのスタンドライトの明るさ（夜は 1）
  const EVENING_LAMP = 0.6;

  const lerp = (a, b, u) => a + (b - a) * u;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  // 色 '#rrggbb' を混ぜる・半透明にする（src/render/renderer.js の部屋の描画でも使う）
  const mixColor = (a, b, u) => toHex(toRgb(a).map((v, i) => lerp(v, toRgb(b)[i], u)));
  const rgba = (hex, alpha) => `rgba(${toRgb(hex).join(', ')}, ${alpha.toFixed(3)})`;

  function mix(a, b, u) {
    return {
      skyTop: mixColor(a.skyTop, b.skyTop, u),
      skyBottom: mixColor(a.skyBottom, b.skyBottom, u),
      hill: mixColor(a.hill, b.hill, u),
      cloud: lerp(a.cloud, b.cloud, u),
      tint: { color: mixColor(a.tint.color, b.tint.color, u), alpha: lerp(a.tint.alpha, b.tint.alpha, u) },
      sun: { x: lerp(a.sun.x, b.sun.x, u), y: lerp(a.sun.y, b.sun.y, u), kind: 'sun', color: mixColor(a.sun.color, b.sun.color, u) },
      patch: {
        alpha: lerp(a.patch.alpha, b.patch.alpha, u),
        color: mixColor(a.patch.color, b.patch.color, u),
        length: lerp(a.patch.length, b.patch.length, u),
        skew: lerp(a.patch.skew, b.patch.skew, u),
      },
    };
  }

  /**
   * progress: 昼の進み具合 0〜1（0 = 朝、1 = 昼の終わり）。night: 夜の画面なら true
   * 返り値 { phase, skyTop, skyBottom, hill, cloud, tint {color, alpha}, lamp, sun {x, y, kind, color}, patch {alpha, color, length, skew} }
   */
  function daylightAt(progress, night = false) {
    if (night) return NIGHT_LOOK;
    const p = clamp01(progress);
    const { noonAt, eveningFrom, eveningAt } = DAYLIGHT;
    if (p < noonAt) {
      const u = p / noonAt;
      return { phase: u < 0.5 ? 'morning' : 'noon', lamp: 0, ...mix(LOOKS.morning, LOOKS.noon, u) };
    }
    // eveningFrom までは昼のまま（u = 0）。途中で golden を通って夕方になる
    const u = clamp01((p - eveningFrom) / (eveningAt - eveningFrom));
    const look = u < 0.5 ? mix(LOOKS.noon, LOOKS.golden, u * 2) : mix(LOOKS.golden, LOOKS.evening, u * 2 - 1);
    return { phase: u < 0.5 ? 'noon' : 'evening', lamp: EVENING_LAMP * u, ...look };
  }
  return { mixColor, rgba, daylightAt };
})();

// ---- src/render/props.js
__modules['src/render/props.js'] = (() => {
  // イベントの小道具（4〜6日目）。描く位置・大きさは src/render/renderer.js が決め、ここではそれぞれの座標で描く
  // （箱は底の真ん中、小鳥は胴の真ん中、本は真ん中が原点。枝は窓の座標のまま）。
  // 線の色・太さは renderer の猫と同じ

  const LINE = '#4e3d36';
  const LW = 3.5;

  function line(ctx, x0, y0, x1, y1) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  /**
   * 通販の箱。夜に置く無地の段ボール（renderer の inBox）と見分けがつくよう、明るい色・ガムテープ・宛名ラベル・
   * 「ワレモノ」シール・詰め物の紙を付ける。前面とフタは、伏せた猫の体をすっかり隠す大きさ
   * inside：箱の内側（奥）を描く。猫が顔を出している間は、首の前に奥の壁が来ないよう描かない
   * pile：詰め物の紙を山盛りにする（もぐっている間。猫の頭を隠し、耳の先だけ出る）
   */
  function drawParcel(ctx, { inside = true, paper = true, pile = false } = {}) {
    ctx.save();
    ctx.lineWidth = LW;
    ctx.strokeStyle = LINE;
    if (inside) {
      ctx.fillStyle = '#b98a56';
      ctx.beginPath();
      ctx.moveTo(-64, -66);
      ctx.lineTo(64, -66);
      ctx.lineTo(52, -78);
      ctx.lineTo(-52, -78);
      ctx.closePath();
      ctx.fill();
    }
    if (paper) {
      ctx.fillStyle = '#fffaf2';
      const balls = pile
        ? [[-46, -70, 13], [-24, -76, 15], [2, -80, 17], [28, -76, 15], [48, -70, 12], [-34, -88, 12], [-10, -94, 13], [18, -92, 12], [40, -86, 10]]
        : [[-44, -68, 8], [-24, -70, 7], [26, -70, 7], [46, -68, 8]];
      for (const [x, y, r] of balls) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    // フタ（外に開いている）
    ctx.fillStyle = '#d9a86c';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 64, -66);
      ctx.lineTo(side * 98, -86);
      ctx.lineTo(side * 92, -44);
      ctx.lineTo(side * 64, -38);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // 前面
    ctx.fillStyle = '#ebc48e';
    ctx.beginPath();
    ctx.rect(-64, -66, 128, 66);
    ctx.fill();
    ctx.stroke();
    // ガムテープ（真ん中を縦に）
    ctx.fillStyle = 'rgba(196, 150, 92, 0.85)';
    ctx.fillRect(-11, -66, 22, 66);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(-11, -66, 5, 66);
    // 宛名ラベル
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(20, -52, 36, 26);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(78, 61, 54, 0.5)';
    for (let i = 0; i < 3; i++) line(ctx, 25, -45 + i * 7, 51 - i * 6, -45 + i * 7);
    // 「ワレモノ」シール
    ctx.fillStyle = '#e46d5c';
    ctx.fillRect(-58, -54, 42, 16);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText('ワレモノ', -55, -43);
    ctx.restore();
  }

  // もぐった瞬間に舞う紙くず。u は 0〜1（舞い上がって、消えていく）
  function drawPaperBits(ctx, u) {
    ctx.save();
    ctx.globalAlpha = 1 - u;
    ctx.fillStyle = '#fffaf2';
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    for (const [dx, h] of [[-50, 1], [-20, 1.3], [16, 1.2], [46, 0.9]]) {
      const x = dx * (1 + u * 0.6);
      const y = -80 - Math.sin(u * Math.PI) * 50 * h;
      ctx.beginPath();
      ctx.rect(x - 5, y - 4, 10, 8);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // 小道具に添える短い文字（「ドサッ」「？」「カサカサ」）。遠くて小さく描かれるときも読めるよう、fit で大きさを補う
  function drawPropText(ctx, text, x, y, size, fit = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(fit, fit);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = LINE;
    ctx.font = `bold ${size}px sans-serif`;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  /**
   * 窓の外の木の枝と葉（窓の外に鳥の日）。窓（renderer の drawRoom。x 36〜168, y 76〜194）の座標でそのまま描く。
   * 窓の形で切り抜いた中に描くので、はみ出した分は見えない
   */
  function drawBranch(ctx) {
    ctx.save();
    ctx.strokeStyle = '#8a6748';
    ctx.lineCap = 'round';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(20, 176);
    ctx.quadraticCurveTo(80, 166, 150, 172);
    ctx.stroke();
    ctx.lineWidth = 3;
    line(ctx, 70, 170, 84, 154);
    ctx.fillStyle = '#9cc58a';
    for (const [x, y] of [[86, 151], [52, 168], [128, 166], [100, 175]]) {
      ctx.beginPath();
      ctx.ellipse(x, y, 7, 4, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 小鳥（右向き。原点は胴の真ん中）。flying：飛んでいる間は羽ばたき、足をたたむ
  function drawBird(ctx, t, flying) {
    ctx.save();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = LINE;
    ctx.fillStyle = '#8fb7d9';
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(9, -5, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f0b44c';
    ctx.beginPath();
    ctx.moveTo(15, -5);
    ctx.lineTo(20, -3);
    ctx.lineTo(15, -1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = LINE;
    ctx.beginPath();
    ctx.arc(10, -6, 1.3, 0, Math.PI * 2);
    ctx.fill();
    const flap = flying ? Math.sin(t * 30) * 8 : Math.sin(t * 3) * 1.5;
    ctx.fillStyle = '#6f9ac2';
    ctx.beginPath();
    ctx.moveTo(-4, -2);
    ctx.lineTo(-10, -10 - flap);
    ctx.lineTo(4, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (!flying) {
      line(ctx, -2, 7, -3, 12);
      line(ctx, 3, 7, 3, 12);
    }
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 開いた本（読書中）。原点は本の真ん中（背）。大きさは renderer の BOOK_RECT。flip（0〜1）はページをめくる動き（範囲外なら描かない）
  function drawOpenBook(ctx, flip) {
    ctx.save();
    ctx.lineWidth = LW;
    ctx.strokeStyle = LINE;
    ctx.fillStyle = '#c96f5a';
    roundRect(ctx, -112, -60, 224, 92, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fffaf0';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, -48);
      ctx.quadraticCurveTo(side * 50, -62, side * 102, -50);
      ctx.lineTo(side * 102, 22);
      ctx.quadraticCurveTo(side * 50, 10, 0, 24);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // 文字の行
    ctx.strokeStyle = 'rgba(78, 61, 54, 0.3)';
    ctx.lineWidth = 2;
    for (const side of [-1, 1]) for (let i = 0; i < 5; i++) line(ctx, side * 18, -34 + i * 11, side * 86, -38 + i * 11);
    if (flip > 0 && flip < 1) {
      // めくれているページ
      ctx.fillStyle = '#fff3dc';
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 3;
      const w = Math.cos(flip * Math.PI) * 100;
      ctx.beginPath();
      ctx.moveTo(0, -48);
      ctx.quadraticCurveTo(w / 2, -70 - Math.sin(flip * Math.PI) * 12, w, -52);
      ctx.lineTo(w, 20);
      ctx.quadraticCurveTo(w / 2, 6, 0, 24);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // 閉じた本を右手に持つ（読書のあと。開いた本の片側ぶんの大きさ）。原点は本の真ん中。skin：親指の色（renderer の LAP_COLORS.skin）
  function drawClosedBook(ctx, skin) {
    ctx.save();
    ctx.lineWidth = LW;
    ctx.strokeStyle = LINE;
    // ページの小口
    ctx.fillStyle = '#fffaf0';
    roundRect(ctx, -50, -44, 104, 88, 6);
    ctx.fill();
    ctx.stroke();
    // 表紙
    ctx.fillStyle = '#c96f5a';
    roundRect(ctx, -56, -48, 104, 92, 8);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(78, 61, 54, 0.35)';
    ctx.lineWidth = 2;
    line(ctx, -44, -48, -44, 44);
    ctx.fillStyle = '#f3d9a6';
    ctx.fillRect(-28, -24, 56, 14);
    // 本をつかむ親指
    ctx.fillStyle = skin;
    ctx.strokeStyle = LINE;
    ctx.lineWidth = LW;
    ctx.beginPath();
    ctx.ellipse(-52, 8, 11, 15, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  return { drawParcel, drawPaperBits, drawPropText, drawBranch, drawBird, drawOpenBook, drawClosedBook };
})();

// ---- src/render/renderer.js
__modules['src/render/renderer.js'] = (() => {
  // 猫・部屋の描画（Canvas）。ゲームの判定には関わらず、渡された状態を描くだけ。
  // 論理座標は 360×640。
  //
  // 猫の描き方ルール（目標：ねこあつめ・ねこさがし系のシンプルなデフォルメ）
  // - 頭は横長の「おもち形」で、体より大きく（頭:体 ≒ 1.5:1）
  // - 目は小さな縦長の点。口は「ω」だけ。ひげ・鼻は描かない
  // - ほっぺに薄いピンク。色はベタ塗りでグラデーションを使わない
  // - 線は均一な太さのこげ茶。角は丸く
  const { MAX_VALUE, RULES, EVENTS } = __modules['src/data/params.js'];
  const { daylightAt, mixColor, rgba } = __modules['src/render/daylight.js'];
  const { drawParcel, drawPaperBits, drawPropText, drawBranch, drawBird, drawOpenBook, drawClosedBook } = __modules['src/render/props.js'];

  const W = 360;
  const H = 640;

  // 毛色（色違い）。キーは GameState.coat、名前は src/data/texts.js の COAT_LABELS、性格との対応は src/data/params.js の COAT_PERSONALITY。
  // eye・face は省略可（目と口の色。省略すると共通の色）
  // 柄そのものを増やすとき（ハチワレ・三毛など）は、描画の関数側に手を入れる
  const COATS = {
    chatora: { fur: '#f6bb78', stripe: '#e49a57', white: '#fffdf7' },
    kijitora: { fur: '#c9a27c', stripe: '#8e6a4c', white: '#fffdf7' },
    sabatora: { fur: '#c5c9cf', stripe: '#8b939d', white: '#fffdf7' },
    cream: { fur: '#f8ddb4', stripe: '#eec48f', white: '#fffdf7' },
    shiro: { fur: '#fffaf2', stripe: '#fffaf2', white: '#fffaf2' },
    // 黒い毛にこげ茶の目・口だと見えないので、目は金色、口は明るい色にする
    kuro: { fur: '#45414b', stripe: '#45414b', white: '#58535f', eye: '#f2d36b', face: '#d8cec6' },
  };
  // いま描いている猫の毛色。draw() の最初に view.coat から決める
  let COAT = COATS.chatora;

  // 顔の形（猫ごとに変える）：輪郭と耳の大きさ。種類は src/data/params.js の FACES。
  // 輪郭は「左右の端（cy の高さ）・てっぺん（top）・あご（bottom）」を4本の曲線でつなぐ。
  // tS / bS は上下の曲線が横にふくらむ量、tR / bR はてっぺん・あごの平らさ（小さいほどとがる）
  const FACE_SHAPES = {
    // いままでの「おもち形」（上下が少し平らな横長）
    mochi: { w: 50, top: -40, bottom: 38, cy: 0, tS: 0.75, tR: 0.6, bS: 27 / 38, bR: 0.56 },
    // まんまる
    maru: { w: 46, top: -44, bottom: 40, cy: 0, tS: 0.55, tR: 0.55, bS: 0.55, bR: 0.55 },
    // 下ぶくれ（頭のてっぺんが細く、ほっぺが下のほうで大きく張る。おもち形と見分けがつくよう、はっきりさせる）
    shimobukure: { w: 58, top: -40, bottom: 33, cy: 15, tS: 0.92, tR: 0.32, bS: 0.5, bR: 0.85 },
    // ほっぺもち（横に大きく張った、平たい顔）
    hoppe: { w: 57, top: -36, bottom: 34, cy: 4, tS: 0.82, tR: 0.5, bS: 0.78, bR: 0.66 },
  };
  // 耳の大きさ（倍率）
  const EAR_SIZES = { small: 0.82, normal: 1, big: 1.1 };
  const DEFAULT_FACE = { shape: 'mochi', ears: 'normal' };
  let FACE = faceParams(DEFAULT_FACE);

  // face: { shape, ears }（キーは上の表。省略・不明なものは、いままでの形）
  function faceParams(face = DEFAULT_FACE) {
    return {
      shape: FACE_SHAPES[face?.shape] ?? FACE_SHAPES.mochi,
      ear: EAR_SIZES[face?.ears] ?? 1,
    };
  }

  const C = {
    line: '#4e3d36',
    eye: '#3b2f2a',
    earIn: '#f6c3c6',
    blush: 'rgba(246, 150, 168, 0.55)',
    skin: '#f6d6bf',
    pants: '#b9c6d3',
    pantsLine: '#8d9db0',
    sleeve: '#efb7a0',
    heart: '#f27a93',
    red: '#e0566f',
  };
  const LW = 3.2;
  // テストで輪郭線を見分けるために公開する
  const LINE_COLOR = C.line;
  const LINE_WIDTH = LW;
  const LAP_COLORS = { pants: C.pants, sleeve: C.sleeve, skin: C.skin };

  // 1日目の名前付けで、猫を大きく映すときの位置と大きさ
  const CLOSEUP = { x: 180, y: 615, s: 2.1 };
  // いちばん近づいたとき（膝に乗る前）の足もと。膝の上端（y≒548）より奥にとどまる
  const NEAREST_Y = 546;
  // 膝の上に座ったときの位置と大きさ
  const LAP_SEAT = { x: 180, y: 612, s: 1.3 };
  const LAP_JUMP_SEC = 0.5;
  // タイトルに戻るとき、猫がその場で消える時間と、タイトルの位置に現れる時間（それぞれ）
  const CAT_FADE_SEC = 0.4;
  // 近づいてくる道すじの蛇行：距離100あたり約1.5往復、幅は猫の大きさ1あたり80
  const PATH_FREQ = (Math.PI * 2 * 1.5) / MAX_VALUE;
  const PATH_AMP = 80;
  // なでようと手を伸ばして戻すまでの時間
  const REACH_SEC = 0.45;

  const lerp = (a, b, u) => a + (b - a) * u;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  function createRenderer(canvas) {
    const ctx = canvas.getContext('2d');
    const a = {
      shownDistance: MAX_VALUE,
      lastMode: null,
      modeStart: 0,
      nextBlink: 2,
      blinkStart: -10,
      effects: [],
      shakeUntil: 0,
      lid: 0,
      now: 0,
      // 膝に跳び乗る途中（0=膝の奥、1=膝の上）
      lapBlend: 0,
      shownP: null,
      // 近づいてくる道すじ（蛇行）のずれ。昼が始まるたびに選び直す
      pathPhase: Math.random() * Math.PI * 2,
      // 道すじを選び直したときの横のずれ。いまの位置から急に跳ばないように、少しずつ0に戻す
      pathOffset: 0,
      lastScene: null,
      // 歩いている向き（-1=左、0=正面、1=右）。顔と体の傾きに使う
      facing: 0,
      // タイトルに戻るとき・夜に帰っていくときのフェード
      // { outEnd（消え終わる時刻）, pose, coat, look, moved, hold（見えないまま待つ）, gentle（途中で打ち切らない） }。その前に描いていた猫を覚えておく
      fade: null,
      last: null,
      // 猫を薄く描くための下書き用の Canvas（重なった線が透けないよう、猫をまとめて薄くする）
      layer: null,
      // いま描いている猫 { alpha, coat, mode }
      shown: { alpha: 1, coat: null, mode: null },
      // 昼の進み具合（窓の外の景色・部屋の明るさ）。タイトル・名前付けは朝、エンディングは膝に乗ったときのまま
      dayTime: 0,
      // イベントの小道具 { kind, phase, start（いまの phase になった時刻）, prev（ひとつ前の phase）, anchor（箱を置いた場所） }
      prop: null,
    };

    function resize() {
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
    }

    function toLogical(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * H };
    }

    // 猫は、ゆるく左右に蛇行しながら近づいてくる（道すじは日ごとに変わる）。
    // 膝の前では真ん中に来るように、近いほど左右の幅を小さくする
    function placement(distance) {
      const u = distance / MAX_VALUE;
      const s = lerp(1.2, 0.55, u);
      const sway = Math.sin(distance * PATH_FREQ + a.pathPhase) * PATH_AMP * s * clamp01(distance / 25);
      return { x: lerp(180, 214, u) + sway + a.pathOffset, y: lerp(NEAREST_Y, 372, u), s };
    }

    // 膝に乗るときは、膝の奥から膝の上へ、ぴょんと跳び乗る
    function catPosition(distance) {
      const p = placement(distance);
      if (a.lapBlend <= 0) return p;
      const u = a.lapBlend;
      return { x: lerp(p.x, LAP_SEAT.x, u), y: lerp(p.y, LAP_SEAT.y, u) - Math.sin(u * Math.PI) * 40, s: lerp(p.s, LAP_SEAT.s, u) };
    }

    // 読書中の開いた本に当たったか（ページをめくれるのは、開いた本を描いている間だけ）
    function hitTestBook(x, y) {
      if (a.prop?.kind !== 'book' || a.prop.phase !== 'read') return false;
      return inBookArea(x, y);
    }

    // 開いた本の範囲に入っているか（本を描いているかどうかは見ない。本が閉じた直後のタップを見分けるのに使う）
    function inBookArea(x, y) {
      const r = BOOK_RECT;
      return x >= BOOK_AT.x + r.x && x <= BOOK_AT.x + r.x + r.w && y >= BOOK_AT.y + r.y && y <= BOOK_AT.y + r.y + r.h;
    }

    function hitTestCat(x, y) {
      const p = a.shownP ?? placement(a.shownDistance);
      const cy = p.y - 55 * p.s;
      const r = Math.max(48, 72 * p.s);
      return (x - p.x) ** 2 + (y - cy) ** 2 <= r * r;
    }

    // data: 足あと（paw）なら { x, y }（論理座標）
    function addEffect(type, data = {}) {
      a.effects.push({ type, t0: a.now, ...data });
      if (type === 'kick') a.shakeUntil = a.now + 0.35;
    }

    /**
     * view: { scene, cat?: {mode, distance}, coat?, personality?, wariness?, closeup?, blinkHoldMs?, lapTime?, endingId? }
     */
    function draw(view, t, dt) {
      a.now = t;
      // 夜は猫が帰っていて見えない（hidden）。次の日の昼になったら、消えきるのを待ってから現れる
      const hidden = !!poseFor(view).hidden;
      if (a.fade?.hold && !hidden) {
        a.fade.hold = false;
        if (t >= a.fade.outEnd) a.fade.outEnd = t;
      }
      if (view.scene !== a.lastScene) {
        // ページを開いた直後は、猫をはじめからその場面の位置に置く（部屋の隅から滑ってこない）
        if (a.lastScene === null) a.shownDistance = view.closeup ? MAX_VALUE : poseFor(view).distance;
        // 「もう一度あそぶ」などでタイトルに戻るときは、猫をその場で消してから、タイトルの位置に新しい猫を出す
        // （次は別の猫なので、毛色も消えている間に変わる）
        // 現れている途中で場面が変わったときも、いまの濃さから消し始めて、見えなくなってから移す
        // （ぱっと濃くなったり、見えたまま跳んだりしないように）
        const appearing = a.fade && t >= a.fade.outEnd;
        if ((view.scene === 'title' && a.lastScene !== null && a.last) || appearing) {
          a.fade = { outEnd: t + a.shown.alpha * CAT_FADE_SEC, ...a.last, moved: false };
        } else if (view.scene === 'day' && a.lastScene === 'night' && !a.fade && a.last) {
          // 夜の画面が出きる前に選んで、猫がまだ帰っていなかったときも、その場で消えてから次の日の昼に現れる
          a.fade = { outEnd: t + a.shown.alpha * CAT_FADE_SEC, ...a.last, moved: false, gentle: true };
        } else if (a.fade && t < a.fade.outEnd && !a.fade.gentle) {
          // 消えている途中で次の画面に移ったら、前の猫はそこで消して、新しい猫を見えないところから出す
          // （夜に帰っていく猫は、すぐ次の日になっても消えきるまで待つ）
          a.fade.outEnd = t;
        }
        if (view.scene === 'day') {
          const before = placement(a.shownDistance).x;
          a.pathPhase = Math.random() * Math.PI * 2;
          a.pathOffset += before - placement(a.shownDistance).x;
        }
        a.lastScene = view.scene;
      }
      // 猫が帰っていく：その場で、いまの濃さから消して、見えないまま待つ
      if (hidden && !a.fade?.hold && a.last) {
        a.fade = { outEnd: t + a.shown.alpha * CAT_FADE_SEC, ...a.last, moved: false, hold: true, gentle: true };
      }
      const fadingOut = !!a.fade && (t < a.fade.outEnd || a.fade.hold);
      let alpha = 1;
      if (fadingOut) {
        alpha = Math.max(0, (a.fade.outEnd - t) / CAT_FADE_SEC);
      } else if (a.fade) {
        // 見えていない間に、次の場面の位置（タイトル・次の日の昼のスタート）へ移す（途中の位置を通らない）
        if (!a.fade.moved) {
          a.fade.moved = true;
          a.shownDistance = poseFor(view).distance;
          a.lapBlend = 0;
          a.pathOffset = 0;
          a.facing = 0;
          a.shownP = null;
        }
        alpha = Math.min(1, (t - a.fade.outEnd) / CAT_FADE_SEC);
        if (alpha >= 1) a.fade = null;
      }
      const coatKey = fadingOut ? a.fade.coat : view.coat;
      COAT = COATS[coatKey] ?? COATS.chatora;
      const faceKey = fadingOut ? a.fade.face : view.face;
      FACE = faceParams(faceKey);
      // 読書中に本をのぞき込んでいる猫（onBook）は、膝には乗せず、膝の前（距離0の床）で描く（膝に乗るのは和解のときだけ）
      const cat = fadingOut ? a.fade.pose : poseFor(view);
      // 消えている間は、前の画面の猫の見た目（アップ・寝姿の動き・性格の仕草）のまま描く
      const look = fadingOut
        ? a.fade.look
        : { closeup: !!view.closeup, lapT: view.lapTime ?? 0, personality: view.personality, wariness: view.wariness ?? 0, shy: !!view.shy };
      a.last = { pose: cat, coat: coatKey, face: faceKey, look };
      a.shown = { alpha, coat: coatKey, face: faceKey, mode: cat.mode };
      if (cat.mode !== a.lastMode) {
        a.lastMode = cat.mode;
        a.modeStart = t;
      }
      const follow = cat.mode === 'flee' ? 10 : 5;
      // アップの間は、次の画面（部屋の隅から始まる）に合わせて距離を先に戻しておく
      if (look.closeup) a.shownDistance = MAX_VALUE;
      else a.shownDistance += (cat.distance - a.shownDistance) * clamp01(dt * follow);
      a.pathOffset *= Math.exp(-dt * 1.5);
      updateIdleBlink(t);
      // 膝に跳び乗る（LAP_JUMP_SEC かけて動く）。膝の姿でなくなったときも、同じ速さで戻す
      a.lapBlend = cat.mode === 'lap' ? Math.min(1, a.lapBlend + dt / LAP_JUMP_SEC) : Math.max(0, a.lapBlend - dt / LAP_JUMP_SEC);

      const scale = canvas.width / W;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      ctx.save();
      if (t < a.shakeUntil) ctx.translate(Math.sin(t * 90) * 4, Math.cos(t * 70) * 2);
      if (view.dayTime !== undefined) a.dayTime = view.dayTime;
      else if (view.scene === 'title' || view.scene === 'name') a.dayTime = 0;
      // イベントの小道具の状態を先に進める（窓の外の鳥は、部屋といっしょに描く）
      const prop = updateProp(view, t);
      drawRoom(ctx, daylightAt(a.dayTime, view.scene === 'night'), prop?.kind === 'bird' ? (g) => drawWindowBird(g, prop, t) : null);
      // なでようと手を伸ばしている間は、左手を膝から離す（腕が3本に見えないように）
      const reaching = a.effects.some((e) => e.type === 'reach' && t - e.t0 < REACH_SEC);
      const lap = () => {
        if (!look.closeup) drawLap(ctx, { leftHand: !reaching });
      };

      const p = look.closeup ? CLOSEUP : catPosition(a.shownDistance);
      const dx = a.shownP ? p.x - a.shownP.x : 0;
      const facingTo = cat.walking && Math.abs(dx) > 0.02 ? Math.sign(dx) : 0;
      a.facing += (facingTo - a.facing) * clamp01(dt * 6);
      a.shownP = p;
      // 膝に乗るまでは、猫は膝の奥（膝を手前に描く）。跳び乗ったら膝の上（猫を手前に描く）
      const onLap = cat.mode === 'lap' && a.lapBlend > 0.6;
      if (onLap) lap();
      // イベントの小道具：猫より奥に置くもの（猫が箱から出たあとの空の箱）を先に描く
      if (prop && propBehind(prop, cat)) drawProp(ctx, prop, t, p);
      withAlpha(alpha, (g) => {
        g.save();
        g.translate(p.x, p.y);
        g.scale(p.s, p.s);
        drawShadow(g, cat.mode);
        drawCat(g, cat.mode, {
          t,
          modeT: t - a.modeStart,
          blink: eyelidAmount(t),
          lapT: look.lapT,
          scale: p.s,
          walking: !!cat.walking,
          closeup: look.closeup,
          facing: a.facing,
          personality: look.personality,
          wariness: look.wariness,
          shy: look.shy,
        });
        drawEffects(g, t, p.s, look);
        g.restore();
      });
      // 猫の手前に置くもの（猫が入っている箱）
      if (prop && !propBehind(prop, cat)) drawProp(ctx, prop, t, p);
      if (!onLap) lap();
      // 読書中の本は、膝の上（猫より手前）に持つ
      if (prop?.kind === 'book') drawBook(ctx, prop, t);

      drawReach(ctx, t, p);
      drawPaws(ctx, t);
      ctx.restore();

      drawPlayerEyelids(ctx, view.blinkHoldMs ?? 0, dt);
      drawBlinkGauge(ctx, view.blinkHoldMs ?? 0);
      a.effects = a.effects.filter((e) => t - e.t0 < 2);
    }

    // paint(g) で描いたものを、alpha の濃さで重ねる。薄くするときは下書き用の Canvas に描いてからまとめて重ねる
    // （そのまま薄く描くと、体と頭の重なりなど、下の線が透けて見える）。下書きを作れない環境では、そのまま薄く描く
    function withAlpha(alpha, paint) {
      if (alpha >= 1) return paint(ctx);
      const layer = alphaLayer();
      ctx.save();
      if (!layer) {
        ctx.globalAlpha = alpha;
        paint(ctx);
        ctx.restore();
        return;
      }
      const g = layer.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, layer.width, layer.height);
      g.setTransform(ctx.getTransform());
      g.lineJoin = 'round';
      g.lineCap = 'round';
      paint(g);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = alpha;
      ctx.drawImage(layer, 0, 0);
      ctx.restore();
    }

    function alphaLayer() {
      if (typeof document === 'undefined' || !ctx.getTransform) return null;
      if (!a.layer) a.layer = document.createElement('canvas');
      if (a.layer.width !== canvas.width) a.layer.width = canvas.width;
      if (a.layer.height !== canvas.height) a.layer.height = canvas.height;
      return a.layer;
    }

    function poseFor(view) {
      if (view.scene === 'title') return { mode: 'relax', distance: 55 };
      if (view.scene === 'ending') {
        return view.endingId === 'visitor' ? { mode: 'tailUp', distance: 55 } : { mode: 'lap', distance: 0 };
      }
      if (view.cat) return view.cat;
      return { mode: 'relax', distance: MAX_VALUE };
    }

    function updateIdleBlink(t) {
      if (t >= a.nextBlink) {
        a.blinkStart = t;
        a.nextBlink = t + 2.5 + Math.random() * 3;
      }
    }

    // 0=開いている 1=閉じている
    function eyelidAmount(t) {
      const back = a.effects.find((e) => e.type === 'blinkBack');
      if (back) {
        const u = (t - back.t0) / 1.4;
        if (u < 1) return Math.sin(u * Math.PI) ** 0.6;
      }
      const u = (t - a.blinkStart) / 0.18;
      return u >= 0 && u < 1 ? Math.sin(u * Math.PI) : 0;
    }

    // look：猫の見た目（性格・警戒）。ビビりが耳を伏せている間は「ビクビク」を出し続ける
    function drawEffects(ctx, t, scale, look = {}) {
      const timid = a.effects.some((e) => e.type === 'timid' && t - e.t0 < TIMID_SEC);
      // 耳を伏せている間の「ビクビク」は、同じ場所に出る「ほっ」が出ている間は出さない（文字が重なって読めないので）
      const relief = a.effects.some((e) => e.type === 'relief' && t - e.t0 < RELIEF_SEC);
      const earsDown = look.personality === 'bibiri' && look.wariness >= BIBIRI_EARS_WARINESS;
      if (timid || (earsDown && !relief)) timidCue(ctx, t, scale);
      for (const e of a.effects) {
        const u = t - e.t0;
        if (e.type === 'purr' || e.type === 'blinkBack') {
          const n = e.type === 'purr' ? 4 : 1;
          for (let i = 0; i < n; i++) {
            const k = u - i * 0.18;
            if (k < 0 || k > 1.4) continue;
            const x = (i % 2 ? 1 : -1) * (24 + i * 8) + Math.sin(k * 6 + i) * 5;
            heart(ctx, x, -135 - k * 50, 9 - k * 2, 1 - k / 1.4);
          }
        } else if (e.type === 'kick' && u < 0.5) {
          burst(ctx, -45, -70, u / 0.5);
        } else if (e.type === 'stare' && u < 1.2) {
          sweat(ctx, 44, -118, u);
        } else if (e.type === 'relief' && u < RELIEF_SEC) {
          reliefCue(ctx, u, scale);
        }
      }
    }

    // イベントの小道具の状態を進める。箱は、猫が箱の前に着いたとき（approach が終わったとき）の場所に置き、その日のあいだ動かさない
    function updateProp(view, t) {
      if (view.scene !== 'day' || !view.prop) {
        a.prop = null;
        return null;
      }
      const { kind, phase } = view.prop;
      if (!a.prop || a.prop.kind !== kind) a.prop = { kind, phase, start: t, prev: null, anchor: null };
      // from：phase が変わったときの鳥の位置（飛び去るときは、そこから飛ぶ）
      if (a.prop.phase !== phase) a.prop = { ...a.prop, prev: a.prop.phase, phase, start: t, from: a.prop.birdAt };
      // 本：ページ数が増えたら、めくる動きを始める
      if (kind === 'book' && a.prop.pages !== view.prop.pages) a.prop = { ...a.prop, pages: view.prop.pages, flipAt: a.prop.pages === undefined ? null : t };
      // 表示上の猫は少し遅れて追いかけてくるので、いまの表示の位置ではなく、猫が止まる位置（実際の距離）に置く
      if (kind === 'parcel' && !a.prop.anchor && phase !== 'approach') {
        const q = placement(view.cat.distance);
        a.prop.anchor = { x: q.x, y: q.y + PARCEL_SINK * q.s, s: q.s };
      }
      return a.prop;
    }

    // なでようとしたとき、膝に置いていた左手が猫のほうへ伸びる
    function drawReach(ctx, t, p) {
      const reach = a.effects.find((e) => e.type === 'reach' && t - e.t0 < REACH_SEC);
      if (!reach) return;
      const k = Math.sin(((t - reach.t0) / REACH_SEC) * Math.PI);
      const rest = restingHand(-1);
      drawArm(ctx, -1, lerp(rest.x, p.x - 30 * p.s, k * 0.9), lerp(rest.y, p.y - 60 * p.s, k * 0.9));
    }

    // 猫以外をタップしたところに、肉球の足あとを残す
    function drawPaws(ctx, t) {
      for (const e of a.effects) {
        if (e.type !== 'paw') continue;
        const u = (t - e.t0) / 0.9;
        if (u >= 1) continue;
        ctx.save();
        ctx.globalAlpha = (1 - u) * 0.85;
        ctx.translate(e.x, e.y - u * 6);
        ctx.scale(0.8 + u * 0.2, 0.8 + u * 0.2);
        ellipse(ctx, 0, 3, 7, 6, C.heart);
        for (const [dx, dy] of [[-8, -6], [-3, -10], [3, -10], [8, -6]]) ellipse(ctx, dx, dy, 2.6, 3, C.heart);
        ctx.restore();
      }
    }

    function drawPlayerEyelids(ctx, holdMs, dt) {
      const target = holdMs > 0 ? clamp01(holdMs / 600) * 0.46 : 0;
      a.lid += (target - a.lid) * clamp01(dt * (holdMs > 0 ? 8 : 12));
      if (a.lid < 0.003) return;
      const h = a.lid * H;
      ctx.save();
      ctx.fillStyle = 'rgba(59, 44, 37, 0.92)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(W, 0);
      ctx.lineTo(W, h);
      ctx.quadraticCurveTo(W / 2, h + 40, 0, h);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(W, H);
      ctx.lineTo(W, H - h);
      ctx.quadraticCurveTo(W / 2, H - h - 40, 0, H - h);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // まばたきの長さのゲージ。ちょうどいい長さ（minHoldMs〜maxHoldMs）を緑で示す
    function drawBlinkGauge(ctx, holdMs) {
      if (holdMs <= 0) return;
      const { minHoldMs, maxHoldMs } = RULES.blink;
      const full = maxHoldMs + 500;
      const x0 = 90;
      const w = 180;
      const y = H / 2;
      const at = (ms) => x0 + (Math.min(ms, full) / full) * w;
      const ok = holdMs >= minHoldMs && holdMs <= maxHoldMs;
      ctx.save();
      ctx.globalAlpha = clamp01(holdMs / 200);
      roundRect(ctx, x0 - 4, y - 9, w + 8, 18, 9);
      ctx.fillStyle = 'rgba(255, 250, 243, 0.92)';
      ctx.fill();
      roundRect(ctx, at(minHoldMs), y - 5, at(maxHoldMs) - at(minHoldMs), 10, 5);
      ctx.fillStyle = ok ? '#8fcf7e' : '#c7e6bd';
      ctx.fill();
      ellipse(ctx, at(holdMs), y, 7, 7, ok ? '#5aa548' : '#fffaf3', C.line, 0, 2.4);
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      const label = holdMs < minHoldMs ? 'ゆっくり……' : ok ? 'いま離す！' : 'ながすぎ……';
      ctx.lineWidth = 4;
      ctx.strokeStyle = C.line;
      ctx.strokeText(label, W / 2, y - 18);
      ctx.fillStyle = '#fffaf3';
      ctx.fillText(label, W / 2, y - 18);
      ctx.restore();
    }

    // 直前に猫を描いた位置 {x, y, s}（まだ描いていなければ null）
    const shownPosition = () => a.shownP;
    // 直前に描いた猫の濃さ・毛色・顔・姿勢 { alpha, coat, face, mode }
    const shownCat = () => a.shown;

    return { resize, toLogical, hitTestCat, hitTestBook, inBookArea, addEffect, draw, shownPosition, shownCat };
  }

  // ---------------------------------------------------------------- 部屋（ベタ塗り）

  // ねこ手帳の小さな絵：座ってこちらを見ている猫だけを、部屋なしで描く。
  // silhouette が true なら、まだ出会っていない毛色として影だけにする
  function drawCatPortrait(canvas, coat, { silhouette = false, face = DEFAULT_FACE } = {}) {
    const ctx = canvas.getContext('2d');
    const size = 120;
    const prev = COAT;
    const prevFace = FACE;
    COAT = COATS[coat] ?? COATS.chatora;
    FACE = faceParams(face);
    ctx.save();
    // 途中で失敗しても、ゲームの描画の毛色・顔と Canvas の状態は元に戻す
    try {
      ctx.setTransform(canvas.width / size, 0, 0, canvas.height / size, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.translate(size / 2, size - 10);
      ctx.scale(0.62, 0.62);
      drawCat(ctx, 'look', { t: 0, modeT: 10, blink: 0, lapT: 0, scale: 0.62, walking: false, closeup: true, facing: 0, wariness: 0 });
    } finally {
      ctx.restore();
      COAT = prev;
      FACE = prevFace;
    }
    if (silhouette) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = '#d9cbbd';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
  }

  // light: 時間帯の景色（src/render/daylight.js の daylightAt）。outside：窓の外に描き足すもの（窓の形で切り抜いた中に、景色のあとで描く）
  function drawRoom(ctx, light, outside = null) {
    const night = light.phase === 'night';
    ctx.fillStyle = night ? '#454160' : '#f7ead8';
    ctx.fillRect(0, 0, W, 345);

    // 窓とカーテン
    ctx.save();
    roundRect(ctx, 36, 76, 132, 118, 10);
    ctx.save();
    ctx.clip();
    drawWindowView(ctx, light);
    outside?.(ctx);
    ctx.restore();
    // 景色を描いたので、窓の形をもう一度なぞって枠を描く
    roundRect(ctx, 36, 76, 132, 118, 10);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#fffdf7';
    ctx.stroke();
    ctx.lineWidth = 4;
    line(ctx, 102, 78, 102, 192);
    line(ctx, 38, 135, 166, 135);
    ctx.fillStyle = night ? '#9b7a8c' : '#f5c8bf';
    for (const side of [0, 1]) {
      const x0 = side ? 160 : 24;
      ctx.beginPath();
      ctx.moveTo(x0, 66);
      ctx.lineTo(x0 + 20, 66);
      ctx.quadraticCurveTo(x0 + (side ? 2 : 18), 140, x0 + (side ? 14 : 6), 204);
      ctx.lineTo(x0 + (side ? 20 : 0), 204);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 壁の額（肉球）
    ctx.save();
    roundRect(ctx, 240, 96, 72, 58, 8);
    ctx.fillStyle = '#fffdf7';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#d0a57a';
    ctx.stroke();
    ellipse(ctx, 276, 132, 10, 8, '#f4b6c2');
    for (const [dx, dy] of [[-12, -10], [-4, -16], [4, -16], [12, -10]]) ellipse(ctx, 276 + dx, 132 + dy, 4, 4.5, '#f4b6c2');
    ctx.restore();

    // 床
    ctx.fillStyle = night ? '#6f5d56' : '#ead0a8';
    ctx.fillRect(0, 345, W, H - 345);
    ctx.fillStyle = night ? '#5a4c48' : '#dcbd92';
    ctx.fillRect(0, 338, W, 9);
    ctx.save();
    ctx.strokeStyle = night ? 'rgba(0,0,0,0.1)' : 'rgba(170, 120, 72, 0.16)';
    ctx.lineWidth = 2;
    for (let i = -4; i <= 4; i++) line(ctx, 180 + i * 40, 347, 180 + i * 130, H);
    ctx.restore();

    // 窓から床に差す日だまり（朝は右へ長く、昼は短く、夕方は左へ長く）
    const sp = light.patch;
    if (sp.alpha > 0) {
      ctx.beginPath();
      ctx.moveTo(46, 347);
      ctx.lineTo(158, 347);
      ctx.lineTo(158 + sp.skew + sp.length * 0.25, 347 + sp.length);
      ctx.lineTo(46 + sp.skew - sp.length * 0.25, 347 + sp.length);
      ctx.closePath();
      ctx.fillStyle = rgba(sp.color, sp.alpha);
      ctx.fill();
    }

    // ラグ
    ellipse(ctx, 185, 520, 150, 62, night ? '#86677a' : '#f7d4c6');
    ellipse(ctx, 185, 520, 124, 48, null, night ? '#9b7d8e' : '#fae4da', 0, 3);

    // 植木鉢
    for (const [dx, rot] of [[-8, -0.5], [0, 0], [8, 0.5]]) ellipse(ctx, 318 + dx, 296, 8, 22, '#8dbb7f', null, rot);
    ctx.save();
    roundRect(ctx, 302, 308, 32, 34, 6);
    ctx.fillStyle = '#dd9469';
    ctx.fill();
    ctx.restore();

    drawStandLight(ctx, light.lamp);
    // 部屋全体にかける薄い色（朝はやわらかく、夕方は橙色）。猫はこのあとに描くので、猫の色は染めない
    if (light.tint.alpha > 0) {
      ctx.fillStyle = rgba(light.tint.color, light.tint.alpha);
      ctx.fillRect(0, 0, W, H);
    }
    drawLampGlow(ctx, light.lamp);
  }

  // 窓の外：空（上から下へ色を変えた帯）・遠くの丘・雲・太陽（夜は月と星）
  function drawWindowView(ctx, light) {
    const BANDS = 5;
    for (let i = 0; i < BANDS; i++) {
      ctx.fillStyle = mixColor(light.skyTop, light.skyBottom, i / (BANDS - 1));
      ctx.fillRect(36, 76 + (118 / BANDS) * i, 132, 118 / BANDS + 1);
    }
    const s = light.sun;
    if (s.kind === 'moon') {
      for (const [x, y] of [[58, 92], [80, 112], [150, 150], [64, 150], [104, 88]]) ellipse(ctx, x, y, 1.6, 1.6, '#fdf6d8');
      ellipse(ctx, s.x, s.y, 11, 11, s.color);
      // 欠けた部分は、月の高さの空の帯と同じ色で塗る
      const band = Math.min(BANDS - 1, Math.max(0, Math.floor((s.y - 3 - 76) / (118 / BANDS))));
      ellipse(ctx, s.x + 5, s.y - 3, 9, 9, mixColor(light.skyTop, light.skyBottom, band / (BANDS - 1)));
    } else {
      ellipse(ctx, s.x, s.y, 13, 13, s.color);
    }
    if (light.cloud > 0) {
      ctx.save();
      ctx.globalAlpha = light.cloud;
      for (const [x, y] of [[70, 108], [138, 126]]) {
        ellipse(ctx, x, y, 16, 7, '#ffffff');
        ellipse(ctx, x + 10, y - 4, 10, 7, '#ffffff');
      }
      ctx.restore();
    }
    // 遠くの丘（窓の下のほう）
    ellipse(ctx, 70, 200, 60, 22, light.hill);
    ellipse(ctx, 150, 204, 56, 18, light.hill);
  }

  // スタンドライトの位置（額の下。猫が近づいてくる道すじの後ろに柱が立たないよう、右に寄せる）
  const LAMP_X = 262;

  // 部屋の奥のスタンドライト。lamp: 明るさ 0〜1（0 は消えている）
  function drawStandLight(ctx, lamp) {
    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#b08c6a';
    line(ctx, LAMP_X, 222, LAMP_X, 336);
    ellipse(ctx, LAMP_X, 338, 14, 4, '#b08c6a');
    ctx.beginPath();
    ctx.moveTo(LAMP_X - 16, 202);
    ctx.lineTo(LAMP_X + 16, 202);
    ctx.lineTo(LAMP_X + 24, 226);
    ctx.lineTo(LAMP_X - 24, 226);
    ctx.closePath();
    ctx.fillStyle = mixColor('#f3e3c8', '#fff4c2', lamp);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#d0a57a';
    ctx.stroke();
    ctx.restore();
  }

  // スタンドライトの明かり：かさの周りと床を、暖かい色でほんのり明るくする（ベタ塗りの輪を重ねる）
  function drawLampGlow(ctx, lamp) {
    if (lamp <= 0) return;
    for (let r = 120; r >= 30; r -= 15) ellipse(ctx, LAMP_X, 226, r, r * 0.8, rgba('#ffd98a', 0.035 * lamp));
    ellipse(ctx, LAMP_X, 342, 70, 14, rgba('#ffd98a', 0.16 * lamp));
  }

  // 画面手前の、プレイヤーの膝（正座しているのを上から見たところ）。
  // 丸を2つ並べるだけだと胸に見えるので、太ももの長さ・ひざ頭・膝に置いた手と袖で「自分の膝」とわかるようにする
  function drawLap(ctx, { leftHand = true } = {}) {
    ctx.save();
    for (const side of [-1, 1]) {
      // 太もも：左右のひざをそろえて座っている。外側は手前（画面の下）に向かって少し広がる
      const cx = 180 + side * 80;
      const x = (dx) => 180 + side * dx;
      ctx.beginPath();
      ctx.moveTo(x(0), H + 10);
      ctx.lineTo(x(2), 592);
      ctx.bezierCurveTo(x(4), 548, x(150), 546, x(152), 592);
      ctx.lineTo(x(170), H + 10);
      ctx.closePath();
      ctx.fillStyle = C.pants;
      ctx.fill();
      ctx.lineWidth = LW;
      ctx.strokeStyle = C.line;
      ctx.stroke();
      // ひざ頭と、ももの外側の縫い目
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = C.pantsLine;
      ctx.beginPath();
      ctx.moveTo(cx - 24, 584);
      ctx.quadraticCurveTo(cx, 572, cx + 24, 584);
      ctx.stroke();
      ctx.setLineDash([5, 6]);
      line(ctx, x(140), 604, x(150), H);
      ctx.setLineDash([]);
    }
    if (leftHand) drawRestingHand(ctx, -1);
    drawRestingHand(ctx, 1);
    ctx.restore();
  }

  // 膝に置いた手の位置（side: -1=左手, 1=右手）
  function restingHand(side) {
    return { x: 180 + side * 116, y: 584 };
  }

  // 袖は画面の外（体のほう）から続く
  function shoulderOf(side) {
    return { x: 180 + side * 176, y: H + 30 };
  }

  function drawRestingHand(ctx, side) {
    const h = restingHand(side);
    drawArm(ctx, side, h.x, h.y);
  }

  // 腕：袖 → 袖口 → 手 の順に描く。袖口と手は、肩から手へ向かう腕の向きにそろえる
  // （向きがずれると、袖口の輪郭が腕から浮いて見える）。袖の先は手のひらの下に隠す
  function drawArm(ctx, side, hx, hy) {
    const sh = shoulderOf(side);
    const ang = Math.atan2(hy - sh.y, hx - sh.x);
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    // 袖口は手首（手のひらの下に少し入る）から、肩のほうへ CUFF だけの帯
    const at = (d, w = 0) => ({ x: hx - ux * d - uy * w, y: hy - uy * d + ux * w });
    const WRIST = 14;
    const CUFF = 13;
    const wrist = at(WRIST);
    const seam = at(WRIST + CUFF);
    ctx.save();
    ctx.lineCap = 'butt';
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 32;
    line(ctx, sh.x, sh.y, wrist.x, wrist.y);
    ctx.strokeStyle = C.sleeve;
    ctx.lineWidth = 25.6;
    line(ctx, sh.x, sh.y, seam.x, seam.y);
    // 袖口：袖と同じ色の帯に、ゴム編みの筋と、袖との境目の線
    const W = 15;
    const corners = [at(WRIST, -W), at(WRIST, W), at(WRIST + CUFF, W), at(WRIST + CUFF, -W)];
    ctx.beginPath();
    corners.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
    ctx.closePath();
    ctx.fillStyle = C.sleeve;
    ctx.fill();
    ctx.strokeStyle = 'rgba(160, 84, 60, 0.4)';
    ctx.lineWidth = 1.6;
    for (const w of [-8, 0, 8]) {
      const a0 = at(WRIST, w);
      const a1 = at(WRIST + CUFF, w);
      line(ctx, a0.x, a0.y, a1.x, a1.y);
    }
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    corners.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    // 手：指先は腕の向きの先
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(ang + Math.PI / 2);
    // 親指は内側（体の真ん中のほう）
    ellipse(ctx, side * -14, 4, 6.5, 10, C.skin, C.line, side * 0.4);
    ellipse(ctx, 0, -2, 17, 20, C.skin, C.line);
    ctx.lineWidth = 2;
    ctx.strokeStyle = C.line;
    for (const fx of [-7, 0, 7]) line(ctx, fx, -21, fx, -11);
    ctx.restore();
  }

  function drawShadow(ctx, mode) {
    const w = mode === 'belly' || mode === 'lap' ? 62 : mode === 'inBox' ? 60 : 42;
    ellipse(ctx, mode === 'belly' ? -8 : 0, 0, w, 8, 'rgba(90, 62, 43, 0.13)');
  }

  // ---------------------------------------------------------------- 猫

  // 性格ごとの仕草。サインの見分けやすさは変えず、雰囲気だけを変える
  // - 甘えん坊：いつも首をかしげて、ゆらゆらしている
  // - ツンデレ：ツンの間（k.shy）は、こっちを見るときも、ごきげんなときも、目をそらす。デレたら正面を向く
  // - ビビり：警戒しているあいだは耳を伏せて、小さく震える
  function personalize(mode, k, opts) {
    const o = { ...opts };
    if (k.personality === 'amaenbo') {
      o.tilt = (o.tilt ?? 0) + 0.08 + Math.sin(k.t * 1.8) * 0.06;
    } else if (k.personality === 'tsundere' && k.shy && (mode === 'look' || mode === 'tailUp' || mode === 'purr')) {
      o.faceDx = -14;
      o.turnAway = true;
    } else if (k.personality === 'bibiri' && k.wariness >= BIBIRI_EARS_WARINESS && (o.ears ?? 'up') === 'up') {
      o.ears = 'half';
    }
    return o;
  }

  function drawCat(ctx, mode, k) {
    const breath = 1 + 0.025 * Math.sin(k.t * 2.4);
    const sit = (opts) => sitting(ctx, k, breath, personalize(mode, k, opts));
    if (k.personality === 'bibiri' && k.wariness >= 30 && mode !== 'flee' && mode !== 'lap') {
      ctx.translate(Math.sin(k.t * 47) * 0.9, 0);
    }
    switch (mode) {
      case 'relax':
        // 近づいている間は歩く。止まったら香箱座り
        if (k.walking) return walk(ctx, k, breath, personalize(mode, k, {}));
        return loaf(ctx, k, breath, 'sleep', personalize(mode, k, {}).ears);
      case 'onBook':
        // 読書中：膝の前に座って、首をかしげて本をのぞき込む（「チラッ」と見分けがつくよう、目は小さいまま・合図は出さない）
        return sit({ eyes: 'dot', tail: 'sway', tilt: 0.24 + Math.sin(k.t * 1.2) * 0.05 });
      case 'look':
        sit({ eyes: 'dotBig', tail: 'sway', tilt: Math.sin(k.t * 1.5) * 0.07 });
        // 「チラッ」は昼の駆け引きの合図。名前を付けるときのアップでは出さない
        if (!k.closeup) lookCue(ctx, k);
        return;
      case 'tailUp':
        ctx.translate(0, -Math.abs(Math.sin(k.t * 4)) * 2);
        return sit({ eyes: 'dot', tail: 'up' });
      case 'tailFlick':
        sit({ eyes: 'grumpy', mouth: 'he', tail: 'flick', ears: 'back' });
        return angerMark(ctx, 38 + cueShift()[0], -126 + cueShift()[1], k.t);
      case 'belly':
        return belly(ctx, k, breath);
      case 'backTurn':
        return backView(ctx, k, breath);
      case 'rub':
        ctx.rotate(Math.sin(k.t * 3) * 0.06);
        return sit({ eyes: 'happy', tail: 'up', tilt: 0.3 + Math.sin(k.t * 3) * 0.1 });
      case 'fakeRub':
        // すり寄りと同じ仕草だが、しっぽはパタパタ、目は笑っていない
        ctx.rotate(Math.sin(k.t * 3) * 0.06);
        return sit({ eyes: 'dot', tail: 'flick', tilt: 0.3 + Math.sin(k.t * 3) * 0.1 });
      case 'purr':
        return sit({ eyes: 'happy', tail: 'sway', tilt: 0.12 });
      case 'flee': {
        const jump = Math.sin(clamp01(k.modeT / 0.4) * Math.PI) * 26;
        ctx.translate(0, -jump);
        ctx.scale(1.08, 1.08);
        sitting(ctx, k, breath, { eyes: 'shock', mouth: 'o', tail: 'puff', ears: 'back' });
        return exclaim(ctx, 44, -132);
      }
      case 'inBox':
        return inBox(ctx, k);
      case 'lap':
        return onLap(ctx, k, breath);
      default:
        return loaf(ctx, k, breath, 'sleep');
    }
  }

  function sitting(ctx, k, breath, { eyes, mouth = 'w', tail, tilt = 0, ears = 'up', faceDx = 0, turnAway = false, kneadT = null }) {
    drawTail(ctx, tail, k.t);
    // 後ろ足
    for (const side of [-1, 1]) ellipse(ctx, side * 25, -7, 13, 8, COAT.fur, C.line);
    // 胴体（小さめの豆形）
    ctx.save();
    ctx.translate(0, -2);
    ctx.scale(1, breath);
    furShape(ctx, (c) => c.ellipse(0, -28, 33, 30, 0, 0, Math.PI * 2), () => ellipse(ctx, 0, -22, 18, 22, COAT.white));
    ctx.restore();
    // 前足（ふみふみ中は交互に上下）
    for (const side of [-1, 1]) {
      let lift = 0;
      if (kneadT !== null) lift = Math.max(0, Math.sin(kneadT * 7 + (side > 0 ? Math.PI : 0))) * 7;
      paw(ctx, side * 11, -5 - lift);
    }
    head(ctx, 0, -80, { tilt, eyes, mouth, ears, faceDx, turnAway, blink: k.blink });
  }

  // 歩く：小さく弾みながら前足を交互に出し、進む向きに少し体を傾けて顔を向ける。
  // しっぽは立てない（しっぽピンのサインと見分けがつくように）
  function walk(ctx, k, breath, opts) {
    const step = k.t * 9;
    ctx.translate(0, -Math.abs(Math.sin(step)) * 3);
    ctx.rotate(k.facing * 0.07 + Math.sin(step) * 0.03);
    sitting(ctx, k, breath, { eyes: 'dot', tail: 'sway', kneadT: k.t * 1.3, faceDx: k.facing * 7, ...opts });
  }

  function loaf(ctx, k, breath, eyes, ears = 'up') {
    ctx.save();
    ctx.scale(1, breath);
    furShape(ctx, (c) => c.ellipse(0, -24, 50, 25, 0, 0, Math.PI * 2), () => bodyStripes(ctx, 26, -36));
    ctx.restore();
    drawTail(ctx, 'curl', k.t);
    head(ctx, -4, -52, { eyes, ears, blink: k.blink, scale: 0.92 });
    // 香箱座りで、たたんだ前足が少しだけのぞく
    for (const side of [-1, 1]) ellipse(ctx, -4 + side * 13, -3, 9, 5.5, COAT.white, C.line, 0, LW);
  }

  function belly(ctx, k, breath) {
    // しっぽ
    tube(ctx, (c) => {
      c.moveTo(44, -14);
      c.quadraticCurveTo(72, -12 + Math.sin(k.t * 2) * 6, 86, -28 + Math.sin(k.t * 2) * 8);
    });
    // 上に向けた足。奥の2本（前足・後ろ足）は胴体の後ろ、手前の2本は胴体に重ねて描く
    const leg = (x, y) => {
      const wave = Math.sin(k.t * 2.5 + x) * 2;
      tube(ctx, (c) => {
        c.moveTo(x * 0.8, -30);
        c.lineTo(x, y + wave);
      }, 15, 9);
      ellipse(ctx, x, y + wave - 2, 8, 6.5, COAT.white, C.line, 0, LW);
    };
    leg(-26, -52);
    leg(16, -54);
    ctx.save();
    ctx.scale(1, breath);
    furShape(ctx, (c) => c.ellipse(0, -22, 52, 22, 0, 0, Math.PI * 2), () => ellipse(ctx, 6, -28, 32, 12, COAT.white));
    ctx.restore();
    leg(-9, -56);
    leg(32, -47);
    head(ctx, -56, -30, { tilt: -0.45, eyes: 'dotBig', blink: k.blink, scale: 0.84 });
  }

  function backView(ctx, k, breath) {
    for (const side of [-1, 1]) ellipse(ctx, side * 25, -7, 13, 8, COAT.fur, C.line);
    ctx.save();
    ctx.scale(1, breath);
    furShape(ctx, (c) => c.ellipse(0, -28, 34, 31, 0, 0, Math.PI * 2), () => bodyStripes(ctx, 0, -40));
    ctx.restore();
    // 後ろ頭（顔は描かない）
    ctx.save();
    ctx.translate(0, -80);
    for (const side of [-1, 1]) ear(ctx, side, 'up', false);
    furShape(ctx, mochi, () => {
      ctx.strokeStyle = COAT.stripe;
      ctx.lineWidth = 6;
      const { top } = FACE.shape;
      for (const dx of [-14, 0, 14]) line(ctx, dx, top - 2, dx * 0.9, top + 20);
    });
    ctx.restore();
    drawTail(ctx, 'curl', k.t);
  }

  function inBox(ctx, k) {
    // 箱の内側
    ctx.save();
    ctx.fillStyle = '#a3754a';
    ctx.beginPath();
    ctx.moveTo(-56, -64);
    ctx.lineTo(56, -64);
    ctx.lineTo(44, -74);
    ctx.lineTo(-44, -74);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // 顔をのぞかせる
    const peek = Math.sin(k.t * 1.2) * 3;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-90, -200, 180, 136);
    ctx.clip();
    head(ctx, 0, -70 + peek, { eyes: 'dot', blink: k.blink, scale: 0.85 });
    ctx.restore();
    // 箱の前面とフタ
    ctx.save();
    ctx.lineWidth = LW;
    ctx.strokeStyle = C.line;
    ctx.fillStyle = '#dcae74';
    ctx.beginPath();
    ctx.rect(-56, -64, 112, 64);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#cd9b5f';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 56, -64);
      ctx.lineTo(side * 82, -80);
      ctx.lineTo(side * 76, -46);
      ctx.lineTo(side * 56, -40);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(78, 61, 54, 0.35)';
    line(ctx, -20, -40, 20, -40);
    ctx.restore();
  }

  // 膝の上：ふみふみ → ゴロゴロ → 寝る
  function onLap(ctx, k, breath) {
    if (k.lapT < 2.6) {
      sitting(ctx, k, breath, { eyes: 'happy', tail: 'up', kneadT: k.lapT });
      floatText(ctx, 'ふみふみ', 50, -128, k.t);
      return;
    }
    ctx.save();
    ctx.scale(1, breath);
    furShape(ctx, (c) => c.ellipse(6, -26, 58, 27, 0, 0, Math.PI * 2), () => bodyStripes(ctx, 26, -40));
    ctx.restore();
    head(ctx, -28, -38, { eyes: 'sleep', scale: 0.82, tilt: -0.22 });
    drawTail(ctx, 'curl', k.t);
    if (k.lapT < 4.4) {
      floatText(ctx, 'ゴロゴロ', 44, -92, k.t);
    } else {
      const z = (k.t * 0.6) % 1;
      ctx.save();
      ctx.globalAlpha = 1 - z;
      ctx.fillStyle = C.line;
      ctx.font = `bold ${14 + z * 6}px sans-serif`;
      ctx.fillText('z', 8 + z * 18, -80 - z * 30);
      ctx.restore();
    }
  }

  // 毛色で塗り、内側に柄を描いて、こげ茶の輪郭線を引く。
  // 柄を描くとパスが置き換わるので、輪郭線を引く前にパスを作り直す
  function furShape(ctx, pathFn, pattern) {
    ctx.beginPath();
    pathFn(ctx);
    ctx.fillStyle = COAT.fur;
    ctx.fill();
    ctx.save();
    ctx.clip();
    pattern();
    ctx.restore();
    ctx.beginPath();
    pathFn(ctx);
    ctx.lineWidth = LW;
    ctx.strokeStyle = C.line;
    ctx.stroke();
  }

  // 頭の輪郭（形は FACE_SHAPES）。いままでの形は、上下が少し平らな横長の「おもち形」
  function mochi(ctx) {
    const { w, top, bottom, cy, tS, tR, bS, bR } = FACE.shape;
    ctx.moveTo(-w, cy);
    ctx.bezierCurveTo(-w, cy + (top - cy) * tS, -w * tR, top, 0, top);
    ctx.bezierCurveTo(w * tR, top, w, cy + (top - cy) * tS, w, cy);
    ctx.bezierCurveTo(w, cy + (bottom - cy) * bS, w * bR, bottom, 0, bottom);
    ctx.bezierCurveTo(-w * bR, bottom, -w, cy + (bottom - cy) * bS, -w, cy);
    ctx.closePath();
  }

  // おもち形（幅50・てっぺん−40・端の高さ0）で決めた座標を、いまの顔の形の座標に直す
  function onFace(x, y) {
    const { w, top, cy } = FACE.shape;
    return [x * (w / 50), top + (y + 40) * ((cy - top) / 40)];
  }

  // 頭のまわりに出す合図（「チラッ」・怒りマーク）を、顔の形に合わせてずらす量。
  // おもち形・耳 中のときは [0, 0]。耳が横に張るほど右へ、頭のてっぺんが高いほど上へ
  function cueShift() {
    const b0 = onFace(12, -36);
    const b1 = onFace(47, -16);
    const tipX = (b0[0] + b1[0]) / 2 + (40 - 29.5) * FACE.ear;
    return [Math.max(0, tipX - 40), Math.min(0, FACE.shape.top + 40)];
  }

  // faceDx: 顔のパーツを横にずらして、そっぽを向かせる。turnAway: 大きくそっぽを向く（向こう側のほっぺはずらさない）
  function head(ctx, x, y, { tilt = 0, eyes = 'dot', mouth = 'w', ears = 'up', faceDx = 0, turnAway = false, blink = 0, scale = 1 }) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.scale(scale, scale);
    for (const side of [-1, 1]) ear(ctx, side, ears, true);
    const { w, top, cy } = FACE.shape;
    furShape(ctx, mochi, () => {
      ctx.strokeStyle = COAT.stripe;
      ctx.lineWidth = 6;
      for (const dx of [-12, 0, 12]) line(ctx, dx, top - 4, dx * 0.9, top + 13);
    });

    // 目・ほっぺ・口は、顔のいちばん広いところ（cy）を基準に置く
    ctx.translate(faceDx, cy);
    const cheek = 31 * (w / 50);
    // 大きくそっぽを向いたとき、向こう側のほっぺは奥に回り込むので、ずらさない（輪郭からはみ出さないように）
    const far = turnAway ? -faceDx : 0;
    ellipse(ctx, -cheek + (faceDx < 0 ? far : 0), 12, 7.5, 4.5, C.blush);
    ellipse(ctx, cheek + (faceDx > 0 ? far : 0), 12, 7.5, 4.5, C.blush);
    for (const side of [-1, 1]) eye(ctx, side * 20, 2, eyes, blink, side);
    drawMouth(ctx, mouth);
    ctx.restore();
  }

  function ear(ctx, side, ears, inner) {
    // up：ピンと立つ / half：少し伏せる（不安） / back：横に寝かせる（怒り・驚き）
    // 座標はおもち形で決める。付け根だけを顔の形に合わせて付け直し、耳そのものの形（付け根の真ん中から先までの伸び）は
    // 顔の形によらず同じにして、耳の大きさ（FACE.ear）だけで伸ばす（縦長の顔で耳まで伸びないように）
    const raw = { up: [side * 40, -60], half: [side * 54, -46], back: [side * 60, -26] }[ears];
    const b0 = onFace(side * 12, -36);
    const b1 = onFace(side * 47, -16);
    const mid = [(b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2];
    const rawMid = [side * 29.5, -26];
    const grow = ([x, y]) => [mid[0] + (x - rawMid[0]) * FACE.ear, mid[1] + (y - rawMid[1]) * FACE.ear];
    const tip = grow(raw);
    ctx.save();
    ctx.lineWidth = LW;
    ctx.strokeStyle = C.line;
    ctx.fillStyle = COAT.fur;
    ctx.beginPath();
    ctx.moveTo(b0[0], b0[1]);
    ctx.quadraticCurveTo(tip[0] - side * 6, tip[1] + 2, tip[0], tip[1]);
    ctx.quadraticCurveTo(tip[0] + side * 4, tip[1] + 8, b1[0], b1[1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (inner) {
      ctx.fillStyle = C.earIn;
      ctx.beginPath();
      ctx.moveTo(...onFace(side * 20, -34));
      ctx.lineTo(...grow([raw[0] * 0.84, raw[1] * 0.8]));
      ctx.lineTo(...onFace(side * 40, -20));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function eye(ctx, x, y, kind, blink, side) {
    ctx.save();
    const color = COAT.eye ?? C.eye;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.6;
    const shut = (kind === 'dot' || kind === 'dotBig') && blink > 0.75;
    if (kind === 'happy' || shut) {
      // にっこり閉じ目（∩）
      ctx.beginPath();
      ctx.arc(x, y + 3, 5, Math.PI * 1.2, Math.PI * 1.8);
      ctx.stroke();
    } else if (kind === 'sleep') {
      // 眠り目（－）
      ctx.beginPath();
      ctx.arc(x, y - 7, 8, Math.PI * 0.32, Math.PI * 0.68);
      ctx.stroke();
    } else if (kind === 'grumpy') {
      // 半目でむっとする
      ctx.beginPath();
      ctx.ellipse(x, y + 1, 3.8, 3.2, 0, 0, Math.PI);
      ctx.fill();
      line(ctx, x - 6 * side, y - 2, x + 5 * side, y + 1);
    } else if (kind === 'shock') {
      ellipse(ctx, x, y, 5.5, 6, '#fffdf7', color, 0, 2.2);
      ellipse(ctx, x, y + 0.5, 2.2, 2.6, color);
    } else {
      const big = kind === 'dotBig';
      const rx = big ? 4.6 : 3.6;
      const ry = (big ? 6.2 : 5) * (1 - blink);
      ellipse(ctx, x, y, rx, Math.max(0.8, ry), color);
      if (big && blink < 0.4) ellipse(ctx, x + 1.4, y - 2.2, 1.5, 1.5, '#ffffff');
    }
    ctx.restore();
  }

  function drawMouth(ctx, kind) {
    ctx.save();
    ctx.strokeStyle = COAT.face ?? C.line;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    if (kind === 'o') {
      ctx.ellipse(0, 11, 2.6, 3.2, 0, 0, Math.PI * 2);
    } else if (kind === 'he') {
      ctx.moveTo(-4, 12);
      ctx.lineTo(0, 9);
      ctx.lineTo(4, 12);
    } else {
      ctx.arc(-3.2, 9, 3.2, 0.15, Math.PI - 0.15);
      ctx.moveTo(6.3, 9.5);
      ctx.arc(3.2, 9, 3.2, 0.15, Math.PI - 0.15);
    }
    ctx.stroke();
    ctx.restore();
  }

  function paw(ctx, x, y) {
    ellipse(ctx, x, y, 9.5, 7, COAT.white, C.line, 0, LW);
    ctx.save();
    ctx.strokeStyle = 'rgba(78, 61, 54, 0.55)';
    ctx.lineWidth = 1.6;
    line(ctx, x - 2.5, y + 2, x - 2.5, y + 5);
    line(ctx, x + 2.5, y + 2, x + 2.5, y + 5);
    ctx.restore();
  }

  function bodyStripes(ctx, cx, cy) {
    ctx.save();
    ctx.strokeStyle = COAT.stripe;
    ctx.lineWidth = 6;
    for (const dx of [-16, 0, 16]) line(ctx, cx + dx, cy - 14, cx + dx * 1.1, cy + 2);
    ctx.restore();
  }

  function drawTail(ctx, kind, t) {
    ctx.save();
    if (kind === 'up') {
      const q = Math.sin(t * 11) * 1.5;
      // 頭の陰に隠れないよう、頭の横幅より外側を通す
      tube(ctx, (c) => {
        c.moveTo(26, -14);
        c.quadraticCurveTo(68, -40, 64 + q, -96);
        c.quadraticCurveTo(63 + q, -112, 52 + q, -114);
      });
    } else if (kind === 'flick') {
      const s = Math.sin(t * 9);
      tube(ctx, (c) => {
        c.moveTo(26, -8);
        c.quadraticCurveTo(52, -2, 62 + s * 22, -6 - Math.abs(s) * 14);
      });
    } else if (kind === 'puff') {
      tube(ctx, (c) => {
        c.moveTo(24, -18);
        c.quadraticCurveTo(46, -64, 34, -110);
      }, 24, 18);
    } else if (kind === 'curl') {
      const s = Math.sin(t * 1.3) * 3;
      tube(ctx, (c) => {
        c.moveTo(40, -8);
        c.quadraticCurveTo(50, 6, 0, 6);
        c.quadraticCurveTo(-28, 6, -36 + s, -6);
      });
    } else {
      const s = Math.sin(t * 1.6);
      tube(ctx, (c) => {
        c.moveTo(26, -12);
        c.bezierCurveTo(58, -8, 64, -36 + s * 6, 52 + s * 8, -58);
      });
    }
    ctx.restore();
  }

  // 縁取り付きの太い線（しっぽ・足）
  function tube(ctx, pathFn, outer = 15, innerW = 9) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    pathFn(ctx);
    ctx.strokeStyle = C.line;
    ctx.lineWidth = outer;
    ctx.stroke();
    ctx.beginPath();
    pathFn(ctx);
    ctx.strokeStyle = COAT.fur;
    ctx.lineWidth = innerW;
    ctx.stroke();
    ctx.restore();
  }

  function angerMark(ctx, x, y, t) {
    const s = 1 + Math.sin(t * 8) * 0.08;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.strokeStyle = C.red;
    ctx.lineWidth = 3;
    for (const r of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      ctx.save();
      ctx.rotate(r);
      ctx.beginPath();
      ctx.moveTo(3, -9);
      ctx.quadraticCurveTo(3, -3, 9, -3);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function sweat(ctx, x, y, u) {
    ctx.save();
    ctx.globalAlpha = 1 - u / 1.2;
    ctx.fillStyle = '#9fd0ee';
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    const yy = y + u * 10;
    ctx.beginPath();
    ctx.moveTo(x, yy - 9);
    ctx.quadraticCurveTo(x + 7, yy, x, yy + 4);
    ctx.quadraticCurveTo(x - 7, yy, x, yy - 9);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 見つめているときの合図：頭の横に、控えめな「チラッ」（まばたきのチャンス）。
  // 遠くにいて小さく描かれるときも読めるように、文字だけは大きさを補う
  function lookCue(ctx, k) {
    const fit = Math.max(1, 0.85 / (k.scale ?? 1));
    ctx.save();
    const [dx, dy] = cueShift();
    ctx.translate(50 + dx, -128 + dy);
    ctx.scale(fit, fit);
    // 出た瞬間だけ、少し横にすべり込む
    const u = clamp01(k.modeT / 0.25);
    ctx.globalAlpha = 0.85 * u;
    ctx.fillStyle = C.line;
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('チラッ', (1 - u) * -6, 0);
    ctx.restore();
  }

  // 触ると失敗するサインを、触らずにやり過ごせたときの合図：頭の左上に「ほっ」と出て、ふわっと上がって消える。
  // 右側は「チラッ」・怒りマークの場所なので、反対側に出す
  const RELIEF_SEC = 1.2;
  function reliefCue(ctx, u, scale = 1) {
    const fit = Math.max(1, 0.85 / scale);
    const [dx, dy] = cueShift();
    ctx.save();
    ctx.translate(-86 - dx, -118 + dy - (u / RELIEF_SEC) * 14);
    ctx.scale(fit, fit);
    ctx.globalAlpha = 0.85 * Math.min(1, u / 0.15) * (1 - Math.max(0, (u - 0.7) / (RELIEF_SEC - 0.7)));
    ctx.fillStyle = C.line;
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('ほっ', 0, 0);
    ctx.restore();
  }

  // ビビりの耳を伏せる警戒（この間は「ビクビク」も出す）
  const BIBIRI_EARS_WARINESS = 20;
  // ビビりの合図：頭の左上に、小刻みに震える「ビクビク」。耳を伏せている間と、なでた直後に出す
  const TIMID_SEC = 1.2;
  function timidCue(ctx, t, scale = 1) {
    const fit = Math.max(1, 0.85 / scale);
    const [dx, dy] = cueShift();
    ctx.save();
    ctx.translate(-130 - dx + Math.sin(t * 43) * 0.8, -114 + dy);
    ctx.scale(fit, fit);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = C.line;
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('ビクビク', 0, 0);
    ctx.restore();
  }

  // ---------------------------------------------------------------- イベントの小道具（形は src/render/props.js）

  // 箱は、猫の足もとより少し下に置く（伏せた猫の体が、箱の下からはみ出さないように）
  const PARCEL_SINK = 14;
  // 箱が置かれるときは、猫の右どなりに落ちてきて、もぐるときに猫の前へすべり込む
  const PARCEL_SIDE = 80;
  const PARCEL_FALL_SEC = 0.35;
  // もぐった瞬間に紙くずが舞う長さ
  const PAPER_BITS_SEC = 0.8;

  // 猫より奥に描く：猫が箱から出て、箱より手前（近く）に来たとき。箱より遠くにいる間は、箱を手前に描く
  function propBehind(prop, cat) {
    return prop.kind === 'parcel' && prop.phase === 'left' && cat.distance < EVENTS.box.boxDistance;
  }

  function drawProp(ctx, prop, t, p) {
    if (prop.kind === 'bird') {
      drawHuntCue(ctx, prop, t, p);
      return;
    }
    const A = prop.anchor;
    if (!A) return;
    const u = t - prop.start;
    const fit = Math.max(1, 0.85 / A.s);
    const parcelAt = (x, y, s, opts) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      drawParcel(ctx, opts);
      ctx.restore();
    };
    switch (prop.phase) {
      case 'arrive': {
        // 「ドサッ」と置かれて、猫が「？」と見る
        const fall = clamp01(u / PARCEL_FALL_SEC);
        parcelAt(A.x + PARCEL_SIDE * A.s, A.y - (1 - fall) * 120, A.s * 0.9);
        if (fall >= 1 && u < 0.8) drawPropText(ctx, 'ドサッ', A.x + 40 * A.s, A.y - 80 * A.s, 15, fit);
        if (u > 0.8) drawPropText(ctx, '？', p.x + 34 * p.s, p.y - 120 * p.s, 20, fit);
        return;
      }
      case 'hop':
        parcelAt(A.x + PARCEL_SIDE * A.s * (1 - clamp01(u / EVENTS.box.hopSec)), A.y, A.s * 0.9);
        return;
      case 'hide':
        parcelAt(A.x, A.y, A.s, { pile: true });
        if (prop.prev === 'hop' && u < PAPER_BITS_SEC) {
          ctx.save();
          ctx.translate(A.x, A.y);
          ctx.scale(A.s, A.s);
          drawPaperBits(ctx, u / PAPER_BITS_SEC);
          ctx.restore();
          drawPropText(ctx, 'カサカサ', A.x - 90 * A.s, A.y - 100 * A.s, 13, fit);
        }
        return;
      case 'peek':
      case 'happy':
        parcelAt(A.x, A.y, A.s, { inside: false });
        return;
      default:
        parcelAt(A.x, A.y, A.s);
    }
  }

  // 窓の外の鳥：枝にとまる位置。鳥は窓の外にいるので、ガラス越しに小さめに描く
  const BIRD_PERCH = { x: 122, y: 156 };
  const BIRD_SCALE = 0.8;
  // 鳥が窓のほうへ飛び去る向き（leaveSec でこれだけ動く）
  const BIRD_AWAY = { x: 70, y: -60 };
  // 鳥がいる phase（ここから別の phase に変わったら、飛び去る）
  const BIRD_THERE = ['arrive', 'hunt', 'leave'];
  // 「カカカ」は、KAKA_SEC ごとに KAKA_ON 秒だけ出す（小刻みに鳴いては止む）
  const KAKA_SEC = 1.4;
  const KAKA_ON = 0.9;

  // 窓の外（drawRoom の outside）：枝はその日のあいだずっと。鳥は、飛んできて、とまって、飛び去る。最後にガラスのつやを重ねる
  function drawWindowBird(ctx, prop, t) {
    drawBranch(ctx);
    const B = EVENTS.bird;
    const u = t - prop.start;
    let at = null;
    let flying = false;
    const flyAway = (k) => {
      const from = prop.from ?? BIRD_PERCH;
      return { x: from.x + BIRD_AWAY.x * k, y: from.y + BIRD_AWAY.y * k };
    };
    if (prop.phase === 'arrive') {
      // 左から弧を描いて飛んできて、枝にとまる
      const k = clamp01(u / B.arriveSec);
      at = { x: 10 + (BIRD_PERCH.x - 10) * k, y: BIRD_PERCH.y - 6 - Math.sin(k * Math.PI) * 36 + k * 6 };
      flying = k < 1;
    } else if (prop.phase === 'hunt') {
      // 枝の上で、ちょんちょんと動く
      at = { x: BIRD_PERCH.x + Math.sin(u * 1.3) * 12, y: BIRD_PERCH.y + (Math.sin(u * 5) > 0.7 ? -4 : 0) };
    } else if (prop.phase === 'leave' || (BIRD_THERE.includes(prop.prev) && prop.from && u < B.leaveSec)) {
      // 見守れて去るとき（leave）も、触って驚いて逃げるときも、同じように飛び去る。
      // phase が変わったときにもう飛び去り終えていた（from がない）なら、続きは描かない
      const k = clamp01(u / B.leaveSec);
      if (k < 1) at = flyAway(k);
      flying = true;
    }
    prop.birdAt = at;
    if (at) {
      ctx.save();
      ctx.translate(at.x, at.y);
      ctx.scale(BIRD_SCALE, BIRD_SCALE);
      drawBird(ctx, t, flying);
      ctx.restore();
    }
    // ガラスのつや（鳥と枝がガラスの向こうにあるように見せる）
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fillRect(36, 76, 132, 118);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 3;
    line(ctx, 48, 120, 66, 96);
    line(ctx, 112, 184, 128, 160);
    ctx.restore();
  }

  // 読書中の本：開いた本の真ん中（膝の上）と、その範囲（当たり判定にも使う）。閉じた本は右手に持つ
  const BOOK_AT = { x: 180, y: 600 };
  const BOOK_RECT = { x: -112, y: -60, w: 224, h: 92 };
  const CLOSED_BOOK_AT = { x: 286, y: 566, angle: 0.22 };
  // ページをめくる動きの長さ
  const FLIP_SEC = 0.35;

  // 読んでいる間と、猫が本をのぞき込んでいる間（onBook。ページはめくれない）は、膝の上に開いた本。終わったら閉じて右手に持つ
  function drawBook(ctx, prop, t) {
    ctx.save();
    if (prop.phase === 'read' || prop.phase === 'onBook') {
      ctx.translate(BOOK_AT.x, BOOK_AT.y);
      drawOpenBook(ctx, prop.phase === 'read' && prop.flipAt != null ? (t - prop.flipAt) / FLIP_SEC : -1);
      ctx.restore();
      drawPropText(ctx, `${prop.pages ?? 0}ページ`, 18, 530, 12);
      return;
    }
    ctx.translate(CLOSED_BOOK_AT.x, CLOSED_BOOK_AT.y);
    ctx.rotate(CLOSED_BOOK_AT.angle);
    drawClosedBook(ctx, C.skin);
    ctx.restore();
  }

  // 狩りの間、猫の頭の横に「カカカ」（小刻みに震わせる）
  function drawHuntCue(ctx, prop, t, p) {
    if (prop.phase !== 'hunt') return;
    const u = t - prop.start;
    if (u % KAKA_SEC >= KAKA_ON) return;
    const fit = Math.max(1, 0.85 / p.s);
    drawPropText(ctx, 'カカカ', p.x + 40 * p.s + Math.sin(t * 40), p.y - 110 * p.s, 14, fit);
  }

  function exclaim(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = C.red;
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('!', x, y);
    ctx.restore();
  }

  function floatText(ctx, text, x, y, t) {
    ctx.save();
    ctx.fillStyle = C.line;
    ctx.globalAlpha = 0.75 + Math.sin(t * 4) * 0.2;
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(text, x, y + Math.sin(t * 3) * 3);
    ctx.restore();
  }

  function heart(ctx, x, y, r, alpha) {
    ctx.save();
    ctx.globalAlpha = clamp01(alpha);
    ctx.fillStyle = C.heart;
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.9);
    ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.4, x, y - r * 0.5);
    ctx.bezierCurveTo(x + r * 0.6, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
    ctx.fill();
    ctx.restore();
  }

  function burst(ctx, x, y, u) {
    ctx.save();
    ctx.globalAlpha = 1 - u;
    ctx.strokeStyle = C.red;
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const r0 = 8 + u * 10;
      const r1 = 18 + u * 18;
      line(ctx, x + Math.cos(ang) * r0, y + Math.sin(ang) * r0, x + Math.cos(ang) * r1, y + Math.sin(ang) * r1);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- 図形の小道具

  function ellipse(ctx, x, y, rx, ry, fill, stroke, rot = 0, lw = 3) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  }

  function line(ctx, x0, y0, x1, y1) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  return { W, H, COATS, FACE_SHAPES, EAR_SIZES, LINE_COLOR, LINE_WIDTH, LAP_COLORS, CAT_FADE_SEC, createRenderer, drawCatPortrait };
})();

// ---- src/ui/input.js
__modules['src/ui/input.js'] = (() => {
  // タップ・クリック・キー入力を、ゲームの行動（Action）に変換する。
  function createInput({ canvas, blinkBtn, toLogical, onPet, onBlink }) {
    let holdStart = null;
    let blinkEnabled = false;

    canvas.addEventListener('pointerdown', (e) => {
      const { x, y } = toLogical(e.clientX, e.clientY);
      onPet(x, y);
    });

    function begin() {
      if (!blinkEnabled || holdStart !== null) return;
      holdStart = performance.now();
      blinkBtn.classList.add('holding');
    }
    function end() {
      if (holdStart === null) return;
      const holdMs = performance.now() - holdStart;
      holdStart = null;
      blinkBtn.classList.remove('holding');
      onBlink({ type: 'blink', holdMs });
    }

    blinkBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      blinkBtn.setPointerCapture(e.pointerId);
      begin();
    });
    blinkBtn.addEventListener('pointerup', end);
    blinkBtn.addEventListener('pointercancel', end);
    blinkBtn.addEventListener('contextmenu', (e) => e.preventDefault());

    // 名前の入力中は、Space をまばたきに使わない
    const typing = (e) => e.target instanceof HTMLInputElement;
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || e.repeat || typing(e)) return;
      e.preventDefault();
      begin();
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' && !typing(e)) end();
    });

    return {
      // 押しかけのまばたきを取り消す（一時停止したとき。離しても、まばたきにしない）。まばたきが使えるかどうかは変えない
      cancelHold() {
        holdStart = null;
        blinkBtn.classList.remove('holding');
      },
      setBlinkEnabled(v) {
        blinkEnabled = v;
        if (!v) {
          holdStart = null;
          blinkBtn.classList.remove('holding');
        }
      },
      holdMs() {
        return holdStart === null ? 0 : performance.now() - holdStart;
      },
    };
  }
  return { createInput };
})();

// ---- src/ui/overlay.js
__modules['src/ui/overlay.js'] = (() => {
  // 説明カード・日付の表示（ゲームを一時停止する）と、
  // 吹き出し（止めない説明）・トースト（止めない短いメッセージ）。
  function createOverlay(overlayEl, toastEl, bubbleEl) {
    const queue = [];
    let current = null;
    let shownAt = 0;
    let autoTimer = null;

    overlayEl.addEventListener('pointerdown', () => {
      // 表示直後の誤タップで閉じないように少し待つ
      if (current && performance.now() - shownAt > 350) close();
    });

    function showNext() {
      current = queue.shift() ?? null;
      if (!current) {
        overlayEl.hidden = true;
        overlayEl.replaceChildren();
        return;
      }
      overlayEl.replaceChildren(current.node);
      overlayEl.hidden = false;
      shownAt = performance.now();
      if (current.autoMs) autoTimer = setTimeout(close, current.autoMs);
    }

    function close() {
      clearTimeout(autoTimer);
      const done = current?.onClose;
      showNext();
      done?.();
    }

    function enqueue(item) {
      queue.push(item);
      if (!current) showNext();
    }

    function el(tag, className, text) {
      const n = document.createElement(tag);
      if (className) n.className = className;
      if (text !== undefined) n.textContent = text;
      return n;
    }

    return {
      get busy() {
        return current !== null;
      },
      card({ title, body }, onClose) {
        const node = el('div', 'card');
        node.append(el('h3', null, title), el('p', null, body), el('div', 'tap', 'タップでとじる'));
        enqueue({ node, onClose });
      },
      splash(title, sub, onClose) {
        const node = el('div', 'splash', title);
        if (sub) node.append(el('small', null, sub));
        enqueue({ node, onClose, autoMs: 1800 });
      },
      bubble({ title, body }, ms = 5000) {
        const item = el('div', 'bubble-item');
        item.append(el('b', null, title), el('span', null, body));
        bubbleEl.replaceChildren(item);
        setTimeout(() => item.classList.add('out'), ms);
        setTimeout(() => item.remove(), ms + 500);
      },
      toast(text, ms = 2400) {
        const item = el('div', 'toast-item', text);
        toastEl.replaceChildren(item);
        setTimeout(() => item.classList.add('out'), ms);
        setTimeout(() => item.remove(), ms + 500);
      },
      clear() {
        queue.length = 0;
        clearTimeout(autoTimer);
        current = null;
        overlayEl.hidden = true;
        overlayEl.replaceChildren();
        toastEl.replaceChildren();
        bubbleEl.replaceChildren();
      },
    };
  }
  return { createOverlay };
})();

// ---- src/ui/hud.js
__modules['src/ui/hud.js'] = (() => {
  // 日数・残り時間・まばたきボタンの表示。
  const { DAYS } = __modules['src/data/params.js'];

  function createHud({ root, dayEl, barEl, blinkBtn }) {
    return {
      show(v) {
        root.hidden = !v;
      },
      update(day) {
        dayEl.textContent = `${day.dayNumber}日目`;
        const total = DAYS[day.dayNumber - 1].durationSec;
        barEl.style.width = `${(day.timeLeft / total) * 100}%`;
        blinkBtn.hidden = !day.actions.includes('blink');
      },
    };
  }
  return { createHud };
})();

// ---- src/data/texts.js
__modules['src/data/texts.js'] = (() => {
  // 画面に出す文章はすべてここに置く。
  // {name} はプレイヤーが付けた猫の名前に置き換える（withName）。

  const withName = (text, name) => text.replaceAll('{name}', name);

  const TITLE = {
    main: 'ネコと和解せよ',
    sub: '〜猫が来るまでの7日間〜',
    start: 'タップではじめる',
  };

  const DAY_TITLES = {
    1: 'はじめまして',
    2: 'すこし慣れてきた？',
    3: 'ためされる日',
    4: 'いつもの日',
    5: 'いつもの日',
    6: 'いつもの日',
    7: 'さいごの日',
  };

  // 1日目の最初に、猫をアップにして名前を付けてもらう
  const NAME_TEXT = {
    prompt: '名前は何にしよう？',
    placeholder: 'なまえ',
    ok: 'この名前にする',
    back: 'もどる',
    maxLength: 10,
    // 名前の候補は毛色に合わせる（毛色のキーは src/render/renderer.js の COATS）。毎回この中から4つ出す
    byCoat: {
      chatora: ['みかん', 'ちゃちゃ', 'むぎ', 'おこげ', 'とら', 'こむぎ'],
      kijitora: ['こてつ', 'くるみ', 'まめ', 'とらじ', 'ごんた', 'おかか'],
      sabatora: ['ぎん', 'すず', 'ねず', 'ぽんず', 'はい', 'もくもく'],
      cream: ['きなこ', 'ぷりん', 'こむぎ', 'まろん', 'かすてら', 'ミルク'],
      shiro: ['もち', 'ゆき', 'しらたま', 'まる', 'たま', 'ましろ'],
      kuro: ['くろ', 'Holy Night', 'のり', 'あんこ', 'ごま', 'よる', 'クロエ'],
    },
  };

  // 1日目のチュートリアル（ゲームを止めずに出す短いメッセージ）
  const TUTORIAL = {
    wait: '触ろうとすると逃げてしまう。まずは「待って」みよう',
    approach: '{name}のほうから、少し近づいてきた！',
    flee: '焦りは禁物。猫は追いかけるほど逃げる',
  };

  // 説明。キーは 'action:xxx' 'sign:xxx' 'day:xxx' 'tip:xxx' 'event:xxx'
  // pause: true はゲームを一時停止するカード（遊び方が変わるもの・触ると失敗するのに触りたくなるもの）。
  // それ以外は、ゲームを止めない吹き出しで出す
  const CARDS = {
    'day:intro': {
      pause: true,
      title: '{name}は、まだ警戒している',
      body: '近づきたい気持ちを、ぐっとこらえて……。\n{name}のほうから膝に乗ってくれたら「和解」です。\n猫にも性格があります。{name}がどんな子か、よく観察してみましょう。',
    },
    'action:pet': {
      pause: true,
      title: 'できること：なでる',
      body: '猫をタップすると、手を伸ばしてなでようとします。\nでも、タイミングを間違えると……？',
    },
    'action:blink': {
      pause: true,
      title: '新しくできること：ゆっくりまばたき',
      body: '「チラッ」とこっちを見たら、まばたきボタンを長押しして、離そう。\n猫の世界では「好きだよ」の合図。\n※目が合っていないと、ちょっと不審がられる。\n※ツンデレの猫は、仲良くなるまで照れて目をそらすことも。',
    },
    'sign:look': {
      title: '猫のサイン：じっと見つめる',
      body: '「チラッ」とこっちを見ている。いまが、ゆっくりまばたきのチャンス。\n※ツンデレの猫は、仲良くなるまで照れて逆効果。',
    },
    'sign:tailUp': {
      title: '猫のサイン：しっぽピン',
      body: 'しっぽが真っすぐ立っているのは、ごきげんの印。\n近くにいるなら、そっとなでてもいいかも。',
    },
    'sign:tailFlick': {
      title: '猫のサイン：しっぽパタパタ',
      body: 'しっぽを振っているのは、イライラの印。\n犬とは逆なので注意。そっとしておこう。',
    },
    'day:lap': {
      title: '今日から',
      body: '信頼が十分にたまっていれば、{name}が膝に乗ってくれるかもしれません。',
    },
    'sign:belly': {
      pause: true,
      title: '猫のサイン：お腹見せ',
      body: '信頼の印……でも、触ると怒る猫が多い。\n見守るのが正解。',
    },
    'sign:backTurn': {
      title: '猫のサイン：背中を向けて座る',
      body: 'そっけなく見えて、実は「あなたを信頼している」の印。\nそのまま待とう。',
    },
    'sign:rub': {
      title: '猫のサイン：すり寄り',
      body: '猫のほうから頭をこすりつけてきた！\n今こそ、なでて応えよう。',
    },
    'sign:fakeRub': {
      pause: true,
      title: '猫のサイン：気まぐれすりすり',
      body: 'すり寄ってきた……けど、しっぽがパタパタしている。\n猫の気は変わりやすい。しっぽをよく見よう。',
    },
    'event:box': {
      pause: true,
      title: 'イベント：箱が届いた',
      body: '通販の箱が届いた。\n中身より、箱のほうが気になるみたい……？\n顔を出したら、ゆっくりまばたき。箱の中では、触らずに見守ろう。',
    },
    'event:bird': {
      pause: true,
      title: 'イベント：窓の外に鳥',
      body: '窓の外に小鳥が来た。\n{name}は狩りモードで、いまは集中しているみたい。\n背中を向けている間は触らずに見守って、こっちを見たら、ゆっくりまばたき。',
    },
    'event:read': {
      pause: true,
      title: 'イベント：読書中',
      body: '今日は本を読もう。\n猫は、かまわないほうが寄ってくるらしい。\n本をタップしてページをめくろう。{name}には触らずに……。',
    },
    'tip:patience': {
      title: 'がまんできた',
      body: '触らずに見守ったので、{name}は少し安心したみたい。\nイライラやお腹見せは、やり過ごすだけで仲良くなれる。',
    },
  };

  // 同じ様子で2回失敗したときに出すヒント（吹き出し）。キーは失敗したときの猫の様子
  const HINTS = {
    relax: { title: 'ヒント', body: 'くつろいでいるときは、そっとしておこう。\nしっぽがピンと立ったら、なでるチャンス。' },
    look: { title: 'ヒント', body: '「チラッ」とこっちを見たら、なでるより「ゆっくりまばたき」。' },
    backTurn: { title: 'ヒント', body: '背中を向けているのは、信頼の印。\n触らずに待つだけで、仲良くなれる。' },
    tailFlick: { title: 'ヒント', body: 'しっぽパタパタは、イライラの印。\n落ち着くまで待とう。' },
    belly: { title: 'ヒント', body: 'お腹を見せてくれても、触るのはがまん。\n見守るのが正解。' },
    fakeRub: { title: 'ヒント', body: 'すり寄ってきても、しっぽがパタパタしていたら気まぐれ。\nしっぽがピンと立っているときだけなでよう。' },
    inBox: { title: 'ヒント', body: '箱の中では、そっとしておこう。\n自分から出てくるまで待とう。' },
    stare: { title: 'ヒント', body: 'まばたきは、{name}がじっとこっちを見ているときに。' },
    // ツンの間にまばたきして、目をそらされたとき（キーは猫の様子ではなく、反応）
    blinkAway: { title: 'ヒント', body: '{name}は、見つめ合うのが照れくさいみたい。\nもう少し仲良くなるまで、まばたきは待ってみよう。' },
  };

  const FEEDBACK = {
    flee: 'ピャッ！',
    kick: 'ペシッ！',
    hide: '（箱の奥に引っ込んだ）',
    stare: '（じっと見つめられて、落ち着かない様子……）',
    blinkBack: '（ゆっくりまばたきを返してくれた）',
    purr: 'ゴロゴロ……',
    tooFar: '（手が届かない……）',
    // 触ると失敗するサインを、触らずにやり過ごせたとき
    relief: '（ほっとしたみたい）',
    // ツンの間にまばたきしたとき
    blinkAway: '（ぷいっ。照れて目をそらされた）',
    // 手がこわい猫（ビビり）をなでたとき
    timid: '（ビクビク……手はまだこわいみたい）',
  };

  // ツンがとれて、まばたきを喜ぶようになった瞬間に出す
  const DERE_TEXT = '（{name}の目つきが、少しやわらかくなった）';
  // 手がこわい猫（ビビり）が、なでられても平気になった瞬間に出す
  const TIMID_GONE_TEXT = '（{name}は、手がこわくなくなったみたい）';

  // イベントの日のトースト（キーは src/game/events.js の cue）
  const EVENT_TEXT = {
    box: { hid: '（箱にもぐった）', watched: '（見つめないでくれて、ほっとしたみたい）', out: '（箱から出てきた！）' },
    bird: { hunt: '（窓の外をじっと見ている……）', left: '（鳥が行ってしまった。ほっとしたみたい）', understood: '（狩りの邪魔をしない人だと、わかってくれたみたい）' },
    read: { wonder: '（……？）', onBook: '（本をのぞき込んできた……！）' },
  };

  const LAP_TEXT = '{name}が、膝に乗ってきた……！';

  const NIGHT_TEXT = {
    title: (day) => `${day}日目の夜`,
    prompt: '{name}のために、何をしておく？',
    choices: [
      { id: 'treat', label: 'おやつを置いておく', hint: '喜んでくれそう。明日は近くから始まるかも。でも、おやつ目当てかも' },
      { id: 'box', label: '段ボール箱を置いておく', hint: '落ち着いてくれそう。でも、しばらく出てこないかも' },
      { id: 'nothing', label: '何もしない', hint: 'そっとしておく。それも、ひとつの優しさ' },
    ],
  };

  const ENDINGS = {
    fate: { name: '運命の膝', body: 'たった3日で、{name}はあなたの膝を選んだ。' },
    patient: { name: '待てる人間', body: '焦らず、追わず。{name}はちゃんと見ていた。' },
    persistent: { name: '根気の人', body: '何度逃げられても、あなたは待ち続けた。' },
    visitor: { name: '通い猫になりました', body: '膝には乗ってくれなかったけれど、{name}はときどき遊びに来てくれる。\nこれはこれで、悪くない。' },
  };

  const ENDING_UI = {
    reconciled: (day) => `${day}日目で和解`,
    notReconciled: '7日間では和解ならず',
    mistakes: (n) => `焦って手を出した回数：${n}回`,
    personality: (name, label) => `${name}の性格：${label}`,
    coat: (label) => `毛色：${label}`,
    retry: 'もう一度あそぶ',
  };

  // 毛色の名前（色そのものは src/render/renderer.js の COATS）
  const COAT_LABELS = {
    chatora: '茶トラ',
    kijitora: 'キジトラ',
    sabatora: 'サバトラ',
    cream: 'クリーム',
    shiro: 'シロ',
    kuro: 'クロ',
  };

  // 性格の得意・苦手のひとこと（エンディングの種明かしで、性格の行のすぐ後ろに出す。倍率は src/data/params.js の likes）
  const PERSONALITY_TIPS = {
    amaenbo: 'なでられるのが大好き。待たされるのは、ちょっと苦手',
    tsundere: 'はじめは見つめられると照れる。仲良くなると、まばたきが大好きに',
    bibiri: '手はこわいけど、ゆっくりまばたきには安心する',
  };

  // 毛色ごとの性格の言い伝え（エンディングで表示。性格との対応は src/data/params.js の COAT_PERSONALITY）
  const COAT_LORE = {
    chatora: '茶トラは、人なつっこい甘えん坊が多いと言われている',
    cream: 'クリームは、おっとりした甘えん坊が多いと言われている',
    kuro: 'クロは、賢くて慎重な子が多いと言われている',
    shiro: 'シロは、気品があって気まぐれな子が多いと言われている',
    sabatora: 'サバトラは、クールだけど慣れると甘える子が多いと言われている',
    kijitora: 'キジトラは、用心深くて警戒心の強い子が多いと言われている',
  };

  // ねこ手帳（思い出・図鑑・称号）。記録の中身は src/game/records.js
  const NOTEBOOK_TEXT = {
    open: 'ねこ手帳',
    back: 'もどる',
    tabs: { memories: '思い出', dex: '図鑑', titles: '称号' },
    saved: '思い出に残しました',
    newTitle: (name) => `称号を手に入れた：${name}`,
    noMemories: 'まだ思い出はありません。猫と7日間を過ごすと、ここに残ります',
    // 思い出の結果：エンディングの名前をそのまま出す（通い猫は名前だけ）
    memoryResult: (m, endingName) => (m.endingId === 'visitor' ? `「${endingName}」` : `「${endingName}」${m.day}日目で和解`),
    unknownCoat: '？？？',
    bestDay: (day) => (day === null ? 'まだ和解していない' : `いちばん早い和解：${day}日目`),
    locked: '？？？',
    count: (got, all) => `${got} / ${all}`,
  };

  // 称号。条件の判定は src/game/records.js の TITLE_IDS と同じ順
  const TITLES = {
    first: { name: 'はじめての和解', how: '初めて猫と和解する' },
    fate: { name: '運命の人', how: '3日目で和解する' },
    noMistake: { name: '手を出さない人', how: '一度も焦らずに和解する' },
    amaenbo: { name: '甘えん坊の友だち', how: '甘えん坊の猫と和解する' },
    tsundere: { name: 'ツンデレ使い', how: 'ツンデレの猫と和解する' },
    bibiri: { name: 'ビビりの味方', how: 'ビビりの猫と和解する' },
    visitor: { name: '通い猫も悪くない', how: '通い猫になったエンディングを見る' },
    allCoats: { name: '毛色コンプリート', how: '6種すべての毛色の猫と和解する' },
    allStamps: { name: 'スタンプコンプリート', how: '図鑑のスタンプを24個すべて集める' },
    tenCats: { name: 'ねこ好き', how: '10匹の猫と出会う' },
  };

  // 一時停止メニュー（src/ui/pauseMenu.js）
  const PAUSE_TEXT = {
    button: '一時停止',
    title: 'いったん休憩',
    resume: 'つづける',
    quit: 'タイトルにもどる',
    confirm: 'この猫との7日間は、思い出に残りません。タイトルにもどりますか？',
    confirmYes: 'タイトルにもどる',
    confirmNo: 'やめておく',
  };

  const SOUND_LABEL = { on: '効果音ON', off: '効果音OFF' };

  // 画面左下の BGM 表示。曲名は src/data/bgmSongs.js
  const BGM_TEXT = {
    off: 'BGM OFF',
    aria: (label) => `BGM：${label}（タップで次の曲）`,
  };
  return { withName, TITLE, DAY_TITLES, NAME_TEXT, TUTORIAL, CARDS, HINTS, FEEDBACK, DERE_TEXT, TIMID_GONE_TEXT, EVENT_TEXT, LAP_TEXT, NIGHT_TEXT, ENDINGS, ENDING_UI, COAT_LABELS, PERSONALITY_TIPS, COAT_LORE, NOTEBOOK_TEXT, TITLES, PAUSE_TEXT, SOUND_LABEL, BGM_TEXT };
})();

// ---- src/game/catBrain.js
__modules['src/game/catBrain.js'] = (() => {
  // 時間経過による猫の変化（様子の切り替え・移動・警戒と信頼の自然な増減）。
  // 描画や入力には依存しない。
  const { RULES, MAX_VALUE } = __modules['src/data/params.js'];

  const clamp = (v) => Math.min(MAX_VALUE, Math.max(0, v));

  // 猫が歩いて近づくのは「くつろぎ」の間だけ。ほかの様子（座っている・寝ころぶ・逃げる）では、その場から動かない
  const WALK_MODES = ['relax'];
  // 触ると失敗するサイン。触らずに時間切れまでやり過ごせたら、我慢のごほうびで信頼が増える
  const PATIENCE_MODES = ['belly', 'tailFlick', 'fakeRub'];

  /**
   * @returns {{cat, day, enteredMode: string|null, endured: string|null}} cat.walking は、この tick で歩いて近づいたか（描画で歩く姿にする）。
   *   endured は、この tick で触らずにやり過ごせたサイン（なければ null）
   */
  function tick(cat, day, personality, dt, rng) {
    if (cat.mode === 'lap') return { cat, day, enteredMode: null, endured: null };

    const prevMode = cat.mode;
    let c = { ...cat, walking: false };
    const a = ambient(day, dt);
    let d = a.day;
    const calm = a.calm;
    let endured = null;

    if (d.boxLockLeft > 0) {
      d.boxLockLeft = Math.max(0, d.boxLockLeft - dt);
      c.mode = 'inBox';
      if (d.boxLockLeft === 0) c = pickNextMode(c, d, personality, rng);
    } else {
      // 移動はこの tick の信頼増加より先に、tick 開始時点の信頼で下限を決める
      // 歩き出したら下限に着くまで歩き、着いたら座る。座ったあとは、下限が walkResumeGap 下がるまで待つ（足踏みしない）。
      // 下限がもう 0（膝の前）なら、それ以上は下がらないので待たずに歩く（膝に乗れなくならないように）
      if (calm && WALK_MODES.includes(c.mode)) {
        const floor = distanceFloor(d.trust, d.floorBonus);
        const gap = c.distance - floor;
        if (gap > 0 && (cat.walking || gap >= RULES.walkResumeGap || floor === 0)) {
          c.distance = Math.max(floor, c.distance - personality.approachSpeed * d.approachMul * dt);
          c.walking = c.distance > floor;
        }
      }

      c.modeTimeLeft -= dt;
      if (c.modeTimeLeft <= 0) {
        if (c.mode === 'rub') c.distance = clamp(c.distance + RULES.rubIgnoredDistance);
        const ending = c.mode;
        c = pickNextMode(c, d, personality, rng);
        // 次も同じサインなら、見た目は変わらず続いているので、まだやり過ごせていない
        if (PATIENCE_MODES.includes(ending) && c.mode !== ending) endured = ending;
      }
    }

    let gain = 0;
    if (calm) gain += RULES.calmTrustPerSec * dt;
    // 背中を向けている間と我慢のごほうびは、どちらも「触らずに待てた」分。性格の得意・苦手（likes.patience）がかかる
    if (prevMode === 'backTurn') gain += RULES.backTurnTrustPerSec * dt * personality.likes.patience;
    if (endured) gain += RULES.patienceTrust * personality.likes.patience;
    d.trust = clamp(d.trust + gain * d.trustRate);

    // 膝に乗る信頼は日によって違う（3日目は少し手前でも乗る。DAYS の lapTrust）
    if (d.canLap && d.trust >= (d.lapTrust ?? MAX_VALUE) && c.distance <= 0 && c.mode !== 'inBox') {
      c.mode = 'lap';
    }

    return { cat: c, day: d, enteredMode: c.mode !== prevMode ? c.mode : null, endured };
  }

  // 時間が進むと、残り時間が減り、待っている分だけ警戒が下がる。calm：落ち着いている（猫が近づき、信頼が増える）。
  // いつもの日（tick）とイベントの日（src/game/events.js）で共通
  function ambient(day, dt) {
    const d = { ...day, timeLeft: Math.max(0, day.timeLeft - dt) };
    d.wariness = Math.max(0, d.wariness - RULES.warinessDecayPerSec * dt);
    return { day: d, calm: d.wariness < RULES.calmThreshold };
  }

  // 信頼に応じて、猫がそれ以上近づかない距離。bonus はおやつの日などに、いつもより近くまで来る分
  function distanceFloor(trust, bonus = 0) {
    return Math.max(0, MAX_VALUE - trust - RULES.distanceFloorOffset - bonus);
  }

  const NEAR_ONLY = ['rub', 'fakeRub'];

  function pickNextMode(cat, day, personality, rng) {
    const candidates = day.signs.filter((s) => !NEAR_ONLY.includes(s) || cat.distance <= RULES.rubMaxDistance);
    const weights = candidates.map((s) => {
      const w = personality.signWeights[s] ?? 1;
      return s === 'tailFlick' ? w * (1 + day.wariness / RULES.tailFlickWarinessScale) : w;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    let mode = candidates[candidates.length - 1];
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i];
      if (r < 0) {
        mode = candidates[i];
        break;
      }
    }
    const [min, max] = RULES.modeSec[mode];
    return { ...cat, mode, modeTimeLeft: min + (max - min) * rng() };
  }
  return { tick, ambient, distanceFloor };
})();

// ---- src/ui/debugPanel.js
__modules['src/ui/debugPanel.js'] = (() => {
  // デバッグパネル（試作用）。性格・毛色の切り替え・数値の表示・日のスキップ。
  const { PERSONALITIES, FACES } = __modules['src/data/params.js'];
  const { COAT_LABELS } = __modules['src/data/texts.js'];
  const { distanceFloor } = __modules['src/game/catBrain.js'];

  const SPEEDS = [1, 2, 4, 8];
  // 顔の形の名前（デバッグ表示だけで使う）
  const SHAPE_LABELS = { mochi: 'おもち', maru: 'まんまる', shimobukure: '下ぶくれ', hoppe: 'ほっぺもち' };
  const EAR_LABELS = { small: '小', normal: '中', big: '大' };

  // イベントの日の固定（値は 'イベント:日'。空ならランダム）
  const EVENT_OPTIONS = [['', 'ランダム'], ['box:4', '箱が届いた（4日目）'], ['bird:4', '窓の外に鳥（4日目）'], ['read:4', '読書中（4日目）']];

  function createDebugPanel(el, { onPersonality, onCoat, onFace, onSkipDay, onTrustMax, onReset, onSpeed, onClearRecords, onEvent }) {
    const details = document.createElement('details');
    // スマホ幅ではゲーム画面に重なるので、折りたたんだ状態で始める
    details.open = window.innerWidth >= 800;
    const summary = document.createElement('summary');
    summary.textContent = 'DEBUG';
    details.append(summary);

    const radios = {};
    for (const [key, p] of Object.entries(PERSONALITIES)) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'personality';
      input.value = key;
      input.addEventListener('change', () => onPersonality(key));
      radios[key] = input;
      label.append(input, ` ${p.label}`);
      details.append(label);
    }

    const coatSelect = document.createElement('select');
    for (const [key, label] of Object.entries(COAT_LABELS)) coatSelect.append(new Option(label, key));
    coatSelect.addEventListener('change', () => onCoat(coatSelect.value));
    const coatRow = document.createElement('div');
    coatRow.append('毛色: ', coatSelect);
    details.append(coatRow);

    // 顔の形（輪郭と耳の大きさ）
    const shapeSelect = document.createElement('select');
    for (const key of FACES.shapes) shapeSelect.append(new Option(SHAPE_LABELS[key] ?? key, key));
    const earSelect = document.createElement('select');
    for (const key of FACES.ears) earSelect.append(new Option(EAR_LABELS[key] ?? key, key));
    const changeFace = () => onFace({ shape: shapeSelect.value, ears: earSelect.value });
    shapeSelect.addEventListener('change', changeFace);
    earSelect.addEventListener('change', changeFace);
    const faceRow = document.createElement('div');
    faceRow.append('顔: ', shapeSelect, ' 耳: ', earSelect);
    details.append(faceRow);

    const eventSelect = document.createElement('select');
    for (const [value, label] of EVENT_OPTIONS) eventSelect.append(new Option(label, value));
    eventSelect.addEventListener('change', () => onEvent?.(eventSelect.value));
    const eventRow = document.createElement('div');
    eventRow.append('イベント: ', eventSelect);
    details.append(eventRow);

    const buttons = document.createElement('div');
    for (const [text, fn] of [['次の日へ', onSkipDay], ['信頼MAX', onTrustMax], ['最初から', onReset], ['記録を消す', onClearRecords]]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.addEventListener('click', fn);
      buttons.append(b);
    }
    details.append(buttons);

    const speedRow = document.createElement('div');
    speedRow.append('速度: ');
    const speedButtons = SPEEDS.map((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `${s}x`;
      b.addEventListener('click', () => {
        onSpeed(s);
        for (const other of speedButtons) other.style.background = other === b ? '#a0622d' : '';
      });
      speedRow.append(b);
      return b;
    });
    speedButtons[0].style.background = '#a0622d';
    details.append(speedRow);

    const pre = document.createElement('pre');
    details.append(pre);
    el.replaceChildren(details);

    const fmt = (v) => (typeof v === 'number' ? v.toFixed(1) : v);

    return {
      update({ personality, coat, face, scene, day, cat, mistakes }) {
        radios[personality].checked = true;
        if (document.activeElement !== coatSelect) coatSelect.value = coat;
        if (face && document.activeElement !== shapeSelect) shapeSelect.value = face.shape;
        if (face && document.activeElement !== earSelect) earSelect.value = face.ears;
        const lines = [`画面: ${scene}`, `ミス(累計): ${mistakes}`];
        if (day && cat) {
          lines.push(
            `信頼: ${fmt(day.trust)}`,
            `警戒: ${fmt(day.wariness)}`,
            `距離: ${fmt(cat.distance)}（下限 ${fmt(distanceFloor(day.trust, day.floorBonus))}）`,
            `様子: ${cat.mode}`,
            `残り: ${fmt(day.timeLeft)}秒`,
            `信頼倍率: ${day.trustRate}`,
          );
        }
        pre.textContent = lines.join('\n');
      },
    };
  }
  return { createDebugPanel };
})();

// ---- src/ui/sound.js
__modules['src/ui/sound.js'] = (() => {
  // 効果音（WebAudio で合成。音声ファイルは使わない）と振動。
  // ブラウザは操作の前に音を鳴らせないので、最初のタップで unlock() を呼ぶ。
  const STORAGE_KEY = 'neko-wakai:sound';

  function createSound() {
    let ac = null;
    let noise = null;
    // 効果音の出口。声を大きくしても音割れしないよう、軽くまとめる（リミッター）
    let out = null;
    let enabled = load();
    // 音の準備に失敗した（この環境では効果音を鳴らせない）
    let failed = false;

    // 音を準備できない環境では、一度だけ知らせて効果音なしでゲームを続ける（src/ui/music.js の BGM と同じ）。
    // 失敗したら作りかけの AudioContext は捨て、以後は作り直さない
    function prepare(AC) {
      try {
        ac = new AC();
        noise = makeNoise(ac);
        out = ac.createDynamicsCompressor();
        out.threshold.value = -6;
        out.knee.value = 3;
        out.ratio.value = 8;
        out.attack.value = 0.003;
        out.release.value = 0.15;
        // WebAudio のリミッターは自動で音量を持ち上げる（メイクアップゲイン）ので、その分を下げて出す。
        // 0.8 で、ゴロゴロ・にゃーんが約4dB大きくなり、ピークは −1dB 未満に収まる（docs/spec.md 13.2）
        const trim = ac.createGain();
        trim.gain.value = 0.8;
        out.connect(trim).connect(ac.destination);
        return true;
      } catch (e) {
        console.warn('効果音を準備できませんでした', e);
        failed = true;
        ac?.close?.().catch(() => {});
        ac = null;
        noise = null;
        out = null;
        return false;
      }
    }

    function unlock() {
      if (!enabled || failed) return;
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC || !prepare(AC)) return;
      }
      if (ac.state === 'suspended') ac.resume();
    }

    function ready() {
      return enabled && !failed && ac && ac.state === 'running';
    }

    function vibrate(pattern) {
      if (enabled && navigator.vibrate) navigator.vibrate(pattern);
    }

    // ゴロゴロ：低くこもったノイズを、1秒に25回ほど強弱させる。
    // スマホのスピーカーでも聞こえるよう、こもり具合（lowpass）は 320Hz まで通す
    function purr(sec = 1.6, volume = 1.6) {
      vibrate([25, 35, 25, 35, 25, 35, 25]);
      if (!ready()) return;
      const t = ac.currentTime;
      const src = ac.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      const am = ac.createGain();
      am.gain.value = 0.5;
      const lfo = ac.createOscillator();
      lfo.frequency.value = 25;
      const lfoDepth = ac.createGain();
      lfoDepth.gain.value = 0.5;
      lfo.connect(lfoDepth).connect(am.gain);
      const env = ac.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(volume, t + 0.25);
      env.gain.setValueAtTime(volume, t + sec - 0.4);
      env.gain.linearRampToValueAtTime(0, t + sec);
      src.connect(lp).connect(am).connect(env).connect(out);
      src.start(t);
      lfo.start(t);
      src.stop(t + sec);
      lfo.stop(t + sec);
    }

    // まばたきを返してくれた：「にゃーん」（試作 prototype/meow の4番。長さ0.55秒）。
    // のこぎり波（声の元）を、口の開き具合を表すフィルターに通す。高さは「にゃ」で上がって「ーん」で下がり、
    // 響きは n（閉じた口）→ a（開いた口）→ n と変わる
    function meow() {
      if (!ready()) return;
      const t = ac.currentTime + 0.02;
      const d = 0.55;
      const f0 = [660, 890, 670];
      const [closed, wide, end] = [460, 1400, 585];
      const src = ac.createOscillator();
      src.type = 'sawtooth';
      src.frequency.setValueAtTime(f0[0], t);
      src.frequency.linearRampToValueAtTime(f0[1], t + d * 0.35);
      src.frequency.linearRampToValueAtTime(f0[2], t + d);
      // ゆれ（ビブラート）は、のびる後半から
      const lfo = ac.createOscillator();
      lfo.frequency.value = 6;
      const depth = ac.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(f0[1] * 0.0125, t + d * 0.6);
      lfo.connect(depth).connect(src.frequency);
      // 全体の音量の形：ふわっと入って、最後はすっと消える（試作より約4dB大きい）
      const env = ac.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.8, t + 0.05);
      env.gain.setValueAtTime(0.8, t + d * 0.55);
      env.gain.linearRampToValueAtTime(0.5, t + d * 0.8);
      env.gain.linearRampToValueAtTime(0, t + d);
      // 口の開き具合：1つ目の響き（F1）と2つ目の響き（F2）
      for (const [k, q, level] of [[1, 3, 1], [1.9, 5, 0.55]]) {
        const f = ac.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = q;
        f.frequency.setValueAtTime(closed * k, t);
        f.frequency.linearRampToValueAtTime(wide * k, t + d * 0.3);
        f.frequency.linearRampToValueAtTime(wide * 0.9 * k, t + d * 0.6);
        f.frequency.linearRampToValueAtTime(end * k, t + d);
        const g = ac.createGain();
        g.gain.value = level;
        src.connect(f).connect(g).connect(env);
      }
      // 鼻にかかった「n」の成分（低いところだけ）
      const nasal = ac.createBiquadFilter();
      nasal.type = 'lowpass';
      nasal.frequency.value = 450;
      const gn = ac.createGain();
      gn.gain.value = 0.35;
      src.connect(nasal).connect(gn).connect(env);
      env.connect(out);
      src.start(t);
      lfo.start(t);
      src.stop(t + d + 0.05);
      lfo.stop(t + d + 0.05);
    }

    // 逃げた・猫キック：短い「ぽふっ」
    function bump() {
      vibrate(70);
      if (!ready()) return;
      const t = ac.currentTime;
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, t);
      osc.frequency.exponentialRampToValueAtTime(90, t + 0.15);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 0.2);
    }

    // 本のページをめくる：紙がこすれる短い「パラッ」。ゴロゴロのノイズを速く再生して高くし、高いところだけ通す
    function page() {
      if (!ready()) return;
      const t = ac.currentTime;
      const src = ac.createBufferSource();
      src.buffer = noise;
      src.playbackRate.value = 6;
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1200;
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      src.connect(hp).connect(g).connect(out);
      src.start(t);
      src.stop(t + 0.18);
    }

    return {
      unlock,
      purr,
      meow,
      bump,
      page,
      get enabled() {
        return enabled;
      },
      setEnabled(v) {
        enabled = v;
        save(v);
        if (v) unlock();
        else ac?.suspend();
      },
    };
  }

  function makeNoise(ac) {
    const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const data = buf.getChannelData(0);
    // 低い音が多いノイズ（ブラウンノイズ）
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    return buf;
  }

  // 設定の保存はこの端末の中だけ（外部には送らない）。使えない環境では毎回 ON から始める
  function load() {
    try {
      return localStorage.getItem(STORAGE_KEY) !== 'off';
    } catch {
      return true;
    }
  }

  function save(v) {
    try {
      localStorage.setItem(STORAGE_KEY, v ? 'on' : 'off');
    } catch {
      // 保存できなくても遊べる
    }
  }
  return { createSound };
})();

// ---- src/data/bgmSongs.js
__modules['src/data/bgmSongs.js'] = (() => {
  // BGM の楽譜。書き方は src/ui/bgmScore.js の先頭を参照。
  // どの曲も 8小節 × 2（A・B）をくり返す。穏やかで明るいポップス（試聴：tools/bgm-preview/index.html）

  const BGM_SONGS = [
    {
      id: 'hidamari',
      title: 'ひだまり',
      mood: 'マリンバとエレピの、のんびりした昼さがり',
      scene: '昼（猫を待つ時間）',
      key: 'F',
      bpm: 92,
      swing: 0,
      lead: { voice: 'marimba', vol: 0.5 },
      comp: [{ voice: 'epiano', vol: 0.16, rhythm: '..x...x...x...x.', len: 2 }],
      bass: { voice: 'bass', vol: 0.15, rhythm: 'x.......5.....x.' },
      drums: [
        { voice: 'kick', vol: 0.7, rhythm: 'x.......x.......' },
        { voice: 'shaker', vol: 0.17, rhythm: 'o.x.o.x.o.x.o.x.' },
        { voice: 'snap', vol: 0.22, rhythm: '....x.......x...' },
      ],
      sections: [
        {
          chords: ['F', 'Am', 'Bb', 'C', 'F', 'Am', 'Bb C', 'F'],
          melody: [
            'A4 C5 F5 - E5 F5 C5 -',
            'E5 - C5 - A4 - - .',
            'D5 F5 Bb5 - F5 - D5 -',
            'G5 - - - . E5 F5 G5',
            'A5 - G5 F5 C5 - A4 -',
            'C5 - E5 - A5 - E5 -',
            'F5 - D5 - E5 - G5 -',
            'F5 - - - . . . .',
          ],
        },
        {
          chords: ['Bb', 'C', 'Am', 'Dm', 'Gm', 'C', 'Bb', 'C'],
          melody: [
            'D5 - - C5 D5 - F5 -',
            'E5 - - D5 C5 - G4 -',
            'A4 - C5 - E5 - D5 C5',
            'D5 - - - F5 - A5 -',
            'Bb5 - A5 - G5 - D5 -',
            'E5 - G5 - C5 - - .',
            'D5 - F5 - Bb4 - D5 -',
            'E5 - D5 - C5 - - .',
          ],
        },
      ],
    },
    {
      id: 'osanpo',
      title: 'おさんぽ日和',
      mood: '口笛とウクレレの、軽い足取り',
      scene: 'タイトル・昼',
      key: 'C',
      bpm: 112,
      swing: 0,
      lead: { voice: 'whistle', vol: 0.3 },
      comp: [{ voice: 'pluck', vol: 0.2, rhythm: 'x..x..x.x..x.x..', len: 2 }],
      bass: { voice: 'bass', vol: 0.15, rhythm: 'x...5...x...5...' },
      drums: [
        { voice: 'kick', vol: 0.63, rhythm: 'x.......x.......' },
        { voice: 'hat', vol: 0.13, rhythm: 'x.o.x.o.x.o.x.o.' },
        { voice: 'snap', vol: 0.28, rhythm: '....x.......x...' },
      ],
      sections: [
        {
          chords: ['C', 'G', 'Am', 'F', 'C', 'G', 'F G', 'C'],
          melody: [
            'G4 . C5 . E5 - D5 C5',
            'D5 - B4 - G4 - . .',
            'A4 . C5 . E5 - D5 C5',
            'C5 - A4 - F4 - . .',
            'G4 . C5 . E5 - G5 -',
            'G5 - D5 - B4 - G4 -',
            'A4 - C5 - B4 - D5 -',
            'C5 - - - . . . .',
          ],
        },
        {
          chords: ['F', 'G', 'Em', 'Am', 'Dm', 'G', 'C', 'G'],
          melody: [
            'A5 - G5 - F5 - C5 -',
            'D5 - G5 - - - . .',
            'G5 - E5 - B4 - E5 -',
            'C5 - - - A4 - . .',
            'D5 - F5 - A5 - G5 F5',
            'D5 - - - B4 - . .',
            'C5 - E5 - G5 - E5 -',
            'D5 - - - . . . .',
          ],
        },
      ],
    },
    {
      id: 'ohirune',
      title: 'おひるね',
      mood: 'オルゴールとやわらかい和音の、ゆったりした曲',
      scene: '夜・名前を付けるとき',
      key: 'G',
      bpm: 76,
      swing: 0,
      lead: { voice: 'musicbox', vol: 0.4, octave: 1 },
      comp: [
        { voice: 'pad', vol: 0.07, rhythm: 'x...............', len: 16 },
        { voice: 'epiano', vol: 0.1, rhythm: 'o.o.o.o.o.o.o.o.', len: 3, arp: true },
      ],
      bass: { voice: 'bass', vol: 0.13, rhythm: 'x.......5.......' },
      drums: [{ voice: 'shaker', vol: 0.3, rhythm: '..o...o...o...o.' }],
      sections: [
        {
          chords: ['Gmaj7', 'Cmaj7', 'Gmaj7', 'Cmaj7', 'Am7', 'D', 'Bm7 Em7', 'Am7 D'],
          melody: [
            'B4 - D5 - F#5 - - .',
            'E5 - D5 - B4 - - .',
            'B4 - D5 - G5 - F#5 -',
            'E5 - - - - - . .',
            'C5 - E5 - G5 - E5 -',
            'F#5 - - - A4 - . .',
            'D5 - B4 - G5 - E5 -',
            'C5 - - - F#4 - A4 -',
          ],
        },
        {
          chords: ['Em7', 'Am7', 'D', 'G', 'Em7', 'Am7', 'Cmaj7 D', 'G'],
          melody: [
            'G5 - F#5 - E5 - B4 -',
            'C5 - - - E5 - . .',
            'D5 - E5 - F#5 - A5 -',
            'G5 - - - - - . .',
            'B5 - G5 - E5 - D5 -',
            'E5 - G5 - C5 - - .',
            'B4 - C5 - D5 - F#5 -',
            'G5 - - - . . . .',
          ],
        },
      ],
    },
    {
      id: 'shippo',
      title: 'しっぽふりふり',
      mood: '鉄琴とはずむリズムの、ごきげんな曲',
      scene: 'エンディング（和解できたとき）',
      key: 'D',
      bpm: 100,
      swing: 0.6,
      lead: { voice: 'bell', vol: 0.42, octave: 1 },
      comp: [{ voice: 'epiano', vol: 0.16, rhythm: '..x...x...x...x.', len: 2 }],
      bass: { voice: 'bass', vol: 0.15, rhythm: 'x...3...5...3...' },
      drums: [
        { voice: 'kick', vol: 0.63, rhythm: 'x.......x.......' },
        { voice: 'hat', vol: 0.11, rhythm: 'x.o.x.o.x.o.x.o.' },
        { voice: 'snap', vol: 0.28, rhythm: '....x.......x...' },
      ],
      sections: [
        {
          chords: ['D', 'Bm', 'G', 'A', 'D', 'Bm', 'Em A', 'D'],
          melody: [
            'F#5 - A5 - F#5 - D5 -',
            'B4 - D5 - F#5 - - .',
            'G5 - B5 - G5 - D5 -',
            'E5 - - - C#5 - . .',
            'D5 - F#5 - A5 - B5 A5',
            'F#5 - D5 - B4 - D5 -',
            'E5 - G5 - C#5 - E5 -',
            'D5 - - - . . . .',
          ],
        },
        {
          chords: ['G', 'A', 'F#m', 'Bm', 'Em', 'A', 'G', 'A'],
          melody: [
            'B4 - D5 - G5 - - .',
            'A4 - C#5 - E5 - - .',
            'F#5 - C#5 - A4 - C#5 -',
            'B4 - - - D5 - . .',
            'G5 - F#5 - E5 - B4 -',
            'C#5 - E5 - A5 - - .',
            'B5 - A5 - G5 - D5 -',
            'E5 - - - C#5 - A4 -',
          ],
        },
      ],
    },
  ];
  return { BGM_SONGS };
})();

// ---- src/ui/bgmScore.js
__modules['src/ui/bgmScore.js'] = (() => {
  // BGM の楽譜（src/data/bgmSongs.js）を、16分音符ごとの発音リストに変換する。WebAudio には依存しない。
  //
  // 楽譜の書き方
  // - メロディ：1小節を空白区切りの 8個（8分音符）・16個（16分音符）・4個（4分音符）で書く。
  //   音名（C5, Bb4, F#5）＝ 鳴らす / '-' ＝ 前の音をのばす（小節をまたいでもよい）/ '.' ＝ 休み
  // - リズム：1小節を16文字で書く。'.' ＝ 休み / 'x' ＝ 強く / 'o' ＝ 弱く
  //   ベースだけは 'x' の代わりに '5'（5度上）'3'（3度上）'8'（1オクターブ上）も使える
  // - コード：1小節に1つ。空白で区切って2つ書くと、半分ずつになる

  const STEPS_PER_BAR = 16;

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

  function noteToMidi(name) {
    const m = /^([A-G])([#b]?)(\d)$/.exec(name);
    if (!m) throw new Error(`音名が読めない: ${name}`);
    return 12 * (Number(m[3]) + 1) + PITCH[m[1]] + (ACCIDENTAL[m[2]] ?? 0);
  }

  /** @returns {{root: number, intervals: number[]}} root は 0（C）〜11（B） */
  function parseChord(name) {
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
  function compileSong(song) {
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
  return { STEPS_PER_BAR, noteToMidi, parseChord, compileSong };
})();

// ---- src/ui/bgm.js
__modules['src/ui/bgm.js'] = (() => {
  // BGM の再生（WebAudio で合成。音声ファイルは使わない）。
  // 楽譜は src/data/bgmSongs.js、楽譜から発音リストへの変換は src/ui/bgmScore.js。
  const { compileSong, STEPS_PER_BAR } = __modules['src/ui/bgmScore.js'];

  // 少し先まで予約しておく（タイマーが遅れても音が途切れないように）
  const AHEAD_SEC = 0.3;
  const TICK_MS = 50;
  // 音色ごとの残響の量（ないものは残響なし）
  const WET = { marimba: 0.3, piano: 0.25, pluck: 0.2, whistle: 0.35, epiano: 0.3, musicbox: 0.45, bell: 0.4, pad: 0.5, snap: 0.15 };

  /**
   * @param ac AudioContext（OfflineAudioContext でもよい）
   * @param opts.aheadSec 先に予約する秒数。書き出しのときは曲の長さを渡すと一度に全部予約できる
   * @param opts.volume 全体の音量（最初からこの音量で鳴らす）
   */
  function createBgm(ac, { destination = ac.destination, aheadSec = AHEAD_SEC, volume = 0.6 } = {}) {
    const master = ac.createGain();
    master.gain.value = volume;
    // 音が重なったときに割れないように、軽くまとめる
    const limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 6;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.005;
    limiter.release.value = 0.2;
    master.connect(limiter).connect(destination);
    const noise = makeNoise(ac);
    const impulse = makeImpulse(ac, 2.2);
    let playing = null;

    function play(song) {
      stop(0.4);
      const score = compileSong(song);
      const bus = ac.createGain();
      bus.connect(master);
      const verb = ac.createConvolver();
      verb.buffer = impulse;
      verb.connect(bus);
      const p = { song, score, bus, verb, step: 0, time: ac.currentTime + 0.1, timer: null };
      playing = p;
      schedule(p);
      p.timer = setInterval(() => schedule(p), TICK_MS);
    }

    function schedule(p) {
      const now = ac.currentTime;
      // タブが裏に回ってタイマーが止まっていたら、今から鳴らし直す
      if (p.time < now - 0.2) p.time = now + 0.05;
      while (p.time < now + aheadSec) {
        const swing = p.step % 4 === 2 ? p.song.swing * p.score.stepSec : 0;
        for (const e of p.score.steps[p.step]) note(p, e, p.time + swing);
        p.time += p.score.stepSec;
        p.step = (p.step + 1) % p.score.totalSteps;
      }
    }

    function note(p, e, t) {
      const out = ac.createGain();
      // 機械っぽさを減らすため、強さを少しだけばらつかせる
      out.gain.value = e.vol * (0.9 + Math.random() * 0.1);
      out.connect(p.bus);
      if (WET[e.voice]) {
        const send = ac.createGain();
        send.gain.value = WET[e.voice];
        out.connect(send).connect(p.verb);
      }
      const dur = e.len * p.score.stepSec;
      const ctx = { ac, out, t, dur, noise };
      for (const m of [].concat(e.midi)) VOICES[e.voice]({ ...ctx, f: m === null ? 0 : 440 * 2 ** ((m - 69) / 12) });
    }

    function stop(fadeSec = 0.8) {
      if (!playing) return;
      const p = playing;
      playing = null;
      clearInterval(p.timer);
      const now = ac.currentTime;
      p.bus.gain.cancelScheduledValues(now);
      p.bus.gain.setValueAtTime(p.bus.gain.value, now);
      p.bus.gain.linearRampToValueAtTime(0, now + fadeSec);
      setTimeout(() => p.bus.disconnect(), (fadeSec + 3) * 1000);
    }

    return {
      play,
      stop,
      setVolume(v) {
        master.gain.setTargetAtTime(v, ac.currentTime, 0.05);
      },
      get current() {
        return playing?.song.id ?? null;
      },
      // いま鳴っている小節（0始まり）。止まっていれば null
      bar() {
        if (!playing) return null;
        const { score, step, time } = playing;
        const behind = Math.ceil((time - ac.currentTime) / score.stepSec);
        const now = (step - behind + score.totalSteps) % score.totalSteps;
        return Math.floor(now / STEPS_PER_BAR);
      },
    };
  }

  // ---- 音色。どれも ({ac, out, f, t, dur, noise}) を受け取り、out につなぐ

  function osc(ac, type, freq, t, end) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.start(t);
    o.stop(end);
    return o;
  }

  // 叩く・はじく音：すぐ立ち上がり、decaySec でほぼ消える
  function hitEnv(ac, out, t, decaySec, peak = 1) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.004, decaySec / 5);
    g.connect(out);
    return g;
  }

  // のばす音：attack で立ち上がり、sustain まで下がって、dur のあと release で消える
  function holdEnv(ac, out, t, dur, { attack, sustain = 1, decay = 0.3, release }) {
    const g = ac.createGain();
    const end = t + Math.max(dur, attack + 0.01);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + attack);
    g.gain.setTargetAtTime(sustain, t + attack, decay / 3);
    g.gain.setTargetAtTime(0, end, release / 4);
    g.connect(out);
    return { g, end: end + release };
  }

  function lowpass(ac, out, freq, q = 0.7) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(out);
    return f;
  }

  function noiseBurst({ ac, out, t, noise }, type, freq, q, decaySec) {
    const src = ac.createBufferSource();
    src.buffer = noise;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f).connect(hitEnv(ac, out, t, decaySec));
    src.start(t, Math.random() * 0.5);
    src.stop(t + decaySec);
  }

  const VOICES = {
    // 木の板を叩いたような音
    marimba({ ac, out, f, t }) {
      const g = hitEnv(ac, out, t, 0.9);
      osc(ac, 'sine', f, t, t + 0.9).connect(g);
      osc(ac, 'sine', f * 4, t, t + 0.12).connect(hitEnv(ac, g, t, 0.1, 0.25));
    },
    piano({ ac, out, f, t, dur }) {
      const { g, end } = holdEnv(ac, out, t, dur, { attack: 0.005, sustain: 0.25, decay: 0.9, release: 0.25 });
      const lp = lowpass(ac, g, 2500);
      osc(ac, 'triangle', f, t, end).connect(lp);
      osc(ac, 'sine', f * 2, t, end).connect(hitEnv(ac, lp, t, 0.4, 0.3));
    },
    // ウクレレのような、はじく音
    pluck({ ac, out, f, t }) {
      const g = hitEnv(ac, out, t, 0.5);
      const lp = lowpass(ac, g, 2600, 1);
      lp.frequency.setTargetAtTime(700, t, 0.04);
      osc(ac, 'triangle', f, t, t + 0.5).connect(lp);
      osc(ac, 'sawtooth', f, t, t + 0.5).connect(hitEnv(ac, lp, t, 0.3, 0.35));
    },
    // 口笛：やわらかく入って、のばすと少しゆれる
    whistle({ ac, out, f, t, dur }) {
      const { g, end } = holdEnv(ac, out, t, dur, { attack: 0.04, sustain: 0.85, decay: 0.2, release: 0.12 });
      const o = osc(ac, 'sine', f, t, end);
      const vib = osc(ac, 'sine', 5.5, t, end);
      const depth = ac.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(f * 0.012, t + 0.25);
      vib.connect(depth).connect(o.frequency);
      o.connect(g);
    },
    // エレクトリックピアノ：丸い音に、叩いた瞬間の金属っぽさを少し
    epiano({ ac, out, f, t, dur }) {
      const { g, end } = holdEnv(ac, out, t, dur, { attack: 0.005, sustain: 0.35, decay: 0.9, release: 0.3 });
      osc(ac, 'sine', f, t, end).connect(g);
      osc(ac, 'sine', f * 2, t, end).connect(hitEnv(ac, g, t, 0.6, 0.18));
      osc(ac, 'sine', f * 7, t, t + 0.06).connect(hitEnv(ac, g, t, 0.05, 0.06));
    },
    musicbox({ ac, out, f, t }) {
      const g = hitEnv(ac, out, t, 1.6);
      osc(ac, 'sine', f, t, t + 1.6).connect(g);
      osc(ac, 'sine', f * 3, t, t + 0.3).connect(hitEnv(ac, g, t, 0.3, 0.18));
    },
    // 鉄琴
    bell({ ac, out, f, t }) {
      const g = hitEnv(ac, out, t, 1.1);
      osc(ac, 'sine', f, t, t + 1.1).connect(g);
      osc(ac, 'sine', f * 2.76, t, t + 0.3).connect(hitEnv(ac, g, t, 0.25, 0.3));
      osc(ac, 'sine', f * 5.4, t, t + 0.12).connect(hitEnv(ac, g, t, 0.1, 0.1));
    },
    // ふんわりした和音の背景
    pad({ ac, out, f, t, dur }) {
      const { g, end } = holdEnv(ac, out, t, dur, { attack: 0.5, release: 0.8 });
      const lp = lowpass(ac, g, 900, 0.5);
      for (const cents of [-7, 7]) osc(ac, 'sawtooth', f * 2 ** (cents / 1200), t, end).connect(lp);
    },
    bass({ ac, out, f, t, dur }) {
      const { g, end } = holdEnv(ac, out, t, dur * 0.9, { attack: 0.008, sustain: 0.6, decay: 0.4, release: 0.08 });
      const lp = lowpass(ac, g, 700);
      osc(ac, 'triangle', f, t, end).connect(lp);
      osc(ac, 'sine', f, t, end).connect(lp);
    },
    // やわらかいバスドラム
    kick({ ac, out, t }) {
      const o = osc(ac, 'sine', 130, t, t + 0.3);
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.1);
      o.connect(hitEnv(ac, out, t, 0.3));
    },
    hat: (c) => noiseBurst(c, 'highpass', 8000, 0.7, 0.05),
    shaker: (c) => noiseBurst(c, 'bandpass', 6000, 0.8, 0.09),
    // 指パッチン
    snap: (c) => noiseBurst(c, 'bandpass', 2200, 3, 0.08),
  };

  function makeNoise(ac) {
    const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // 部屋の残響：だんだん小さくなるノイズ（左右で別のノイズにして広がりを出す）
  function makeImpulse(ac, sec) {
    const len = Math.floor(ac.sampleRate * sec);
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    return buf;
  }
  return { createBgm };
})();

// ---- src/ui/music.js
__modules['src/ui/music.js'] = (() => {
  // BGM の選曲。画面左下の曲名（横に流れる）をタップすると、次の曲 → … → OFF → 最初の曲 と切り替わる。
  // 選んだ曲はどの画面でも流れ続ける。効果音（src/ui/sound.js）の ON/OFF とは別。
  const { BGM_SONGS } = __modules['src/data/bgmSongs.js'];
  const { BGM_TEXT } = __modules['src/data/texts.js'];
  const { createBgm } = __modules['src/ui/bgm.js'];

  const STORAGE_KEY = 'neko-wakai:bgm';
  const BGM_OFF = 'off';
  // BGM は、猫の声（ゴロゴロ・にゃーん）が埋もれない大きさにする。測り方と数値は docs/spec.md 13.2
  const BGM_VOLUME = 0.08;

  function nextTrack(current, ids) {
    const order = [...ids, BGM_OFF];
    return order[(order.indexOf(current) + 1) % order.length];
  }

  function createMusic({ button, titleEl }) {
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
        bgm = createBgm(ac, { volume: BGM_VOLUME });
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
  return { BGM_OFF, BGM_VOLUME, nextTrack, createMusic };
})();

// ---- src/ui/pauseMenu.js
__modules['src/ui/pauseMenu.js'] = (() => {
  // 一時停止メニュー：「つづける」「タイトルにもどる」。タイトルにもどるときは、思い出に残らないことを一度確かめる。
  // 開いている間は、src/main.js が昼の時間と猫の動きを止める
  const { PAUSE_TEXT } = __modules['src/data/texts.js'];

  function createPauseMenu({ el, onResume, onQuit }) {
    // 開くたびに増える番号。閉じる前に作ったボタンを、閉じたあとに押しても何もしないように使う
    let session = 0;
    let open = false;

    function button(className, text, onClick) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = className;
      b.textContent = text;
      const mine = session;
      b.addEventListener('click', () => {
        if (open && mine === session) onClick();
      });
      return b;
    }

    function panel(...children) {
      const node = document.createElement('div');
      node.className = 'pause-panel';
      node.append(...children);
      el.replaceChildren(node);
    }

    function text(tag, value) {
      const node = document.createElement(tag);
      node.textContent = value;
      return node;
    }

    function showMenu() {
      panel(
        text('h3', PAUSE_TEXT.title),
        button('pause-resume', PAUSE_TEXT.resume, () => {
          close();
          onResume();
        }),
        button('pause-quit', PAUSE_TEXT.quit, showConfirm),
      );
    }

    function showConfirm() {
      panel(
        text('p', PAUSE_TEXT.confirm),
        button('pause-cancel', PAUSE_TEXT.confirmNo, showMenu),
        button('pause-confirm', PAUSE_TEXT.confirmYes, () => {
          close();
          onQuit();
        }),
      );
    }

    function close() {
      open = false;
      session++;
      el.hidden = true;
      el.replaceChildren();
    }

    return {
      open() {
        session++;
        open = true;
        el.hidden = false;
        showMenu();
      },
      close,
      get isOpen() {
        return open;
      },
      // 遊びの操作（なでる・まばたき）を包む。メニューを開いている間は通さない
      whilePlaying(fn) {
        return (...args) => {
          if (!open) fn(...args);
        };
      },
    };
  }
  return { createPauseMenu };
})();

// ---- src/scenes/titleScene.js
__modules['src/scenes/titleScene.js'] = (() => {
  const { TITLE, NOTEBOOK_TEXT } = __modules['src/data/texts.js'];
  const { drawCatPortrait } = __modules['src/render/renderer.js'];

  // 「ねこ手帳」ボタンの猫の絵の細かさ（Canvas の画素数）。画面上の大きさは style.css の .title-notebook-icon で、文字の大きさに合わせる
  const ICON_RES = 96;

  // onNotebook: 「ねこ手帳」ボタン（画面のほかの場所をタップすると、はじめる）
  function createTitleScene({ screenEl, onStart, onNotebook }) {
    const node = document.createElement('div');
    node.className = 'title-screen';
    node.innerHTML = `
      <div class="title-band">
        <h1 class="title-logo"></h1>
        <p class="title-sub"></p>
        <div class="title-paws">ฅ^•ω•^ฅ</div>
      </div>
      <div class="title-start"></div>`;
    node.querySelector('.title-logo').textContent = TITLE.main;
    node.querySelector('.title-sub').textContent = TITLE.sub;
    node.querySelector('.title-start').textContent = TITLE.start;
    const notebook = document.createElement('button');
    notebook.type = 'button';
    notebook.className = 'title-notebook';
    const icon = document.createElement('canvas');
    icon.className = 'title-notebook-icon';
    icon.width = ICON_RES;
    icon.height = ICON_RES;
    drawCatPortrait(icon, 'chatora');
    const label = document.createElement('span');
    label.textContent = NOTEBOOK_TEXT.open;
    notebook.append(icon, label);
    notebook.addEventListener('click', () => {
      screenEl.replaceChildren();
      onNotebook();
    }, { once: true });
    node.append(notebook);
    // 「ねこ手帳」ボタンを押したときは、はじめない（押した操作は window まで伝わり、音の準備は始まる）
    const start = (e) => {
      if (e.target.closest?.('.title-notebook')) return;
      node.removeEventListener('pointerdown', start);
      screenEl.replaceChildren();
      onStart();
    };
    node.addEventListener('pointerdown', start);
    screenEl.replaceChildren(node);

    return {
      name: 'title',
      update() {},
      view: () => ({ scene: 'title' }),
    };
  }
  return { createTitleScene };
})();

// ---- src/scenes/nameScene.js
__modules['src/scenes/nameScene.js'] = (() => {
  // 1日目の最初：猫をアップにして、名前を付けてもらう。
  const { NAME_TEXT } = __modules['src/data/texts.js'];

  // 毛色に合った名前の候補から、毎回違う4つを選ぶ
  function namePicks(coat, random = Math.random) {
    const list = [...(NAME_TEXT.byCoat[coat] ?? NAME_TEXT.byCoat.chatora)];
    const picks = [];
    while (picks.length < 4 && list.length) picks.push(list.splice(Math.floor(random() * list.length), 1)[0]);
    return picks;
  }

  // coat: 今回の猫の毛色（名前の候補を決める）。onBack: 「もどる」で、同じ猫のままタイトルに戻る
  function createNameScene({ screenEl, coat, onDecide, onBack }) {
    const node = document.createElement('div');
    node.className = 'name-screen';

    const band = document.createElement('div');
    band.className = 'name-band';
    const h2 = document.createElement('h2');
    h2.textContent = NAME_TEXT.prompt;

    const field = document.createElement('input');
    field.type = 'text';
    field.maxLength = NAME_TEXT.maxLength;
    field.placeholder = NAME_TEXT.placeholder;
    field.autocomplete = 'off';
    field.enterKeyHint = 'done';

    const picks = namePicks(coat);
    const chips = document.createElement('div');
    chips.className = 'name-chips';
    for (const s of picks) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = s;
      b.addEventListener('click', () => {
        field.value = s;
      });
      chips.append(b);
    }
    field.placeholder = picks[0];

    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'name-ok';
    ok.textContent = NAME_TEXT.ok;

    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'name-back';
    back.textContent = NAME_TEXT.back;

    // 名前を決めるか「もどる」を押したら、この画面を離れる（そのあとの操作は受け付けない）
    let left = false;
    function leave(then) {
      if (left) return;
      left = true;
      field.blur();
      screenEl.replaceChildren();
      then();
    }
    const decide = () => leave(() => onDecide(cleanName(field.value) || picks[0]));
    ok.addEventListener('click', decide);
    back.addEventListener('click', () => leave(onBack));
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) decide();
    });

    band.append(back, h2, field, chips, ok);
    node.append(band);
    screenEl.replaceChildren(node);

    return {
      name: 'name',
      update() {},
      view: () => ({ scene: 'name', closeup: true, cat: { mode: 'look', distance: 0 } }),
    };
  }

  // 前後の空白と改行・制御文字を取り除き、長さを制限する
  function cleanName(raw) {
    return [...raw.replace(/[\u0000-\u001f\u007f]/g, '').trim()].slice(0, NAME_TEXT.maxLength).join('');
  }
  return { namePicks, createNameScene };
})();

// ---- src/game/events.js
__modules['src/game/events.js'] = (() => {
  // イベント（4〜6日目）の進行。イベントの日は、いつもの様子の切り替え（src/game/catBrain.js の tick）の代わりにこれを使う。
  // 描画や入力には依存しない。なでる・まばたきの判定は、いつもの決まり（src/game/rules.js）に、猫の様子を読み替えて任せる。
  const { RULES, MAX_VALUE, EVENTS } = __modules['src/data/params.js'];
  const { ambient } = __modules['src/game/catBrain.js'];
  const { applyAction, isShy } = __modules['src/game/rules.js'];

  const clamp = (v) => Math.min(MAX_VALUE, Math.max(0, v));

  // 箱が届いた：phase ごとの猫の様子（もぐっている間は伏せて箱に隠れ、顔を出すときは座ってふちから頭を出す）
  const BOX_POSE = { approach: 'relax', arrive: 'tailUp', hop: 'tailUp', hide: 'relax', peek: 'look', happy: 'purr' };
  // 箱の中にいる phase（なでると「箱の奥に引っ込んだ」になる）
  const IN_BOX = ['hide', 'peek', 'happy'];

  // 窓の外に鳥：鳥が来ている間は窓のほうを向いて背中を見せ、鳥が去ったら振り向いてこっちを見る。shy はツンで目をそらしたとき
  const BIRD_POSE = { approach: 'relax', arrive: 'backTurn', hunt: 'backTurn', leave: 'backTurn', turn: 'look', happy: 'purr', shy: 'relax' };

  function createEventState(id) {
    const base = { id, phase: 'approach', phaseT: 0, blinks: 0, done: false };
    // round：鳥が来て去った回数（触って邪魔した回も数える）。watched：狩りを最後まで見守れた回数。huntFor：今回の狩りの長さ
    if (id === 'bird') return { ...base, round: 0, watched: 0, huntFor: 0 };
    // readLeft：ページをめくってから、まだ読んでいる残り秒。wondered：読むのをやめて「……？」となったか（その日1回だけ）
    if (id === 'read') return { ...base, phase: 'read', readLeft: 0, pages: 0, wondered: false };
    return { ...base, hideFor: 0 };
  }

  /**
   * @returns {{ev, cat, day, cues: string[]}} cues：この tick で起きたこと
   *   箱：'drop' 箱が置かれた / 'hid' もぐった / 'peek' 顔を出した / 'watched' ツンの間に、まばたきせずに見送れた / 'out' 出てきた
   *   鳥：'hunt' 狩りを始めた / 'understood' 初めて見守れて、鳥が去った（わかってくれた） / 'left' 2回目以降に見守れて、鳥が去った
   *   読書：'wonder' 初めて読むのをやめた（……？） / 'onBook' 膝の前まで来て、本をのぞき込んできた
   */
  function eventTick(ev, cat, day, personality, dt, rng) {
    const a = ambient(day, dt);
    let d = a.day;
    if (a.calm) d = { ...d, trust: clamp(d.trust + RULES.calmTrustPerSec * dt * d.trustRate) };
    const e = { ...ev, phaseT: ev.phaseT + dt };
    const c = { ...cat, walking: false };
    // 読書中：猫が段ボールの中にいても、逃げていても、読んでいる時間は過ぎていく（歩くのは readTick で、落ち着いているときだけ）
    const reading = e.id === 'read' && e.readLeft > 0;
    if (reading) e.readLeft = Math.max(0, e.readLeft - dt);

    if (d.boxLockLeft > 0) {
      // 前の晩に置いた段ボールから、まだ出てこない（いつもの日と同じ）。出てきてから、イベントが始まる
      d = { ...d, boxLockLeft: Math.max(0, d.boxLockLeft - dt) };
      c.mode = 'inBox';
      return { ev: e, cat: c, day: d, cues: [] };
    }

    if (c.mode === 'flee') {
      // 逃げている間は、いつもの決まりの長さだけ待ってから、もう一度歩く
      c.modeTimeLeft = (c.modeTimeLeft ?? 0) - dt;
      if (c.modeTimeLeft > 0) return { ev: e, cat: c, day: d, cues: [] };
      c.mode = 'relax';
    }

    const step = { bird: birdTick, read: readTick }[e.id] ?? boxTick;
    return step(e, c, d, personality, dt, rng, a.calm, reading);
  }

  // 落ち着いていれば、くつろいで target まで歩く
  function walkTo(c, d, personality, dt, calm, target) {
    if (c.distance > target && calm) {
      c.distance = Math.max(target, c.distance - personality.approachSpeed * d.approachMul * dt);
      c.walking = c.distance > target;
    }
    return c.distance <= target;
  }

  function boxTick(e, c, d, personality, dt, rng, calm) {
    const P = EVENTS.box;
    const cues = [];
    const go = (phase) => {
      e = { ...e, phase, phaseT: 0 };
    };

    if (e.phase === 'approach') {
      if (walkTo(c, d, personality, dt, calm, P.boxDistance)) {
        go('arrive');
        cues.push('drop');
      }
    } else if (e.phase === 'arrive') {
      if (e.phaseT >= P.arriveSec) go('hop');
    } else if (e.phase === 'hop') {
      if (e.phaseT >= P.hopSec) {
        go('hide');
        e.hideFor = hideLength(rng);
        cues.push('hid');
      }
    } else if (e.phase === 'hide') {
      if (e.phaseT >= e.hideFor) {
        go('peek');
        cues.push('peek');
      }
    } else if (e.phase === 'peek') {
      if (e.phaseT >= P.peekSec) {
        // ツンの間はまばたきが通じない（照れる）ので、まばたきせずに見送れたら「見つめないでくれた」と1回数える
        const watched = isShy(d.trust, personality, d.dere);
        if (watched) {
          e = { ...e, blinks: e.blinks + 1 };
          cues.push('watched');
        }
        if (watched && e.blinks >= P.blinksToFinish) {
          go('happy');
        } else {
          go('hide');
          e.hideFor = hideLength(rng);
        }
      }
    } else if (e.phase === 'happy') {
      if (e.phaseT >= P.happySec) {
        if (e.blinks >= P.blinksToFinish) {
          go('out');
          e.done = true;
          d = { ...d, trust: clamp(d.trust + P.doneTrust * d.trustRate) };
          c.mode = 'relax';
          cues.push('out');
          return { ev: e, cat: c, day: d, cues };
        }
        go('hide');
        e.hideFor = hideLength(rng);
      }
    }
    c.mode = BOX_POSE[e.phase] ?? c.mode;
    return { ev: e, cat: c, day: d, cues };
  }

  function hideLength(rng) {
    const [min, max] = EVENTS.box.hideSec;
    return min + (max - min) * rng();
  }

  function birdTick(e, c, d, personality, dt, rng, calm) {
    const P = EVENTS.bird;
    const cues = [];
    const go = (phase, extra = {}) => {
      e = { ...e, ...extra, phase, phaseT: 0 };
    };
    const gain = (amount) => {
      d = { ...d, trust: clamp(d.trust + amount * d.trustRate) };
    };
    // 終わり。ごほうびとトーストは、最初に見守れた回に済ませているので、ここでは何も足さない
    const finish = () => {
      go('out', { done: true });
      c.mode = 'relax';
      return { ev: e, cat: c, day: d, cues };
    };

    // 背中を向けている間は、いつもの日と同じく「触らずに待てた」分だけ信頼が増える（性格の得意・苦手 likes.patience がかかる）
    if (c.mode === 'backTurn') gain(RULES.backTurnTrustPerSec * dt * personality.likes.patience);

    if (e.phase === 'approach') {
      if (walkTo(c, d, personality, dt, calm, P.birdDistance)) {
        if (e.round >= P.rounds) return finish();
        go('arrive');
      }
    } else if (e.phase === 'arrive') {
      if (e.phaseT >= P.arriveSec) {
        const [min, max] = P.huntSec;
        go('hunt', { huntFor: min + (max - min) * rng() });
        cues.push('hunt');
      }
    } else if (e.phase === 'hunt') {
      if (e.phaseT >= e.huntFor) {
        // 狩りの邪魔をしなかった：いつもの「我慢のごほうび」と同じ量。最初に見守れた回だけ、わかってくれた（doneTrust）
        const first = e.watched === 0;
        go('leave', { watched: e.watched + 1 });
        gain(RULES.patienceTrust * personality.likes.patience);
        if (first) gain(P.doneTrust);
        cues.push(first ? 'understood' : 'left');
      }
    } else if (e.phase === 'leave') {
      if (e.phaseT >= P.leaveSec) go('turn');
    } else if (e.phase === 'turn') {
      if (e.phaseT >= P.turnSec && endRound()) return finish();
    } else if (e.phase === 'happy' || e.phase === 'shy') {
      if (e.phaseT >= P.happySec && endRound()) return finish();
    }
    c.mode = BIRD_POSE[e.phase] ?? c.mode;
    return { ev: e, cat: c, day: d, cues };

    // その回が終わる。まだ回が残っていれば、鳥がまた来る。最後の回なら true
    function endRound() {
      const round = e.round + 1;
      e = { ...e, round };
      if (round >= P.rounds) return true;
      go('arrive');
      return false;
    }
  }

  // 読書中：読んでいる（ページをめくってから readSec の）間だけ、いつもの距離の下限を気にせず近づく。膝の前（距離0）まで来たら、本をのぞき込む（onBook。膝には乗らない）
  // reading：この tick のはじめに読んでいたか（readLeft は eventTick で減らしてある）
  function readTick(e, c, d, personality, dt, rng, calm, reading) {
    const P = EVENTS.read;
    const cues = [];

    if (e.phase === 'read') {
      c.mode = 'relax';
      if (reading) {
        if (calm) {
          c.distance = Math.max(0, c.distance - P.readSpeed * dt);
          c.walking = c.distance > 0;
        }
        if (e.readLeft === 0 && !e.wondered && c.distance > 0) {
          // 読むのをやめると、猫は「……？」と立ち止まる（遊び方に気づけるよう、その日の最初の1回だけ知らせる）
          e.wondered = true;
          cues.push('wonder');
        }
      }
      if (c.distance <= 0) {
        e = { ...e, phase: 'onBook', phaseT: 0 };
        d = { ...d, trust: clamp(d.trust + P.doneTrust * d.trustRate) };
        c.walking = false;
        cues.push('onBook');
      }
    } else if (e.phase === 'onBook') {
      if (e.phaseT >= P.onBookSec) {
        // のぞき込むのをやめる。信頼が膝に乗る信頼（ふつうは100）なら、そのまま膝に乗って和解（いつもの膝の流れ）
        e = { ...e, phase: 'out', phaseT: 0, done: true };
        const lap = d.canLap && d.trust >= (d.lapTrust ?? MAX_VALUE);
        c.mode = lap ? 'lap' : 'relax';
        if (!lap) c.modeTimeLeft = RULES.modeSec.relax[0];
        return { ev: e, cat: c, day: d, cues };
      }
    }
    if (e.phase === 'onBook') {
      c.mode = 'onBook';
      c.distance = 0;
    }
    return { ev: e, cat: c, day: d, cues };
  }

  /**
   * イベントの間のなでる・まばたき。いつもの決まり（applyAction）に、猫の様子を読み替えて渡す。
   * @returns {{ev, cat, day, feedback, mistake}|null} イベントが終わったあとは null（いつもの applyAction に任せる）
   */
  function eventAct(action, ev, cat, day, personality) {
    if (ev.done) return null;
    // ページをめくる（本のタップ）は読書中の日だけ。猫が逃げていても、段ボールの中にいてもめくれる
    if (action.type === 'page') {
      const turned = ev.id === 'read' && ev.phase === 'read';
      const next = turned ? { ...ev, readLeft: EVENTS.read.readSec, pages: ev.pages + 1 } : ev;
      return { ev: next, cat, day, feedback: null, mistake: false };
    }

    // 逃げている間・前の晩の段ボールの中では、いつもの日と同じ（逃げている猫には何も起きない。段ボールの中を触ると引っ込む）
    if (cat.mode === 'flee' || cat.mode === 'inBox') {
      const r = applyAction(action, cat, day, personality);
      return { ev, cat: r.cat, day: r.day, feedback: r.feedback, mistake: r.mistake };
    }
    const act = { bird: birdAct, read: readAct }[ev.id] ?? boxAct;
    return act(action, ev, cat, day, personality);
  }

  // 読書中：読んでいる間の猫は、くつろいでいるのと同じ（触ると逃げてミス、まばたきは「じっと見つめる」）。本をのぞき込んでいる間は何も起きない
  function readAct(action, ev, cat, day, personality) {
    const r = applyAction(action, { ...cat, mode: ev.phase === 'onBook' ? 'lap' : 'relax' }, day, personality);
    if (ev.phase === 'onBook') return { ev, cat, day: r.day, feedback: r.feedback, mistake: r.mistake };
    return { ev, cat: r.cat, day: r.day, feedback: r.feedback, mistake: r.mistake };
  }

  function boxAct(action, ev, cat, day, personality) {
    const P = EVENTS.box;
    const as = (mode) => applyAction(action, { ...cat, mode }, day, personality);

    if (action.type === 'blink') {
      // 押している間に顔を出していれば（sawLook）、離す前にもぐっても、いつもどおり目が合ったことにする
      if (ev.phase === 'peek' || (ev.phase === 'hide' && action.sawLook)) {
        const r = as('look');
        if (r.feedback === 'blinkBack') return result(BOX_POSE, { ...ev, blinks: ev.blinks + 1, phase: 'happy', phaseT: 0 }, cat, r);
        if (r.feedback === 'blinkAway') return result(BOX_POSE, { ...ev, phase: 'hide', phaseT: 0, hideFor: P.hideSec[0] }, cat, r);
        return result(BOX_POSE, ev, cat, r);
      }
      return result(BOX_POSE, ev, cat, as('relax'));
    }

    // なでる
    if (IN_BOX.includes(ev.phase)) {
      const r = as('inBox');
      return result(BOX_POSE, { ...ev, phase: 'hide', phaseT: 0, hideFor: P.afterPetHideSec }, cat, r);
    }
    // 箱の外では、見えている様子（くつろぎ・しっぽピン）のとおりに判定する（サインの意味を、イベントの日でも変えない）
    const r = as(BOX_POSE[ev.phase] ?? 'relax');
    if (r.cat.mode === 'flee') return { ev: { ...ev, phase: 'approach', phaseT: 0 }, cat: r.cat, day: r.day, feedback: r.feedback, mistake: r.mistake };
    return result(BOX_POSE, ev, cat, r);
  }

  function birdAct(action, ev, cat, day, personality) {
    const as = (mode) => applyAction(action, { ...cat, mode }, day, personality);
    const pose = BIRD_POSE[ev.phase] ?? 'relax';

    if (action.type === 'blink') {
      // 振り向いたとき（turn）か、押している間に目が合っていれば（sawLook）、いつもの「チラッ」へのまばたき
      if (ev.phase === 'turn' || action.sawLook) {
        const r = as('look');
        if (ev.phase === 'turn' && r.feedback === 'blinkBack') return result(BIRD_POSE, { ...ev, blinks: ev.blinks + 1, phase: 'happy', phaseT: 0 }, cat, r);
        if (ev.phase === 'turn' && r.feedback === 'blinkAway') return result(BIRD_POSE, { ...ev, phase: 'shy', phaseT: 0 }, cat, r);
        return result(BIRD_POSE, ev, cat, r);
      }
      return result(BIRD_POSE, ev, cat, as(pose));
    }

    // なでる：見えている様子（背中・チラッ・ゴロゴロ）のとおりに判定する。逃げたら、鳥も去って、その回は終わり（ごほうびなし）。
    // 窓の前まで歩き直してから、次の回の鳥が来る。歩いている途中（approach）に逃げたときは、回は数えない
    const r = as(pose);
    if (r.cat.mode === 'flee') {
      const round = ev.phase === 'approach' ? ev.round : ev.round + 1;
      return { ev: { ...ev, phase: 'approach', phaseT: 0, round }, cat: r.cat, day: r.day, feedback: r.feedback, mistake: r.mistake };
    }
    return result(BIRD_POSE, ev, cat, r);
  }

  // 判定の結果（信頼・警戒・反応）だけを使い、猫の様子は phase に合わせる
  function result(pose, ev, cat, r) {
    return { ev, cat: { ...cat, mode: pose[ev.phase] ?? cat.mode }, day: r.day, feedback: r.feedback, mistake: r.mistake };
  }

  // 描画用（src/render/renderer.js）。箱は done のあと、空になった箱がその場に残る（left）。鳥は done のあとも窓の外に枝が残る
  function eventProp(ev) {
    if (ev.id === 'bird') return { kind: 'bird', phase: ev.done ? 'done' : ev.phase, phaseT: ev.phaseT };
    if (ev.id === 'read') return { kind: 'book', phase: ev.done ? 'done' : ev.phase, phaseT: ev.phaseT, pages: ev.pages };
    return { kind: 'parcel', phase: ev.done ? 'left' : ev.phase, phaseT: ev.phaseT };
  }
  return { createEventState, eventTick, eventAct, eventProp };
})();

// ---- src/scenes/dayScene.js
__modules['src/scenes/dayScene.js'] = (() => {
  // 昼：猫との駆け引き。判定は src/game/ に任せ、ここでは時間・入力・表示をつなぐ。
  const { startDay } = __modules['src/game/progression.js'];
  const { tick } = __modules['src/game/catBrain.js'];
  const { applyAction, isShy, isTimid } = __modules['src/game/rules.js'];
  const { createEventState, eventTick, eventAct, eventProp } = __modules['src/game/events.js'];
  const { PERSONALITIES, MAX_VALUE, DAYS, EVENTS } = __modules['src/data/params.js'];
  const { CARDS, TUTORIAL, FEEDBACK, DAY_TITLES, HINTS, LAP_TEXT, DERE_TEXT, TIMID_GONE_TEXT, EVENT_TEXT, withName } = __modules['src/data/texts.js'];

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
  function soundsFor(feedback) {
    return SOUNDS[feedback] ?? [];
  }

  function createDayScene({ session, overlay, hud, renderer, input, sound, rng, onEnd }) {
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
        // 本をのぞき込む姿（onBook）は読書中の昼だけの姿。夜の画面には、膝の前でくつろいでいる姿として渡す
        cat: { mode: cat.mode === 'onBook' ? 'relax' : cat.mode, distance: cat.distance, walking: !!cat.walking },
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
        const guarding = ev?.id === 'read' && (ev.done ? elapsed < bookGuardUntil : ev.phase === 'onBook');
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
  return { soundsFor, createDayScene };
})();

// ---- src/scenes/nightScene.js
__modules['src/scenes/nightScene.js'] = (() => {
  const { NIGHT_TEXT, withName } = __modules['src/data/texts.js'];

  // 夜の画面がふわっと出るまでの時間（style.css の .night-screen の fade-in と合わせる）
  const NIGHT_FADE_SEC = 0.5;
  const AWAY = { mode: 'relax', distance: 80 };

  // 夜の画面が表示しきるまでは、猫を昼の終わりの場所に留める。そのあとは帰っていく（その場で消えて見えない。
  // 消え方は src/render/renderer.js）
  function nightCatPose(lastCat, t) {
    return t < NIGHT_FADE_SEC ? lastCat : { ...AWAY, hidden: true };
  }

  // lastCat: 昼の終わりの猫の様子と距離。now: 実際の時刻（ミリ秒）。
  // CSS のフェードは実際の時間で進むので、デバッグの倍速でも実際の時間で数える
  function createNightScene({ screenEl, session, lastCat = AWAY, onChoose, now = () => performance.now() }) {
    const startedAt = now();
    const node = document.createElement('div');
    node.className = 'night-screen';
    const h2 = document.createElement('h2');
    h2.textContent = NIGHT_TEXT.title(session.game.day);
    const p = document.createElement('p');
    p.textContent = withName(NIGHT_TEXT.prompt, session.game.catName);
    node.append(h2, p);

    for (const c of NIGHT_TEXT.choices) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'choice';
      b.textContent = c.label;
      const small = document.createElement('small');
      small.textContent = c.hint;
      b.append(small);
      b.addEventListener('click', () => {
        screenEl.replaceChildren();
        onChoose(c.id);
      }, { once: true });
      node.append(b);
    }
    screenEl.replaceChildren(node);

    return {
      name: 'night',
      update() {},
      view: () => ({ scene: 'night', cat: nightCatPose(lastCat, (now() - startedAt) / 1000) }),
    };
  }
  return { NIGHT_FADE_SEC, nightCatPose, createNightScene };
})();

// ---- src/scenes/endingScene.js
__modules['src/scenes/endingScene.js'] = (() => {
  const { ENDINGS, ENDING_UI, COAT_LABELS, COAT_LORE, PERSONALITY_TIPS, NOTEBOOK_TEXT, TITLES, withName } = __modules['src/data/texts.js'];
  const { PERSONALITIES } = __modules['src/data/params.js'];

  // saved: ねこ手帳に思い出を残せたか。newTitles: 今回新しく手に入れた称号の id（src/game/records.js）
  function createEndingScene({ screenEl, session, endingId, onRetry, saved = true, newTitles = [] }) {
    const g = session.game;
    const ending = ENDINGS[endingId];
    const reconciled = endingId !== 'visitor';
    let t = 0;

    const node = document.createElement('div');
    node.className = 'ending-screen';
    const label = document.createElement('p');
    label.className = 'label';
    label.textContent = reconciled ? ENDING_UI.reconciled(g.day) : ENDING_UI.notReconciled;
    const h2 = document.createElement('h2');
    h2.textContent = ending.name;
    const body = document.createElement('p');
    body.className = 'body';
    body.textContent = withName(ending.body, g.catName);
    const ul = document.createElement('ul');
    const lines = [
      ENDING_UI.personality(g.catName, PERSONALITIES[g.personality].label),
      // 性格の得意・苦手（次の猫で活かせるように）
      PERSONALITY_TIPS[g.personality],
      ENDING_UI.coat(COAT_LABELS[g.coat]),
      ENDING_UI.mistakes(g.mistakes),
    ];
    for (const text of lines) {
      const li = document.createElement('li');
      li.textContent = text;
      ul.append(li);
    }
    // 毛色と性格の言い伝え（柄で性格がわかる、という楽しみ方の種明かし）
    const lore = document.createElement('li');
    lore.className = 'lore';
    lore.textContent = COAT_LORE[g.coat];
    ul.children[2].after(lore);
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'retry';
    retry.textContent = ENDING_UI.retry;
    retry.addEventListener('click', () => {
      screenEl.replaceChildren();
      onRetry();
    }, { once: true });
    // ねこ手帳に残したこと・新しい称号
    const notes = [];
    if (saved) notes.push(NOTEBOOK_TEXT.saved);
    for (const id of newTitles) notes.push(NOTEBOOK_TEXT.newTitle(TITLES[id].name));
    const notebook = document.createElement('div');
    notebook.className = 'notebook-note';
    for (const text of notes) {
      const p = document.createElement('p');
      p.textContent = text;
      notebook.append(p);
    }
    node.append(label, h2, body, ul);
    if (notes.length) node.append(notebook);
    node.append(retry);
    screenEl.replaceChildren(node);

    return {
      name: 'ending',
      update(dt) {
        t += dt;
      },
      // 和解した場合は、膝の上で眠り続ける
      view: () => ({ scene: 'ending', endingId, lapTime: 10 + t }),
    };
  }
  return { createEndingScene };
})();

// ---- src/game/records.js
__modules['src/game/records.js'] = (() => {
  // ねこ手帳の記録：思い出（遊んだ猫）・図鑑（毛色ごとのスタンプと最短日数）・称号。
  // 描画や保存には依存しない純粋な関数（保存は src/ui/recordStore.js、表示は src/scenes/notebookScene.js）
  const { COAT_PERSONALITY, PERSONALITIES, FACES } = __modules['src/data/params.js'];
  const { ENDINGS } = __modules['src/data/texts.js'];

  // 思い出は新しいものからこの件数まで残す（図鑑のスタンプと称号は消えない）
  const MEMORY_LIMIT = 50;
  // 称号の表示名と条件の説明は src/data/texts.js の TITLES
  const TITLE_IDS = ['first', 'fate', 'noMistake', 'amaenbo', 'tsundere', 'bibiri', 'visitor', 'allCoats', 'allStamps', 'tenCats'];
  // 図鑑のスタンプになるエンディング・毛色・性格。あとで足したときに直し忘れないよう、元のデータから取る
  const ENDING_IDS = Object.keys(ENDINGS);
  const COAT_KEYS = Object.keys(COAT_PERSONALITY);
  const PERSONALITY_IDS = Object.keys(PERSONALITIES);

  function emptyRecords() {
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
   * ending: { name, coat, personality, endingId, day, mistakes, date, face }（face は顔の形。なくてもよい）
   * @returns {{ records, newTitles: string[] }}
   */
  function addEnding(records, ending) {
    const { name, coat, personality, endingId, day, mistakes, date, face } = ending;
    const memory = { name, coat, personality, endingId, day, mistakes, date };
    if (face) memory.face = { shape: face.shape, ears: face.ears };
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

  const validFace = (f) => isObject(f) && FACES.shapes.includes(f.shape) && FACES.ears.includes(f.ears);

  // 顔の形が壊れている思い出は、思い出は残して顔だけ取り除く（顔のない思い出は、いままでの形で描く）
  function cleanFace(m) {
    if (!('face' in m) || validFace(m.face)) return m;
    const { face, ...rest } = m;
    return rest;
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
  function parseRecords(text) {
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
      memories: memories.filter(validMemory).map(cleanFace).slice(0, MEMORY_LIMIT),
      dex: cleanDex(dex),
      titles: [...new Set(titles.filter((id) => TITLE_IDS.includes(id)))],
      metCount,
    };
  }
  return { MEMORY_LIMIT, TITLE_IDS, emptyRecords, addEnding, parseRecords };
})();

// ---- src/scenes/notebookScene.js
__modules['src/scenes/notebookScene.js'] = (() => {
  // ねこ手帳：思い出（遊んだ猫）・図鑑（毛色ごとのスタンプ）・称号の3つのタブ。タイトルから開く。
  // 記録の中身は src/game/records.js、猫の小さな絵は src/render/renderer.js の drawCatPortrait
  const { NOTEBOOK_TEXT, TITLES, COAT_LABELS, COAT_LORE, ENDINGS } = __modules['src/data/texts.js'];
  const { PERSONALITIES, COAT_PERSONALITY } = __modules['src/data/params.js'];
  const { TITLE_IDS } = __modules['src/game/records.js'];
  const { drawCatPortrait } = __modules['src/render/renderer.js'];

  const TABS = ['memories', 'dex', 'titles'];
  // 図鑑のスタンプ（エンディングごと）の短い名前
  const STAMPS = [
    ['fate', '運命'],
    ['patient', '待てる'],
    ['persistent', '根気'],
    ['visitor', '通い'],
  ];
  // 猫の絵の大きさ（画面上の px。高精細な画面でもぼやけないよう、Canvas は2倍で描く）
  const PORTRAIT_PX = 64;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // face: 思い出の猫の顔の形（図鑑や、顔を残していない古い思い出では省略＝いままでの形）
  function portrait(coat, { silhouette = false, face } = {}) {
    const canvas = el('canvas', 'portrait');
    canvas.width = PORTRAIT_PX * 2;
    canvas.height = PORTRAIT_PX * 2;
    drawCatPortrait(canvas, coat, { silhouette, face });
    return canvas;
  }

  function memoriesTab(records) {
    if (records.memories.length === 0) return [el('p', 'notebook-empty', NOTEBOOK_TEXT.noMemories)];
    return records.memories.map((m) => {
      const item = el('div', 'memory');
      const info = el('div', 'memory-info');
      info.append(
        el('strong', '', m.name),
        el('span', '', `${COAT_LABELS[m.coat] ?? ''}・${PERSONALITIES[m.personality]?.label ?? ''}`),
        el('span', 'memory-result', NOTEBOOK_TEXT.memoryResult(m, ENDINGS[m.endingId].name)),
        el('span', 'memory-date', String(m.date).replaceAll('-', '/')),
      );
      item.append(portrait(m.coat, { face: m.face }), info);
      return item;
    });
  }

  function dexTab(records) {
    return Object.keys(COAT_PERSONALITY).map((coat) => {
      const entry = records.dex[coat];
      const card = el('div', entry ? 'dex-card' : 'dex-card unknown');
      card.append(portrait(coat, { silhouette: !entry }));
      if (!entry) {
        card.append(el('strong', '', NOTEBOOK_TEXT.unknownCoat));
        return card;
      }
      const stamps = el('div', 'stamps');
      for (const [id, label] of STAMPS) {
        const got = entry.stamps.includes(id);
        const stamp = el('span', got ? 'stamp got' : 'stamp', label);
        stamp.title = ENDINGS[id].name;
        stamps.append(stamp);
      }
      card.append(
        el('strong', '', `${COAT_LABELS[coat]}（${PERSONALITIES[COAT_PERSONALITY[coat]].label}）`),
        stamps,
        el('span', 'dex-best', NOTEBOOK_TEXT.bestDay(entry.bestDay)),
        el('span', 'dex-lore', COAT_LORE[coat]),
      );
      return card;
    });
  }

  function titlesTab(records) {
    const got = TITLE_IDS.filter((id) => records.titles.includes(id));
    const nodes = [el('p', 'titles-count', NOTEBOOK_TEXT.count(got.length, TITLE_IDS.length))];
    for (const id of TITLE_IDS) {
      const has = records.titles.includes(id);
      const item = el('div', has ? 'title-item got' : 'title-item');
      item.append(el('strong', '', has ? TITLES[id].name : NOTEBOOK_TEXT.locked), el('span', '', TITLES[id].how));
      nodes.push(item);
    }
    return nodes;
  }

  const RENDER_TAB = { memories: memoriesTab, dex: dexTab, titles: titlesTab };

  function createNotebookScene({ screenEl, records, onBack }) {
    const node = el('div', 'notebook-screen');
    const head = el('div', 'notebook-head');
    const back = el('button', 'notebook-back', NOTEBOOK_TEXT.back);
    back.type = 'button';
    back.addEventListener('click', () => {
      screenEl.replaceChildren();
      onBack();
    }, { once: true });
    head.append(el('h2', '', NOTEBOOK_TEXT.open), back);

    const tabs = el('div', 'notebook-tabs');
    tabs.setAttribute('role', 'tablist');
    const body = el('div', 'notebook-body');
    const buttons = TABS.map((key) => {
      const b = el('button', 'notebook-tab', NOTEBOOK_TEXT.tabs[key]);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => show(key));
      tabs.append(b);
      return b;
    });

    function show(key) {
      TABS.forEach((k, i) => buttons[i].setAttribute('aria-selected', String(k === key)));
      body.className = `notebook-body ${key}`;
      body.replaceChildren(...RENDER_TAB[key](records));
      body.scrollTop = 0;
    }

    node.append(head, tabs, body);
    screenEl.replaceChildren(node);
    show('memories');

    return {
      name: 'notebook',
      update() {},
      // 手帳の後ろは、タイトルと同じ部屋と猫のまま
      view: () => ({ scene: 'title' }),
    };
  }
  return { createNotebookScene };
})();

// ---- src/ui/recordStore.js
__modules['src/ui/recordStore.js'] = (() => {
  // ねこ手帳の記録の保存。保存はこの端末の中だけ（外部には送らない）。
  // 使えない環境（保存が禁止されている・容量がいっぱいなど）でも、記録なしでそのまま遊べる
  const { emptyRecords, parseRecords } = __modules['src/game/records.js'];

  const RECORDS_KEY = 'neko-wakai:records';

  function loadRecords() {
    try {
      return parseRecords(localStorage.getItem(RECORDS_KEY));
    } catch {
      return emptyRecords();
    }
  }

  // 保存できたら true
  function saveRecords(records) {
    try {
      localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
      return true;
    } catch {
      return false;
    }
  }

  // デバッグパネル用（遊ぶ人の画面には置かない）
  function clearRecords() {
    try {
      localStorage.removeItem(RECORDS_KEY);
    } catch {
      // 消せなくても遊べる
    }
  }
  return { RECORDS_KEY, loadRecords, saveRecords, clearRecords };
})();

// ---- src/main.js
__modules['src/main.js'] = (() => {
  // 起動・ゲームループ・画面切替。
  const { createGame, finishDay, chooseNight, chooseCat, chooseFace, chooseEvents } = __modules['src/game/progression.js'];
  const { MAX_DAY } = __modules['src/data/params.js'];
  const { createRng } = __modules['src/util/rng.js'];
  const { createRenderer } = __modules['src/render/renderer.js'];
  const { createInput } = __modules['src/ui/input.js'];
  const { createOverlay } = __modules['src/ui/overlay.js'];
  const { createHud } = __modules['src/ui/hud.js'];
  const { createDebugPanel } = __modules['src/ui/debugPanel.js'];
  const { createSound } = __modules['src/ui/sound.js'];
  const { createMusic } = __modules['src/ui/music.js'];
  const { createPauseMenu } = __modules['src/ui/pauseMenu.js'];
  const { createTitleScene } = __modules['src/scenes/titleScene.js'];
  const { createNameScene } = __modules['src/scenes/nameScene.js'];
  const { createDayScene } = __modules['src/scenes/dayScene.js'];
  const { createNightScene } = __modules['src/scenes/nightScene.js'];
  const { createEndingScene } = __modules['src/scenes/endingScene.js'];
  const { createNotebookScene } = __modules['src/scenes/notebookScene.js'];
  const { addEnding, emptyRecords } = __modules['src/game/records.js'];
  const { loadRecords, saveRecords, clearRecords } = __modules['src/ui/recordStore.js'];
  const { SOUND_LABEL, PAUSE_TEXT } = __modules['src/data/texts.js'];

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
  // デバッグでイベントの日を固定したとき（{ id, day }。なければ毎回ランダム）
  let fixedEvent = null;
  function newEvents() {
    if (!fixedEvent) return chooseEvents();
    const events = Array(MAX_DAY).fill(null);
    events[fixedEvent.day - 1] = fixedEvent.id;
    return events;
  }
  const session = { game: createGame({ events: newEvents() }), misses: {} };
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
    session.game = createGame({ ...chooseCat({ personality: fixedPersonality, coat: fixedCoat }), face: chooseFace(fixedFace ?? {}), events: newEvents() });
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
        // デレた・手が平気になったかは性格ごとのものなので、切り替えたら覚えていたことを消す
        session.game = { ...session.game, personality: key, dere: false, handsOk: false };
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
      onEvent(value) {
        // 'box:4' なら箱を4日目に固定。'' ならランダムに戻す。次の日から反映する
        const [id, day] = value.split(':');
        fixedEvent = id ? { id, day: Number(day) } : null;
        session.game = { ...session.game, events: newEvents() };
      },
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
  return {  };
})();

})();
