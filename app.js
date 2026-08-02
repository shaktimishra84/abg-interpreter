(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const engine = window.ABGEngine;
  const parser = window.ABGParser;
  let latestReport = null;
  let completionLabel = "";

  const coreFieldIds = ["pH", "paCO2", "paO2", "fio2", "hco3", "sbe", "sodium", "potassium", "chloride", "albumin", "lactate", "sampleType"];

  const groups = [
    {
      title: "Core blood gas",
      tab: "core",
      fields: [
        { id: "pH", label: "pH", units: ["unitless"], required: true },
        { id: "paCO2", label: "PaCO2", units: ["mmHg", "kPa"], required: true },
        { id: "paO2", label: "PaO2", units: ["mmHg", "kPa"], required: true },
        { id: "fio2", label: "FiO2", units: ["percent", "fraction"], required: true },
        { id: "hco3", label: "HCO3", units: ["mmol/L", "mEq/L"], required: true },
        { id: "sbe", label: "SBE / BE", units: ["mmol/L"], required: true }
      ]
    },
    {
      title: "Core chemistry",
      tab: "core",
      fields: [
        { id: "sodium", label: "Sodium", units: ["mmol/L", "mEq/L"], required: true },
        { id: "potassium", label: "Potassium", units: ["mmol/L", "mEq/L"], required: true },
        { id: "chloride", label: "Chloride", units: ["mmol/L", "mEq/L"], required: true },
        { id: "lactate", label: "Lactate", units: ["mmol/L", "mg/dL", "mEq/L"], required: true },
        { id: "albumin", label: "Albumin", units: ["g/dL", "g/L"], required: true },
        { id: "glucose", label: "Glucose", units: ["mg/dL", "mmol/L"] }
      ]
    },
    {
      title: "Extra labs",
      tab: "more",
      fields: [
        { id: "age", label: "Age", units: ["years"] },
        { id: "urea", label: "Urea / BUN", units: ["BUN_mg_dL", "urea_mmol_L", "urea_mg_dL"] },
        { id: "creatinine", label: "Creatinine", units: ["mg/dL", "micromol/L"] },
        { id: "measuredOsmolality", label: "Measured osmolality", units: ["mOsm/kg"] },
        { id: "betaHydroxybutyrate", label: "Beta-hydroxybutyrate", units: ["mmol/L", "mg/dL"] },
        { id: "phosphate", label: "Phosphate", units: ["mmol/L", "mg/dL"] },
        { id: "calcium", label: "Calcium", units: ["mmol/L", "mg/dL"] },
        { id: "magnesium", label: "Magnesium", units: ["mmol/L", "mg/dL"] }
      ]
    },
    {
      title: "Urine indices",
      tab: "more",
      fields: [
        { id: "urineSodium", label: "Urine sodium", units: ["mmol/L", "mEq/L"] },
        { id: "urinePotassium", label: "Urine potassium", units: ["mmol/L", "mEq/L"] },
        { id: "urineChloride", label: "Urine chloride", units: ["mmol/L", "mEq/L"] },
        { id: "urinePH", label: "Urine pH", units: ["unitless"] }
      ]
    }
  ];

  const sampleOptions = [
    ["arterial", "Arterial"],
    ["venous", "Venous"]
  ];

  const fieldHints = {
    pH: { min: "6.7", max: "7.8", title: "Usual arterial pH reference: 7.35-7.45" },
    paCO2: { min: "5", max: "150", title: "Usual PaCO2 reference: 35-45 mmHg" },
    paO2: { min: "20", max: "600", title: "Usual PaO2 reference depends on FiO2 and clinical context" },
    fio2: { min: "0.21", max: "100", title: "Enter 21-100 when unit is %, or 0.21-1.0 when unit is fraction" },
    hco3: { min: "2", max: "60", title: "Usual HCO3 reference: 22-26 mmol/L" },
    sbe: { min: "-40", max: "40", title: "Usual base excess reference: about -2 to +2 mmol/L" },
    sodium: { min: "100", max: "180", title: "Usual sodium reference: 135-145 mmol/L" },
    potassium: { min: "1", max: "10", title: "Usual potassium reference: 3.5-5.0 mmol/L" },
    chloride: { min: "60", max: "140", title: "Usual chloride reference: 95-110 mmol/L" },
    lactate: { min: "0", max: "30", title: "Lactate >=4 mmol/L is a danger flag" },
    albumin: { min: "0", max: "60", title: "Default is g/dL; Stewart and corrected AG use albumin converted to g/L" },
    glucose: { min: "0", max: "600", title: "Radiometer reports cGlu commonly in mg/dL" },
    age: { min: "0", max: "120", title: "Age helps screen the A-a gradient" }
  };


  const example = {
    pH: ["7.003", "unitless"],
    paCO2: ["49.3", "mmHg"],
    paO2: ["50", "mmHg"],
    fio2: ["100", "percent"],
    hco3: ["11.7", "mmol/L"],
    sbe: ["-17.4", "mmol/L"],
    sodium: ["126", "mmol/L"],
    potassium: ["3.6", "mmol/L"],
    chloride: ["142", "mmol/L"],
    albumin: ["3.0", "g/dL"],
    lactate: ["12.1", "mmol/L"],
    glucose: ["49", "mg/dL"],
    measuredOsmolality: ["254.8", "mOsm/kg"],
    calcium: ["0.84", "mmol/L"]
  };

  function optionLabel(unit) {
    const labels = {
      auto: "auto",
      unitless: "unitless",
      fraction: "fraction",
      percent: "%",
      years: "years",
      urea_mmol_L: "urea mmol/L",
      BUN_mg_dL: "BUN mg/dL",
      urea_mg_dL: "urea mg/dL",
      "micromol/L": "umol/L"
    };
    return labels[unit] || unit;
  }

  function makeSection(group) {
    const section = document.createElement("section");
    section.className = "input-section";

    const head = document.createElement("div");
    head.className = "section-title";
    const title = document.createElement("h3");
    title.textContent = group.title;
    head.append(title);
    section.append(head);

    const grid = document.createElement("div");
    grid.className = "field-grid";
    group.fields.forEach((field) => {
      grid.append(makeField(field));
    });
    section.append(grid);
    return section;
  }

  function makeRequiredNote() {
    const note = document.createElement("p");
    note.className = "required-note";
    note.textContent = "Required values are marked *.";
    return note;
  }

  function makeField(field) {
    const template = $("#fieldTemplate").content.cloneNode(true);
    const label = template.querySelector(".field");
    const labelText = template.querySelector(".field-label");
    const input = template.querySelector("input");
    const select = template.querySelector("select");

    label.dataset.field = field.id;
    labelText.textContent = field.label;
    if (field.required) {
      const mark = document.createElement("span");
      mark.className = "required-mark";
      mark.textContent = "*";
      labelText.append(mark);
    }
    input.id = field.id;
    input.name = field.id;
    input.placeholder = "value";
    if (fieldHints[field.id]) {
      const hint = fieldHints[field.id];
      input.min = hint.min || "";
      input.max = hint.max || "";
      input.title = hint.title;
      labelText.title = hint.title;
    }
    select.id = `${field.id}Unit`;
    select.name = `${field.id}Unit`;
    field.units.forEach((unit) => {
      const option = document.createElement("option");
      option.value = unit;
      option.textContent = optionLabel(unit);
      select.append(option);
    });
    if (field.units.length === 1) {
      select.disabled = true;
      label.classList.add("single-unit");
      const unitReadout = document.createElement("span");
      unitReadout.className = "unit-readout";
      unitReadout.textContent = optionLabel(field.units[0]);
      select.after(unitReadout);
    }
    return template;
  }

  function makeSampleType() {
    const wrapper = document.createElement("section");
    wrapper.className = "input-section";
    wrapper.innerHTML = `
      <div class="section-title"><h3>Sample</h3></div>
      <div class="field-grid">
        <label class="field wide-field single-control">
          <span>Sample type<span class="required-mark">*</span></span>
          <select id="sampleType"></select>
        </label>
      </div>
    `;
    const select = wrapper.querySelector("#sampleType");
    sampleOptions.forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.append(option);
    });
    return wrapper;
  }

  function makeClinicalContext() {
    const wrapper = document.createElement("section");
    wrapper.className = "input-section";
    wrapper.innerHTML = `
      <fieldset class="flags-fieldset">
        <legend>Clinical context</legend>
        <div class="flags-grid" id="flagsGrid"></div>
      </fieldset>
    `;
    const flags = wrapper.querySelector("#flagsGrid");
    Object.entries(engine.FLAG_LABELS).forEach(([id, label]) => {
      const item = document.createElement("label");
      item.className = "flag-label";
      item.innerHTML = `<input type="checkbox" id="flag_${id}"><span>${label}</span>`;
      flags.append(item);
    });
    return wrapper;
  }

  function makeSettings() {
    const wrapper = document.createElement("section");
    wrapper.className = "input-section";
    wrapper.innerHTML = `
      <div class="section-title"><h3>Calculation settings</h3></div>
      <div class="settings-grid">
        <label class="field single-control">
          <span>Lab AG upper limit</span>
          <input id="agUpperLimit" inputmode="decimal" type="number" step="0.1" value="12">
        </label>
        <label class="field single-control">
          <span>Barometric pressure</span>
          <input id="barometricPressure" inputmode="decimal" type="number" step="1" value="760">
        </label>
        <label class="field single-control">
          <span>Respiratory quotient</span>
          <input id="respiratoryQuotient" inputmode="decimal" type="number" step="0.01" value="0.8">
        </label>
      </div>
    `;
    return wrapper;
  }

  function renderInputs() {
    const root = $("#inputSections");
    const panels = {
      core: document.createElement("div"),
      more: document.createElement("div"),
      context: document.createElement("div")
    };
    Object.entries(panels).forEach(([key, panel]) => {
      panel.className = "input-tab-panel";
      panel.dataset.inputPanel = key;
      if (key !== "core") panel.hidden = true;
    });
    panels.core.append(makeRequiredNote());
    groups.forEach((group) => panels[group.tab || "core"].append(makeSection(group)));
    panels.core.append(makeSampleType());
    panels.context.append(makeClinicalContext(), makeSettings());
    root.append(panels.core, panels.more, panels.context);
  }

  function readForm() {
    const raw = { flags: {} };
    groups.flatMap((group) => group.fields).forEach((field) => {
      const input = $(`#${field.id}`);
      const unit = $(`#${field.id}Unit`);
      raw[field.id] = {
        value: input ? input.value : "",
        unit: unit ? unit.value : ""
      };
    });
    raw.sampleType = $("#sampleType").value;
    Object.keys(engine.FLAG_LABELS).forEach((key) => {
      raw.flags[key] = $(`#flag_${key}`).checked;
    });
    return raw;
  }

  function settings() {
    return {
      agUpperLimit: $("#agUpperLimit").value,
      barometricPressure: $("#barometricPressure").value,
      respiratoryQuotient: $("#respiratoryQuotient").value
    };
  }

  function countEntered(fieldIds) {
    const raw = readForm();
    return fieldIds.filter((field) => {
      if (field === "sampleType") return Boolean(raw.sampleType);
      return raw[field] && raw[field].value !== "";
    }).length;
  }

  function updateCompletion() {
    const coreDone = countEntered(coreFieldIds);
    const fullDone = countEntered(engine.REQUIRED_FIELDS);
    const status = $("#completionStatus");
    const nextLabel = `${coreDone}/${coreFieldIds.length} core`;
    status.textContent = nextLabel;
    status.title = `${fullDone}/${engine.REQUIRED_FIELDS.length} full fields available`;
    status.classList.toggle("complete", coreDone === coreFieldIds.length);
    if (completionLabel && completionLabel !== nextLabel) {
      status.classList.remove("pulse");
      const animate = window.requestAnimationFrame || ((callback) => callback());
      animate(() => status.classList.add("pulse"));
    }
    completionLabel = nextLabel;
    updateTabBadges();
  }

  function updateTabBadges() {
    const raw = readForm();
    const moreFields = groups
      .filter((group) => group.tab === "more")
      .flatMap((group) => group.fields)
      .filter((field) => raw[field.id] && raw[field.id].value !== "").length;
    const contextFlags = Object.keys(engine.FLAG_LABELS).filter((key) => raw.flags[key]).length;
    setTabBadge("more", moreFields);
    setTabBadge("context", contextFlags);
  }

  function setTabBadge(tab, count) {
    const button = document.querySelector(`[data-input-tab="${tab}"]`);
    if (!button) return;
    button.dataset.badge = count ? String(count) : "";
    button.classList.toggle("has-data", count > 0);
  }

  function setExample() {
    resetForm();
    Object.entries(example).forEach(([id, [value, unit]]) => {
      const input = $(`#${id}`);
      const select = $(`#${id}Unit`);
      if (input) input.value = value;
      if (select) select.value = unit;
    });
    $("#sampleType").value = "arterial";
    $("#flag_sepsis").checked = true;
    $("#flag_shock").checked = true;
    $("#flag_renalFailure").checked = true;
    analyze();
  }

  function resetForm(options = {}) {
    if (options.confirm && !window.confirm("Clear all entered values and the current interpretation?")) return;
    $("#abgForm").reset();
    $("#agUpperLimit").value = "12";
    $("#barometricPressure").value = "760";
    $("#respiratoryQuotient").value = "0.8";
    activateInputTab("core");
    latestReport = null;
    $("#reportTimestamp").textContent = "Waiting for input";
    $("#report").className = "report-empty";
    $("#report").innerHTML = "<h3>Ready for analysis</h3><p>Enter pH, PaCO2, HCO3, and electrolytes to see the interpretation.</p>";
    clearOcrState();
    updateCompletion();
  }

  function clearOcrState() {
    $("#parsedSummary").innerHTML = "";
    $("#ocrDetails").hidden = true;
    $("#ocrText").textContent = "";
    document.querySelectorAll(".field.unconfirmed").forEach((el) => el.classList.remove("unconfirmed"));
    clearPhoto();
  }

  function fieldLabel(id) {
    if (id === "sampleType") return "Sample type";
    const match = groups.flatMap((group) => group.fields).find((field) => field.id === id);
    return match ? match.label : id;
  }

  function applyOcrResult(result) {
    const summary = $("#parsedSummary");
    const ocrDetails = $("#ocrDetails");
    const ocrText = $("#ocrText");

    ocrText.textContent = result.rawText;
    ocrDetails.hidden = !result.rawText.trim();
    summary.innerHTML = "";

    if (result.matchedCount === 0) {
      const message = document.createElement("p");
      message.className = "muted-line";
      message.textContent = "Couldn't recognize any fields. If you scanned a photo, try retaking it with better lighting/less glare, or use your phone's own OCR (Live Text / ML Kit) and paste the text above instead — it's usually more accurate than in-app scanning. Otherwise enter values manually below.";
      summary.append(message);
      return;
    }

    const summaryLine = document.createElement("p");
    summaryLine.textContent = `${result.matchedCount} of ${result.totalPrintable} fields recognized.`;

    const chipRow = document.createElement("div");
    chipRow.className = "parsed-chip-row";

    Object.entries(result.fields).forEach(([id, match]) => {
      if (id === "sampleType") {
        const select = $("#sampleType");
        if (select) select.value = match.value;
      } else {
        const input = $(`#${id}`);
        const unitSelect = $(`#${id}Unit`);
        if (input) input.value = match.value;
        if (unitSelect) unitSelect.value = match.unit;
      }

      const fieldWrapper = document.querySelector(`.field[data-field="${id}"]`);
      if (fieldWrapper) fieldWrapper.classList.toggle("unconfirmed", match.confidence === "ambiguous");

      const chip = document.createElement("div");
      chip.className = match.confidence === "ambiguous" ? "parsed-row ambiguous" : "parsed-row";
      const label = document.createElement("span");
      label.textContent = fieldLabel(id);
      const value = document.createElement("strong");
      value.textContent = match.value;
      chip.append(label, value);
      if (match.confidence === "ambiguous") {
        const tag = document.createElement("span");
        tag.className = "confidence-tag";
        tag.textContent = "unconfirmed";
        chip.append(tag);
      }
      chipRow.append(chip);
    });

    summary.append(summaryLine, chipRow);
    updateCompletion();
  }

  function parsePastedText() {
    if (!parser) return;
    const result = parser.parse($("#pasteInput").value);
    applyOcrResult(result);
  }

  // In-app photo capture, scanned via the Claude API (server-side, see
  // api/scan.js). Unlike the earlier Tesseract.js version, the photo IS
  // sent over the network here - explicitly chosen by the user over the
  // in-browser-only alternative after being told what that costs (see
  // PLAN-ocr-autofill.md). Claude's transcription is fed through the same
  // ocr-parser.js used by the paste-text path, so the same plausibility
  // and confidence safety net applies regardless of source.
  const MAX_UPLOAD_DIMENSION = 1568; // Claude's own recommended long edge for image inputs
  let currentPhotoUrl = null;

  function encodeImageForUpload(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Couldn't read that photo."));
      };
      img.src = url;
    });
  }

  function setOcrProgress(text) {
    $("#ocrProgress").textContent = text;
  }

  function showPhotoPreview(file) {
    if (currentPhotoUrl) URL.revokeObjectURL(currentPhotoUrl);
    currentPhotoUrl = URL.createObjectURL(file);
    const preview = $("#photoPreview");
    preview.innerHTML = "";
    const img = document.createElement("img");
    img.src = currentPhotoUrl;
    img.alt = "Selected report photo";
    preview.append(img);
    $("#photoActions").hidden = false;
  }

  function clearPhoto() {
    if (currentPhotoUrl) {
      URL.revokeObjectURL(currentPhotoUrl);
      currentPhotoUrl = null;
    }
    $("#photoPreview").innerHTML = "No photo yet";
    $("#photoActions").hidden = true;
    $("#photoInput").value = "";
    setOcrProgress("");
  }

  async function runOcrOnFile(file) {
    showPhotoPreview(file);
    setOcrProgress("Sending to Claude for scanning...");
    try {
      const image = await encodeImageForUpload(file);
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image, mediaType: "image/jpeg" })
      });
      const result = await response.json();
      if (!response.ok) {
        setOcrProgress(result.error || "Couldn't scan that photo. Try the paste box below instead.");
        return;
      }
      applyOcrResult(parser.parse(result.text));
      setOcrProgress("Done.");
    } catch (error) {
      setOcrProgress("Couldn't reach the scanning service. Try again, or use the paste box below instead.");
    }
  }

  function bindPhotoEvents() {
    const drop = $("#photoDrop");
    const input = $("#photoInput");

    input.addEventListener("change", () => {
      if (input.files && input.files[0]) runOcrOnFile(input.files[0]);
    });
    $("#removePhoto").addEventListener("click", clearPhoto);

    ["dragover", "dragenter"].forEach((eventName) => {
      drop.addEventListener(eventName, (event) => {
        event.preventDefault();
        drop.classList.add("dragging");
      });
    });
    ["dragleave", "drop"].forEach((eventName) => {
      drop.addEventListener(eventName, (event) => {
        event.preventDefault();
        drop.classList.remove("dragging");
      });
    });
    drop.addEventListener("drop", (event) => {
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) runOcrOnFile(file);
    });
  }

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function activateInputTab(tab) {
    document.querySelectorAll("[data-input-tab]").forEach((button) => {
      const active = button.dataset.inputTab === tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll("[data-input-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.inputPanel !== tab;
    });
  }

  function bindInputTabs() {
    document.querySelectorAll("[data-input-tab]").forEach((button) => {
      button.addEventListener("click", () => activateInputTab(button.dataset.inputTab));
    });
  }

  function activateReportTab(tab) {
    document.querySelectorAll("[data-report-tab]").forEach((button) => {
      const active = button.dataset.reportTab === tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll("[data-report-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.reportPanel !== tab;
    });
  }

  function bindReportTabs() {
    document.querySelectorAll("[data-report-tab]").forEach((button) => {
      button.addEventListener("click", () => activateReportTab(button.dataset.reportTab));
    });
  }

  function list(items, className) {
    if (!items || !items.length) return "<p class=\"muted-line\">None detected from available data.</p>";
    return `<ul class="line-list">${items.map((item) => `<li class="${className || ""}">${escapeHTML(item)}</li>`).join("")}</ul>`;
  }

  function orderedList(items, className) {
    if (!items || !items.length) return "<p class=\"muted-line\">Not available from the entered values.</p>";
    return `<ol class="step-list">${items.map((item) => `<li class="${className || ""}">${escapeHTML(item)}</li>`).join("")}</ol>`;
  }

  // Quick bedside triage flags, separate from engine.js's deeper
  // danger_flags logic (which uses different thresholds for different
  // purposes further down the report). These four are meant to be seen
  // in the first second of opening the report, before reading anything
  // else - only fires on a confirmed (unambiguous-unit) value, same
  // caution the rest of the app already applies before trusting a number.
  const CRITICAL_RULES = [
    { field: "pH", label: "pH", test: (v) => v < 7.3, describe: (v) => `${v} (critical: <7.30)` },
    { field: "paCO2", label: "PaCO2", test: (v) => v > 50, describe: (v) => `${v} mmHg (critical: >50)` },
    { field: "lactate", label: "Lactate", test: (v) => v > 4, describe: (v) => `${v} mmol/L (critical: >4)` },
    {
      field: "glucose",
      label: "Glucose",
      // glucose is stored internally in mmol/L; 70 mg/dL is the
      // conventional hypoglycemia threshold, converted here so the
      // stored comparison matches how the rest of engine.js converts
      // glucose (divide/multiply by 18).
      test: (v) => v < 70 / 18,
      describe: (v) => `${round(v * 18, 0)} mg/dL (critical: <70)`
    },
    {
      field: "fio2",
      label: "FiO2",
      // fio2 is stored internally as a fraction (0-1); 60% = 0.6.
      test: (v) => v > 0.6,
      describe: (v) => `${round(v * 100, 0)}% (critical: >60%)`
    },
    { field: "potassium", label: "Potassium", test: (v) => v > 6, describe: (v) => `${v} mmol/L (critical: >6)` },
    { field: "paO2", label: "PaO2", test: (v) => v < 60, describe: (v) => `${v} mmHg (critical: <60)` }
  ];

  function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function criticalFlags(report) {
    const converted = report.unit_normalization.converted_inputs;
    return CRITICAL_RULES.filter((rule) => {
      const item = converted[rule.field];
      return item && item.confirmed && typeof item.value === "number" && rule.test(item.value);
    }).map((rule) => `${rule.label} ${rule.describe(converted[rule.field].value)}`);
  }

  function criticalBanner(report) {
    const flags = criticalFlags(report);
    if (!flags.length) return "";
    return `
      <div class="critical-flash" role="alert">
        <strong>CRITICAL — notify consultant</strong>
        <ul>${flags.map((flag) => `<li>${escapeHTML(flag)}</li>`).join("")}</ul>
      </div>
    `;
  }

  function chips(report) {
    const tags = [];
    const status = report.severity.pH_status;
    if (status === "Acidemia") tags.push(["acid", "Acidemia"]);
    else if (status === "Alkalemia") tags.push(["alkali", "Alkalemia"]);
    else if (status === "Near-normal pH") tags.push(["warn", "Near-normal pH"]);
    if (report.metabolic_analysis.anion_gap_category) tags.push(["", report.metabolic_analysis.anion_gap_category]);
    if (report.alactic_base_excess.interpretation) tags.push(["", report.alactic_base_excess.interpretation]);
    if (report.severity.danger_flags.length) tags.push(["acid", "Danger flags"]);
    return `<div class="chip-row">${tags.map(([type, text]) => `<span class="tag ${type}">${escapeHTML(text)}</span>`).join("")}</div>`;
  }

  function metric(label, value, note, tone) {
    const toneClass = ["acid", "alkali", "warn", "good"].includes(tone) ? ` ${tone}` : "";
    const displayValue = value === "" || value === null || value === undefined ? "-" : value;
    return `
      <div class="metric${toneClass}">
        <span>${escapeHTML(label)}</span>
        <strong>${escapeHTML(displayValue)}</strong>
        <small>${escapeHTML(note || "")}</small>
      </div>
    `;
  }

  function metricGrid(report) {
    const m = report.metabolic_analysis;
    const a = report.alactic_base_excess;
    const o = report.oxygenation;
    const pH = report.unit_normalization.converted_inputs.pH?.value || "";
    const agLabel = report.unit_normalization.converted_inputs.albumin?.value !== "" ? "Corrected AG" : "Anion gap";
    const phTone = report.severity.pH_status === "Acidemia" ? "acid" : report.severity.pH_status === "Alkalemia" ? "alkali" : "good";
    const agTone = m.anion_gap_category === "high anion gap" ? "acid" : m.anion_gap_category === "low anion gap" ? "warn" : "good";
    const abeTone = Number(a.ABE) < -2 ? "acid" : Number(a.ABE) > 2 ? "alkali" : "good";
    const oxyTone = String(o.oxygenation_interpretation || "").toLowerCase().includes("elevated") ? "warn" : "good";
    return `
      <div class="metric-grid priority-metrics">
        ${metric("pH", pH, report.severity.pH_status, phTone)}
        ${metric(agLabel, m.corrected_anion_gap, m.anion_gap_category, agTone)}
        ${metric("ABE", a.ABE, a.interpretation, abeTone)}
        ${metric("A-a gradient", o.A_a_gradient, o.oxygenation_interpretation, oxyTone)}
      </div>
    `;
  }

  function treatmentCard(report) {
    const treatment = report.treatment_suggestions || {};
    const pick = (items, pattern) => {
      const listItems = items || [];
      return listItems.find((item) => pattern.test(item)) || listItems[0] || "";
    };
    const ventilation = treatment.ventilation_oxygenation || [];
    let priority = [
      pick(ventilation, /PaCO2|ventilatory/i),
      pick(treatment.circulation_lactate, /Lactate|shock|sepsis/i),
      pick(ventilation, /A-a gradient|oxygen transfer|PaO2/i),
      pick(treatment.fluids_strong_ion, /strong ion|hyperchloremic|chloride/i),
      pick(treatment.stewart_actions, /unmeasured|non-lactate|discordant|analyzer|verify/i),
      pick(treatment.electrolytes, /potassium|magnesium|calcium|phosphate/i),
      pick(treatment.renal_toxin_dka, /renal|toxic|DKA/i),
      pick(treatment.bicarbonate, /bicarbonate/i)
    ].filter(Boolean).filter((item, index, listItems) => listItems.indexOf(item) === index);
    if (priority.length < 3) {
      priority = (treatment.immediate_threats || []).concat(priority);
    }
    priority = priority.filter((item, index, listItems) => listItems.indexOf(item) === index).slice(0, 7);
    return `
      <section class="action-card">
        <div class="action-kicker">Emergency-use guidance</div>
        <h3>${escapeHTML(treatment.title || "Corrective measures")}</h3>
        <p class="action-summary">${escapeHTML(treatment.opening_summary || treatment.core_rule || "")}</p>
        ${list(priority, "danger-line")}
        <p class="action-disclaimer">${escapeHTML(treatment.purpose || "")}</p>
      </section>
    `;
  }

  function treatmentSection(title, items, className) {
    return `
      <section class="report-block action-section">
        <h3>${escapeHTML(title)}</h3>
        ${list(items, className)}
      </section>
    `;
  }

  function treatmentPanel(report) {
    const treatment = report.treatment_suggestions || {};
    return `
      <section class="report-block action-lead">
        <h3>${escapeHTML(treatment.title || "Corrective measures")}</h3>
        <p>${escapeHTML(treatment.opening_summary || "")}</p>
        <p>${escapeHTML(treatment.core_rule || "")}</p>
      </section>
      ${treatmentSection("A. Immediate threats", treatment.immediate_threats, "danger-line")}
      ${treatmentSection("B. Ventilation and oxygenation", treatment.ventilation_oxygenation, "warn-line")}
      ${treatmentSection("C. Circulation and lactate", treatment.circulation_lactate, "warn-line")}
      ${treatmentSection("D. Fluids and strong ion/chloride effect", treatment.fluids_strong_ion, "warn-line")}
      ${treatmentSection("Stewart-directed implications", treatment.stewart_actions, "warn-line")}
      ${treatmentSection("E. Electrolytes", treatment.electrolytes, "warn-line")}
      ${treatmentSection("F. Renal replacement / toxin / DKA pathway", treatment.renal_toxin_dka, "warn-line")}
      ${treatmentSection("G. Bicarbonate statement", treatment.bicarbonate, "warn-line")}
      ${treatmentSection("Escalate if", treatment.escalation_triggers, "danger-line")}
      <div class="clinical-warning">${escapeHTML(treatment.purpose || "")}</div>
    `;
  }

  function albuminDisplay(report) {
    const albumin = report.unit_normalization.converted_inputs.albumin || {};
    const rawValue = albumin.raw_value;
    const rawUnit = albumin.raw_unit;
    const converted = albumin.value;
    if (rawValue !== "" && rawValue !== null && rawValue !== undefined && rawUnit === "g/dL") {
      return `Albumin = ${rawValue} g/dL = ${converted} g/L`;
    }
    if (converted !== "" && converted !== null && converted !== undefined) {
      return `Albumin = ${converted} g/L`;
    }
    return "Albumin not available";
  }

  function stewartWorkedSteps(report) {
    const s = report.stewart_light;
    const albuminLine = albuminDisplay(report);
    const hasValue = (value) => value !== "" && value !== null && value !== undefined;
    const value = (item, unit) => hasValue(item) ? `${item}${unit ? ` ${unit}` : ""}` : "not available";
    const pHOutsideReferenceBand = Number(s.pH) < 7.3 || Number(s.pH) > 7.5;
    const referenceFormula = pHOutsideReferenceBand
      ? "Reference Na-Cl = 35 + 15 x (7.40 - pH)"
      : "Reference Na-Cl = 35 when pH is between 7.30 and 7.50";
    const referenceCalculation = pHOutsideReferenceBand
      ? `35 + 15 x (7.40 - ${value(s.pH)}) = ${value(s.pH_adjusted_reference_Na_minus_Cl, "mmol/L")}`
      : `35 = ${value(s.pH_adjusted_reference_Na_minus_Cl, "mmol/L")}`;
    const lactateCalculation = hasValue(s.lactate_mmol_per_L)
      ? `${value(s.SBE_unmeasured_ions)} + ${value(s.lactate_mmol_per_L)} = ${value(s.residual_UI_after_lactate, "mmol/L")}`
      : s.residual_UI_after_lactate_interpretation || "lactate not available";
    const abeCalculation = hasValue(s.ABE)
      ? `${value(s.SBE)} + ${value(s.lactate_mmol_per_L)} = ${value(s.ABE, "mmol/L")}`
      : s.ABE_interpretation || "lactate not available";
    const step = (number, title, fullForm, rows, interpretation) => `
      <article class="stewart-step">
        <div class="stewart-step-number">${number}</div>
        <div class="stewart-step-body">
          <h4>${escapeHTML(title)}</h4>
          <p class="stewart-full-form">${escapeHTML(fullForm)}</p>
          <div class="stewart-equations">
            ${rows.map(([label, text]) => `
              <div class="equation-row">
                <span>${escapeHTML(label)}</span>
                <code>${escapeHTML(text)}</code>
              </div>
            `).join("")}
          </div>
          <p class="stewart-meaning">${escapeHTML(interpretation)}</p>
        </div>
      </article>
    `;
    return `
      <div class="stewart-worked">
        ${step(
          1,
          "Sodium-chloride difference and pH-adjusted reference",
          "Na-Cl means sodium minus chloride. This screens the apparent strong ion difference before partitioning base excess.",
          [
            ["Formula", "Na-Cl difference = Na - Cl"],
            ["Calculation", `${value(s.Na)} - ${value(s.Cl)} = ${value(s.Na_minus_Cl, "mmol/L")}`],
            ["Formula", referenceFormula],
            ["Calculation", referenceCalculation],
            ["Result", `Na-Cl difference ${value(s.Na_minus_Cl, "mmol/L")}; reference ${value(s.pH_adjusted_reference_Na_minus_Cl, "mmol/L")}`]
          ],
          "A value above the reference supports a high strong ion difference / alkalinising chloride pattern; a value below the reference supports low SID acidosis."
        )}
        ${step(
          2,
          "Strong ion effect",
          "SBE_SID means Standard Base Excess attributable to Strong Ion Difference, mainly the sodium-chloride relationship.",
          [
            ["Formula", "SBE_SID = (Na-Cl difference) - pH-adjusted reference Na-Cl"],
            ["Calculation", `${value(s.Na_minus_Cl)} - ${value(s.pH_adjusted_reference_Na_minus_Cl)} = ${value(s.SBE_SID, "mmol/L")}`],
            ["Result", `${value(s.SBE_SID, "mmol/L")}: ${s.SBE_SID_interpretation || "not available"}`]
          ],
          "Negative SBE_SID is acidifying. Positive SBE_SID is alkalinising."
        )}
        ${step(
          3,
          "Albumin / weak acid effect",
          "SBE_Albumin means Standard Base Excess attributable to albumin / weak acid effect.",
          [
            ["Input", albuminLine],
            ["Formula", "SBE_Albumin = 0.3 x (40 - albumin in g/L)"],
            ["Calculation", `0.3 x (40 - ${value(s.albumin_g_per_L)}) = ${value(s.SBE_albumin, "mmol/L")}`],
            ["Result", `${value(s.SBE_albumin, "mmol/L")}: ${s.SBE_albumin_interpretation || "not available"}`]
          ],
          "Low albumin is alkalinising and can mask lactate, ketone, renal, toxic alcohol, or other fixed-acid acidosis."
        )}
        ${step(
          4,
          "Unmeasured ion effect",
          "SBE_UI means Standard Base Excess attributable to Unmeasured Ions after removing strong ion and albumin effects.",
          [
            ["Formula", "SBE_UI = SBE - SBE_SID - SBE_Albumin"],
            ["Calculation", `${value(s.SBE)} - (${value(s.SBE_SID)}) - (${value(s.SBE_albumin)}) = ${value(s.SBE_unmeasured_ions, "mmol/L")}`],
            ["Result", `${value(s.SBE_unmeasured_ions, "mmol/L")}: ${s.SBE_unmeasured_ions_interpretation || "not available"}`]
          ],
          "Negative SBE_UI suggests unmeasured anion acidosis. Positive SBE_UI should trigger a unit/analyzer check before rare unmeasured cations."
        )}
        ${step(
          5,
          "Lactate and non-lactate fixed acid effect",
          "Residual_UI_after_lactate means the remaining unmeasured ion effect after lactate. ABE means Alactic Base Excess.",
          [
            ["Formula", "Residual_UI_after_lactate = SBE_UI + lactate"],
            ["Calculation", lactateCalculation],
            ["Result", `${value(s.residual_UI_after_lactate, "mmol/L")}: ${s.residual_UI_after_lactate_interpretation || "not available"}`],
            ["Formula", "ABE = SBE + lactate"],
            ["Calculation", abeCalculation],
            ["Result", `${value(s.ABE, "mmol/L")}: ${s.ABE_interpretation || "not available"}`]
          ],
          "This separates lactate-driven acidosis from additional non-lactate fixed acids such as ketones, uremic acids, toxic alcohol metabolites, salicylate, pyroglutamate, phosphate, or sulfate."
        )}
      </div>
    `;
  }

  function stewartConclusion(report) {
    const s = report.stewart_light || {};
    if (!s.eligible) {
      return `<div class="stewart-conclusion incomplete"><div class="action-kicker">Stewart conclusion</div><p>${escapeHTML(s.final_stewart_summary || "Stewart light is incomplete.")}</p></div>`;
    }
    const driverList = (title, items, tone) => {
      const values = items || [];
      return `
        <div class="stewart-driver ${tone}">
          <h4>${escapeHTML(title)}</h4>
          ${values.length ? list(values, "") : `<p class="muted-line">No major component above the +/-2 mmol/L threshold.</p>`}
        </div>
      `;
    };
    return `
      <section class="stewart-conclusion">
        <div class="action-kicker">Stewart conclusion</div>
        <h4>${escapeHTML(s.final_stewart_summary || "No overall inference available.")}</h4>
        <div class="stewart-driver-grid">
          ${driverList("Acidifying drivers", s.acidifying_drivers, "acidifying")}
          ${driverList("Alkalinising drivers", s.alkalinising_drivers, "alkalinising")}
        </div>
        <div class="stewart-inference">
          <h4>Clinical inference</h4>
          ${list(s.clinical_inference, "")}
        </div>
        <div class="stewart-actions">
          <h4>What this changes now</h4>
          ${list(s.suggested_actions, "warn-line")}
        </div>
        ${(s.quality_flags || []).length ? `<div class="stewart-quality"><strong>Verify before acting</strong>${list(s.quality_flags, "warn-line")}</div>` : ""}
      </section>
    `;
  }

  function stewartStatus(report) {
    const s = report.stewart_light;
    const notes = [];
    if (s.missing_inputs?.length) notes.push(`Missing Stewart inputs: ${s.missing_inputs.join(", ")}.`);
    if (s.unit_warnings?.length) notes.push(...s.unit_warnings);
    const tags = (s.stewart_light_tags || [])
      .map((tag) => `<span class="tag warn">${escapeHTML(tag)}</span>`)
      .join("");
    return `
      ${notes.length ? `<div class="clinical-warning">${escapeHTML(notes.join(" "))}</div>` : ""}
      ${tags ? `<div class="chip-row stewart-tags">${tags}</div>` : ""}
    `;
  }

  function convertedRows(report) {
    const input = report.unit_normalization.converted_inputs;
    const wanted = ["pH", "paCO2", "paO2", "fio2", "hco3", "sbe", "sodium", "potassium", "chloride", "lactate", "albumin", "glucose", "urea", "creatinine"];
    const rows = wanted
      .filter((key) => input[key] && input[key].value !== "")
      .map((key) => `
        <tr>
          <td>${escapeHTML(key)}</td>
          <td>${escapeHTML(input[key].raw_value)} ${escapeHTML(input[key].raw_unit)}</td>
          <td>${escapeHTML(input[key].value)} ${escapeHTML(input[key].unit)}</td>
        </tr>
      `)
      .join("");
    if (!rows) return "";
    return `
      <table class="data-table">
        <thead><tr><th>Field</th><th>Raw</th><th>Internal</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function calculationsPanel(report) {
    const steps = report.stepwise_interpretation || { calculations: [] };
    return `
      <section class="report-block">
        <h3>Calculations</h3>
        ${orderedList(steps.calculations, "calc-line")}
      </section>
    `;
  }

  function renderReport(report) {
    const headline = report.primary_interpretation.primary_disorders[0] || report.severity.pH_status;
    const stepwise = report.stepwise_interpretation || {
      interpretation_steps: report.final_diagnosis,
      calculations: [],
      possible_reasons: report.likely_causes
    };
    $("#report").className = "";
    $("#report").innerHTML = `
      ${criticalBanner(report)}
      <section class="diagnosis-card">
        <div class="diagnosis-title">Diagnosis</div>
        <div class="lead-diagnosis">${escapeHTML(headline)}</div>
        ${chips(report)}
      </section>

      ${treatmentCard(report)}

      <section class="report-block">
        ${metricGrid(report)}
      </section>

      <div class="tab-strip report-tabs" role="tablist" aria-label="Report sections">
        <button class="tab-button active" type="button" role="tab" aria-selected="true" data-report-tab="actions">Actions</button>
        <button class="tab-button" type="button" role="tab" aria-selected="false" data-report-tab="calculations">Calculations</button>
        <button class="tab-button" type="button" role="tab" aria-selected="false" data-report-tab="stewart">Stewart</button>
      </div>

      <div class="report-tab-panels">
        <section class="report-tab-panel" data-report-panel="actions">
          ${treatmentPanel(report)}
        </section>

        <section class="report-tab-panel" data-report-panel="calculations" hidden>
          ${calculationsPanel(report)}
        </section>

        <section class="report-tab-panel" data-report-panel="stewart" hidden>
          <section class="report-block">
            <h3>Stewart light analysis</h3>
            ${stewartConclusion(report)}
            ${stewartWorkedSteps(report)}
            ${stewartStatus(report)}
          </section>
        </section>
      </div>

      <div class="clinical-warning">${escapeHTML(report.clinical_warning)}</div>
    `;
    $("#reportTimestamp").textContent = `Calculated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    bindReportTabs();
  }

  function analyze() {
    setAnalyzing(true);
    try {
      latestReport = engine.analyze(readForm(), settings());
      renderReport(latestReport);
      updateCompletion();
    } finally {
      setAnalyzing(false);
    }
  }

  function setAnalyzing(active) {
    ["#runAnalysis", "#runAnalysisInline"].forEach((selector) => {
      const button = $(selector);
      if (!button) return;
      button.disabled = active;
      button.textContent = active ? "Analyzing..." : "Analyze";
    });
    $("#report").setAttribute("aria-busy", String(active));
  }

  function copyJson() {
    if (!latestReport) analyze();
    const payload = JSON.stringify(latestReport, null, 2);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(payload);
      $("#copyJson").textContent = "Copied";
      setTimeout(() => { $("#copyJson").textContent = "JSON"; }, 1000);
    }
  }

  function bindEvents() {
    $("#runAnalysis").addEventListener("click", analyze);
    $("#runAnalysisInline").addEventListener("click", analyze);
    $("#loadExample").addEventListener("click", setExample);
    $("#resetForm").addEventListener("click", () => resetForm({ confirm: true }));
    $("#copyJson").addEventListener("click", copyJson);
    $("#abgForm").addEventListener("input", updateCompletion);
    $("#abgForm").addEventListener("change", updateCompletion);
    $("#abgForm").addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        analyze();
      }
    });
    $("#parseOcrText").addEventListener("click", parsePastedText);
    $("#abgForm").addEventListener("focusin", (event) => {
      const fieldWrapper = event.target.closest && event.target.closest(".field.unconfirmed");
      if (fieldWrapper) fieldWrapper.classList.remove("unconfirmed");
    });
  }

  renderInputs();
  bindEvents();
  bindPhotoEvents();
  bindInputTabs();
  updateCompletion();
})();
