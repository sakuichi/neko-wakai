// シェアする画像と投稿文の中身（純粋関数）。画像は src/render/shareImage.js、画面は src/ui/sharePanel.js
import { SHARE } from '../data/params.js';
import { SHARE_TEXT, ENDINGS, COAT_LABELS, TITLE } from '../data/texts.js';
import { endingView } from '../scenes/storySlides.js';

const headline = (day, endingId) => (endingId === 'visitor' ? [...SHARE_TEXT.notReconciled] : SHARE_TEXT.reconciled(day));

// 画像に入れる文
export function shareCard({ day, endingId, catName, coat }) {
  return {
    headline: headline(day, endingId),
    type: ENDINGS[endingId].name,
    nameLine: SHARE_TEXT.nameLine(catName, COAT_LABELS[coat]),
    title: TITLE.main,
  };
}

// 投稿文（コピーとXで使う）。猫の名前は入れない
export function sharePost({ day, endingId }, url = SHARE.url) {
  const lines = [`${headline(day, endingId).join('')}。`, SHARE_TEXT.second[endingId], SHARE_TEXT.tags.join(' ')];
  if (url) lines.push(url);
  return lines.join('\n');
}

// Xの投稿画面を開くURL
export function xPostUrl(text) {
  return `${SHARE.xIntent}?text=${encodeURIComponent(text)}`;
}

// 画像に入れる猫の絵：描画に渡す View と、切り取る範囲
export function shareView(endingId) {
  const view = { ...endingView(endingId, SHARE.poseSec), scene: 'ending', endingId };
  if (endingId === 'visitor') return { view: { ...view, catAt: { ...SHARE.gardenCat } }, crop: { ...SHARE.crop.garden } };
  return { view, crop: { ...SHARE.crop.lap } };
}
