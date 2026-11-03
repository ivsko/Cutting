document.addEventListener('DOMContentLoaded', () => {
  const furnaceBtns = document.querySelectorAll('.furnace-btn');
  const targetMeltWeight = document.getElementById('targetMeltWeight');
  const targetWeightDisplay = document.getElementById('targetWeightDisplay');
  const targetGradeSelect = document.getElementById('targetGrade');
  const swampGradeSelect = document.getElementById('swampGrade'); 

  // Елементи за персонализирано блато
  const toggleCustomSwampBtn = document.getElementById('toggleCustomSwampBtn');
  const customSwampContainer = document.getElementById('customSwampContainer');
  const useCustomSwampCheckbox = document.getElementById('useCustomSwamp');
  const customSwampC = document.getElementById('customSwampC');
  const customSwampSi = document.getElementById('customSwampSi');
  const customSwampMn = document.getElementById('customSwampMn');
  const customSwampCu = document.getElementById('customSwampCu');

  // Бутон за принтиране
  const printReportBtn = document.getElementById('printReportBtn');

  const swampWeightInput = document.getElementById('swampWeight');
  const tableSwampText = document.getElementById('tableSwampText');

  const totalWeightDisplay = document.getElementById('totalWeightDisplay');
  const scaleStatus = document.getElementById('scaleStatus');
  const calculateBtn = document.getElementById('calculateBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');

  const scrapInput = document.getElementById('scrapWeightInput');
  const returnGjsInput = document.getElementById('returnGjsWeight');
  const returnGjlInput = document.getElementById('returnGjlWeight');
  const pigIronInput = document.getElementById('pigIronWeight');
  const cInput = document.getElementById('cWeightInput');
  const fesiInput = document.getElementById('fesiWeightInput');
  const femnInput = document.getElementById('femnWeightInput');
  const cuInput = document.getElementById('cuWeightInput');

  const valC = document.getElementById('valC');
  const valSi = document.getElementById('valSi');
  const valMn = document.getElementById('valMn');
  const valCu = document.getElementById('valCu');

  const targetC = document.getElementById('targetC');
  const targetSi = document.getElementById('targetSi');
  const targetMn = document.getElementById('targetMn');
  const targetCu = document.getElementById('targetCu');

  const operatorAdvice = document.getElementById('operatorAdvice');
  const adviceBoxContainer = operatorAdvice ? operatorAdvice.closest('.advice-box') : null;

  const pctSwamp = document.getElementById('pctSwamp');
  const pctScrap = document.getElementById('pctScrap');
  const pctReturnGjs = document.getElementById('pctReturnGjs');
  const pctReturnGjl = document.getElementById('pctReturnGjl');
  const pctPigIron = document.getElementById('pctPigIron');
  const pctC = document.getElementById('pctC');
  const pctFeSi = document.getElementById('pctFeSi');
  const pctFeMn = document.getElementById('pctFeMn');
  const pctCu = document.getElementById('pctCu');

  const labCInput = document.getElementById('labC');
  const labSiInput = document.getElementById('labSi');
  const labMnInput = document.getElementById('labMn');
  const labCuInput = document.getElementById('labCu');

  const allInputs = [
    swampWeightInput, scrapInput, returnGjsInput, returnGjlInput, 
    pigIronInput, cInput, fesiInput, femnInput, cuInput
  ];

  const labInputs = [labCInput, labSiInput, labMnInput, labCuInput];

  let selectedFurnaceName = "Пещ 1";

  // Универсална функция за оцветяване с новите толеранси
  function updateChemCardStyle(element, currentVal, targetVal, tolerance) {
    if (!element) return;
    const card = element.closest('.chem-card') || element.parentElement;

    element.classList.remove('text-success', 'text-danger', 'text-warning');
    if (card) {
      card.style.borderColor = '';
      card.style.backgroundColor = '';
    }

    const diff = Number(currentVal.toFixed(2)) - targetVal;

    if (Math.abs(diff) <= tolerance + 1e-9) {
      element.style.color = '#34d399';
      if (card) {
        card.style.borderColor = '#34d399';
        card.style.backgroundColor = 'rgba(52, 211, 153, 0.05)';
      }
    } else if (diff < 0) {
      element.style.color = '#fbbf24';
      if (card) {
        card.style.borderColor = '#fbbf24';
        card.style.backgroundColor = 'rgba(251, 191, 36, 0.05)';
      }
    } else {
      element.style.color = '#f87171';
      if (card) {
        card.style.borderColor = '#f87171';
        card.style.backgroundColor = 'rgba(239, 68, 68, 0.05)';
      }
    }
  }

  function setupInputFocusBlur(inputsArray) {
    inputsArray.forEach(input => {
      if (input) {
        input.addEventListener('focus', function() {
          if (this.value === '0') {
            this.value = '';
          }
        });

        input.addEventListener('blur', function() {
          if (this.value.trim() === '') {
            this.value = '0';
            if (inputsArray === allInputs) {
              updateScaleDynamic();
            }
          }
        });
      }
    });
  }

  setupInputFocusBlur(allInputs);
  setupInputFocusBlur(labInputs);

  if (toggleCustomSwampBtn && customSwampContainer) {
    toggleCustomSwampBtn.addEventListener('click', () => {
      if (customSwampContainer.style.display === 'none' || !customSwampContainer.style.display) {
        customSwampContainer.style.display = 'block';
        toggleCustomSwampBtn.textContent = '⚙️️ Скрий промяната на блатото';
      } else {
        customSwampContainer.style.display = 'none';
        toggleCustomSwampBtn.textContent = '⚙️ Промени състава на блатото';
      }
    });
  }

  // 1. ИЗБОР НА ПЕЩ
  furnaceBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      furnaceBtns.forEach(b => b.classList.remove('active-furnace'));
      btn.classList.add('active-furnace');
      const capacity = btn.getAttribute('data-capacity');
      if (targetMeltWeight) targetMeltWeight.value = capacity;
      if (targetWeightDisplay) targetWeightDisplay.textContent = capacity;
      selectedFurnaceName = btn.textContent.trim();
      updateScaleDynamic();
    });
  });

  // --- 2. СМЯНА НА ЦЕЛЕВА МАРКА И ИНИЦИАЛИЗАЦИЯ ---
  if (targetGradeSelect) {
    targetGradeSelect.addEventListener('change', () => {
      updateTargetsDisplay();
    });
  }

  function updateTargetsDisplay() {
    if (!targetGradeSelect || typeof TARGET_GRADES === 'undefined') return;
    const grade = targetGradeSelect.value;
    const targets = TARGET_GRADES[grade] || TARGET_GRADES['gjs500'];

    if (targetC && targets.C !== undefined) targetC.textContent = `${targets.C.toFixed(2)}%`;
    if (targetSi && targets.Si !== undefined) targetSi.textContent = `${targets.Si.toFixed(2)}%`;
    if (targetMn && targets.Mn !== undefined) targetMn.textContent = `${targets.Mn.toFixed(2)}%`;
    if (targetCu && targets.Cu !== undefined) targetCu.textContent = `${targets.Cu.toFixed(2)}%`;
  }

  updateTargetsDisplay();

  function getActiveSwampComposition() {
    if (useCustomSwampCheckbox && useCustomSwampCheckbox.checked) {
      return {
        C: parseFloat(customSwampC?.value) || 0,
        Si: parseFloat(customSwampSi?.value) || 0,
        Mn: parseFloat(customSwampMn?.value) || 0,
        Cu: parseFloat(customSwampCu?.value) || 0
      };
    } else {
      const swampGradeVal = swampGradeSelect ? swampGradeSelect.value : 'gjs500';
      return (typeof TARGET_GRADES !== 'undefined' && TARGET_GRADES[swampGradeVal]) 
        ? TARGET_GRADES[swampGradeVal] 
        : { C: 0, Si: 0, Mn: 0, Cu: 0 };
    }
  }

  // 3. ДИНАМИЧЕН КАНТАР
  function updateScaleDynamic() {
    const targetW = parseFloat(targetMeltWeight?.value) || 10000;

    const swampW = parseFloat(swampWeightInput?.value) || 0;
    const scrapW = parseFloat(scrapInput?.value) || 0;
    const retGjsW = parseFloat(returnGjsInput?.value) || 0;
    const retGjlW = parseFloat(returnGjlInput?.value) || 0;
    const pigW = parseFloat(pigIronInput?.value) || 0;
    const cW = parseFloat(cInput?.value) || 0;
    const fesiW = parseFloat(fesiInput?.value) || 0;
    const femnW = parseFloat(femnInput?.value) || 0;
    const cuW = parseFloat(cuInput?.value) || 0;

    const totalW = swampW + scrapW + retGjsW + retGjlW + pigW + cW + fesiW + femnW + cuW;
    if (totalWeightDisplay) totalWeightDisplay.textContent = totalW;
    if (tableSwampText) tableSwampText.textContent = swampW; 

    function getPct(val) {
      return targetW > 0 ? ((val / targetW) * 100).toFixed(1) + '%' : '0.0%';
    }

    if (pctSwamp) pctSwamp.textContent = getPct(swampW);
    if (pctScrap) pctScrap.textContent = getPct(scrapW);
    if (pctReturnGjs) pctReturnGjs.textContent = getPct(retGjsW);
    if (pctReturnGjl) pctReturnGjl.textContent = getPct(retGjlW);
    if (pctPigIron) pctPigIron.textContent = getPct(pigW);
    if (pctC) pctC.textContent = getPct(cW);
    if (pctFeSi) pctFeSi.textContent = getPct(fesiW);
    if (pctFeMn) pctFeMn.textContent = getPct(femnW);
    if (pctCu) pctCu.textContent = getPct(cuW);

    const diff = totalW - targetW;
    const tolerance = targetW * 0.05;

    if (scaleStatus) {
      scaleStatus.className = 'scale-status';

      if (Math.abs(diff) <= tolerance && totalW > 0) {
        scaleStatus.classList.add('in-tolerance');
        scaleStatus.textContent = `⚖ КАНТАР: Перфектно тегло!`;
      } else if (totalW < targetW - tolerance) {
        scaleStatus.classList.add('under-weight');
        scaleStatus.textContent = `⚖️ КАНТАР: Недостатъчно тегло! Добавете още ${Math.round(targetW - totalW)} kg.`;
      } else if (totalW > targetW + tolerance) {
        scaleStatus.classList.add('over-weight');
        scaleStatus.textContent = `⚖️ КАНТАР: Превишено тегло! Намалете с ${Math.round(totalW - targetW)} kg.`;
      } else {
        scaleStatus.classList.add('under-weight');
        scaleStatus.textContent = `⚖️ КАНТАР: Заредете материали...`;
      }
    }
  }

  allInputs.forEach(input => {
    if (input) input.addEventListener('input', updateScaleDynamic);
  });

  if (useCustomSwampCheckbox) {
    useCustomSwampCheckbox.addEventListener('change', updateScaleDynamic);
  }

  // 4. БУТОН ЗА ИЗЧИСТВАНЕ
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      allInputs.forEach(input => { if (input) input.value = 0; });
      labInputs.forEach(input => { if (input) input.value = 0; });
      updateScaleDynamic();

      if (valC) valC.textContent = "0.00%";
      if (valSi) valSi.textContent = "0.00%";
      if (valMn) valMn.textContent = "0.00%";
      if (valCu) valCu.textContent = "0.00%";

      [valC, valSi, valMn, valCu].forEach(el => {
        if (el) {
          el.style.color = '';
          const card = el.closest('.chem-card') || el.parentElement;
          if (card) {
            card.style.borderColor = '';
            card.style.backgroundColor = '';
          }
        }
      });

      if (adviceBoxContainer) {
        adviceBoxContainer.style.backgroundColor = '';
        adviceBoxContainer.style.borderColor = '';
        adviceBoxContainer.style.minHeight = '';
      }
      if (operatorAdvice) {
        operatorAdvice.style.color = '';
        operatorAdvice.style.fontSize = '';
        operatorAdvice.style.fontWeight = '';
        operatorAdvice.innerHTML = 'Нагласете теглата и натиснете бутона "Изчисли Химичен Състав".';
      }
    });
  }

  // 5. ИЗЧИСЛЯВАНЕ НА ХИМИЯТА С НОВИТЕ ТОЛЕРАНСИ
  function computeChemistry() {
      const totalW = parseFloat(totalWeightDisplay?.textContent) || 0;

      if (totalW === 0) {
        if (valC) valC.textContent = "0.00%";
        if (valSi) valSi.textContent = "0.00%";
        if (valMn) valMn.textContent = "0.00%";
        if (valCu) valCu.textContent = "0.00%";
        if (operatorAdvice) operatorAdvice.innerHTML = 'Моля, въведете тегла и натиснете бутона.';
        return;
      }

      const swampW = parseFloat(swampWeightInput?.value) || 0;
      const scrapW = parseFloat(scrapInput?.value) || 0;
      const retGjsW = parseFloat(returnGjsInput?.value) || 0;
      const retGjlW = parseFloat(returnGjlInput?.value) || 0;
      const pigW = parseFloat(pigIronInput?.value) || 0;
      const cW = parseFloat(cInput?.value) || 0;
      const fesiW = parseFloat(fesiInput?.value) || 0;
      const femnW = parseFloat(femnInput?.value) || 0;
      const cuW = parseFloat(cuInput?.value) || 0;

      const swampComposition = getActiveSwampComposition();
      const mat = (typeof MATERIALS_DATA !== 'undefined') ? MATERIALS_DATA : {
        scrap: { C: 0, Si: 0, Mn: 0, Cu: 0 },
        returnGjs: { C: 0, Si: 0, Mn: 0, Cu: 0 },
        returnGjl: { C: 0, Si: 0, Mn: 0, Cu: 0 },
        pigIron: { C: 0, Si: 0, Mn: 0, Cu: 0 },
        carbonizer: { yield: 1 },
        fesi: { contentInFeSi: 0.75, yield: 1 },
        femn: { contentInFeMn: 0.75, yield: 1 },
        copper: { yield: 1 }
      };

      let totalCKg = (swampW * swampComposition.C / 100) + 
                    (scrapW * mat.scrap.C / 100) + 
                    (retGjsW * mat.returnGjs.C / 100) + 
                    (retGjlW * mat.returnGjl.C / 100) + 
                    (pigW * mat.pigIron.C / 100) + 
                    (cW * mat.carbonizer.yield); 

      let totalSiKg = (swampW * swampComposition.Si / 100) + 
                      (scrapW * mat.scrap.Si / 100) + 
                      (retGjsW * mat.returnGjs.Si / 100) + 
                      (retGjlW * mat.returnGjl.Si / 100) + 
                      (pigW * mat.pigIron.Si / 100) + 
                      (fesiW * mat.fesi.contentInFeSi * mat.fesi.yield); 

      let totalMnKg = (swampW * swampComposition.Mn / 100) + 
                      (scrapW * mat.scrap.Mn / 100) + 
                      (retGjsW * mat.returnGjs.Mn / 100) + 
                      (retGjlW * mat.returnGjl.Mn / 100) + 
                      (pigW * mat.pigIron.Mn / 100) + 
                      (femnW * mat.femn.contentInFeMn * mat.femn.yield); 

      let totalCuKg = (swampW * swampComposition.Cu / 100) + 
                      (scrapW * mat.scrap.Cu / 100) + 
                      (retGjsW * mat.returnGjs.Cu / 100) + 
                      (retGjlW * mat.returnGjl.Cu / 100) + 
                      (pigW * mat.pigIron.Cu / 100) + 
                      (cuW * mat.copper.yield);

      let calcC = (totalCKg / totalW) * 100;
      let calcSi = (totalSiKg / totalW) * 100;
      let calcMn = (totalMnKg / totalW) * 100;
      let calcCu = (totalCuKg / totalW) * 100;

      if (valC) valC.textContent = calcC.toFixed(2) + '%';
      if (valSi) valSi.textContent = calcSi.toFixed(2) + '%';
      if (valMn) valMn.textContent = calcMn.toFixed(2) + '%';
      if (valCu) valCu.textContent = calcCu.toFixed(2) + '%';

      const currentGrade = targetGradeSelect ? targetGradeSelect.value : 'gjs500';
      const targets = (typeof TARGET_GRADES !== 'undefined' && TARGET_GRADES[currentGrade]) 
        ? TARGET_GRADES[currentGrade] 
        : { C: 0, Si: 0, Mn: 0, Cu: 0 };

      const tol = OPTIMIZER_CONFIG.tolerance;
      updateChemCardStyle(valC, calcC, targets.C, tol.C);
      updateChemCardStyle(valSi, calcSi, targets.Si, tol.Si);
      updateChemCardStyle(valMn, calcMn, targets.Mn, tol.Mn);
      updateChemCardStyle(valCu, calcCu, targets.Cu, tol.Cu);

      generateAdvice({ C: calcC, Si: calcSi, Mn: calcMn, Cu: calcCu }, targets, totalW);
  }

  if (calculateBtn) {
    calculateBtn.addEventListener('click', () => {
      if (mode === 'auto') runAuto(); else computeChemistry();
      if (typeof window.trackAction === 'function') {
        window.trackAction('calculate');
      }
    });
  }

  // 6. ПРИНТИРАНЕ (БЛАНКА ЗА PDF / ПЕЧАТ)
  if (printReportBtn) {
    printReportBtn.addEventListener('click', () => {
      
      const now = new Date();
      const timestampStr = `${now.getDate()}.${now.getMonth() + 1}.${now.getFullYear()} г. ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
const targetGradeName = targetGradeSelect && targetGradeSelect.options[targetGradeSelect.selectedIndex] 
        ? targetGradeSelect.options[targetGradeSelect.selectedIndex].text 
        : 'GJS-500';
      if (typeof saveIntensityData === 'function') {
        let materialsList = [];
        const scrapW = parseFloat(scrapInput?.value) || 0;
        if (scrapW > 0) materialsList.push(`Стоманен скрап: ${scrapW} kg`);
        const retGjsW = parseFloat(returnGjsInput?.value) || 0;
        if (retGjsW > 0) materialsList.push(`Възврат ВЧ: ${retGjsW} kg`);
        const retGjlW = parseFloat(returnGjlInput?.value) || 0;
        if (retGjlW > 0) materialsList.push(`Възврат СЧ: ${retGjlW} kg`);
        const pigW = parseFloat(pigIronInput?.value) || 0;
        if (pigW > 0) materialsList.push(`Нов чугун: ${pigW} kg`);

        let additivesList = [];
        const cW = parseFloat(cInput?.value) || 0;
        if (cW > 0) additivesList.push(`Навъглеродител: ${cW} kg`);
        const fesiW = parseFloat(fesiInput?.value) || 0;
        if (fesiW > 0) additivesList.push(`FeSi75: ${fesiW} kg`);
        const femnW = parseFloat(femnInput?.value) || 0;
        if (femnW > 0) additivesList.push(`FeMn75: ${femnW} kg`);
        const cuW = parseFloat(cuInput?.value) || 0;
        if (cuW > 0) additivesList.push(`Мед: ${cuW} kg`);

        const swampW = parseFloat(swampWeightInput?.value) || 0;
        const swampGradeText = swampGradeSelect && swampGradeSelect.options[swampGradeSelect.selectedIndex] 
          ? swampGradeSelect.options[swampGradeSelect.selectedIndex].text 
          : 'GJL-200';

        saveIntensityData({
          timestamp: timestampStr,
          furnace: selectedFurnaceName,
           targetGrade: targetGradeName,
          swamp: swampW > 0 ? `${swampW} kg (${swampGradeText})` : "Няма",
          materials: materialsList.length > 0 ? materialsList.join(', ') : "Няма",
          additives: additivesList.length > 0 ? additivesList.join(', ') : "Няма",
          ...auditFields()
        });
      }

      // --- ВЛАГАНИ МАТЕРИАЛИ ---
      let materialsRowsHTML = '';

      const scrapW = parseFloat(scrapInput?.value) || 0;
      if (scrapW > 0) {
        materialsRowsHTML += `<tr><td>Стоманен скрап</td><td>${scrapW} kg</td></tr>`;
      }

      const retGjsW = parseFloat(returnGjsInput?.value) || 0;
      if (retGjsW > 0) {
        materialsRowsHTML += `<tr><td>Собствен възврат - ВЧ (GJS)</td><td>${retGjsW} kg</td></tr>`;
      }

      const retGjlW = parseFloat(returnGjlInput?.value) || 0;
      if (retGjlW > 0) {
        materialsRowsHTML += `<tr><td>Собствен възврат - СЧ (GJL)</td><td>${retGjlW} kg</td></tr>`;
      }

      const pigW = parseFloat(pigIronInput?.value) || 0;
      if (pigW > 0) {
        materialsRowsHTML += `<tr><td>Нов чугун</td><td>${pigW} kg</td></tr>`;
      }

      // --- ДОБАВКИ И КОРЕКТОРИ ---
      let additivesRowsHTML = '';

      const cW = parseFloat(cInput?.value) || 0;
      if (cW > 0) {
        additivesRowsHTML += `<tr><td>Навъглеродител (C)</td><td>${cW} kg</td></tr>`;
      }

      const fesiW = parseFloat(fesiInput?.value) || 0;
      if (fesiW > 0) {
        additivesRowsHTML += `<tr><td>Феросилиций (FeSi75)</td><td>${fesiW} kg</td></tr>`;
      }

      const femnW = parseFloat(femnInput?.value) || 0;
      if (femnW > 0) {
        additivesRowsHTML += `<tr><td>Фероманган (FeMn75)</td><td>${femnW} kg</td></tr>`;
      }

      const cuW = parseFloat(cuInput?.value) || 0;
      if (cuW > 0) {
        additivesRowsHTML += `<tr><td>Мед (Cu)</td><td>${cuW} kg</td></tr>`;
      }

      const furnaceCapacity = targetMeltWeight ? targetMeltWeight.value : '10000';
      

      const printWindow = window.open('', '_blank', 'height=750,width=900');
      if (!printWindow) {
        alert("Браузърът блокира изскачащия прозорец! Моля, разрешете изскачащите прозорци за този сайт.");
        return;
      }

      // ГЕНЕРИРАНЕ НА БЛАНКАТА ЗА ПЕЧАТ / PDF
      printWindow.document.write(`
        <html>
          <head>
            <title>Шихтова карта - Прогрес</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; color: #333;}
              table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 20px; }
              th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; font-size: 16px; }
              th { background: #eee; }
            </style>
          </head>
          <body>
            <table style="width: 100%; border: none; margin-bottom: 20px; border-collapse: collapse; border-bottom: 2px solid #333; padding-bottom: 10px;">
              <tr>
<!-- Лого -->
                <td style="border: none; width: 1%; white-space: nowrap; padding: 0 0 10px 0; vertical-align: middle;">
                  <img src="data:image/png;base64,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" alt="Лого" style="max-height: 45px; width: auto; display: block;" />
                </td>
                <td style="border: none; text-align: left; padding: 0 0 10px 15px; vertical-align: middle;">
                  <h2 style="margin: 0; border: none; padding: 0; font-size: 25px;">ПРОИЗВОДСТВЕН ОТЧЕТ - ШИХТОВА КАРТА</h2>
                </td>
              </tr>
            </table>
            <p style="text-align: right; font-size: 14px; color: #555; margin-bottom: 15px;">${timestampStr}</p>
            <p style="text-align: center; font-size: 17px;"><strong>Избрана пещ:</strong> <span style="font-size: 22px; font-weight: bold;">${selectedFurnaceName}</span> (${furnaceCapacity} kg)</p>
            <p style="text-align: center; font-size: 17px;"><strong>Марка чугун:</strong> <span style="font-size: 22px; font-weight: bold;">${targetGradeName}</span> </p>
             
            ${materialsRowsHTML !== '' ? `
              <h3 style="margin-top: 20px; margin-bottom: 10px;">Влагане на основни материали:</h3>
              <table>
                <tr><th>Материал</th><th>Въведено тегло (kg)</th></tr>
                ${materialsRowsHTML}
              </table>
            ` : ''}

            ${additivesRowsHTML !== '' ? `
              <h3 style="margin-top: 20px; margin-bottom: 10px;">Влагане на коректори и добавки:</h3>
              <table>
                <tr><th>Коректор</th><th>Въведено тегло (kg)</th></tr>
                ${additivesRowsHTML}
              </table>
            ` : ''}
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    });
  }
