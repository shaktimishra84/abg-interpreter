(function () {
  "use strict";

  // Parses recognized text pasted from a photo of a Radiometer ABL800 FLEX
  // "PATIENT REPORT" printout (the only report layout this parser targets —
  // see PLAN-ocr-autofill.md). The user photographs the report and copies
  // text out via their phone's own OCR (iOS Live Text / Android ML Kit);
  // this module never touches the image itself.
  //
  // Units below are hardcoded per field rather than read from the printout,
  // because all sample reports examined print these fields in the same
  // fixed units every time. If a future report varies, prefer emitting
  // unit: "auto" and letting engine.js's existing unit-ambiguity heuristics
  // (convertField) resolve it, rather than re-implementing that logic here.
  const FIELD_DEFS = [
    { id: "pH", label: /\bpH\b/i, unit: "unitless" },
    { id: "paCO2", label: /\bpC[O0][2zZ]/i, unit: "mmHg" },
    { id: "paO2", label: /\bp[O0][2zZ]\b/i, unit: "mmHg" },
    { id: "fio2", label: /\bF[O0]2?\s*,?\s*\(?[l1I]\)?/i, unit: "percent" },
    { id: "hco3", label: /\bcHC[O0]0?3/i, unit: "mmol/L" },
    { id: "sbe", label: /\bcBase/i, unit: "mmol/L" },
    { id: "sodium", label: /\bcNa\+?/i, unit: "mmol/L" },
    { id: "potassium", label: /\bcK\+?/i, unit: "mmol/L" },
    { id: "chloride", label: /\bcCl-?/i, unit: "mmol/L" },
    { id: "glucose", label: /\bcGlu/i, unit: "mg/dL" },
    { id: "lactate", label: /\bcLac/i, unit: "mmol/L" },
    { id: "calcium", label: /\bcCa2\+?/i, unit: "mmol/L" },
    { id: "measuredOsmolality", label: /\bmOsm/i, unit: "mOsm/kg" }
  ];

  const SAMPLE_TYPE_LABEL = /\bSample\s*type/i;
  const WINDOW_SIZE = 60;
  const MAX_INPUT_LENGTH = 20000;
  const NUMBER_RE = /-?\d+\.?\d*/g;
  const HAS_NUMBER_RE = /-?\d+\.?\d*/;

  // Generously wide plausibility bounds (mirrors app.js's fieldHints, kept
  // in sync manually) — not clinical alarm limits, just a safety net against
  // OCR misreads that silently produce an implausible-but-plausible-looking
  // number (e.g. a printed "5.3" misread as "52" when a thermal-printer
  // decimal point is too faint to recognize). A match outside these bounds
  // is flagged "ambiguous" (shown as unconfirmed) rather than trusted.
  const RANGE_HINTS = {
    pH: [6.7, 7.8],
    paCO2: [5, 150],
    paO2: [20, 600],
    fio2: [15, 100],
    hco3: [2, 60],
    sbe: [-40, 40],
    sodium: [100, 180],
    potassium: [1, 10],
    chloride: [60, 140],
    glucose: [0, 600],
    lactate: [0, 30],
    calcium: [0.2, 3],
    measuredOsmolality: [200, 400]
  };

  function isOutOfRange(fieldId, value) {
    const range = RANGE_HINTS[fieldId];
    if (!range) return false;
    const numeric = parseFloat(value);
    return Number.isFinite(numeric) && (numeric < range[0] || numeric > range[1]);
  }

  // Fields present on every Radiometer ABL800 FLEX printout examined —
  // the denominator for "N of M fields recognized". Fields outside this
  // set (albumin, urea, urine indices, etc.) are never printed on this
  // machine and are intentionally left for manual entry.
  const TOTAL_PRINTABLE = FIELD_DEFS.length + 1; // +1 for sampleType

  function findFirstMatch(text, pattern) {
    const re = new RegExp(pattern.source, pattern.flags.replace("g", ""));
    return re.exec(text);
  }

  function collectLabelStarts(text) {
    const starts = [];
    FIELD_DEFS.forEach((def) => {
      const m = findFirstMatch(text, def.label);
      if (m) starts.push(m.index);
    });
    const sampleTypeMatch = findFirstMatch(text, SAMPLE_TYPE_LABEL);
    if (sampleTypeMatch) starts.push(sampleTypeMatch.index);
    starts.sort((a, b) => a - b);
    return starts;
  }

  function boundaryAfter(labelStarts, index, textLength) {
    const next = labelStarts.find((start) => start > index);
    return next === undefined ? textLength : next;
  }

  function truncateAtBracket(segment) {
    const bracketIndex = segment.indexOf("[");
    return bracketIndex === -1 ? segment : segment.slice(0, bracketIndex);
  }

  // Prefers the value on the label's own line (the common case: "label
  // value unit [range]"). Only falls back to the following line if nothing
  // was found on the same line — this tolerates OCR occasionally splitting
  // a value onto the next line, without letting an unrelated field further
  // down the same block (e.g. a following header row) get pulled in as a
  // false second candidate.
  function readWindow(text, matchEnd, labelStarts, matchIndex) {
    const cap = Math.min(
      matchEnd + WINDOW_SIZE,
      boundaryAfter(labelStarts, matchIndex, text.length),
      text.length
    );
    if (cap <= matchEnd) return "";

    const firstNewline = text.indexOf("\n", matchEnd);
    const endOfLine1 = firstNewline === -1 || firstNewline > cap ? cap : firstNewline;
    const sameLine = truncateAtBracket(text.slice(matchEnd, endOfLine1));
    if (HAS_NUMBER_RE.test(sameLine)) return sameLine;

    const secondNewline = firstNewline === -1 ? cap : text.indexOf("\n", firstNewline + 1);
    const endOfLine2 = secondNewline === -1 || secondNewline > cap ? cap : secondNewline;
    return truncateAtBracket(text.slice(matchEnd, endOfLine2));
  }

  function parse(rawText) {
    const text = String(rawText || "").slice(0, MAX_INPUT_LENGTH);
    const labelStarts = collectLabelStarts(text);
    const fields = {};
    let matchedCount = 0;

    FIELD_DEFS.forEach((def) => {
      const match = findFirstMatch(text, def.label);
      if (!match) return;
      const window = readWindow(text, match.index + match[0].length, labelStarts, match.index);
      const numbers = window.match(NUMBER_RE);
      if (!numbers || !numbers.length) return;
      const outOfRange = isOutOfRange(def.id, numbers[0]);
      fields[def.id] = {
        value: numbers[0],
        unit: def.unit,
        confidence: numbers.length > 1 || outOfRange ? "ambiguous" : "unambiguous"
      };
      matchedCount += 1;
    });

    const sampleTypeMatch = findFirstMatch(text, SAMPLE_TYPE_LABEL);
    if (sampleTypeMatch) {
      const window = readWindow(
        text,
        sampleTypeMatch.index + sampleTypeMatch[0].length,
        labelStarts,
        sampleTypeMatch.index
      );
      const isArterial = /arterial/i.test(window);
      const isVenous = /venous/i.test(window);
      if (isArterial || isVenous) {
        fields.sampleType = {
          value: isArterial ? "arterial" : "venous",
          unit: "",
          confidence: "unambiguous"
        };
        matchedCount += 1;
      }
    }

    return {
      fields,
      matchedCount,
      totalPrintable: TOTAL_PRINTABLE,
      rawText: text
    };
  }

  const ABGParser = { parse, FIELD_DEFS, TOTAL_PRINTABLE };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ABGParser;
  }
  if (typeof window !== "undefined") {
    window.ABGParser = ABGParser;
  }
})();
