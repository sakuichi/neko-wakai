// 画面に出す文章はすべてここに置く。
// {name} はプレイヤーが付けた猫の名前に置き換える（withName）。

export const withName = (text, name) => text.replaceAll('{name}', name);

export const TITLE = {
  main: 'ネコと和解せよ',
  sub: '〜猫が来るまでの7日間〜',
  start: 'タップではじめる',
};

export const DAY_TITLES = {
  1: 'はじめまして',
  2: 'すこし慣れてきた？',
  3: 'ためされる日',
  4: 'いつもの日',
  5: 'いつもの日',
  6: 'いつもの日',
  7: 'さいごの日',
};

// 1日目の最初に、猫をアップにして名前を付けてもらう
export const NAME_TEXT = {
  prompt: '名前は何にしよう？',
  placeholder: 'なまえ',
  ok: 'この名前にする',
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
export const TUTORIAL = {
  wait: '触ろうとすると逃げてしまう。まずは「待って」みよう',
  approach: '{name}のほうから、少し近づいてきた！',
  flee: '焦りは禁物。猫は追いかけるほど逃げる',
};

// 説明。キーは 'action:xxx' 'sign:xxx' 'day:xxx'
// pause: true はゲームを一時停止するカード（遊び方が変わるもの・触ると失敗するのに触りたくなるもの）。
// それ以外は、ゲームを止めない吹き出しで出す
export const CARDS = {
  'day:intro': {
    pause: true,
    title: '{name}は、まだ警戒している',
    body: '近づきたい気持ちを、ぐっとこらえて……。\n{name}のほうから膝に乗ってくれたら「和解」です。',
  },
  'action:pet': {
    pause: true,
    title: 'できること：なでる',
    body: '猫をタップすると、手を伸ばしてなでようとします。\nでも、タイミングを間違えると……？',
  },
  'action:blink': {
    pause: true,
    title: '新しくできること：ゆっくりまばたき',
    body: '猫と目が合ったら（「チラッ」とこっちを見たら）、まばたきボタン（PCはSpaceキー）を長押しして、離そう。\n猫の世界では「好きだよ」の合図。\n※目が合っていないときにやると、ちょっと不審がられる。',
  },
  'sign:look': {
    title: '猫のサイン：じっと見つめる',
    body: '「チラッ」とこっちを見ている。いまが、ゆっくりまばたきのチャンス。',
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
};

// 同じ様子で2回失敗したときに出すヒント（吹き出し）。キーは失敗したときの猫の様子
export const HINTS = {
  relax: { title: 'ヒント', body: 'くつろいでいるときは、そっとしておこう。\nしっぽがピンと立ったら、なでるチャンス。' },
  look: { title: 'ヒント', body: '「チラッ」とこっちを見たら、なでるより「ゆっくりまばたき」。' },
  backTurn: { title: 'ヒント', body: '背中を向けているのは、信頼の印。\n触らずに待つだけで、仲良くなれる。' },
  tailFlick: { title: 'ヒント', body: 'しっぽパタパタは、イライラの印。\n落ち着くまで待とう。' },
  belly: { title: 'ヒント', body: 'お腹を見せてくれても、触るのはがまん。\n見守るのが正解。' },
  fakeRub: { title: 'ヒント', body: 'すり寄ってきても、しっぽがパタパタしていたら気まぐれ。\nしっぽがピンと立っているときだけなでよう。' },
  inBox: { title: 'ヒント', body: '箱の中では、そっとしておこう。\n自分から出てくるまで待とう。' },
  stare: { title: 'ヒント', body: 'まばたきは、{name}がじっとこっちを見ているときに。' },
};

export const FEEDBACK = {
  flee: 'ピャッ！',
  kick: 'ペシッ！',
  hide: '（箱の奥に引っ込んだ）',
  stare: '（じっと見つめられて、落ち着かない様子……）',
  blinkBack: '（ゆっくりまばたきを返してくれた）',
  purr: 'ゴロゴロ……',
  tooFar: '（手が届かない……）',
};

export const LAP_TEXT = '{name}が、膝に乗ってきた……！';

export const NIGHT_TEXT = {
  title: (day) => `${day}日目の夜`,
  prompt: '{name}のために、何をしておく？',
  choices: [
    { id: 'treat', label: 'おやつを置いておく', hint: '喜んでくれそう。明日は近くから始まるかも。でも、おやつ目当てかも' },
    { id: 'box', label: '段ボール箱を置いておく', hint: '落ち着いてくれそう。でも、しばらく出てこないかも' },
    { id: 'nothing', label: '何もしない', hint: 'そっとしておく。それも、ひとつの優しさ' },
  ],
};

export const ENDINGS = {
  fate: { name: '運命の膝', body: 'たった3日で、{name}はあなたの膝を選んだ。' },
  patient: { name: '待てる人間', body: '焦らず、追わず。{name}はちゃんと見ていた。' },
  persistent: { name: '根気の人', body: '何度逃げられても、あなたは待ち続けた。' },
  visitor: { name: '通い猫になりました', body: '膝には乗ってくれなかったけれど、{name}はときどき遊びに来てくれる。\nこれはこれで、悪くない。' },
};

export const ENDING_UI = {
  reconciled: (day) => `${day}日目で和解`,
  notReconciled: '7日間では和解ならず',
  mistakes: (n) => `焦って手を出した回数：${n}回`,
  personality: (name, label) => `${name}の性格：${label}`,
  coat: (label) => `毛色：${label}`,
  retry: 'もう一度あそぶ',
};

// 毛色の名前（色そのものは src/render/renderer.js の COATS）
export const COAT_LABELS = {
  chatora: '茶トラ',
  kijitora: 'キジトラ',
  sabatora: 'サバトラ',
  cream: 'クリーム',
  shiro: 'シロ',
  kuro: 'クロ',
};

// 毛色ごとの性格の言い伝え（エンディングで表示。性格との対応は src/data/params.js の COAT_PERSONALITY）
export const COAT_LORE = {
  chatora: '茶トラは、人なつっこい甘えん坊が多いと言われている',
  cream: 'クリームは、おっとりした甘えん坊が多いと言われている',
  kuro: 'クロは、賢くて慎重な子が多いと言われている',
  shiro: 'シロは、気品があって気まぐれな子が多いと言われている',
  sabatora: 'サバトラは、クールだけど慣れると甘える子が多いと言われている',
  kijitora: 'キジトラは、用心深くて警戒心の強い子が多いと言われている',
};

// ねこ手帳（思い出・図鑑・称号）。記録の中身は src/game/records.js
export const NOTEBOOK_TEXT = {
  open: 'ねこ手帳',
  back: 'もどる',
  tabs: { memories: '思い出', dex: '図鑑', titles: '称号' },
  saved: '思い出に残しました',
  newTitle: (name) => `称号を手に入れた：${name}`,
  noMemories: 'まだ思い出はありません。猫と7日間を過ごすと、ここに残ります',
  memoryResult: (m) => (m.endingId === 'visitor' ? '通い猫になった' : `${m.day}日目で和解`),
  unknownCoat: '？？？',
  bestDay: (day) => (day === null ? 'まだ和解していない' : `いちばん早い和解：${day}日目`),
  locked: '？？？',
  count: (got, all) => `${got} / ${all}`,
};

// 称号。条件の判定は src/game/records.js の TITLE_IDS と同じ順
export const TITLES = {
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

export const SOUND_LABEL = { on: '効果音ON', off: '効果音OFF' };

// 画面左下の BGM 表示。曲名は src/data/bgmSongs.js
export const BGM_TEXT = {
  off: 'BGM OFF',
  aria: (label) => `BGM：${label}（タップで次の曲）`,
};
