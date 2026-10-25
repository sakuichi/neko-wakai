// タップ・クリック・キー入力を、ゲームの行動（Action）に変換する。
export function createInput({ canvas, blinkBtn, toLogical, onPet, onBlink }) {
  let holdStart = null;
  let blinkEnabled = false;

  canvas.addEventListener('pointerdown', (e) => {
    const { x, y } = toLogical(e.clientX, e.clientY);
    onPet(x, y);
  });

  function begin() {
    if (!blinkEnabled || holdStart !== null) return;
    holdStart = performance.now();
    blinkBtn.classList.add('holding');
  }
  function end() {
    if (holdStart === null) return;
    const holdMs = performance.now() - holdStart;
    holdStart = null;
    blinkBtn.classList.remove('holding');
    onBlink({ type: 'blink', holdMs });
  }

  blinkBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    blinkBtn.setPointerCapture(e.pointerId);
    begin();
  });
  blinkBtn.addEventListener('pointerup', end);
  blinkBtn.addEventListener('pointercancel', end);
  blinkBtn.addEventListener('contextmenu', (e) => e.preventDefault());

  // 名前の入力中は、Space をまばたきに使わない
  const typing = (e) => e.target instanceof HTMLInputElement;
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat || typing(e)) return;
    e.preventDefault();
    begin();
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && !typing(e)) end();
  });

  return {
    setBlinkEnabled(v) {
      blinkEnabled = v;
      if (!v) {
        holdStart = null;
        blinkBtn.classList.remove('holding');
      }
    },
    holdMs() {
      return holdStart === null ? 0 : performance.now() - holdStart;
    },
  };
}
