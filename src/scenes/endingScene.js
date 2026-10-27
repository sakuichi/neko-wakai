import { ENDINGS, ENDING_UI, COAT_LABELS, COAT_LORE, NOTEBOOK_TEXT, TITLES, withName } from '../data/texts.js';
import { PERSONALITIES } from '../data/params.js';

// saved: ねこ手帳に思い出を残せたか。newTitles: 今回新しく手に入れた称号の id（src/game/records.js）
export function createEndingScene({ screenEl, session, endingId, onRetry, saved = true, newTitles = [] }) {
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
  ul.children[1].after(lore);
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
