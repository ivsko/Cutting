window.onload = () => {
  // ============================================================
  // БАЗА ДАННИ
  // ============================================================

  let boardTypes = [
    {
      id: 'b1',
      name: 'ДЪБ СОНОМА',
      hex: '#d2b48c',
      w: 2800,
      h: 2070,
      hasGrain: true,
      price: 61.35
    },
    {
      id: 'b2',
      name: 'БЯЛ ГЛАНЦ',
      hex: '#ffffff',
      w: 2800,
      h: 2070,
      hasGrain: false,
      price: 48.57
    }
  ];

  let edgeTypes = [
    {
      id: 'e1',
      name: 'ОРЕХ 2mm',
      hex: '#8b4513',
      thick: 2,
      pricePerM: 0.61
    },
    {
      id: 'e2',
      name: 'БЯЛ',
      hex: '#ffffff',
      thick: 2,
      pricePerM: 0.46
    },
    {
      id: 'e0',
      name: 'БЕЗ КАНТ',
      hex: '#a0aec0',
      thick: 0,
      pricePerM: 0
    }
  ];

  let parts = [];
  let editingIndex = -1;

  // ============================================================
  // DOM
  // ============================================================

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

  // ============================================================
  // ФЛАДЕР
  // ============================================================

  let currentNewBoardGrain = true;

  const boardGrainToggle =
    document.getElementById('boardGrainToggle');

  if (boardGrainToggle) {
    boardGrainToggle.onclick = (e) => {
      e.preventDefault();

      currentNewBoardGrain = !currentNewBoardGrain;

      boardGrainToggle.textContent =
        currentNewBoardGrain
          ? '↔ Има фладер (по ширина)'
          : '🚫 Без фладер';

      boardGrainToggle.classList.toggle(
        'active',
        currentNewBoardGrain
      );
    };
  }

  // ============================================================
  // ВЪРТЕНЕ
  // ============================================================

  let currentPartAllowRotate = true;

  if (partRotateToggle) {
    partRotateToggle.onclick = (e) => {
      e.preventDefault();

      currentPartAllowRotate = !currentPartAllowRotate;

      partRotateToggle.textContent =
        currentPartAllowRotate
          ? '🔓 Разрешено въртене'
          : '🔒 Забранено въртене';

      partRotateToggle.classList.toggle(
        'active',
        currentPartAllowRotate
      );
    };
  }

  // ============================================================
  // ИЗЧИСТВАНЕ НА ВСИЧКО
  // ============================================================

  if (clearAllPartsBtn) {
    clearAllPartsBtn.onclick = (e) => {
      e.preventDefault();

      if (parts.length === 0) return;

      if (
        confirm(
          'Сигурни ли сте, че искате да изтриете всички детайли?'
        )
      ) {
        parts = [];
        editingIndex = -1;

        if (addPartBtn) {
          addPartBtn.textContent =
            '➕ Добави детайл в списъка';

          addPartBtn.style.background = '';
        }

        updatePartsList();

        const container =
          document.getElementById('sheetsContainer');

        if (container) {
          container.innerHTML = '';
        }
      }
    };
  }

  // ============================================================
  // ДОБАВЯНЕ НА НОВА ПЛОСКОСТ
  // ============================================================

  const addBoardBtn =
    document.getElementById('addBoardDefBtn');

  if (addBoardBtn) {
    addBoardBtn.onclick = (e) => {
      e.preventDefault();

      const nameEl =
        document.getElementById('boardColorInput');

      const wEl =
        document.getElementById('boardWInput');

      const hEl =
        document.getElementById('boardHInput');

      const hexEl =
        document.getElementById('boardHexInput');

      const name = nameEl
        ? nameEl.value.trim()
        : '';

      const w = wEl
        ? +wEl.value
        : 0;

      const h = hEl
        ? +hEl.value
        : 0;

      const hex = hexEl
        ? hexEl.value
        : '#ffffff';

      if (
        !name ||
        !w ||
        !h ||
        w <= 0 ||
        h <= 0
      ) {
        alert(
          'Моля, въведете валидни данни за плоскостта!'
        );
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

  // ============================================================
  // ДОБАВЯНЕ НА НОВ КАНТ
  // ============================================================

  const addEdgeBtn =
    document.getElementById('addEdgeDefBtn');

  if (addEdgeBtn) {
    addEdgeBtn.onclick = (e) => {
      e.preventDefault();

      const nameEl =
        document.getElementById('edgeColorInput');

      const thickEl =
        document.getElementById('edgeThickInput');

      const hexEl =
        document.getElementById('edgeHexInput');

      const name = nameEl
        ? nameEl.value.trim()
        : '';

      const thick = thickEl
        ? +thickEl.value
        : 0;

      const hex = hexEl
        ? hexEl.value
        : '#ffffff';

      if (!name || thick < 0) {
        alert(
          'Моля, въведете валидни данни за канта!'
        );
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

  // ============================================================
  // ДЪРВЕСЕН ФЛАДЕР
  // ============================================================

  function drawWoodGrain(
    ctx,
    x,
    y,
    w,
    h,
    isHorizontal = true,
    baseColor = '#d2b48c'
  ) {
    ctx.save();

    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    ctx.fillStyle = baseColor;
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle =
      'rgba(0, 0, 0, 0.15)';

    ctx.lineWidth = 1.5;

    const step = 8;

    if (isHorizontal) {
      for (
        let i = y - h;
        i < y + h + w;
        i += step
      ) {
        ctx.beginPath();
        ctx.moveTo(x, i);
        ctx.lineTo(x + w, i + 12);
        ctx.stroke();
      }
    } else {
      for (
        let i = x - w;
        i < x + w + h;
        i += step
      ) {
        ctx.beginPath();
        ctx.moveTo(i, y);
        ctx.lineTo(i + 12, y + h);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  // ============================================================
  // КАНТ
  // ============================================================

  function drawEdgeLine(
    ctx,
    x,
    y,
    w,
    h,
    edgeColorHex
  ) {
    ctx.save();

    ctx.fillStyle = edgeColorHex;
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = '#1a202c';
    ctx.lineWidth = 0.8;

    ctx.strokeRect(
      x,
      y,
      w,
      h
    );

    ctx.restore();
  }

  // ============================================================
  // MASTER DATA
  // ============================================================

  function renderMasterData() {
    if (boardsTableBody) {
      boardsTableBody.innerHTML = '';
    }

    if (partBoardSelect) {
      partBoardSelect.innerHTML = '';
    }

    boardTypes.forEach((b) => {
      if (boardsTableBody) {
        boardsTableBody.innerHTML += `
          <tr>
            <td>
              <span
                style="
                  background:${b.hex};
                  display:inline-block;
                  width:14px;
                  height:14px;
                  border-radius:3px;
                  border:1px solid #999;
                "
              ></span>
            </td>

            <td>
              <b>${b.name}</b>
            </td>

            <td>
              ${b.w}×${b.h} мм
            </td>

            <td>
              ${
                b.hasGrain
                  ? '↔ Фладер'
                  : '🚫 Без фладер'
              }
            </td>

            <td>
              <input
                type="number"
                step="0.01"
                value="${b.price}"
                style="width:70px; padding:2px;"
                onchange="updateBoardPrice('${b.id}', this.value)"
              >
              €
            </td>

            <td>
              <button
                class="btn btn-sm"
                style="
                  background:#e53e3e;
                  color:#fff;
                "
                onclick="removeBoard('${b.id}')"
              >
                ✕
              </button>
            </td>
          </tr>
        `;
      }

      if (partBoardSelect) {
        partBoardSelect.innerHTML += `
          <option value="${b.id}">
            ${b.name} (${b.w}x${b.h})
          </option>
        `;
      }
    });

    if (edgesTableBody) {
      edgesTableBody.innerHTML = '';
    }

    if (partEdgeSelect) {
      partEdgeSelect.innerHTML = '';
    }

    edgeTypes.forEach((e) => {
      if (edgesTableBody) {
        edgesTableBody.innerHTML += `
          <tr>
            <td>
              <span
                style="
                  background:${e.hex};
                  display:inline-block;
                  width:14px;
                  height:14px;
                  border-radius:3px;
                  border:1px solid #999;
                "
              ></span>
            </td>

            <td>
              <b>${e.name}</b>
            </td>

            <td>
              ${e.thick} мм
            </td>

            <td>
              <input
                type="number"
                step="0.01"
                value="${e.pricePerM}"
                style="width:70px; padding:2px;"
                onchange="updateEdgePrice('${e.id}', this.value)"
              >
              €/м
            </td>

            <td>
              <button
                class="btn btn-sm"
                style="
                  background:#e53e3e;
                  color:#fff;
                "
                onclick="removeEdge('${e.id}')"
              >
                ✕
              </button>
            </td>
          </tr>
        `;
      }

      if (partEdgeSelect) {
        partEdgeSelect.innerHTML += `
          <option value="${e.id}">
            ${e.name} (${e.thick}мм)
          </option>
        `;
      }
    });

    updatePartPreview();
  }

  // ============================================================
  // ЦЕНИ
  // ============================================================

  window.updateBoardPrice = (id, val) => {
    const b =
      boardTypes.find(
        x => x.id === id
      );

    if (b) {
      b.price =
        parseFloat(val) || 0;
    }
  };

  window.updateEdgePrice = (id, val) => {
    const e =
      edgeTypes.find(
        x => x.id === id
      );

    if (e) {
      e.pricePerM =
        parseFloat(val) || 0;
    }
  };

  window.removeBoard = (id) => {
    boardTypes =
      boardTypes.filter(
        b => b.id !== id
      );

    renderMasterData();
  };

  window.removeEdge = (id) => {
    edgeTypes =
      edgeTypes.filter(
        e => e.id !== id
      );

    renderMasterData();
  };

  // ============================================================
  // ПРЕГЛЕД НА ДЕТАЙЛА
  // ============================================================

  function updatePartPreview() {
    if (!previewCanvas) return;

    const ctx =
      previewCanvas.getContext('2d');

    const cW =
      previewCanvas.width;

    const cH =
      previewCanvas.height;

    ctx.clearRect(
      0,
      0,
      cW,
      cH
    );

    const w =
      +partWidth.value || 0;

    const h =
      +partHeight.value || 0;

    if (!w || !h) return;

    const boardObj =
      boardTypes.find(
        b => b.id === partBoardSelect.value
      ) || boardTypes[0];

    const edgeObj =
      edgeTypes.find(
        e => e.id === partEdgeSelect.value
      ) || edgeTypes[0];

    if (!boardObj) return;

    const margin = 20;

    const scale =
      Math.min(
        (cW - margin * 2) / w,
        (cH - margin * 2) / h
      );

    const drawW =
      w * scale;

    const drawH =
      h * scale;

    const x =
      (cW - drawW) / 2;

    const y =
      (cH - drawH) / 2;

    if (boardObj.hasGrain) {
      drawWoodGrain(
        ctx,
        x,
        y,
        drawW,
        drawH,
        true,
        boardObj.hex
      );
    } else {
      ctx.fillStyle =
        boardObj.hex;

      ctx.fillRect(
        x,
        y,
        drawW,
        drawH
      );
    }

    ctx.strokeStyle =
      '#2d3748';

    ctx.lineWidth = 1.5;

    ctx.strokeRect(
      x,
      y,
      drawW,
      drawH
    );

    if (
      edgeObj &&
      edgeObj.thick > 0
    ) {
      const inset = 5;
      const lineThick = 5;
      const cornerGap = 10;

      if (edgeTop.checked) {
        drawEdgeLine(
          ctx,
          x + cornerGap,
          y + inset,
          drawW - cornerGap * 2,
          lineThick,
          edgeObj.hex
        );
      }

      if (edgeBottom.checked) {
        drawEdgeLine(
          ctx,
          x + cornerGap,
          y + drawH - lineThick - inset,
          drawW - cornerGap * 2,
          lineThick,
          edgeObj.hex
        );
      }

      if (edgeLeft.checked) {
        drawEdgeLine(
          ctx,
          x + inset,
          y + cornerGap,
          lineThick,
          drawH - cornerGap * 2,
          edgeObj.hex
        );
      }

      if (edgeRight.checked) {
        drawEdgeLine(
          ctx,
          x + drawW - lineThick - inset,
          y + cornerGap,
          lineThick,
          drawH - cornerGap * 2,
          edgeObj.hex
        );
      }
    }

    ctx.fillStyle = '#000';

    ctx.font =
      'bold 14px sans-serif';

    ctx.textAlign =
      'center';

    ctx.textBaseline =
      'middle';

    ctx.fillText(
      `${w} × ${h} мм`,
      cW / 2,
      cH / 2
    );
  }

  [
    partWidth,
    partHeight,
    partBoardSelect,
    partEdgeSelect,
    edgeTop,
    edgeBottom,
    edgeLeft,
    edgeRight
  ].forEach(el => {
    if (el) {
      el.addEventListener(
        'input',
        updatePartPreview
      );

      el.addEventListener(
        'change',
        updatePartPreview
      );
    }
  });

  // ============================================================
  // ДОБАВЯНЕ / РЕДАКЦИЯ НА ДЕТАЙЛ
  // ============================================================

  if (addPartBtn) {
    addPartBtn.onclick = (e) => {
      e.preventDefault();

      const w =
        +partWidth.value;

      const h =
        +partHeight.value;

      const count =
        +partCount.value || 1;

      if (
        !w ||
        !h ||
        w <= 0 ||
        h <= 0
      ) {
        alert(
          'Въведете валидни размери!'
        );

        return;
      }

      const boardObj =
        boardTypes.find(
          b => b.id === partBoardSelect.value
        );

      const edgeObj =
        edgeTypes.find(
          e => e.id === partEdgeSelect.value
        ) || {
          id: 'e0',
          name: 'БЕЗ КАНТ',
          hex: '#a0aec0',
          thick: 0
        };

      if (!boardObj) {
        alert(
          'Изберете плоскост!'
        );

        return;
      }

      const item = {
        w,
        h,

        boardId:
          boardObj.id,

        boardName:
          boardObj.name,

        boardHex:
          boardObj.hex,

        edgeId:
          edgeObj.id,

        edgeName:
          edgeObj.name,

        edgeHex:
          edgeObj.hex,

        edgeThick:
          edgeObj.thick,

        allowRotate:
          currentPartAllowRotate,

        edges: {
          top:
            edgeTop.checked,

          bottom:
            edgeBottom.checked,

          left:
            edgeLeft.checked,

          right:
            edgeRight.checked
        }
      };

      if (editingIndex >= 0) {
        parts[editingIndex] =
          item;

        editingIndex = -1;

        addPartBtn.textContent =
          '➕ Добави детайл в списъка';

        addPartBtn.style.background =
          '';
      } else {
        for (
          let i = 0;
          i < count;
          i++
        ) {
          parts.push(
            JSON.parse(
              JSON.stringify(item)
            )
          );
        }
      }

      updatePartsList();
    };
  }

  // ============================================================
  // СПИСЪК ДЕТАЙЛИ
  // ============================================================

  function updatePartsList() {
    if (!partsList) return;

    partsList.innerHTML = '';

    parts.forEach((p, i) => {
      const tThick =
        p.edges.top
          ? p.edgeThick
          : 0;

      const bThick =
        p.edges.bottom
          ? p.edgeThick
          : 0;

      const lThick =
        p.edges.left
          ? p.edgeThick
          : 0;

      const rThick =
        p.edges.right
          ? p.edgeThick
          : 0;

      const netW =
        p.w -
        lThick -
        rThick;

      const netH =
        p.h -
        tThick -
        bThick;

      const eArr = [];

      if (p.edges.top) {
        eArr.push(
          `${netW} ✓`
        );
      }

      if (p.edges.bottom) {
        eArr.push(
          `${netW} ✓`
        );
      }

      if (p.edges.left) {
        eArr.push(
          `${netH} ✓`
        );
      }

      if (p.edges.right) {
        eArr.push(
          `${netH} ✓`
        );
      }

      const li =
        document.createElement('li');

      li.innerHTML = `
        <div>
          <b>#${i + 1}</b>:
          ${p.w} × ${p.h} мм |

          Плоскост:

          <span
            style="
              display:inline-block;
              width:12px;
              height:12px;
              background:${p.boardHex};
              border-radius:2px;
              vertical-align:middle;
              border:1px solid #718096;
            "
          ></span>

          <b>${p.boardName}</b> |

          Кант:

          <span
            style="
              display:inline-block;
              width:12px;
              height:12px;
              background:${p.edgeHex};
              border-radius:2px;
              vertical-align:middle;
              border:1px solid #718096;
            "
          ></span>

          <b>${p.edgeName}</b>

          ${
            p.edgeThick > 0
              ? `(${p.edgeThick} мм)`
              : ''
          }

          ${
            eArr.length
              ? `
                <span
                  style="
                    color:#2b6cb0;
                    font-weight:bold;
                    margin-left:6px;
                  "
                >
                  (Кантове:
                  ${eArr.join(', ')})
                </span>
              `
              : '<i>(Без кант)</i>'
          }

          ${
            !p.allowRotate
              ? ' 🔒'
              : ''
          }
        </div>

        <div>
          <button
            class="btn btn-sm"
            style="
              background:#3182ce;
              color:#fff;
              margin-right:4px;
            "
            onclick="editPart(${i})"
          >
            ✏️ Редакция
          </button>

          <button
            class="btn btn-sm"
            style="
              background:#e53e3e;
              color:#fff;
            "
            onclick="removePart(${i})"
          >
            ✖ Изтрий
          </button>
        </div>
      `;

      partsList.appendChild(li);
    });
  }

  // ============================================================
  // РЕДАКЦИЯ
  // ============================================================

  window.editPart = (i) => {
    const p =
      parts[i];

    editingIndex = i;

    partWidth.value =
      p.w;

    partHeight.value =
      p.h;

    partCount.value =
      1;

    if (partBoardSelect) {
      partBoardSelect.value =
        p.boardId;
    }

    if (partEdgeSelect) {
      partEdgeSelect.value =
        p.edgeId;
    }

    edgeTop.checked =
      p.edges.top;

    edgeBottom.checked =
      p.edges.bottom;

    edgeLeft.checked =
      p.edges.left;

    edgeRight.checked =
      p.edges.right;

    currentPartAllowRotate =
      p.allowRotate;

    if (partRotateToggle) {
      partRotateToggle.textContent =
        currentPartAllowRotate
          ? '🔓 Разрешено въртене'
          : '🔒 Забранено въртене';

      partRotateToggle.classList.toggle(
        'active',
        currentPartAllowRotate
      );
    }

    addPartBtn.textContent =
      '💾 Запази промените';

    addPartBtn.style.background =
      '#e53e3e';

    updatePartPreview();
  };

  // ============================================================
  // ИЗТРИВАНЕ НА ДЕТАЙЛ
  // ============================================================

  window.removePart = (i) => {
    if (editingIndex === i) {
      editingIndex = -1;

      addPartBtn.textContent =
        '➕ Добави детайл в списъка';

      addPartBtn.style.background =
        '';
    }

    parts.splice(i, 1);

    updatePartsList();
  };

  // ============================================================
  // ============================================================
  //
  // НОВ ФИНАНСОВО ОПТИМИЗИРАН GUILLOTINE PACKER
  //
  // ============================================================
  // ============================================================

  /*
    Основната разлика спрямо стария алгоритъм:

    1. Не приемаме първото намерено подреждане.
    2. Генерираме много различни редове на детайлите.
    3. За всеки ред правим пълен разкрой.
    4. Сравняваме резултатите.
    5. Първо минимизираме броя листове.
    6. После минимизираме отпадъка.
    7. После максимизираме използваемата площ.
    8. Свободните правоъгълници се сливат.
    9. Използваме различни guillotine split стратегии.
   10. Фладерът продължава да забранява въртенето.

    Това е все още guillotine packing, а не свободен
    MaxRects разкрой.
  */

  class FinancialGuillotinePacker {
    constructor(
      width,
      height,
      kerf = 0,
      fitMode = 'BAF',
      splitMode = 'MINAS'
    ) {
      this.width =
        width;

      this.height =
        height;

      this.kerf =
        Math.max(
          0,
          kerf || 0
        );

      this.fitMode =
        fitMode;

      this.splitMode =
        splitMode;

      this.freeRects = [
        {
          x: 0,
          y: 0,
          w: width,
          h: height
        }
      ];

      this.placed = [];
    }

    // ----------------------------------------------------------
    // Оценка на свободно място
    // ----------------------------------------------------------

    getFitScore(
      freeRect,
      w,
      h
    ) {
      const dw =
        freeRect.w - w;

      const dh =
        freeRect.h - h;

      if (
        dw < 0 ||
        dh < 0
      ) {
        return null;
      }

      const leftoverArea =
        freeRect.w *
        freeRect.h -
        w *
        h;

      const shortSide =
        Math.min(
          dw,
          dh
        );

      const longSide =
        Math.max(
          dw,
          dh
        );

      if (this.fitMode === 'BAF') {
        return [
          leftoverArea,
          shortSide,
          longSide
        ];
      }

      if (this.fitMode === 'BLSF') {
        return [
          longSide,
          shortSide,
          leftoverArea
        ];
      }

      // BSSF
      return [
        shortSide,
        longSide,
        leftoverArea
      ];
    }

    // ----------------------------------------------------------
    // Сравнение на score
    // ----------------------------------------------------------

    isScoreBetter(
      a,
      b
    ) {
      if (!a) return false;
      if (!b) return true;

      for (
        let i = 0;
        i < a.length;
        i++
      ) {
        if (
          Math.abs(
            a[i] - b[i]
          ) > 0.000001
        ) {
          return a[i] < b[i];
        }
      }

      return false;
    }

    // ----------------------------------------------------------
    // Намиране на най-доброто свободно място
    // ----------------------------------------------------------

    findBestFit(
      w,
      h,
      allowRotate,
      hasGrain
    ) {
      const wK =
        w + this.kerf;

      const hK =
        h + this.kerf;

      let best = null;

      for (
        let i = 0;
        i < this.freeRects.length;
        i++
      ) {
        const r =
          this.freeRects[i];

        // Нормална ориентация
        if (
          r.w >= wK &&
          r.h >= hK
        ) {
          const score =
            this.getFitScore(
              r,
              wK,
              hK
            );

          if (
            !best ||
            this.isScoreBetter(
              score,
              best.score
            )
          ) {
            best = {
              index: i,
              rotated: false,
              score
            };
          }
        }

        // Завъртане
        //
        // ВАЖНО:
        // При фладер въртенето остава забранено,
        // както беше в оригиналния код.
        //
        if (
          allowRotate &&
          !hasGrain &&
          r.w >= hK &&
          r.h >= wK
        ) {
          const score =
            this.getFitScore(
              r,
              hK,
              wK
            );

          if (
            !best ||
            this.isScoreBetter(
              score,
              best.score
            )
          ) {
            best = {
              index: i,
              rotated: true,
              score
            };
          }
        }
      }

      if (!best) {
        return null;
      }

      const target =
        this.freeRects[
          best.index
        ];

      const actualW =
        best.rotated
          ? h
          : w;

      const actualH =
        best.rotated
          ? w
          : h;

      const actualWK =
        actualW +
        this.kerf;

      const actualHK =
        actualH +
        this.kerf;

      return {
        freeIndex:
          best.index,

        target,

        x:
          target.x,

        y:
          target.y,

        w:
          actualW,

        h:
          actualH,

        rot:
          best.rotated,

        actualWK,
        actualHK
      };
    }

    // ----------------------------------------------------------
    // Guillotine split
    // ----------------------------------------------------------

    splitFreeRectangle(
      target,
      actualW,
      actualH
    ) {
      const remW =
        target.w -
        (actualW + this.kerf);

      const remH =
        target.h -
        (actualH + this.kerf);

      const placedWK =
        actualW +
        this.kerf;

      const placedHK =
        actualH +
        this.kerf;

      if (
        remW < 0 ||
        remH < 0
      ) {
        return;
      }

      const rightTop = {
        x:
          target.x +
          placedWK,

        y:
          target.y,

        w:
          remW,

        h:
          placedHK
      };

      const bottomFull = {
        x:
          target.x,

        y:
          target.y +
          placedHK,

        w:
          target.w,

        h:
          remH
      };

      const rightFull = {
        x:
          target.x +
          placedWK,

        y:
          target.y,

        w:
          remW,

        h:
          target.h
      };

      const bottomLeft = {
        x:
          target.x,

        y:
          target.y +
          placedHK,

        w:
          placedWK,

        h:
          remH
      };

      const valid = (r) =>
        r.w > 0.0001 &&
        r.h > 0.0001;

      let optionA = [];

      let optionB = [];

      if (valid(rightTop)) {
        optionA.push(
          rightTop
        );
      }

      if (valid(bottomFull)) {
        optionA.push(
          bottomFull
        );
      }

      if (valid(rightFull)) {
        optionB.push(
          rightFull
        );
      }

      if (valid(bottomLeft)) {
        optionB.push(
          bottomLeft
        );
      }

      const areaA =
        optionA.reduce(
          (sum, r) =>
            sum +
            r.w *
            r.h,
          0
        );

      const areaB =
        optionB.reduce(
          (sum, r) =>
            sum +
            r.w *
            r.h,
          0
        );

      let selected;

      switch (
        this.splitMode
      ) {
        case 'SAS': {
          selected =
            target.w <= target.h
              ? optionA
              : optionB;

          break;
        }

        case 'LAS': {
          selected =
            target.w >= target.h
              ? optionA
              : optionB;

          break;
        }

        case 'SLAS': {
          selected =
            remW <= remH
              ? optionA
              : optionB;

          break;
        }

        case 'LLAS': {
          selected =
            remW >= remH
              ? optionA
              : optionB;

          break;
        }

        case 'MAXAS': {
          selected =
            areaA >= areaB
              ? optionA
              : optionB;

          break;
        }

        case 'MINAS':
        default: {
          selected =
            areaA <= areaB
              ? optionA
              : optionB;

          break;
        }
      }

      selected.forEach(
        r => {
          if (
            r.w >= 1 &&
            r.h >= 1
          ) {
            this.freeRects.push(r);
          }
        }
      );
    }

    // ----------------------------------------------------------
    // Сливане на съседни свободни правоъгълници
    // ----------------------------------------------------------

    mergeFreeRectangles() {
      let changed = true;

      while (changed) {
        changed = false;

        outer:

        for (
          let i = 0;
          i < this.freeRects.length;
          i++
        ) {
          for (
            let j = i + 1;
            j < this.freeRects.length;
            j++
          ) {
            const a =
              this.freeRects[i];

            const b =
              this.freeRects[j];

            // Хоризонтално сливане
            if (
              Math.abs(
                a.y - b.y
              ) < 0.0001 &&
              Math.abs(
                a.h - b.h
              ) < 0.0001
            ) {
              if (
                Math.abs(
                  a.x + a.w - b.x
                ) < 0.0001
              ) {
                const merged = {
                  x: a.x,
                  y: a.y,
                  w: a.w + b.w,
                  h: a.h
                };

                this.freeRects.splice(
                  j,
                  1
                );

                this.freeRects[i] =
                  merged;

                changed = true;

                break outer;
              }

              if (
                Math.abs(
                  b.x + b.w - a.x
                ) < 0.0001
              ) {
                const merged = {
                  x: b.x,
                  y: b.y,
                  w: a.w + b.w,
                  h: a.h
                };

                this.freeRects.splice(
                  j,
                  1
                );

                this.freeRects[i] =
                  merged;

                changed = true;

                break outer;
              }
            }

            // Вертикално сливане
            if (
              Math.abs(
                a.x - b.x
              ) < 0.0001 &&
              Math.abs(
                a.w - b.w
              ) < 0.0001
            ) {
              if (
                Math.abs(
                  a.y + a.h - b.y
                ) < 0.0001
              ) {
                const merged = {
                  x: a.x,
                  y: a.y,
                  w: a.w,
                  h: a.h + b.h
                };

                this.freeRects.splice(
                  j,
                  1
                );

                this.freeRects[i] =
                  merged;

                changed = true;

                break outer;
              }

              if (
                Math.abs(
                  b.y + b.h - a.y
                ) < 0.0001
              ) {
                const merged = {
                  x: b.x,
                  y: b.y,
                  w: a.w,
                  h: a.h + b.h
                };

                this.freeRects.splice(
                  j,
                  1
                );

                this.freeRects[i] =
                  merged;

                changed = true;

                break outer;
              }
            }
          }
        }
      }

      // Премахваме правоъгълници,
      // които са изцяло вътре в други.
      for (
        let i =
          this.freeRects.length - 1;
        i >= 0;
        i--
      ) {
        const a =
          this.freeRects[i];

        let contained = false;

        for (
          let j = 0;
          j < this.freeRects.length;
          j++
        ) {
          if (i === j) continue;

          const b =
            this.freeRects[j];

          if (
            a.x >= b.x &&
            a.y >= b.y &&
            a.x + a.w <=
              b.x + b.w + 0.0001 &&
            a.y + a.h <=
              b.y + b.h + 0.0001
          ) {
            contained = true;
            break;
          }
        }

        if (contained) {
          this.freeRects.splice(
            i,
            1
          );
        }
      }

      // Най-добрите свободни правоъгълници
      // отпред.
      this.freeRects.sort(
        (a, b) => {
          const areaA =
            a.w * a.h;

          const areaB =
            b.w * b.h;

          if (
            areaB !== areaA
          ) {
            return areaB - areaA;
          }

          return (
            b.w -
            a.w
          );
        }
      );
    }

    // ----------------------------------------------------------
    // Поставяне
    // ----------------------------------------------------------

    place(
      w,
      h,
      allowRotate,
      hasGrain
    ) {
      const node =
        this.findBestFit(
          w,
          h,
          allowRotate,
          hasGrain
        );

      if (!node) {
        return null;
      }

      this.freeRects.splice(
        node.freeIndex,
        1
      );

      this.splitFreeRectangle(
        node.target,
        node.w,
        node.h
      );

      this.mergeFreeRectangles();

      const result = {
        x: node.x,
        y: node.y,
        w: node.w,
        h: node.h,
        rot: node.rot
      };

      this.placed.push(
        result
      );

      return result;
    }

    // ----------------------------------------------------------
    // Полезни остатъци
    // ----------------------------------------------------------

    getFreeOffcuts() {
      return this.freeRects
        .filter(
          r =>
            r.w >= 150 &&
            r.h >= 150
        )
        .map(r => ({
          ...r
        }));
    }
  }

  // ============================================================
  // ПОМОЩНИ ФУНКЦИИ ЗА ФИНАНСОВА ОПТИМИЗАЦИЯ
  // ============================================================

  function getNetPartSize(p) {
    const left =
      p.edges.left
        ? p.edgeThick
        : 0;

    const right =
      p.edges.right
        ? p.edgeThick
        : 0;

    const top =
      p.edges.top
        ? p.edgeThick
        : 0;

    const bottom =
      p.edges.bottom
        ? p.edgeThick
        : 0;

    return {
      w:
        p.w -
        left -
        right,

      h:
        p.h -
        top -
        bottom
    };
  }

  // ------------------------------------------------------------
  // Подреждане на детайлите
  // ------------------------------------------------------------

  function makeOrderVariants(list) {
    const variants = [];

    const clone =
      arr => [...arr];

    // Оригинален ред
    variants.push(
      clone(list)
    );

    // ----------------------------------------------------------
    // 1. Площ - най-големите първи
    // ----------------------------------------------------------

    variants.push(
      clone(list).sort(
        (a, b) => {
          const A =
            getNetPartSize(a);

          const B =
            getNetPartSize(b);

          return (
            B.w * B.h -
            A.w * A.h
          );
        }
      )
    );

    // ----------------------------------------------------------
    // 2. Максимална страна
    // ----------------------------------------------------------

    variants.push(
      clone(list).sort(
        (a, b) => {
          const A =
            getNetPartSize(a);

          const B =
            getNetPartSize(b);

          return (
            Math.max(
              B.w,
              B.h
            ) -
            Math.max(
              A.w,
              A.h
            )
          );
        }
      )
    );

    // ----------------------------------------------------------
    // 3. Височина
    // ----------------------------------------------------------

    variants.push(
      clone(list).sort(
        (a, b) => {
          const A =
            getNetPartSize(a);

          const B =
            getNetPartSize(b);

          if (
            B.h !== A.h
          ) {
            return B.h - A.h;
          }

          return B.w - A.w;
        }
      )
    );

    // ----------------------------------------------------------
    // 4. Ширина
    // ----------------------------------------------------------

    variants.push(
      clone(list).sort(
        (a, b) => {
          const A =
            getNetPartSize(a);

          const B =
            getNetPartSize(b);

          if (
            B.w !== A.w
          ) {
            return B.w - A.w;
          }

          return B.h - A.h;
        }
      )
    );

    // ----------------------------------------------------------
    // 5. Периметър
    // ----------------------------------------------------------

    variants.push(
      clone(list).sort(
        (a, b) => {
          const A =
            getNetPartSize(a);

          const B =
            getNetPartSize(b);

          return (
            2 * (B.w + B.h) -
            2 * (A.w + A.h)
          );
        }
      )
    );

    // ----------------------------------------------------------
    // 6. По-тесни детайли първо
    // ----------------------------------------------------------

    variants.push(
      clone(list).sort(
        (a, b) => {
          const A =
            getNetPartSize(a);

          const B =
            getNetPartSize(b);

          const arA =
            Math.min(
              A.w,
              A.h
            ) /
            Math.max(
              A.w,
              A.h
            );

          const arB =
            Math.min(
              B.w,
              B.h
            ) /
            Math.max(
              B.w,
              B.h
            );

          return arA - arB;
        }
      )
    );

    // ----------------------------------------------------------
    // 7. Близки височини
    // ----------------------------------------------------------

    variants.push(
      clone(list).sort(
        (a, b) => {
          const A =
            getNetPartSize(a);

          const B =
            getNetPartSize(b);

          if (
            B.h !== A.h
          ) {
            return B.h - A.h;
          }

          return (
            Math.abs(
              B.w - B.h
            ) -
            Math.abs(
              A.w - A.h
            )
          );
        }
      )
    );

    // ----------------------------------------------------------
    // 8. Близки ширини
    // ----------------------------------------------------------

    variants.push(
      clone(list).sort(
        (a, b) => {
          const A =
            getNetPartSize(a);

          const B =
            getNetPartSize(b);

          if (
            B.w !== A.w
          ) {
            return B.w - A.w;
          }

          return (
            Math.abs(
              B.w - B.h
            ) -
            Math.abs(
              A.w - A.h
            )
          );
        }
      )
    );

    // ----------------------------------------------------------
    // 9. Първо големи правоъгълни
    // ----------------------------------------------------------

    variants.push(
      clone(list).sort(
        (a, b) => {
          const A =
            getNetPartSize(a);

          const B =
            getNetPartSize(b);

          const scoreA =
            Math.max(A.w, A.h) +
            Math.min(A.w, A.h) * 0.25;

          const scoreB =
            Math.max(B.w, B.h) +
            Math.min(B.w, B.h) * 0.25;

          return (
            scoreB -
            scoreA
          );
        }
      )
    );

    // ----------------------------------------------------------
    // Детерминирани псевдо-случайни варианти
    //
    // Това е важно.
    //
    // Понякога два почти еднакви детайла,
    // разменени в началото, дават напълно
    // различна конфигурация на целия лист.
    // ----------------------------------------------------------

    function seededRandom(seed) {
      let s =
        seed >>> 0;

      return () => {
        s =
          (s * 1664525 + 1013904223)
          >>> 0;

        return s / 4294967296;
      };
    }

    const randomVariants =
      Math.min(
        36,
        Math.max(
          18,
          Math.ceil(
            list.length / 3
          )
        )
      );

    for (
      let v = 0;
      v < randomVariants;
      v++
    ) {
      const arr =
        clone(list);

      const rnd =
        seededRandom(
          7919 +
          v * 104729 +
          list.length * 17
        );

      // Fisher-Yates
      for (
        let i =
          arr.length - 1;
        i > 0;
        i--
      ) {
        const j =
          Math.floor(
            rnd() *
            (i + 1)
          );

        [
          arr[i],
          arr[j]
        ] = [
          arr[j],
          arr[i]
        ];
      }

      variants.push(arr);
    }

    return variants;
  }

  // ============================================================
  // ОПАКОВАНЕ НА ЕДИН КАНДИДАТ
  // ============================================================

  function packCandidate(
    orderedList,
    board,
    kerf,
    fitMode,
    splitMode
  ) {
    let remaining =
      [...orderedList];

    const sheets = [];

    let safety = 0;

    while (
      remaining.length > 0 &&
      safety < 10000
    ) {
      safety++;

      const packer =
        new FinancialGuillotinePacker(
          board.w,
          board.h,
          kerf,
          fitMode,
          splitMode
        );

      const placedParts = [];

      const notPlaced = [];

      let placedSomething =
        false;

      /*
        Тук има много важна промяна:

        Не минаваме само веднъж и не казваме:
        "ако този детайл не влиза, отива на следващия лист".

        Вместо това обхождаме останалите детайли
        и поставяме всеки, който намери място.

        Това позволява големите свободни пространства
        да бъдат запълнени от подходящи по размер детайли.
      */

      for (
        const p of remaining
      ) {
        const net =
          getNetPartSize(p);

        const node =
          packer.place(
            net.w,
            net.h,
            p.allowRotate,
            board.hasGrain
          );

        if (node) {
          placedSomething =
            true;

          placedParts.push({
            ...p,

            netW:
              node.w,

            netH:
              node.h,

            rot:
              node.rot,

            x:
              node.x,

            y:
              node.y
          });
        } else {
          notPlaced.push(p);
        }
      }

      /*
        За да не получим безкраен цикъл,
        ако даден детайл физически не може
        да влезе в листа.
      */

      if (!placedSomething) {
        console.warn(
          'Детайлът не може да бъде поставен:',
          remaining[0]
        );

        return null;
      }

      sheets.push({
        packer,
        placedParts,
        offcuts:
          packer.getFreeOffcuts()
      });

      remaining =
        notPlaced;
    }

    if (
      remaining.length > 0
    ) {
      return null;
    }

    // ----------------------------------------------------------
    // Изчисляване на качеството
    // ----------------------------------------------------------

    const fullSheetArea =
      board.w *
      board.h;

    let totalUsedArea = 0;

    let totalOffcutArea = 0;

    sheets.forEach(
      sheet => {
        sheet.placedParts.forEach(
          p => {
            const net =
              getNetPartSize(p);

            totalUsedArea +=
              net.w *
              net.h;
          }
        );

        sheet.offcuts.forEach(
          o => {
            totalOffcutArea +=
              o.w *
              o.h;
          }
        );
      }
    );

    const totalArea =
      sheets.length *
      fullSheetArea;

    const wasteArea =
      Math.max(
        0,
        totalArea -
        totalUsedArea
      );

    const efficiency =
      totalArea > 0
        ? totalUsedArea /
          totalArea
        : 0;

    /*
      Финансовият приоритет е:

      1. Брой листове
      2. Отпадък
      3. Полезна площ
    */

    return {
      sheets,

      sheetCount:
        sheets.length,

      totalUsedArea,

      totalArea,

      wasteArea,

      efficiency,

      offcutArea:
        totalOffcutArea,

      score: [
        sheets.length,
        wasteArea,
        -efficiency
      ]
    };
  }

  // ============================================================
  // СРАВНЯВАНЕ НА КАНДИДАТИ
  // ============================================================

  function isCandidateBetter(
    candidate,
    best
  ) {
    if (!candidate) {
      return false;
    }

    if (!best) {
      return true;
    }

    /*
      ПЪРВО:
      по-малко листове.
    */

    if (
      candidate.sheetCount !==
      best.sheetCount
    ) {
      return (
        candidate.sheetCount <
        best.sheetCount
      );
    }

    /*
      ВТОРО:
      по-малко отпадък.
    */

    if (
      Math.abs(
        candidate.wasteArea -
        best.wasteArea
      ) > 0.0001
    ) {
      return (
        candidate.wasteArea <
        best.wasteArea
      );
    }

    /*
      ТРЕТО:
      по-добър рандеман.
    */

    return (
      candidate.efficiency >
      best.efficiency
    );
  }

  // ============================================================
  // ПЪЛНА ФИНАНСОВА ОПТИМИЗАЦИЯ ЗА ЕДНА ПЛОСКОСТ
  // ============================================================

  function optimizeBoardCutting(
    list,
    board,
    kerf
  ) {
    const variants =
      makeOrderVariants(
        list
      );

    let best = null;

    /*
      Пробваме различни комбинации:

      BAF  = Best Area Fit
      BSSF = Best Short Side Fit
      BLSF = Best Long Side Fit

      плюс различни guillotine split правила.
    */

    const fitModes = [
      'BAF',
      'BSSF',
      'BLSF'
    ];

    const splitModes = [
      'MINAS',
      'MAXAS',
      'SLAS',
      'LLAS',
      'SAS',
      'LAS'
    ];

    let attempts = 0;

    /*
      За много голям брой детайли ограничаваме
      комбинациите, за да не замръзва браузърът.
    */

    const maxVariants =
      list.length > 120
        ? Math.min(
            variants.length,
            28
          )
        : variants.length;

    for (
      let v = 0;
      v < maxVariants;
      v++
    ) {
      const order =
        variants[v];

      for (
        let f = 0;
        f < fitModes.length;
        f++
      ) {
        for (
          let s = 0;
          s < splitModes.length;
          s++
        ) {
          attempts++;

          const result =
            packCandidate(
              order,
              board,
              kerf,
              fitModes[f],
              splitModes[s]
            );

          if (
            isCandidateBetter(
              result,
              best
            )
          ) {
            best = result;
          }

          /*
            Ако вече сме намерили решение
            с минимално теоретично възможния
            брой листове според площта,
            не е необходимо да търсим още
            по-малко листове.

            Продължаваме само ако има шанс
            за по-малък отпадък.
          */

          if (
            best &&
            best.sheetCount === 1
          ) {
            // Един лист е абсолютният минимум.
            // Все пак пробваме останалите варианти,
            // защото може да подобрим отпадъка.
          }
        }
      }
    }

    if (best) {
      best.attempts =
        attempts;
    }

    return best;
  }

  // ============================================================
  // СТАРТ НА РАЗКРОЯ
  // ============================================================

  const runBtn =
    document.getElementById(
      'runCutting'
    );

  if (runBtn) {
    runBtn.onclick = (e) => {
      e.preventDefault();

      const container =
        document.getElementById(
          'sheetsContainer'
        );

      container.innerHTML = '';

      if (
        parts.length === 0
      ) {
        alert(
          'Моля, добавете детайли!'
        );

        return;
      }

      const kerf =
        +document.getElementById(
          'kerf'
        ).value || 0;

      // --------------------------------------------------------
      // ГРУПИРАНЕ ПО ПЛОСКОСТ
      // --------------------------------------------------------

      const grouped = {};

      parts.forEach(
        p => {
          if (
            !grouped[p.boardId]
          ) {
            grouped[p.boardId] = [];
          }

          grouped[p.boardId].push(
            p
          );
        }
      );

      let sheetGlobalIndex = 1;

      let totalCostProject = 0;

      const boardCountSummary = {};

      const edgeMetersSummary = {};

      // ========================================================
      // ВСЕКИ ВИД ПЛОСКОСТ
      // ========================================================

      for (
        let bId in grouped
      ) {
        const list =
          [...grouped[bId]];

        const board =
          boardTypes.find(
            b => b.id === bId
          );

        if (!board) {
          continue;
        }

        // ------------------------------------------------------
        // ФИНАНСОВА ОПТИМИЗАЦИЯ
        // ------------------------------------------------------

        const optimized =
          optimizeBoardCutting(
            list,
            board,
            kerf
          );

        if (!optimized) {
          alert(
            `Не може да бъде намерен разкрой за плоскост "${board.name}".`
          );

          continue;
        }

        // ------------------------------------------------------
        // РИСУВАНЕ НА ВСЕКИ ЛИСТ
        // ------------------------------------------------------

        optimized.sheets.forEach(
          sheetData => {
            const packer =
              sheetData.packer;

            const placedParts =
              sheetData.placedParts;

            const offcuts =
              sheetData.offcuts;

            const sheetBlock =
              document.createElement(
                'div'
              );

            sheetBlock.className =
              'sheet-block';

            const canvasWrapper =
              document.createElement(
                'div'
              );

            canvasWrapper.className =
              'sheet-canvas-wrapper';

            const canvas =
              document.createElement(
                'canvas'
              );

            const scale =
              Math.min(
                950 / board.w,
                550 / board.h
              );

            canvas.width =
              Math.round(
                board.w *
                scale
              );

            canvas.height =
              Math.round(
                board.h *
                scale
              );

            const ctx =
              canvas.getContext(
                '2d'
              );

            // --------------------------------------------------
            // ФОН НА ЛИСТА
            // --------------------------------------------------

            if (
              board.hasGrain
            ) {
              drawWoodGrain(
                ctx,
                0,
                0,
                canvas.width,
                canvas.height,
                true,
                board.hex
              );
            } else {
              ctx.fillStyle =
                board.hex ||
                '#ffffff';

              ctx.fillRect(
                0,
                0,
                canvas.width,
                canvas.height
              );
            }

            // --------------------------------------------------
            // ИЗПОЛЗВАНА ПЛОЩ
            // --------------------------------------------------

            let usedAreaM2 = 0;

            // --------------------------------------------------
            // ДЕТАЙЛИ
            // --------------------------------------------------

            placedParts.forEach(
              p => {
                const placedW =
                  p.netW;

                const placedH =
                  p.netH;

                const rx =
                  p.x *
                  scale;

                const ry =
                  p.y *
                  scale;

                const rw =
                  placedW *
                  scale;

                const rh =
                  placedH *
                  scale;

                // ----------------------------------------------
                // ДЪРВО
                // ----------------------------------------------

                if (
                  board.hasGrain
                ) {
                  drawWoodGrain(
                    ctx,
                    rx,
                    ry,
                    rw,
                    rh,
                    !p.rot,
                    board.hex
                  );
                } else {
                  ctx.fillStyle =
                    board.hex;

                  ctx.fillRect(
                    rx,
                    ry,
                    rw,
                    rh
                  );
                }

                // ----------------------------------------------
                // КОНТУР
                // ----------------------------------------------

                ctx.strokeStyle =
                  '#2d3748';

                ctx.lineWidth =
                  1;

                ctx.strokeRect(
                  rx,
                  ry,
                  rw,
                  rh
                );

                // ----------------------------------------------
                // КАНТОВЕ
                // ----------------------------------------------

                const topE =
                  p.rot
                    ? p.edges.left
                    : p.edges.top;

                const bottomE =
                  p.rot
                    ? p.edges.right
                    : p.edges.bottom;

                const leftE =
                  p.rot
                    ? p.edges.top
                    : p.edges.left;

                const rightE =
                  p.rot
                    ? p.edges.bottom
                    : p.edges.right;

                if (
                  p.edgeThick > 0
                ) {
                  const inset = 5;

                  const lineThick = 4;

                  const cornerGap = 8;

                  if (topE) {
                    drawEdgeLine(
                      ctx,
                      rx + cornerGap,
                      ry + inset,
                      rw -
                        cornerGap * 2,
                      lineThick,
                      p.edgeHex
                    );
                  }

                  if (bottomE) {
                    drawEdgeLine(
                      ctx,
                      rx + cornerGap,
                      ry +
                        rh -
                        lineThick -
                        inset,
                      rw -
                        cornerGap * 2,
                      lineThick,
                      p.edgeHex
                    );
                  }

                  if (leftE) {
                    drawEdgeLine(
                      ctx,
                      rx + inset,
                      ry + cornerGap,
                      lineThick,
                      rh -
                        cornerGap * 2,
                      p.edgeHex
                    );
                  }

                  if (rightE) {
                    drawEdgeLine(
                      ctx,
                      rx +
                        rw -
                        lineThick -
                        inset,
                      ry + cornerGap,
                      lineThick,
                      rh -
                        cornerGap * 2,
                      p.edgeHex
                    );
                  }
                }

                // ----------------------------------------------
                // ТЕКСТ
                // ----------------------------------------------

                ctx.fillStyle =
                  '#000';

                ctx.font =
                  'bold 11px sans-serif';

                ctx.textAlign =
                  'center';

                ctx.textBaseline =
                  'middle';

                ctx.fillText(
                  `${placedW}×${placedH}${
                    p.rot
                      ? ' ↻'
                      : ''
                  }`,
                  rx +
                    rw / 2,
                  ry +
                    rh / 2
                );

                // ----------------------------------------------
                // ПЛОЩ
                // ----------------------------------------------

                const net =
                  getNetPartSize(
                    p
                  );

                usedAreaM2 +=
                  (
                    net.w *
                    net.h
                  ) /
                  1000000;

                // ----------------------------------------------
                // КАНТ МЕТРИ
                // ----------------------------------------------

                let edgeMm = 0;

                if (
                  p.edges.top
                ) {
                  edgeMm +=
                    p.w;
                }

                if (
                  p.edges.bottom
                ) {
                  edgeMm +=
                    p.w;
                }

                if (
                  p.edges.left
                ) {
                  edgeMm +=
                    p.h;
                }

                if (
                  p.edges.right
                ) {
                  edgeMm +=
                    p.h;
                }

                const edgeM =
                  edgeMm / 1000;

                edgeMetersSummary[
                  p.edgeName
                ] =
                  (
                    edgeMetersSummary[
                      p.edgeName
                    ] || 0
                  ) + edgeM;
              }
            );

            // --------------------------------------------------
            // ОСТАТЪЦИ
            // --------------------------------------------------

            offcuts.forEach(
              o => {
                ctx.fillStyle =
                  'rgba(0, 128, 0, 0.08)';

                ctx.fillRect(
                  o.x * scale,
                  o.y * scale,
                  o.w * scale,
                  o.h * scale
                );

                ctx.strokeStyle =
                  'rgba(0, 128, 0, 0.4)';

                ctx.setLineDash([
                  4,
                  4
                ]);

                ctx.strokeRect(
                  o.x * scale,
                  o.y * scale,
                  o.w * scale,
                  o.h * scale
                );

                ctx.setLineDash([]);

                ctx.fillStyle =
                  '#276749';

                ctx.font =
                  '10px sans-serif';

                ctx.textAlign =
                  'center';

                ctx.textBaseline =
                  'middle';

                ctx.fillText(
                  `${Math.round(
                    o.w
                  )}×${Math.round(
                    o.h
                  )}`,
                  (
                    o.x +
                    o.w / 2
                  ) * scale,
                  (
                    o.y +
                    o.h / 2
                  ) * scale
                );
              }
            );

            // --------------------------------------------------
            // РАНДЕМАН
            // --------------------------------------------------

            const fullSheetAreaM2 =
              (
                board.w *
                board.h
              ) /
              1000000;

            const efficiency =
              (
                usedAreaM2 /
                fullSheetAreaM2
              ) *
              100;

            const wastePercent =
              100 -
              efficiency;

            // --------------------------------------------------
            // ЗАГЛАВИЕ
            // --------------------------------------------------

            const title =
              document.createElement(
                'h3'
              );

            title.innerHTML = `
              Лист #${sheetGlobalIndex}
              —
              Материал:

              <span
                style="
                  display:inline-block;
                  width:14px;
                  height:14px;
                  background:${board.hex};
                  border-radius:3px;
                  vertical-align:middle;
                  border:1px solid #718096;
                "
              ></span>

              <b>${board.name}</b>

              (${board.w} × ${board.h} мм)

              <div
                style="
                  font-size:0.9rem;
                  color:#4a5568;
                  margin-top:4px;
                "
              >
                📊 Рандеман:

                <b
                  style="
                    color:${
                      efficiency > 80
                        ? '#276749'
                        : '#c53030'
                    }
                  "
                >
                  ${efficiency.toFixed(1)}%
                </b>

                (${usedAreaM2.toFixed(2)} m²)

                |

                🗑️ Фира:

                <b>
                  ${wastePercent.toFixed(1)}%
                </b>
              </div>
            `;

            sheetBlock.appendChild(
              title
            );

            // --------------------------------------------------
            // CANVAS
            // --------------------------------------------------

            canvasWrapper.appendChild(
              canvas
            );

            sheetBlock.appendChild(
              canvasWrapper
            );

            // --------------------------------------------------
            // ТАБЛИЦА
            // --------------------------------------------------

            let tableHTML = `
              <table
                class="data-table"
                style="margin-top:10px;"
              >
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Размер (Бруто)</th>
                    <th>Чист Размер (Нето)</th>
                    <th>Вид Кант (Дебелина)</th>
                    <th>
                      Кантирани страни
                      (Размер ✓)
                    </th>
                  </tr>
                </thead>

                <tbody>
            `;

            placedParts.forEach(
              (pt, idx) => {
                const topEdged =
                  pt.rot
                    ? pt.edges.left
                    : pt.edges.top;

                const bottomEdged =
                  pt.rot
                    ? pt.edges.right
                    : pt.edges.bottom;

                const leftEdged =
                  pt.rot
                    ? pt.edges.top
                    : pt.edges.left;

                const rightEdged =
                  pt.rot
                    ? pt.edges.bottom
                    : pt.edges.right;

                const edgeStrings =
                  [];

                if (
                  topEdged
                ) {
                  edgeStrings.push(
                    `${pt.netW} мм ✓`
                  );
                }

                if (
                  bottomEdged
                ) {
                  edgeStrings.push(
                    `${pt.netW} мм ✓`
                  );
                }

                if (
                  leftEdged
                ) {
                  edgeStrings.push(
                    `${pt.netH} мм ✓`
                  );
                }

                if (
                  rightEdged
                ) {
                  edgeStrings.push(
                    `${pt.netH} мм ✓`
                  );
                }

                tableHTML += `
                  <tr>
                    <td>
                      <b>
                        ${idx + 1}
                      </b>
                    </td>

                    <td>
                      ${pt.w} × ${pt.h} мм
                    </td>

                    <td>
                      <b>
                        ${pt.netW} × ${pt.netH} мм

                        ${
                          pt.rot
                            ? `
                              <span
                                style="
                                  color:#e53e3e;
                                  font-size:1.2rem;
                                  font-weight:bold;
                                "
                                title="Завъртян детайл"
                              >
                                ↻
                              </span>
                            `
                            : ''
                        }
                      </b>
                    </td>

                    <td>
                      <span
                        style="
                          display:inline-block;
                          width:12px;
                          height:12px;
                          background:${pt.edgeHex};
                          border-radius:2px;
                          vertical-align:middle;
                          margin-right:4px;
                          border:1px solid #718096;
                        "
                      ></span>

                      <b>
                        ${pt.edgeName}
                      </b>

                      ${
                        pt.edgeThick > 0
                          ? `
                            <span
                              style="
                                color:#2b6cb0;
                                font-weight:bold;
                              "
                            >
                              (${pt.edgeThick} мм)
                            </span>
                          `
                          : ''
                      }
                    </td>

                    <td>
                      ${
                        edgeStrings.length
                          ? edgeStrings.join(
                              ', '
                            )
                          : '<i>Няма кант</i>'
                      }
                    </td>
                  </tr>
                `;
              }
            );

            tableHTML += `
                </tbody>
              </table>
            `;

            const tDiv =
              document.createElement(
                'div'
              );

            tDiv.innerHTML =
              tableHTML;

            sheetBlock.appendChild(
              tDiv
            );

            container.appendChild(
              sheetBlock
            );

            // --------------------------------------------------
            // ОБОБЩЕНИЕ
            // --------------------------------------------------

            boardCountSummary[
              board.name
            ] =
              (
                boardCountSummary[
                  board.name
                ] || 0
              ) + 1;

            sheetGlobalIndex++;
          }
        );
      }

      // ========================================================
      // ФИНАНСОВ ОТЧЕТ
      // ========================================================

      const totalPartsCount =
        parts.length;

      let costHTML = `
        <h3
          style="
            color:#2b6cb0;
            margin-bottom:12px;
          "
        >
          💶 Подробна финансова спецификация
        </h3>
      `;

      costHTML += `
        <div
          style="
            background:#fff;
            padding:10px;
            border-radius:4px;
            margin-bottom:12px;
            border:1px solid #bee3f8;
          "
        >
          📊

          <b>
            Общ брой детайли за рязане:
          </b>

          <span
            style="
              font-size:1.1em;
              color:#2c5282;
            "
          >
            <b>
              ${totalPartsCount} бр.
            </b>
          </span>
        </div>
      `;

      costHTML += `
        <ul
          style="
            line-height:1.8;
            list-style:none;
            padding-left:0;
          "
        >
      `;

      // --------------------------------------------------------
      // ПЛОСКОСТИ
      // --------------------------------------------------------

      for (
        let bName in boardCountSummary
      ) {
        const count =
          boardCountSummary[
            bName
          ];

        const bObj =
          boardTypes.find(
            b => b.name === bName
          );

        const price =
          bObj
            ? bObj.price
            : 55;

        const totalB =
          count *
          price;

        totalCostProject +=
          totalB;

        costHTML += `
          <li>
            Плоскост
            <b>${bName}</b>:

            ${count} бр. листа

            ×

            €${price.toFixed(2)}

            =

            <b>
              €${totalB.toFixed(2)}
            </b>
          </li>
        `;
      }

      // --------------------------------------------------------
      // КАНТОВЕ
      // --------------------------------------------------------

      for (
        let eName in edgeMetersSummary
      ) {
        const netM =
          edgeMetersSummary[
            eName
          ];

        const grossM =
          netM * 1.10;

        const eObj =
          edgeTypes.find(
            e => e.name === eName
          );

        const price =
          eObj
            ? eObj.pricePerM
            : 0.5;

        const totalE =
          grossM *
          price;

        totalCostProject +=
          totalE;

        costHTML += `
          <li>
            Кант
            <b>${eName}</b>:

            Чисти
            <b>
              ${netM.toFixed(2)} м
            </b>

            (с +10% аванс:
            <b>
              ${grossM.toFixed(2)} м
            </b>)

            ×

            €${price.toFixed(2)}/м

            =

            <b>
              €${totalE.toFixed(2)}
            </b>
          </li>
        `;
      }

      costHTML += `
        </ul>

        <h3
          style="
            color:#2f855a;
            margin-top:12px;
            border-top:1px solid #cbd5e0;
            padding-top:8px;
          "
        >
          ОБЩО ЗА МАТЕРИАЛИ:

          €${totalCostProject.toFixed(2)}
        </h3>
      `;

      const summaryBlock =
        document.createElement(
          'div'
        );

      summaryBlock.className =
        'sheet-block';

      summaryBlock.style.cssText =
        `
          border:2px solid #3182ce;
          background:#ebf8ff;
        `;

      summaryBlock.innerHTML =
        costHTML;

      container.appendChild(
        summaryBlock
      );
    };
  }

  // ============================================================
  // ПЕЧАТ
  // ============================================================

  const exportBtn =
    document.getElementById(
      'exportPDF'
    );

  if (exportBtn) {
    exportBtn.onclick = (e) => {
      e.preventDefault();

      window.print();
    };
  }

  // ============================================================
  // СТАРТ
  // ============================================================

  renderMasterData();
};
