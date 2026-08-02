const assert = require("assert");

global.window = global;
require("./engine.js");

const settings = { agUpperLimit: 12, barometricPressure: 760, respiratoryQuotient: 0.8 };

const mixedCase = {
  pH: { value: "7.12", unit: "unitless" },
  paCO2: { value: "38", unit: "mmHg" },
  paO2: { value: "78", unit: "mmHg" },
  fio2: { value: "0.21", unit: "fraction" },
  hco3: { value: "12", unit: "mmol/L" },
  sbe: { value: "-15", unit: "mmol/L" },
  sodium: { value: "140", unit: "mmol/L" },
  potassium: { value: "4.8", unit: "mmol/L" },
  chloride: { value: "112", unit: "mmol/L" },
  lactate: { value: "6", unit: "mmol/L" },
  albumin: { value: "2.4", unit: "g/dL" },
  age: { value: "62", unit: "years" },
  glucose: { value: "165", unit: "mg/dL" },
  urea: { value: "42", unit: "BUN_mg_dL" },
  measuredOsmolality: { value: "318", unit: "mOsm/kg" },
  sampleType: "arterial",
  flags: { sepsis: true, shock: true, renalFailure: true }
};

const report = global.ABGEngine.analyze(mixedCase, settings);
assert.strictEqual(report.severity.pH_status, "Acidemia");
assert.strictEqual(report.metabolic_analysis.corrected_anion_gap, 20);
assert.strictEqual(report.alactic_base_excess.ABE, -9);
assert.strictEqual(report.stewart_light.residual_UI_after_lactate, -2.6);
assert.strictEqual(report.stewart_light.ABE, -9);
assert.strictEqual(report.stewart_light.albumin_raw_value, 2.4);
assert.strictEqual(report.stewart_light.albumin_raw_unit, "g/dL");
assert.strictEqual(report.stewart_light.albumin_g_per_L, 24);
assert.strictEqual(report.stewart_light.SBE_albumin, 4.8);
assert(report.stewart_light.stewart_light_tags.includes("strong ion acidosis"));
assert(report.stewart_light.final_stewart_summary.includes("Opposing metabolic processes"));
assert(report.stewart_light.acidifying_drivers.some((line) => line.includes("Strong ion effect")));
assert(report.stewart_light.alkalinising_drivers.some((line) => line.includes("Low-albumin effect")));
assert(report.stewart_light.clinical_inference.some((line) => line.includes("lactate does not fully explain")));
assert(report.stewart_light.suggested_actions.some((line) => line.includes("non-lactate fixed-acid burden")));
assert(report.final_diagnosis.some((line) => line.includes("additional respiratory acidosis")));
assert(report.treatment_suggestions.opening_summary.includes("mixed metabolic acidosis"));
assert(report.treatment_suggestions.ventilation_oxygenation.some((line) => line.includes("ventilatory failure")));
assert(report.treatment_suggestions.circulation_lactate.some((line) => line.includes("repeat lactate")));
assert(report.treatment_suggestions.fluids_strong_ion.some((line) => line.includes("balanced crystalloid")));
assert(report.treatment_suggestions.stewart_actions.some((line) => line.includes("non-lactate fixed-acid burden")));
assert(report.treatment_suggestions.escalation_triggers.some((line) => line.includes("Lactate")));

const treatmentText = JSON.stringify(report.treatment_suggestions).toLowerCase();
[
  "calculate anion gap",
  "check winter formula",
  "check winter compensation",
  "check compensation",
  "measure lactate",
  "correct anion gap for albumin",
  "look for high anion gap",
  "classify the acid-base disorder"
].forEach((phrase) => {
  assert(!treatmentText.includes(phrase), `Treatment output repeated diagnostic phrase: ${phrase}`);
});

const guessedAlbumin = global.ABGEngine.analyze({
  ...mixedCase,
  albumin: { value: "2.4", unit: "auto" }
}, settings);
assert.strictEqual(guessedAlbumin.metabolic_analysis.corrected_anion_gap, "");
assert(guessedAlbumin.unit_normalization.blocked_calculations.some((line) => line.includes("Corrected anion gap blocked")));
assert(guessedAlbumin.unit_normalization.blocked_calculations.some((line) => line.includes("Stewart light not calculated")));

const albuminThree = global.ABGEngine.analyze({
  ...mixedCase,
  albumin: { value: "3.0", unit: "g/dL" }
}, settings);
assert.strictEqual(albuminThree.stewart_light.albumin_g_per_L, 30);
assert.strictEqual(albuminThree.stewart_light.SBE_albumin, 3);

const venousCase = global.ABGEngine.analyze({
  ...mixedCase,
  sampleType: "venous"
}, settings);
assert(venousCase.oxygenation.oxygenation_interpretation.includes("arterial sample"));

const radiometerCase = global.ABGEngine.analyze({
  pH: { value: "7.003", unit: "unitless" },
  paCO2: { value: "49.3", unit: "mmHg" },
  paO2: { value: "50", unit: "mmHg" },
  fio2: { value: "100", unit: "percent" },
  hco3: { value: "11.7", unit: "mmol/L" },
  sbe: { value: "-17.4", unit: "mmol/L" },
  sodium: { value: "126", unit: "mmol/L" },
  potassium: { value: "3.6", unit: "mmol/L" },
  chloride: { value: "142", unit: "mmol/L" },
  lactate: { value: "12.1", unit: "mmol/L" },
  glucose: { value: "49", unit: "mg/dL" },
  measuredOsmolality: { value: "254.8", unit: "mOsm/kg" },
  sampleType: "arterial",
  flags: {}
}, settings);
assert.strictEqual(radiometerCase.metabolic_analysis.corrected_anion_gap, -27.7);
assert.strictEqual(radiometerCase.metabolic_analysis.anion_gap_category, "low anion gap");
assert.strictEqual(radiometerCase.alactic_base_excess.ABE, -5.3);
assert(radiometerCase.stepwise_interpretation.interpretation_steps.some((line) => line.includes("respiratory acidosis")));
assert(radiometerCase.stepwise_interpretation.calculations.some((line) => line.includes("Winter formula")));

console.log("ABG engine smoke tests passed.");
