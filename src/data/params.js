// ゲームの数値はすべてここに置く。調整はこのファイルだけで行う。
// 値の意味は docs/spec.md の 4〜9章を参照。

export const MAX_VALUE = 100;
export const MAX_DAY = 7;

export const RULES = {
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
export const EVENT_DAYS = [4, 5, 6];

// イベントごとの数値（進め方は src/game/events.js）
export const EVENTS = {
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
  // 膝の前（距離0）まで来たら、本をのぞき込む（ごほうび doneTrust。膝には乗らない）。peekBookSec たったら、いつもの日に戻る（信頼100なら、そのまま膝に乗って和解）
  // のぞき込んでいる間と、やめてから tapGuardSec の間は、本のあった場所のタップを猫へのタッチにしない（ページを連打していた指で、うっかり触らないように）
  read: { readSec: 2.5, readSpeed: 6, peekBookSec: 4, doneTrust: 6, tapGuardSec: 1 },
};

// trustMul：その日の信頼の増え方の倍率（書いていない日は1）。1〜2日目は最初の出会いが大事なので、少し増えやすい
// lapTrust：膝に乗る信頼（書いていない日は MAX_VALUE）。3日目は「運命の日」で、少し手前でも乗ってくれる
// この2つで、うまい人がときどき（1割ほど）3日目に和解できるようにしている（docs/spec.md 6.0）
export const DAYS = [
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
export const DAYLIGHT = { noonAt: 0.2, eveningFrom: 0.65, eveningAt: 0.8 };

// 猫の顔の種類（猫ごとにランダムで選ぶ）。形そのものは src/render/renderer.js の FACE_SHAPES・EAR_SIZES
export const FACES = {
  shapes: ['mochi', 'maru', 'shimobukure', 'hoppe'],
  ears: ['small', 'normal', 'big'],
};

export const NIGHT = {
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
export const PERSONALITIES = {
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

export const DEFAULT_PERSONALITY = 'tsundere';

// 毛色と性格の対応。「茶トラは甘えん坊」など、よく言われる柄と性格の話に合わせる（言い伝えは src/data/texts.js の COAT_LORE）
// 毛色のキーは src/render/renderer.js の COATS
export const COAT_PERSONALITY = {
  chatora: 'amaenbo',
  cream: 'amaenbo',
  shiro: 'tsundere',
  sabatora: 'tsundere',
  kijitora: 'bibiri',
  kuro: 'bibiri',
};

// 紙芝居（イントロ・エピローグ。src/scenes/storyScene.js・storySlides.js）
// slideSec・longSlideSec：イントロ1枚目・2枚目（文が長い）の秒数。wipeSec：場面の切り替えで、覆う・戻すそれぞれの秒数
// tapIgnoreSec：1枚が出てすぐのタップは無視する秒数。hintAfterSec：タップ待ちの枚で「タップで次へ」を出すまでの秒数
// nearTrust：通い猫で「膝に乗ってくれる日も、もうすぐかも」になる最後の信頼（以上）
// morning：イントロと、通い猫の次の日の明るさ（朝）。introWindowOpen：イントロ2枚目の窓の開き（少しだけ）
// dusk：和解の1枚目の秒数と、夕方になるまでの秒数
// leave：通い猫の1枚目。窓を開ける→窓の前まで歩く→振り返る→出ていく（消える）の秒数と、1枚目の秒数
export const STORY = {
  slideSec: 3,
  longSlideSec: 3.6,
  wipeSec: 0.3,
  tapIgnoreSec: 0.4,
  hintAfterSec: 1.2,
  nearTrust: 70,
  morning: 0.05,
  introWindowOpen: 0.45,
  dusk: { sec: 4.5, toEveningSec: 3.5 },
  leave: { openSec: 0.6, walkSec: 2.8, lookBackSec: 1.2, outSec: 0.8, sec: 6.4 },
};

// シェア（src/game/shareCard.js・src/render/shareImage.js・src/ui/sharePanel.js）。docs/spec.md 12
export const SHARE = {
  // 公開ページの URL。公開するまでは空（空なら投稿文に付けない）
  url: '',
  xIntent: 'https://x.com/intent/post',
  fileName: 'neko-wakai.png',
  // 画像の大きさ（4:5）と、その中の猫の絵の枠（角の丸み r）
  image: { w: 1080, h: 1350 },
  picture: { x: 80, y: 340, w: 920, h: 690, r: 48 },
  // 猫の絵として切り取る範囲（論理座標 360×640。4:3）
  crop: {
    lap: { x: 36, y: 424, w: 288, h: 216 },
    garden: { x: 0, y: 245, w: 136, h: 102 },
  },
  // 通い猫：窓の中央の枠やガラスのつやがかからないよう、左の戸の真ん中に座らせる
  gardenCat: { x: 62, y: 331, s: 0.52, outside: true },
  // 結果画面が始まって何秒後の姿を描くか
  poseSec: 1.2,
};
