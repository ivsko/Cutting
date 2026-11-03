/*
 * Модули: от размери и избрани елементи към списък с детайли и подредба на стена.
 * Без зависимост от браузъра.
 *
 * Правило за размерите на детайл: w е размерът по фладера, h е напречният.
 * При „Без завъртане“ разкроят поставя w по ширината на листа, където е фладерът.
 */
(function (root) {
  'use strict';

  const DEFAULT_SETTINGS = {
    carcassThick: 18,
    bottomMode: 'between', // between: дъното е между страниците; under: страниците стъпват върху дъното
    railWidth: 100,
    shelfFrontGap: 20,
    shelfSideGap: 1,
    backGroove: 15, // отстояние на канала от задния ръб
    backGrooveDepth: 8,
    backOverlayGap: 2, // наложен гръб е по-малък с толкова от всяка страна
    doorGap: 3,
    slidingOverlap: 30,
    drawerBox: true,
    drawerSlide: 13,
    drawerHeight: 120,
    drawerDepthStep: 50,
    drawerThick: 16,
    plinth: 100,
    plinthCut: false,
    rowGap: 600,
    worktop: true,
    worktopThick: 38,
    worktopDepth: 600,
    worktopOverhangL: 0,
    worktopOverhangR: 0,
    wallPanel: false,
    fillerCut: true,
    cornerFiller: 50,
    profiles: [],
    boards: { carcass: '', face: '', back: '', worktop: '', wallPanel: '', plinth: '' },
    edges: { carcass: '', face: '' },
  };

  const TYPE_DEFAULTS = {
    base: { label: 'Долен', h: 720, d: 560, row: 'lower' },
    wall: { label: 'Горен', h: 720, d: 300, row: 'upper' },
    tall: { label: 'Колона', h: 2100, d: 560, row: 'tall' },
    wardrobe: { label: 'Гардероб', h: 2400, d: 600, row: 'tall' },
    single: { label: 'Елемент', h: 400, d: 0, row: 'none' },
  };

  const FRONT_LABELS = {
    none: 'Без лице',
    hinged: 'Врати на панти',
    sliding: 'Плъзгащи врати',
    drawers: 'Чекмеджета',
    combo: 'Чекмедже и врати',
    lift: 'Вдигащи врати',
    oven: 'Ниша за фурна',
    cornerBlind: 'Ъглова врата и глухо лице',
  };

  const PRESETS = {
    cabinet: { group: 'Долни', label: 'Шкаф', type: 'base', w: 600, shelves: 1, dividers: 0, front: 'hinged', frontCount: 2, back: 'overlay' },
    drawers: { group: 'Долни', label: 'Чекмеджета', type: 'base', w: 600, shelves: 0, dividers: 0, front: 'drawers', frontCount: 3, back: 'overlay' },
    sink: { group: 'Долни', label: 'Мивка', type: 'base', w: 800, shelves: 0, dividers: 0, front: 'hinged', frontCount: 2, back: 'none' },
    oven: { group: 'Долни', label: 'Фурна', type: 'base', w: 600, shelves: 0, dividers: 0, front: 'oven', frontCount: 1, back: 'none', ovenH: 595, ovenDrawer: true },
    wallCab: { group: 'Горни', label: 'Горен шкаф', type: 'wall', w: 600, shelves: 1, dividers: 0, front: 'hinged', frontCount: 2, back: 'overlay' },
    hood: { group: 'Горни', label: 'Аспиратор', type: 'wall', w: 600, h: 360, shelves: 0, dividers: 0, front: 'lift', frontCount: 1, back: 'none', hood: true },
    cornerBase: { group: 'Долни', label: 'Ъглов долен', type: 'base', w: 1000, shelves: 1, dividers: 0, front: 'cornerBlind', frontCount: 1, back: 'overlay', cornerDoor: 450, corner: true },
    cornerWall: { group: 'Горни', label: 'Ъглов горен', type: 'wall', w: 900, shelves: 1, dividers: 0, front: 'cornerBlind', frontCount: 1, back: 'overlay', cornerDoor: 350, corner: true },
    glassCab: { group: 'Горни', label: 'Витрина', type: 'wall', w: 600, shelves: 2, dividers: 0, front: 'hinged', frontCount: 2, back: 'overlay', doorStyle: 'profile', shelfStyle: 'glass' },
    tall: { group: 'Високи', label: 'Колона', type: 'tall', w: 600, shelves: 4, dividers: 0, front: 'hinged', frontCount: 2, back: 'overlay' },
    wardrobe: { group: 'Високи', label: 'Гардероб', type: 'wardrobe', w: 1800, shelves: 3, dividers: 1, front: 'sliding', frontCount: 2, back: 'overlay' },
    worktop: { group: 'Единични', label: 'Плот', type: 'single', w: 2400, h: 600, material: 'worktop', edgeSides: 'none' },
    single: { group: 'Единични', label: 'Единичен елемент', type: 'single', w: 600, h: 400, material: 'carcass', edgeSides: 'front' },
    glassItem: { group: 'Единични', label: 'Стъкло', type: 'single', itemKind: 'glass', w: 600, h: 400 },
    profileItem: { group: 'Единични', label: 'Профил', type: 'single', itemKind: 'profile', w: 1000, h: 0 },
  };

  /**
   * Височини на челата отгоре надолу. Токенът е пропорция (1:2:2) или точен размер (140мм).
   * Връща равни височини, ако записът е неразбираем или с друг брой.
   */
  function drawerHeights(text, count, available) {
    const equal = Array.from({ length: count }, () => available / count);
    if (!text || !String(text).trim()) return { heights: equal, ok: true };
    const tokens = String(text).split(/[:;,/ ]+/).filter(Boolean);
    if (tokens.length !== count) return { heights: equal, ok: false };
    let fixed = 0;
    let parts = 0;
    const parsed = [];
    for (const t of tokens) {
      const v = parseFloat(t.replace(',', '.'));
      if (!(v > 0)) return { heights: equal, ok: false };
      const isMm = /(мм|mm)$/i.test(t);
      parsed.push({ v, isMm });
      if (isMm) fixed += v;
      else parts += v;
    }
    const rest = available - fixed;
    if (rest < 0 || (parts === 0 && Math.abs(rest) > 0.5) || (parts > 0 && rest <= 0)) return { heights: equal, ok: false };
    return { heights: parsed.map((p) => (p.isMm ? p.v : (rest * p.v) / parts)), ok: true };
  }

  const round = (v) => Math.round(v * 10) / 10;

  /** Изчислява детайлите на един модул. Връща и предупреждения за нереални размери. */
  function moduleParts(m, settings) {
    const s = { ...DEFAULT_SETTINGS, ...settings };
    const t = s.carcassThick;
    if (m.type === 'single' && m.itemKind === 'glass') {
      return { parts: [], warnings: [], extras: m.w > 0 && m.h > 0 ? [{ key: 'glass', kind: 'glass', label: m.name || 'Стъкло', w: round(m.w), h: round(m.h), qty: 1, glassId: m.glassId }] : [] };
    }
    if (m.type === 'single' && m.itemKind === 'profile') {
      return { parts: [], warnings: [], extras: m.w > 0 ? [{ key: 'profile', kind: 'profile', label: m.name || 'Профил', len: round(m.w), qty: 1, profileId: m.profileId }] : [] };
    }
    if (m.type === 'single') {
      const sides = { none: {}, front: { top: 1 }, long: { top: 1, bottom: 1 }, all: { top: 1, bottom: 1, left: 1, right: 1 } }[m.edgeSides || 'none'] || {};
      const edges = {};
      for (const k of Object.keys(sides)) edges[k] = m.edgeId || 'carcass';
      const pw = round(m.w);
      const ph = round(m.h);
      return {
        parts: pw > 0 && ph > 0 ? [{ key: 'single', label: m.name || 'Елемент', w: pw, h: ph, qty: 1, material: m.material || 'carcass', boardId: m.boardId || '', edges, solo: true }] : [],
        warnings: [],
        extras: [],
      };
    }
    const extras = [];
    const W = m.w;
    const H = m.h;
    const D = m.d;
    const parts = [];
    const warnings = [];
    const isBase = m.type === 'base';
    const add = (key, label, w, h, qty, material, edges = {}) => {
      if (qty <= 0) return;
      const pw = round(w);
      const ph = round(h);
      if (pw <= 0 || ph <= 0) {
        warnings.push(`${label}: размерът излиза ${pw} × ${ph} мм.`);
        return;
      }
      parts.push({ key, label, w: pw, h: ph, qty, material, edges });
    };

    const under = s.bottomMode === 'under';
    const innerW = W - 2 * t;
    if (innerW <= 0) warnings.push('Модулът е по-тесен от двете си страници.');

    // Страници
    add('side', 'Страница', under ? H - t : H, D, 2, 'carcass', { top: 'carcass' });

    // Дъно и покрив
    add('bottom', m.hood ? 'Дъно (с отвор за аспиратор)' : 'Дъно', under ? W : innerW, D, 1, 'carcass', { top: 'carcass' });
    if (isBase) {
      add('rail', 'Траверса', innerW, s.railWidth, 2, 'carcass');
    } else {
      add('roof', 'Покрив', innerW, D, 1, 'carcass', { top: 'carcass' });
    }

    // Гръб
    const backKind = m.back || 'overlay';
    let backReserve = 0;
    if (backKind === 'overlay') {
      add('back', 'Гръб', W - 2 * s.backOverlayGap, H - 2 * s.backOverlayGap, 1, 'back');
    } else if (backKind === 'groove') {
      backReserve = s.backGroove;
      const openH = H - t - (isBase ? 0 : t);
      add('back', 'Гръб в канал', innerW + 2 * s.backGrooveDepth, openH + (isBase ? 1 : 2) * s.backGrooveDepth, 1, 'back');
    }

    // Делители и рафтове
    const dividers = Math.max(0, Math.floor(m.dividers || 0));
    const shelves = Math.max(0, Math.floor(m.shelves || 0));
    const sections = dividers + 1;
    const clearH = H - t - (isBase ? 0 : t);
    const depth = D - backReserve;
    if (dividers) add('divider', 'Делител', clearH, depth, dividers, 'carcass', { top: 'carcass' });
    if (shelves) {
      const sectionW = (innerW - dividers * t) / sections;
      if (m.shelfStyle === 'glass') {
        extras.push({ key: 'shelf', kind: 'glass', label: 'Стъклен рафт', w: round(sectionW - 2 * s.shelfSideGap), h: round(depth - s.shelfFrontGap), qty: shelves * sections, glassId: m.shelfGlassId });
      } else {
        add('shelf', 'Рафт', sectionW - 2 * s.shelfSideGap, depth - s.shelfFrontGap, shelves * sections, 'carcass', { top: 'carcass' });
      }
      if (sectionW < 100) warnings.push(`Секция от ${round(sectionW)} мм е твърде тясна за рафт.`);
    }

    // Лице
    const g = s.doorGap;
    const front = m.front || 'none';
    const n = Math.max(1, Math.floor(m.frontCount || 1));
    const faceAll = { top: 'face', bottom: 'face', left: 'face', right: 'face' };
    const doorW = (W - n * g) / n;
    /** Врата по избрания вид: плоскост за разкрой, профил със стъкло или стъкло без рамка. */
    const addDoor = (label, physW, physH, qty, grainAcross) => {
      const style = m.doorStyle || 'board';
      if (style === 'board') return add('door', label, grainAcross ? physW : physH, grainAcross ? physH : physW, qty, 'face', faceAll);
      if (physW <= 0 || physH <= 0) return warnings.push(`${label}: размерът излиза ${round(physW)} × ${round(physH)} мм.`);
      if (style === 'glass') {
        extras.push({ key: 'door', kind: 'glass', label: `Стъклена врата`, w: round(physW), h: round(physH), qty, glassId: m.glassId, note: 'с отвори за панти' });
        return;
      }
      const prof = (s.profiles || []).find((p) => p.id === m.profileId) || (s.profiles || [])[0] || { deduct: 26 };
      const d = prof.deduct == null ? 26 : prof.deduct;
      extras.push({ key: 'profW', kind: 'profile', label: `${label}: профил хоризонтален`, len: round(physW), qty: 2 * qty, profileId: m.profileId });
      extras.push({ key: 'profH', kind: 'profile', label: `${label}: профил вертикален`, len: round(physH), qty: 2 * qty, profileId: m.profileId });
      extras.push({ key: 'door', kind: 'glass', label: `${label}: стъкло в рамка`, w: round(physW - d), h: round(physH - d), qty, glassId: m.glassId });
      if (physW - d <= 0 || physH - d <= 0) warnings.push(`Вратата е твърде малка за профила.`);
    };
    if (front === 'hinged') {
      addDoor('Врата', doorW, H - g, n, false);
      if (doorW > 600) warnings.push(`Врата от ${round(doorW)} мм е много широка за панти. Помисли за още една врата.`);
    } else if (front === 'sliding') {
      const slideW = (W + (n - 1) * s.slidingOverlap) / n;
      addDoor('Плъзгаща врата', slideW, H - g, n, false);
    } else if (front === 'lift') {
      const liftH = (H - n * g) / n;
      addDoor('Вдигаща врата', W - g, liftH, n, true);
    } else if (front === 'cornerBlind') {
      const dw = m.cornerDoor || 450;
      const blind = W - dw - 2 * g;
      addDoor('Ъглова врата', dw, H - g, 1, false);
      add('blind', 'Глухо лице', H - g, blind, 1, 'face', faceAll);
      if (blind < 100) warnings.push(`Глухото лице излиза ${round(blind)} мм. Намали вратата или увеличи модула.`);
    } else if (front === 'drawers' || front === 'combo' || front === 'oven') {
      let heights;
      if (front === 'oven') {
        const niche = m.ovenH || 595;
        const rest = H - niche - g;
        heights = rest > 20 ? [rest] : [];
        add('ovenShelf', 'Полица под фурна', innerW, D - backReserve, 1, 'carcass', { top: 'carcass' });
        if (rest <= 20) warnings.push(`Модул от ${round(H)} мм няма място под ниша от ${round(niche)} мм.`);
      } else if (front === 'combo') {
        const frontH = m.drawerFrontH || 140;
        heights = Array.from({ length: n }, () => frontH);
        const rest = H - n * (frontH + g) - g;
        const doors = W > 600 ? 2 : 1;
        addDoor('Врата', (W - doors * g) / doors, rest, doors, false);
        if (rest < 200) warnings.push('Няма достатъчно височина за врата под чекмеджетата.');
      } else {
        const r = drawerHeights(m.drawerRatios, n, H - n * g);
        heights = r.heights;
        if (!r.ok) warnings.push(`Съотношението „${m.drawerRatios}“ не отговаря на ${n} чекмеджета. Ползвам равни височини.`);
      }
      // Еднаквите височини стават един ред; първото чело е най-горното.
      const groups = new Map();
      for (const h of heights) {
        const k = round(h);
        groups.set(k, (groups.get(k) || 0) + 1);
      }
      let gi = 0;
      for (const [frontH, count] of groups) {
        const tag = gi === 0 ? '' : String(gi + 1);
        const suffix = groups.size > 1 ? ` ${frontH}` : '';
        add('drawerFront' + tag, (front === 'oven' ? 'Чело под фурна' : 'Чело чекмедже') + suffix, W - g, frontH, count, 'face', faceAll);
        const hasBox = s.drawerBox && (front !== 'oven' || m.ovenDrawer !== false);
        if (hasBox) {
          const boxH = Math.max(40, Math.min(s.drawerHeight, frontH - 30));
          const usable = D - backReserve - 20;
          const len = Math.max(s.drawerDepthStep, Math.floor(usable / s.drawerDepthStep) * s.drawerDepthStep);
          const boxW = innerW - 2 * s.drawerSlide;
          const dt = s.drawerThick;
          add('drawerSide' + tag, 'Страница чекмедже' + suffix, len, boxH, 2 * count, 'carcass', { top: 'carcass' });
          add('drawerEnd' + tag, 'Чело и гръб на кутия' + suffix, boxW - 2 * dt, boxH, 2 * count, 'carcass', { top: 'carcass' });
          add('drawerBottom' + tag, 'Дъно чекмедже', boxW - 2, len - 2, count, 'back');
          if (boxW < 100) warnings.push('Модулът е твърде тесен за кутия на чекмедже.');
        }
        gi++;
      }
    }
    return { parts, warnings, extras };
  }

  // ==========================================================================
  // ПОДРЕДБА
  // ==========================================================================

  function orderRow(items, order) {
    const a = items.slice();
    if (order === 'wideFirst') return a.sort((p, q) => q.w - p.w);
    if (order === 'narrowFirst') return a.sort((p, q) => p.w - q.w);
    if (order === 'symmetric') {
      // Широките в средата, тесните към краищата, редувайки страните.
      a.sort((p, q) => q.w - p.w);
      const left = [];
      const right = [];
      a.forEach((it, i) => (i % 2 ? right : left).push(it));
      return left.reverse().concat(right);
    }
    if (order === 'edgesWide') {
      a.sort((p, q) => p.w - q.w);
      const left = [];
      const right = [];
      a.forEach((it, i) => (i % 2 ? right : left).push(it));
      return left.reverse().concat(right);
    }
    return a;
  }

  /**
   * rules: { wall, order, tallPos: left|right|ends, upperAlign: left|right|center }
   * Връща позиции върху стената и какво остава.
   */
  function arrange(modules, rules) {
    const r = { wall: 0, order: 'list', tallPos: 'right', upperAlign: 'left', ...rules };
    const expand = (list) => {
      const out = [];
      for (const m of list) for (let i = 0; i < (m.count || 1); i++) out.push({ ...m, id: m.id + '#' + i, moduleId: m.id });
      return out;
    };
    // Ъгловият модул винаги застава в края на реда, към следващата стена.
    const row = (list) => {
      const all = orderRow(expand(list), r.order);
      return all.filter((x) => !x.corner).concat(all.filter((x) => x.corner));
    };
    const lowerItems = row(modules.filter((m) => m.type === 'base'));
    const upperItems = row(modules.filter((m) => m.type === 'wall'));
    const talls = orderRow(expand(modules.filter((m) => m.type === 'tall' || m.type === 'wardrobe')), r.order);

    let leftTalls = [];
    let rightTalls = [];
    if (r.tallPos === 'left') leftTalls = talls;
    else if (r.tallPos === 'ends') talls.forEach((t, i) => (i % 2 ? rightTalls : leftTalls).push(t));
    else rightTalls = talls;

    const sum = (arr) => arr.reduce((n, x) => n + x.w, 0);
    const leftW = sum(leftTalls);
    const rightW = sum(rightTalls);
    const place = (arr, start) => {
      let x = start;
      return arr.map((it) => {
        const p = { ...it, x };
        x += it.w;
        return p;
      });
    };

    const offL = r.offsetLower || 0;
    const offU = r.offsetUpper || 0;
    const tallStart = Math.max(offL, offU);
    const lowerStart = leftW ? tallStart + leftW : offL;
    const upperOrigin = leftW ? tallStart + leftW : offU;
    const lowerW = sum(lowerItems);
    const upperW = sum(upperItems);
    const endLower = lowerStart + lowerW;
    const endUpper = upperOrigin + upperW;
    const needed = Math.max(endLower, endUpper) + rightW;
    const wall = r.wall > 0 ? r.wall : needed;
    const lower = place(lowerItems, lowerStart);
    const span = Math.max(endLower, endUpper);
    let upperStart = upperOrigin;
    if (r.upperAlign === 'right') upperStart = span - upperW;
    else if (r.upperAlign === 'center') upperStart = upperOrigin + (span - upperOrigin - upperW) / 2;
    const upper = place(upperItems, upperStart);
    const rightStart = rightTalls.length ? Math.max(wall - rightW, span) : 0;
    const tall = place(leftTalls, tallStart).concat(place(rightTalls, rightStart));

    return {
      wall,
      lower,
      upper,
      tall,
      lowerW,
      upperW,
      lowerStart,
      offsetLower: offL,
      offsetUpper: offU,
      endLower,
      freeLower: wall - rightW - endLower,
      freeUpper: wall - rightW - endUpper,
      overflow: Math.max(0, needed - wall),
    };
  }

  /**
   * Запълва дължина с разрешени ширини: първо минимален остатък, после най-много
   * модули с предпочитаната ширина, после най-малко модули.
   */
  function fillLength(length, widths, preferred) {
    const L = Math.max(0, Math.floor(length));
    const list = [...new Set(widths.map((w) => Math.floor(w)).filter((w) => w > 0))];
    const INF = 1e9;
    const cost = new Int32Array(L + 1).fill(INF);
    const from = new Int32Array(L + 1).fill(0);
    cost[0] = 0;
    for (let i = 1; i <= L; i++) {
      for (const w of list) {
        if (w <= i && cost[i - w] < INF) {
          const c = cost[i - w] + (w === preferred ? 1 : 1000);
          if (c < cost[i]) {
            cost[i] = c;
            from[i] = w;
          }
        }
      }
    }
    let end = L;
    while (end > 0 && cost[end] >= INF) end--;
    const counts = new Map();
    for (let i = end; i > 0; i -= from[i]) counts.set(from[i], (counts.get(from[i]) || 0) + 1);
    return { items: [...counts].sort((a, b) => b[0] - a[0]).map(([w, count]) => ({ w, count })), remainder: L - end };
  }

  /** Плот и стенен гръб: разделя дълго парче според дължината на плочата. */
  function splitRun(total, maxLen) {
    if (total <= 0 || maxLen <= 0) return [];
    const out = [];
    let left = total;
    while (left > maxLen) {
      out.push(maxLen);
      left -= maxLen;
    }
    out.push(left);
    return out;
  }

  root.ModuleEngine = { PRESETS, drawerHeights, DEFAULT_SETTINGS, TYPE_DEFAULTS, FRONT_LABELS, moduleParts, arrange, fillLength, splitRun };
})(typeof globalThis !== 'undefined' ? globalThis : this);
