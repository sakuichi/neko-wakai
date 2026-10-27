// ねこ手帳：思い出（遊んだ猫）・図鑑（毛色ごとのスタンプ）・称号の3つのタブ。タイトルから開く。
// 記録の中身は src/game/records.js、猫の小さな絵は src/render/renderer.js の drawCatPortrait
import { NOTEBOOK_TEXT, TITLES, COAT_LABELS, COAT_LORE, ENDINGS } from '../data/texts.js';
import { PERSONALITIES, COAT_PERSONALITY } from '../data/params.js';
import { TITLE_IDS } from '../game/records.js';
import { drawCatPortrait } from '../render/renderer.js';

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

function portrait(coat, silhouette = false) {
  const canvas = el('canvas', 'portrait');
  canvas.width = PORTRAIT_PX * 2;
  canvas.height = PORTRAIT_PX * 2;
  drawCatPortrait(canvas, coat, { silhouette });
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
    item.append(portrait(m.coat), info);
    return item;
  });
}

function dexTab(records) {
  return Object.keys(COAT_PERSONALITY).map((coat) => {
    const entry = records.dex[coat];
    const card = el('div', entry ? 'dex-card' : 'dex-card unknown');
    card.append(portrait(coat, !entry));
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

export function createNotebookScene({ screenEl, records, onBack }) {
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
