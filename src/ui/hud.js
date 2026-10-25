// 日数・残り時間・まばたきボタンの表示。
import { DAYS } from '../data/params.js';

export function createHud({ root, dayEl, barEl, blinkBtn }) {
  return {
    show(v) {
      root.hidden = !v;
    },
    update(day) {
      dayEl.textContent = `${day.dayNumber}日目`;
      const total = DAYS[day.dayNumber - 1].durationSec;
      barEl.style.width = `${(day.timeLeft / total) * 100}%`;
      blinkBtn.hidden = !day.actions.includes('blink');
    },
  };
}
