window.onload = () => {
  // --- БАЗА ДАННИ (Цени в EUR) ---
  let boardTypes = [
    { id: 'b1', name: 'ДЪБ СОНОМА', hex: '#d2b48c', w: 2800, h: 2070, hasGrain: true, price: 61.35 },
    { id: 'b2', name: 'БЯЛ ГЛАНЦ', hex: '#ffffff', w: 2800, h: 2070, hasGrain: false, price: 48.57 }
  ];

  let edgeTypes = [
    { id: 'e1', name: 'ОРЕХ 2mm', hex: '#8b4513', thick: 2, pricePerM: 0.61 },
    { id: 'e2', name: 'БЯЛ', hex: '#ffffff', thick: 2, pricePerM: 0.46 },
    { id: 'e0', name: 'БЕЗ КАНТ', hex: '#a0aec0', thick: 0, pricePerM: 0 }
  ];

  let parts = [];
  let editingIndex = -1;

  // DOM Елементи
  const boardsTableBody = document.querySelector('#boardsTable tbody');
  const edgesTableBody = document.querySelector('#edgesTable tbody');
  
  const partBoardSelect = document.getElementById('partBoardSelect');
  const partEdgeSelect = document.getElementById('partEdgeSelect');
  const partWidth = document.getElementById('partWidth');
  const partHeight = document.getElementById('partHeight');
  const partCount = document.getElementById('partCount');

  const edgeTop = document.getElementById('edgeTop');
  const edgeBottom = document.getElementById('edgeBottom');
  const edgeLeft = document.getElementById('edgeLeft');
  const edgeRight = document.getElementById('edgeRight');

  const partsList = document.getElementById('partsList');
  const previewCanvas = document.getElementById('partPreviewCanvas');
  const addPartBtn = document.getElementById('addPart');
  const clearAllPartsBtn = document.getElementById('clearAllParts');
  const partRotateToggle = document.getElementById('partRotateToggle');

  // Фладер
  let currentNewBoardGrain = true;
  const boardGrainToggle = document.getElementById('boardGrainToggle');
  if (boardGrainToggle) {
    boardGrainToggle.onclick = (e) => {
      e.preventDefault();
      currentNewBoardGrain = !currentNewBoardGrain;
      boardGrainToggle.textContent = currentNewBoardGrain ? '↔ Има фладер (по ширина)' : '🚫 Без фладер';
      boardGrainToggle.classList.toggle('active', currentNewBoardGrain);
    };
  }

  // Въртене
  let currentPartAllowRotate = true;
  if (partRotateToggle) {
    partRotateToggle.onclick = (e) => {
      e.preventDefault();
      currentPartAllowRotate = !currentPartAllowRotate;
      partRotateToggle.textContent = currentPartAllowRotate ? '🔓 Разрешено въртене' : '🔒 Забранено въртене';
      partRotateToggle.classList.toggle('active', currentPartAllowRotate);
    };
  }

  // Изчистване на всичко
  if (clearAllPartsBtn) {
    clearAllPartsBtn.onclick = (e) => {
      e.preventDefault();
      if (parts.length === 0) return;
      if (confirm('Сигурни ли сте, че искате да изтриете всички детайли?')) {
        parts = [];
        editingIndex = -1;
        if (addPartBtn) {
          addPartBtn.textContent = '➕ Добави детайл в списъка';
          addPartBtn.style.background = '';
        }
        updatePartsList();
        const container = document.getElementById('sheetsContainer');
        if (container) container.innerHTML = '';
      }
    };
  }

  // --- ДОБАВЯНЕ НА НОВА ПЛОСКОСТ ---
  const addBoardBtn = document.getElementById('addBoardDefBtn');
  if (addBoardBtn) {
    addBoardBtn.onclick = (e) => {
      e.preventDefault();
      const nameEl = document.getElementById('boardColorInput');
      const wEl = document.getElementById('boardWInput');
      const hEl = document.getElementById('boardHInput');
      const hexEl = document.getElementById('boardHexInput');

      const name = nameEl ? nameEl.value.trim() : '';
      const w = wEl ? +wEl.value : 0;
      const h = hEl ? +hEl.value : 0;
      const hex = hexEl ? hexEl.value : '#ffffff';

      if (!name || !w || !h || w <= 0 || h <= 0) {
        alert('Моля, въведете валидни данни за плоскостта!');
        return;
      }

      boardTypes.push({
        id: 'b_' + Date.now(),
        name, hex, w, h,
        hasGrain: currentNewBoardGrain,
        price: 55.00
      });

      renderMasterData();
      if (nameEl) nameEl.value = '';
      if (wEl) wEl.value = '2800';
      if (hEl) hEl.value = '2070';
    };
  }

  // --- ДОБАВЯНЕ НА НОВ КАНТ ---
  const addEdgeBtn = document.getElementById('addEdgeDefBtn');
  if (addEdgeBtn) {
    addEdgeBtn.onclick = (e) => {
      e.preventDefault();
      const nameEl = document.getElementById('edgeColorInput');
      const thickEl = document.getElementById('edgeThickInput');
      const hexEl = document.getElementById('edgeHexInput');

      const name = nameEl ? nameEl.value.trim() : '';
      const thick = thickEl ? +thickEl.value : 0;
      const hex = hexEl ? hexEl.value : '#ffffff';

      if (!name || thick < 0) {
        alert('Моля, въведете валидни данни за канта!');
        return;
      }

      edgeTypes.push({
        id: 'e_' + Date.now(),
        name, hex, thick,
        pricePerM: 0.50
      });

      renderMasterData();
      if (nameEl) nameEl.value = '';
      if (thickEl) thickEl.value = '2';
    };
  }

  function drawWoodGrain(ctx, x, y, w, h, isHorizontal = true, baseColor = '#d2b48c') {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = baseColor;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 1.5;

    const step = 8;
    if (isHorizontal) {
      for (let i = y - h; i < y + h + w; i += step) {
        ctx.beginPath(); ctx.moveTo(x, i); ctx.lineTo(x + w, i + 12); ctx.stroke();
      }
    } else {
      for (let i = x - w; i < x + w + h; i += step) {
        ctx.beginPath(); ctx.moveTo(i, y); ctx.lineTo(i + 12, y + h); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawEdgeLine(ctx, x, y, w, h, edgeColorHex) {
    ctx.save();
    ctx.fillStyle = edgeColorHex;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#1a202c';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  function renderMasterData() {
    if (boardsTableBody) boardsTableBody.innerHTML = '';
    if (partBoardSelect) partBoardSelect.innerHTML = '';
    
    boardTypes.forEach((b) => {
      if (boardsTableBody) {
        boardsTableBody.innerHTML += `
          <tr>
            <td><span style="background:${b.hex}; display:inline-block; width:14px; height:14px; border-radius:3px; border:1px solid #999;"></span></td>
            <td><b>${b.name}</b></td>
            <td>${b.w}×${b.h} мм</td>
            <td>${b.hasGrain ? '↔ Фладер' : '🚫 Без фладер'}</td>
            <td><input type="number" step="0.01" value="${b.price}" style="width:70px; padding:2px;" onchange="updateBoardPrice('${b.id}', this.value)"> €</td>
            <td><button class="btn btn-sm" style="background:#e53e3e; color:#fff;" onclick="removeBoard('${b.id}')">✕</button></td>
          </tr>`;
      }
      if (partBoardSelect) {
        partBoardSelect.innerHTML += `<option value="${b.id}">${b.name} (${b.w}x${b.h})</option>`;
      }
    });

    if (edgesTableBody) edgesTableBody.innerHTML = '';
    if (partEdgeSelect) partEdgeSelect.innerHTML = '';
    
    edgeTypes.forEach((e) => {
      if (edgesTableBody) {
        edgesTableBody.innerHTML += `
          <tr>
            <td><span style="background:${e.hex}; display:inline-block; width:14px; height:14px; border-radius:3px; border:1px solid #999;"></span></td>
            <td><b>${e.name}</b></td>
            <td>${e.thick} мм</td>
            <td><input type="number" step="0.01" value="${e.pricePerM}" style="width:70px; padding:2px;" onchange="updateEdgePrice('${e.id}', this.value)"> €/м</td>
            <td><button class="btn btn-sm" style="background:#e53e3e; color:#fff;" onclick="removeEdge('${e.id}')">✕</button></td>
          </tr>`;
      }
      if (partEdgeSelect) {
        partEdgeSelect.innerHTML += `<option value="${e.id}">${e.name} (${e.thick}мм)</option>`;
      }
    });

    updatePartPreview();
  }

  window.updateBoardPrice = (id, val) => {
    const b = boardTypes.find(x => x.id === id);
    if (b) b.price = parseFloat(val) || 0;
  };

  window.updateEdgePrice = (id, val) => {
    const e = edgeTypes.find(x => x.id === id);
    if (e) e.pricePerM = parseFloat(val) || 0;
  };

  window.removeBoard = (id) => { boardTypes = boardTypes.filter(b => b.id !== id); renderMasterData(); };
  window.removeEdge = (id) => { edgeTypes = edgeTypes.filter(e => e.id !== id); renderMasterData(); };

  function updatePartPreview() {
    if (!previewCanvas) return;
    const ctx = previewCanvas.getContext('2d');
    const cW = previewCanvas.width;
    const cH = previewCanvas.height;
    ctx.clearRect(0, 0, cW, cH);

    const w = +partWidth.value || 0;
    const h = +partHeight.value || 0;
    if (!w || !h) return;

    const boardObj = boardTypes.find(b => b.id === partBoardSelect.value) || boardTypes[0];
    const edgeObj = edgeTypes.find(e => e.id === partEdgeSelect.value) || edgeTypes[0];

    if (!boardObj) return;

    const margin = 20;
    const scale = Math.min((cW - margin * 2) / w, (cH - margin * 2) / h);
    const drawW = w * scale;
    const drawH = h * scale;
    const x = (cW - drawW) / 2;
    const y = (cH - drawH) / 2;

    if (boardObj.hasGrain) {
      drawWoodGrain(ctx, x, y, drawW, drawH, true, boardObj.hex);
    } else {
      ctx.fillStyle = boardObj.hex;
      ctx.fillRect(x, y, drawW, drawH);
    }

    ctx.strokeStyle = '#2d3748'; ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, drawW, drawH);

    if (edgeObj && edgeObj.thick > 0) {
      const inset = 5;     // <--- С КОЛКО ПИКСЕЛА НАВЪТРЕ ОТ РЪБА ДА ВЛЕЗЕ КАНТЪТ
      const lineThick = 5; // Дебелина на самата линия
      const cornerGap = 10; // Скъсяване в ъглите (за да не се застъпват)
    
      // Горен кант (пада надолу с +inset)
      if (edgeTop.checked) 
        drawEdgeLine(ctx, x + cornerGap, y + inset, drawW - (cornerGap * 2), lineThick, edgeObj.hex);
    
      // Долен кант (се качва нагоре с -inset)
      if (edgeBottom.checked) 
        drawEdgeLine(ctx, x + cornerGap, y + drawH - lineThick - inset, drawW - (cornerGap * 2), lineThick, edgeObj.hex);
    
      // Ляв кант (отива надясно с +inset)
      if (edgeLeft.checked) 
        drawEdgeLine(ctx, x + inset, y + cornerGap, lineThick, drawH - (cornerGap * 2), edgeObj.hex);
    
      // Десен кант (отива наляво с -inset)
      if (edgeRight.checked) 
        drawEdgeLine(ctx, x + drawW - lineThick - inset, y + cornerGap, lineThick, drawH - (cornerGap * 2), edgeObj.hex);
    }

    ctx.fillStyle = '#000';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${w} × ${h} мм`, cW / 2, cH / 2);
  }

  [partWidth, partHeight, partBoardSelect, partEdgeSelect, edgeTop, edgeBottom, edgeLeft, edgeRight].forEach(el => {
    if (el) {
      el.addEventListener('input', updatePartPreview);
      el.addEventListener('change', updatePartPreview);
    }
  });

  // --- ДОБАВЯНЕ И РЕДАКЦИЯ НА ДЕТАЙЛИ ---
  if (addPartBtn) {
    addPartBtn.onclick = (e) => {
      e.preventDefault();
      const w = +partWidth.value;
      const h = +partHeight.value;
      const count = +partCount.value || 1;

      if (!w || !h || w <= 0 || h <= 0) { alert('Въведете валидни размери!'); return; }

      const boardObj = boardTypes.find(b => b.id === partBoardSelect.value);
      const edgeObj = edgeTypes.find(e => e.id === partEdgeSelect.value) || { id: 'e0', name: 'БЕЗ КАНТ', hex: '#a0aec0', thick: 0 };

      if (!boardObj) { alert('Изберете плоскост!'); return; }

      const item = {
        w, h,
        boardId: boardObj.id, boardName: boardObj.name, boardHex: boardObj.hex,
        edgeId: edgeObj.id, edgeName: edgeObj.name, edgeHex: edgeObj.hex, edgeThick: edgeObj.thick,
        allowRotate: currentPartAllowRotate,
        edges: { top: edgeTop.checked, bottom: edgeBottom.checked, left: edgeLeft.checked, right: edgeRight.checked }
      };

      if (editingIndex >= 0) {
        parts[editingIndex] = item;
        editingIndex = -1;
        addPartBtn.textContent = '➕ Добави детайл в списъка';
        addPartBtn.style.background = '';
      } else {
        for (let i = 0; i < count; i++) parts.push(JSON.parse(JSON.stringify(item)));
      }
      updatePartsList();
    };
  }

  function updatePartsList() {
    if (!partsList) return;
    partsList.innerHTML = '';
    parts.forEach((p, i) => {
      const tThick = p.edges.top ? p.edgeThick : 0;
      const bThick = p.edges.bottom ? p.edgeThick : 0;
      const lThick = p.edges.left ? p.edgeThick : 0;
      const rThick = p.edges.right ? p.edgeThick : 0;

      const netW = p.w - lThick - rThick;
      const netH = p.h - tThick - bThick;

      const eArr = [];
      if (p.edges.top) eArr.push(`${netW} ✓`); 
      if (p.edges.bottom) eArr.push(`${netW} ✓`);
      if (p.edges.left) eArr.push(`${netH} ✓`);
      if (p.edges.right) eArr.push(`${netH} ✓`);

      const li = document.createElement('li');
      li.innerHTML = `
        <div>
          <b>#${i + 1}</b>: ${p.w} × ${p.h} мм | 
          Плоскост: <span style="display:inline-block; width:12px; height:12px; background:${p.boardHex}; border-radius:2px; vertical-align:middle; border:1px solid #718096;"></span> <b>${p.boardName}</b> | 
          Кант: <span style="display:inline-block; width:12px; height:12px; background:${p.edgeHex}; border-radius:2px; vertical-align:middle; border:1px solid #718096;"></span> <b>${p.edgeName}</b> ${p.edgeThick > 0 ? `(${p.edgeThick} мм)` : ''} 
          ${eArr.length ? `<span style="color:#2b6cb0; font-weight:bold; margin-left:6px;">(Кантове: ${eArr.join(', ')})</span>` : '<i>(Без кант)</i>'}
          ${!p.allowRotate ? ' 🔒' : ''}
        </div>
        <div>
          <button class="btn btn-sm" style="background:#3182ce; color:#fff; margin-right:4px;" onclick="editPart(${i})">✏️ Редакция</button>
          <button class="btn btn-sm" style="background:#e53e3e; color:#fff;" onclick="removePart(${i})">✖ Изтрий</button>
        </div>
      `;
      partsList.appendChild(li);
    });
  }

  window.editPart = (i) => {
    const p = parts[i];
    editingIndex = i;

    partWidth.value = p.w;
    partHeight.value = p.h;
    partCount.value = 1;

    if (partBoardSelect) partBoardSelect.value = p.boardId;
    if (partEdgeSelect) partEdgeSelect.value = p.edgeId;

    edgeTop.checked = p.edges.top;
    edgeBottom.checked = p.edges.bottom;
    edgeLeft.checked = p.edges.left;
    edgeRight.checked = p.edges.right;

    currentPartAllowRotate = p.allowRotate;
    if (partRotateToggle) {
      partRotateToggle.textContent = currentPartAllowRotate ? '🔓 Разрешено въртене' : '🔒 Забранено въртене';
      partRotateToggle.classList.toggle('active', currentPartAllowRotate);
    }

    addPartBtn.textContent = '💾 Запази промените';
    addPartBtn.style.background = '#e53e3e';
    updatePartPreview();
  };

  window.removePart = (i) => { 
    if (editingIndex === i) {
      editingIndex = -1;
      addPartBtn.textContent = '➕ Добави детайл в списъка';
      addPartBtn.style.background = '';
    }
    parts.splice(i, 1); 
    updatePartsList(); 
  };

  // --- ОПТИМИЗИРАН ГИЛОТИНЕН ПАКЕР (СПРАВЯ СЕ С "РИБЕНАТА КОСТ") ---
  class UltraMaxPacker {
    constructor(width, height, kerf = 0) {
      this.width = width;
      this.height = height;
      this.kerf = kerf;
      this.freeRects = [{ x: 0, y: 0, w: width, h: height }];
    }

    findBestFit(w, h, allowRotate, hasGrain) {
      let bestRectIndex = -1;
      let bestShortSideFit = Infinity;
      let bestRotated = false;

      const wK = w + this.kerf;
      const hK = h + this.kerf;

      for (let i = 0; i < this.freeRects.length; i++) {
        const r = this.freeRects[i];

        // Прав режим
        if (r.w >= wK && r.h >= hK) {
          const leftoverW = r.w - wK;
          const leftoverH = r.h - hK;
          const shortSide = Math.min(leftoverW, leftoverH);
          if (shortSide < bestShortSideFit) {
            bestShortSideFit = shortSide;
            bestRectIndex = i;
            bestRotated = false;
          }
        }

        // Завъртян режим (зависи САМО от това дали сте разрешили въртене за конкретния детайл)
        if (allowRotate && r.w >= hK && r.h >= wK) {
          const leftoverW = r.w - hK;
          const leftoverH = r.h - wK;
          const shortSide = Math.min(leftoverW, leftoverH);
          if (shortSide < bestShortSideFit) {
            bestShortSideFit = shortSide;
            bestRectIndex = i;
            bestRotated = true;
          }
        }
      }

      if (bestRectIndex === -1) return null;

      const target = this.freeRects.splice(bestRectIndex, 1)[0];
      const actualW = bestRotated ? h : w;
      const actualH = bestRotated ? w : h;
      const actualWK = actualW + this.kerf;
      const actualHK = actualH + this.kerf;

      const result = { x: target.x, y: target.y, w: actualW, h: actualH, rot: bestRotated };

      // Стриктно "Гилотинено" разделяне за поддържане на чисти ивици/ленти (премахва рибената кост)
      const remW = target.w - actualWK;
      const remH = target.h - actualHK;

      if (remW > 0) {
        this.freeRects.push({
          x: target.x + actualWK,
          y: target.y,
          w: remW,
          h: actualHK
        });
      }

      if (remH > 0) {
        this.freeRects.push({
          x: target.x,
          y: target.y + actualHK,
          w: target.w,
          h: remH
        });
      }

      // Сортиране на остатъчните правоъгълници за консолидация на срезовете
      this.freeRects.sort((a, b) => (a.y - b.y) || (a.x - b.x));

      return result;
    }

    getFreeOffcuts() {
      return this.freeRects.filter(r => r.w >= 150 && r.h >= 150);
    }
  }

  // --- СТАРТ НА РАЗКРОЯ ---
  const runBtn = document.getElementById('runCutting');
  if (runBtn) {
    runBtn.onclick = (e) => {
      e.preventDefault();
      const container = document.getElementById('sheetsContainer');
      container.innerHTML = '';
      if (parts.length === 0) { alert('Моля, добавете детайли!'); return; }

      const kerf = +document.getElementById('kerf').value || 0;
      const grouped = {};
      parts.forEach(p => {
        if (!grouped[p.boardId]) grouped[p.boardId] = [];
        grouped[p.boardId].push(p);
      });

      let sheetGlobalIndex = 1;
      let totalCostProject = 0;
      const boardCountSummary = {};
      const edgeMetersSummary = {};

      for (let bId in grouped) {
        let list = [...grouped[bId]];
        const board = boardTypes.find(b => b.id === bId);
        if (!board) continue;

        // Сортиране по височина/ширина за формиране на оптимални ивици
        list.sort((a, b) => {
          if (b.h !== a.h) return b.h - a.h;
          return b.w - a.w;
        });

        const fullSheetAreaM2 = (board.w * board.h) / 1000000;

        while (list.length > 0) {
          const packer = new UltraMaxPacker(board.w, board.h, kerf);
          const sheetBlock = document.createElement('div');
          sheetBlock.className = 'sheet-block';

          const canvasWrapper = document.createElement('div');
          canvasWrapper.className = 'sheet-canvas-wrapper';

          const canvas = document.createElement('canvas');
          const scale = Math.min(950 / board.w, 550 / board.h);
          canvas.width = Math.round(board.w * scale);
          canvas.height = Math.round(board.h * scale);

          const ctx = canvas.getContext('2d');
          
          if (board.hasGrain) {
            drawWoodGrain(ctx, 0, 0, canvas.width, canvas.height, true, board.hex);
          } else {
            ctx.fillStyle = board.hex || '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }

          const placedParts = [];
          const remaining = [];
          let usedAreaM2 = 0;

          for (let p of list) {
            let netW = p.w - (p.edges.left ? p.edgeThick : 0) - (p.edges.right ? p.edgeThick : 0);
            let netH = p.h - (p.edges.top ? p.edgeThick : 0) - (p.edges.bottom ? p.edgeThick : 0);

            let node = packer.findBestFit(netW, netH, p.allowRotate, board.hasGrain);

            if (node) {
              const rot = node.rot;
              const placedW = rot ? netH : netW;
              const placedH = rot ? netW : netH;

              const rx = node.x * scale, ry = node.y * scale, rw = placedW * scale, rh = placedH * scale;

              if (board.hasGrain) drawWoodGrain(ctx, rx, ry, rw, rh, !rot, board.hex);
              else { ctx.fillStyle = board.hex; ctx.fillRect(rx, ry, rw, rh); }

              ctx.strokeStyle = '#2d3748'; ctx.lineWidth = 1; ctx.strokeRect(rx, ry, rw, rh);

              // Кантове
              const topE = rot ? p.edges.left : p.edges.top;
              const bottomE = rot ? p.edges.right : p.edges.bottom;
              const leftE = rot ? p.edges.top : p.edges.left;
              const rightE = rot ? p.edges.bottom : p.edges.right;

              if (p.edgeThick > 0) {
                const inset = 5;     // <--- С КОЛКО ПИКСЕЛА НАВЪТРЕ ОТ РЪБА ДА ВЛЕЗЕ КАНТЪТ
                const lineThick = 4; // Дебелина на линията за кант
                const cornerGap = 8;   // Скъсяване в ъглите, за да не се пресичат
              
                if (topE) 
                  drawEdgeLine(ctx, rx + cornerGap, ry + inset, rw - (cornerGap * 2), lineThick, p.edgeHex);
              
                if (bottomE) 
                  drawEdgeLine(ctx, rx + cornerGap, ry + rh - lineThick - inset, rw - (cornerGap * 2), lineThick, p.edgeHex);
              
                if (leftE) 
                  drawEdgeLine(ctx, rx + inset, ry + cornerGap, lineThick, rh - (cornerGap * 2), p.edgeHex);
              
                if (rightE) 
                  drawEdgeLine(ctx, rx + rw - lineThick - inset, ry + cornerGap, lineThick, rh - (cornerGap * 2), p.edgeHex);
              }

              // Текст и червена индикация ↻
              ctx.fillStyle = '#000'; ctx.font = 'bold 11px sans-serif';
              ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.fillText(`${placedW}×${placedH}${rot ? ' ↻' : ''}`, rx + rw / 2, ry + rh / 2);

              usedAreaM2 += (netW * netH) / 1000000;

              let edgeMm = (p.edges.top ? p.w : 0) + (p.edges.bottom ? p.w : 0) + (p.edges.left ? p.h : 0) + (p.edges.right ? p.h : 0);
              const edgeM = edgeMm / 1000;
              edgeMetersSummary[p.edgeName] = (edgeMetersSummary[p.edgeName] || 0) + edgeM;

              placedParts.push({ ...p, netW: placedW, netH: placedH, rot });
            } else {
              remaining.push(p);
            }
          }

          // Полезни остатъци
          const offcuts = packer.getFreeOffcuts();
          offcuts.forEach(o => {
            ctx.fillStyle = 'rgba(0, 128, 0, 0.08)';
            ctx.fillRect(o.x * scale, o.y * scale, o.w * scale, o.h * scale);
            ctx.strokeStyle = 'rgba(0, 128, 0, 0.4)';
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(o.x * scale, o.y * scale, o.w * scale, o.h * scale);
            ctx.setLineDash([]);

            ctx.fillStyle = '#276749';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(`${Math.round(o.w)}×${Math.round(o.h)}`, (o.x + o.w / 2) * scale, (o.y + o.h / 2) * scale);
          });

          const efficiency = (usedAreaM2 / fullSheetAreaM2) * 100;
          const wastePercent = 100 - efficiency;

          const title = document.createElement('h3');
          title.innerHTML = `
            Лист #${sheetGlobalIndex} — Материал: <span style="display:inline-block; width:14px; height:14px; background:${board.hex}; border-radius:3px; vertical-align:middle; border:1px solid #718096;"></span> <b>${board.name}</b> (${board.w} × ${board.h} мм)
            <div style="font-size:0.9rem; color:#4a5568; margin-top:4px;">
              📊 Рандеман: <b style="color:${efficiency > 80 ? '#276749' : '#c53030'}">${efficiency.toFixed(1)}%</b> (${usedAreaM2.toFixed(2)} m²) | 
              🗑️ Фира: <b>${wastePercent.toFixed(1)}%</b>
            </div>
          `;
          sheetBlock.appendChild(title);

          canvasWrapper.appendChild(canvas);
          sheetBlock.appendChild(canvasWrapper);

          let tableHTML = `
            <table class="data-table" style="margin-top:10px;">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Размер (Бруто)</th>
                  <th>Чист Размер (Нето)</th>
                  <th>Вид Кант (Дебелина)</th>
                  <th>Кантирани страни (Размер ✓)</th>
                </tr>
              </thead>
              <tbody>
          `;

          placedParts.forEach((pt, idx) => {
            let topEdged = pt.rot ? pt.edges.left : pt.edges.top;
            let bottomEdged = pt.rot ? pt.edges.right : pt.edges.bottom;
            let leftEdged = pt.rot ? pt.edges.top : pt.edges.left;
            let rightEdged = pt.rot ? pt.edges.bottom : pt.edges.right;

            let edgeStrings = [];
            if (topEdged) edgeStrings.push(`${pt.netW} мм ✓`);
            if (bottomEdged) edgeStrings.push(`${pt.netW} мм ✓`);
            if (leftEdged) edgeStrings.push(`${pt.netH} мм ✓`);
            if (rightEdged) edgeStrings.push(`${pt.netH} мм ✓`);

            tableHTML += `
              <tr>
                <td><b>${idx + 1}</b></td>
                <td>${pt.w} × ${pt.h} мм</td>
                <td><b>${pt.netW} × ${pt.netH} мм ${pt.rot ? '<span style="color:#e53e3e; font-size:1.2rem; font-weight:bold;" title="Завъртян детайл">↻</span>' : ''}</b></td>
                <td>
                  <span style="display:inline-block; width:12px; height:12px; background:${pt.edgeHex}; border-radius:2px; vertical-align:middle; margin-right:4px; border:1px solid #718096;"></span>
                  <b>${pt.edgeName}</b> ${pt.edgeThick > 0 ? `<span style="color:#2b6cb0; font-weight:bold;">(${pt.edgeThick} мм)</span>` : ''}
                </td>
                <td>${edgeStrings.length ? edgeStrings.join(', ') : '<i>Няма кант</i>'}</td>
              </tr>
            `;
          });
          tableHTML += `</tbody></table>`;
          
          const tDiv = document.createElement('div');
          tDiv.innerHTML = tableHTML;
          sheetBlock.appendChild(tDiv);
          container.appendChild(sheetBlock);

          boardCountSummary[board.name] = (boardCountSummary[board.name] || 0) + 1;
          list = remaining;
          sheetGlobalIndex++;
        }
      }

      // Финансов отчет
      let totalPartsCount = parts.length;
      let costHTML = `<h3 style="color:#2b6cb0; margin-bottom:12px;">💶 Подробна финансова спецификация</h3>`;
      
      costHTML += `<div style="background:#fff; padding:10px; border-radius:4px; margin-bottom:12px; border:1px solid #bee3f8;">
        📊 <b>Общ брой детайли за рязане:</b> <span style="font-size: 1.1em; color: #2c5282;"><b>${totalPartsCount} бр.</b></span>
      </div>`;

      costHTML += `<ul style="line-height:1.8; list-style:none; padding-left:0;">`;
      
      for (let bName in boardCountSummary) {
        const count = boardCountSummary[bName];
        const bObj = boardTypes.find(b => b.name === bName);
        const price = bObj ? bObj.price : 55;
        const totalB = count * price;
        totalCostProject += totalB;
        costHTML += `<li>Плоскост <b>${bName}</b>: ${count} бр. листа × €${price.toFixed(2)} = <b>€${totalB.toFixed(2)}</b></li>`;
      }

      for (let eName in edgeMetersSummary) {
        const netM = edgeMetersSummary[eName];
        const grossM = netM * 1.10;
        const eObj = edgeTypes.find(e => e.name === eName);
        const price = eObj ? eObj.pricePerM : 0.5;
        const totalE = grossM * price;
        totalCostProject += totalE;
        costHTML += `<li>Кант <b>${eName}</b>: Чисти <b>${netM.toFixed(2)} м</b> (с +10% аванс: <b>${grossM.toFixed(2)} м</b>) × €${price.toFixed(2)}/м = <b>€${totalE.toFixed(2)}</b></li>`;
      }

      costHTML += `</ul>
        <h3 style="color:#2f855a; margin-top:12px; border-top:1px solid #cbd5e0; padding-top:8px;">ОБЩО ЗА МАТЕРИАЛИ: €${totalCostProject.toFixed(2)}</h3>`;

      const summaryBlock = document.createElement('div');
      summaryBlock.className = 'sheet-block';
      summaryBlock.style.cssText = 'border:2px solid #3182ce; background:#ebf8ff;';
      summaryBlock.innerHTML = costHTML;
      container.appendChild(summaryBlock);
    };
  }

  // Печат
  const exportBtn = document.getElementById('exportPDF');
  if (exportBtn) {
    exportBtn.onclick = (e) => {
      e.preventDefault();
      window.print();
    };
  }

  renderMasterData();
};
