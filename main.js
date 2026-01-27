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

  // --- ВИЗУАЛНИ КАНТОВЕ ---
  function toggleEdge(id) {
    document.getElementById(id).classList.toggle('active');
  }

  ['edgeTop', 'edgeBottom', 'edgeLeft', 'edgeRight'].forEach((id) => {
    document.getElementById(id).onclick = () => toggleEdge(id);
  });

  // --- ДОБАВЯНЕ НА ДЕТАЙЛ ---
  const partWidth = document.getElementById('partWidth');
  const partHeight = document.getElementById('partHeight');
  const partCount = document.getElementById('partCount');
  const partsList = document.getElementById('partsList');

  const boardColorInput = document.getElementById('partBoardColor');
  const boardWidthInput = document.getElementById('boardWidth');
  const boardHeightInput = document.getElementById('boardHeight');

  function addColorToList(color) {
    const list = document.getElementById('colorList');
    if (![...list.options].some((o) => o.value === color)) {
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

  document.getElementById('addPart').onclick = () => {
    const w = +partWidth.value;
    const h = +partHeight.value;
    const count = +partCount.value;

    const boardColor = normalizeColor(boardColorInput.value) || 'НЕУТОЧНЕН';
    addColorToList(boardColor);
    const edgeColor = document.getElementById('edgeColor').value || 'Неуточнен';
    const edgeThickness = +document.getElementById('partEdgeThickness').value;
    const grain = document.getElementById('partGrain').checked;

    boardSizes[boardColor] = {
      width: +boardWidthInput.value,
      height: +boardHeightInput.value,
    };

    addColorToList(boardColor);

    for (let i = 0; i < count; i++) {
      parts.push({
        w,
        h,
        grain,
        boardColor,
        edgeColor,
        edgeThickness,
        edge: {
          top: edgeTop.classList.contains('active'),
          bottom: edgeBottom.classList.contains('active'),
          left: edgeLeft.classList.contains('active'),
          right: edgeRight.classList.contains('active'),
        },
      });
    }

    updatePartsList();
  };

 function updatePartsList() { partsList.innerHTML = ''; parts.forEach((p, i) => { const li = document.createElement('li'); const edges = []; if (p.edge.top) edges.push('горе'); if (p.edge.bottom) edges.push('долу'); if (p.edge.left) edges.push('ляво'); if (p.edge.right) edges.push('дясно'); li.textContent = `${i + 1}. ${p.w} × ${p.h} (${p.boardColor})` + (edges.length ? ` | кант: ${edges.join(', ')} | ${p.edgeColor} ${p.edgeThickness}мм` : ''); // --- БУТОН ЗА ИЗТРИВАНЕ --- const delBtn = document.createElement('button'); delBtn.textContent = '✖'; delBtn.style.marginLeft = '10px'; delBtn.style.background = '#e74c3c'; delBtn.style.color = 'white'; delBtn.style.border = 'none'; delBtn.style.padding = '4px 8px'; delBtn.style.cursor = 'pointer'; delBtn.style.borderRadius = '4px'; delBtn.style.fontSize = '14px'; li.appendChild(delBtn); delBtn.onclick = (e) => { e.stopPropagation(); parts.splice(i, 1); updatePartsList(); }; partsList.appendChild(li); }); } 

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

    ctx.strokeStyle = 'black';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, width, height);

    return sheet;
  }

  // --- РИСУВАНЕ НА КАНТОВЕ ---
  function drawEdges(ctx, p, placed, partW, partH) {
    const edgeVisual = 10;
    const edgeOffset = 15;
    const realW = placed.w;
    const realH = placed.h;

    ctx.fillStyle = p.edgeColor || '#ff0000';

    if (p.edge.top)
      ctx.fillRect(
        placed.x + edgeOffset,
        placed.y + edgeOffset,
        realW - edgeOffset * 2,
        edgeVisual
      );

    if (p.edge.bottom)
      ctx.fillRect(
        placed.x + edgeOffset,
        placed.y + realH - edgeVisual - edgeOffset,
        realW - edgeOffset * 2,
        edgeVisual
      );

    if (p.edge.left)
      ctx.fillRect(
        placed.x + edgeOffset,
        placed.y + edgeOffset,
        edgeVisual,
        realH - edgeOffset * 2
      );

    if (p.edge.right)
      ctx.fillRect(
        placed.x + realW - edgeVisual - edgeOffset,
        placed.y + edgeOffset,
        edgeVisual,
        realH - edgeOffset * 2
      );
  }

  // --- ПЛОЩАДКА ---
  function placePartsOnSheet(sheet, partsToPlace) {
    const ctx = sheet.ctx;
    const kerf = +document.getElementById('kerf').value;

    const maxRects = new MaxRects(sheet.width, sheet.height);
    const remaining = [];

    for (let p of partsToPlace) {
      let partW = p.w;
      let partH = p.h;

      if (p.edge.left) partW -= p.edgeThickness;
      if (p.edge.right) partW -= p.edgeThickness;
      if (p.edge.top) partH -= p.edgeThickness;
      if (p.edge.bottom) partH -= p.edgeThickness;

      let placed = maxRects.insert(partW + kerf, partH + kerf);

      if (!placed && !p.grain) {
        placed = maxRects.insert(partH + kerf, partW + kerf);
        if (placed) {
          [partW, partH] = [partH, partW];
          p.rotated = true;

          p.edge = {
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

      ctx.fillStyle = '#cfe8fc';
      ctx.fillRect(placed.x, placed.y, placed.w, placed.h);

      ctx.strokeStyle = '#1a73e8';
      ctx.strokeRect(placed.x, placed.y, placed.w, placed.h);

      ctx.fillStyle = '#000';
      ctx.font = '60px Roboto';
      ctx.fillText(`${partW} × ${partH}`, placed.x + 40, placed.y + 80);

      drawEdges(ctx, p, placed, partW, partH);

      sheet.parts.push(p);

      p.x = placed.x;
      p.y = placed.y;
      p.realW = placed.w;
      p.realH = placed.h;
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

      const w = boardSizes[color].width;
      const h = boardSizes[color].height;

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
        if (p.edge.top) edges.push('Горе');
        if (p.edge.bottom) edges.push('Долу');
        if (p.edge.left) edges.push('Ляво');
        if (p.edge.right) edges.push('Дясно');

        const area = (p.realW * p.realH) / 1_000_000;

        html += `<tr>
          <td>${index + 1}</td>
          <td>${p.w} × ${p.h}</td>
          <td>${edges.join(', ') || '-'}</td>
          <td>${p.edgeColor}</td>
          <td>${p.edgeThickness} мм</td>
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

    for (const key in edgeSpec) {
      html += `<tr><td>${key}</td><td>${edgeSpec[key].toFixed(2)} м</td></tr>`;
    }

    html += `</table></body></html>`;

    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };
};

