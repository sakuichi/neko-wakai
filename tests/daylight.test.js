import { test } from 'node:test';
import assert from 'node:assert/strict';

// daylight.js と DAYLIGHT がまだなくてもファイルの読み込みが止まらないように、テストの中で読み込む
async function load() {
  const { daylightAt } = await import('../src/render/daylight.js');
  const { DAYLIGHT } = await import('../src/data/params.js');
  assert.equal(typeof daylightAt, 'function', 'daylightAt が export されていない');
  assert.ok(DAYLIGHT, 'DAYLIGHT が export されていない');
  return { daylightAt, DAYLIGHT };
}

// progress を 0 から 1 まで 0.005 刻みで
const STEPS = Array.from({ length: 201 }, (_, i) => i / 200);
const HEX = /^#[0-9a-f]{6}$/i;
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
// 窓の中（x 36〜168・y 76〜194）
const inWindow = (p) => p.x >= 36 && p.x <= 168 && p.y >= 76 && p.y <= 194;

test('時間帯の名前：朝（0）は morning、0.4 は noon、0.95 と 1 は evening、夜は night', async () => {
  const { daylightAt } = await load();
  assert.equal(daylightAt(0).phase, 'morning');
  assert.equal(daylightAt(0.4).phase, 'noon');
  assert.equal(daylightAt(0.95).phase, 'evening');
  assert.equal(daylightAt(1).phase, 'evening');
  for (const p of [0, 0.4, 0.95, 1]) assert.equal(daylightAt(p, true).phase, 'night', `${p}`);
});

test('時間帯によって、窓の外の空の色が違う（朝・昼・夕方・夜の skyTop がすべて異なる）', async () => {
  const { daylightAt } = await load();
  const tops = [daylightAt(0), daylightAt(0.4), daylightAt(0.95), daylightAt(0.4, true)].map((d) => d.skyTop);
  for (const c of tops) assert.match(c, HEX);
  assert.equal(new Set(tops.map((c) => c.toLowerCase())).size, 4, tops.join(' / '));
});

test('景色はなめらかに変わる（0.005 刻みで、色の各成分の差は 16 以下、濃さ・明るさの差は 0.05 以下）', async () => {
  const { daylightAt } = await load();
  const list = STEPS.map((p) => ({ p, d: daylightAt(p) }));
  for (const { p, d } of list) {
    for (const c of [d.skyTop, d.skyBottom, d.tint.color]) assert.match(c, HEX, `progress ${p}`);
  }
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1].d;
    const b = list[i].d;
    const at = `progress ${list[i - 1].p} → ${list[i].p}`;
    for (const key of ['skyTop', 'skyBottom']) {
      const [ca, cb] = [rgb(a[key]), rgb(b[key])];
      for (let k = 0; k < 3; k++) assert.ok(Math.abs(ca[k] - cb[k]) <= 16, `${at}: ${key} ${a[key]} → ${b[key]}`);
    }
    const [ta, tb] = [rgb(a.tint.color), rgb(b.tint.color)];
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(ta[k] - tb[k]) <= 16, `${at}: tint.color ${a.tint.color} → ${b.tint.color}`);
    assert.ok(Math.abs(a.tint.alpha - b.tint.alpha) <= 0.05, `${at}: tint.alpha ${a.tint.alpha} → ${b.tint.alpha}`);
    assert.ok(Math.abs(a.lamp - b.lamp) <= 0.05, `${at}: lamp ${a.lamp} → ${b.lamp}`);
    assert.ok(Math.abs(a.patch.alpha - b.patch.alpha) <= 0.05, `${at}: patch.alpha ${a.patch.alpha} → ${b.patch.alpha}`);
  }
});

test('部屋にかける色は薄く（0〜0.15）、スタンドライトは朝・昼は消えていて、夕方はつき、夜はいちばん明るい', async () => {
  const { daylightAt, DAYLIGHT } = await load();
  for (const p of STEPS) {
    for (const night of [false, true]) {
      const d = daylightAt(p, night);
      assert.ok(d.tint.alpha >= 0 && d.tint.alpha <= 0.15, `progress ${p} night ${night}: tint.alpha ${d.tint.alpha}`);
      assert.ok(d.lamp >= 0 && d.lamp <= 1, `progress ${p} night ${night}: lamp ${d.lamp}`);
    }
    const lamp = daylightAt(p).lamp;
    if (p <= DAYLIGHT.eveningFrom) assert.equal(lamp, 0, `progress ${p}: 朝・昼の lamp`);
    if (p >= DAYLIGHT.eveningAt) assert.ok(lamp > 0, `progress ${p}: 夕方の lamp ${lamp}`);
    assert.equal(daylightAt(p, true).lamp, 1, `progress ${p}: 夜の lamp`);
  }
});

test('窓の中には、昼は太陽、夜は月が見え、朝と夕方の太陽は昼より低い', async () => {
  const { daylightAt } = await load();
  for (const p of STEPS) {
    const sun = daylightAt(p).sun;
    assert.equal(sun.kind, 'sun', `progress ${p}`);
    assert.ok(inWindow(sun), `progress ${p}: 太陽 (${sun.x},${sun.y}) が窓の外`);
    const moon = daylightAt(p, true).sun;
    assert.equal(moon.kind, 'moon', `progress ${p}: 夜`);
    assert.ok(inWindow(moon), `progress ${p}: 月 (${moon.x},${moon.y}) が窓の外`);
  }
  const noonY = daylightAt(0.4).sun.y;
  assert.ok(daylightAt(0).sun.y > noonY, `朝 ${daylightAt(0).sun.y} / 昼 ${noonY}`);
  assert.ok(daylightAt(0.95).sun.y > noonY, `夕方 ${daylightAt(0.95).sun.y} / 昼 ${noonY}`);
});