// --- ФУНКЦИЯ ЗА СЪВЕТИ КЪМ ОПЕРАТОРА ---
  // Точна доза: отчита усвояването и че добавката също увеличава теглото
  // Сравнява показаната стойност (2 знака), за да съвпадат цветът и текстът
  function isOutOfNorm(el, value, target) {
    return Math.abs(Number(value.toFixed(2)) - target) > OPTIMIZER_CONFIG.tolerance[el] + 1e-9;
  }

  function correctionLine(el, value, target, W) {
    if (!isOutOfNorm(el, value, target)) return null;
    const diff = value - target;
    if (diff < 0) {
      const additive = { C: ['carbonizer', 'Навъглеродител'], Si: ['fesi', 'Феросилиций (FeSi75)'], Mn: ['femn', 'Фероманган (FeMn75)'], Cu: ['copper', 'Мед'] }[el];
      const y = ChargeOptimizer.coef(MATERIALS_DATA, additive[0], el);
      const kg = Math.ceil(W * (target - value) / (y - target));
      return `Добавете ${kg} kg ${additive[1]}: ${el} ${value.toFixed(2)}%, цел ${target.toFixed(2)}%.`;
    }
    const diluent = MATERIALS_DATA.scrap[el] < target ? ['scrap', 'стоманен скрап'] : ['pigIron', 'нов чугун'];
    const m = MATERIALS_DATA[diluent[0]][el];
    if (m >= target) return `Намалете материала, който внася ${el}: ${value.toFixed(2)}%, цел ${target.toFixed(2)}%.`;
    const kg = Math.ceil(W * diff / (target - m));
    const capacity = parseFloat(targetMeltWeight?.value) || W;
    const tail = `${el} ${value.toFixed(2)}%, цел ${target.toFixed(2)}%.`;
    if (W + kg > capacity * 1.05) return `Намалете материала, който внася ${el}: ${tail}`;
    return `Разредете с ${kg} kg ${diluent[1]}: ${tail}`;
  }


  // ==========================================================================
  // 🤖 АВТО И РЪЧЕН РЕЖИМ, ВАРИАНТИ И СЪВЕТИ
  // ==========================================================================
  const CFG = OPTIMIZER_CONFIG;
  const STORE_KEY = 'foundryiq_mode_v3';
  const MAT_UI = {
    scrap:      { name: 'скрап', input: scrapInput },
    returnGjs:  { name: 'възврат ВЧ', input: returnGjsInput },
    returnGjl:  { name: 'възврат СЧ', input: returnGjlInput },
    pigIron:    { name: 'нов чугун', input: pigIronInput },
    carbonizer: { name: 'навъглеродител', input: cInput },
    fesi:       { name: 'FeSi', input: fesiInput },
    femn:       { name: 'FeMn', input: femnInput },
    copper:     { name: 'мед', input: cuInput }
  };
  const MATS = ChargeOptimizer.MATS;
  const ELS = ChargeOptimizer.ELS;
  const MAIN = CFG.roundMainKg;
  const MAX_ADVICE_LINES = 4;

  let mode = 'auto';
  try { if (localStorage.getItem(STORE_KEY) === 'manual') mode = 'manual'; } catch (e) { /* само за удобство */ }
  const locks = {};          // материали, които операторът е задал ръчно в Авто
  let lastAuto = null;
  let appliedRecipe = null;

  const kgFmt = v => (Math.round(v) + 0 || 0).toLocaleString('bg-BG');

  function readRecipe() {
    return Object.fromEntries(MATS.map(m => [m, parseFloat(MAT_UI[m].input?.value) || 0]));
  }

  function currentGrade() {
    const key = targetGradeSelect ? targetGradeSelect.value : 'gjs500';
    return { key, data: TARGET_GRADES[key] || TARGET_GRADES.gjs500, isGjs: key.startsWith('gjs') };
  }

  function readProblem() {
    const W = parseFloat(targetMeltWeight?.value) || 10000;
    const grade = currentGrade();
    const limits = { carbonizer: { max: W * CFG.maxCarbonizerPct / 100 } };
    if (grade.isGjs) limits.returnGjl = { max: W * CFG.maxReturnGjlInGjsPct / 100 };
    else limits.returnGjs = { max: W * CFG.maxReturnGjsInGjlPct / 100 };
    return {
      W,
      swampKg: Math.max(0, parseFloat(swampWeightInput?.value) || 0),
      swampComp: getActiveSwampComposition(),
      target: grade.data,
      tolerance: CFG.tolerance,
      bandFactor: CFG.bandFactor,
      ownReturn: grade.isGjs ? 'returnGjs' : 'returnGjl',
      limits,
      roundMainKg: MAIN,
      roundAdditiveKg: CFG.roundAdditiveKg
    };
  }

  function recipeText(kg) {
    return MATS.filter(m => kg[m] > 0).map(m => `${MAT_UI[m].name} ${kgFmt(kg[m])}`).join(', ') + ' kg';
  }

  function withFixed(p, m, value) {
    return Object.assign({}, p, { limits: Object.assign({}, p.limits, { [m]: { min: value, max: value } }) });
  }

  // Ръчен режим: сравнение с най-евтината рецепта; всяка цифра идва от ново решаване
  function goalLines(p, res, recipe, entered) {
    const lines = [];
    const own = p.ownReturn;
    if (mode === 'manual' && entered) {
      const cost = ChargeOptimizer.costOf(p, recipe);
      const alt = recipe[own] > 0 && Math.abs(recipe[own] - res.kg[own]) >= MAIN ? ChargeOptimizer.solve(withFixed(p, own, recipe[own])) : null;
      const usable = alt && alt.status !== 'error' && alt.status !== 'violated';
      const best = usable && alt.cost < cost ? alt : res;
      if (cost - best.cost >= 5) lines.push(`По-добър вариант: ${recipeText(best.kg)}.`);
    }
    return lines;
  }

  function swampWarning(p) {
    const grade = currentGrade();
    const swampKey = swampGradeSelect ? swampGradeSelect.value : '';
    if (!(p.swampKg > 0) || (useCustomSwampCheckbox && useCustomSwampCheckbox.checked)) return null;
    if (grade.isGjs && swampKey.startsWith('gjl')) return 'Блато от сив чугун: проверете сярата преди сфероидизация.';
    if (!grade.isGjs && swampKey.startsWith('gjs')) return 'Блато от ВЧ: проверете остатъчния Mg преди отливане.';
    return null;
  }

  function adviceStyle(kind) {
    if (!adviceBoxContainer) return;
    const colors = { bad: ['rgba(239, 68, 68, 0.12)', '#f87171'], ok: ['rgba(16, 185, 129, 0.10)', '#34d399'], none: ['', ''] }[kind];
    adviceBoxContainer.style.backgroundColor = colors[0];
    adviceBoxContainer.style.borderColor = colors[1];
    adviceBoxContainer.style.minHeight = '';
  }

  function showLines(lines, kind) {
    if (!operatorAdvice) return;
    operatorAdvice.innerHTML = '';
    operatorAdvice.style.color = '';
    operatorAdvice.style.fontSize = '';
    operatorAdvice.style.fontWeight = '';
    adviceStyle(kind);
    lines.slice(0, MAX_ADVICE_LINES).forEach(text => {
      const row = document.createElement('div');
      row.className = 'advice-line';
      row.textContent = text;
      operatorAdvice.appendChild(row);
    });
  }

  // Какво може да се добави след проба, за да стигне химията до целта
  function correctionText(chem, targets, totalW) {
    const additive = { C: 'carbonizer', Si: 'fesi', Mn: 'femn', Cu: 'copper' };
    const parts = [];
    ELS.forEach(el => {
      if (chem[el] >= targets[el] - 0.005) return;
      const m = additive[el];
      const y = ChargeOptimizer.coef(MATERIALS_DATA, m, el);
      const kg = Math.ceil(totalW * (targets[el] - chem[el]) / (y - targets[el]));
      if (kg > 0) parts.push(`${kgFmt(kg)} kg ${MAT_UI[m].name}`);
    });
    return parts.length ? `След проба може да се добави: ${parts.join(', ')}.` : '';
  }

  // Готова замяна, ако няма достатъчно от основния материал
  function swapText(p, res) {
    const own = p.ownReturn;
    if (locks[own] !== undefined || !(res.kg[own] > 0)) return '';
    const step = Math.round(p.W * 0.06 / 50) * 50;
    const amount = Math.min(step, res.kg[own]);
    const alt = ChargeOptimizer.solve(withFixed(p, own, res.kg[own] - amount));
    if (alt.status === 'error' || alt.status === 'violated') return '';
    const gains = MATS.filter(m => m !== own)
      .map(m => [m, alt.kg[m] - res.kg[m]])
      .filter(x => x[1] >= (x[0] === 'scrap' || x[0] === 'pigIron' ? MAIN : 5))
      .map(x => `${kgFmt(x[1])} kg ${MAT_UI[x[0]].name}`);
    if (!gains.length) return '';
    return `Може да се размени: ${kgFmt(amount)} kg ${MAT_UI[own].name} с ${gains.join(', ')}.`;
  }

  // Авто: твърдо решение за зареждане, без сметки
  function autoSummary(chem, targets, totalW) {
    const { p, res, notes } = lastAuto;
    const off = ELS.filter(el => isOutOfNorm(el, chem[el], targets[el]));
    const warning = swampWarning(p);
    if (!off.length) {
      const lines = ['Това е оптималният вариант за зареждане.', ...notes];
      const fix = correctionText(chem, targets, totalW);
      if (fix) lines.push(fix);
      const swap = swapText(p, res);
      if (swap) lines.push(swap);
      if (warning) lines.push(warning);
      return showLines(lines, 'ok');
    }
    const lines = [`Това е най-близкият възможен вариант. Извън нормата остават: ${off.join(', ')}.`];
    if (p.swampKg > 0) {
      const fits = s => ChargeOptimizer.minPig(Object.assign({}, p, { swampKg: s }), 1) !== null;
      if (fits(0)) {
        let lo = 0, hi = p.swampKg;
        for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
        lines.push(`В нормата се влиза с блато до ${kgFmt(Math.floor(lo / 10) * 10)} kg.`);
      }
    }
    if (warning) lines.push(warning);
    showLines(lines, 'bad');
  }

  function generateAdvice(chem, targets, totalW) {
    if (mode === 'auto' && lastAuto) return autoSummary(chem, targets, totalW);
    const corrections = ELS.map(el => correctionLine(el, chem[el], targets[el], totalW)).filter(Boolean);
    const recipe = readRecipe();
    const p = readProblem();
    const res = ChargeOptimizer.solve(p);
    const lines = corrections.length ? corrections.slice() : ['Химията е в норма.'];
    if (res.status !== 'error') {
      const warning = swampWarning(p);
      if (warning) lines.push(warning);
      lines.push(...goalLines(p, res, recipe, MATS.some(m => recipe[m] > 0)));
    }
    showLines(lines, corrections.length ? 'bad' : 'ok');
  }

  function showIdleAdvice() {
    showLines([mode === 'auto' ? 'Изберете пещ, марка и блато и натиснете бутона.' : 'Въведете теглата.'], 'none');
  }

  function showError(text) {
    showLines([text], 'bad');
  }

  // Търси рецепта със зададените количества. Ако нормата не излиза, освобождава възможно
  // най-малко от тях. Възвратът не може да надхвърли зададеното, защото е наличността.
  function fitAroundLocks(base) {
    const locked = Object.keys(locks);
    const build = released => {
      const limits = Object.assign({}, base.limits);
      locked.forEach(m => {
        if (!released.includes(m)) limits[m] = { min: locks[m], max: locks[m] };
        else if (m === 'returnGjs' || m === 'returnGjl') limits[m] = { max: Math.min(locks[m], limits[m] && limits[m].max !== undefined ? limits[m].max : Infinity) };
      });
      return Object.assign({}, base, { limits });
    };
    const inNorm = res => res.status === 'ok' || res.status === 'relaxed';
    const all = build([]);
    const first = ChargeOptimizer.solve(all);
    if (inNorm(first) || !locked.length) return { p: all, res: first, changed: [] };

    const subsets = [];
    for (let mask = 1; mask < (1 << locked.length); mask++) subsets.push(locked.filter((m, i) => mask & (1 << i)));
    subsets.sort((a, b) => a.length - b.length);
    let best = null;
    for (const released of subsets) {
      if (best && released.length > best.released.length) break;
      const p = build(released);
      const res = ChargeOptimizer.solve(p);
      if (!inNorm(res)) continue;
      const shift = released.reduce((sum, m) => sum + Math.abs(res.kg[m] - locks[m]), 0);
      if (!best || shift < best.shift) best = { p, res, released, shift };
    }
    if (best) return { p: best.p, res: best.res, changed: best.released.filter(m => Math.abs(best.res.kg[m] - locks[m]) >= 1) };
    return { p: all, res: first, changed: [] };
  }

  // При грешка на екрана не остава стара рецепта
  function clearResult() {
    MATS.forEach(m => { if (MAT_UI[m].input && locks[m] === undefined) MAT_UI[m].input.value = 0; });
    lastAuto = null;
    appliedRecipe = null;
    updateScaleDynamic();
    [valC, valSi, valMn, valCu].forEach(el => {
      if (!el) return;
      el.textContent = '0.00%';
      el.style.color = '';
      const card = el.closest('.chem-card');
      if (card) { card.style.borderColor = ''; card.style.backgroundColor = ''; }
    });
  }

  function runAuto() {
    const base = readProblem();
    if (base.swampKg > base.W) {
      clearResult();
      showError(`Блатото (${kgFmt(base.swampKg)} kg) е повече от капацитета на пещта (${kgFmt(base.W)} kg).`);
      return;
    }
    const fit = fitAroundLocks(base);
    if (fit.res.status === 'error') {
      clearResult();
      showError('Зададените количества не се побират в пещта. Намалете ги.');
      return;
    }
    MATS.forEach(m => { if (MAT_UI[m].input) MAT_UI[m].input.value = fit.res.kg[m]; });
    const notes = [];
    if (fit.changed.length) notes.push('Променено, за да влезе в нормата: ' + fit.changed.map(m => `${MAT_UI[m].name} ${kgFmt(locks[m])} → ${kgFmt(fit.res.kg[m])} kg`).join(', ') + '.');
    fit.changed.forEach(m => { delete locks[m]; });
    lastAuto = { p: fit.p, res: fit.res, notes };
    appliedRecipe = Object.assign({}, fit.res.kg);
    renderLocks();
    updateScaleDynamic();
    computeChemistry();
  }

  function renderLocks() {
    MATS.forEach(m => {
      const input = MAT_UI[m].input;
      if (!input) return;
      const on = mode === 'auto' && locks[m] !== undefined;
      input.classList.toggle('input-locked', on);
      const cell = input.closest('td');
      let btn = cell && cell.querySelector('.lock-x');
      if (on && cell && !btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lock-x';
        btn.textContent = '×';
        btn.title = 'Алгоритъмът да определя това количество';
        btn.setAttribute('aria-label', 'Алгоритъмът да определя това количество');
        btn.addEventListener('click', () => { delete locks[m]; renderLocks(); });
        cell.appendChild(btn);
      } else if (!on && btn) btn.remove();
    });
  }

  function renderMode() {
    document.body.classList.toggle('mode-auto', mode === 'auto');
    document.querySelectorAll('[data-mode]').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
      b.setAttribute('aria-pressed', b.dataset.mode === mode);
    });
    renderLocks();
    if (calculateBtn) calculateBtn.textContent = mode === 'auto' ? '⚡ ИЗЧИСЛИ ОПТИМАЛНА ШИХТА' : '⚡ ИЗЧИСЛИ ХИМИЧЕН СЪСТАВ';
  }

  // В Авто нищо не се променя само: шихтата и химията се смятат при натискане на бутона
  function refreshAll() {
    renderMode();
    if (mode === 'auto') return;
    if ((parseFloat(totalWeightDisplay?.textContent) || 0) > 0) computeChemistry();
    else showIdleAdvice();
  }

  function buildModeSwitch() {
    const heading = document.querySelector('.center-panel h2');
    if (!heading) return;
    const row = document.createElement('div');
    row.className = 'panel-head';
    heading.parentNode.insertBefore(row, heading);
    row.appendChild(heading);
    const sw = document.createElement('div');
    sw.className = 'mode-switch';
    sw.setAttribute('role', 'group');
    sw.setAttribute('aria-label', 'Режим на работа');
    sw.innerHTML = '<button type="button" data-mode="auto">Авто</button><button type="button" data-mode="manual">Ръчен</button>';
    row.appendChild(sw);
    sw.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      if (mode === b.dataset.mode) return;
      mode = b.dataset.mode;
      lastAuto = null;
      try { localStorage.setItem(STORE_KEY, mode); } catch (e) { /* само за удобство */ }
      refreshAll();
      if (mode === 'auto') showIdleAdvice();
    }));
  }

  // Данни за админ панела
  function auditFields() {
    const recipe = readRecipe();
    const p = readProblem();
    const res = ChargeOptimizer.solve(p);
    const min = res.status === 'error' ? null : res.kg.pigIron;
    let modeText = 'Ръчно';
    if (appliedRecipe) modeText = MATS.some(m => recipe[m] !== appliedRecipe[m]) ? 'Авто + корекция' : 'Авто';
    return {
      mode: modeText,
      pigKg: recipe.pigIron,
      pigMinKg: min,
      pigOverKg: min === null ? null : Math.max(0, recipe.pigIron - min),
      costEur: Math.round(ChargeOptimizer.costOf(p, recipe)),
      costBestEur: res.status === 'error' ? null : Math.round(res.cost),
      totalKg: p.swampKg + MATS.reduce((sum, m) => sum + recipe[m], 0),
      limits: Object.keys(locks).filter(() => mode === 'auto').map(m => `${MAT_UI[m].name} ${kgFmt(locks[m])} kg`).join(', '),
      chemistry: ELS.map(el => `${el} ${document.getElementById('val' + el)?.textContent || '-'}`).join(', ')
    };
  }

  buildModeSwitch();

  let refreshTimer = null;
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshAll, 180);
  }
  allInputs.forEach(i => i && i.addEventListener('input', scheduleRefresh));
  // Ръчно въведено тегло в Авто се пази при следващото изчисление; празно поле го освобождава
  MATS.forEach(m => {
    const input = MAT_UI[m].input;
    if (input) input.addEventListener('input', () => {
      if (mode !== 'auto') return;
      if (input.value.trim() === '') delete locks[m];
      else locks[m] = Math.max(0, parseFloat(input.value) || 0);
      renderLocks();
    });
  });
  [targetGradeSelect, swampGradeSelect, useCustomSwampCheckbox, customSwampC, customSwampSi, customSwampMn, customSwampCu]
    .forEach(el => el && el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', scheduleRefresh));
  furnaceBtns.forEach(b => b.addEventListener('click', scheduleRefresh));
  if (clearAllBtn) clearAllBtn.addEventListener('click', () => {
    clearTimeout(refreshTimer);
    Object.keys(locks).forEach(m => delete locks[m]);
    lastAuto = null;
    appliedRecipe = null;
    refreshAll();
    if (mode === 'auto') showIdleAdvice();
  });

  // Началната пещ идва от маркирания бутон, за да са верни капацитетът и логът
  const activeFurnaceBtn = document.querySelector('.furnace-btn.active-furnace');
  if (activeFurnaceBtn) {
    const capacity = activeFurnaceBtn.getAttribute('data-capacity');
    if (targetMeltWeight) targetMeltWeight.value = capacity;
    if (targetWeightDisplay) targetWeightDisplay.textContent = capacity;
    selectedFurnaceName = activeFurnaceBtn.textContent.trim();
  }
  updateScaleDynamic();
  renderMode();
  showIdleAdvice();

  // Отваряне на конкретна плавка от графика на пещите
  const query = new URLSearchParams(location.search);
  if (query.get('g') && targetGradeSelect) {
    const btn = [...furnaceBtns].find(b => b.textContent.trim() === query.get('f'));
    if (btn) btn.click();
    targetGradeSelect.value = query.get('g');
    updateTargetsDisplay();
    if (swampGradeSelect && query.get('sg')) swampGradeSelect.value = query.get('sg');
    if (swampWeightInput) swampWeightInput.value = parseFloat(query.get('sw')) || 0;
    mode = 'auto';
    renderMode();
    clearTimeout(refreshTimer);
    runAuto();
  }
});
 