const assert = require("assert");
const ABGParser = require("./ocr-parser.js");

function field(result, id) {
  return result.fields[id];
}

// --- Fixture 1: real report text (PARBATI, sample #13779), clean OCR ---
const report1 = `
RADIOMETER ABL800 FLEX
ABL835 SUM CCM4 ICU
PATIENT REPORT
Identifications
Patient ID 9938300261
Patient Last Name PARBATI
Sex Female
Sample type Arterial
FO2(l) 21.0 %
T 37.0 C

Blood Gas Values
pH 7.303 [ 7.350 - 7.450 ]
pCO2 37.1 mmHg [ 35.0 - 45.0 ]
pO2 78.3 mmHg [ 70.0 - 100 ]
Oximetry Values
ctHb 7.1 g/dL
sO2 94.9 %
Electrolyte Values
cK+ 5.3 mmol/L [ 3.5 - 5.0 ]
cNa+ 132 mmol/L [ 135 - 150 ]
cCa2+ 0.81 mmol/L [ 0.80 - 1.20 ]
cCl- 105 mmol/L [ 88 - 108 ]
Metabolite Values
cGlu 43 mg/dL [ 70 - 140 ]
cLac 0.9 mmol/L [ 0.0 - 2.0 ]
ctBil 6 umol/L
Oxygen Status
ctO2c 9.4 Vol%
Acid Base Status
cBase(Ecf)c -7.4 mmol/L
cHCO3-(P,st)c 18.3 mmol/L
Anion Gapc 9.5 mmol/L
AnionGap,K+c 14.7 mmol/L
mOsmc 266.1 mmol/kg
pO2(a/A)e 74.7 %
pO2(a)/FO2(l)c 373 mmHg
`;

const r1 = ABGParser.parse(report1);
assert.strictEqual(field(r1, "pH").value, "7.303");
assert.strictEqual(field(r1, "pH").unit, "unitless");
assert.strictEqual(field(r1, "pH").confidence, "unambiguous");
assert.strictEqual(field(r1, "paCO2").value, "37.1");
assert.strictEqual(field(r1, "paO2").value, "78.3");
assert.strictEqual(field(r1, "fio2").value, "21.0");
assert.strictEqual(field(r1, "fio2").unit, "percent");
assert.strictEqual(field(r1, "potassium").value, "5.3");
assert.strictEqual(field(r1, "sodium").value, "132");
assert.strictEqual(field(r1, "calcium").value, "0.81");
assert.strictEqual(field(r1, "chloride").value, "105");
assert.strictEqual(field(r1, "glucose").value, "43");
assert.strictEqual(field(r1, "glucose").unit, "mg/dL");
assert.strictEqual(field(r1, "lactate").value, "0.9");
assert.strictEqual(field(r1, "sbe").value, "-7.4");
assert.strictEqual(field(r1, "hco3").value, "18.3");
assert.strictEqual(field(r1, "measuredOsmolality").value, "266.1");
assert.strictEqual(field(r1, "sampleType").value, "arterial");
assert.strictEqual(r1.matchedCount, 14);
assert.strictEqual(r1.totalPrintable, 14);

// --- Fixture 2: real report text (SARBESWAR, sample #13774), with realistic
// OCR noise (O->0 substitution, missing/garbled superscripts, an
// interleaved handwritten annotation line that must be ignored) ---
const report2 = `
RADIOMETER ABL800 FLEX
PRVC
PLEEP-6
Identifications
Patient ID 8018493342
Sample type Arterial
FO2(l) 30.0 %

Blood Gas Values
pH 7.374 [ 7.350 - 7.450 ]
pC02 41.7 mmHg [ 35.0 - 45.0 ]
p02 111 mmHg [ 70.0 - 100 ]
Electrolyte Values
cKt 3.3 mmol/L [ 3.5 - 5.0 ]
cNat 145 mmol/L [ 135 - 150 ]
cCa2' 1.01 mmol/L [ 0.80 - 1.20 ]
cCl- 106 mmol/L [ 88 - 108 ]
Metabolite Values
cGlu 150 mg/dL [ 70 - 140 ]
cLac 0.7 mmol/L [ 0.0 - 2.0 ]
Acid Base Status
cBase(Ecf)c -0.8 mmol/L
cHCO3-(P,st)c 23.5 mmol/L
mOsmc 298.3 mmol/kg
`;

const r2 = ABGParser.parse(report2);
assert.strictEqual(field(r2, "pH").value, "7.374");
assert.strictEqual(field(r2, "paCO2").value, "41.7", "tolerates pC02 (zero for O) OCR noise");
assert.strictEqual(field(r2, "paO2").value, "111", "tolerates p02 (zero for O) OCR noise");
assert.strictEqual(field(r2, "potassium").value, "3.3", "tolerates cKt for cK+ superscript noise");
assert.strictEqual(field(r2, "sodium").value, "145", "tolerates cNat for cNa+ superscript noise");
assert.strictEqual(field(r2, "calcium").value, "1.01", "tolerates cCa2' for cCa2+ superscript noise");
assert.strictEqual(field(r2, "sbe").value, "-0.8", "leading-minus base excess parses correctly");
assert.strictEqual(field(r2, "sampleType").value, "arterial");
// Handwritten annotation lines (PRVC, PLEEP-6) must not be matched to any field.
assert.strictEqual(Object.prototype.hasOwnProperty.call(r2.fields, "urea"), false);

