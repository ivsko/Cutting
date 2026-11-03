// Стартиране: node tests/modules.test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
vm.runInThisContext(readFileSync(new URL('../modules.js', import.meta.url), 'utf8'));
const { moduleParts, arrange, fillLength, splitRun, drawerHeights } = globalThis.ModuleEngine;
const get = (r, k) => r.parts.find((p) => p.key === k);
const base = { id: 'a', type: 'base', w: 800, h: 720, d: 560, count: 1, shelves: 1, dividers: 0, front: 'hinged', frontCount: 2, back: 'overlay' };
const tests = {
  'долен модул: корпус': () => {
    const r = moduleParts(base, {});
    assert.deepEqual([get(r, 'side').w, get(r, 'side').h, get(r, 'side').qty], [720, 560, 2]);
    assert.deepEqual([get(r, 'bottom').w, get(r, 'bottom').h], [764, 560]);
    assert.deepEqual([get(r, 'rail').w, get(r, 'rail').h, get(r, 'rail').qty], [764, 100, 2]);
    assert.equal(get(r, 'roof'), undefined);
  },
  'наложен гръб и рафт': () => {
    const r = moduleParts(base, {});
    assert.deepEqual([get(r, 'back').w, get(r, 'back').h], [796, 716]);
    assert.deepEqual([get(r, 'shelf').w, get(r, 'shelf').h], [762, 540]);
  },
  'гръб в канал скъсява рафта и делителя': () => {
    const r = moduleParts({ ...base, back: 'groove', dividers: 1 }, {});
    assert.deepEqual([get(r, 'back').w, get(r, 'back').h], [780, 710]);
    assert.equal(get(r, 'shelf').h, 525);
    assert.equal(get(r, 'divider').h, 545);
  },
  'делител разделя рафтовете': () => {
    const r = moduleParts({ ...base, dividers: 1, shelves: 2 }, {});
    assert.equal(get(r, 'divider').w, 702);
    assert.equal(get(r, 'shelf').qty, 4);
    assert.equal(get(r, 'shelf').w, 371);
  },
  'горен модул има покрив, а не траверси': () => {
    const r = moduleParts({ ...base, type: 'wall', d: 300 }, {});
    assert.ok(get(r, 'roof')); assert.equal(get(r, 'rail'), undefined);
  },
  'страници върху дъното': () => {
    const r = moduleParts(base, { bottomMode: 'under' });
    assert.equal(get(r, 'side').w, 702); assert.equal(get(r, 'bottom').w, 800);
  },
  'две врати и фуга': () => {
    const r = moduleParts(base, {});
    assert.deepEqual([get(r, 'door').w, get(r, 'door').h, get(r, 'door').qty], [717, 397, 2]);
  },
  'чекмеджета': () => {
    const r = moduleParts({ ...base, front: 'drawers', frontCount: 3 }, {});
    assert.deepEqual([get(r, 'drawerFront').w, get(r, 'drawerFront').h, get(r, 'drawerFront').qty], [797, 237, 3]);
    assert.deepEqual([get(r, 'drawerSide').w, get(r, 'drawerSide').qty], [500, 6]);
    assert.equal(get(r, 'drawerEnd').w, 706);
    assert.equal(get(r, 'drawerBottom').qty, 3);
  },
  'плъзгащи врати се застъпват': () => {
    const r = moduleParts({ ...base, type: 'wardrobe', w: 1800, h: 2400, front: 'sliding', frontCount: 2 }, {});
    assert.equal(get(r, 'door').h, 915);
  },
  'предупреждава за твърде тесен модул': () => {
    const r = moduleParts({ ...base, w: 30 }, {});
    assert.ok(r.warnings.length > 0);
  },
  'подредба: колона вдясно и остатък': () => {
    const mods = [{ ...base, id: 'a', w: 600, count: 2 }, { ...base, id: 't', type: 'tall', w: 600, h: 2100 }, { ...base, id: 'u', type: 'wall', w: 1200 }];
    const a = arrange(mods, { wall: 3000, tallPos: 'right' });
    assert.equal(a.tall[0].x, 2400); assert.equal(a.freeLower, 1200); assert.equal(a.overflow, 0);
    assert.equal(a.lower[1].x, 600); assert.equal(a.upper[0].x, 0);
  },
  'подредба: надвишена стена': () => {
    assert.equal(arrange([{ ...base, w: 2000, count: 2 }], { wall: 3000 }).overflow, 1000);
  },
  'подредба: симетрично слага широките в средата': () => {
    const mods = [300, 900, 600].map((w, i) => ({ ...base, id: 'x' + i, w }));
    const a = arrange(mods, { order: 'symmetric' }).lower.map((x) => x.w);
    assert.equal(a[1], 900);
  },
  'автозапълване: точно и с предпочитана ширина': () => {
    const f = fillLength(2400, [300, 400, 600, 800], 600);
    assert.equal(f.remainder, 0); assert.deepEqual(f.items, [{ w: 600, count: 4 }]);
    assert.equal(fillLength(2450, [600], 600).remainder, 50);
  },
  'чекмеджета по съотношение': () => {
    const h = drawerHeights('1:2:2', 3, 711).heights;
    assert.deepEqual(h.map((x) => Math.round(x * 10) / 10), [142.2, 284.4, 284.4]);
    assert.deepEqual(drawerHeights('140мм:1:1', 3, 711).heights, [140, 285.5, 285.5]);
    assert.equal(drawerHeights('1:2', 3, 711).ok, false);
    const r = moduleParts({ ...base, front: 'drawers', frontCount: 3, drawerRatios: '1:2:2' }, {});
    const fronts = r.parts.filter((p) => p.key.startsWith('drawerFront'));
    assert.deepEqual(fronts.map((p) => [p.h, p.qty]), [[142.2, 1], [284.4, 2]]);
    assert.equal(r.parts.filter((p) => p.key.startsWith('drawerSide')).reduce((n, p) => n + p.qty, 0), 6);
  },
  'неразбираемо съотношение дава предупреждение': () => {
    assert.ok(moduleParts({ ...base, front: 'drawers', frontCount: 3, drawerRatios: '1:2' }, {}).warnings.length);
  },
  'шкаф за фурна': () => {
    const r = moduleParts({ ...base, front: 'oven', ovenH: 595, back: 'none', shelves: 0 }, {});
    assert.equal(r.parts.find((p) => p.key === 'ovenShelf').w, 764);
    assert.equal(r.parts.find((p) => p.key === 'drawerFront').h, 122);
    assert.ok(r.parts.some((p) => p.key === 'drawerSide'));
    assert.equal(r.parts.some((p) => p.key === 'back'), false);
    assert.equal(moduleParts({ ...base, front: 'oven', ovenH: 595, ovenDrawer: false }, {}).parts.some((p) => p.key === 'drawerSide'), false);
  },
  'единичен елемент и плот': () => {
    const r = moduleParts({ id: 's', type: 'single', w: 2400, h: 600, name: 'Остров', edgeSides: 'long', material: 'worktop' }, {});
    assert.equal(r.parts.length, 1);
    assert.deepEqual(Object.keys(r.parts[0].edges), ['top', 'bottom']);
    assert.equal(arrange([{ id: 's', type: 'single', w: 2400, h: 600 }], {}).lowerW, 0);
  },
  'фугата се променя': () => {
    const r = moduleParts(base, { doorGap: 2 });
    assert.equal(r.parts.find((p) => p.key === 'door').h, 398);
  },
  'врата от профил и стъкло излиза от разкроя': () => {
    const r = moduleParts({ ...base, doorStyle: 'profile', profileId: 'p', glassId: 'g' }, { profiles: [{ id: 'p', deduct: 30 }] });
    assert.equal(get(r, 'door'), undefined);
    const glass = r.extras.find((x) => x.kind === 'glass');
    assert.deepEqual([glass.w, glass.h, glass.qty], [367, 687, 2]);
    assert.deepEqual([r.extras.find((x) => x.key === 'profH').len, r.extras.find((x) => x.key === 'profH').qty], [717, 4]);
    assert.deepEqual([r.extras.find((x) => x.key === 'profW').len, r.extras.find((x) => x.key === 'profW').qty], [397, 4]);
  },
  'стъклена врата и стъклен рафт': () => {
    const r = moduleParts({ ...base, doorStyle: 'glass', shelfStyle: 'glass' }, {});
    assert.equal(get(r, 'shelf'), undefined);
    assert.deepEqual(r.extras.map((x) => [x.key, x.w, x.h, x.qty]), [['shelf', 762, 540, 1], ['door', 397, 717, 2]]);
  },
  'чекмеджетата остават от плоскост при стъклен вид': () => {
    const r = moduleParts({ ...base, front: 'combo', frontCount: 1, doorStyle: 'glass' }, {});
    assert.ok(r.parts.some((p) => p.key === 'drawerFront'));
    assert.ok(r.extras.some((x) => x.key === 'door'));
  },
  'единично стъкло и профил': () => {
    assert.equal(moduleParts({ type: 'single', itemKind: 'glass', w: 500, h: 300 }, {}).extras[0].w, 500);
    assert.equal(moduleParts({ type: 'single', itemKind: 'profile', w: 900 }, {}).extras[0].len, 900);
  },
  'ъглов модул': () => {
    const r = moduleParts({ ...base, w: 1000, front: 'cornerBlind', cornerDoor: 450 }, {});
    assert.equal(get(r, 'door').h, 450);
    assert.equal(get(r, 'blind').h, 544);
  },
  'ъгъл: следващата стена започва след отстоянието': () => {
    const mods = [{ ...base, id: 'c', w: 1000, corner: true }, { ...base, id: 'a', w: 600 }];
    const a = arrange(mods, { wall: 3000 });
    assert.equal(a.lower[0].id, 'a#0');
    assert.equal(a.lower[1].id, 'c#0');
    const b = arrange([{ ...base, id: 'b', w: 600 }, { ...base, id: 'u', type: 'wall', w: 600, d: 300 }], { wall: 2000, offsetLower: 610, offsetUpper: 350 });
    assert.equal(b.lower[0].x, 610);
    assert.equal(b.upper[0].x, 350);
    assert.equal(b.freeLower, 790);
    assert.equal(b.freeUpper, 1050);
  },
  'дълъг плот се разделя': () => assert.deepEqual(splitRun(5000, 4100), [4100, 900]),
};
let bad = 0;
for (const [n, f] of Object.entries(tests)) { try { f(); console.log('ok   ', n); } catch (e) { bad++; console.log('FAIL ', n, '\n     ', e.message); } }
console.log(bad ? `${bad} неуспешни` : `Всички ${Object.keys(tests).length} теста минаха`);
process.exit(bad ? 1 : 0);
