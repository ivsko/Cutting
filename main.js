window.onload = () => {
  // --- ГЛОБАЛНИ ДАННИ ---
  function normalizeColor(str) {
    if (!str) return '';
    return str
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/-/g, '')
      .replace(/Н/g, 'H');
  }
  let parts = [];
  let sheets = [];
  let boardSizes = {}; // запомня размери по цвят
  let editingIndex = null;

  // --- РЕФЕРЕНЦИИ КЪМ ЧЕКБОКСИТЕ ЗА КАНТ ---
  const edgeTop = document.getElementById('edgeTop');
  const edgeBottom = document.getElementById('edgeBottom');
  const edgeLeft = document.getElementById('edgeLeft');
  const edgeRight = document.getElementById('edgeRight');

  function clearEdgeSelection() {
    if (edgeTop) edgeTop.checked = false;
    if (edgeBottom) edgeBottom.checked = false;
    if (edgeLeft) edgeLeft.checked = false;
    if (edgeRight) edgeRight.checked = false;
  }

  // --- ЕЛЕМЕНТИ НА ФОРМАТА ---
  const partWidth = document.getElementById('partWidth');
  const partHeight = document.getElementById('partHeight');
  const partCount = document.getElementById('partCount');
  const partsList = document.getElementById('partsList');
  const addPartBtn = document.getElementById('addPart');

  const boardColorInput = document.getElementById('partBoardColor');
  const boardWidthInput = document.getElementById('boardWidth');
  const boardHeightInput = document.getElementById('boardHeight');

  // Бутон за отказ от редакция
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Отказ';
  cancelBtn.style.marginLeft = '10px';
  cancelBtn.style.background = '#7f8c8d';
  cancelBtn.style.color = 'white';
  cancelBtn.style.border = 'none';
  cancelBtn.style.padding = '8px 16px';
  cancelBtn.style.cursor = 'pointer';
  cancelBtn.style.borderRadius = '4px';
  cancelBtn.style.display = 'none';
  if (addPartBtn && addPartBtn.parentNode) {
    addPartBtn.parentNode.insertBefore(cancelBtn, addPartBtn.nextSibling);
  }

  function resetFormText() {
    editingIndex = null;
    addPartBtn.textContent = 'Добави детайл';
    cancelBtn.style.display = 'none';
    clearEdgeSelection();
  }

  cancelBtn.onclick = () => {
    resetFormText();
  };

  function addColorToList(color) {
    const list = document.getElementById('colorList');
    if (list && ![...list.options].some((o) => o.value === color)) {
      const opt = document.createElement('option');
      opt.value = color;
      list.appendChild(opt);
    }
  }

  boardColorInput.addEventListener('input', () => {
    const raw = boardColorInput.value;
    const color = normalizeColor(raw);
    boardColorInput.value = color;
    if (boardSizes[color]) {
      boardWidthInput.value = boardSizes[color].width;
      boardHeightInput.value = boardSizes[color].height;
    }
  });

  addPartBtn.onclick = () => {
    const w = +partWidth.value;
    const h = +partHeight.value;
    const count = +partCount.value || 1;

    if (!w || !h) return;

    const boardColor = normalizeColor(boardColorInput.value) || 'НЕУТОЧНЕН';
    addColorToList(boardColor);
    const edgeColor = document.getElementById('edgeColor').value || 'Неуточнен';
    const edgeThickness = +document.getElementById('partEdgeThickness').value || 0;
    const grain = document.getElementById('partGrain').checked;

    boardSizes[boardColor] = {
      width: +boardWidthInput.value || 2800,
      height: +boardHeightInput.value || 2070,
    };

    const isTop = edgeTop ? edgeTop.checked : false;
    const isBottom = edgeBottom ? edgeBottom.checked : false;
    const isLeft = edgeLeft ? edgeLeft.checked : false;
    const isRight = edgeRight ? edgeRight.checked : false;

    const updatedPart = {
      w,
      h,
      grain,
      boardColor,
      edgeColor,
      edgeThickness,
      edge: {
        top: isTop,
        bottom: isBottom,
        left: isLeft,
        right: isRight,
      },
    };

    if (editingIndex !== null) {
      parts[editingIndex] = updatedPart;
      resetFormText();
    } else {
      for (let i = 0; i < count; i++) {
        parts.push({ ...updatedPart, edge: { ...updatedPart.edge } });
      }
    }

    clearEdgeSelection();
    updatePartsList();
  };

  function updatePartsList() {
    partsList.innerHTML = '';
    parts.forEach((p, i) => {
      const li = document.createElement('li');
      const edges = [];
      if (p.edge.top) edges.push('Ширина 1 (горе)');
      if (p.edge.bottom) edges.push('Ширина 2 (долу)');
      if (p.edge.left) edges.push('Височина 1 (ляво)');
      if (p.edge.right) edges.push('Височина 2 (дясно)');

      li.textContent =
        `${i + 1}. ${p.w} × ${p.h} (${p.boardColor})` +
        (edges.length
          ? ` | кант: ${edges.join(', ')} | ${p.edgeColor} ${p.edgeThickness}мм`
          : ' | без кант');

      // --- БУТОН ЗА РЕДАКТИРАНЕ ---
      const editBtn = document.createElement('button');
      editBtn.textContent = '✏️';
      editBtn.style.marginLeft = '10px';
      editBtn.style.background = '#f39c12';
      editBtn.style.color = 'white';
      editBtn.style.border = 'none';
      editBtn.style.padding = '4px 8px';
      editBtn.style.cursor = 'pointer';
      editBtn.style.borderRadius = '4px';
      editBtn.style.fontSize = '14px';

      editBtn.onclick = (e) => {
        e.stopPropagation();
        editingIndex = i;

        partWidth.value = p.w;
        partHeight.value = p.h;
        partCount.value = 1;
        boardColorInput.value = p.boardColor;
        document.getElementById('edgeColor').value = p.edgeColor;
        document.getElementById('partEdgeThickness').value = p.edgeThickness;
        document.getElementById('partGrain').checked = p.grain;

        if (boardSizes[p.boardColor]) {
          boardWidthInput.value = boardSizes[p.boardColor].width;
          boardHeightInput.value = boardSizes[p.boardColor].height;
        }

        if (edgeTop) edgeTop.checked = !!p.edge.top;
        if (edgeBottom) edgeBottom.checked = !!p.edge.bottom;
        if (edgeLeft) edgeLeft.checked = !!p.edge.left;
        if (edgeRight) edgeRight.checked = !!p.edge.right;

        addPartBtn.textContent = 'Запази промените';
        cancelBtn.style.display = 'inline-block';
      };

      // --- БУТОН ЗА ИЗТРИВАНЕ ---
      const delBtn = document.createElement('button');
      delBtn.textContent = '✖';
      delBtn.style.marginLeft = '5px';
      delBtn.style.background = '#e74c3c';
      delBtn.style.color = 'white';
      delBtn.style.border = 'none';
      delBtn.style.padding = '4px 8px';
      delBtn.style.cursor = 'pointer';
      delBtn.style.borderRadius = '4px';
      delBtn.style.fontSize = '14px';

      delBtn.onclick = (e) => {
        e.stopPropagation();
        parts.splice(i, 1);
        if (editingIndex === i) {
          resetFormText();
        }
        updatePartsList();
      };

      li.appendChild(editBtn);
      li.appendChild(delBtn);
      partsList.appendChild(li);
    });
  }

  // --- MAXRECTS ---
  class MaxRects {
    constructor(width, height) {
      this.freeRects = [{ x: 0, y: 0, w: width, h: height }];
    }

    insert(w, h) {
      let best = null;
      let bestIndex = -1;

      for (let i = 0; i < this.freeRects.length; i++) {
        const r = this.freeRects[i];
        if (w <= r.w && h <= r.h) {
          const score = (r.w - w) * (r.h - h);
          if (!best || score < best.score) {
            best = { x: r.x, y: r.y, w, h, score };
            bestIndex = i;
          }
        }
      }

      if (!best) return null;
      this.splitFreeRect(bestIndex, best);
      return best;
    }

    splitFreeRect(index, placed) {
      const r = this.freeRects[index];
      this.freeRects.splice(index, 1);

      if (placed.y > r.y)
        this.freeRects.push({ x: r.x, y: r.y, w: r.w, h: placed.y - r.y });

      if (placed.y + placed.h < r.y + r.h)
        this.freeRects.push({
          x: r.x,
          y: placed.y + placed.h,
          w: r.w,
          h: r.y + r.h - (placed.y + placed.h),
        });

      if (placed.x > r.x)
        this.freeRects.push({ x: r.x, y: r.y, w: placed.x - r.x, h: r.h });

      if (placed.x + placed.w < r.x + r.w)
        this.freeRects.push({
          x: placed.x + placed.w,
          y: r.y,
          w: r.x + r.w - (placed.x + placed.w),
          h: r.h,
        });

      this.pruneFreeList();
    }

    pruneFreeList() {
      for (let i = 0; i < this.freeRects.length; i++) {
        for (let j = i + 1; j < this.freeRects.length; j++) {
          const a = this.freeRects[i];
          const b = this.freeRects[j];

          if (this.isContainedIn(a, b)) {
            this.freeRects.splice(i, 1);
            i--;
            break;
          }
          if (this.isContainedIn(b, a)) {
            this.freeRects.splice(j, 1);
            j--;
          }
        }
      }
    }

    isContainedIn(a, b) {
      return (
        a.x >= b.x &&
        a.y >= b.y &&
        a.x + a.w <= b.x + b.w &&
        a.y + a.h <= b.y + b.h
      );
    }
  }

  // --- СЪЗДАВАНЕ НА ПЛОСКОСТ ---
  function addSheet(width, height, color) {
    const scale = Math.min(1200 / width, 800 / height);
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    document.getElementById('sheetsContainer').appendChild(canvas);

    const sheet = { width, height, canvas, ctx, parts: [], color };
    sheets.push(sheet);

    // Заден фон на цялата плоскост
    ctx.fillStyle = '#eaeaea';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, width, height);

    return sheet;
  }

  // --- АКУРАТНО РИСУВАНЕ НА КАНТОВЕ С ОФСЕТ ---
  function drawEdges(ctx, p, placed) {
    const edgeThicknessVisual = 10; // Дебелина на линията на канта
    const offset = 18; // Вътрешен офсет (отстъп) от контура, за да не се застъпват с друг детайл

    const x = placed.x + offset;
    const y = placed.y + offset;
    const w = placed.w - (offset * 2);
    const h = placed.h - (offset * 2);

    ctx.fillStyle = p.edgeColor && p.edgeColor !== 'Неуточнен' ? p.edgeColor : '#e74c3c';

    // Горе (Ширина 1)
    if (p.edge && p.edge.top === true) {
      ctx.fillRect(x, y, w, edgeThicknessVisual);
    }
    // Долу (Ширина 2)
    if (p.edge && p.edge.bottom === true) {
      ctx.fillRect(x, y + h - edgeThicknessVisual, w, edgeThicknessVisual);
    }
    // Ляво (Височина 1)
    if (p.edge && p.edge.left === true) {
      ctx.fillRect(x, y, edgeThicknessVisual, h);
    }
    // Дясно (Височина 2)
    if (p.edge && p.edge.right === true) {
      ctx.fillRect(x + w - edgeThicknessVisual, y, edgeThicknessVisual, h);
    }
  }

  // --- ПЛОЩАДКА ---
  function placePartsOnSheet(sheet, partsToPlace) {
    const ctx = sheet.ctx;
    const kerf = +(document.getElementById('kerf').value || 0);

    const maxRects = new MaxRects(sheet.width, sheet.height);
    const remaining = [];

    for (let p of partsToPlace) {
      let currentPart = { ...p, edge: { ...p.edge } };
      
      let partW = currentPart.w;
      let partH = currentPart.h;

      if (currentPart.edge.left) partW -= currentPart.edgeThickness;
      if (currentPart.edge.right) partW -= currentPart.edgeThickness;
      if (currentPart.edge.top) partH -= currentPart.edgeThickness;
      if (currentPart.edge.bottom) partH -= currentPart.edgeThickness;

      let placed = maxRects.insert(partW + kerf, partH + kerf);

      if (!placed && !currentPart.grain) {
        placed = maxRects.insert(partH + kerf, partW + kerf);
        if (placed) {
          [partW, partH] = [partH, partW];
          currentPart.rotated = true;

          currentPart.edge = {
            top: p.edge.left,
            right: p.edge.top,
            bottom: p.edge.right,
            left: p.edge.bottom,
          };
        }
      }

      if (!placed) {
        remaining.push(p);
        continue;
      }

      // 1. Очертаване на чистия размер на детайла (без kerf)
      ctx.fillStyle = '#cfe8fc';
      ctx.fillRect(placed.x, placed.y, partW, partH);

      // 2. Външен контур на детайла
      ctx.strokeStyle = '#1a73e8';
      ctx.lineWidth = 2;
      ctx.strokeRect(placed.x, placed.y, partW, partH);

      // 3. Текст с размерите
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 42px Roboto, sans-serif';
      ctx.fillText(`${partW} × ${partH}`, placed.x + 20, placed.y + 60);

      // 4. Нанасяне на кантовете с офсет
      drawEdges(ctx, currentPart, { x: placed.x, y: placed.y, w: partW, h: partH });

      currentPart.x = placed.x;
      currentPart.y = placed.y;
      currentPart.realW = partW;
      currentPart.realH = partH;

      sheet.parts.push(currentPart);
    }

    return remaining;
  }

  // --- РАЗКРОЙ ---
  document.getElementById('runCutting').onclick = () => {
    sheets = [];
    document.getElementById('sheetsContainer').innerHTML = '';

    const grouped = {};

    parts.forEach((p) => {
      const color = normalizeColor(p.boardColor);
      if (!grouped[color]) grouped[color] = [];
      grouped[color].push(p);
    });

    for (const color in grouped) {
      let list = grouped[color];
      list.sort((a, b) => b.w * b.h - a.w * a.h);

      let remaining = [...list];

      const w = boardSizes[color] ? boardSizes[color].width : 2800;
      const h = boardSizes[color] ? boardSizes[color].height : 2070;

      while (remaining.length > 0) {
        const newSheet = addSheet(w, h, color);
        remaining = placePartsOnSheet(newSheet, remaining);
      }
    }
  };

  // --- СПЕЦИФИКАЦИЯ НА КАНТ ---
  function calculateEdgeSpec() {
    const spec = {};

    parts.forEach((p) => {
      const hasAnyEdge = p.edge.top || p.edge.bottom || p.edge.left || p.edge.right;
      if (!hasAnyEdge) return;

      const key = `${p.edgeColor} / ${p.edgeThickness}мм`;
      if (!spec[key]) spec[key] = 0;

      if (p.edge.top) spec[key] += p.w / 1000;
      if (p.edge.bottom) spec[key] += p.w / 1000;
      if (p.edge.left) spec[key] += p.h / 1000;
      if (p.edge.right) spec[key] += p.h / 1000;
    });

    return spec;
  }

  // --- PDF ---
  document.getElementById('exportPDF').onclick = () => {
    const win = window.open('', '_blank');
    let html = '<html><body>';

    sheets.forEach((sheet, i) => {
      let sheetArea = (sheet.width * sheet.height) / 1_000_000;
      let usedArea = 0;

      sheet.parts.forEach((p) => {
        usedArea += (p.realW * p.realH) / 1_000_000;
      });

      let waste = sheetArea - usedArea;
      let usagePercent = (usedArea / sheetArea) * 100;

      html += `<h2>Лист ${i + 1} (${sheet.color})</h2>`;
      html += `<img src="${sheet.canvas.toDataURL()}" style="width:95%; border:1px solid #000;">`;

      html += `<p style="font-size:18px;">Плоскост: ${sheet.width} × ${
        sheet.height
      } мм (${sheetArea.toFixed(3)} m²)</p>`;

      html += `<h3>Детайли</h3>`;
      html += `<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse; width:95%;">`;
      html += `<tr><th>№</th><th>Размер</th><th>Кант</th><th>Цвят</th><th>Дебелина</th><th>Площ</th></tr>`;

      sheet.parts.forEach((p, index) => {
        const edges = [];
        if (p.edge.top) edges.push('Ширина 1 (горе)');
        if (p.edge.bottom) edges.push('Ширина 2 (долу)');
        if (p.edge.left) edges.push('Височина 1 (ляво)');
        if (p.edge.right) edges.push('Височина 2 (дясно)');

        const area = (p.realW * p.realH) / 1_000_000;

        html += `<tr>
          <td>${index + 1}</td>
          <td>${p.w} × ${p.h}</td>
          <td>${edges.join(', ') || '-'}</td>
          <td>${edges.length ? p.edgeColor : '-'}</td>
          <td>${edges.length ? p.edgeThickness + ' мм' : '-'}</td>
          <td>${area.toFixed(3)}</td>
        </tr>`;
      });

      html += `</table>`;

      html += `<h3>Площи</h3>`;
      html += `<table border="1" cellspacing="0" cellpadding="6" style="width:60%;">`;
      html += `<tr><td>Площ на плоскостта</td><td>${sheetArea.toFixed(
        3
      )} m²</td></tr>`;
      html += `<tr><td>Използвана площ</td><td>${usedArea.toFixed(
        3
      )} m²</td></tr>`;
      html += `<tr><td>Остатък</td><td>${waste.toFixed(3)} m²</td></tr>`;
      html += `<tr><td>Използваемост</td><td>${usagePercent.toFixed(
        1
      )}%</td></tr>`;
      html += `</table><hr>`;
    });

    const edgeSpec = calculateEdgeSpec();
    html += `<h2>Обща спецификация на кант</h2>`;
    html += `<table border="1" cellspacing="0" cellpadding="6" style="width:60%;">`;
    html += `<tr><th>Кант</th><th>Общо метри</th></tr>`;

    let hasEdges = false;
    for (const key in edgeSpec) {
      hasEdges = true;
      html += `<tr><td>${key}</td><td>${edgeSpec[key].toFixed(2)} м</td></tr>`;
    }

    if (!hasEdges) {
      html += `<tr><td colspan="2">Няма заявени кантове</td></tr>`;
    }

    html += `</table></body></html>`;

    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };
};
