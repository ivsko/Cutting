/* Интерфейс и състояние на приложението. Изчисленията са в optimizer.js. */
(function () {
  'use strict';

  const E = window.CutEngine;
  const M = window.ModuleEngine;
  const STORE_KEY = 'cutting.library.v1';
  const OLD_STORE_KEY = 'cutting.project.v2';
  const PROJECT_FIELDS = ['id', 'name', 'parts', 'settings', 'layout', 'layoutSignature', 'updated', 'modules', 'wallRules', 'modSettings', 'walls', 'extraItems'];
  const SIDES = ['top', 'right', 'bottom', 'left'];
  const $ = (id) => document.getElementById(id);

  const esc = (v) =>
    String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, d = 2) => (Math.round(n * 10 ** d) / 10 ** d).toString().replace('.', ',');
  const mm = (n) => (Math.round(n * 10) / 10).toString().replace('.', ',');
  const money = (n) => '€' + n.toFixed(2).replace('.', ',');
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // Там, където браузърът не разрешава печат и сваляне на файлове (вграден преглед),
  // тези бутони се скриват и остава копирането.
  const SANDBOXED = !!window.__CUTTING_SANDBOXED__;

  // ==========================================================================
  // СЪСТОЯНИЕ
  // ==========================================================================

  const defaults = () => ({
    id: null,
    name: '',
    boards: [
      { id: 'b1', name: 'ДЪБ СОНОМА', hex: '#d2b48c', w: 2800, h: 2070, hasGrain: true, price: 61.35, thick: 18 },
      { id: 'b2', name: 'БЯЛ ГЛАНЦ', hex: '#ffffff', w: 2800, h: 2070, hasGrain: false, price: 48.57, thick: 18 },
    ],
    edges: [
      { id: 'e1', name: 'ОРЕХ 2mm', hex: '#8b4513', thick: 2, pricePerM: 0.61 },
      { id: 'e2', name: 'БЯЛ', hex: '#f4f4f4', thick: 2, pricePerM: 0.46 },
    ],
    parts: [],
    stock: [],
    settings: { kerf: 4, trim: 0, minOffcut: 150, edgeAllowance: 10, priority: 'waste', searchTime: 4000 },
    layout: null,
    layoutSignature: null,
    modules: [],
    wallRules: { wall: 0, order: 'list', tallPos: 'right', upperAlign: 'left', widths: '300,400,450,500,600,800,900', preferred: 600 },
    modSettings: {},
    walls: [{ id: 'A', wall: 0, order: 'list', tallPos: 'right', upperAlign: 'left' }],
    extraItems: [],
    glasses: [
      { id: 'gl4', name: 'Прозрачно 4 мм', hex: '#cfe6ee', thick: 4, price: 25 },
      { id: 'gl4m', name: 'Матирано 4 мм', hex: '#e3eef1', thick: 4, price: 35 },
      { id: 'gl6', name: 'Рафт закалено 6 мм', hex: '#bfdde6', thick: 6, price: 55 },
    ],
    profiles: [{ id: 'pr20', name: 'Алуминиев 20 мм', hex: '#b4b8bc', deduct: 26, price: 9 }],
  });

  let state = defaults();
  let selectedId = null;
  let editingPartId = null;
  let undoStack = [];
  let redoStack = [];
  let running = false;
  let stopRequested = false;
  let formEdges = {};
  let activeWallId = 'A';
  let currentView = 'parts';
  let lastProof = {};

  let library = { currentId: null, projects: {} };
  let storageWarned = false;

  const projectRecord = () => {
    const r = {};
    for (const f of PROJECT_FIELDS) r[f] = state[f];
    return r;
  };

  function save() {
    state.updated = Date.now();
    library.projects[state.id] = projectRecord();
    library.currentId = state.id;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...library, boards: state.boards, edges: state.edges, stock: state.stock, glasses: state.glasses, profiles: state.profiles }));
    } catch (err) {
      if (err && err.name === 'QuotaExceededError' && !storageWarned) {
        storageWarned = true;
        toast('Паметта на браузъра е пълна. Изтрий стари проекти или запази този във файл.');
      }
    }
  }

  function setProject(rec) {
    const d = defaults();
    state = { ...d, boards: state.boards, edges: state.edges, stock: state.stock, glasses: state.glasses, profiles: state.profiles, ...rec, settings: { ...d.settings, ...(rec.settings || {}) } };
    state.parts = (state.parts || []).map(migratePart);
    // По-старите проекти пазят една стена в wallRules.
    if (!rec.walls && rec.wallRules) {
      const r = rec.wallRules;
      state.walls = [{ id: 'A', wall: r.wall || 0, order: r.order || 'list', tallPos: r.tallPos || 'right', upperAlign: r.upperAlign || 'left' }];
    }
    activeWallId = state.walls[0].id;
    selectedId = null;
    editingPartId = null;
    formEdges = {};
    undoStack = [];
    redoStack = [];
    lastProof = {};
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const lib = JSON.parse(raw);
        library = { currentId: lib.currentId, projects: lib.projects || {}, modulesSeeded: lib.modulesSeeded };
        state.boards = lib.boards || state.boards;
        state.edges = lib.edges || state.edges;
        state.stock = lib.stock || [];
        if (lib.glasses) state.glasses = lib.glasses;
        if (lib.profiles) state.profiles = lib.profiles;
        const rec = library.projects[lib.currentId] || Object.values(library.projects)[0];
        if (rec) setProject(rec);
        return true;
      }
      const old = localStorage.getItem(OLD_STORE_KEY);
      if (old) {
        const p = JSON.parse(old);
        state.boards = p.boards || state.boards;
        state.edges = p.edges || state.edges;
        state.stock = p.stock || [];
        setProject({ id: uid('prj'), name: p.name || '', parts: p.parts, settings: p.settings });
        save();
        return true;
      }
    } catch (_) {
      /* Повредените или недостъпни данни се пренебрегват. */
    }
    return false;
  }

  function newProject(name, settings) {
    if (state.id) save();
    setProject({ id: uid('prj'), name: name || '', parts: [], layout: null, layoutSignature: null, settings: settings || state.settings });
  }

  function openProject(id) {
    const rec = library.projects[id];
    if (!rec || id === state.id) return;
    save();
    setProject(rec);
    save();
    resetEditMode();
    renderAll();
    showView(state.layout ? 'results' : 'parts');
  }

  function deleteProject() {
    const removed = projectRecord();
    delete library.projects[state.id];
    const others = Object.values(library.projects).sort((a, b) => (b.updated || 0) - (a.updated || 0));
    if (others.length) setProject(others[0]);
    else setProject({ id: uid('prj'), name: '', parts: [], layout: null, layoutSignature: null });
    save();
    resetEditMode();
    renderAll();
    showView('parts');
    toast(`Проектът „${removed.name || 'Без име'}“ е изтрит.`, {
      label: 'Върни',
      fn: () => {
        library.projects[removed.id] = removed;
        save();
        state.id = null;
        setProject(removed);
        save();
        renderAll();
      },
    });
  }

  function renderProjects() {
    const list = Object.values(library.projects).sort((a, b) => (b.updated || 0) - (a.updated || 0));
    if (state.id && !library.projects[state.id]) list.unshift(projectRecord());
    const when = (t) => (t ? new Date(t).toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit' }) : '');
    $('projectList').innerHTML = list
      .map((p) => {
        const count = (p.parts || []).reduce((n, x) => n + (x.qty || 0), 0);
        return `<button type="button" class="project-item${p.id === state.id ? ' active' : ''}" data-id="${esc(p.id)}"><span>${esc(p.name || 'Без име')}</span><small>${when(p.updated)} · ${count} дет.</small></button>`;
      })
      .join('');
    $('projectStatus').textContent = 'Записват се автоматично в този браузър.';
  }

  /** Импортираният файл става нов проект, а материалите му се добавят към базата. */
  function importProject(data) {
    for (const b of data.boards || []) if (!board(b.id)) state.boards.push(b);
    for (const e of data.edges || []) if (!edge(e.id)) state.edges.push(e);
    newProject(data.name, data.settings);
    state.parts = (data.parts || []).map(migratePart);
    state.modules = data.modules || [];
    if (data.wallRules) state.wallRules = data.wallRules;
    state.modSettings = data.modSettings || {};
    if (data.walls) state.walls = data.walls;
    else if (data.wallRules) state.walls = [{ id: 'A', wall: data.wallRules.wall || 0, order: data.wallRules.order || 'list', tallPos: data.wallRules.tallPos || 'right', upperAlign: data.wallRules.upperAlign || 'left' }];
    activeWallId = state.walls[0].id;
    state.extraItems = data.extraItems || [];
    for (const g of data.glasses || []) if (!state.glasses.some((x) => x.id === g.id)) state.glasses.push(g);
    for (const p of data.profiles || []) if (!state.profiles.some((x) => x.id === p.id)) state.profiles.push(p);
    state.layout = data.layout || null;
    state.layoutSignature = data.layoutSignature || null;
    save();
    resetEditMode();
    renderAll();
    showView(state.layout ? 'results' : 'parts');
  }

  function migratePart(p) {
    const out = { label: '', qty: 1, allowRotate: true, ...p, edges: p.edges || {} };
    // По-старите проекти пазят посока на фладера. Новият модел е само с/без завъртане.
    if ('orient' in out) {
      const b = board(out.boardId);
      if (out.orient === 'h') {
        [out.w, out.h] = [out.h, out.w];
        const e = out.edges;
        out.edges = {};
        for (const k of Object.keys(e)) out.edges[shownSide(k, true)] = e[k];
      }
      if (b && b.hasGrain) out.allowRotate = false;
      delete out.orient;
    }
    return out;
  }

  const board = (id) => state.boards.find((b) => b.id === id);
  const edge = (id) => state.edges.find((e) => e.id === id);

  // ==========================================================================
  // РАЗМЕРИ НА ДЕТАЙЛ
  // ==========================================================================

  const sideThick = (p, s) => {
    const e = edge(p.edges[s]);
    return e ? e.thick : 0;
  };
  /** Размер за рязане = краен размер минус дебелината на канта. */
  const cutSize = (p) => ({
    w: p.w - sideThick(p, 'left') - sideThick(p, 'right'),
    h: p.h - sideThick(p, 'top') - sideThick(p, 'bottom'),
  });

  const partById = (id) => state.parts.find((p) => p.id === id);

  /** Позицията носи partId, копие и завъртане спрямо чертежа на детайла. */
  function placementInfo(pl) {
    const p = partById(pl.partId);
    return p ? { part: p, cut: cutSize(p) } : null;
  }

  /** Кантът следва реалното завъртане на 90° по часовниковата стрелка. */
  function shownSide(side, rot) {
    if (!rot) return side;
    return { top: 'left', right: 'top', bottom: 'right', left: 'bottom' }[side];
  }

  function layoutSignature() {
    return JSON.stringify({
      p: state.parts.map((p) => [p.id, p.w, p.h, p.qty, p.boardId, p.edges, p.allowRotate]),
      b: state.boards.map((b) => [b.id, b.w, b.h, b.hasGrain]),
      e: state.edges.map((e) => [e.id, e.thick]),
      s: [state.settings.kerf, state.settings.trim],
    });
  }

  // ==========================================================================
  // ИЗЧИСЛЯВАНЕ НА РАЗКРОЯ
  // ==========================================================================

  function expandParts() {
    const out = {};
    const missing = [];
    for (const p of state.parts) {
      const b = board(p.boardId);
      if (!b) {
        missing.push(p);
        continue;
      }
      const c = cutSize(p);
      for (let i = 0; i < p.qty; i++) {
        (out[b.id] = out[b.id] || []).push({
          id: p.id + '#' + i,
          partId: p.id,
          w: c.w,
          h: c.h,
          baseRot: false,
          rotatable: !!p.allowRotate,
        });
      }
    }
    return { groups: out, missing };
  }

  function stockBins(boardId, trim) {
    const bins = [];
    for (const s of state.stock) {
      if (s.boardId !== boardId) continue;
      for (let i = 0; i < s.qty; i++) {
        bins.push({ key: s.id + '#' + i, kind: 'remnant', w: s.w, h: s.h, trim: 0, sourceId: s.id, _trim: trim });
      }
    }
    return bins.sort((a, b) => b.w * b.h - a.w * a.h);
  }

  /** Заключен детайл важи само докато съществува със същите размери. */
  function validPin(pl, groups) {
    const item = Object.values(groups).flat().find((i) => i.id === pl.id);
    if (!item) return false;
    const a = [item.w, item.h].join();
    const b = [pl.w, pl.h].join();
    const c = [pl.h, pl.w].join();
    return a === b || a === c;
  }

  function setRunning(on) {
    running = on;
    $('runCutting').disabled = on;
    $('improve').disabled = on;
    $('progress').hidden = !on;
  }

  /**
   * mode 'fresh'  — нов разкрой, заключените детайли се пазят само ако keepPins.
   * mode 'improve'— запазва заключените, търси с нов старт и сменя резултата само ако е по-добър.
   */
  async function runOptimizer({ keepPins, improving }) {
    if (running) return;
    if (!state.parts.length) return toast('Добави поне един детайл.');
    readSettings();
    stopRequested = false;
    setRunning(true);
    $('progressBar').style.width = '0';

    const { kerf, trim, priority, searchTime } = state.settings;
    const { groups, missing } = expandParts();
    const prevLayout = state.layout ? JSON.parse(JSON.stringify(state.layout)) : null;

    const pinned = new Map();
    const pinnedIds = new Set();
    if (keepPins && prevLayout) {
      for (const sh of prevLayout.sheets) {
        const pins = sh.parts.filter((p) => p.pinned && validPin(p, groups));
        if (pins.length) {
          (pinned.get(sh.boardId) || pinned.set(sh.boardId, []).get(sh.boardId)).push({ sh, pins });
          pins.forEach((p) => pinnedIds.add(p.id));
        }
      }
    }

    const totalItems = Object.values(groups).reduce((s, g) => s + g.length, 0) || 1;
    const outSheets = [];
    const proof = {};
    let progressed = 0;

    for (const boardId of Object.keys(groups)) {
      const b = board(boardId);
      const items = groups[boardId].filter((i) => !pinnedIds.has(i.id));
      const share = groups[boardId].length / totalItems;
      const timeMs = Math.max(300, searchTime * share);

      const preset = (pinned.get(boardId) || []).map(({ sh, pins }) => {
        const sheet = { w: sh.w, h: sh.h, trim: sh.trim };
        const plan = E.cutPlan(sheet, pins, kerf);
        return {
          key: sh.id, kind: sh.kind, w: sh.w, h: sh.h, trim: sh.trim, free: plan.offcuts, fixed: pins, sourceId: sh.sourceId,
          _keepStock: sh.stockKey,
        };
      });
      const usedStock = new Set(preset.map((d) => d._keepStock).filter(Boolean));
      const remnants = stockBins(boardId, trim).filter((d) => !usedStock.has(d.key));

      const result = await E.solve(
        { board: { w: b.w, h: b.h, trim }, kerf, items, mode: priority, bins: preset.concat(remnants) },
        {
          timeMs,
          seed: improving ? (Date.now() & 0xffffff) + 1 : 20261102,
          shouldStop: () => stopRequested,
          onProgress: (s) => {
            const f = progressed + s.fraction * share;
            $('progressBar').style.width = Math.min(100, f * 100) + '%';
            $('progressText').textContent = `${b.name}: ${s.iterations.toLocaleString('bg')} варианта, ${s.full ?? '–'} листа, минимум ${s.bound}`;
          },
        }
      );
      progressed += share;
      proof[boardId] = { bound: result.bound, minimal: result.provenMinimal, iterations: result.iterations };

      const byId = new Map(items.map((i) => [i.id, i]));
      for (const bin of result.bins) {
        const parts = (bin.def.fixed || []).map((p) => ({ ...p }));
        for (const pl of bin.placed) {
          const src = byId.get(pl.id);
          parts.push({
            id: pl.id, partId: src.partId, x: pl.x, y: pl.y, w: pl.w, h: pl.h,
            rot: src.baseRot !== !!pl.turned, pinned: false,
          });
        }
        outSheets.push({
          id: uid('s'), boardId, w: bin.def.w, h: bin.def.h, trim: bin.def.trim, kind: bin.def.kind,
          stockKey: bin.def.kind === 'remnant' ? bin.def.key : bin.def._keepStock, sourceId: bin.def.sourceId, parts,
        });
      }
    }

    setRunning(false);

    const candidate = { sheets: outSheets };
    if (improving && prevLayout && !isLayoutBetter(candidate, prevLayout)) {
      lastProof = { ...lastProof, ...proof };
      render();
      return toast('Не намерих по-добър вариант. Настоящият разкрой остава.');
    }

    pushUndo();
    state.layout = candidate;
    state.layoutSignature = layoutSignature();
    lastProof = proof;
    selectedId = null;
    save();
    renderParts();
    render();
    if (improving) toast('Намерих по-добър разкрой. „Назад“ връща предишния.');
    showView('results');
  }

  function layoutMetrics(layout) {
    const { kerf } = state.settings;
    let full = 0;
    let remnantArea = 0;
    let cuts = 0;
    let squares = 0;
    let bad = 0;
    for (const sh of layout.sheets) {
      if (!sh.parts.length) continue;
      if (sh.kind === 'full') full++;
      else remnantArea += sh.w * sh.h;
      const plan = E.cutPlan(sh, sh.parts, kerf);
      if (!plan.ok) bad++;
      cuts += plan.cuts.length;
      const big = Math.max(0, ...plan.offcuts.map((o) => o.w * o.h));
      squares += (big / (sh.w * sh.h)) ** 2;
    }
    return { full, remnantArea, cuts, squares, bad };
  }

  function isLayoutBetter(a, b) {
    const A = layoutMetrics(a);
    const B = layoutMetrics(b);
    if (A.bad !== B.bad) return A.bad < B.bad;
    if (A.full !== B.full) return A.full < B.full;
    if (Math.abs(A.remnantArea - B.remnantArea) > 1) return A.remnantArea < B.remnantArea;
    if (state.settings.priority === 'cuts' && A.cuts !== B.cuts) return A.cuts < B.cuts;
    if (Math.abs(A.squares - B.squares) > 1e-6) return A.squares > B.squares;
    return A.cuts < B.cuts;
  }

  // ==========================================================================
  // ИСТОРИЯ
  // ==========================================================================

  const snapshot = () => JSON.stringify({ layout: state.layout, parts: state.parts, boards: state.boards, edges: state.edges, stock: state.stock, sig: state.layoutSignature, modules: state.modules, wallRules: state.wallRules, modSettings: state.modSettings, walls: state.walls, extraItems: state.extraItems, glasses: state.glasses, profiles: state.profiles });

  function restore(snap) {
    const s = JSON.parse(snap);
    state.layout = s.layout;
    state.parts = s.parts;
    state.boards = s.boards;
    state.edges = s.edges;
    state.stock = s.stock;
    state.layoutSignature = s.sig;
    state.modules = s.modules || [];
    state.wallRules = s.wallRules || state.wallRules;
    state.modSettings = s.modSettings || {};
    if (s.walls) state.walls = s.walls;
    state.extraItems = s.extraItems || [];
    if (s.glasses) state.glasses = s.glasses;
    if (s.profiles) state.profiles = s.profiles;
    if (!state.walls.some((w) => w.id === activeWallId)) activeWallId = state.walls[0].id;
    selectedId = null;
    save();
    renderAll();
  }

  function pushUndo() {
    undoStack.push(snapshot());
    if (undoStack.length > 60) undoStack.shift();
    redoStack = [];
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    restore(undoStack.pop());
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    restore(redoStack.pop());
  }

  // ==========================================================================
  // РЕНДЕР: СПРАВОЧНИЦИ
  // ==========================================================================

  function renderMasters() {
    $('boardsTable').querySelector('tbody').innerHTML = state.boards
      .map(
        (b) => `<tr data-id="${esc(b.id)}">
        <td><input type="color" data-f="hex" value="${esc(b.hex)}" aria-label="Цвят"></td>
        <td><input class="input-label" data-f="name" value="${esc(b.name)}" aria-label="Декор"></td>
        <td class="num"><input type="number" min="1" data-f="w" value="${b.w}" aria-label="Ширина"></td>
        <td class="num"><input type="number" min="1" data-f="h" value="${b.h}" aria-label="Височина"></td>
        <td class="num"><input type="number" min="1" step="0.5" data-f="thick" value="${b.thick == null ? 18 : b.thick}" aria-label="Дебелина"></td>
        <td><select data-f="hasGrain" aria-label="Фладер"><option value="1"${b.hasGrain ? ' selected' : ''}>Да</option><option value="0"${b.hasGrain ? '' : ' selected'}>Не</option></select></td>
        <td class="num"><input type="number" min="0" step="0.01" data-f="price" value="${b.price}" aria-label="Цена"></td>
        <td><button class="icon-btn" data-del type="button" aria-label="Изтрий ${esc(b.name)}">×</button></td></tr>`
      )
      .join('');

    $('edgesTable').querySelector('tbody').innerHTML = state.edges
      .map(
        (e) => `<tr data-id="${esc(e.id)}">
        <td><input type="color" data-f="hex" value="${esc(e.hex)}" aria-label="Цвят"></td>
        <td><input class="input-label" data-f="name" value="${esc(e.name)}" aria-label="Декор"></td>
        <td class="num"><input type="number" min="0" step="0.1" data-f="thick" value="${e.thick}" aria-label="Дебелина"></td>
        <td class="num"><input type="number" min="0" step="0.01" data-f="pricePerM" value="${e.pricePerM}" aria-label="Цена на метър"></td>
        <td><button class="icon-btn" data-del type="button" aria-label="Изтрий ${esc(e.name)}">×</button></td></tr>`
      )
      .join('');

    const boardOpts = (sel) => state.boards.map((b) => `<option value="${esc(b.id)}"${b.id === sel ? ' selected' : ''}>${esc(b.name)}</option>`).join('');

    $('stockTable').querySelector('tbody').innerHTML = state.stock
      .map(
        (s) => `<tr data-id="${esc(s.id)}">
        <td><select data-f="boardId" aria-label="Плоскост">${boardOpts(s.boardId)}</select></td>
        <td class="num"><input type="number" min="1" data-f="w" value="${s.w}" aria-label="Ширина"></td>
        <td class="num"><input type="number" min="1" data-f="h" value="${s.h}" aria-label="Височина"></td>
        <td class="num"><input type="number" min="1" data-f="qty" value="${s.qty}" aria-label="Брой"></td>
        <td><button class="icon-btn" data-del type="button" aria-label="Изтрий остатъка">×</button></td></tr>`
      )
      .join('');
    $('glassTable').querySelector('tbody').innerHTML = state.glasses
      .map((g) => `<tr data-id="${esc(g.id)}"><td><input type="color" data-f="hex" value="${esc(g.hex)}" aria-label="Цвят"></td><td><input class="input-label" data-f="name" value="${esc(g.name)}" aria-label="Вид"></td><td class="num"><input type="number" min="0" step="0.5" data-f="thick" value="${g.thick}" aria-label="Дебелина"></td><td class="num"><input type="number" min="0" step="0.01" data-f="price" value="${g.price}" aria-label="Цена за квадратен метър"></td><td><button class="icon-btn" data-del type="button" aria-label="Изтрий">×</button></td></tr>`)
      .join('');
    $('profileTable').querySelector('tbody').innerHTML = state.profiles
      .map((p) => `<tr data-id="${esc(p.id)}"><td><input type="color" data-f="hex" value="${esc(p.hex)}" aria-label="Цвят"></td><td><input class="input-label" data-f="name" value="${esc(p.name)}" aria-label="Вид"></td><td class="num"><input type="number" min="0" step="0.5" data-f="deduct" value="${p.deduct}" aria-label="Стъклото по-малко с"></td><td class="num"><input type="number" min="0" step="0.01" data-f="price" value="${p.price}" aria-label="Цена на метър"></td><td><button class="icon-btn" data-del type="button" aria-label="Изтрий">×</button></td></tr>`)
      .join('');
    const stockTotal = state.stock.reduce((n, s) => n + s.qty, 0);
    $('stockCount').textContent = stockTotal ? `(${stockTotal})` : '';

    const prevB = $('partBoardSelect').value;
    $('partBoardSelect').innerHTML = boardOpts(prevB);
    if (!board($('partBoardSelect').value) && state.boards[0]) $('partBoardSelect').value = state.boards[0].id;

    const edgeSel = $('partEdgeSelect');
    const prevEdge = edgeSel.value;
    edgeSel.innerHTML = state.edges.map((e) => `<option value="${esc(e.id)}">${esc(e.name)} (${mm(e.thick)} мм)</option>`).join('');
    if (edge(prevEdge)) edgeSel.value = prevEdge;
    for (const k of SIDES) if (!edge(formEdges[k])) delete formEdges[k];
    renderOrient();
    renderEdgeButtons();
    updatePreview();
  }

  function renderOrient(setDefault) {
    const el = $('partOrient');
    if (!el.options.length) el.innerHTML = '<option value="lock">Без завъртане</option><option value="free">Завъртане</option>';
    if (setDefault) {
      const b = board($('partBoardSelect').value);
      el.value = b && b.hasGrain ? 'lock' : 'free';
    }
  }

  const readOrient = () => ({ allowRotate: $('partOrient').value === 'free' });

  /** Малък чертеж на детайла с оцветените кантирани страни. */
  function edgeIcon(p) {
    const side = (s, x1, y1, x2, y2) => {
      const e = edge(p.edges[s]);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${e ? esc(e.hex) : 'var(--line)'}" stroke-width="${e ? 4 : 1.5}"/>${e ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--fg)" stroke-width=".6"/>` : ''}`;
    };
    return `<svg class="edge-icon" viewBox="0 0 34 22" width="34" height="22" aria-hidden="true">${side('top', 3, 3, 31, 3)}${side('bottom', 3, 19, 31, 19)}${side('left', 3, 3, 3, 19)}${side('right', 31, 3, 31, 19)}</svg>`;
  }

  function edgeText(p) {
    const list = edgeGroups(p);
    return list.length ? list.map((g) => `по ${mm(g.len)} × ${g.n}`).join(', ') : 'без кант';
  }

  function isShort(p) {
    if (!state.layout || state.layoutSignature !== layoutSignature()) return false;
    const n = state.layout.sheets.reduce((c, sh) => c + sh.parts.filter((x) => x.partId === p.id).length, 0);
    return n < p.qty;
  }

  function renderParts() {
    const body = $('partsList');
    const options = (sel) => state.boards.map((b) => `<option value="${esc(b.id)}"${b.id === sel ? ' selected' : ''}>${esc(b.name)}</option>`).join('');
    body.innerHTML = state.parts
      .map((p) => {
        const b = board(p.boardId);
        const orient = `<select data-f="allowRotate" aria-label="Завъртане"><option value="0"${p.allowRotate ? '' : ' selected'}>Без завъртане</option><option value="1"${p.allowRotate ? ' selected' : ''}>Завъртане</option></select>`;
        const cls = [p.id === editingPartId ? 'editing' : '', !b || isShort(p) ? 'missing' : ''].join(' ').trim();
        return `<tr data-id="${esc(p.id)}" class="${cls}">
          <td><input class="input-label" data-f="label" value="${esc(p.label)}" placeholder="без име" aria-label="Име"></td>
          <td class="num"><input type="number" min="1" step="0.1" data-f="w" value="${p.w}" aria-label="Ширина"></td>
          <td class="num"><input type="number" min="1" step="0.1" data-f="h" value="${p.h}" aria-label="Височина"></td>
          <td class="num"><input type="number" min="1" data-f="qty" value="${p.qty}" aria-label="Брой"></td>
          <td><select data-f="boardId" aria-label="Плоскост">${options(p.boardId)}</select></td>
          <td><button class="edge-summary" type="button" data-edit title="Промени кантовете">${edgeIcon(p)}<span>${esc(edgeText(p))}</span></button></td>
          <td>${orient}</td>
          <td class="row-actions"><button class="icon-btn" data-del type="button" aria-label="Изтрий">×</button></td>
        </tr>`;
      })
      .join('');
    $('partsEmpty').hidden = state.parts.length > 0;
    $('partsHint').hidden = !state.parts.some((p) => p.id.startsWith('m:'));
  }

  // ==========================================================================
  // ПРЕГЛЕД НА ДЕТАЙЛА
  // ==========================================================================

  let previewBox = null;

  function renderEdgeButtons() {
    const w = mm(+$('partWidth').value || 0);
    const h = mm(+$('partHeight').value || 0);
    const lens = { top: w, bottom: w, left: h, right: h };
    document.querySelectorAll('.edge-side').forEach((b) => {
      const k = b.dataset.side;
      const e = edge(formEdges[k]);
      b.textContent = lens[k] + (e ? ' ✓' : '');
      b.classList.toggle('on', !!e);
      b.setAttribute('aria-pressed', e ? 'true' : 'false');
      b.title = e ? e.name : 'Без кант';
    });
  }

  function toggleEdgeSide(k) {
    const current = $('partEdgeSelect').value;
    if (formEdges[k] === current) delete formEdges[k];
    else if (edge(current)) formEdges[k] = current;
    else return toast('Първо добави вид кант в „Материали“.');
    renderEdgeButtons();
    updatePreview();
  }

  function grainLines(ctx, x, y, w, h, along, color) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = 'rgba(60,35,10,.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (along === 'w') for (let i = y + 4; i < y + h; i += 7) { ctx.moveTo(x, i); ctx.lineTo(x + w, i + 2); }
    else for (let i = x + 4; i < x + w; i += 7) { ctx.moveTo(i, y); ctx.lineTo(i + 2, y + h); }
    ctx.stroke();
    ctx.restore();
  }

  function updatePreview() {
    const c = $('partPreviewCanvas');
    const ctx = c.getContext('2d');
    const W = c.width;
    const H = c.height;
    ctx.clearRect(0, 0, W, H);
    const w = +$('partWidth').value;
    const h = +$('partHeight').value;
    const b = board($('partBoardSelect').value);
    if (!(w > 0 && h > 0) || !b) return;
    const m = 8;
    const s = Math.min((W - 2 * m) / w, (H - 2 * m) / h);
    const dw = w * s;
    const dh = h * s;
    const x = (W - dw) / 2;
    const y = (H - dh) / 2;
    ctx.fillStyle = b.hex;
    ctx.fillRect(x, y, dw, dh);
    if (b.hasGrain) grainLines(ctx, x, y, dw, dh, 'w');
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, dw - 1, dh - 1);
    const band = 4;
    const side = (k, rx, ry, rw, rh) => {
      const e = edge(formEdges[k]);
      if (e) {
        ctx.fillStyle = e.hex;
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeStyle = '#222';
        ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
      }
    };
    side('top', x, y, dw, band);
    side('bottom', x, y + dh - band, dw, band);
    side('left', x, y, band, dh);
    side('right', x + dw - band, y, band, dh);
    previewBox = { x, y, dw, dh };
    ctx.font = '600 12px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = `${mm(w)} × ${mm(h)}`;
    const tw = ctx.measureText(label).width + 8;
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillRect(W / 2 - tw / 2, H / 2 - 9, tw, 18);
    ctx.fillStyle = '#111';
    ctx.fillText(label, W / 2, H / 2);
  }

  // ==========================================================================
  // РЕНДЕР: ЛИСТОВЕ
  // ==========================================================================

  const SVG_W = 1000;
  const SVG_M = 46; // Поле за размерните линии отгоре и отляво.

  const posOf = (partId) => state.parts.findIndex((p) => p.id === partId) + 1;

  function textColorFor(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#111';
    const n = parseInt(m[1], 16);
    const l = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
    return l > 120 ? '#111' : '#fff';
  }

  function sheetAnalysis(sh) {
    const { kerf, minOffcut } = state.settings;
    const collisions = E.findCollisions(sh, sh.parts);
    const plan = E.cutPlan(sh, sh.parts, kerf);
    const used = sh.parts.reduce((s, p) => s + p.w * p.h, 0);
    const offcuts = plan.offcuts.filter((o) => o.w >= minOffcut && o.h >= minOffcut);
    return { collisions, plan, used, offcuts, fill: used / (sh.w * sh.h) };
  }

  /** Размерни линии за главните резове, които минават през целия лист. */
  function dimensionLines(sh, a, scale) {
    const { kerf } = state.settings;
    const region = E.usableRegion(sh);
    const segments = (axis, start, length, across) => {
      const cuts = a.plan.cuts
        .filter((c) => c.axis === axis && c.len >= across * 0.75)
        .map((c) => c.at)
        .sort((p, q) => p - q);
      if (!cuts.length) return [];
      const out = [];
      let from = start;
      for (const c of cuts) {
        if (c - from > 0.5) out.push([from, c]);
        from = c + kerf;
      }
      if (start + length - from > 0.5) out.push([from, start + length]);
      return out;
    };
    const num = (x, y, text, rotate) =>
      `<text x="${x}" y="${y}" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="17" font-weight="600" fill="var(--fg)" class="dim-text"${rotate ? ` transform="rotate(-90 ${x} ${y})"` : ''}>${text}</text>`;
    let out = '<g pointer-events="none" stroke="var(--fg)" stroke-width="1" class="dims">';
    for (const [p, q] of segments('V', region.x, region.w, region.h)) {
      const x1 = p * scale;
      const x2 = q * scale;
      out += `<line x1="${x1}" y1="-9" x2="${x2}" y2="-9"/><line x1="${x1}" y1="-16" x2="${x1}" y2="-2"/><line x1="${x2}" y1="-16" x2="${x2}" y2="-2"/>`;
      if (x2 - x1 > 42) out += `<g stroke="none">${num((x1 + x2) / 2, -16, mm(q - p))}</g>`;
    }
    for (const [p, q] of segments('H', region.y, region.h, region.w)) {
      const y1 = p * scale;
      const y2 = q * scale;
      out += `<line x1="-9" y1="${y1}" x2="-9" y2="${y2}"/><line x1="-16" y1="${y1}" x2="-2" y2="${y1}"/><line x1="-16" y1="${y2}" x2="-2" y2="${y2}"/>`;
      if (y2 - y1 > 42) out += `<g stroke="none">${num(-16, (y1 + y2) / 2, mm(q - p), true)}</g>`;
    }
    return out + '</g>';
  }

  function drawSheet(sh, index, a) {
    const b = board(sh.boardId);
    const scale = SVG_W / sh.w;
    const H = sh.h * scale;
    const showCuts = $('showCuts').checked;
    const px = (v) => +(v * scale).toFixed(2);
    const stuck = new Set(a.plan.stuck);
    const hex = b ? b.hex : '#ddd';
    const ink = textColorFor(hex);
    const patId = 'grain-' + sh.id;
    const grainH = `<pattern id="${patId}-h" width="60" height="9" patternUnits="userSpaceOnUse"><path d="M0 3 Q15 1 30 4 T60 3" fill="none" stroke="rgba(70,40,10,.26)"/></pattern>`;
    const grainV = `<pattern id="${patId}-v" width="9" height="60" patternUnits="userSpaceOnUse"><path d="M3 0 Q1 15 4 30 T3 60" fill="none" stroke="rgba(70,40,10,.26)"/></pattern>`;

    let out = `<svg viewBox="${-SVG_M} ${-SVG_M} ${SVG_W + SVG_M} ${px(sh.h) + SVG_M}" data-sheet="${esc(sh.id)}" role="img" aria-label="Лист ${index + 1}, ${esc(b ? b.name : '')}"><defs>${grainH}${grainV}</defs>`;
    out += `<rect x="0" y="0" width="${SVG_W}" height="${px(sh.h)}" fill="#8f9aa5"/>`;
    if (b && b.hasGrain) out += `<rect x="0" y="0" width="${SVG_W}" height="${px(sh.h)}" fill="url(#${patId}-h)"/>`;

    out += dimensionLines(sh, a, scale);

    a.offcuts.forEach((o) => {
      const big = o.w * scale > 70 && o.h * scale > 26;
      out += `<g pointer-events="none"><rect x="${px(o.x)}" y="${px(o.y)}" width="${px(o.w)}" height="${px(o.h)}" fill="#dff3e6" fill-opacity=".92" stroke="#1d7a4a" stroke-dasharray="6 4"/>`;
      if (big) out += `<text x="${px(o.x + o.w / 2)}" y="${px(o.y + o.h / 2)}" text-anchor="middle" dominant-baseline="central" font-family="IBM Plex Mono,monospace" font-size="15" fill="#14613a">${mm(o.w)}×${mm(o.h)}</text>`;
      out += '</g>';
    });

    const GAP = 1; // Видима празнина, за да не се сливат кантовете на съседни детайли.
    sh.parts.forEach((p) => {
      const info = placementInfo(p);
      const x = px(p.x) + GAP;
      const y = px(p.y) + GAP;
      const w = Math.max(2, px(p.w) - 2 * GAP);
      const h = Math.max(2, px(p.h) - 2 * GAP);
      const isSel = p.id === selectedId;
      const hasBad = stuck.has(p.id) || a.collisions.some((c) => c.id === p.id || c.other === p.id);
      const pos = posOf(p.partId);
      out += `<g class="part" data-part="${esc(p.id)}" tabindex="0" role="button" aria-label="Позиция ${pos}, ${mm(p.w)} на ${mm(p.h)} мм">`;
      out += `<rect x="${px(p.x)}" y="${px(p.y)}" width="${px(p.w)}" height="${px(p.h)}" fill="transparent"/>`;
      out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${esc(hex)}"/>`;
      if (b && b.hasGrain) out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${patId}-h)"/>`;
      out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${hasBad ? '#d6281e' : isSel ? 'var(--select)' : '#1c2733'}" stroke-width="${hasBad || isSel ? 3.2 : 1.1}"/>`;
      let band = 0;
      if (info) {
        band = Math.max(3, Math.min(5, Math.min(w, h) * 0.07));
        const inset = 2.5;
        const corner = Math.min(9, Math.min(w, h) * 0.12);
        for (const side of SIDES) {
          const e = edge(info.part.edges[side]);
          if (!e) continue;
          const at = shownSide(side, p.rot);
          const r = {
            top: [x + corner, y + inset, w - 2 * corner, band],
            bottom: [x + corner, y + h - inset - band, w - 2 * corner, band],
            left: [x + inset, y + corner, band, h - 2 * corner],
            right: [x + w - inset - band, y + corner, band, h - 2 * corner],
          }[at];
          out += `<rect x="${r[0]}" y="${r[1]}" width="${Math.max(1, r[2])}" height="${Math.max(1, r[3])}" fill="${esc(e.hex)}" stroke="#222" stroke-width=".6"/>`;
        }
      }

      const name = info && info.part.label ? info.part.label : '';
      const marks = `${p.rot ? '↻' : ''}${p.pinned ? ' ⚷' : ''}`.trim();
      const halo = `paint-order="stroke" stroke="${ink === '#111' ? 'rgba(255,255,255,.8)' : 'rgba(0,0,0,.5)'}" stroke-width="2.5"`;
      const cx = x + w / 2;
      const cy = y + h / 2;
      const room = 2.5 + band + 3;
      const big = w >= 90 && h >= 58;
      out += `<g pointer-events="none" font-family="IBM Plex Mono,monospace" fill="${ink}" text-anchor="middle">`;
      if (big) {
        const fs = Math.max(13, Math.min(21, Math.min(w / 5.5, h / 3.2)));
        const lx = x + room + fs * 0.55;
        out += `<text x="${cx}" y="${y + room + fs * 0.55}" dominant-baseline="central" font-size="${fs}" font-weight="600" ${halo}>${mm(p.w)}</text>`;
        out += `<text x="${lx}" y="${cy}" dominant-baseline="central" font-size="${fs}" font-weight="600" ${halo} transform="rotate(-90 ${lx} ${cy})">${mm(p.h)}</text>`;
        const nameFs = Math.max(11, fs * 0.72);
        const maxChars = Math.floor((w - 2 * (room + fs * 1.1)) / (nameFs * 0.56));
        let text = name;
        if (text.length > maxChars) text = maxChars > 3 ? text.slice(0, maxChars - 1) + '…' : '';
        const line = [text, marks].filter(Boolean).join(' ');
        if (line) out += `<text x="${cx + fs * 0.4}" y="${cy + fs * 0.35}" dominant-baseline="central" font-size="${nameFs}" font-family="IBM Plex Sans,sans-serif" ${halo}>${esc(line)}</text>`;
      } else {
        const vertical = w < 62 && h > 74;
        const fits = vertical || (w > 50 && h > 14);
        if (fits) {
          const fs = Math.max(11, Math.min(15, vertical ? w / 2.6 : Math.min(w / 6.5, h / 1.7)));
          const tf = vertical ? ` transform="rotate(-90 ${cx} ${cy})"` : '';
          out += `<text x="${cx}" y="${cy}" dominant-baseline="central" font-size="${fs}" font-weight="600" ${halo}${tf}>${mm(p.w)}×${mm(p.h)}${marks ? ' ' + marks : ''}</text>`;
        }
      }
      out += '</g>';
      if (w > 30 && h > 22) {
        const bw = String(pos).length * 8 + 8;
        out += `<g pointer-events="none"><rect x="${x + w - bw - 2}" y="${y + h - 19}" width="${bw}" height="17" fill="#1c2733" rx="2"/><text x="${x + w - bw / 2 - 2}" y="${y + h - 10.5}" text-anchor="middle" dominant-baseline="central" font-family="IBM Plex Mono,monospace" font-size="12" fill="#fff">${pos}</text></g>`;
      }
      out += '</g>';
    });

    if (showCuts) {
      a.plan.cuts.forEach((c) => {
        const horizontal = c.axis === 'H';
        const x1 = horizontal ? px(c.from) : px(c.at);
        const y1 = horizontal ? px(c.at) : px(c.from);
        const x2 = horizontal ? px(c.to) : px(c.at);
        const y2 = horizontal ? px(c.at) : px(c.to);
        const lx = horizontal ? x1 + 13 : x1;
        const ly = horizontal ? y1 : y1 + 13;
        out += `<g pointer-events="none"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#c2255c" stroke-width="1.6" stroke-dasharray="9 4"/><circle cx="${lx}" cy="${ly}" r="10" fill="#c2255c"/><text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="central" font-family="IBM Plex Mono,monospace" font-size="${c.n > 99 ? 9.5 : 12}" font-weight="600" fill="#fff">${c.n}</text></g>`;
      });
    }
    if (sh.trim > 0) {
      out += `<rect x="${px(sh.trim)}" y="${px(sh.trim)}" width="${px(sh.w - 2 * sh.trim)}" height="${px(sh.h - 2 * sh.trim)}" fill="none" stroke="#222" stroke-dasharray="2 3" pointer-events="none"/>`;
    }
    return out + '</svg>';
  }

  /** Кантът по размер: страните с еднаква дължина и еднакъв кант са заедно. */
  function edgeGroups(part) {
    const groups = new Map();
    for (const s of ['top', 'bottom', 'left', 'right']) {
      const e = edge(part.edges[s]);
      if (!e) continue;
      const len = s === 'top' || s === 'bottom' ? part.w : part.h;
      const k = len + '|' + e.id;
      if (!groups.has(k)) groups.set(k, { len, e, n: 0 });
      groups.get(k).n++;
    }
    return [...groups.values()].sort((a, b) => b.len - a.len);
  }

  function edgeCell(part) {
    const list = edgeGroups(part);
    if (!list.length) return '<span class="no-edge">без кант</span>';
    return list
      .map((g) => `<span class="edge-item">по <b>${mm(g.len)}</b> × ${g.n} <span class="swatch" style="background:${esc(g.e.hex)}"></span> ${esc(g.e.name)}</span>`)
      .join('');
  }

  const edgeTextPlain = (part) => edgeGroups(part).map((g) => `по ${mm(g.len)} × ${g.n} ${g.e.name}`).join('; ');

  const edgeMetersOf = (part) => SIDES.reduce((m, s) => (edge(part.edges[s]) ? m + (s === 'top' || s === 'bottom' ? part.w : part.h) / 1000 : m), 0);

  /** Таблицата на листа: еднаквите детайли са на един ред с номера на позицията от чертежа. */
  function partsTableHtml(sh) {
    const groups = new Map();
    sh.parts.forEach((p) => {
      const k = p.partId + '|' + !!p.rot;
      if (!groups.has(k)) groups.set(k, { p, n: 0, ids: [] });
      const g = groups.get(k);
      g.n++;
      g.ids.push(p.id);
    });
    const rows = [...groups.values()]
      .sort((a, b) => posOf(a.p.partId) - posOf(b.p.partId))
      .map(({ p, n, ids }) => {
        const info = placementInfo(p);
        if (!info) return `<tr><td colspan="7">Детайлът е изтрит от списъка (${n} бр.)</td></tr>`;
        const part = info.part;
        return `<tr class="${ids.includes(selectedId) ? 'is-selected' : ''}">
          <td class="num"><b>${posOf(p.partId)}</b></td><td>${esc(part.label) || '–'}</td>
          <td class="num"><b>${n}</b></td>
          <td class="num"><b>${mm(p.w)} × ${mm(p.h)}</b></td>
          <td class="num">${mm(part.w)} × ${mm(part.h)}</td>
          <td>${p.rot ? 'завъртян ↻' : 'както е въведен'}</td>
          <td>${edgeCell(part)}</td></tr>`;
      })
      .join('');
    return `<details class="parts-detail" data-print open><summary>Детайли на листа (${sh.parts.length} бр.)</summary>
      <div class="table-scroll"><table class="data-table spec-table"><thead><tr><th class="num">Поз.</th><th>Име</th><th class="num">Брой</th><th class="num">Рязане (на листа)</th><th class="num">Краен размер</th><th>Положение</th><th>Кант</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
  }

  // ==========================================================================
  // ОБЩА СПЕЦИФИКАЦИЯ
  // ==========================================================================

  function specData() {
    const allowance = 1 + (state.settings.edgeAllowance || 0) / 100;
    const sheets = {};
    const remnants = {};
    for (const sh of state.layout ? state.layout.sheets : []) {
      if (!sh.parts.length) continue;
      if (sh.kind === 'full') sheets[sh.boardId] = (sheets[sh.boardId] || 0) + 1;
      else remnants[sh.boardId] = (remnants[sh.boardId] || 0) + 1;
    }
    const edgeM = {};
    for (const p of state.parts) {
      for (const s of SIDES) {
        const e = edge(p.edges[s]);
        if (e) edgeM[e.id] = (edgeM[e.id] || 0) + ((s === 'top' || s === 'bottom' ? p.w : p.h) * p.qty) / 1000;
      }
    }
    return { allowance, sheets, remnants, edgeM };
  }

  function renderSpec() {
    const { allowance, sheets, remnants, edgeM } = specData();
    const { kerf, trim } = state.settings;
    const boardsWithParts = state.boards.filter((b) => state.parts.some((p) => p.boardId === b.id));
    const today = new Date().toLocaleDateString('bg-BG');

    const tables = boardsWithParts
      .map((b) => {
        const rows = state.parts.filter((p) => p.boardId === b.id);
        const totalQty = rows.reduce((n, p) => n + p.qty, 0);
        const area = rows.reduce((n, p) => {
          const c = cutSize(p);
          return n + (c.w * c.h * p.qty) / 1e6;
        }, 0);
        const body = rows
          .map((p) => {
            const c = cutSize(p);
            return `<tr><td class="num"><b>${posOf(p.id)}</b></td><td>${esc(p.label) || '–'}</td>
              <td class="num"><b>${p.qty}</b></td>
              <td class="num">${mm(p.w)} × ${mm(p.h)}</td>
              <td class="num"><b>${mm(c.w)} × ${mm(c.h)}</b></td>
              <td>${p.allowRotate ? 'Завъртане' : 'Без завъртане'}</td>
              <td>${edgeCell(p)}</td>
              <td class="num">${fmt(edgeMetersOf(p) * p.qty)}</td></tr>`;
          })
          .join('');
        return `<h4 class="spec-board"><span class="swatch" style="background:${esc(b.hex)}"></span> ${esc(b.name)}, лист ${mm(b.w)} × ${mm(b.h)} мм${b.hasGrain ? ', с фладер по ширината на листа' : ''}</h4>
          <div class="table-scroll"><table class="data-table spec-table"><thead><tr><th class="num">Поз.</th><th>Име</th><th class="num">Брой</th><th class="num">Краен размер</th><th class="num">Размер за рязане</th><th>Завъртане</th><th>Кант</th><th class="num">Кант, м</th></tr></thead>
          <tbody>${body}<tr class="spec-sum"><td colspan="2">Общо за ${esc(b.name)}</td><td class="num">${totalQty}</td><td colspan="4" class="num">Площ на детайлите ${fmt(area)} m²</td><td class="num">${fmt(rows.reduce((n, p) => n + edgeMetersOf(p) * p.qty, 0))}</td></tr></tbody></table></div>`;
      })
      .join('');

    const summary = [
      ...boardsWithParts.map((b) => `<tr><td><span class="swatch" style="background:${esc(b.hex)}"></span> Плоскост ${esc(b.name)}</td><td class="num">${mm(b.w)} × ${mm(b.h)} мм</td><td class="num"><b>${sheets[b.id] || 0} ${sheets[b.id] === 1 ? 'лист' : 'листа'}</b>${remnants[b.id] ? ` + ${remnants[b.id]} остатъка` : ''}</td></tr>`),
      ...Object.keys(edgeM).map((id) => {
        const e = edge(id);
        return `<tr><td><span class="swatch" style="background:${esc(e.hex)}"></span> Кант ${esc(e.name)}</td><td class="num">${mm(e.thick)} мм</td><td class="num"><b>${fmt(edgeM[id])} м</b>, със запас ${fmt(edgeM[id] * allowance)} м</td></tr>`;
      }),
      ...extraTotals().glass.map(({ g, area }) => `<tr><td><span class="swatch" style="background:${esc(g.hex)}"></span> Стъкло ${esc(g.name)}</td><td class="num">${mm(g.thick)} мм</td><td class="num"><b>${fmt(area)} m²</b></td></tr>`),
      ...extraTotals().profile.map(({ p, meters }) => `<tr><td><span class="swatch" style="background:${esc(p.hex)}"></span> Профил ${esc(p.name)}</td><td class="num">–</td><td class="num"><b>${fmt(meters)} м</b></td></tr>`),
    ].join('');

    $('specBlock').innerHTML = `
      <div class="spec-head">
        <div><h3>Обща спецификация</h3><p class="spec-meta">${esc(state.name || 'Без име')} · ${today}</p></div>
        <div class="panel-tools no-print">
          <button class="btn" type="button" id="copySpec">Копирай за Excel</button>
          <button class="btn" type="button" id="printSpec" data-file-action${SANDBOXED ? ' hidden' : ''}>Печат само на спецификацията</button>
        </div>
      </div>
      <p class="spec-meta">Диск ${mm(kerf)} мм${trim ? `, обрез ${mm(trim)} мм от всеки край` : ''}. Крайният размер е с кант. Размерът за рязане е намален с дебелината на канта. „По 720 × 2“ значи две страни с дължина 720 мм.</p>
      ${tables}
      ${extrasSpecHtml()}
      <h4 class="spec-board">Общо материали</h4>
      <div class="table-scroll"><table class="data-table spec-table"><thead><tr><th>Материал</th><th class="num">Размер / дебелина</th><th class="num">Количество</th></tr></thead><tbody>${summary}</tbody></table></div>`;
  }

  /** Стъкла по площ и профили по дължина от прехвърлените модули. */
  function extraTotals() {
    const glass = new Map();
    const profile = new Map();
    for (const x of state.extraItems || []) {
      if (x.kind === 'glass') {
        const g = state.glasses.find((v) => v.id === x.glassId);
        if (g) glass.set(g.id, { g, area: ((glass.get(g.id) || {}).area || 0) + (x.w * x.h * x.qty) / 1e6 });
      } else {
        const p = state.profiles.find((v) => v.id === x.profileId);
        if (p) profile.set(p.id, { p, meters: ((profile.get(p.id) || {}).meters || 0) + (x.len * x.qty) / 1000 });
      }
    }
    return { glass: [...glass.values()], profile: [...profile.values()] };
  }

  function extrasSpecHtml() {
    const items = state.extraItems || [];
    const glass = items.filter((x) => x.kind === 'glass');
    const profile = items.filter((x) => x.kind === 'profile');
    let out = '';
    if (glass.length) {
      out += `<h4 class="spec-board">Стъкла за поръчка</h4><div class="table-scroll"><table class="data-table spec-table"><thead><tr><th>Име</th><th>Стъкло</th><th class="num">Брой</th><th class="num">Ширина × височина</th><th class="num">Площ, m²</th><th>Бележка</th></tr></thead><tbody>${glass
        .map((x) => {
          const g = state.glasses.find((v) => v.id === x.glassId);
          return `<tr><td>${esc(x.label)}</td><td>${esc(g ? g.name : '–')}</td><td class="num"><b>${x.qty}</b></td><td class="num"><b>${mm(x.w)} × ${mm(x.h)}</b></td><td class="num">${fmt((x.w * x.h * x.qty) / 1e6)}</td><td>${esc(x.note || '')}</td></tr>`;
        })
        .join('')}</tbody></table></div>`;
    }
    if (profile.length) {
      out += `<h4 class="spec-board">Профили за рязане</h4><div class="table-scroll"><table class="data-table spec-table"><thead><tr><th>Име</th><th>Профил</th><th class="num">Брой</th><th class="num">Дължина, мм</th><th class="num">Общо, м</th></tr></thead><tbody>${profile
        .map((x) => {
          const p = state.profiles.find((v) => v.id === x.profileId);
          return `<tr><td>${esc(x.label)}</td><td>${esc(p ? p.name : '–')}</td><td class="num"><b>${x.qty}</b></td><td class="num"><b>${mm(x.len)}</b></td><td class="num">${fmt((x.len * x.qty) / 1000)}</td></tr>`;
        })
        .join('')}</tbody></table></div><p class="spec-meta">Дължините са външни, с рез под 45° и без запас за фира.</p>`;
    }
    return out;
  }

  function specTsv() {
    const head = ['Поз.', 'Име', 'Плоскост', 'Брой', 'Крайна ширина', 'Крайна височина', 'Ширина за рязане', 'Височина за рязане', 'Завъртане', 'Кант', 'Кант, м'];
    const n = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
    const rows = state.parts.map((p) => {
      const c = cutSize(p);
      const b = board(p.boardId);
      return [posOf(p.id), p.label, b ? b.name : '', p.qty, n(p.w), n(p.h), n(c.w), n(c.h), p.allowRotate ? 'Завъртане' : 'Без завъртане', edgeTextPlain(p), n(edgeMetersOf(p) * p.qty)].join('\t');
    });
    const extra = (state.extraItems || []).map((x) => {
      if (x.kind === 'glass') return ['', x.label, (state.glasses.find((g) => g.id === x.glassId) || {}).name || 'Стъкло', x.qty, n(x.w), n(x.h), '', '', '', '', n(0)].join('\t');
      return ['', x.label, (state.profiles.find((p) => p.id === x.profileId) || {}).name || 'Профил', x.qty, n(x.len), '', '', '', '', '', n(0)].join('\t');
    });
    return [head.join('\t'), ...rows, ...extra].join('\n');
  }

  function renderSheets() {
    const layout = state.layout;
    const section = $('resultsSection');
    renderBadges();
    $('resultsEmpty').hidden = !!layout;
    section.hidden = !layout;
    if (!layout) return;
    const container = $('sheetsContainer');
    const openState = {};
    container.querySelectorAll('.parts-detail').forEach((d) => {
      const s = d.closest('[data-sheet-id]');
      if (s) openState[s.dataset.sheetId] = d.open;
    });

    let n = 0;
    container.innerHTML = layout.sheets
      .map((sh) => {
        const b = board(sh.boardId);
        const a = sheetAnalysis(sh);
        const hasCollision = a.collisions.length > 0;
        const tag = hasCollision
          ? '<span class="tag tag-bad">Застъпване</span>'
          : !a.plan.ok
          ? '<span class="tag tag-warn">Не може с проходни резове</span>'
          : '';
        const off = sh.parts.filter((p) => grainViolated(p)).length;
        const grainTag = off ? `<span class="tag tag-plain">${off} завъртени ръчно</span>` : '';
        const kind = sh.kind === 'remnant' ? '<span class="tag tag-plain">Остатък от склада</span>' : '';
        const allPinned = sh.parts.length > 0 && sh.parts.every((p) => p.pinned);
        n++;
        return `<article class="sheet${sh.parts.length ? '' : ' no-print'}" data-sheet-id="${esc(sh.id)}">
          <div class="sheet-head">
            <div class="sheet-title">Лист ${n}
              <span class="swatch" style="background:${esc(b ? b.hex : '#ccc')}"></span>${esc(b ? b.name : 'Изтрита плоскост')}
              <span style="font-weight:400;color:var(--muted)">${mm(sh.w)} × ${mm(sh.h)} мм</span> ${kind} ${tag} ${grainTag}
            </div>
            <div class="sheet-stats"><span class="fillbar" aria-hidden="true"><i style="width:${Math.min(100, a.fill * 100)}%"></i></span> Рандеман <b>${fmt(a.fill * 100, 1)}%</b> · Детайли <b>${sh.parts.length}</b> · Резове <b>${a.plan.cuts.length}</b>
              <button class="btn btn-quiet no-print" type="button" data-pin-sheet>${allPinned ? 'Отключи листа' : 'Заключи листа'}</button>
            </div>
          </div>
          <div class="sheet-body">
            <div class="sheet-svg-wrap">${drawSheet(sh, n - 1, a)}${selectedId && sh.parts.some((p) => p.id === selectedId) ? popoverHtml(sh, sh.parts.find((p) => p.id === selectedId)) : ''}</div>
          </div>
          ${sh.trim > 0 ? `<p class="hint">Първо обрежи по ${mm(sh.trim)} мм от всеки край.</p>` : ''}
          ${partsTableHtml(sh)}
        </article>`;
      })
      .join('');
    container.querySelectorAll('.parts-detail').forEach((d) => {
      const s = d.closest('[data-sheet-id]').dataset.sheetId;
      if (s in openState) d.open = openState[s];
    });

    renderRail();
    renderKpis();
    renderCosts();
    renderSpec();
    renderProblems();
    positionPopover();
    $('undo').disabled = undoStack.length === 0;
    $('redo').disabled = redoStack.length === 0;
    $('staleBanner').hidden = state.layoutSignature === layoutSignature();
  }

  /** Малки прегледи на всички листове за бърз преход. */
  function renderRail() {
    let n = 0;
    $('sheetRail').innerHTML = state.layout.sheets
      .map((sh) => {
        n++;
        const b = board(sh.boardId);
        const hex = b ? b.hex : '#ccc';
        const used = sh.parts.reduce((t, p) => t + p.w * p.h, 0) / (sh.w * sh.h);
        const rects = sh.parts.map((p) => `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${esc(hex)}" stroke="#2a3340" stroke-width="${sh.w / 180}"/>`).join('');
        return `<button class="rail-item" type="button" data-go="${esc(sh.id)}" title="Към лист ${n}"><svg viewBox="0 0 ${sh.w} ${sh.h}" aria-hidden="true"><rect width="${sh.w}" height="${sh.h}" fill="#aab3bd"/>${rects}</svg><span>Лист ${n}<b>${fmt(used * 100, 0)}%</b></span></button>`;
      })
      .join('');
  }

  function renderKpis() {
    const { kerf, minOffcut } = state.settings;
    let full = 0;
    let remnants = 0;
    let used = 0;
    let area = 0;
    let cuts = 0;
    let cutLen = 0;
    let keepArea = 0;
    let parts = 0;
    for (const sh of state.layout.sheets) {
      if (!sh.parts.length) continue;
      if (sh.kind === 'full') full++;
      else remnants++;
      const plan = E.cutPlan(sh, sh.parts, kerf);
      used += sh.parts.reduce((s, p) => s + p.w * p.h, 0);
      area += sh.w * sh.h;
      cuts += plan.cuts.length;
      cutLen += plan.cuts.reduce((s, c) => s + c.len, 0);
      parts += sh.parts.length;
      keepArea += plan.offcuts.filter((o) => o.w >= minOffcut && o.h >= minOffcut).reduce((s, o) => s + o.w * o.h, 0);
    }
    const proofs = Object.values(lastProof);
    // Доказателството важи за броя листове, дори след ръчна редакция, само ако той не е надхвърлил границата.
    const allMinimal = proofs.length > 0 && full <= proofs.reduce((sum, p) => sum + p.bound, 0);
    const fresh = state.layoutSignature === layoutSignature();
    $('kpis').innerHTML = [
      [full + (remnants ? ` + ${remnants} ост.` : ''), allMinimal && fresh ? '<span class="proved">Цели листа, доказан минимум</span>' : 'Цели листа'],
      [parts, 'Детайли'],
      [fmt(area ? (used / area) * 100 : 0, 1) + '%', 'Рандеман'],
      [fmt(keepArea / 1e6) + ' m²', `Остатъци над ${minOffcut} мм`],
      [cuts, 'Резове'],
      [fmt(cutLen / 1000, 1) + ' м', 'Дължина на рязане'],
    ]
      .map(([v, l]) => `<div class="kpi"><b>${esc(v)}</b><span>${l}</span></div>`)
      .join('');
  }

  function computeCosts() {
    const boardsUsed = {};
    for (const sh of state.layout.sheets) {
      if (sh.kind !== 'full' || !sh.parts.length) continue;
      boardsUsed[sh.boardId] = (boardsUsed[sh.boardId] || 0) + 1;
    }
    const edgeM = {};
    for (const sh of state.layout.sheets) {
      for (const pl of sh.parts) {
        const p = partById(pl.partId);
        if (!p) continue;
        for (const s of SIDES) {
          const e = edge(p.edges[s]);
          if (!e) continue;
          edgeM[e.id] = (edgeM[e.id] || 0) + (s === 'top' || s === 'bottom' ? p.w : p.h) / 1000;
        }
      }
    }
    return { boardsUsed, edgeM };
  }

  function renderCosts() {
    const { boardsUsed, edgeM } = computeCosts();
    const allowance = 1 + (state.settings.edgeAllowance || 0) / 100;
    let total = 0;
    const rows = [];
    for (const id of Object.keys(boardsUsed)) {
      const b = board(id);
      if (!b) continue;
      const cost = boardsUsed[id] * b.price;
      total += cost;
      rows.push(`<tr><td><span class="swatch" style="background:${esc(b.hex)}"></span> Плоскост ${esc(b.name)}</td><td class="num">${boardsUsed[id]} ${boardsUsed[id] === 1 ? 'лист' : 'листа'}</td><td class="num">${money(b.price)}</td><td class="num">${money(cost)}</td></tr>`);
    }
    for (const id of Object.keys(edgeM)) {
      const e = edge(id);
      const gross = edgeM[id] * allowance;
      const cost = gross * e.pricePerM;
      total += cost;
      rows.push(`<tr><td><span class="swatch" style="background:${esc(e.hex)}"></span> Кант ${esc(e.name)}</td><td class="num">${fmt(edgeM[id])} м + запас = ${fmt(gross)} м</td><td class="num">${money(e.pricePerM)}/м</td><td class="num">${money(cost)}</td></tr>`);
    }
    const totals = extraTotals();
    for (const { g, area } of totals.glass) {
      const cost = area * g.price;
      total += cost;
      rows.push(`<tr><td><span class="swatch" style="background:${esc(g.hex)}"></span> Стъкло ${esc(g.name)}</td><td class="num">${fmt(area)} m²</td><td class="num">${money(g.price)}/m²</td><td class="num">${money(cost)}</td></tr>`);
    }
    for (const { p, meters } of totals.profile) {
      const cost = meters * p.price;
      total += cost;
      rows.push(`<tr><td><span class="swatch" style="background:${esc(p.hex)}"></span> Профил ${esc(p.name)}</td><td class="num">${fmt(meters)} м</td><td class="num">${money(p.price)}/м</td><td class="num">${money(cost)}</td></tr>`);
    }
    $('costBlock').innerHTML = `<p class="print-only">${[...$('kpis').querySelectorAll('.kpi')].map((k) => `${esc(k.querySelector('span').textContent)}: <b>${esc(k.querySelector('b').textContent)}</b>`).join(' · ')}</p><h3>Материали</h3><div class="table-scroll"><table class="data-table"><thead><tr><th>Материал</th><th class="num">Количество</th><th class="num">Цена</th><th class="num">Сума</th></tr></thead>
      <tbody>${rows.join('')}<tr class="cost-total"><td colspan="3">Общо за материали</td><td class="num">${money(total)}</td></tr></tbody></table></div>
      ${state.layout.sheets.some((s) => s.kind === 'remnant') ? '<p class="hint" style="margin-top:6px">Остатъците от склада не се таксуват.</p>' : ''}`;
  }

  function renderProblems() {
    const box = $('problems');
    const msgs = [];
    const expected = new Map(state.parts.map((p) => [p.id, p.qty]));
    const placed = new Map();
    for (const sh of state.layout.sheets) for (const pl of sh.parts) placed.set(pl.partId, (placed.get(pl.partId) || 0) + 1);
    if (state.layoutSignature === layoutSignature()) {
      const names = [];
      for (const [id, qty] of expected) {
        const short = qty - (placed.get(id) || 0);
        if (short <= 0 || !board(partById(id).boardId)) continue;
        const p = partById(id);
        names.push(`${p.label || 'без име'} ${mm(p.w)}×${mm(p.h)}, ${short} бр`);
      }
      if (names.length) msgs.push(['bad', `Не са подредени, защото не влизат в плоскостта при тази посока и обрез: ${names.map(esc).join('; ')}.`]);
    }
    const grainConflict = [];
    state.parts.forEach((p) => {
      if (!board(p.boardId)) grainConflict.push(p.label || `${mm(p.w)}×${mm(p.h)}`);
    });
    if (grainConflict.length) msgs.push(['bad', `Без плоскост: ${grainConflict.map(esc).join(', ')}.`]);
    let nonG = 0;
    let coll = 0;
    for (const sh of state.layout.sheets) {
      const a = sheetAnalysis(sh);
      if (a.collisions.length) coll++;
      else if (!a.plan.ok) nonG++;
    }
    if (coll) msgs.push(['bad', `${coll} листа имат застъпени детайли или детайли извън полезната площ.`]);
    if (nonG) msgs.push(['warn', `${nonG} листа не могат да се изрежат с проходни резове на форматен циркуляр. На CNC са изпълними.`]);
    box.innerHTML = msgs.map(([t, m]) => `<div class="banner banner-${t}">${m}</div>`).join('');
  }

  function findPlacement(id) {
    if (!state.layout) return null;
    for (const sh of state.layout.sheets) {
      const p = sh.parts.find((x) => x.id === id);
      if (p) return { sheet: sh, placement: p };
    }
    return null;
  }

  function popoverHtml(sheet, p) {
    const info = placementInfo(p);
    const sheets = state.layout.sheets.map((s, i) => ({ s, i })).filter(({ s }) => s.boardId === sheet.boardId);
    const off = grainViolated(p);
    return `<div class="part-pop no-print" id="partPop" role="group" aria-label="Действия с детайла">
      <div class="pop-row">
        <b>${mm(p.w)}×${mm(p.h)}</b><span class="pop-name">${info && info.part.label ? esc(info.part.label) : ''}</span>
        <button class="pop-close" type="button" id="popClose" aria-label="Затвори">×</button>
      </div>
      <div class="pop-row">
        <button class="btn btn-primary" type="button" id="inspRotate" title="Клавиш R или двоен клик върху детайла">↻ Завърти</button>
        <button class="btn ${p.pinned ? 'on' : ''}" type="button" id="inspPin" title="Клавиш L. Заключен детайл не се мести при ново генериране.">${p.pinned ? 'Заключен' : 'Заключи'}</button>
        <label>Лист <select id="inspSheet">${sheets.map(({ s, i }) => `<option value="${esc(s.id)}"${s.id === sheet.id ? ' selected' : ''}>${i + 1}</option>`).join('')}<option value="new">Нов</option></select></label>
      </div>
      <div class="pop-row">
        <label>X <input id="inspX" type="number" step="0.5" value="${p.x}"></label>
        <label>Y <input id="inspY" type="number" step="0.5" value="${p.y}"></label>
      </div>
      ${off ? `<p class="pop-warn">${esc(off)}</p>` : ''}
    </div>`;
  }

  /** Поставя панела до избрания детайл, без да излиза извън листа. */
  function positionPopover() {
    const pop = $('partPop');
    const found = selectedId && findPlacement(selectedId);
    if (!pop || !found) return;
    const wrap = pop.parentElement;
    const W = wrap.clientWidth;
    const svgH = wrap.querySelector('svg').clientHeight;
    const unit = W / (SVG_W + SVG_M);
    const k = unit * (SVG_W / found.sheet.w);
    const ox = SVG_M * unit;
    const p = found.placement;
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    const left = Math.max(0, Math.min(W - pw, ox + (p.x + p.w / 2) * k - pw / 2));
    let top = ox + (p.y + p.h) * k + 6;
    if (top + ph > svgH) top = ox + p.y * k - ph - 6;
    if (top < 0) top = Math.max(0, Math.min(svgH - ph, ox + (p.y + p.h / 2) * k - ph / 2));
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  /** Детайл „Без завъртане“, който е обърнат ръчно. */
  function grainViolated(pl) {
    const p = partById(pl.partId);
    return p && pl.rot && !p.allowRotate ? 'Завъртян ръчно, макар редът да е „Без завъртане“.' : '';
  }

  function showView(v) {
    currentView = v;
    document.querySelectorAll('.view').forEach((n) => n.classList.toggle('active', n.id === 'view-' + v));
    document.querySelectorAll('.step').forEach((n) => {
      const on = n.dataset.view === v;
      n.classList.toggle('active', on);
      if (on) n.setAttribute('aria-current', 'step');
      else n.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
  }

  function renderBadges() {
    const count = state.parts.reduce((n, p) => n + p.qty, 0);
    $('partsBadge').textContent = count ? String(count) : '';
    const modCount = (state.modules || []).reduce((n, m) => n + (m.count || 1), 0);
    $('modulesBadge').textContent = modCount ? String(modCount) : '';
    renderProjects();
    $('sheetsBadge').textContent = state.layout ? String(state.layout.sheets.filter((x) => x.parts.length).length) + ' л.' : '';
    const boards = new Set(state.parts.map((p) => p.boardId)).size;
    $('runSummary').textContent = count ? `${count} детайла от ${boards} вида плоскост.` : 'Списъкът е празен.';
  }

  function renderAll() {
    renderMasters();
    renderParts();
    renderSheets();
    renderBadges();
    renderModules();
    syncSettingsToForm();
    $('projectName').value = state.name || '';
    renderProjects();
  }

  const render = renderSheets;

  // ==========================================================================
  // РЪЧНА РЕДАКЦИЯ
  // ==========================================================================

  /** Проверява нова позиция: само допустими граници и без застъпване + диск. */
  function blockedBy(sheet, moving, x, y, w, h) {
    const { kerf } = state.settings;
    const r = E.usableRegion(sheet);
    const e = 1e-6;
    if (x < r.x - e || y < r.y - e || x + w > r.x + r.w + e || y + h > r.y + r.h + e) return 'Детайлът излиза извън полезната площ на листа.';
    for (const o of sheet.parts) {
      if (o === moving) continue;
      const overlapX = x < o.x + o.w + kerf - e && o.x < x + w + kerf - e;
      const overlapY = y < o.y + o.h + kerf - e && o.y < y + h + kerf - e;
      if (overlapX && overlapY) return kerf ? `Няма място за детайла и за ${mm(kerf)} мм рез.` : 'Детайлът се застъпва с друг.';
    }
    return null;
  }

  /** Подравнява към ръбовете на листа и на съседите с отчитане на диска. */
  function snapPosition(sheet, moving, x, y, w, h, tolerance) {
    if (!$('snapOn').checked) return { x: Math.round(x), y: Math.round(y) };
    const { kerf } = state.settings;
    const r = E.usableRegion(sheet);
    const xs = [r.x, r.x + r.w - w];
    const ys = [r.y, r.y + r.h - h];
    for (const o of sheet.parts) {
      if (o === moving) continue;
      xs.push(o.x, o.x + o.w - w, o.x + o.w + kerf, o.x - w - kerf);
      ys.push(o.y, o.y + o.h - h, o.y + o.h + kerf, o.y - h - kerf);
    }
    const closest = (v, list) => {
      let best = v;
      let d = tolerance;
      for (const c of list) {
        const n = Math.abs(c - v);
        if (n < d) {
          d = n;
          best = c;
        }
      }
      return best === v ? Math.round(v) : best;
    };
    return { x: closest(x, xs), y: closest(y, ys) };
  }

  /** Търси най-близкото свободно място с обход на кандидат-ъглите. */
  function nearestFree(sheet, moving, x, y, w, h) {
    const { kerf } = state.settings;
    const r = E.usableRegion(sheet);
    const xs = new Set([r.x, r.x + r.w - w, x]);
    const ys = new Set([r.y, r.y + r.h - h, y]);
    for (const o of sheet.parts) {
      if (o === moving) continue;
      xs.add(o.x);
      xs.add(o.x + o.w + kerf);
      xs.add(o.x - w - kerf);
      ys.add(o.y);
      ys.add(o.y + o.h + kerf);
      ys.add(o.y - h - kerf);
    }
    let best = null;
    let bestD = Infinity;
    for (const cx of xs) {
      for (const cy of ys) {
        if (blockedBy(sheet, moving, cx, cy, w, h)) continue;
        const d = (cx - x) ** 2 + (cy - y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x: cx, y: cy };
        }
      }
    }
    return best;
  }

  function commitLayoutChange() {
    state.layout.sheets = state.layout.sheets.filter((s) => s.parts.length > 0 || s.userEmpty);
    save();
    render();
  }

  function movePlacement(id, toSheetId, x, y) {
    const found = findPlacement(id);
    if (!found) return false;
    const target = state.layout.sheets.find((s) => s.id === toSheetId);
    if (!target) return false;
    const { placement: p, sheet: from } = found;
    const moving = from === target ? p : null;
    const why = blockedBy(target, moving, x, y, p.w, p.h);
    if (why) {
      toast(why);
      return false;
    }
    pushUndo();
    const again = findPlacement(id);
    if (from !== target) {
      from.parts = from.parts.filter((q) => q !== again.placement);
      target.parts.push(again.placement);
    }
    again.placement.x = x;
    again.placement.y = y;
    target.userEmpty = false;
    commitLayoutChange();
    return true;
  }

  function rotateSelected() {
    const id = selectedId;
    const found = findPlacement(id);
    if (!found) return;
    const { sheet, placement: p } = found;
    // Завърта около центъра и търси най-близкото свободно място.
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const pos = nearestFree(sheet, p, Math.round(cx - p.h / 2), Math.round(cy - p.w / 2), p.h, p.w);
    if (!pos) {
      const region = E.usableRegion(sheet);
      const b = board(sheet.boardId);
      const fitsNew = b && p.h <= b.w - 2 * state.settings.trim && p.w <= b.h - 2 * state.settings.trim;
      if (fitsNew && region) {
        return toast('Завъртяният детайл няма място на този лист.', { label: 'Завърти на нов лист', fn: () => rotateToNewSheet(id) });
      }
      return toast('Завъртяният детайл не влиза в тази плоскост.');
    }
    pushUndo();
    const again = findPlacement(id).placement;
    [again.w, again.h] = [again.h, again.w];
    again.rot = !again.rot;
    again.x = pos.x;
    again.y = pos.y;
    commitLayoutChange();
  }

  function rotateToNewSheet(id) {
    const found = findPlacement(id);
    if (!found) return;
    pushUndo();
    const again = findPlacement(id);
    const target = newSheetFor(again.sheet.boardId);
    const r = E.usableRegion(target);
    const p = again.placement;
    again.sheet.parts = again.sheet.parts.filter((q) => q !== p);
    [p.w, p.h] = [p.h, p.w];
    p.rot = !p.rot;
    p.x = r.x;
    p.y = r.y;
    target.parts.push(p);
    target.userEmpty = false;
    commitLayoutChange();
  }

  function togglePin() {
    const found = findPlacement(selectedId);
    if (!found) return;
    pushUndo();
    const p = findPlacement(selectedId).placement;
    p.pinned = !p.pinned;
    commitLayoutChange();
  }

  function newSheetFor(boardId) {
    const b = board(boardId);
    const sh = { id: uid('s'), boardId, w: b.w, h: b.h, trim: state.settings.trim, kind: 'full', parts: [], userEmpty: true };
    state.layout.sheets.push(sh);
    return sh;
  }

  function moveToSheet(id, sheetId) {
    const found = findPlacement(id);
    if (!found) return;
    const before = snapshot();
    let target = sheetId === 'new' ? newSheetFor(found.sheet.boardId) : state.layout.sheets.find((s) => s.id === sheetId);
    if (!target || target === found.sheet) return;
    const p = found.placement;
    const pos = nearestFree(target, null, E.usableRegion(target).x, E.usableRegion(target).y, p.w, p.h);
    if (!pos) {
      toast('На този лист няма място за детайла.');
      if (sheetId === 'new') state.layout.sheets.pop();
      render();
      return;
    }
    if (movePlacement(id, target.id, pos.x, pos.y)) {
      // Историята трябва да пази състоянието отпреди създаването на новия лист.
      undoStack[undoStack.length - 1] = before;
      render();
    }
  }

  // Влачене. Позицията се записва при пускане, така че „Назад“ връща цялото движение.
  let drag = null;
  let lastClick = { id: null, t: 0 };

  function svgPoint(svg, e) {
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(m.inverse());
  }

  function sheetUnderPointer(e, boardId) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const svg = el && el.closest ? el.closest('svg[data-sheet]') : null;
    if (!svg) return null;
    const sh = state.layout.sheets.find((s) => s.id === svg.dataset.sheet);
    return sh && sh.boardId === boardId ? { sh, svg } : null;
  }

  function onPointerDown(e) {
    const g = e.target.closest && e.target.closest('.part');
    if (!g && e.target.closest && e.target.closest('svg[data-sheet]') && selectedId) {
      selectedId = null;
      render();
      return;
    }
    if (!g || e.button !== 0) return;
    const id = g.dataset.part;
    const found = findPlacement(id);
    if (!found) return;
    e.preventDefault();
    selectPart(id);
    const newG = document.querySelector(`.part[data-part="${CSS.escape(id)}"]`);
    if (!newG) return;
    const svg = newG.ownerSVGElement;
    const scale = SVG_W / found.sheet.w;
    const pt = svgPoint(svg, e);
    drag = {
      id, g: newG, svg, sheet: found.sheet, placement: found.placement, scale,
      grabX: pt.x / scale - found.placement.x, grabY: pt.y / scale - found.placement.y,
      startX: e.clientX, startY: e.clientY, moved: false, x: found.placement.x, y: found.placement.y, target: found.sheet, valid: true,
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
    window.addEventListener('pointercancel', cancelDrag, { once: true });
  }

  function onPointerMove(e) {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 4) return;
    drag.moved = true;
    drag.g.classList.add('dragging');
    drag.g.style.pointerEvents = 'none';
    const hit = sheetUnderPointer(e, drag.sheet.boardId);
    document.querySelectorAll('.sheet.drop-target').forEach((n) => n.classList.remove('drop-target'));
    const targetSheet = hit ? hit.sh : drag.target;
    const targetSvg = hit ? hit.svg : drag.svg;
    if (hit && hit.sh !== drag.sheet) targetSvg.closest('.sheet').classList.add('drop-target');
    drag.target = targetSheet;

    const scale = SVG_W / targetSheet.w;
    const pt = svgPoint(targetSvg, e);
    const p = drag.placement;
    const moving = targetSheet === drag.sheet ? p : null;
    const raw = { x: pt.x / scale - drag.grabX, y: pt.y / scale - drag.grabY };
    const snapped = snapPosition(targetSheet, moving, raw.x, raw.y, p.w, p.h, 12 / scale);
    drag.x = snapped.x;
    drag.y = snapped.y;
    drag.valid = !blockedBy(targetSheet, moving, snapped.x, snapped.y, p.w, p.h);

    // Предварителният вид се движи върху собствения лист, когато е на него.
    if (targetSheet === drag.sheet) {
      const s0 = SVG_W / drag.sheet.w;
      drag.g.setAttribute('transform', `translate(${(drag.x - p.x) * s0} ${(drag.y - p.y) * s0})`);
      drag.g.style.opacity = drag.valid ? '.85' : '.45';
    } else {
      drag.g.style.opacity = '.3';
    }
    const pop = $('partPop');
    if (pop) pop.hidden = true;
  }

  function onPointerUp(e) {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointercancel', cancelDrag);
    const d = drag;
    drag = null;
    document.querySelectorAll('.sheet.drop-target').forEach((n) => n.classList.remove('drop-target'));
    if (!d) return;
    d.g.style.pointerEvents = '';
    if (!d.moved) {
      const now = Date.now();
      if (lastClick.id === d.id && now - lastClick.t < 380) {
        lastClick = { id: null, t: 0 };
        rotateSelected();
      } else {
        lastClick = { id: d.id, t: now };
      }
      return;
    }
    if (d.valid) {
      if (!movePlacement(d.id, d.target.id, d.x, d.y)) render();
      return;
    }
    // Невалидно място: опитваме най-близкото свободно, иначе детайлът се връща.
    const moving = d.target === d.sheet ? d.placement : null;
    const near = nearestFree(d.target, moving, d.x, d.y, d.placement.w, d.placement.h);
    const dist = near ? Math.hypot(near.x - d.x, near.y - d.y) : Infinity;
    if (near && dist < Math.max(d.placement.w, d.placement.h)) {
      movePlacement(d.id, d.target.id, near.x, near.y);
    } else {
      toast('Там няма място. Детайлът остава на мястото си.');
      render();
    }
  }

  function cancelDrag() {
    window.removeEventListener('pointermove', onPointerMove);
    drag = null;
    render();
  }

  function selectPart(id) {
    selectedId = id;
    render();
  }

  // ==========================================================================
  // ДЕЙСТВИЯ ВЪРХУ СПИСЪКА
  // ==========================================================================

  function readSettings() {
    const s = state.settings;
    s.kerf = Math.max(0, +$('kerf').value || 0);
    s.trim = Math.max(0, +$('trim').value || 0);
    s.minOffcut = Math.max(0, +$('minOffcut').value || 0);
    s.edgeAllowance = Math.max(0, +$('edgeAllowance').value || 0);
    s.priority = $('priority').value;
    s.searchTime = +$('searchTime').value || 4000;
  }

  function syncSettingsToForm() {
    const s = state.settings;
    $('kerf').value = s.kerf;
    $('trim').value = s.trim;
    $('minOffcut').value = s.minOffcut;
    $('edgeAllowance').value = s.edgeAllowance;
    $('priority').value = s.priority;
    $('searchTime').value = String(s.searchTime);
  }

  function collectForm() {
    const w = +$('partWidth').value;
    const h = +$('partHeight').value;
    const qty = Math.max(1, Math.floor(+$('partCount').value) || 1);
    const boardId = $('partBoardSelect').value;
    if (!(w > 0 && h > 0)) return toast('Въведи положителни размери.');
    if (!board(boardId)) return toast('Първо добави плоскост.');
    const edges = { ...formEdges };
    const thickW = (edge(edges.left)?.thick || 0) + (edge(edges.right)?.thick || 0);
    const thickH = (edge(edges.top)?.thick || 0) + (edge(edges.bottom)?.thick || 0);
    if (w - thickW <= 0 || h - thickH <= 0) return toast('Детайлът е по-малък от дебелината на канта.');
    return { label: $('partLabel').value.trim(), w, h, qty, boardId, edges, ...readOrient() };
  }

  function resetEditMode() {
    editingPartId = null;
    $('addPart').textContent = 'Добави детайл';
    $('cancelEdit').hidden = true;
  }

  function onSubmitPart(e) {
    e.preventDefault();
    const data = collectForm();
    if (!data) return;
    pushUndo();
    if (editingPartId) {
      Object.assign(partById(editingPartId), data);
      resetEditMode();
    } else {
      state.parts.push({ id: uid('p'), ...data });
    }
    $('partLabel').value = '';
    afterPartsChanged();
    $('partLabel').focus();
  }

  function afterPartsChanged() {
    save();
    renderParts();
    renderSheets();
    updateUndoButtons();
  }

  function updateUndoButtons() {
    $('undo').disabled = undoStack.length === 0;
    $('redo').disabled = redoStack.length === 0;
  }

  function startEdit(id) {
    const p = partById(id);
    if (!p) return;
    editingPartId = id;
    $('partLabel').value = p.label || '';
    $('partWidth').value = p.w;
    $('partHeight').value = p.h;
    $('partCount').value = p.qty;
    $('partBoardSelect').value = p.boardId;
    $('partOrient').value = p.allowRotate ? 'free' : 'lock';
    formEdges = { ...p.edges };
    renderEdgeButtons();
    $('addPart').textContent = 'Запази промените';
    $('cancelEdit').hidden = false;
    updatePreview();
    renderParts();
    $('partForm').scrollIntoView({ block: 'nearest' });
  }

  function onPartsTableInput(e) {
    const el = e.target;
    const f = el.dataset.f;
    const tr = el.closest('tr[data-id]');
    if (!f || !tr) return;
    const p = partById(tr.dataset.id);
    if (!p) return;
    if (f === 'allowRotate') p.allowRotate = el.value === '1';
    else if (f === 'label' || f === 'boardId') p[f] = el.value;
    else {
      const v = +el.value;
      if (!(v > 0)) {
        toast('Въведи положително число.');
        renderParts();
        return;
      }
      p[f] = f === 'qty' ? Math.max(1, Math.floor(v)) : v;
    }
    if (f === 'boardId') renderParts();
    save();
    renderSheets();
  }

  function parsePaste(text) {
    const rows = [];
    const bad = [];
    text.split(/\r?\n/).forEach((line, idx) => {
      if (!line.trim()) return;
      const cols = line.split(line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',').map((c) => c.trim());
      const nums = cols.map((c) => parseFloat(c.replace(',', '.')));
      let label = '';
      let w;
      let h;
      let qty;
      if (!Number.isFinite(nums[0]) && cols.length >= 3) {
        label = cols[0];
        w = nums[1];
        h = nums[2];
        qty = nums[3];
      } else {
        w = nums[0];
        h = nums[1];
        qty = nums[2];
        label = cols[3] || '';
      }
      if (!(w > 0 && h > 0)) {
        if (idx > 0 || rows.length) bad.push(idx + 1);
        return;
      }
      rows.push({ label, w, h, qty: Math.max(1, Math.floor(qty) || 1) });
    });
    return { rows, bad };
  }

  function loadSample() {
    const d = defaults();
    for (const b of d.boards) if (!board(b.id)) state.boards.push(b);
    for (const e of d.edges) if (!edge(e.id)) state.edges.push(e);
    newProject('Пример: кухненски шкафове');
    const row = (label, w, h, qty, boardId, edges) => ({ id: uid('p'), label, w, h, qty, boardId, edges, allowRotate: boardId === 'b2' });
    const front = { top: 'e1' };
    const both = { top: 'e1', bottom: 'e1' };
    const all = { top: 'e1', bottom: 'e1', left: 'e1', right: 'e1' };
    state.parts = [
      row('Страница долен', 560, 720, 8, 'b1', { left: 'e1' }),
      row('Страница горен', 300, 720, 6, 'b1', { left: 'e1' }),
      row('Дъно долен 800', 800, 560, 3, 'b1', front),
      row('Дъно долен 600', 600, 560, 3, 'b1', front),
      row('Рафт 800', 764, 500, 4, 'b1', both),
      row('Рафт горен', 764, 280, 6, 'b1', both),
      row('Лицева шина', 800, 100, 10, 'b1', {}),
      row('Врата 400', 396, 716, 6, 'b2', all),
      row('Врата 600', 596, 716, 4, 'b2', all),
      row('Чело чекмедже', 596, 140, 9, 'b2', all),
      row('Страница чекмедже', 500, 120, 12, 'b2', { top: 'e2' }),
    ];
    save();
    renderAll();
    showView('parts');
  }

  // ==========================================================================
  // ФАЙЛОВЕ И ИЗНОС
  // ==========================================================================

  function downloadText(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function copyText(text, okMessage) {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMessage);
    } catch (_) {
      $('pastePanel').hidden = false;
      $('pasteText').value = text;
      $('pasteText').select();
      toast('Копирането е блокирано. Текстът е избран, натисни Ctrl+C.');
    }
  }

  const projectFileName = () => (state.name || 'razkroy').replace(/[^\p{L}\p{N}_-]+/gu, '_') + '.json';

  function csvText() {
    const head = 'Име;Ширина;Височина;Брой;Плоскост;Кант';
    const rows = state.parts.map((p) => {
      const b = board(p.boardId);
      return [p.label, p.w, p.h, p.qty, b ? b.name : '', edgeTextPlain(p)].join(';');
    });
    return [head, ...rows].join('\n');
  }

  // ==========================================================================
  // ОСТАТЪЦИ В СКЛАДА
  // ==========================================================================

  function saveOffcutsToStock() {
    if (!state.layout) return;
    pushUndo();
    let added = 0;
    const { minOffcut } = state.settings;
    // Изразходените от склада парчета излизат от него.
    for (const sh of state.layout.sheets) {
      if (sh.kind !== 'remnant' || !sh.sourceId) continue;
      const s = state.stock.find((x) => x.id === sh.sourceId);
      if (s) s.qty -= 1;
    }
    state.stock = state.stock.filter((s) => s.qty > 0);
    for (const sh of state.layout.sheets) {
      const plan = E.cutPlan(sh, sh.parts, state.settings.kerf);
      for (const o of plan.offcuts) {
        if (o.w >= minOffcut && o.h >= minOffcut) {
          state.stock.push({ id: uid('st'), boardId: sh.boardId, w: Math.floor(o.w), h: Math.floor(o.h), qty: 1 });
          added++;
        }
      }
    }
    save();
    renderMasters();
    // Обединява еднаквите размери.
    const merged = new Map();
    for (const s of state.stock) {
      const k = [s.boardId, s.w, s.h].join('|');
      if (merged.has(k)) merged.get(k).qty += s.qty;
      else merged.set(k, s);
    }
    state.stock = [...merged.values()];
    save();
    renderMasters();
    toast(`Прибрани ${added} остатъка. „Назад“ отменя.`);
  }

  // ==========================================================================
  // СЪБИТИЯ
  // ==========================================================================

  let toastTimer = null;
  function toast(msg, undoable) {
    const t = $('toast');
    t.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = msg;
    t.appendChild(span);
    if (undoable) {
      const b = document.createElement('button');
      b.className = 'link-btn';
      b.textContent = undoable === true ? 'Назад' : undoable.label;
      b.onclick = () => {
        if (undoable === true) undo();
        else undoable.fn();
        t.hidden = true;
      };
      t.appendChild(b);
    }
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), undoable ? 7000 : 3500);
  }

  function bindMasterTable(tableId, list, onDelete, numeric) {
    const tbody = $(tableId).querySelector('tbody');
    tbody.addEventListener('change', (e) => {
      const el = e.target;
      const f = el.dataset.f;
      const tr = el.closest('tr[data-id]');
      if (!f || !tr) return;
      const item = list().find((x) => x.id === tr.dataset.id);
      if (!item) return;
      if (numeric.includes(f)) {
        const v = +el.value;
        const min = f === 'price' || f === 'pricePerM' || f === 'thick' || f === 'deduct' ? 0 : 1;
        if (!(v >= min)) {
          toast('Въведи валидно число.');
          el.value = item[f];
          return;
        }
        item[f] = v;
      } else if (f === 'hasGrain') item[f] = el.value === '1';
      else item[f] = el.value;
      save();
      renderMasters();
      renderParts();
      if (state.layout) renderSheets();
    });
    tbody.addEventListener('click', (e) => {
      if (!e.target.closest('[data-del]')) return;
      onDelete(e.target.closest('tr[data-id]').dataset.id);
    });
  }

  const THEME_KEY = 'cutting.theme';

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('[data-theme-set]').forEach((b) => {
      const on = b.dataset.themeSet === theme;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function initTheme() {
    let saved = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch (_) {
      /* Без хранилище темата важи само за сесията. */
    }
    applyTheme(saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    document.querySelectorAll('[data-theme-set]').forEach((b) => {
      b.onclick = () => {
        applyTheme(b.dataset.themeSet);
        try {
          localStorage.setItem(THEME_KEY, b.dataset.themeSet);
        } catch (_) {
          /* Изборът просто няма да се запомни. */
        }
      };
    });
  }

  // ==========================================================================
  // МОДУЛИ
  // ==========================================================================

  let modPreset = 'cabinet';
  let editingModule = null;
  let expandedModule = null;

  /** Първото влизане добавя материали за гръб и плот, после те са изцяло на потребителя. */
  function seedModuleMaterials() {
    if (library.modulesSeeded) return;
    library.modulesSeeded = true;
    if (!state.boards.some((b) => (b.thick || 18) <= 6)) {
      state.boards.push({ id: 'hdf3', name: 'ХДФ 3 мм БЯЛ', hex: '#f1efe9', w: 2800, h: 2070, hasGrain: false, price: 12, thick: 3 });
    }
    if (!state.boards.some((b) => (b.thick || 18) >= 28)) {
      state.boards.push({ id: 'wt38', name: 'ПЛОТ 38 мм', hex: '#b9a68c', w: 4100, h: 600, hasGrain: true, price: 95, thick: 38 });
    }
  }

  /** Настройките на проекта, допълнени с разумни материали, ако още не са избрани. */
  function moduleSettings() {
    const base = { ...M.DEFAULT_SETTINGS, ...state.modSettings };
    base.boards = { ...M.DEFAULT_SETTINGS.boards, ...(state.modSettings.boards || {}) };
    base.edges = { ...M.DEFAULT_SETTINGS.edges, ...(state.modSettings.edges || {}) };
    const thickOf = (b) => (b.thick == null ? 18 : b.thick);
    const regular = state.boards.filter((b) => thickOf(b) > 6 && thickOf(b) < 28);
    const choose = (id, list, fallback) => (board(id) ? id : (list[0] || fallback || state.boards[0] || {}).id || '');
    base.boards.carcass = choose(base.boards.carcass, regular);
    const faceDefault = regular.find((b) => b.id !== base.boards.carcass) || regular[0];
    base.boards.face = choose(base.boards.face, faceDefault ? [faceDefault] : []);
    base.boards.back = choose(base.boards.back, state.boards.filter((b) => thickOf(b) <= 6));
    base.boards.worktop = choose(base.boards.worktop, state.boards.filter((b) => thickOf(b) >= 28));
    base.boards.wallPanel = choose(base.boards.wallPanel, [board(base.boards.face)].filter(Boolean));
    base.boards.plinth = choose(base.boards.plinth, [board(base.boards.carcass)].filter(Boolean));
    const edgeChoice = (id, i) => (id === '__none' ? '' : edge(id) ? id : (state.edges[i] || state.edges[0] || {}).id || '');
    base.edges.carcass = edgeChoice(base.edges.carcass, 0);
    base.edges.face = edgeChoice(base.edges.face, 1);
    const carcass = board(base.boards.carcass);
    base.carcassThick = carcass ? thickOf(carcass) : 18;
    base.drawerThick = base.carcassThick;
    base.profiles = state.profiles;
    return base;
  }

  const moduleName = (m, i) => {
    if (m.name) return m.name;
    if (m.type === 'single') return `Елемент ${mm(m.w)}×${mm(m.h)}`;
    const preset = M.PRESETS[m.preset];
    return `М${i + 1} ${preset ? preset.label : M.TYPE_DEFAULTS[m.type].label} ${mm(m.w)}`;
  };

  const wallIdOf = (m) => (m.wallId && state.walls.some((w) => w.id === m.wallId) ? m.wallId : state.walls[0].id);
  const activeWall = () => state.walls.find((w) => w.id === activeWallId) || state.walls[0];
  const modulesOf = (id) => state.modules.filter((m) => m.type !== 'single' && wallIdOf(m) === id);

  /** Стената след ъгъл започва след дълбочината на предишната и лайсната. */
  function arrangeNow(id) {
    const wallId = id || activeWallId;
    const i = Math.max(0, state.walls.findIndex((w) => w.id === wallId));
    const r = state.walls[i];
    let offsetLower = 0;
    let offsetUpper = 0;
    if (i > 0) {
      const s = moduleSettings();
      const prev = modulesOf(state.walls[i - 1].id);
      const depth = (type) => prev.filter((m) => m.type === type).reduce((v, m) => Math.max(v, m.d), 0);
      const dl = Math.max(depth('base'), depth('tall'), depth('wardrobe'));
      const du = depth('wall');
      if (dl) offsetLower = dl + (+s.cornerFiller || 0);
      if (du) offsetUpper = du + (+s.cornerFiller || 0);
    }
    return M.arrange(modulesOf(r.id), { wall: +r.wall || 0, order: r.order, tallPos: r.tallPos, upperAlign: r.upperAlign, offsetLower, offsetUpper });
  }

  /** Всички детайли от модулите, плота и стенния гръб. */
  function generatedParts() {
    const s = moduleSettings();
    const out = [];
    const warnings = [];
    const extras = [];
    const push = (id, label, w, h, qty, boardId, edges) => {
      const b = board(boardId);
      if (!b || w <= 0 || h <= 0 || qty <= 0) return;
      out.push({ id, label, w, h, qty, boardId, edges, allowRotate: !b.hasGrain });
    };
    state.modules.forEach((m, i) => {
      const name = moduleName(m, i);
      const r = M.moduleParts(m, s);
      r.warnings.forEach((w) => warnings.push(`${name}: ${w}`));
      for (const x of r.extras || []) {
        const qty = x.qty * (m.count || 1);
        const glassId = x.kind === 'glass' ? (x.key === 'shelf' ? m.shelfGlassId : x.glassId) || (state.glasses[0] || {}).id : undefined;
        const profileId = x.kind === 'profile' ? x.profileId || (state.profiles[0] || {}).id : undefined;
        extras.push({ ...x, id: `${m.id}:${x.key}`, label: m.type === 'single' ? name : `${name}: ${x.label}`, qty, glassId, profileId });
      }
      for (const p of r.parts) {
        const edges = {};
        for (const k of Object.keys(p.edges)) {
          const v = p.edges[k];
          const e = v === 'carcass' || v === 'face' ? s.edges[v] : edge(v) ? v : '';
          if (e) edges[k] = e;
        }
        const boardId = p.boardId && board(p.boardId) ? p.boardId : p.material === 'face' ? m.faceBoard || s.boards.face : s.boards[p.material];
        push(`m:${m.id}:${p.key}`, p.solo ? name : `${name}: ${p.label}`, p.w, p.h, p.qty * (m.count || 1), boardId, edges);
      }
    });
    if (!state.modules.length) return { parts: out, warnings, extras };

    const many = state.walls.length > 1;
    state.walls.forEach((wall, wi) => {
      const a = arrangeNow(wall.id);
      const tag = many ? ` ${wall.id}` : '';
      if (s.worktop && a.lowerW > 0) {
        const b = board(s.boards.worktop);
        if (b) {
          // В ъгъл плотът опира в плота на предишната стена.
          const start = wi > 0 && a.offsetLower ? s.worktopDepth : a.lowerStart;
          const run = a.endLower - start + (wi === 0 ? +s.worktopOverhangL || 0 : 0) + (wi === state.walls.length - 1 ? +s.worktopOverhangR || 0 : 0);
          const pieces = M.splitRun(run, b.w);
          pieces.forEach((len, i) => push(`m:worktop:${wall.id}:${i}`, `Плот${tag}${pieces.length > 1 ? `, част ${i + 1}` : ''}`, len, s.worktopDepth, 1, b.id, {}));
          if (pieces.length > 1) warnings.push(`Плотът${tag} е ${mm(run)} мм и се дели на ${pieces.length} части. Има снадка.`);
        }
      }
      if (s.wallPanel && Math.max(a.lowerW, a.upperW) > 0) {
        const b = board(s.boards.wallPanel);
        if (b) {
          const pieces = M.splitRun(Math.max(a.lowerW, a.upperW), b.w);
          pieces.forEach((len, i) => push(`m:wallpanel:${wall.id}:${i}`, `Стенен гръб${tag}${pieces.length > 1 ? `, част ${i + 1}` : ''}`, len, s.rowGap, 1, b.id, {}));
        }
      }
      if (s.plinthCut && a.lowerW > 0) {
        const pieces = M.splitRun(a.lowerW, (board(s.boards.plinth) || {}).w || 2800);
        pieces.forEach((len, i) => push(`m:plinth:${wall.id}:${i}`, `Цокъл${tag}${pieces.length > 1 ? `, част ${i + 1}` : ''}`, len, s.plinth, 1, s.boards.plinth, {}));
      }
      if (s.fillerCut) {
        const face = s.boards.face;
        const baseH = a.lower.reduce((v, m) => Math.max(v, m.h), 0) || 720;
        const upH = a.upper.reduce((v, m) => Math.max(v, m.h), 0) || 720;
        if (+wall.wall > 0) {
          if (a.lowerW > 0 && a.freeLower >= 10 && a.freeLower <= 150) push(`m:filler:lower:${wall.id}`, `Фугираща лайсна долен ред${tag}`, baseH, a.freeLower, 1, face, {});
          if (a.upperW > 0 && a.freeUpper >= 10 && a.freeUpper <= 150) push(`m:filler:upper:${wall.id}`, `Фугираща лайсна горен ред${tag}`, upH, a.freeUpper, 1, face, {});
        }
        if (wi > 0 && +s.cornerFiller > 0) {
          if (a.lowerW > 0 && a.offsetLower) push(`m:corner:lower:${wall.id}`, `Ъглова лайсна долен ред${tag}`, baseH, s.cornerFiller, 1, face, {});
          if (a.upperW > 0 && a.offsetUpper) push(`m:corner:upper:${wall.id}`, `Ъглова лайсна горен ред${tag}`, upH, s.cornerFiller, 1, face, {});
        }
      }
    });
    return { parts: out, warnings, extras };
  }

  function transferModules(thenRun) {
    const { parts, extras } = generatedParts();
    if (!parts.length && !extras.length) return toast('Първо добави поне един модул.');
    pushUndo();
    state.parts = state.parts.filter((p) => !p.id.startsWith('m:')).concat(parts);
    state.extraItems = extras;
    save();
    renderAll();
    if (thenRun) {
      if (!state.parts.length) {
        showView('results');
        return toast('Няма детайли за разкрой. Стъклата и профилите са в спецификацията след разкрой.');
      }
      return runOptimizer({ keepPins: false, improving: false });
    }
    showView('parts');
    toast(`Прехвърлени ${parts.length} реда детайли${extras.length ? ` и ${extras.length} реда стъкло и профили` : ''}.`, true);
  }

  const isSinglePreset = () => M.PRESETS[modPreset].type === 'single';
  const itemKind = () => M.PRESETS[modPreset].itemKind || '';

  /** Текущите стойности от формата като модул. */
  function readModuleForm() {
    const p = M.PRESETS[modPreset];
    const base = {
      preset: modPreset, type: p.type, name: $('modName').value.trim(),
      w: +$('modW').value, h: +$('modH').value, count: Math.max(1, Math.floor(+$('modCount').value) || 1),
    };
    if (p.type === 'single') {
      if (p.itemKind === 'glass') return { ...base, d: 0, itemKind: 'glass', glassId: $('modItemGlass').value };
      if (p.itemKind === 'profile') return { ...base, d: 0, h: 0, itemKind: 'profile', profileId: $('modItemProfile').value };
      return { ...base, d: 0, material: 'custom', boardId: $('modSingleBoard').value, edgeSides: $('modSingleSides').value, edgeId: $('modSingleEdge').value };
    }
    const front = $('modFront').value;
    return {
      ...base, d: +$('modD').value,
      shelves: $('modShelvesOn').checked ? Math.max(0, Math.floor(+$('modShelves').value) || 0) : 0,
      dividers: $('modDividersOn').checked ? Math.max(0, Math.floor(+$('modDividers').value) || 0) : 0,
      front, frontCount: Math.max(1, Math.floor(+$('modFrontCount').value) || 1),
      back: $('modBack').value, faceBoard: $('modFaceBoard').value,
      drawerRatios: front === 'drawers' ? $('modRatios').value.trim() : '',
      ovenH: +$('modOvenH').value || 595, ovenDrawer: $('modOvenDrawer').checked,
      drawerFrontH: +$('modComboH').value || 140, hood: !!p.hood, corner: !!p.corner,
      cornerDoor: +$('modCornerDoor').value || 450,
      doorStyle: $('modDoorStyle').value, profileId: $('modProfile').value, glassId: $('modGlass').value,
      shelfStyle: $('modShelfStyle').value, shelfGlassId: $('modShelfGlass').value,
      wallId: $('modWall').value || activeWallId,
    };
  }

  function fillModuleForm(m) {
    const single = m.type === 'single';
    $('modName').value = m.name || '';
    $('modW').value = m.w;
    $('modH').value = m.h;
    $('modCount').value = m.count || 1;
    if (single) {
      fillSelectors();
      if (m.boardId && board(m.boardId)) $('modSingleBoard').value = m.boardId;
      $('modSingleSides').value = m.edgeSides || 'none';
      if (m.edgeId && edge(m.edgeId)) $('modSingleEdge').value = m.edgeId;
      if (m.glassId) $('modItemGlass').value = m.glassId;
      if (m.profileId) $('modItemProfile').value = m.profileId;
    } else {
      $('modD').value = m.d;
      $('modShelvesOn').checked = (m.shelves || 0) > 0;
      $('modShelves').value = m.shelves || 1;
      $('modDividersOn').checked = (m.dividers || 0) > 0;
      $('modDividers').value = m.dividers || 1;
      $('modFront').value = m.front || 'none';
      $('modFrontCount').value = m.frontCount || 1;
      $('modBack').value = m.back || 'overlay';
      fillSelectors();
      $('modFaceBoard').value = m.faceBoard && board(m.faceBoard) ? m.faceBoard : '';
      $('modRatios').value = m.drawerRatios || '';
      $('modOvenH').value = m.ovenH || 595;
      $('modOvenDrawer').checked = m.ovenDrawer !== false;
      $('modComboH').value = m.drawerFrontH || 140;
      $('modCornerDoor').value = m.cornerDoor || 450;
      $('modDoorStyle').value = m.doorStyle || 'board';
      $('modShelfStyle').value = m.shelfStyle || 'board';
      if (m.profileId && state.profiles.some((x) => x.id === m.profileId)) $('modProfile').value = m.profileId;
      if (m.glassId && state.glasses.some((x) => x.id === m.glassId)) $('modGlass').value = m.glassId;
      if (m.shelfGlassId && state.glasses.some((x) => x.id === m.shelfGlassId)) $('modShelfGlass').value = m.shelfGlassId;
      $('modWall').value = wallIdOf(m);
    }
  }

  function fillSelectors() {
    const s = moduleSettings();
    const keep = (el, html) => {
      const prev = el.value;
      el.innerHTML = html;
      if ([...el.options].some((o) => o.value === prev)) el.value = prev;
    };
    const boards = state.boards.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');
    keep($('modFaceBoard'), `<option value="">По настройка (${esc((board(s.boards.face) || {}).name || '')})</option>${boards}`);
    keep($('modSingleBoard'), boards);
    const glasses = state.glasses.map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
    const profiles = state.profiles.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    keep($('modGlass'), glasses);
    keep($('modShelfGlass'), glasses);
    keep($('modItemGlass'), glasses);
    keep($('modProfile'), profiles);
    keep($('modItemProfile'), profiles);
    keep($('modWall'), state.walls.map((w) => `<option value="${esc(w.id)}">Стена ${esc(w.id)}</option>`).join(''));
    keep($('modSingleEdge'), state.edges.map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join(''));
  }

  function applyPreset(key) {
    modPreset = key;
    const p = M.PRESETS[key];
    const d = M.TYPE_DEFAULTS[p.type];
    const s = moduleSettings();
    fillModuleForm({
      type: p.type, name: '', w: p.w, h: p.h || d.h, d: d.d, count: 1,
      shelves: p.shelves, dividers: p.dividers, front: p.front, frontCount: p.frontCount, back: p.back,
      ovenH: p.ovenH, ovenDrawer: p.ovenDrawer, edgeSides: p.edgeSides, cornerDoor: p.cornerDoor,
      doorStyle: p.doorStyle, shelfStyle: p.shelfStyle, wallId: activeWallId,
      boardId: p.material === 'worktop' ? s.boards.worktop : s.boards.carcass,
      edgeId: s.edges.carcass,
    });
    renderModuleForm();
  }

  /** Показва само полетата, които важат за избрания шаблон, и какво ще излезе от тях. */
  function renderModuleForm() {
    fillSelectors();
    $('modPresets').innerHTML = ['Долни', 'Горни', 'Високи', 'Единични']
      .map((g) => `<div class="preset-group"><span>${g}</span><div>${Object.keys(M.PRESETS)
        .filter((k) => M.PRESETS[k].group === g)
        .map((k) => `<button type="button" class="preset${k === modPreset ? ' active' : ''}" data-preset="${k}">${M.PRESETS[k].label}</button>`)
        .join('')}</div></div>`)
      .join('');
    const single = isSinglePreset();
    const kind = itemKind();
    const group = !single ? 'carcass' : kind === 'glass' ? 'glassItem' : kind === 'profile' ? 'profileItem' : 'single';
    document.querySelectorAll('#modForm [data-for]').forEach((n) => (n.hidden = n.dataset.for !== group));
    $('modWLabel').textContent = !single ? 'Ширина, мм' : kind === 'profile' ? 'Дължина, мм' : kind === 'glass' ? 'Ширина, мм' : 'Дължина (по фладера), мм';
    $('modHLabel').textContent = single && !kind ? 'Ширина, мм' : 'Височина, мм';
    $('modH').closest('.field').hidden = kind === 'profile';
    $('modH').required = kind !== 'profile';
    document.querySelector('[data-wall-field]').hidden = single || state.walls.length < 2;
    const front = $('modFront').value;
    document.querySelectorAll('#modForm [data-front]').forEach((n) => (n.hidden = single || !n.dataset.front.split(' ').includes(front)));
    const hasDoorStyle = !single && ['hinged', 'sliding', 'lift', 'combo', 'cornerBlind'].includes(front);
    const doorStyle = $('modDoorStyle').value;
    document.querySelectorAll('#modForm [data-door]').forEach((n) => (n.hidden = !hasDoorStyle || !n.dataset.door.split(' ').includes(doorStyle)));
    const shelvesOn = $('modShelvesOn').checked;
    document.querySelector('[data-shelf-style]').hidden = single || !shelvesOn;
    document.querySelector('[data-shelf-glass]').hidden = single || !shelvesOn || $('modShelfStyle').value !== 'glass';
    $('modCountField').hidden = single || front === 'none' || front === 'oven' || front === 'cornerBlind';
    const drawerish = front === 'drawers' || front === 'combo';
    $('modFrontCountLabel').textContent = drawerish ? 'Брой чекмеджета' : front === 'lift' ? 'Брой клапи' : 'Брой врати';
    $('modShelves').disabled = !$('modShelvesOn').checked;
    $('modDividers').disabled = !$('modDividersOn').checked;
    $('modSingleEdgeField').hidden = group !== 'single' || $('modSingleSides').value === 'none';
    $('modSubmit').textContent = editingModule ? 'Запази промените' : 'Добави';
    $('modCancel').hidden = !editingModule;
    $('modFormTitle').textContent = editingModule ? 'Промяна на елемент' : 'Какво добавяш?';
    renderFrontInfo();
  }

  /** Жив отговор на формата: какви точно размери ще излязат. */
  function renderFrontInfo() {
    const el = $('modFrontInfo');
    const m = readModuleForm();
    if (!(m.w > 0) || (m.itemKind !== 'profile' && !(m.h > 0))) {
      el.textContent = '';
      return;
    }
    if (m.type === 'single') {
      el.textContent = '';
      return;
    }
    const s = moduleSettings();
    const r = M.moduleParts(m, s);
    const lines = [];
    const door = r.parts.find((p) => p.key === 'door');
    if (door) {
      const wide = door.label === 'Вдигаща врата';
      lines.push(`${door.label}: ${mm(wide ? door.w : door.h)} × ${mm(wide ? door.h : door.w)} мм, ${door.qty} бр.`);
    }
    if (m.front === 'drawers') {
      const hs = M.drawerHeights(m.drawerRatios, m.frontCount, m.h - m.frontCount * s.doorGap).heights;
      lines.push(`Чела отгоре надолу: ${hs.map((x) => mm(x)).join(' / ')} мм`);
    }
    if (m.front === 'oven') {
      const c = r.parts.find((p) => p.key === 'drawerFront');
      lines.push(c ? `Ниша ${mm(m.ovenH)} мм, чело под нея ${mm(c.h)} мм` : '');
    }
    for (const x of r.extras || []) {
      if (x.kind === 'glass') lines.push(`${x.label}: ${mm(x.w)} × ${mm(x.h)} мм, ${x.qty} бр.`);
    }
    const blind = r.parts.find((p) => p.key === 'blind');
    if (blind) lines.push(`Глухо лице: ${mm(blind.h)} мм`);
    if (m.front !== 'none') lines.push(`фуга ${mm(s.doorGap)} мм`);
    lines.push(...r.warnings);
    el.textContent = lines.filter(Boolean).join(' · ');
  }

  function moduleSummary(m) {
    if (m.itemKind === 'glass') return `${mm(m.w)} × ${mm(m.h)} мм · ${(state.glasses.find((g) => g.id === m.glassId) || {}).name || 'стъкло'}`;
    if (m.itemKind === 'profile') return `${mm(m.w)} мм · ${(state.profiles.find((p) => p.id === m.profileId) || {}).name || 'профил'}`;
    if (m.type === 'single') {
      const b = board(m.boardId);
      const sides = { none: 'без кант', front: 'кант по 1 дълга', long: 'кант по 2 дълги', all: 'кант навсякъде' }[m.edgeSides || 'none'];
      return `${mm(m.w)} × ${mm(m.h)} мм · ${b ? b.name : ''} · ${sides}`;
    }
    const bits = [`${mm(m.w)} × ${mm(m.h)} × ${mm(m.d)} мм`];
    if (m.shelves) bits.push(`рафтове ${m.shelves}`);
    if (m.dividers) bits.push(`делители ${m.dividers}`);
    const n = m.frontCount || 1;
    const front = {
      none: 'без лице', hinged: `${n} ${n === 1 ? 'врата' : 'врати'}`, sliding: `${n} плъзгащи`, lift: `${n} вдигащи`,
      combo: `${n} чекм. и врати`, oven: `ниша ${mm(m.ovenH || 595)}`,
      drawers: `${n} чекм.${m.drawerRatios ? ' ' + m.drawerRatios : ''}`,
      cornerBlind: `ъглова врата ${mm(m.cornerDoor || 450)}`,
    }[m.front];
    if (front) bits.push(front);
    if (m.doorStyle === 'profile') bits.push('профил и стъкло');
    if (m.doorStyle === 'glass') bits.push('стъкло без рамка');
    if (m.shelfStyle === 'glass' && m.shelves) bits.push('стъклени рафтове');
    bits.push({ overlay: 'гръб наложен', groove: 'гръб в канал', none: 'без гръб' }[m.back] || '');
    return bits.filter(Boolean).join(' · ');
  }

  function renderModuleList() {
    const s = moduleSettings();
    let warn = [];
    const many = state.walls.length > 1;
    const sections = [];
    for (const w of state.walls) {
      const pre = many ? `Стена ${w.id}: ` : '';
      const on = (m) => m.type !== 'single' && wallIdOf(m) === w.id;
      sections.push([pre + 'долен ред', (m) => on(m) && m.type === 'base']);
      sections.push([pre + 'горен ред', (m) => on(m) && m.type === 'wall']);
      sections.push([pre + 'колони и гардероби', (m) => on(m) && (m.type === 'tall' || m.type === 'wardrobe')]);
    }
    sections.push(['Единични елементи, плотове, стъкла и профили', (m) => m.type === 'single']);
    const row = (m) => {
      const i = state.modules.indexOf(m);
      const r = M.moduleParts(m, s);
      warn = warn.concat(r.warnings.map((w) => `${moduleName(m, i)}: ${w}`));
      const open = expandedModule === m.id;
      const detail = open
        ? `<div class="mod-detail table-scroll"><table class="data-table"><thead><tr><th>Детайл</th><th class="num">По фладера</th><th class="num">Напречно</th><th class="num">Брой</th><th>Материал</th><th>Кант</th></tr></thead><tbody>${r.parts
            .map((p) => {
              const boardId = p.boardId && board(p.boardId) ? p.boardId : p.material === 'face' ? m.faceBoard || s.boards.face : s.boards[p.material];
              const b = board(boardId);
              const sides = Object.keys(p.edges).length;
              return `<tr><td>${esc(p.label)}</td><td class="num">${mm(p.w)}</td><td class="num">${mm(p.h)}</td><td class="num">${p.qty * (m.count || 1)}</td><td>${esc(b ? b.name : '–')}</td><td>${sides === 4 ? 'всички страни' : sides ? (sides === 2 ? 'две страни' : 'една страна') : 'без'}</td></tr>`;
            })
            .join('')}${(r.extras || [])
            .map((x) => `<tr class="extra-row"><td>${esc(x.label)}</td><td class="num">${mm(x.kind === 'glass' ? x.h : x.len)}</td><td class="num">${x.kind === 'glass' ? mm(x.w) : '–'}</td><td class="num">${x.qty * (m.count || 1)}</td><td>${x.kind === 'glass' ? 'стъкло' : 'профил'}</td><td>не е за разкрой</td></tr>`)
            .join('')}</tbody></table></div>`
        : '';
      return `<div class="mod-row${open ? ' is-open' : ''}${editingModule === m.id ? ' is-editing' : ''}" data-id="${esc(m.id)}">
        <div class="mod-main">
          <button class="mod-title" type="button" data-act="open" aria-expanded="${open}"><span class="caret">${open ? '▾' : '▸'}</span><b>${esc(moduleName(m, i))}</b><small>${esc(moduleSummary(m))}</small></button>
          <label class="mod-qty">Брой <input type="number" min="1" data-f="count" value="${m.count || 1}" aria-label="Брой"></label>
          <div class="mod-actions">
            ${m.type === 'single' ? '' : `<button class="icon-btn plain" type="button" data-act="up" title="По-напред в реда" aria-label="По-напред">↑</button><button class="icon-btn plain" type="button" data-act="down" title="По-назад в реда" aria-label="По-назад">↓</button>`}
            <button class="btn btn-quiet" type="button" data-act="edit">Промени</button>
            <button class="btn btn-quiet" type="button" data-act="copy">Копирай</button>
            <button class="icon-btn" type="button" data-act="del" aria-label="Изтрий">×</button>
          </div>
        </div>${detail}</div>`;
    };
    $('modList').innerHTML = sections
      .map(([title, test]) => {
        const list = state.modules.filter(test);
        return list.length ? `<div class="mod-group"><h3>${title}</h3>${list.map(row).join('')}</div>` : '';
      })
      .join('');
    $('modEmpty').hidden = state.modules.length > 0;
    state.walls.forEach((w, wi) => {
      if (wi < state.walls.length - 1 && !modulesOf(w.id).some((m) => m.corner)) warn.push(`Стена ${w.id} няма ъглов модул. Ъгълът към следващата стена остава празен или се запълва с лайсна.`);
    });
    if (!many) warn = warn.filter((x) => !x.includes('няма ъглов модул'));
    if (s.worktop && state.modules.some((m) => m.preset === 'worktop') && state.modules.some((m) => m.type === 'base')) {
      warn.push('Имаш ръчно добавен плот и включен автоматичен плот по долния ред. Изключи единия от „Общи размери“, ако не ти трябват и двата.');
    }
    $('modWarnings').innerHTML = warn.map((w) => `<div class="banner banner-warn">${esc(w)}</div>`).join('');
  }

  /** Изглед отпред на стената, в мащаб. */
  function renderElevation() {
    const a = arrangeNow();
    const banner = [];
    if (a.overflow > 0) banner.push(['bad', `Модулите надвишават стената с ${mm(a.overflow)} мм.`]);
    else if (+activeWall().wall > 0) {
      const parts = [];
      if (a.lowerW) parts.push(`долу ${mm(a.freeLower)} мм`);
      if (a.upperW) parts.push(`горе ${mm(a.freeUpper)} мм`);
      if (parts.length) banner.push(['info', `Свободно: ${parts.join(', ')}.`]);
    }
    $('wallBanner').innerHTML = banner.map(([t, m]) => `<div class="banner banner-${t === 'bad' ? 'bad' : 'plain'}">${m}</div>`).join('');
    $('elevation').innerHTML = modulesOf(activeWallId).length ? elevationSvg(activeWallId) : '';
    renderPlan();
    renderWallTabs();
  }

  function renderWallTabs() {
    document.querySelectorAll('#modShape button').forEach((b) => b.classList.toggle('active', +b.dataset.shape === state.walls.length));
    $('wallTabs').innerHTML = state.walls.length > 1
      ? state.walls.map((w) => `<button type="button" class="wall-tab${w.id === activeWallId ? ' active' : ''}" data-wall="${esc(w.id)}">Стена ${esc(w.id)}<small>${modulesOf(w.id).reduce((n, m) => n + (m.count || 1), 0)} мод.</small></button>`).join('')
      : '';
  }

  /** Изглед отгоре: стените една след друга по часовниковата стрелка. */
  function planSvg() {
    const s = moduleSettings();
    const wallsA = state.walls.map((w) => ({ w, a: arrangeNow(w.id) }));
    const lens = wallsA.map(({ a }) => a.wall);
    const hor = Math.max(lens[0], lens[2] || 0);
    const ver = lens[1] || 0;
    const depthMax = Math.max(0, ...state.modules.filter((m) => m.type !== 'single').map((m) => m.d || 0), 600);
    const W = Math.max(hor, 600);
    const H = Math.max(ver, depthMax + 200);
    const pad = 150;
    const font = Math.max(W, H) / 32;
    // Преобразува точка от дадена стена (по стената, навътре) в координати на плана.
    const pt = (i, along, inward) => {
      if (i === 0) return [along, inward];
      if (i === 1) return [lens[0] - inward, along];
      return [lens[0] - along, ver - inward];
    };
    const rect = (i, x, w, from, to, attrs, label) => {
      const p = pt(i, x, from);
      const q = pt(i, x + w, to);
      const rx = Math.min(p[0], q[0]);
      const ry = Math.min(p[1], q[1]);
      const rw = Math.abs(p[0] - q[0]);
      const rh = Math.abs(p[1] - q[1]);
      const t = label ? `<text x="${rx + rw / 2}" y="${ry + rh / 2}" text-anchor="middle" dominant-baseline="central" font-family="IBM Plex Mono,monospace" font-weight="600" font-size="${font}" fill="#111">${label}</text>` : '';
      return `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" ${attrs}/>${t}`;
    };
    let body = '';
    const line = W / 300;
    wallsA.forEach(({ w, a }, i) => {
      const faceHex = (board(s.boards.face) || {}).hex || '#ddd';
      const carcHex = (board(s.boards.carcass) || {}).hex || '#ddd';
      const base = [...a.lower, ...a.tall];
      base.forEach((m) => (body += rect(i, m.x, m.w, 0, m.d, `fill="${esc(m.type === 'base' ? carcHex : faceHex)}" stroke="#1c2733" stroke-width="${line / 2}"`, m.w > font * 2.6 ? mm(m.w) : '')));
      a.upper.forEach((m) => (body += rect(i, m.x, m.w, 0, m.d, `fill="none" stroke="var(--accent)" stroke-dasharray="${font / 2} ${font / 3}" stroke-width="${line / 2}"`)));
      const s0 = pt(i, 0, -40);
      const s1 = pt(i, a.wall, -40);
      body += `<line x1="${s0[0]}" y1="${s0[1]}" x2="${s1[0]}" y2="${s1[1]}" stroke="var(--fg)" stroke-width="${line * 2}" stroke-linecap="square"/>`;
      const mid = pt(i, a.wall / 2, -105);
      const rot = i === 1 ? ` transform="rotate(90 ${mid[0]} ${mid[1]})"` : '';
      body += `<text x="${mid[0]}" y="${mid[1]}" text-anchor="middle" dominant-baseline="central" font-family="IBM Plex Sans,sans-serif" font-size="${font * 0.95}" font-weight="600" fill="var(--fg)"${rot}>Стена ${esc(w.id)}: ${mm(a.wall)}</text>`;
    });
    return `<svg viewBox="${-pad} ${-pad} ${W + 2 * pad} ${H + 2 * pad}" role="img" aria-label="Изглед отгоре">${body}</svg>`;
  }

  function renderPlan() {
    $('planView').innerHTML = state.walls.length > 1 ? planSvg() : '';
  }

  function elevationSvg(wallId) {
    const a = arrangeNow(wallId);
    const s = moduleSettings();
    const wt = s.worktop ? s.worktopThick : 0;
    const baseH = a.lower.reduce((m, x) => Math.max(m, x.h), a.lower.length ? 0 : 720);
    const upperBase = s.plinth + baseH + wt + s.rowGap;
    const topY = Math.max(
      ...a.upper.map((x) => upperBase + x.h),
      ...a.tall.map((x) => s.plinth + x.h),
      s.plinth + baseH + wt
    );
    const pad = 110;
    const W = a.wall + 2 * pad;
    const H = topY + 2 * pad;
    const y = (v) => pad + topY - v;
    const fontBig = Math.max(H / 30, W / 75);
    const haloFor = (ink) => `paint-order="stroke" stroke="${ink === '#111' ? 'rgba(255,255,255,.9)' : 'rgba(0,0,0,.55)'}" stroke-width="${fontBig / 5}"`;
    const faceFor = (m) => {
      const mod = state.modules.find((q) => q.id === m.moduleId);
      const b = board((mod && mod.faceBoard) || s.boards.face);
      return b ? b.hex : '#ddd';
    };
    const mod = (m, floor) => {
      const top = y(floor + m.h);
      const col = faceFor(m);
      const sel = expandedModule === m.moduleId;
      let lines = '';
      const line = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1c2733" stroke-width="${W / 900}"/>`;
      const n = Math.max(1, m.frontCount || 1);
      if (m.front === 'hinged' || m.front === 'sliding') for (let i = 1; i < n; i++) lines += line(m.x + (m.w * i) / n, top, m.x + (m.w * i) / n, top + m.h);
      if (m.front === 'lift') for (let i = 1; i < n; i++) lines += line(m.x, top + (m.h * i) / n, m.x + m.w, top + (m.h * i) / n);
      if (m.front === 'drawers') {
        let yy = top;
        const hs = M.drawerHeights(m.drawerRatios, n, m.h - n * s.doorGap).heights;
        hs.slice(0, -1).forEach((h2) => {
          yy += h2 + s.doorGap;
          lines += line(m.x, yy, m.x + m.w, yy);
        });
      }
      if (m.front === 'oven') lines += `<rect x="${m.x + 12}" y="${top + 12}" width="${m.w - 24}" height="${Math.max(0, (m.ovenH || 595) - 24)}" fill="#3a3f46"/>`;
      if (m.front === 'combo') for (let i = 1; i <= n; i++) lines += line(m.x, top + ((m.drawerFrontH || 140) + s.doorGap) * i, m.x + m.w, top + ((m.drawerFrontH || 140) + s.doorGap) * i);
      if (m.front === 'cornerBlind') lines += line(m.x + (m.cornerDoor || 450) + s.doorGap / 2, top, m.x + (m.cornerDoor || 450) + s.doorGap / 2, top + m.h);
      if (m.doorStyle === 'profile' || m.doorStyle === 'glass') {
        const doorRects = [];
        if (m.front === 'hinged' || m.front === 'sliding') for (let i = 0; i < n; i++) doorRects.push([m.x + (m.w * i) / n, top, m.w / n, m.h]);
        else if (m.front === 'lift') for (let i = 0; i < n; i++) doorRects.push([m.x, top + (m.h * i) / n, m.w, m.h / n]);
        else if (m.front === 'cornerBlind') doorRects.push([m.x, top, m.cornerDoor || 450, m.h]);
        const inset = m.doorStyle === 'profile' ? 26 : 4;
        lines += doorRects.map((r) => `<rect x="${r[0] + inset}" y="${r[1] + inset}" width="${Math.max(1, r[2] - 2 * inset)}" height="${Math.max(1, r[3] - 2 * inset)}" fill="#bcdde8" fill-opacity=".85" stroke="#6d94a3" stroke-width="${W / 1100}"/>`).join('');
      }
      const name = moduleNameById(m.moduleId);
      const hx = m.x + m.w / 2;
      const ink = textColorFor(col);
      const nameSize = fontBig * 0.72;
      const short = name.length * nameSize * 0.56 > m.w - 10 ? '' : name;
      const labelY = m.front === 'oven' ? top + (m.ovenH || 595) / 2 : top + m.h / 2;
      return `<g class="elev-mod" data-id="${esc(m.moduleId)}" role="button" tabindex="0" aria-label="${esc(name)}">
        <rect x="${m.x}" y="${top}" width="${m.w}" height="${m.h}" fill="${esc(col)}" stroke="${sel ? 'var(--accent)' : '#1c2733'}" stroke-width="${sel ? W / 260 : W / 650}"/>${lines}
        <text x="${hx}" y="${labelY - fontBig * 0.3}" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-weight="600" font-size="${fontBig}" fill="${ink}" ${haloFor(ink)}>${mm(m.w)}</text>
        ${short ? `<text x="${hx}" y="${labelY + fontBig}" text-anchor="middle" font-family="IBM Plex Sans,sans-serif" font-size="${nameSize}" fill="${ink}" ${haloFor(ink)}>${esc(short)}</text>` : ''}
      </g>`;
    };
    let body = `<rect x="0" y="${y(topY)}" width="${a.wall}" height="${topY}" fill="var(--surface-2)"/>`;
    body += `<line x1="${-pad}" y1="${y(0)}" x2="${a.wall + pad}" y2="${y(0)}" stroke="var(--fg)" stroke-width="${W / 450}"/>`;
    if (a.lower.length) {
      const x0 = a.lower[0].x;
      if (a.offsetLower) body += `<rect x="0" y="${y(s.plinth + baseH)}" width="${a.offsetLower}" height="${baseH}" fill="var(--line-strong)" opacity=".5"/><text x="${a.offsetLower / 2}" y="${y(s.plinth + baseH / 2)}" text-anchor="middle" dominant-baseline="central" font-family="IBM Plex Sans,sans-serif" font-size="${fontBig * 0.8}" fill="var(--fg)">ъгъл</text>`;
      body += `<rect x="${x0}" y="${y(s.plinth)}" width="${a.lowerW}" height="${s.plinth}" fill="var(--line-strong)"/>`;
      if (wt) body += `<rect x="${x0 - (+s.worktopOverhangL || 0)}" y="${y(s.plinth + baseH + wt)}" width="${a.lowerW + (+s.worktopOverhangL || 0) + (+s.worktopOverhangR || 0)}" height="${wt}" fill="#7d6a52"/>`;
    }
    body += a.tall.map((m) => mod(m, s.plinth)).join('') + a.lower.map((m) => mod(m, s.plinth)).join('') + a.upper.map((m) => mod(m, upperBase)).join('');
    const dimY = y(0) + pad * 0.3;
    body += `<g stroke="var(--fg)" stroke-width="${W / 900}"><line x1="0" y1="${dimY}" x2="${a.wall}" y2="${dimY}"/><line x1="0" y1="${dimY - 14}" x2="0" y2="${dimY + 14}"/><line x1="${a.wall}" y1="${dimY - 14}" x2="${a.wall}" y2="${dimY + 14}"/></g>`;
    body += `<text x="${a.wall / 2}" y="${dimY + fontBig}" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="${fontBig * 0.9}" font-weight="600" fill="var(--fg)">${mm(a.wall)}</text>`;
    return `<svg viewBox="${-pad} 0 ${W} ${H}" role="img" aria-label="Изглед на стената">${body}</svg>`;
  }

  const moduleNameById = (id) => {
    const i = state.modules.findIndex((m) => m.id === id);
    return i < 0 ? '' : moduleName(state.modules[i], i);
  };

  /** Отделна страница за печат: изгледът на стената и списък на модулите. */
  function buildElevationPrint() {
    renderElevation();
    const st = moduleSettings();
    const rows = state.modules
      .map((m, i) => `<tr><td>${esc(moduleName(m, i))}</td><td class="num">${m.count || 1}</td><td>${esc(moduleSummary(m))}</td></tr>`)
      .join('');
    const facts = [`Цокъл ${mm(st.plinth)} мм`, `между редовете ${mm(st.rowGap)} мм`, `фуга ${mm(st.doorGap)} мм`];
    const views = state.walls
      .map((w) => (modulesOf(w.id).length ? `<div class="print-wall"><h3>${state.walls.length > 1 ? `Стена ${esc(w.id)}, ` : 'Стена, '}${mm(arrangeNow(w.id).wall)} мм</h3>${elevationSvg(w.id)}</div>` : ''))
      .join('');
    const plan = state.walls.length > 1 ? `<div class="print-wall print-plan"><h3>Изглед отгоре</h3>${planSvg()}</div>` : '';
    $('elevPrint').classList.toggle('multi', state.walls.length > 1);
    $('elevPrint').innerHTML = `<h2>${esc(state.name || 'Без име')}</h2>
      <p class="spec-meta">${facts.join(' · ')} · ${new Date().toLocaleDateString('bg-BG')}</p>
      ${plan}${views}
      <table class="data-table spec-table print-list"><thead><tr><th>Елемент</th><th class="num">Брой</th><th>Описание</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function renderModuleSettings() {
    const s = moduleSettings();
    const num = (key, label, step) => `<div class="field"><label for="ms-${key}">${label}</label><input id="ms-${key}" type="number" min="0" step="${step || 1}" data-set="${key}" value="${s[key]}"></div>`;
    const chk = (key, label) => `<label class="check"><input id="ms-${key}" type="checkbox" data-set="${key}"${s[key] ? ' checked' : ''}> ${label}</label>`;
    const boardSel = (key, label) => `<div class="field"><label for="msb-${key}">${label}</label><select id="msb-${key}" data-board="${key}">${state.boards.map((b) => `<option value="${esc(b.id)}"${b.id === s.boards[key] ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>`;
    const edgeSel = (key, label) => `<div class="field"><label for="mse-${key}">${label}</label><select id="mse-${key}" data-edge="${key}"><option value="">Без кант</option>${state.edges.map((e) => `<option value="${esc(e.id)}"${e.id === s.edges[key] ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div>`;
    const prevOpen = $('modSettings').closest('details').open;
    $('modQuick').innerHTML = `${num('plinth', 'Цокъл, мм')}${num('doorGap', 'Фуга между вратите, мм', 0.5)}${num('rowGap', 'Между долен и горен ред, мм')}
      <div class="quick-checks">${chk('worktop', 'Плот по долния ред')}${chk('plinthCut', 'Режи цокъла')}${chk('wallPanel', 'Стенен гръб')}</div>
      ${s.worktop ? num('worktopDepth', 'Дълбочина на плота, мм') : ''}
      ${s.plinthCut ? boardSel('plinth', 'Материал за цокъла') : ''}`;
    $('modSettings').innerHTML = `
      <div><h3>Материали</h3><div class="settings-grid">${boardSel('carcass', 'Корпус')}${boardSel('face', 'Лице')}${boardSel('back', 'Гръб')}${boardSel('worktop', 'Плот')}${boardSel('wallPanel', 'Стенен гръб')}${edgeSel('carcass', 'Кант корпус')}${edgeSel('face', 'Кант лице')}</div>
        <p class="hint">Дебелината на корпуса е ${mm(s.carcassThick)} мм, от плоскостта. Сменя се в „Материали“.</p></div>
      <div><h3>Корпус</h3><div class="settings-grid">
        <div class="field"><label for="ms-bottomMode">Дъно</label><select id="ms-bottomMode" data-set="bottomMode"><option value="between"${s.bottomMode === 'between' ? ' selected' : ''}>Между страниците</option><option value="under"${s.bottomMode === 'under' ? ' selected' : ''}>Под страниците</option></select></div>
        ${num('railWidth', 'Ширина на траверса, мм')}${num('shelfFrontGap', 'Рафт назад от предния ръб, мм')}${num('shelfSideGap', 'Луфт на рафт от страна, мм', 0.5)}${num('backOverlayGap', 'Наложен гръб по-малък с, мм', 0.5)}${num('backGroove', 'Канал от задния ръб, мм')}${num('backGrooveDepth', 'Дълбочина на канала, мм')}</div></div>
      <div><h3>Плъзгащи врати и чекмеджета</h3><div class="settings-grid">${num('slidingOverlap', 'Застъпване плъзгащи, мм')}${num('drawerSlide', 'Място за водач от страна, мм')}${num('drawerHeight', 'Височина на кутия, мм')}${num('drawerDepthStep', 'Стъпка на дължината, мм')}</div>${chk('drawerBox', 'Изчислявай кутиите на чекмеджетата')}</div>
      <div><h3>Плот и лайсни</h3><div class="settings-grid">${num('worktopThick', 'Дебелина на плот, мм')}${num('worktopOverhangL', 'Плот излиза вляво, мм')}${num('worktopOverhangR', 'Плот излиза вдясно, мм')}${num('cornerFiller', 'Лайсна в ъгъла, мм')}</div>
        <div class="check-col">${chk('fillerCut', 'Добави фугираща лайсна, ако остават до 150 мм')}</div></div>`;
    $('modSettings').closest('details').open = prevOpen;
  }

  function renderTransferSummary() {
    const { parts, extras } = generatedParts();
    const total = parts.reduce((n, p) => n + p.qty, 0);
    const mods = state.modules.reduce((n, m) => n + (m.count || 1), 0);
    $('transferSummary').textContent = mods ? `${mods} елемента дават ${total} детайла за разкрой${extras.length ? ` и ${extras.reduce((n, x) => n + x.qty, 0)} бр. стъкло и профил` : ''}.` : 'Все още няма модули.';
    const current = state.parts.filter((p) => p.id.startsWith('m:'));
    const pick = (p) => [p.id, p.label, p.w, p.h, p.qty, p.boardId, JSON.stringify(p.edges || {})].join('|');
    const same = current.length === parts.length && current.map(pick).sort().join() === parts.map(pick).sort().join() && JSON.stringify(state.extraItems || []) === JSON.stringify(extras);
    const el = $('modStatus');
    if (!mods) el.textContent = '';
    else if (same) el.textContent = 'Прехвърлени в детайлите';
    else el.textContent = current.length ? 'Има промени за прехвърляне' : 'Още не са прехвърлени';
    el.classList.toggle('pending', !!mods && !same);
  }

  function renderModules() {
    renderModuleForm();
    renderModuleList();
    renderModuleSettings();
    renderRulesForm();
    renderElevation();
    renderTransferSummary();
    const modCount = state.modules.reduce((n, m) => n + (m.count || 1), 0);
    $('modulesBadge').textContent = modCount ? String(modCount) : '';
  }

  function renderRulesForm() {
    const r = state.wallRules;
    const w = activeWall();
    $('ruleWall').value = +w.wall || '';
    $('ruleOrder').value = w.order;
    $('ruleTall').value = w.tallPos;
    $('ruleUpper').value = w.upperAlign;
    $('ruleWidths').value = r.widths;
    $('rulePreferred').value = r.preferred;
  }

  function setShape(n) {
    if (n === state.walls.length) return;
    pushUndo();
    const ids = ['A', 'B', 'C'];
    while (state.walls.length < n) state.walls.push({ id: ids[state.walls.length], wall: 0, order: 'list', tallPos: 'right', upperAlign: 'left' });
    if (state.walls.length > n) {
      const keep = state.walls.slice(0, n);
      const last = keep[keep.length - 1].id;
      const removed = state.walls.slice(n).map((w) => w.id);
      let moved = 0;
      state.modules.forEach((m) => {
        if (removed.includes(m.wallId)) {
          m.wallId = last;
          moved++;
        }
      });
      state.walls = keep;
      if (moved) toast(`${moved} модула са преместени на стена ${last}.`, true);
    }
    if (!state.walls.some((w) => w.id === activeWallId)) activeWallId = state.walls[0].id;
    save();
    renderModules();
    renderBadges();
  }

  function afterModules() {
    save();
    renderModuleList();
    renderElevation();
    renderTransferSummary();
    renderBadges();
  }

  function fillRow(type) {
    const r = state.wallRules;
    const wallDef = activeWall();
    if (!(+wallDef.wall > 0)) return toast('Първо въведи дължината на стената.');
    const widths = String(r.widths).split(/[^0-9]+/).map(Number).filter((n) => n > 0);
    if (!widths.length) return toast('Въведи поне една разрешена ширина.');
    pushUndo();
    state.modules = state.modules.filter((m) => !(m.auto && m.type === type && wallIdOf(m) === wallDef.id));
    const a = arrangeNow();
    const length = type === 'base' ? a.freeLower : a.freeUpper;
    if (length < Math.min(...widths)) {
      save();
      renderModules();
      return toast('Няма свободно място за още модули в този ред.');
    }
    const fit = M.fillLength(length, widths, +r.preferred || 0);
    const d = M.TYPE_DEFAULTS[type];
    for (const it of fit.items) {
      state.modules.push({
        id: uid('mod'), auto: true, wallId: wallDef.id, preset: type === 'base' ? 'cabinet' : 'wallCab', name: '', type, w: it.w, h: d.h, d: d.d, count: it.count,
        shelves: 1, dividers: 0, front: 'hinged', frontCount: it.w > 500 ? 2 : 1, back: 'overlay', faceBoard: '',
      });
    }
    save();
    renderModules();
    renderBadges();
    toast(`Добавени ${fit.items.reduce((n, x) => n + x.count, 0)} модула. Остават ${mm(fit.remainder)} мм.`, true);
  }

  function loadModuleSample() {
    pushUndo();
    const mk = (key, name, extra) => {
      const p = M.PRESETS[key];
      const d = M.TYPE_DEFAULTS[p.type];
      return { id: uid('mod'), preset: key, name, type: p.type, w: p.w, h: p.h || d.h, d: d.d, count: 1, shelves: p.shelves, dividers: p.dividers, front: p.front, frontCount: p.frontCount, back: p.back, faceBoard: '', ovenH: p.ovenH, ovenDrawer: p.ovenDrawer, hood: p.hood, corner: p.corner, cornerDoor: p.cornerDoor, doorStyle: p.doorStyle, shelfStyle: p.shelfStyle, ...extra };
    };
    const A = { wallId: 'A' };
    const B = { wallId: 'B' };
    state.modules = [
      mk('sink', 'Мивка', A),
      mk('drawers', 'Чекмеджета', { ...A, drawerRatios: '1:2:2' }),
      mk('cornerBase', 'Ъглов', A),
      mk('wallCab', 'Над мивка', { ...A, w: 800 }),
      mk('glassCab', 'Витрина', { ...A, glassId: state.glasses[0] && state.glasses[0].id, profileId: state.profiles[0] && state.profiles[0].id, shelfGlassId: state.glasses[2] && state.glasses[2].id }),
      mk('cornerWall', 'Ъглов горен', A),
      mk('oven', 'Фурна', B),
      mk('cabinet', 'Шкаф', B),
      mk('hood', 'Аспиратор', B),
      mk('wallCab', 'Горен', B),
      mk('tall', 'Колона', B),
    ];
    state.walls = [
      { id: 'A', wall: 2400, order: 'list', tallPos: 'right', upperAlign: 'left' },
      { id: 'B', wall: 2600, order: 'list', tallPos: 'right', upperAlign: 'left' },
    ];
    activeWallId = 'A';
    state.wallRules = { ...state.wallRules };
    save();
    renderModules();
    renderBadges();
  }

  function initModules() {
    $('modFront').innerHTML = Object.keys(M.FRONT_LABELS).map((k) => `<option value="${k}">${M.FRONT_LABELS[k]}</option>`).join('');
    $('modFront').value = 'hinged';
    applyPreset('cabinet');

    $('modPresets').addEventListener('click', (e) => {
      const b = e.target.closest('[data-preset]');
      if (!b) return;
      editingModule = null;
      applyPreset(b.dataset.preset);
    });
    $('modForm').addEventListener('input', (e) => {
      // Брой врати по ширина, докато не е избран ръчно.
      if (e.target.id === 'modW' && $('modFront').value === 'hinged') $('modFrontCount').value = +e.target.value > 500 ? 2 : 1;
      // Съотношението важи за определен брой чекмеджета.
      if (e.target.id === 'modFrontCount') $('modRatios').value = '';
      renderModuleForm();
    });
    $('modDrawerBox').addEventListener('click', (e) => {
      const kind = e.target.dataset.ratio;
      if (!kind) return;
      const n = Math.max(1, Math.floor(+$('modFrontCount').value) || 1);
      const arr = Array(n).fill(1);
      if (kind === 'lowTop') arr.fill(2).fill(1, 0, 1);
      if (kind === 'tallBottom') arr[n - 1] = 2;
      $('modRatios').value = kind === 'equal' ? '' : arr.join(':');
      renderModuleForm();
    });
    $('modCancel').onclick = () => {
      editingModule = null;
      applyPreset(modPreset);
      renderModuleList();
    };
    $('modForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const data = readModuleForm();
      if (!(data.w > 0) || (data.itemKind !== 'profile' && !(data.h > 0)) || (data.type !== 'single' && !(data.d > 0))) return toast('Въведи положителни размери.');
      pushUndo();
      if (editingModule) {
        const m = state.modules.find((x) => x.id === editingModule);
        if (m) Object.assign(m, data, { auto: false });
        editingModule = null;
        applyPreset(modPreset);
      } else {
        state.modules.push({ id: uid('mod'), ...data });
        $('modName').value = '';
      }
      afterModules();
    });

    $('modList').addEventListener('change', (e) => {
      if (e.target.dataset.f !== 'count') return;
      const m = state.modules.find((x) => x.id === e.target.closest('[data-id]').dataset.id);
      const v = Math.floor(+e.target.value);
      if (!m) return;
      if (!(v >= 1)) {
        toast('Въведи брой поне 1.');
        renderModuleList();
        return;
      }
      pushUndo();
      m.count = v;
      m.auto = false;
      afterModules();
    });
    $('modList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const id = btn.closest('[data-id]').dataset.id;
      const i = state.modules.findIndex((m) => m.id === id);
      const act = btn.dataset.act;
      if (act === 'open') {
        expandedModule = expandedModule === id ? null : id;
        renderModuleList();
        renderElevation();
        return;
      }
      if (act === 'edit') {
        const m = state.modules[i];
        editingModule = id;
        modPreset = M.PRESETS[m.preset] ? m.preset : m.type === 'single' ? 'single' : { base: 'cabinet', wall: 'wallCab', tall: 'tall', wardrobe: 'wardrobe' }[m.type];
        fillModuleForm(m);
        renderModuleForm();
        renderModuleList();
        $('modFormPanel').scrollIntoView({ block: 'nearest' });
        return;
      }
      pushUndo();
      // Преместване сред модулите от същия ред.
      const sameRow = (a, b) => wallIdOf(a) === wallIdOf(b) && (a.type === b.type || (['tall', 'wardrobe'].includes(a.type) && ['tall', 'wardrobe'].includes(b.type)));
      const swapWith = (dir) => {
        for (let j = i + dir; j >= 0 && j < state.modules.length; j += dir) {
          if (sameRow(state.modules[j], state.modules[i])) {
            [state.modules[j], state.modules[i]] = [state.modules[i], state.modules[j]];
            activeWall().order = 'list';
            return;
          }
        }
      };
      if (act === 'del') {
        state.modules.splice(i, 1);
        if (editingModule === id) editingModule = null;
        toast('Изтрито.', true);
      } else if (act === 'copy') {
        state.modules.splice(i + 1, 0, { ...state.modules[i], id: uid('mod'), auto: false });
      } else if (act === 'up') swapWith(-1);
      else if (act === 'down') swapWith(1);
      renderRulesForm();
      renderModuleForm();
      afterModules();
    });

    $('elevation').addEventListener('click', (e) => {
      const g = e.target.closest('.elev-mod');
      if (!g) return;
      expandedModule = expandedModule === g.dataset.id ? null : g.dataset.id;
      renderModuleList();
      renderElevation();
    });

    const wallField = { ruleWall: 'wall', ruleOrder: 'order', ruleTall: 'tallPos', ruleUpper: 'upperAlign' };
    for (const id of Object.keys(wallField)) {
      $(id).addEventListener('change', (e) => {
        const key = wallField[id];
        activeWall()[key] = key === 'wall' ? Math.max(0, +e.target.value || 0) : e.target.value;
        afterModules();
      });
    }
    $('ruleWidths').addEventListener('change', (e) => {
      state.wallRules.widths = e.target.value;
      save();
    });
    $('rulePreferred').addEventListener('change', (e) => {
      state.wallRules.preferred = Math.max(0, +e.target.value || 0);
      save();
    });
    $('modShape').addEventListener('click', (e) => {
      const b = e.target.closest('[data-shape]');
      if (b) setShape(+b.dataset.shape);
    });
    $('wallTabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-wall]');
      if (!b) return;
      activeWallId = b.dataset.wall;
      renderRulesForm();
      renderElevation();
      if (!editingModule) $('modWall').value = activeWallId;
    });
    $('fillLower').onclick = () => fillRow('base');
    $('fillUpper').onclick = () => fillRow('wall');
    $('modSample').onclick = loadModuleSample;

    const onSetting = (e) => {
      const t = e.target;
      const ms = state.modSettings;
      if (t.dataset.board) ms.boards = { ...(ms.boards || {}), [t.dataset.board]: t.value };
      else if (t.dataset.edge !== undefined) {
        ms.edges = { ...(ms.edges || {}), [t.dataset.edge]: t.value || '__none' };
      } else if (t.dataset.set) {
        if (t.type === 'checkbox') ms[t.dataset.set] = t.checked;
        else if (t.tagName === 'SELECT') ms[t.dataset.set] = t.value;
        else ms[t.dataset.set] = Math.max(0, +t.value || 0);
      } else return;
      afterModules();
      renderModuleSettings();
      renderModuleForm();
    };
    $('modSettings').addEventListener('change', onSetting);
    $('modQuick').addEventListener('change', onSetting);
    $('printElevation').onclick = () => {
      if (!state.modules.length) return toast('Първо добави модули.');
      buildElevationPrint();
      document.body.classList.add('print-elev');
      window.print();
    };
    window.addEventListener('afterprint', () => document.body.classList.remove('print-elev'));
    $('transferParts').onclick = () => transferModules(false);
    $('transferRun').onclick = () => transferModules(true);
  }

  function init() {
    initTheme();
    const hadData = load();
    if (!state.id) state.id = uid('prj');
    seedModuleMaterials();
    initModules();

    document.querySelectorAll('[data-file-action]').forEach((n) => (n.hidden = SANDBOXED));
    document.querySelectorAll('[data-copy-action]').forEach((n) => (n.hidden = !SANDBOXED));

    bindMasterTable('boardsTable', () => state.boards, (id) => {
      const used = state.parts.filter((p) => p.boardId === id).length;
      if (used) return toast(`Плоскостта се ползва от ${used} реда. Смени им материала и опитай пак.`);
      if (state.boards.length === 1) return toast('Трябва да остане поне една плоскост.');
      pushUndo();
      state.boards = state.boards.filter((b) => b.id !== id);
      state.stock = state.stock.filter((s) => s.boardId !== id);
      save();
      renderMasters();
      toast('Плоскостта е изтрита.', true);
    }, ['w', 'h', 'price', 'thick']);

    bindMasterTable('edgesTable', () => state.edges, (id) => {
      const used = state.parts.filter((p) => SIDES.some((s) => p.edges[s] === id)).length;
      if (used) return toast(`Кантът се ползва от ${used} реда. Смени го и опитай пак.`);
      pushUndo();
      state.edges = state.edges.filter((e) => e.id !== id);
      save();
      renderMasters();
      toast('Кантът е изтрит.', true);
    }, ['thick', 'pricePerM']);

    bindMasterTable('stockTable', () => state.stock, (id) => {
      pushUndo();
      state.stock = state.stock.filter((s) => s.id !== id);
      save();
      renderMasters();
      toast('Остатъкът е изтрит.', true);
    }, ['w', 'h', 'qty']);

    $('addBoardDefBtn').onclick = () => {
      pushUndo();
      state.boards.push({ id: uid('b'), name: 'НОВА ПЛОСКОСТ', hex: '#c9b79c', w: 2800, h: 2070, hasGrain: true, price: 55 });
      save();
      renderMasters();
      const rows = $('boardsTable').querySelectorAll('tbody tr');
      rows[rows.length - 1].querySelector('[data-f="name"]').select();
    };
    $('addEdgeDefBtn').onclick = () => {
      pushUndo();
      state.edges.push({ id: uid('e'), name: 'НОВ КАНТ', hex: '#888888', thick: 2, pricePerM: 0.5 });
      save();
      renderMasters();
      const rows = $('edgesTable').querySelectorAll('tbody tr');
      rows[rows.length - 1].querySelector('[data-f="name"]').select();
    };
    bindMasterTable('glassTable', () => state.glasses, (id) => {
      if (state.modules.some((m) => [m.glassId, m.shelfGlassId].includes(id))) return toast('Това стъкло се ползва от модул. Смени го и опитай пак.');
      pushUndo();
      state.glasses = state.glasses.filter((g) => g.id !== id);
      save();
      renderMasters();
      toast('Стъклото е изтрито.', true);
    }, ['thick', 'price']);
    bindMasterTable('profileTable', () => state.profiles, (id) => {
      if (state.modules.some((m) => m.profileId === id)) return toast('Този профил се ползва от модул. Смени го и опитай пак.');
      pushUndo();
      state.profiles = state.profiles.filter((p) => p.id !== id);
      save();
      renderMasters();
      toast('Профилът е изтрит.', true);
    }, ['deduct', 'price']);
    $('addGlass').onclick = () => {
      pushUndo();
      state.glasses.push({ id: uid('gl'), name: 'НОВО СТЪКЛО', hex: '#cfe6ee', thick: 4, price: 25 });
      save();
      renderMasters();
    };
    $('addProfile').onclick = () => {
      pushUndo();
      state.profiles.push({ id: uid('pr'), name: 'НОВ ПРОФИЛ', hex: '#b4b8bc', deduct: 26, price: 9 });
      save();
      renderMasters();
    };
    $('addStock').onclick = () => {
      pushUndo();
      state.stock.push({ id: uid('st'), boardId: state.boards[0].id, w: 1000, h: 600, qty: 1 });
      save();
      renderMasters();
    };

    // Форма за детайл
    $('partForm').addEventListener('submit', onSubmitPart);
    $('cancelEdit').onclick = () => {
      resetEditMode();
      formEdges = {};
      renderEdgeButtons();
      updatePreview();
      renderParts();
    };
    document.querySelectorAll('.edge-side').forEach((b) => (b.onclick = () => toggleEdgeSide(b.dataset.side)));
    $('edgesAll').onclick = () => {
      const cur = $('partEdgeSelect').value;
      if (!edge(cur)) return toast('Първо добави вид кант в „Материали“.');
      SIDES.forEach((k) => (formEdges[k] = cur));
      renderEdgeButtons();
      updatePreview();
    };
    $('edgesNone').onclick = () => {
      formEdges = {};
      renderEdgeButtons();
      updatePreview();
    };
    $('partPreviewCanvas').addEventListener('click', (e) => {
      if (!previewBox) return;
      const c = e.currentTarget;
      const r = c.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * c.width - previewBox.x;
      const y = ((e.clientY - r.top) / r.height) * c.height - previewBox.y;
      const d = { left: x, right: previewBox.dw - x, top: y, bottom: previewBox.dh - y };
      toggleEdgeSide(Object.keys(d).reduce((a, b) => (d[a] <= d[b] ? a : b)));
    });
    ['partWidth', 'partHeight', 'partBoardSelect', 'partOrient'].forEach((id) =>
      $(id).addEventListener('input', () => {
        if (id === 'partBoardSelect') renderOrient(true);
        renderEdgeButtons();
        updatePreview();
      })
    );

    // Таблица детайли
    $('partsList').addEventListener('change', onPartsTableInput);
    $('partsList').addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      if (e.target.closest('[data-edit]')) startEdit(tr.dataset.id);
      if (e.target.closest('[data-del]')) {
        pushUndo();
        state.parts = state.parts.filter((p) => p.id !== tr.dataset.id);
        if (editingPartId === tr.dataset.id) resetEditMode();
        afterPartsChanged();
        toast('Детайлът е изтрит.', true);
      }
    });

    $('clearAllParts').onclick = () => {
      if (!state.parts.length && !state.layout) return;
      pushUndo();
      state.parts = [];
      state.layout = null;
      state.layoutSignature = null;
        resetEditMode();
      save();
      renderParts();
      renderSheets();
      toast('Списъкът е изчистен.', true);
    };

    $('loadSample').onclick = loadSample;
    $('openPaste').onclick = () => {
      $('pastePanel').hidden = false;
      $('pasteText').focus();
    };
    $('closePaste').onclick = () => ($('pastePanel').hidden = true);
    $('applyPaste').onclick = () => {
      const { rows, bad } = parsePaste($('pasteText').value);
      if (!rows.length) return toast('Не разпознах редове с размери.');
      pushUndo();
      const boardId = $('partBoardSelect').value;
      const edges = formEdges;
      rows.forEach((r) => state.parts.push({ id: uid('p'), ...r, boardId, edges: { ...edges }, ...readOrient() }));
      $('pasteText').value = '';
      $('pastePanel').hidden = true;
      afterPartsChanged();
      toast(`Добавени ${rows.length} реда с текущата плоскост и кант.` + (bad.length ? ` Пропуснати редове: ${bad.join(', ')}.` : ''));
    };
    $('exportCsv').onclick = () => copyText(csvText(), 'Списъкът е копиран. Постави го в Excel.');

    // Настройки
    ['kerf', 'trim', 'minOffcut', 'edgeAllowance', 'priority', 'searchTime'].forEach((id) =>
      $(id).addEventListener('change', () => {
        readSettings();
        save();
        if (state.layout) renderSheets();
      })
    );
    $('projectName').addEventListener('change', (e) => {
      state.name = e.target.value;
      save();
      renderProjects();
    });
    $('projectList').addEventListener('click', (e) => {
      const b = e.target.closest('.project-item');
      if (b) openProject(b.dataset.id);
    });
    $('newProject').onclick = () => {
      newProject('');
      save();
      resetEditMode();
      renderAll();
      showView('parts');
      $('projectName').focus();
    };
    $('deleteProject').onclick = deleteProject;

    $('runCutting').onclick = () => runOptimizer({ keepPins: hasPins(), improving: false });
    $('rerun').onclick = () => runOptimizer({ keepPins: hasPins(), improving: false });
    $('improve').onclick = () => {
      if (state.layoutSignature !== layoutSignature()) return runOptimizer({ keepPins: hasPins(), improving: false });
      runOptimizer({ keepPins: true, improving: true });
    };
    $('stopSearch').onclick = () => (stopRequested = true);
    $('saveOffcuts').onclick = saveOffcutsToStock;

    // Проект
    $('exportProject').onclick = () => downloadText(projectFileName(), JSON.stringify(state, null, 1), 'application/json');
    $('copyProject').onclick = () => copyText(JSON.stringify(state), 'Проектът е копиран като текст.');
    $('importProject').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data.parts) || !Array.isArray(data.boards)) throw new Error('shape');
        importProject(data);
        toast('Проектът е зареден като нов.');
      } catch (_) {
        toast('Файлът не е валиден проект на тази програма.');
      }
      e.target.value = '';
    });

    $('exportPDF').onclick = () => window.print();
    $('printPrices').onchange = (e) => $('costBlock').classList.toggle('no-print', !e.target.checked);
    $('specBlock').addEventListener('click', (e) => {
      if (e.target.id === 'copySpec') copyText(specTsv(), 'Спецификацията е копирана. Постави я в Excel.');
      if (e.target.id === 'printSpec') {
        document.body.classList.add('print-spec');
        window.print();
      }
    });
    window.addEventListener('afterprint', () => document.body.classList.remove('print-spec'));
    let reopen = [];
    window.addEventListener('beforeprint', () => {
      reopen = [...document.querySelectorAll('.parts-detail:not([open])')];
      reopen.forEach((d) => (d.open = true));
    });
    window.addEventListener('afterprint', () => reopen.forEach((d) => (d.open = false)));

    // Редактор
    $('undo').onclick = undo;
    $('redo').onclick = redo;
    $('showCuts').onchange = render;
    $('addSheet').onclick = () => {
      if (!state.layout) return;
      const found = selectedId && findPlacement(selectedId);
      const id = found ? found.sheet.boardId : state.layout.sheets[0]?.boardId || state.boards[0].id;
      pushUndo();
      newSheetFor(id);
      save();
      render();
      toast('Добавен е празен лист. Влачи детайли върху него.');
    };

    $('sheetRail').addEventListener('click', (e) => {
      const b = e.target.closest('[data-go]');
      if (!b) return;
      const el = document.querySelector(`[data-sheet-id="${CSS.escape(b.dataset.go)}"]`);
      if (el) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    });
    const container = $('sheetsContainer');
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pin-sheet]');
      if (!btn) return;
      const sh = state.layout.sheets.find((s) => s.id === btn.closest('[data-sheet-id]').dataset.sheetId);
      if (!sh) return;
      pushUndo();
      const target = state.layout.sheets.find((s) => s.id === sh.id);
      const lock = !target.parts.every((p) => p.pinned);
      target.parts.forEach((p) => (p.pinned = lock));
      commitLayoutChange();
      if (lock) toast('Листът е заключен. „Генерирай“ ще подреди само останалото.');
    });

    container.addEventListener('change', (e) => {
      const found = findPlacement(selectedId);
      if (!found) return;
      if (e.target.id === 'inspX' || e.target.id === 'inspY') {
        const x = +$('inspX').value;
        const y = +$('inspY').value;
        if (!movePlacement(selectedId, found.sheet.id, x, y)) render();
      }
      if (e.target.id === 'inspSheet') moveToSheet(selectedId, e.target.value);
    });
    container.addEventListener('click', (e) => {
      if (e.target.id === 'inspRotate') rotateSelected();
      if (e.target.id === 'inspPin') togglePin();
      if (e.target.id === 'popClose') {
        selectedId = null;
        render();
      }
    });
    window.addEventListener('resize', positionPopover);

    document.addEventListener('keydown', (e) => {
      const tag = e.target.tagName;
      const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault();
        redo();
        return;
      }
      if (typing || !selectedId || currentView !== 'results') return;
      const found = findPlacement(selectedId);
      if (!found) return;
      const k = e.key.toLowerCase();
      if (k === 'r' || k === 'р') rotateSelected();
      else if (k === 'l' || k === 'л') togglePin();
      else if (k === 'escape') {
        selectedId = null;
        render();
      } else if (k.startsWith('arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0;
        const dy = k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0;
        const p = found.placement;
        const id = selectedId;
        if (movePlacement(id, found.sheet.id, p.x + dx, p.y + dy)) {
          const again = document.querySelector(`.part[data-part="${CSS.escape(id)}"]`);
          if (again) again.focus();
        }
      }
    });
    container.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('part')) {
        e.preventDefault();
        selectPart(e.target.dataset.part);
      }
    });

    document.querySelectorAll('.step').forEach((n) => (n.onclick = () => showView(n.dataset.view)));
    $('goParts').onclick = () => showView('parts');
    renderAll();
    showView('parts');
    if (!hadData) {
      const firstId = state.id;
      loadSample();
      delete library.projects[firstId];
      save();
      renderProjects();
    }
  }

  const hasPins = () => !!state.layout && state.layout.sheets.some((s) => s.parts.some((p) => p.pinned));

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
