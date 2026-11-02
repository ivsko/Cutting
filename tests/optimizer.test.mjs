// Стартиране: node tests/optimizer.test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const here = new URL('../optimizer.js', import.meta.url);
vm.runInThisContext(readFileSync(here, 'utf8'));
const { solve, cutPlan, findCollisions, makeRng } = globalThis.CutEngine;

const noYield = () => Promise.resolve();
const it = (id, w, h, rotatable = true) => ({ id: String(id), w, h, rotatable });
const board = { w: 2800, h: 2070, trim: 0 };
const run = (items, extra = {}, timeMs = 150) =>
  solve({ board, kerf: 4, items, mode: 'waste', ...extra }, { timeMs, yieldFn: noYield, seed: extra.seed || 7 });

function assertValid(res, items, kerf, b = board) {
  const seen = new Set();
  for (const bin of res.bins) {
    const parts = [...(bin.def.fixed || []), ...bin.placed];
    const sheet = { w: bin.def.w, h: bin.def.h, trim: bin.def.trim };
    assert.deepEqual(findCollisions(sheet, parts), [], 'колизия');
    const plan = cutPlan(sheet, parts, kerf);
    assert.ok(plan.ok, 'неизпълним гилотинен разкрой');
    for (const p of bin.placed) { assert.ok(!seen.has(p.id), 'дублиран детайл'); seen.add(p.id); }
  }
  for (const i of items) if (!res.impossible.includes(i)) assert.ok(seen.has(i.id), 'липсващ детайл ' + i.id);
  // съответствие на размерите и правото на въртене
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const bin of res.bins) for (const p of bin.placed) {
    const o = byId.get(p.id);
    if (p.turned) { assert.ok(o.rotatable); assert.deepEqual([p.w, p.h], [o.h, o.w]); }
    else assert.deepEqual([p.w, p.h], [o.w, o.h]);
  }
}
const tests = {
  'детайл с размера на листа влиза': async () => {
    const r = await run([it(1, 2800, 2070)]);
    assert.equal(r.bins.length, 1); assert.equal(r.impossible.length, 0);
  },
  'детайл с точна ширина влиза': async () => {
    const items = [it(1, 2800, 500), it(2, 2800, 500)];
    const r = await run(items); assert.equal(r.bins.length, 1); assertValid(r, items, 4);
  },
  'дебелината на диска се отчита между детайлите': async () => {
    const r = await run([it(1, 1400, 2070, false), it(2, 1400, 2070, false)]);
    assert.equal(r.bins.length, 2);
    const r2 = await run([it(1, 1398, 2070, false), it(2, 1398, 2070, false)]);
    assert.equal(r2.bins.length, 1);
  },
  'неподходящ детайл се връща поименно, а останалите се режат': async () => {
    const items = [it('голям', 3000, 300), it('ok', 500, 500)];
    const r = await run(items);
    assert.deepEqual(r.impossible.map((i) => i.id), ['голям']); assert.equal(r.bins.length, 1);
  },
  'забраненото въртене се спазва': async () => {
    const items = Array.from({ length: 30 }, (_, i) => it(i, 900, 300, false));
    const r = await run(items); assertValid(r, items, 4);
    assert.ok(r.bins.flatMap((b) => b.placed).every((p) => !p.turned));
  },
  'обрезът намалява полезната площ': async () => {
    const r = await run([it(1, 2800, 2070)], { board: { ...board, trim: 10 } });
    assert.equal(r.impossible.length, 1);
    const items = [it(1, 2780, 2050)];
    const r2 = await run(items, { board: { ...board, trim: 10 } });
    assert.equal(r2.bins.length, 1);
    assert.equal(r2.bins[0].placed[0].x, 10);
  },
  'остатък от склада се ползва вместо нов лист': async () => {
    const items = [it(1, 600, 400)];
    const r = await run(items, { bins: [{ key: 'r1', kind: 'remnant', w: 700, h: 500 }] });
    assert.equal(r.fullSheets, 0); assert.equal(r.bins[0].def.kind, 'remnant');
  },
  'заключен детайл не се мести и не се застъпва': async () => {
    const fixed = [{ id: 'pin', x: 1000, y: 800, w: 600, h: 400 }];
    const sheet = { w: 2800, h: 2070, trim: 0 };
    const free = cutPlan(sheet, fixed, 4).offcuts;
    const items = Array.from({ length: 12 }, (_, i) => it(i, 500, 400));
    const r = await run(items, { bins: [{ key: 's1', kind: 'full', w: 2800, h: 2070, free, fixed }] });
    assertValid(r, items, 4);
    assert.ok(r.bins.some((b) => b.def.fixed.length === 1));
  },
  'неизпълнима (вятърна мелница) подредба се разпознава': () => {
    const pin = [
      { id: 'a', x: 0, y: 0, w: 600, h: 200 }, { id: 'b', x: 604, y: 0, w: 200, h: 600 },
      { id: 'c', x: 204, y: 604, w: 600, h: 200 }, { id: 'd', x: 0, y: 204, w: 200, h: 600 },
    ];
    assert.equal(cutPlan({ w: 2800, h: 2070, trim: 0 }, pin, 4).ok, false);
  },
  'резовете и остатъците пазят площта': () => {
    const parts = [{ id: 'a', x: 0, y: 0, w: 1000, h: 500 }, { id: 'b', x: 1004, y: 0, w: 500, h: 500 }];
    const p = cutPlan({ w: 2800, h: 2070, trim: 0 }, parts, 4);
    assert.ok(p.ok); assert.ok(p.cuts.length >= 2);
    assert.ok(p.offcuts.some((o) => o.w === 2800 && o.h === 1566));
  },
  'произволни поръчки винаги са изпълними': async () => {
    const rnd = makeRng(11);
    for (let t = 0; t < 25; t++) {
      const n = 5 + Math.floor(rnd() * 40);
      const items = Array.from({ length: n }, (_, i) => it(i, 60 + Math.floor(rnd() * 1500), 60 + Math.floor(rnd() * 1200), rnd() > 0.3));
      const kerf = Math.floor(rnd() * 6);
      const r = await run(items, { kerf, seed: t + 1 }, 40);
      assertValid(r, items, kerf);
      assert.ok(r.fullSheets >= r.bound, 'долната граница е нарушена');
    }
  },
};
let bad = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { await fn(); console.log('ok   ', name); } catch (e) { bad++; console.log('FAIL ', name, '\n     ', e.message); }
}
console.log(bad ? `${bad} неуспешни` : `Всички ${Object.keys(tests).length} теста минаха`);
process.exit(bad ? 1 : 0);
