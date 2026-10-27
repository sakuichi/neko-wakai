// 1日目の最初：猫をアップにして、名前を付けてもらう。
import { NAME_TEXT } from '../data/texts.js';

// 毛色に合った名前の候補から、毎回違う4つを選ぶ
export function namePicks(coat, random = Math.random) {
  const list = [...(NAME_TEXT.byCoat[coat] ?? NAME_TEXT.byCoat.chatora)];
  const picks = [];
  while (picks.length < 4 && list.length) picks.push(list.splice(Math.floor(random() * list.length), 1)[0]);
  return picks;
}

// coat: 今回の猫の毛色（名前の候補を決める）。onBack: 「もどる」で、同じ猫のままタイトルに戻る
export function createNameScene({ screenEl, coat, onDecide, onBack }) {
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
