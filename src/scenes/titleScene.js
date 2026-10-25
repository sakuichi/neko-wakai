import { TITLE } from '../data/texts.js';

export function createTitleScene({ screenEl, onStart }) {
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
  node.addEventListener('pointerdown', () => {
    screenEl.replaceChildren();
    onStart();
  }, { once: true });
  screenEl.replaceChildren(node);

  return {
    name: 'title',
    update() {},
    view: () => ({ scene: 'title' }),
  };
}
