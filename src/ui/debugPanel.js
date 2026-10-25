// デバッグパネル（試作用）。性格・毛色の切り替え・数値の表示・日のスキップ。
import { PERSONALITIES } from '../data/params.js';
import { COAT_LABELS } from '../data/texts.js';
import { distanceFloor } from '../game/catBrain.js';

const SPEEDS = [1, 2, 4, 8];

export function createDebugPanel(el, { onPersonality, onCoat, onSkipDay, onTrustMax, onReset, onSpeed }) {
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

  const buttons = document.createElement('div');
  for (const [text, fn] of [['次の日へ', onSkipDay], ['信頼MAX', onTrustMax], ['最初から', onReset]]) {
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
    update({ personality, coat, scene, day, cat, mistakes }) {
      radios[personality].checked = true;
      if (document.activeElement !== coatSelect) coatSelect.value = coat;
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
