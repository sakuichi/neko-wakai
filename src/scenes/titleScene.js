import { TITLE, NOTEBOOK_TEXT } from '../data/texts.js';
import { drawCatPortrait } from '../render/renderer.js';

// 「ねこ手帳」ボタンの猫の絵の細かさ（Canvas の画素数）。画面上の大きさは style.css の .title-notebook-icon で、文字の大きさに合わせる
const ICON_RES = 96;

// onNotebook: 「ねこ手帳」ボタン（画面のほかの場所をタップすると、はじめる）
export function createTitleScene({ screenEl, onStart, onNotebook }) {
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
