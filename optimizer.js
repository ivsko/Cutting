/*
 * Двигател за гилотинен разкрой. Няма зависимост от браузъра.
 *
 * Два независими блока:
 *   1. cutPlan()  — получава готови позиции и доказва, че могат да се изрежат
 *                   с проходни резове. Работи еднакво за автоматичен и за ръчен
 *                   разкрой, затова тя е и проверката на самия оптимизатор.
 *   2. solve()    — търсене с времеви лимит: конструиране + разрушаване и
 *                   повторно подреждане на най-слабите листове.
 *
 * Всички размери са в мм. Координатите са спрямо целия лист.
 */
(function (root) {
  'use strict';

  const EPS = 1e-6;

  function makeRng(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ==========================================================================
  // ПЛАН НА РЕЗОВЕТЕ
  // ==========================================================================

  function usableRegion(sheet) {
    const t = sheet.trim || 0;
    return { x: t, y: t, w: sheet.w - 2 * t, h: sheet.h - 2 * t };
  }

  /** Резът заема лентата [c, c + kerf]. Не бива да минава през детайл. */
  function bladeIsClear(items, pos, len, c, kerf) {
    for (const it of items) {
      if (it[pos] < c + kerf - EPS && it[pos] + it[len] > c + EPS) return false;
    }
    return true;
  }

  function separatingCuts(region, items, axis, kerf) {
    const pos = axis === 'V' ? 'x' : 'y';
    const len = axis === 'V' ? 'w' : 'h';
    const start = region[pos];
    const end = region[pos] + region[len];
    const candidates = new Set();
    for (const it of items) {
      candidates.add(it[pos] + it[len]);
      candidates.add(it[pos] - kerf);
    }
    const found = [];
    for (const c of candidates) {
      if (c >= end - EPS || c + kerf <= start + EPS) continue;
      if (!bladeIsClear(items, pos, len, c, kerf)) continue;
      const before = items.filter((it) => it[pos] + it[len] <= c + EPS);
      if (before.length === 0 || before.length === items.length) continue;
      found.push({ axis, at: c, before, after: items.filter((it) => it[pos] + it[len] > c + EPS) });
    }
    found.sort((a, b) => a.at - b.at);
    return found;
  }

  function splitRegion(region, axis, at, kerf) {
    if (axis === 'V') {
      const leftW = Math.max(0, at - region.x);
      const rightX = at + kerf;
      return [
        { x: region.x, y: region.y, w: leftW, h: region.h },
        { x: rightX, y: region.y, w: Math.max(0, region.x + region.w - rightX), h: region.h },
      ];
    }
    const topH = Math.max(0, at - region.y);
    const bottomY = at + kerf;
    return [
      { x: region.x, y: region.y, w: region.w, h: topH },
      { x: region.x, y: bottomY, w: region.w, h: Math.max(0, region.y + region.h - bottomY) },
    ];
  }

  /**
   * Връща последователност от проходни резове за подадените позиции.
   * ok === false означава, че разкроят не е изпълним на форматен циркуляр.
   *
   * Ако набор правоъгълници е гилотинно разделим, всеки негов поднабор също е,
   * затова всеки валиден проходен рез е безопасен и връщане назад не е нужно.
   */
  function cutPlan(sheet, parts, kerf) {
    const cuts = [];
    const offcuts = [];
    const stuck = [];

    const emit = (region, axis, at) => {
      const horizontal = axis === 'H';
      cuts.push({
        n: cuts.length + 1,
        axis,
        at,
        from: horizontal ? region.x : region.y,
        to: horizontal ? region.x + region.w : region.y + region.h,
        len: horizontal ? region.w : region.h,
      });
    };

    const walk = (region, items) => {
      if (region.w <= EPS || region.h <= EPS) return;
      if (items.length === 0) {
        offcuts.push(region);
        return;
      }
      if (items.length === 1) return trimSingle(region, items[0]);

      // Голямо празно поле се отрязва първо, за да остане един цял остатък.
      const right = Math.max(...items.map((it) => it.x + it.w));
      const bottom = Math.max(...items.map((it) => it.y + it.h));
      const wasteR = (region.x + region.w - right) * region.h;
      const wasteB = (region.y + region.h - bottom) * region.w;
      if (Math.max(wasteR, wasteB) > 0.05 * region.w * region.h) {
        const axis = wasteR >= wasteB ? 'V' : 'H';
        const at = axis === 'V' ? right : bottom;
        emit(region, axis, at);
        const [kept, waste] = splitRegion(region, axis, at, kerf);
        if (waste.w > EPS && waste.h > EPS) offcuts.push(waste);
        return walk(kept, items);
      }

      const v = separatingCuts(region, items, 'V', kerf);
      const h = separatingCuts(region, items, 'H', kerf);
      if (v.length === 0 && h.length === 0) {
        stuck.push(...items.map((it) => it.id));
        return;
      }
      // Оста с повече проходни резове дава чисти ивици за циркуляра.
      const pick = v.length >= h.length ? v[0] : h[0];
      emit(region, pick.axis, pick.at);
      const [a, b] = splitRegion(region, pick.axis, pick.at, kerf);
      walk(a, pick.before);
      walk(b, pick.after);
    };

    const trimSingle = (region, it) => {
      const remR = region.x + region.w - (it.x + it.w);
      const remB = region.y + region.h - (it.y + it.h);
      const remL = it.x - region.x;
      const remT = it.y - region.y;
      const options = [];
      if (remR > EPS) options.push({ axis: 'V', at: it.x + it.w, keep: 0, area: remR * region.h });
      if (remB > EPS) options.push({ axis: 'H', at: it.y + it.h, keep: 0, area: remB * region.w });
      if (remL > EPS) options.push({ axis: 'V', at: it.x - kerf, keep: 1, area: remL * region.h });
      if (remT > EPS) options.push({ axis: 'H', at: it.y - kerf, keep: 1, area: remT * region.w });
      if (options.length === 0) return;
      // Първо най-големият остатък, за да излезе цял, а не на парчета.
      options.sort((a, b) => b.area - a.area);
      const o = options[0];
      emit(region, o.axis, o.at);
      const pieces = splitRegion(region, o.axis, o.at, kerf);
      const kept = pieces[o.keep];
      const waste = pieces[1 - o.keep];
      if (waste.w > EPS && waste.h > EPS) offcuts.push(waste);
      trimSingle(kept, it);
    };

    walk(usableRegion(sheet), parts);
    return { ok: stuck.length === 0, cuts, offcuts, stuck };
  }

  /** Твърди грешки: извън листа или застъпване. */
  function findCollisions(sheet, parts) {
    const region = usableRegion(sheet);
    const issues = [];
    parts.forEach((a, i) => {
      if (
        a.x < region.x - EPS ||
        a.y < region.y - EPS ||
        a.x + a.w > region.x + region.w + EPS ||
        a.y + a.h > region.y + region.h + EPS
      ) {
        issues.push({ type: 'bounds', id: a.id });
      }
      for (let j = i + 1; j < parts.length; j++) {
        const b = parts[j];
        if (a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS) {
          issues.push({ type: 'overlap', id: a.id, other: b.id });
        }
      }
    });
    return issues;
  }

  // ==========================================================================
  // КОНСТРУИРАНЕ
  // ==========================================================================

  const FITS = ['BAF', 'BSSF', 'BLSF'];
  const SPLITS = ['MINAS', 'MAXAS', 'SLAS', 'LLAS', 'SAS', 'LAS'];

  function fitScore(mode, r, pw, ph) {
    const dw = r.w - pw;
    const dh = r.h - ph;
    const s = Math.min(dw, dh);
    const l = Math.max(dw, dh);
    let score;
    if (mode === 'BAF') score = r.w * r.h - pw * ph + s * 1e-3;
    else if (mode === 'BLSF') score = l * 1e5 + s;
    else score = s * 1e5 + l;
    // Точното попадане спестява цял рез — предпочитаме го винаги.
    if (dw <= EPS && dh <= EPS) return -2e15;
    if (dw <= EPS || dh <= EPS) return score - 1e15;
    return score;
  }

  function fillBin(def, list, kerf, fit, split) {
    const free = def.free.slice();
    const placed = [];
    const rest = [];
    let cutLen = 0;

    for (const it of list) {
      let bestI = -1;
      let bestS = Infinity;
      let bestRot = false;
      for (let i = 0; i < free.length; i++) {
        const r = free[i];
        if (it.w <= r.w + EPS && it.h <= r.h + EPS) {
          const s = fitScore(fit, r, it.w, it.h);
          if (s < bestS) {
            bestS = s;
            bestI = i;
            bestRot = false;
          }
        }
        if (it.rotatable && it.h <= r.w + EPS && it.w <= r.h + EPS) {
          const s = fitScore(fit, r, it.h, it.w);
          if (s < bestS) {
            bestS = s;
            bestI = i;
            bestRot = true;
          }
        }
      }
      if (bestI < 0) {
        rest.push(it);
        continue;
      }

      const r = free[bestI];
      const pw = bestRot ? it.h : it.w;
      const ph = bestRot ? it.w : it.h;
      placed.push({ id: it.id, x: r.x, y: r.y, w: pw, h: ph, turned: bestRot });

      // Рез се отчита само при реален остатък: при точно напасване няма рез и
      // няма загуба от дебелината на диска.
      const remW = r.w - pw;
      const remH = r.h - ph;
      const rightW = remW - kerf;
      const belowH = remH - kerf;
      const hasR = remW > EPS;
      const hasB = remH > EPS;

      // A: хоризонталният рез минава през цялата ширина.
      // B: вертикалният рез минава през цялата височина.
      const areaA = (rightW > 0 ? rightW * ph : 0) + (belowH > 0 ? belowH * r.w : 0);
      const areaB = (rightW > 0 ? rightW * r.h : 0) + (belowH > 0 ? belowH * pw : 0);
      let useA;
      switch (split) {
        case 'SAS': useA = r.w <= r.h; break;
        case 'LAS': useA = r.w >= r.h; break;
        case 'SLAS': useA = remW <= remH; break;
        case 'LLAS': useA = remW >= remH; break;
        case 'MAXAS': useA = areaA >= areaB; break;
        default: useA = areaA <= areaB;
      }

      free.splice(bestI, 1);
      const rightH = useA ? ph : r.h;
      const belowW = useA ? r.w : pw;
      if (useA) {
        if (hasB) cutLen += r.w;
        if (hasR) cutLen += ph;
      } else {
        if (hasR) cutLen += r.h;
        if (hasB) cutLen += pw;
      }
      if (rightW > EPS) free.push({ x: r.x + pw + kerf, y: r.y, w: rightW, h: rightH });
      if (belowH > EPS) free.push({ x: r.x, y: r.y + ph + kerf, w: belowW, h: belowH });
    }

    let used = 0;
    for (const p of placed) used += p.w * p.h;
    for (const p of def.fixed || []) used += p.w * p.h;
    let largest = 0;
    for (const r of free) largest = Math.max(largest, r.w * r.h);
    return { def, placed, free, used, largest, cutLen, rest };
  }

  /**
   * Таблица на постижимите дължини от размери на детайли + диск. Подсказва кой
   * избор оставя място, което после може да се запълни докрай, вместо лента,
   * в която нищо не влиза.
   */
  function buildReach(items, kerf, maxLen) {
    const dims = new Set();
    for (const it of items) {
      dims.add(Math.ceil(it.w + kerf));
      dims.add(Math.ceil(it.h + kerf));
    }
    const list = [...dims].filter((d) => d > 0 && d <= maxLen + kerf + 1);
    const size = Math.ceil(maxLen + kerf + 2);
    const best = new Int32Array(size);
    for (let L = 1; L < size; L++) {
      let b = best[L - 1];
      for (const d of list) {
        if (d <= L) {
          const v = best[L - d] + d;
          if (v > b) b = v;
        }
      }
      best[L] = b;
    }
    return { best, size, kerf };
  }

  function gapOf(reach, L) {
    if (L <= EPS) return 0;
    const idx = Math.floor(L + reach.kerf);
    if (idx >= reach.size) return 0;
    return Math.max(0, idx - reach.best[idx]);
  }

  function rectWaste(reach, w, h) {
    if (w <= EPS || h <= EPS) return 0;
    return gapOf(reach, w) * h + gapOf(reach, h) * w;
  }

  /** Взима празно поле и търси най-добрия детайл за него. */
  function fillByRect(def, list, kerf, ctx, rnd) {
    const { reach } = ctx;
    const free = def.free.slice();
    const closed = [];
    const placed = [];
    const groups = new Map();
    for (const it of list) {
      const k = it.w + 'x' + it.h + (it.rotatable ? 'r' : 'f');
      let g = groups.get(k);
      if (!g) groups.set(k, (g = []));
      g.push(it);
    }
    const noise = 0.02 + rnd() * rnd() * 0.4;
    const rectPolicy = rnd();
    const wasteWeight = 0.3 + rnd() * 1.5;
    const splitNoise = rnd() * 0.25;
    let cutLen = 0;

    while (free.length && groups.size) {
      let ri = 0;
      for (let i = 1; i < free.length; i++) {
        const a = free[i];
        const b = free[ri];
        const better =
          rectPolicy < 0.45 ? a.w * a.h < b.w * b.h :
          rectPolicy < 0.8 ? a.w * a.h > b.w * b.h :
          a.y < b.y || (a.y === b.y && a.x < b.x);
        if (better) ri = i;
      }
      const r = free[ri];
      const area = r.w * r.h;
      let bestK = null;
      let bestS = -Infinity;
      let bestRot = false;
      for (const [k, g] of groups) {
        const it = g[0];
        for (let o = 0; o < (it.rotatable ? 2 : 1); o++) {
          const pw = o ? it.h : it.w;
          const ph = o ? it.w : it.h;
          if (pw > r.w + EPS || ph > r.h + EPS) continue;
          const remW = r.w - pw;
          const remH = r.h - ph;
          const cost = gapOf(reach, remW) * ph + gapOf(reach, remH) * pw;
          let s = (pw * ph - wasteWeight * cost) / area + rnd() * noise;
          if (remW <= EPS || remH <= EPS) s += 0.25;
          if (s > bestS) {
            bestS = s;
            bestK = k;
            bestRot = !!o;
          }
        }
      }
      free.splice(ri, 1);
      if (bestK === null) {
        closed.push(r);
        continue;
      }
      const g = groups.get(bestK);
      const it = g.pop();
      if (!g.length) groups.delete(bestK);
      const pw = bestRot ? it.h : it.w;
      const ph = bestRot ? it.w : it.h;
      placed.push({ id: it.id, x: r.x, y: r.y, w: pw, h: ph, turned: bestRot, src: it });

      const remW = r.w - pw;
      const remH = r.h - ph;
      const rightW = remW - kerf;
      const belowH = remH - kerf;
      const wasteA = rectWaste(reach, rightW, ph) + rectWaste(reach, r.w, belowH);
      const wasteB = rectWaste(reach, rightW, r.h) + rectWaste(reach, pw, belowH);
      let useA = wasteA === wasteB ? rnd() < 0.5 : wasteA < wasteB;
      if (rnd() < splitNoise) useA = !useA;
      if (useA) {
        if (remH > EPS) cutLen += r.w;
        if (remW > EPS) cutLen += ph;
      } else {
        if (remW > EPS) cutLen += r.h;
        if (remH > EPS) cutLen += pw;
      }
      if (rightW > EPS) free.push({ x: r.x + pw + kerf, y: r.y, w: rightW, h: useA ? ph : r.h });
      if (belowH > EPS) free.push({ x: r.x, y: r.y + ph + kerf, w: useA ? r.w : pw, h: belowH });
    }

    const rest = [];
    for (const g of groups.values()) rest.push(...g);
    const allFree = closed.concat(free);
    let used = 0;
    for (const p of placed) used += p.w * p.h;
    for (const p of def.fixed || []) used += p.w * p.h;
    let largest = 0;
    for (const f of allFree) largest = Math.max(largest, f.w * f.h);
    return { def, placed, free: allFree, used, largest, cutLen, rest };
  }

  const ORDER_KEYS = [
    (i) => i.w * i.h,
    (i) => Math.max(i.w, i.h),
    (i) => i.h,
    (i) => i.w,
    (i) => i.w + i.h,
    (i) => Math.max(i.w, i.h) + 0.25 * Math.min(i.w, i.h),
    (i) => Math.max(i.w, i.h) / Math.max(1, Math.min(i.w, i.h)),
    // Групира еднакви размери в ивици.
    (i) => Math.max(i.w, i.h) * 1e4 + Math.min(i.w, i.h),
    (i) => Math.min(i.w, i.h) * 1e4 + Math.max(i.w, i.h),
  ];

  function orderBy(list, keyIndex, noise, rnd) {
    const key = ORDER_KEYS[keyIndex % ORDER_KEYS.length];
    return list
      .map((it) => ({ it, k: key(it) * (noise ? 1 + (rnd() - 0.5) * noise : 1) }))
      .sort((a, b) => b.k - a.k)
      .map((x) => x.it);
  }

  function randomOrder(list, rnd) {
    const r = rnd();
    const key = Math.floor(rnd() * ORDER_KEYS.length);
    if (r < 0.12) {
      const a = list.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
    return orderBy(list, key, r < 0.4 ? 0.08 : r < 0.75 ? 0.3 : 0.7, rnd);
  }

  const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

  /** Запълва лист с най-доброто от няколко опита. */
  function bestFill(def, list, kerf, tries, rnd, ctx) {
    let best = null;
    for (let t = 0; t < tries; t++) {
      const f =
        t % 3 !== 2
          ? fillByRect(def, list, kerf, ctx, rnd)
          : fillBin(def, randomOrder(list, rnd), kerf, pick(FITS, rnd), pick(SPLITS, rnd));
      if (!best || f.used > best.used + EPS || (Math.abs(f.used - best.used) <= EPS && f.largest > best.largest)) {
        best = f;
      }
      if (f.rest.length === 0 && t >= 2) break;
    }
    return best;
  }

  /** Подрежда през зададените листове, а останалото отива на нови цели листове. */
  function construct(items, prefilled, fullDef, kerf, tries, rnd, ctx) {
    let rest = items;
    const bins = [];
    for (const def of prefilled) {
      if (rest.length === 0 && !(def.fixed && def.fixed.length)) continue;
      const f = bestFill(def, rest, kerf, tries, rnd, ctx);
      rest = f.rest;
      if (f.placed.length || (def.fixed && def.fixed.length)) bins.push(f);
    }
    let guard = items.length + 2;
    while (rest.length && guard-- > 0) {
      const f = bestFill(fullDef, rest, kerf, tries, rnd, ctx);
      if (!f.placed.length) break;
      rest = f.rest;
      bins.push(f);
    }
    return { bins, unplaced: rest };
  }

  // ==========================================================================
  // ОЦЕНКА
  // ==========================================================================

  function evaluate(sol, mode) {
    let full = 0;
    let remnantArea = 0;
    let concentration = 0;
    let cutLen = 0;
    let fillSq = 0;
    for (const b of sol.bins) {
      const fill = b.used / b.def.area;
      fillSq += fill * fill;
      if (b.def.kind === 'full') full++;
      else remnantArea += b.def.area;
      const frac = b.largest / b.def.area;
      concentration += frac * frac;
      cutLen += b.cutLen;
    }
    return mode === 'cuts'
      ? [sol.unplaced.length, full, remnantArea, cutLen, -fillSq, -concentration]
      : [sol.unplaced.length, full, remnantArea, -fillSq, -concentration, cutLen];
  }

  function isBetter(a, b) {
    if (!b) return true;
    for (let i = 0; i < a.length; i++) {
      const tol = Math.abs(b[i]) * 1e-9 + 1e-9;
      if (a[i] < b[i] - tol) return true;
      if (a[i] > b[i] + tol) return false;
    }
    return false;
  }

  /**
   * Долна граница за цели листове: площ и детайли, които по условие не могат да
   * споделят лист. Ако решението я достигне, по-малко листа няма как да има.
   */
  function lowerBound(items, fullDef, prefilled) {
    const usable = fullDef.free.reduce((s, r) => s + r.w * r.h, 0);
    let free = 0;
    for (const d of prefilled) free += d.free.reduce((s, r) => s + r.w * r.h, 0);
    const pinnedFull = prefilled.filter((d) => d.kind === 'full' && d.fixed && d.fixed.length).length;
    let area = 0;
    let large = 0;
    const R = fullDef.free[0];
    for (const it of items) {
      area += it.w * it.h;
      const a = it.w > R.w / 2 && it.h > R.h / 2;
      const b = !it.rotatable || (it.h > R.w / 2 && it.w > R.h / 2);
      if (a && b) large++;
    }
    return pinnedFull + Math.max(Math.ceil((area - free) / usable - 1e-9), prefilled.length ? 0 : large, 0);
  }

  function fitsSomewhere(it, defs) {
    return defs.some((d) =>
      d.free.some(
        (r) =>
          (it.w <= r.w + EPS && it.h <= r.h + EPS) ||
          (it.rotatable && it.h <= r.w + EPS && it.w <= r.h + EPS)
      )
    );
  }

  // ==========================================================================
  // ТЪРСЕНЕ
  // ==========================================================================

  /**
   * job: { board:{w,h,trim}, kerf, items:[{id,w,h,rotatable}], mode, bins:[{key,kind,w,h,trim?,free?,fixed?}] }
   * opts: { timeMs, seed, onProgress, shouldStop, now, yieldFn }
   */
  async function solve(job, opts) {
    opts = opts || {};
    const now = opts.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    const yieldFn = opts.yieldFn || (() => new Promise((r) => setTimeout(r, 0)));
    const budget = opts.timeMs == null ? 2000 : opts.timeMs;
    const rnd = makeRng(opts.seed || 20261102);
    const kerf = Math.max(0, job.kerf || 0);
    const mode = job.mode || 'waste';

    const makeDef = (b) => {
      const sheet = { w: b.w, h: b.h, trim: b.trim == null ? job.board.trim || 0 : b.trim };
      const region = usableRegion(sheet);
      return {
        key: b.key,
        kind: b.kind || 'full',
        w: b.w,
        h: b.h,
        trim: sheet.trim,
        area: Math.max(1, b.w * b.h),
        free: b.free ? b.free.map((r) => ({ ...r })) : region.w > 0 && region.h > 0 ? [region] : [],
        fixed: b.fixed || [],
        sourceId: b.sourceId,
      };
    };

    const fullDef = makeDef({ key: 'full', kind: 'full', w: job.board.w, h: job.board.h, trim: job.board.trim || 0 });
    const prefilled = (job.bins || []).map(makeDef);
    const allDefs = [fullDef, ...prefilled];

    const impossible = [];
    const items = [];
    for (const it of job.items) (fitsSomewhere(it, allDefs) ? items : impossible).push(it);

    const bound = lowerBound(items, fullDef, prefilled);
    const ctx = { reach: buildReach(items, kerf, Math.max(job.board.w, job.board.h)) };
    const start = now();
    let lastYield = start;
    let iterations = 0;
    const out = (best, score) => ({
      bins: best.bins,
      score,
      impossible,
      bound,
      iterations,
      elapsed: now() - start,
      fullSheets: score[1],
      provenMinimal: score[1] <= bound,
      def: fullDef,
    });

    let best = null;
    let bestScore = null;
    const consider = (sol) => {
      const s = evaluate(sol, mode);
      if (isBetter(s, bestScore)) {
        best = sol;
        bestScore = s;
        return true;
      }
      return false;
    };

    const breathe = async () => {
      const t = now();
      if (t - lastYield > 24) {
        if (opts.onProgress) opts.onProgress({ fraction: Math.min(1, (t - start) / Math.max(1, budget)), iterations, full: bestScore ? bestScore[1] : null, bound });
        await yieldFn();
        lastYield = now();
      }
    };
    const done = () => now() - start >= budget || (opts.shouldStop && opts.shouldStop());

    // Детерминиран старт: всички класически подредби и правила.
    outer: for (let k = 0; k < ORDER_KEYS.length; k++) {
      const order = orderBy(items, k, 0, rnd);
      for (const fit of FITS) {
        for (const split of SPLITS) {
          let rest = order;
          const bins = [];
          for (const def of prefilled) {
            if (rest.length === 0 && !def.fixed.length) continue;
            const f = fillBin(def, rest, kerf, fit, split);
            rest = f.rest;
            if (f.placed.length || def.fixed.length) bins.push(f);
          }
          let guard = items.length + 2;
          while (rest.length && guard-- > 0) {
            const f = fillBin(fullDef, rest, kerf, fit, split);
            if (!f.placed.length) break;
            rest = f.rest;
            bins.push(f);
          }
          iterations++;
          consider({ bins, unplaced: rest });
          await breathe();
          if (best && now() - start > budget * 0.25) break outer;
          if (opts.shouldStop && opts.shouldStop()) break outer;
        }
      }
    }
    if (!best) consider(construct(items, prefilled, fullDef, kerf, 1, rnd, ctx));

    // Разрушаване и повторно подреждане. „current“ може временно да е малко по-лош
    // от най-добрия, за да не остане търсенето заклещено в едно решение.
    let current = best;
    let currentScore = bestScore;
    const FILL_INDEX = mode === 'cuts' ? 4 : 3;
    const byId = new Map(items.map((it) => [it.id, it]));
    let sinceImprove = 0;

    const accept = (sol) => {
      const s = evaluate(sol, mode);
      if (isBetter(s, bestScore)) {
        best = sol;
        bestScore = s;
        current = sol;
        currentScore = s;
        sinceImprove = 0;
        return;
      }
      sinceImprove++;
      const sameLevel = s[0] === currentScore[0] && s[1] === currentScore[1] && s[2] === currentScore[2];
      if (isBetter(s, currentScore) || (sameLevel && s[FILL_INDEX] <= currentScore[FILL_INDEX] + 0.004 * rnd())) {
        current = sol;
        currentScore = s;
      }
    };

    while (!done()) {
      if (bestScore[1] <= bound && now() - start > budget * 0.5 && sinceImprove > 1500) break;
      iterations++;

      if (sinceImprove > 0 && sinceImprove % 3000 === 0) {
        current = best;
        currentScore = bestScore;
      }

      const roll = rnd();
      if (roll < 0.04 || current.bins.length === 0) {
        accept(construct(items, prefilled, fullDef, kerf, 3, rnd, ctx));
        await breathe();
        if (current.bins.length === 0) break;
        continue;
      }

      const bins = current.bins;
      const ranked = bins.map((b, i) => ({ i, fill: b.used / b.def.area })).sort((a, b) => a.fill - b.fill);
      const victims = new Set();
      victims.add(ranked[Math.min(ranked.length - 1, Math.floor(rnd() * rnd() * ranked.length))].i);
      const extra = Math.min(bins.length - 1, 1 + Math.floor(rnd() * 3));
      for (let g = 0; victims.size <= extra && g < 20; g++) victims.add(Math.floor(rnd() * bins.length));

      const keep = bins.filter((_, i) => !victims.has(i));
      const chosen = bins.filter((_, i) => victims.has(i));
      const pool = [];
      for (const b of chosen) for (const p of b.placed) pool.push(byId.get(p.id));
      pool.push(...current.unplaced);

      const weakest = chosen.reduce((m, b) => (b.used / b.def.area < m.used / m.def.area ? b : m), chosen[0]);
      const defs = chosen
        .filter((b) => !(b === weakest && !b.def.fixed.length && rnd() < 0.35))
        .map((b) => b.def);
      for (let i = defs.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [defs[i], defs[j]] = [defs[j], defs[i]];
      }

      let rest = pool;
      const rebuilt = [];
      for (const def of defs) {
        const f = bestFill(def, rest, kerf, 5, rnd, ctx);
        rest = f.rest;
        if (f.placed.length || def.fixed.length) rebuilt.push(f);
      }
      if (rest.length === 0) accept({ bins: keep.concat(rebuilt), unplaced: [] });
      else sinceImprove++;
      await breathe();
    }

    return out(best, bestScore);
  }

  const api = { solve, cutPlan, findCollisions, usableRegion, makeRng, evaluate, isBetter };
  root.CutEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
