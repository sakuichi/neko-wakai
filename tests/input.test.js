import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInput } from '../src/ui/input.js';

// addEventListener を記録して、あとから発火できる偽の要素（canvas・まばたきボタン・window）
function eventTarget(extra = {}) {
  const listeners = [];
  const classes = new Set();
  return {
    listeners,
    classes,
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    addEventListener(type, fn) { listeners.push({ type, fn }); },
    removeEventListener(type, fn) {
      const i = listeners.findIndex((l) => l.type === type && l.fn === fn);
      if (i >= 0) listeners.splice(i, 1);
    },
    setPointerCapture() {},
    releasePointerCapture() {},
    fire(type, event = {}) {
      const e = { type, target: this, preventDefault() {}, stopPropagation() {}, ...event };
      for (const l of [...listeners]) if (l.type === type) l.fn(e);
    },
    ...extra,
  };
}

// globalThis の値をテストの間だけ差し替え、終わったら元に戻す
function withGlobals(values, fn) {
  const saved = Object.keys(values).map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
  for (const [k, v] of Object.entries(values)) {
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true, enumerable: true });
  }
  try {
    return fn();
  } finally {
    for (const [k, desc] of saved) {
      if (desc) Object.defineProperty(globalThis, k, desc);
      else delete globalThis[k];
    }
  }
}

// 入力欄ではない、キー入力の対象
class FakeInputElement {}
const notTyping = {};
const space = (extra = {}) => ({ code: 'Space', key: ' ', repeat: false, target: notTyping, ...extra });

// 偽の window・時計で createInput を作り、run の中で操作する
function withInput(run) {
  const win = eventTarget();
  const clock = { now: 0 };
  return withGlobals({ window: win, HTMLInputElement: FakeInputElement, performance: { now: () => clock.now } }, () => {
    const blinks = [];
    const pets = [];
    const input = createInput({
      canvas: eventTarget(),
      blinkBtn: eventTarget(),
      toLogical: (x, y) => ({ x, y }),
      onPet: (x, y) => pets.push([x, y]),
      onBlink: (a) => blinks.push(a),
    });
    return run({ input, win, clock, blinks, pets });
  });
}

test('押しかけのまばたき（Space）を取り消すと、離しても まばたきにならず、もう一度押せば始められる', () => {
  withInput(({ input, win, clock, blinks }) => {
    assert.equal(typeof input.cancelHold, 'function', 'cancelHold がない');
    input.setBlinkEnabled(true);
    clock.now = 1000;
    win.fire('keydown', space());
    clock.now = 1800;
    assert.equal(input.holdMs(), 800, '押している間の長さ（このテストの前提）');

    input.cancelHold();
    assert.equal(input.holdMs(), 0, '取り消したあとの holdMs');
    clock.now = 2000;
    win.fire('keyup', space());
    assert.deepEqual(blinks, [], '取り消したのに、離したらまばたきになった');
    assert.equal(input.holdMs(), 0);

    // もう一度押して離すと、ふつうにまばたきになる（使えるかどうかは変わらない）
    clock.now = 3000;
    win.fire('keydown', space());
    clock.now = 3900;
    win.fire('keyup', space());
    assert.deepEqual(blinks, [{ type: 'blink', holdMs: 900 }]);
  });
});
