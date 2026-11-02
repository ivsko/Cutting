/* Интерфейс и състояние на приложението. Изчисленията са в optimizer.js. */
(function () {
  'use strict';

  const E = window.CutEngine;
  const STORE_KEY = 'cutting.library.v1';
  const OLD_STORE_KEY = 'cutting.project.v2';
  const PROJECT_FIELDS = ['id', 'name', 'parts', 'settings', 'layout', 'layoutSignature', 'updated'];
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
      { id: 'b1', name: 'ДЪБ СОНОМА', hex: '#d2b48c', w: 2800, h: 2070, hasGrain: true, price: 61.35 },
      { id: 'b2', name: 'БЯЛ ГЛАНЦ', hex: '#ffffff', w: 2800, h: 2070, hasGrain: false, price: 48.57 },
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
  });

  let state = defaults();
  let selectedId = null;
  let editingPartId = null;
  let undoStack = [];
  let redoStack = [];
  let running = false;
  let stopRequested = false;
  let formEdges = {};
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
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...library, boards: state.boards, edges: state.edges, stock: state.stock }));
    } catch (err) {
      if (err && err.name === 'QuotaExceededError' && !storageWarned) {
        storageWarned = true;
        toast('Паметта на браузъра е пълна. Изтрий стари проекти или запази този във файл.');
      }
    }
  }

  function setProject(rec) {
    const d = defaults();
    state = { ...d, boards: state.boards, edges: state.edges, stock: state.stock, ...rec, settings: { ...d.settings, ...(rec.settings || {}) } };
    state.parts = (state.parts || []).map(migratePart);
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
        library = { currentId: lib.currentId, projects: lib.projects || {} };
        state.boards = lib.boards || state.boards;
        state.edges = lib.edges || state.edges;
        state.stock = lib.stock || [];
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
    $('projectSelect').innerHTML = list
      .map((p) => `<option value="${esc(p.id)}"${p.id === state.id ? ' selected' : ''}>${esc(p.name || 'Без име')} · ${when(p.updated)}</option>`)
      .join('');
    $('projectStatus').textContent = `${list.length} ${list.length === 1 ? 'проект' : 'проекта'}, записват се автоматично в този браузър`;
  }

  /** Импортираният файл става нов проект, а материалите му се добавят към базата. */
  function importProject(data) {
    for (const b of data.boards || []) if (!board(b.id)) state.boards.push(b);
    for (const e of data.edges || []) if (!edge(e.id)) state.edges.push(e);
    newProject(data.name, data.settings);
    state.parts = (data.parts || []).map(migratePart);
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

  const snapshot = () => JSON.stringify({ layout: state.layout, parts: state.parts, boards: state.boards, edges: state.edges, stock: state.stock, sig: state.layoutSignature });

  function restore(snap) {
    const s = JSON.parse(snap);
    state.layout = s.layout;
    state.parts = s.parts;
    state.boards = s.boards;
    state.edges = s.edges;
    state.stock = s.stock;
    state.layoutSignature = s.sig;
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
      `<text x="${x}" y="${y}" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="17" font-weight="600" fill="#1c2733" class="dim-text"${rotate ? ` transform="rotate(-90 ${x} ${y})"` : ''}>${text}</text>`;
    let out = '<g pointer-events="none" stroke="#1c2733" stroke-width="1" class="dims">';
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
      <h4 class="spec-board">Общо материали</h4>
      <div class="table-scroll"><table class="data-table spec-table"><thead><tr><th>Материал</th><th class="num">Размер / дебелина</th><th class="num">Количество</th></tr></thead><tbody>${summary}</tbody></table></div>`;
  }

  function specTsv() {
    const head = ['Поз.', 'Име', 'Плоскост', 'Брой', 'Крайна ширина', 'Крайна височина', 'Ширина за рязане', 'Височина за рязане', 'Завъртане', 'Кант', 'Кант, м'];
    const n = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
    const rows = state.parts.map((p) => {
      const c = cutSize(p);
      const b = board(p.boardId);
      return [posOf(p.id), p.label, b ? b.name : '', p.qty, n(p.w), n(p.h), n(c.w), n(c.h), p.allowRotate ? 'Завъртане' : 'Без завъртане', edgeTextPlain(p), n(edgeMetersOf(p) * p.qty)].join('\t');
    });
    return [head.join('\t'), ...rows].join('\n');
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
            <div class="sheet-stats">Рандеман <b>${fmt(a.fill * 100, 1)}%</b> · Детайли <b>${sh.parts.length}</b> · Резове <b>${a.plan.cuts.length}</b>
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

    renderKpis();
    renderCosts();
    renderSpec();
    renderProblems();
    positionPopover();
    $('undo').disabled = undoStack.length === 0;
    $('redo').disabled = redoStack.length === 0;
    $('staleBanner').hidden = state.layoutSignature === layoutSignature();
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
    $('sheetsBadge').textContent = state.layout ? String(state.layout.sheets.filter((x) => x.parts.length).length) + ' л.' : '';
    const boards = new Set(state.parts.map((p) => p.boardId)).size;
    $('runSummary').textContent = count ? `${count} детайла от ${boards} вида плоскост.` : 'Списъкът е празен.';
  }

  function renderAll() {
    renderMasters();
    renderParts();
    renderSheets();
    renderBadges();
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
        const min = f === 'price' || f === 'pricePerM' || f === 'thick' ? 0 : 1;
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

  function init() {
    const hadData = load();
    if (!state.id) state.id = uid('prj');

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
    }, ['w', 'h', 'price']);

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
    $('projectSelect').addEventListener('change', (e) => openProject(e.target.value));
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
