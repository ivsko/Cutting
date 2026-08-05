window.onload = () => {
  // --- БАЗА ДАННИ (Цени в EUR) ---
  let boardTypes = [
    { id: 'b1', name: 'ДЪБ СОНОМА', hex: '#d2b48c', w: 2800, h: 2070, hasGrain: true, price: 61.35 },
    { id: 'b2', name: 'БЯЛ ГЛАНЦ', hex: '#e2e8f0', w: 2800, h: 2070, hasGrain: false, price: 48.57 }
  ];

  let edgeTypes = [
    { id: 'e1', name: 'ОРЕХ 2mm', hex: '#8b4513', thick: 2, pricePerM: 0.61 },
    { id: 'e2', name: 'БЯЛ', hex: '#3182ce', thick: 2, pricePerM: 0.46 },
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
  const partRotateToggle = document.getElementById('partRotateToggle');

  // Състояние за фладера на новодобавящата се плоскост
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

  // Управление на въртенето на детайла
  let currentPartAllowRotate = true;
  if (partRotateToggle) {
    partRotateToggle.onclick = (e) => {
      e.preventDefault();
      currentPartAllowRotate = !currentPartAllowRotate;
      partRotateToggle.textContent = currentPartAllowRotate ? '🔓 Разрешено въртене' : '🔒 Забранено въртене';
      partRotateToggle.classList.toggle('active', currentPartAllowRotate);
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
      const hex = hexEl ? hexEl.value : '#d2b48c';

      if (!name || !w || !h || w <= 0 || h <= 0) {
        alert('Моля, въведете наименование, ширина и височина на плоскостта!');
        return;
      }

      boardTypes.push({
        id: 'b_' + Date.now(),
        name,
        hex,
        w,
        h,
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
      const hex = hexEl ? hexEl.value : '#8b4513';

      if (!name || thick < 0) {
        alert('Моля, въведете наименование и дебелина на канта!');
        return;
      }

      edgeTypes.push({
        id: 'e_' + Date.now(),
        name,
        hex,
        thick,
        pricePerM: 0.50
      });

      renderMasterData();

      if (nameEl) nameEl.value = '';
      if (thickEl) thickEl.value = '2';
    };
  }

  // Рисуване на фладер (шарка на дърво)
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
      ctx.fillStyle = edgeObj.hex;
      const offset = 10; 
      const lineThick = 4.5; 
      if (edgeTop.checked) ctx.fillRect(x + offset, y, drawW - (offset * 2), lineThick);
      if (edgeBottom.checked) ctx.fillRect(x + offset, y + drawH - lineThick, drawW - (offset * 2), lineThick);
      if (edgeLeft.checked) ctx.fillRect(x, y + offset, lineThick, drawH - (offset * 2));
      if (edgeRight.checked) ctx.fillRect(x + drawW - lineThick, y + offset, lineThick, drawH - (offset * 2));
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
      const eArr = [];
      const tThick = p.edges.top ? p.edgeThick : 0;
      const bThick = p.edges.bottom ? p.edgeThick : 0;
      const lThick = p.edges.left ? p.edgeThick : 0;
      const rThick = p.edges.right ? p.edgeThick : 0;

      if (p.edges.top) eArr.push(`${p.w - lThick - rThick} мм ✓`); 
      if (p.edges.bottom) eArr.push(`${p.w - lThick - rThick} мм ✓`);
      if (p.edges.left) eArr.push(`${p.h - tThick - bThick} мм ✓`);
      if (p.edges.right) eArr.push(`${p.h - tThick - bThick} мм ✓`);

      const li = document.createElement('li');
      li.innerHTML = `
        <div>
          <b>#${i + 1}</b>: ${p.w} × ${p.h} мм | 
          Плоскост: <span style="display:inline-block; width:12px; height:12px; background:${p.boardHex}; border-radius:2px; vertical-align:middle;"></span> <b>${p.boardName}</b> | 
          Кант: <span style="display:inline-block; width:12px; height:12px; background:${p.edgeHex}; border-radius:2px; vertical-align:middle;"></span> <b>${p.edgeName}</b> 
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

  // --- АЛГОРИТЪМ ЗА РАЗКРОЙ ---
  class AutoShelfPacker {
    constructor(boardW, boardH, kerf) {
      this.boardW = boardW;
      this.boardH = boardH;
      this.kerf = Math.max(kerf, 8); 
      this.shelves = [];
      this.currentY = 0;
    }

    insert(w, h) {
      const itemW = w + this.kerf;
      const itemH = h + this.kerf;

      for (let shelf of this.shelves) {
        if (shelf.currentX + itemW <= this.boardW && itemH <= shelf.height) {
          const pos = { x: shelf.currentX, y: shelf.y, w, h };
          shelf.currentX += itemW;
          return pos;
        }
      }

      if (this.currentY + itemH <= this.boardH && itemW <= this.boardW) {
        const newShelf = { y: this.currentY, height: itemH, currentX: itemW };
        this.shelves.push(newShelf);
        const pos = { x: 0, y: this.currentY, w, h };
        this.currentY += itemH;
        return pos;
      }
      return null;
    }
  }

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
        list.sort((a, b) => b.h - a.h || b.w - b.w); // sort desc

        const fullSheetAreaM2 = (board.w * board.h) / 1000000;

        while (list.length > 0) {
          const packer = new AutoShelfPacker(board.w, board.h, kerf);
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
            ctx.fillStyle = board.hex || '#e2e8f0'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          }

          const placedParts = [];
          const remaining = [];
          let usedAreaM2 = 0;

          for (let p of list) {
            let netW = p.w - (p.edges.left ? p.edgeThick : 0) - (p.edges.right ? p.edgeThick : 0);
            let netH = p.h - (p.edges.top ? p.edgeThick : 0) - (p.edges.bottom ? p.edgeThick : 0);

            let rot = false;
            let node = packer.insert(netW, netH);

            if (!node && p.allowRotate && !board.hasGrain) {
              node = packer.insert(netH, netW);
              if (node) { rot = true; [netW, netH] = [netH, netW]; }
            }

            if (node) {
              const rx = node.x * scale, ry = node.y * scale, rw = netW * scale, rh = netH * scale;
              ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(rx, ry, rw, rh);

              if (board.hasGrain) drawWoodGrain(ctx, rx, ry, rw, rh, !rot, board.hex);
              else { ctx.fillStyle = board.hex; ctx.fillRect(rx, ry, rw, rh); }

              ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(rx, ry, rw, rh);

              if (p.edgeThick > 0) {
                ctx.fillStyle = p.edgeHex;
                const offset = 8;
                const lineThick = 3.5;
                if (p.edges.top) ctx.fillRect(rx + offset, ry, rw - (offset * 2), lineThick);
                if (p.edges.bottom) ctx.fillRect(rx + offset, ry + rh - lineThick, rw - (offset * 2), lineThick);
                if (p.edges.left) ctx.fillRect(rx, ry + offset, lineThick, rh - (offset * 2));
                if (p.edges.right) ctx.fillRect(rx + rw - lineThick, ry + offset, lineThick, rh - (offset * 2));
              }

              ctx.fillStyle = '#000'; ctx.font = 'bold 11px sans-serif';
              ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.fillText(`${netW}×${netH}`, rx + rw / 2, ry + rh / 2);

              usedAreaM2 += (netW * netH) / 1000000;

              let edgeMm = (p.edges.top ? p.w : 0) + (p.edges.bottom ? p.w : 0) + (p.edges.left ? p.h : 0) + (p.edges.right ? p.h : 0);
              const edgeM = edgeMm / 1000;
              edgeMetersSummary[p.edgeName] = (edgeMetersSummary[p.edgeName] || 0) + edgeM;

              placedParts.push({ ...p, netW, netH, rot });
            } else {
              remaining.push(p);
            }
          }

          // --- ИЗЧИСЛЯВАНЕ И ВИЗУАЛИЗАЦИЯ НА ОСТАТЪЦИ (OFFCUTS) ---
          let offcuts = [];
          
          // 1. Главен дънен остатък (ако има незаета височина долу)
          if (packer.currentY < board.h) {
            let offH = board.h - packer.currentY;
            let offW = board.w;
            if (offH > 100 && offW > 100) {
              offcuts.push({ x: 0, y: packer.currentY, w: offW, h: offH, label: `Основен остатък: ${offW} × ${offH} мм` });
              
              ctx.fillStyle = 'rgba(0, 128, 0, 0.08)';
              ctx.fillRect(0, packer.currentY * scale, board.w * scale, offH * scale);
              ctx.strokeStyle = 'rgba(0, 128, 0, 0.4)';
              ctx.setLineDash([4, 4]);
              ctx.strokeRect(0, packer.currentY * scale, board.w * scale, offH * scale);
              ctx.setLineDash([]);
              
              ctx.fillStyle = '#276749';
              ctx.font = 'bold 12px sans-serif';
              ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.fillText(`📦 ОСТАТЪК: ${offW} × ${offH} мм`, (board.w * scale) / 2, (packer.currentY + offH / 2) * scale);
            }
          }

          // 2. Странични остатъци по рафтовете
          packer.shelves.forEach((shelf, sIdx) => {
            if (shelf.currentX < board.w) {
              let offW = board.w - shelf.currentX;
              let offH = shelf.height - kerf;
              if (offW > 100 && offH > 100) {
                offcuts.push({ x: shelf.currentX, y: shelf.y, w: offW, h: offH, label: `Страничен остатък (Рафт ${sIdx+1}): ${offW} × ${offH} мм` });
                
                ctx.fillStyle = 'rgba(0, 128, 0, 0.06)';
                ctx.fillRect(shelf.currentX * scale, shelf.y * scale, offW * scale, shelf.height * scale);
                ctx.strokeStyle = 'rgba(0, 128, 0, 0.3)';
                ctx.setLineDash([3, 3]);
                ctx.strokeRect(shelf.currentX * scale, shelf.y * scale, offW * scale, shelf.height * scale);
                ctx.setLineDash([]);

                ctx.fillStyle = '#276749';
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(`${offW}×${offH}`, (shelf.currentX + offW / 2) * scale, (shelf.y + shelf.height / 2) * scale);
              }
            }
          });

          const efficiency = (usedAreaM2 / fullSheetAreaM2) * 100;
          const wastePercent = 100 - efficiency;

          const title = document.createElement('h3');
          title.innerHTML = `
            Лист #${sheetGlobalIndex} — Материал: <span style="display:inline-block; width:14px; height:14px; background:${board.hex}; border-radius:3px; vertical-align:middle;"></span> <b>${board.name}</b> (${board.w} × ${board.h} мм)
            <div style="font-size:0.9rem; color:#4a5568; margin-top:4px;">
              📊 Рандеман: <b>${efficiency.toFixed(1)}%</b> (${usedAreaM2.toFixed(2)} m²) | 
              🗑️ Фира/Остатъци: <b>${wastePercent.toFixed(1)}%</b> (${(fullSheetAreaM2 - usedAreaM2).toFixed(2)} m²)
              ${offcuts.length ? ` | <span style="color:#276749; font-weight:bold;">📦 Полезни остатъци: ${offcuts.length} бр.</span>` : ''}
            </div>
          `;
          sheetBlock.appendChild(title);

          canvasWrapper.appendChild(canvas);
          sheetBlock.appendChild(canvasWrapper);

          // Информационен блок за остатъците под чертежа
          if (offcuts.length > 0) {
            let offcutHTML = `<div style="background:#f0fff4; border:1px solid #c6f6d5; padding:8px 12px; margin-top:8px; border-radius:4px; font-size:0.9rem; color:#22543d;">
              <b>📦 Полезни остатъци за съхранение от този лист:</b>
              <ul style="margin:4px 0 0 20px; padding:0;">`;
            offcuts.forEach(o => {
              offcutHTML += `<li><b>${o.w} × ${o.h} мм</b> (позиция X: ${o.x}мм, Y: ${o.y}мм)</li>`;
            });
            offcutHTML += `</ul></div>`;
            const offDiv = document.createElement('div');
            offDiv.innerHTML = offcutHTML;
            sheetBlock.appendChild(offDiv);
          }

          let tableHTML = `
            <table class="data-table" style="margin-top:10px;">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Размер (Бруто)</th>
                  <th>Чист Размер (Нето)</th>
                  <th>Вид Кант</th>
                  <th>Кантирани страни (с чисти размери в мм)</th>
                </tr>
              </thead>
              <tbody>
          `;

          placedParts.forEach((pt, idx) => {
            let topEdged = pt.rot ? pt.edges.left : pt.edges.top;
            let bottomEdged = pt.rot ? pt.edges.right : pt.edges.bottom;
            let leftEdged = pt.rot ? pt.edges.top : pt.edges.left;
            let rightEdged = pt.rot ? pt.edges.bottom : pt.edges.right;

            let topSideNet = pt.netW;
            let bottomSideNet = pt.netW;
            let leftSideNet = pt.netH;
            let rightSideNet = pt.netH;

            let edgeStrings = [];
            if (topEdged) edgeStrings.push(`${topSideNet} мм ✓`);
            if (bottomEdged) edgeStrings.push(`${bottomSideNet} мм ✓`);
            if (leftEdged) edgeStrings.push(`${leftSideNet} мм ✓`);
            if (rightEdged) edgeStrings.push(`${rightSideNet} мм ✓`);

            tableHTML += `
              <tr>
                <td><b>${idx + 1}</b></td>
                <td>${pt.w} × ${pt.h} мм</td>
                <td><b>${pt.netW} × ${pt.netH} мм ${pt.rot ? '↻' : ''}</b></td>
                <td>
                  <span style="display:inline-block; width:12px; height:12px; background:${pt.edgeHex}; border-radius:2px; vertical-align:middle; margin-right:4px;"></span>
                  <b>${pt.edgeName}</b>
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

      // Финансов отчет в EUR
      // Финансов отчет в EUR и общ брой детайли
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
        <h3 style="color:#2f855a; margin-top:12px; border-top:1px solid #cbd5e0; padding-top:8px;">ОБЩО ЗА МАТЕРИАЛИ: €${totalCostProject.toFixed(2)}</h3>
        
        <div style="margin-top: 20px; text-align: center; font-size: 0.85rem; color: #4a5568; border-top: 1px dashed #cbd5e0; padding-top: 10px;">
          Системата е разработена с 💻 и ☕ от <b>инж. Иван Колев</b> | Всички права запазени © ${new Date().getFullYear()}
        </div>`;

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