// --- Adversarial: empty paste ---
const rEmpty = ABGParser.parse("");
assert.deepStrictEqual(rEmpty.fields, {});
assert.strictEqual(rEmpty.matchedCount, 0);

// --- Adversarial: garbage / non-report text ---
const rGarbage = ABGParser.parse("the quick brown fox jumps over the lazy dog 12345");
assert.strictEqual(rGarbage.matchedCount, 0);

// --- Adversarial: only handwritten annotations, no structured fields ---
const rHandwriting = ABGParser.parse("PRVC/6/18/380\nReceiving ABG\nDr. Anoranjan Jayasingh");
assert.strictEqual(rHandwriting.matchedCount, 0);

// --- Adversarial: partial paste (top half only, later fields never printed) ---
const rPartial = ABGParser.parse(`
Blood Gas Values
pH 7.301 [ 7.350 - 7.450 ]
pCO2 40.0 mmHg [ 35.0 - 45.0 ]
`);
assert.strictEqual(field(rPartial, "pH").value, "7.301");
assert.strictEqual(field(rPartial, "sodium"), undefined, "fields absent from a partial paste are simply not matched, not guessed");
assert.ok(rPartial.matchedCount < rPartial.totalPrintable);

// --- Adversarial: ambiguous match (two candidate numbers before the next boundary) ---
const rAmbiguous = ABGParser.parse("cK+ 3.5 4.2 mmol/L [ 3.5 - 5.0 ]\ncNa+ 140 mmol/L [ 135 - 150 ]");
assert.strictEqual(field(rAmbiguous, "potassium").confidence, "ambiguous");
assert.strictEqual(field(rAmbiguous, "potassium").value, "3.5", "takes the first candidate but flags it for review");
assert.strictEqual(field(rAmbiguous, "sodium").confidence, "unambiguous");

// --- Regression: real Tesseract.js output on a synthetic test report
// (not hand-written OCR noise) mangled "FO2(l)" into "F02(1)" (zero for
// the letter O) and "cHCO3" into "cHCO03" (spurious inserted zero).
// Found via an actual in-browser OCR run, not authored by hand. ---
const rRealOcrNoise = ABGParser.parse(`
Sample type Arterial
F02(1) 21.0 %
Blood Gas Values
pH 7.303 [ 7.350 - 7.450 ]
Acid Base Status
cHCO03-(P,st)c 18.3 mmol/L
`);
assert.strictEqual(field(rRealOcrNoise, "fio2").value, "21.0", "tolerates F02(1) for FO2(l), a real Tesseract misread");
assert.strictEqual(field(rRealOcrNoise, "hco3").value, "18.3", "tolerates cHCO03 for cHCO3, a real Tesseract misread");

// --- Regression: FiO2 in the header must not pick up the next line's
// value (e.g. "T 37.0 C" temperature) as a false second candidate just
// because "T" isn't a tracked label boundary. ---
const rHeaderLineBleed = ABGParser.parse(`
Identifications
Sample type Arterial
FO2(l) 21.0 %
T 37.0 C

Blood Gas Values
pH 7.303 [ 7.350 - 7.450 ]
`);
assert.strictEqual(field(rHeaderLineBleed, "fio2").value, "21.0");
assert.strictEqual(field(rHeaderLineBleed, "fio2").confidence, "unambiguous", "must not be flagged ambiguous just because the next header line (temperature) has a number too");

// --- Regression: found via real bedside phone-photo testing. A printed
// "5.3" (potassium) got OCR'd as "52" — a single, unambiguous-looking
// number that was silently accepted with no confidence flag, even though
// 52 mmol/L is not a survivable potassium. Per user feedback, an
// implausible value must not be shown at all (not even flagged) — the
// field is left blank, same as if nothing had been found, so a wrong
// number can never be glanced over under time pressure. ---
const rImplausibleValue = ABGParser.parse("cK+ 52 mmol/L [ 3.5 - 5.0 ]\ncNa+ 132 mmol/L [ 135 - 150 ]");
assert.strictEqual(field(rImplausibleValue, "potassium"), undefined, "an implausible value is left blank, not shown even with a flag");
assert.strictEqual(field(rImplausibleValue, "sodium").confidence, "unambiguous", "a plausible value is not affected just because another field on the same paste was implausible");
assert.strictEqual(rImplausibleValue.matchedCount, 1, "a rejected implausible value does not count toward the recognized total");

// --- Regression: found via realistic synthetic-photo testing. "cLac" got
// OCR'd as "clLac" (a stray inserted letter near the label's leading "c"),
// which silently dropped lactate entirely instead of just misreading it. ---
const rStrayLetter = ABGParser.parse("clLac 0.9 mmol/L [ 0.0 - 2.0 ]");
assert.strictEqual(field(rStrayLetter, "lactate").value, "0.9", "tolerates clLac for cLac, a real Tesseract misread");

// --- Adversarial: oversized paste is capped, not a crash/hang ---
const rOversized = ABGParser.parse("x".repeat(50000) + "\npH 7.4 [7.350-7.450]");
assert.strictEqual(rOversized.rawText.length, 20000, "input is capped at MAX_INPUT_LENGTH");

console.log("ocr-parser.test.js: all assertions passed");
