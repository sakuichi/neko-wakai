// BGM の試聴ページ。npm run build で preview.bundle.js にまとめ、index.html から読み込む。
import { BGM_SONGS } from '../../src/data/bgmSongs.js';
import { createBgm } from '../../src/ui/bgm.js';

const list = document.getElementById('songs');
const volume = document.getElementById('volume');
let ac = null;
let bgm = null;
const cards = new Map();

// ブラウザはタップの前に音を鳴らせないので、最初の再生ボタンで準備する
function ensureAudio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ac = new AC();
    bgm = createBgm(ac);
    bgm.setVolume(Number(volume.value));
  }
  if (ac.state === 'suspended') ac.resume();
}

BGM_SONGS.forEach((song, i) => {
  const card = document.createElement('article');
  card.className = 'song';
  const bars = song.sections.reduce((n, s) => n + s.chords.length, 0);
  const loopSec = Math.round((bars * 4 * 60) / song.bpm);
  card.innerHTML = `
    <div class="no">${i + 1}</div>
    <div class="body">
      <h2></h2>
      <p class="mood"></p>
      <p class="meta"></p>
      <p class="pos" aria-live="off"></p>
    </div>
    <button type="button" class="play" aria-label="再生">▶</button>`;
  card.querySelector('h2').textContent = song.title;
  card.querySelector('.mood').textContent = song.mood;
  card.querySelector('.meta').textContent = `おすすめ：${song.scene}\n${song.key}調・テンポ${song.bpm}・${loopSec}秒でくり返し`;
  const btn = card.querySelector('.play');
  btn.addEventListener('click', () => {
    ensureAudio();
    if (bgm.current === song.id) bgm.stop();
    else bgm.play(song);
    refresh();
  });
  cards.set(song.id, { card, btn, pos: card.querySelector('.pos'), bars });
  list.append(card);
});

document.getElementById('stop').addEventListener('click', () => {
  bgm?.stop();
  refresh();
});
volume.addEventListener('input', () => bgm?.setVolume(Number(volume.value)));

function refresh() {
  for (const [id, c] of cards) {
    const on = bgm?.current === id;
    c.card.classList.toggle('on', on);
    c.btn.textContent = on ? '■' : '▶';
    c.btn.setAttribute('aria-label', on ? '停止' : '再生');
    if (!on) c.pos.textContent = '';
  }
}

// 再生中の曲の、いまの小節を表示する
(function loop() {
  const id = bgm?.current;
  if (id) {
    const c = cards.get(id);
    const bar = bgm.bar();
    const half = c.bars / 2;
    c.pos.textContent = `${bar < half ? 'A' : 'B'}メロ ${(bar % half) + 1} / ${half}小節`;
  }
  requestAnimationFrame(loop);
})();
