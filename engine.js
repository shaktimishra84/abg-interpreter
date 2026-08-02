(function () {
  "use strict";

  const INTERNAL_UNITS = {
    pH: "unitless",
    paCO2: "mmHg",
    paO2: "mmHg",
    hco3: "mmol/L",
    sbe: "mmol/L",
    sodium: "mmol/L",
    potassium: "mmol/L",
    chloride: "mmol/L",
    lactate: "mmol/L",
    albumin: "g/L",
    fio2: "fraction",
    glucose: "mmol/L",
    urea: "mmol/L",
    creatinine: "mg/dL",
    measuredOsmolality: "mOsm/kg",
    betaHydroxybutyrate: "mmol/L",
    urineSodium: "mmol/L",
    urinePotassium: "mmol/L",
    urineChloride: "mmol/L",
    urinePH: "unitless",
    phosphate: "mmol/L",
    calcium: "mmol/L",
    magnesium: "mmol/L"
  };

  const REQUIRED_FIELDS = [
    "pH",
    "paCO2",
    "paO2",
    "fio2",
    "hco3",
    "sbe",
    "sodium",
    "potassium",
    "chloride",
    "lactate",
    "albumin",
    "sampleType"
  ];

  const FLAG_LABELS = {
    vomiting: "Vomiting",
    diarrhea: "Diarrhea",
    renalFailure: "Renal failure",
    sepsis: "Sepsis",
    shock: "Shock",
    pregnancy: "Pregnancy",
    liverDisease: "Liver disease",
    salicylate: "Salicylate use",
    toxicAlcohol: "Toxic alcohol suspicion",
    diuretics: "Diuretics",
    acetazolamide: "Acetazolamide/topiramate",
    ventilated: "Ventilation support",
    hypertension: "Hypertension"
  };

  const round = (value, digits = 1) => {
    if (!Number.isFinite(value)) return "";
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  };

  const has = (value) => Number.isFinite(value);
  const inRange = (value, min, max) => value >= min && value <= max;

  function makeResult(field, rawValue, rawUnit, convertedValue, internalUnit, warning, confirmed) {
    return {
      field,
      rawValue,
      rawUnit,
      value: convertedValue,
      internalUnit,
      warning: warning || "",
      confirmed: Boolean(confirmed)
    };
  }

  function blocked(field, rawValue, rawUnit, warning) {
    return makeResult(field, rawValue, rawUnit, NaN, INTERNAL_UNITS[field] || "", warning, false);
  }

  function convertAutoGas(field, value, unit, isOxygen) {
    const label = field === "paCO2" ? "PaCO2" : "PaO2";
    if (unit === "mmHg") return makeResult(field, value, unit, value, "mmHg", "", true);
    if (unit === "kPa") return makeResult(field, value, unit, value * 7.5006, "mmHg", "", true);
    if (field === "paCO2") {
      if (inRange(value, 3, 15)) {
        return makeResult(field, value, "auto", value * 7.5006, "mmHg", `${label} ${value} likely kPa; converted to ${round(value * 7.5006)} mmHg.`, false);
      }
      if (inRange(value, 20, 100)) {
        return makeResult(field, value, "auto", value, "mmHg", `${label} ${value} likely mmHg.`, false);
      }
    }
    if (isOxygen) {
      if (value >= 5 && value < 40) {
        return makeResult(field, value, "auto", value * 7.5006, "mmHg", `${label} ${value} likely kPa; converted to ${round(value * 7.5006)} mmHg.`, false);
      }
      if (inRange(value, 40, 600)) {
        return makeResult(field, value, "auto", value, "mmHg", `${label} ${value} likely mmHg.`, false);
      }
    }
    return blocked(field, value, "auto", `${label} unit is ambiguous. Confirm mmHg or kPa before using dependent calculations.`);
  }

  function convertField(field, rawValue, rawUnit) {
    const value = Number(rawValue);
    const unit = rawUnit || "auto";
    if (!Number.isFinite(value)) return makeResult(field, NaN, unit, NaN, INTERNAL_UNITS[field] || "", "", unit !== "auto");

    switch (field) {
      case "pH":
      case "age":
      case "urinePH":
      case "measuredOsmolality":
        return makeResult(field, value, unit, value, INTERNAL_UNITS[field] || "", "", true);
      case "paCO2":
        return convertAutoGas(field, value, unit, false);
      case "paO2":
        return convertAutoGas(field, value, unit, true);
      case "fio2":
        if (unit === "fraction") return makeResult(field, value, unit, value, "fraction", "", true);
        if (unit === "percent") return makeResult(field, value, unit, value / 100, "fraction", "", true);
        if (value > 1 && value <= 100) {
          return makeResult(field, value, "auto", value / 100, "fraction", `FiO2 ${value} interpreted as ${value}%.`, false);
        }
        if (value >= 0.21 && value <= 1) {
          return makeResult(field, value, "auto", value, "fraction", `FiO2 ${value} interpreted as a fraction.`, false);
        }
        return blocked(field, value, "auto", "FiO2 unit is ambiguous or outside expected range.");
      case "hco3":
      case "sbe":
      case "sodium":
      case "potassium":
      case "chloride":
      case "urineSodium":
      case "urinePotassium":
      case "urineChloride":
        return makeResult(field, value, unit, value, INTERNAL_UNITS[field], unit === "mEq/L" ? `${field} entered as mEq/L; treated as mmol/L for monovalent ions.` : "", unit !== "auto");
      case "lactate":
        if (unit === "mg/dL") return makeResult(field, value, unit, value / 9, "mmol/L", "", true);
        if (unit === "mEq/L" || unit === "mmol/L") return makeResult(field, value, unit, value, "mmol/L", unit === "mEq/L" ? "Lactate mEq/L treated as approximately mmol/L." : "", true);
        if (inRange(value, 0.2, 30)) return makeResult(field, value, "auto", value, "mmol/L", `Lactate ${value} assumed mmol/L. Select mg/dL if the lab reported mg/dL.`, false);
        return blocked(field, value, "auto", "Lactate unit is ambiguous.");
      case "albumin":
        if (unit === "g/L") return makeResult(field, value, unit, value, "g/L", "", true);
        if (unit === "g/dL") return makeResult(field, value, unit, value * 10, "g/L", "", true);
        if (inRange(value, 2, 6)) return makeResult(field, value, "auto", value * 10, "g/L", `Albumin ${value} likely g/dL; converted to ${round(value * 10)} g/L.`, false);
        if (inRange(value, 20, 60)) return makeResult(field, value, "auto", value, "g/L", `Albumin ${value} likely g/L.`, false);
        return blocked(field, value, "auto", "Albumin unit is ambiguous. Confirm g/L or g/dL.");
      case "glucose":
        if (unit === "mg/dL") return makeResult(field, value, unit, value / 18, "mmol/L", "", true);
        if (unit === "mmol/L") return makeResult(field, value, unit, value, "mmol/L", "", true);
        if (inRange(value, 3, 30)) return makeResult(field, value, "auto", value, "mmol/L", `Glucose ${value} likely mmol/L.`, false);
        if (inRange(value, 40, 600)) return makeResult(field, value, "auto", value / 18, "mmol/L", `Glucose ${value} likely mg/dL; converted to ${round(value / 18, 1)} mmol/L.`, false);
        return blocked(field, value, "auto", "Glucose unit is ambiguous.");
      case "urea":
        if (unit === "urea_mmol_L") return makeResult(field, value, unit, value, "mmol/L", "", true);
        if (unit === "BUN_mg_dL") return makeResult(field, value, unit, value / 2.8, "mmol/L", "", true);
        if (unit === "urea_mg_dL") return makeResult(field, value, unit, value / 6, "mmol/L", "", true);
        return blocked(field, value, "auto", "Urea/BUN unit must be confirmed before osmolal gap calculation.");
      case "creatinine":
        if (unit === "mg/dL") return makeResult(field, value, unit, value, "mg/dL", "", true);
        if (unit === "micromol/L") return makeResult(field, value, unit, value / 88.4, "mg/dL", "", true);
        if (inRange(value, 0.3, 15)) return makeResult(field, value, "auto", value, "mg/dL", `Creatinine ${value} likely mg/dL.`, false);
        if (inRange(value, 30, 1200)) return makeResult(field, value, "auto", value / 88.4, "mg/dL", `Creatinine ${value} likely micromol/L; converted to ${round(value / 88.4, 2)} mg/dL.`, false);
        return blocked(field, value, "auto", "Creatinine unit is ambiguous.");
      case "betaHydroxybutyrate":
        if (unit === "mg/dL") return makeResult(field, value, unit, value / 10.4, "mmol/L", "", true);
        return makeResult(field, value, unit, value, "mmol/L", "", unit !== "auto");
      case "phosphate":
        if (unit === "mg/dL") return makeResult(field, value, unit, value / 3.1, "mmol/L", "", true);
        return makeResult(field, value, unit, value, "mmol/L", "", unit !== "auto");
      case "calcium":
        if (unit === "mg/dL") return makeResult(field, value, unit, value / 4, "mmol/L", "", true);
        return makeResult(field, value, unit, value, "mmol/L", "", unit !== "auto");
      case "magnesium":
        if (unit === "mg/dL") return makeResult(field, value, unit, value / 2.43, "mmol/L", "", true);
        return makeResult(field, value, unit, value, "mmol/L", "", unit !== "auto");
      default:
        return makeResult(field, value, unit, value, INTERNAL_UNITS[field] || "", "", unit !== "auto");
    }
  }

  function normalize(raw) {
    const converted = {};
    const warnings = [];
    const blockedCalculations = [];
    Object.keys(INTERNAL_UNITS).concat(["age"]).forEach((field) => {
      if (!raw[field] || raw[field].value === "") {
        converted[field] = makeResult(field, NaN, raw[field]?.unit || "", NaN, INTERNAL_UNITS[field] || "", "", false);
        return;
      }
      converted[field] = convertField(field, raw[field].value, raw[field].unit);
      if (converted[field].warning) warnings.push(converted[field].warning);
    });

    if (raw.sampleType) converted.sampleType = raw.sampleType;
    return { converted, warnings, blockedCalculations };
  }

  function validate(v) {
    const danger = [];
    const validation = [];
    const impossible = [
      ["pH", v.pH.value, 6.7, 7.8, "pH"],
      ["paCO2", v.paCO2.value, 5, 150, "PaCO2"],
      ["hco3", v.hco3.value, 2, 60, "HCO3"],
      ["sodium", v.sodium.value, 100, 180, "Sodium"],
      ["chloride", v.chloride.value, 60, 140, "Chloride"],
      ["lactate", v.lactate.value, 0, 30, "Lactate"]
    ];

    impossible.forEach(([field, value, min, max, label]) => {
      if (has(value) && !inRange(value, min, max)) {
        validation.push(`${label} is outside the validation range. Recheck value and unit.`);
      }
    });

    if (has(v.pH.value) && v.pH.value < 7.2) danger.push("pH <7.20: severe acidemia.");
    if (has(v.pH.value) && v.pH.value > 7.6) danger.push("pH >7.60: severe alkalemia.");
    if (has(v.pH.value) && (v.pH.value < 7.1 || v.pH.value > 7.65)) danger.push("Critical pH danger range.");
    if (has(v.lactate.value) && v.lactate.value >= 4) danger.push("Lactate >=4 mmol/L: severe hyperlactatemia.");
    if (has(v.pH.value) && has(v.paCO2.value) && v.pH.value < 7.38 && v.paCO2.value > 42) {
      danger.push("Acidemia with high PaCO2: possible ventilatory failure.");
    }
    return { danger, validation };
  }

  function classifyPH(pH) {
    if (!has(pH)) return "pH unavailable";
    if (pH < 7.38) return "Acidemia";
    if (pH <= 7.42) return "Near-normal pH";
    return "Alkalemia";
  }

  function tendencies(v) {
    return {
      metabolicAcidosis: has(v.hco3.value) && v.hco3.value < 22,
      metabolicAlkalosis: has(v.hco3.value) && v.hco3.value > 26,
      respiratoryAcidosis: has(v.paCO2.value) && v.paCO2.value > 42,
      respiratoryAlkalosis: has(v.paCO2.value) && v.paCO2.value < 38
    };
  }

  function primaryInterpretation(v, metabolic) {
    const pHStatus = classifyPH(v.pH.value);
    const t = tendencies(v);
    const disorders = [];
    const notes = [];
    const tags = [];

    if (pHStatus === "Acidemia") {
      if (t.metabolicAcidosis && t.respiratoryAcidosis) disorders.push("Mixed metabolic acidosis plus respiratory acidosis");
      else if (t.metabolicAcidosis) disorders.push("Primary metabolic acidosis");
      else if (t.respiratoryAcidosis) disorders.push("Primary respiratory acidosis");
      else disorders.push("Acidemia without a matching HCO3/PaCO2 pattern");
      tags.push("acid");
    } else if (pHStatus === "Alkalemia") {
      if (t.metabolicAlkalosis && t.respiratoryAlkalosis) disorders.push("Mixed metabolic alkalosis plus respiratory alkalosis");
      else if (t.metabolicAlkalosis) disorders.push("Primary metabolic alkalosis");
      else if (t.respiratoryAlkalosis) disorders.push("Primary respiratory alkalosis");
      else disorders.push("Alkalemia without a matching HCO3/PaCO2 pattern");
      tags.push("alkali");
    } else if (pHStatus === "Near-normal pH") {
      const abnormal = [
        t.metabolicAcidosis && "metabolic acidosis tendency",
        t.metabolicAlkalosis && "metabolic alkalosis tendency",
        t.respiratoryAcidosis && "respiratory acidosis tendency",
        t.respiratoryAlkalosis && "respiratory alkalosis tendency",
        has(v.sbe.value) && Math.abs(v.sbe.value) > 2 && "abnormal base excess",
        metabolic.anionGapCategory && metabolic.anionGapCategory !== "normal anion gap" && "abnormal anion gap",
        has(v.lactate.value) && v.lactate.value > 2 && "elevated lactate"
      ].filter(Boolean);
      if (abnormal.length) {
        disorders.push("Near-normal pH with compensated or mixed acid-base disorder");
        notes.push(`Do not report as normal ABG: ${abnormal.join(", ")}.`);
        tags.push("warn");
      } else {
        disorders.push("No major acid-base disorder detected by available required values");
      }
    } else {
      disorders.push("Insufficient required values for primary interpretation");
      tags.push("warn");
    }

    return { pHStatus, disorders, notes, tags, tendencies: t };
  }

  function compareMeasured(measured, low, high, highText, lowText, okText) {
    if (!has(measured) || !has(low) || !has(high)) return "";
    if (measured > high) return highText;
    if (measured < low) return lowText;
    return okText;
  }

  function compensation(v, primary) {
    const lines = [];
    const expected = {};
    const hco3 = v.hco3.value;
    const paCO2 = v.paCO2.value;
    const t = primary.tendencies;

    if (t.metabolicAcidosis && has(hco3)) {
      const center = 1.5 * hco3 + 8;
      expected.expected_PaCO2_metabolic_acidosis = `${round(center - 2)}-${round(center + 2)} mmHg`;
      lines.push(compareMeasured(
        paCO2,
        center - 2,
        center + 2,
        `Winter formula predicts PaCO2 ${round(center - 2)}-${round(center + 2)} mmHg; measured ${round(paCO2)} is higher, suggesting additional respiratory acidosis.`,
        `Winter formula predicts PaCO2 ${round(center - 2)}-${round(center + 2)} mmHg; measured ${round(paCO2)} is lower, suggesting additional respiratory alkalosis.`,
        `Winter formula predicts PaCO2 ${round(center - 2)}-${round(center + 2)} mmHg; measured ${round(paCO2)} is within expected compensation.`
      ));
    }

    if (t.metabolicAlkalosis && has(hco3)) {
      const center = 0.7 * (hco3 - 24) + 40;
      expected.expected_PaCO2_metabolic_alkalosis = `${round(center - 2)}-${round(center + 2)} mmHg`;
      lines.push(compareMeasured(
        paCO2,
        center - 2,
        center + 2,
        `Expected PaCO2 for metabolic alkalosis is ${round(center - 2)}-${round(center + 2)} mmHg; measured ${round(paCO2)} is higher, suggesting additional respiratory acidosis.`,
        `Expected PaCO2 for metabolic alkalosis is ${round(center - 2)}-${round(center + 2)} mmHg; measured ${round(paCO2)} is lower, suggesting additional respiratory alkalosis.`,
        `Measured PaCO2 fits expected compensation for metabolic alkalosis, noting compensation is less predictable.`
      ));
    }

    if (t.respiratoryAcidosis && has(paCO2)) {
      const acute = 24 + 1 * ((paCO2 - 40) / 10);
      const chronic = 24 + 4 * ((paCO2 - 40) / 10);
      expected.expected_HCO3_respiratory_acidosis_acute = `${round(acute)} mmol/L`;
      expected.expected_HCO3_respiratory_acidosis_chronic = `${round(chronic)} mmol/L`;
      if (has(hco3)) {
        if (hco3 < acute - 2) lines.push(`HCO3 ${round(hco3)} is below expected acute respiratory acidosis compensation, suggesting additional metabolic acidosis.`);
        else if (hco3 > chronic + 2) lines.push(`HCO3 ${round(hco3)} is above expected chronic respiratory acidosis compensation, suggesting additional metabolic alkalosis.`);
        else lines.push(`HCO3 ${round(hco3)} lies between acute (${round(acute)}) and chronic (${round(chronic)}) respiratory acidosis compensation estimates.`);
      }
    }

    if (t.respiratoryAlkalosis && has(paCO2)) {
      const acute = 24 - 2 * ((40 - paCO2) / 10);
      const chronic = 24 - 4 * ((40 - paCO2) / 10);
      expected.expected_HCO3_respiratory_alkalosis_acute = `${round(acute)} mmol/L`;
      expected.expected_HCO3_respiratory_alkalosis_chronic = `${round(chronic)} mmol/L`;
      if (has(hco3)) {
        if (hco3 < chronic - 2) lines.push(`HCO3 ${round(hco3)} is below expected chronic respiratory alkalosis compensation, suggesting additional metabolic acidosis.`);
        else if (hco3 > acute + 2) lines.push(`HCO3 ${round(hco3)} is above expected acute respiratory alkalosis compensation, suggesting additional metabolic alkalosis.`);
        else lines.push(`HCO3 ${round(hco3)} lies between acute (${round(acute)}) and chronic (${round(chronic)}) respiratory alkalosis compensation estimates.`);
      }
    }

    return { lines: lines.filter(Boolean), expected };
  }

  function metabolicAnalysis(v, settings) {
    const agUpper = Number(settings.agUpperLimit) || 12;
    const result = {
      anionGap: NaN,
      correctedAnionGap: NaN,
      anionGapCategory: "",
      deltaAG: NaN,
      deltaHCO3: NaN,
      deltaGap: NaN,
      deltaInterpretation: "",
      lactateDeltaCheck: NaN,
      lactateDeltaInterpretation: "",
      calculatedOsmolality: NaN,
      osmolalGap: NaN,
      osmolalInterpretation: "",
      urinaryAnionGap: NaN,
      urineInterpretation: "",
      alkalosisInterpretation: "",
      albuminCorrectionBlocked: false
    };

    if (has(v.sodium.value) && has(v.chloride.value) && has(v.hco3.value)) {
      result.anionGap = v.sodium.value - (v.chloride.value + v.hco3.value);
      if (has(v.albumin.value) && !v.albumin.confirmed) {
        result.albuminCorrectionBlocked = true;
        result.anionGapCategory = "albumin correction blocked";
      } else {
        result.correctedAnionGap = result.anionGap;
        if (has(v.albumin.value)) result.correctedAnionGap = result.anionGap + 0.25 * (40 - v.albumin.value);
        if (result.correctedAnionGap > agUpper) result.anionGapCategory = "high anion gap";
        else if (result.correctedAnionGap < 3) result.anionGapCategory = "low anion gap";
        else result.anionGapCategory = "normal anion gap";
        result.deltaAG = result.correctedAnionGap - agUpper;
        result.deltaHCO3 = 24 - v.hco3.value;
        result.deltaGap = result.deltaAG - result.deltaHCO3;
      }

      if (result.correctedAnionGap > agUpper) {
        if (result.deltaGap > 5) result.deltaInterpretation = "High anion gap metabolic acidosis plus metabolic alkalosis.";
        else if (result.deltaGap < -5) result.deltaInterpretation = "High anion gap metabolic acidosis plus normal anion gap acidosis.";
        else result.deltaInterpretation = "Delta gap fits simple high anion gap metabolic acidosis.";
        result.lactateDeltaCheck = 0.6 * result.deltaAG - result.deltaHCO3;
        if (result.lactateDeltaCheck > 5) result.lactateDeltaInterpretation = "Lactic acidosis plus metabolic alkalosis pattern.";
        else if (result.lactateDeltaCheck < -5) result.lactateDeltaInterpretation = "Lactic acidosis plus normal anion gap acidosis pattern.";
        else result.lactateDeltaInterpretation = "Lactate can plausibly explain the high anion gap pattern.";
      }
    }

    if (has(v.measuredOsmolality.value) && has(v.sodium.value) && has(v.glucose.value) && has(v.urea.value)) {
      if (v.glucose.confirmed && v.urea.confirmed) {
        result.calculatedOsmolality = 2 * v.sodium.value + v.glucose.value + v.urea.value;
        result.osmolalGap = v.measuredOsmolality.value - result.calculatedOsmolality;
        result.osmolalInterpretation = result.osmolalGap > 10
          ? "Osmolal gap is elevated; toxic alcohols are important but not the only cause."
          : "Osmolal gap is not elevated by the >10 mOsm/kg threshold.";
      }
    }

    if (has(v.urineSodium.value) && has(v.urinePotassium.value) && has(v.urineChloride.value)) {
      result.urinaryAnionGap = v.urineSodium.value + v.urinePotassium.value - v.urineChloride.value;
      if (result.urinaryAnionGap < 0) result.urineInterpretation = "Negative urinary anion gap suggests appropriate ammonium excretion, often gastrointestinal bicarbonate loss.";
      else result.urineInterpretation = "Positive urinary anion gap suggests impaired renal acid excretion or renal failure.";
    }

    if (has(v.urineChloride.value)) {
      if (v.urineChloride.value < 20) result.alkalosisInterpretation = "Urine chloride <20 mmol/L: chloride-responsive metabolic alkalosis pattern.";
      else if (v.urineChloride.value >= 25) result.alkalosisInterpretation = "Urine chloride >=25 mmol/L: chloride-resistant or renal chloride-wasting alkalosis pattern.";
      else result.alkalosisInterpretation = "Urine chloride is borderline for alkalosis classification.";
    }

    return result;
  }

  function stewartLight(v) {
    const out = {
      input_units_validated: false,
      eligible: false,
      Na: NaN,
      Cl: NaN,
      pH: NaN,
      SBE: NaN,
      albumin_raw_value: NaN,
      albumin_raw_unit: "",
      albumin_g_per_L: NaN,
      lactate_mmol_per_L: NaN,
      Na_minus_Cl: NaN,
      pH_adjusted_reference_Na_minus_Cl: NaN,
      reference_Na_minus_Cl: NaN,
      SBE_SID: NaN,
      SBE_SID_interpretation: "",
      SBE_albumin: NaN,
      SBE_albumin_interpretation: "",
      SBE_unmeasured_ions: NaN,
      SBE_unmeasured_ions_interpretation: "",
      residual_UI_after_lactate: NaN,
      SBE_unmeasured_ions_after_lactate: NaN,
      residual_UI_after_lactate_interpretation: "",
      ABE: NaN,
      ABE_interpretation: "",
      stewart_light_tags: [],
      final_stewart_summary: "",
      acidifying_drivers: [],
      alkalinising_drivers: [],
      clinical_inference: [],
      suggested_actions: [],
      quality_flags: [],
      missing_inputs: [],
      unit_warnings: [],
      interpretation: [],
      blockedReason: ""
    };

    const labels = {
      pH: "pH",
      sbe: "SBE/BE",
      sodium: "Na",
      chloride: "Cl",
      albumin: "albumin",
      lactate: "lactate"
    };
    const baseFields = ["pH", "sbe", "sodium", "chloride", "albumin"];
    const allFields = baseFields.concat("lactate");
    out.missing_inputs = allFields.filter((field) => !has(v[field].value)).map((field) => labels[field]);

    const baseUnitFields = ["pH", "sbe", "sodium", "chloride", "albumin"];
    const baseUnitProblems = baseUnitFields.filter((field) => has(v[field].value) && !v[field].confirmed);
    const lactateUnitProblem = has(v.lactate.value) && !v.lactate.confirmed;
    const unitProblems = baseUnitProblems.concat(lactateUnitProblem ? ["lactate"] : []);
    if (unitProblems.length) {
      out.unit_warnings.push(`Stewart light needs explicit units for ${unitProblems.map((field) => labels[field]).join(", ")}.`);
    }

    const missingBase = baseFields.filter((field) => !has(v[field].value));
    if (missingBase.length) {
      out.blockedReason = `Stewart light incomplete: add ${missingBase.map((field) => labels[field]).join(", ")} to partition the metabolic component.`;
      out.final_stewart_summary = out.blockedReason;
      out.interpretation = [out.blockedReason];
      return out;
    }
    if (baseUnitProblems.length) {
      out.blockedReason = `Stewart light not calculated because ${baseUnitProblems.map((field) => labels[field]).join(", ")} units are unclear.`;
      out.final_stewart_summary = out.blockedReason;
      out.interpretation = [out.blockedReason];
      return out;
    }

    const tags = new Set();
    const addTag = (tag) => tags.add(tag);
    const rounded = (value, digits = 2) => round(value, digits);

    out.input_units_validated = !unitProblems.length;
    out.eligible = true;
    out.Na = v.sodium.value;
    out.Cl = v.chloride.value;
    out.pH = v.pH.value;
    out.SBE = v.sbe.value;
    out.albumin_raw_value = v.albumin.rawValue;
    out.albumin_raw_unit = v.albumin.rawUnit || v.albumin.internalUnit || "g/L";
    out.albumin_g_per_L = v.albumin.value;
    out.lactate_mmol_per_L = lactateUnitProblem ? NaN : v.lactate.value;
    out.Na_minus_Cl = out.Na - out.Cl;
    out.pH_adjusted_reference_Na_minus_Cl = (out.pH < 7.3 || out.pH > 7.5)
      ? 35 + 15 * (7.4 - out.pH)
      : 35;
    out.reference_Na_minus_Cl = out.pH_adjusted_reference_Na_minus_Cl;
    out.SBE_SID = out.Na_minus_Cl - out.pH_adjusted_reference_Na_minus_Cl;
    out.SBE_albumin = 0.3 * (40 - out.albumin_g_per_L);
    out.SBE_unmeasured_ions = out.SBE - out.SBE_SID - out.SBE_albumin;

    if (out.SBE_SID < -2) {
      out.SBE_SID_interpretation = "strong ion acidosis; the Na-Cl relationship is acidifying the patient, usually from relative hyperchloremia or low SID";
      addTag("strong ion acidosis");
    } else if (out.SBE_SID > 2) {
      out.SBE_SID_interpretation = "strong ion alkalosis; the Na-Cl relationship is alkalinising the patient, often from hypochloremia or high SID";
      addTag("strong ion alkalosis");
      addTag("hypochloremic alkalosis");
    } else {
      out.SBE_SID_interpretation = "no major strong ion effect by the +/-2 mmol/L threshold";
    }

    if (out.SBE_albumin > 2) {
      out.SBE_albumin_interpretation = "hypoalbuminemic alkalosis; low albumin is alkalinising and may mask metabolic acidosis";
      addTag("hypoalbuminemic alkalosis");
    } else if (out.SBE_albumin < -2) {
      out.SBE_albumin_interpretation = "weak acid acidosis / high albumin effect";
      addTag("weak acid acidosis");
    } else {
      out.SBE_albumin_interpretation = "no major albumin / weak acid effect";
    }

    if (out.SBE_unmeasured_ions < -2) {
      out.SBE_unmeasured_ions_interpretation = "unmeasured anion acidosis";
      addTag("unmeasured anion acidosis");
    } else if (out.SBE_unmeasured_ions > 2) {
      out.SBE_unmeasured_ions_interpretation = "possible unmeasured cation effect, unexplained alkalinising component, or analytical/unit error; check unit and analyzer error before rare causes";
      addTag("possible unmeasured cation effect");
      addTag("possible analytical or unit error");
    } else {
      out.SBE_unmeasured_ions_interpretation = "no major unmeasured ion effect";
    }

    if (has(out.lactate_mmol_per_L)) {
      out.residual_UI_after_lactate = out.SBE_unmeasured_ions + out.lactate_mmol_per_L;
      out.SBE_unmeasured_ions_after_lactate = out.residual_UI_after_lactate;
      out.ABE = out.SBE + out.lactate_mmol_per_L;

      if (out.residual_UI_after_lactate < -2) {
        out.residual_UI_after_lactate_interpretation = "additional non-lactate fixed acids are present";
        addTag("non-lactate fixed-acid acidosis");
      } else if (out.residual_UI_after_lactate > 2) {
        out.residual_UI_after_lactate_interpretation = "lactate is present, but another alkalinising process, unmeasured cation, or analytical issue may be present";
        addTag("possible unmeasured cation effect");
        addTag("possible analytical or unit error");
      } else {
        out.residual_UI_after_lactate_interpretation = "lactate explains most of the unmeasured anion effect";
        if (out.SBE_unmeasured_ions < -2 && out.lactate_mmol_per_L > 2) addTag("lactate-dominant acidosis");
      }

      if (out.ABE < -5) {
        out.ABE_interpretation = "significant non-lactate fixed-acid burden";
        addTag("non-lactate fixed-acid acidosis");
      } else if (out.ABE < -2) {
        out.ABE_interpretation = "non-lactate metabolic acidosis";
        addTag("non-lactate fixed-acid acidosis");
      } else if (out.ABE > 2) {
        out.ABE_interpretation = "non-lactate alkalinising component";
      } else {
        out.ABE_interpretation = "near-neutral non-lactate metabolic component";
      }

      if (out.SBE_SID < -2 && out.lactate_mmol_per_L >= 4) addTag("mixed chloride and lactate acidosis");
      if (out.SBE_SID > 2 && out.SBE_unmeasured_ions < -2) addTag("hypochloremic alkalosis masking unmeasured anion acidosis");
      if (out.SBE_albumin > 2 && (out.SBE_unmeasured_ions < -2 || out.ABE < -2)) addTag("hypoalbuminemia masking metabolic acidosis");
    } else {
      out.residual_UI_after_lactate_interpretation = has(v.lactate.value)
        ? "incomplete because lactate units are unclear"
        : "incomplete because lactate is missing";
      out.ABE_interpretation = out.residual_UI_after_lactate_interpretation;
      if (has(v.lactate.value)) {
        out.blockedReason = "Stewart light lactate-adjusted residual and ABE are incomplete until lactate units are explicit.";
      } else {
        out.blockedReason = "Stewart light lactate-adjusted residual and ABE are incomplete until lactate is added.";
      }
    }

    const signed = (value) => `${value > 0 ? "+" : ""}${rounded(value)}`;
    const addUnique = (items, item) => {
      if (item && !items.includes(item)) items.push(item);
    };

    if (out.SBE_SID < -2) {
      addUnique(out.acidifying_drivers, `Strong ion effect (${signed(out.SBE_SID)} mmol/L)`);
      addUnique(out.clinical_inference, `The sodium-chloride relationship contributes a ${Math.abs(rounded(out.SBE_SID))} mmol/L acidifying effect, consistent with low strong ion difference / relative hyperchloremia.`);
      addUnique(out.suggested_actions, "Low strong ion difference is contributing to acidosis. Avoid further unnecessary 0.9% saline; prefer balanced crystalloid if fluid is required and appropriate.");
    } else if (out.SBE_SID > 2) {
      addUnique(out.alkalinising_drivers, `Strong ion effect (${signed(out.SBE_SID)} mmol/L)`);
      addUnique(out.clinical_inference, `The sodium-chloride relationship contributes a ${rounded(out.SBE_SID)} mmol/L alkalinising effect, consistent with high strong ion difference / relative hypochloremia.`);
      addUnique(out.suggested_actions, "A high strong ion difference is contributing to alkalosis. Assess chloride and volume depletion; consider sodium chloride and potassium chloride replacement only when clinically appropriate, and avoid blind saline loading if overloaded or hypertensive.");
    }

    if (out.SBE_albumin > 2) {
      addUnique(out.alkalinising_drivers, `Low-albumin effect (${signed(out.SBE_albumin)} mmol/L)`);
      addUnique(out.clinical_inference, `Low albumin contributes a ${rounded(out.SBE_albumin)} mmol/L alkalinising effect and may conceal the severity of an acidifying process.`);
      addUnique(out.suggested_actions, "Recognise the alkalinising albumin effect when judging the anion gap and base excess. Do not replace albumin solely to correct this calculated component; use a separate clinical indication and consultant review.");
    } else if (out.SBE_albumin < -2) {
      addUnique(out.acidifying_drivers, `Albumin / weak acid effect (${signed(out.SBE_albumin)} mmol/L)`);
      addUnique(out.clinical_inference, `The albumin / weak acid component contributes a ${Math.abs(rounded(out.SBE_albumin))} mmol/L acidifying effect.`);
      addUnique(out.suggested_actions, "A high-albumin / weak-acid effect is contributing. Confirm the albumin value and unit and treat the underlying clinical cause rather than the calculated component alone.");
    }

    if (out.SBE_unmeasured_ions < -2) {
      addUnique(out.acidifying_drivers, `Unmeasured anion effect (${signed(out.SBE_unmeasured_ions)} mmol/L)`);
      addUnique(out.clinical_inference, `Unmeasured anions contribute a ${Math.abs(rounded(out.SBE_unmeasured_ions))} mmol/L acidifying effect.`);
    } else if (out.SBE_unmeasured_ions > 2) {
      addUnique(out.alkalinising_drivers, `Positive unmeasured-ion component (${signed(out.SBE_unmeasured_ions)} mmol/L)`);
      addUnique(out.clinical_inference, "The positive unmeasured-ion component is physiologically discordant and may represent an opposing alkalinising process, unmeasured cation, or input/sample/analyzer error.");
      addUnique(out.suggested_actions, "The positive unmeasured-ion component should not trigger treatment for a rare cause until sodium, chloride, albumin, SBE, units, sample quality, and analyzer output are verified.");
      addUnique(out.quality_flags, "Positive SBE_UI: verify units, transcription, sample quality, and analyzer output before inferring an unmeasured cation.");
    }

    if (has(out.residual_UI_after_lactate)) {
      if (out.residual_UI_after_lactate < -2) {
        addUnique(out.clinical_inference, `After accounting for lactate, ${Math.abs(rounded(out.residual_UI_after_lactate))} mmol/L of additional acidifying unmeasured-ion effect remains; lactate does not fully explain the fixed-acid burden.`);
        addUnique(out.suggested_actions, "Additional non-lactate fixed-acid burden remains after lactate. Prioritise the clinically relevant ketone, renal failure, toxin, salicylate, phosphate/sulfate, or pyroglutamate pathway.");
      } else if (out.residual_UI_after_lactate > 2) {
        addUnique(out.clinical_inference, `After accounting for lactate, a ${rounded(out.residual_UI_after_lactate)} mmol/L alkalinising or discordant residual remains.`);
        addUnique(out.suggested_actions, "The lactate-adjusted residual remains positive. Verify inputs and sample/analyzer consistency and assess for an opposing alkalinising process before considering rare unmeasured cations.");
        addUnique(out.quality_flags, "Positive lactate-adjusted residual: verify the input set and assess for an opposing alkalinising process.");
      } else {
        addUnique(out.clinical_inference, "Lactate explains most of the unmeasured anion effect; additional non-lactate fixed-acid burden appears limited.");
      }
    }

    if (has(out.ABE)) {
      if (out.ABE < -5) {
        addUnique(out.clinical_inference, `Alactic Base Excess is ${signed(out.ABE)} mmol/L, confirming a significant non-lactate metabolic acid burden.`);
      } else if (out.ABE < -2) {
        addUnique(out.clinical_inference, `Alactic Base Excess is ${signed(out.ABE)} mmol/L, supporting residual non-lactate metabolic acidosis.`);
      } else if (out.ABE > 2) {
        addUnique(out.clinical_inference, `Alactic Base Excess is ${signed(out.ABE)} mmol/L, supporting a non-lactate alkalinising component.`);
      } else {
        addUnique(out.clinical_inference, `Alactic Base Excess is ${signed(out.ABE)} mmol/L, so the net non-lactate metabolic component is near neutral.`);
      }
    }

    if (Math.abs(out.SBE_SID) > 20) {
      addUnique(out.quality_flags, "The calculated strong-ion component is unusually large. Reconfirm sodium and chloride values, units, transcription, and sample/analyzer validity.");
    }

    if (out.acidifying_drivers.length && out.alkalinising_drivers.length) {
      out.final_stewart_summary = `Opposing metabolic processes are present. Acidifying drivers: ${out.acidifying_drivers.join(", ")}. Alkalinising drivers: ${out.alkalinising_drivers.join(", ")}.`;
    } else if (out.acidifying_drivers.length) {
      out.final_stewart_summary = `The metabolic component is acidifying, driven by ${out.acidifying_drivers.join(", ")}.`;
    } else if (out.alkalinising_drivers.length) {
      out.final_stewart_summary = `The metabolic component is alkalinising, driven by ${out.alkalinising_drivers.join(", ")}.`;
    } else {
      out.final_stewart_summary = "No major Stewart metabolic driver is identified by the +/-2 mmol/L thresholds.";
    }
    if (Math.abs(out.SBE) <= 2 && (out.acidifying_drivers.length || out.alkalinising_drivers.length)) {
      out.final_stewart_summary += " SBE is near zero, but this reflects opposing processes rather than true metabolic normality.";
    }
    if (has(out.residual_UI_after_lactate) && out.residual_UI_after_lactate < -2) {
      out.final_stewart_summary += " Lactate does not fully explain the unmeasured acid burden; additional non-lactate fixed acids remain.";
    } else if (has(out.residual_UI_after_lactate) && Math.abs(out.residual_UI_after_lactate) <= 2 && out.SBE_unmeasured_ions < -2) {
      out.final_stewart_summary += " Lactate explains most of the unmeasured anion effect.";
    }
    if (out.SBE_albumin > 2 && (out.SBE_unmeasured_ions < -2 || (has(out.ABE) && out.ABE < -2))) {
      out.final_stewart_summary += " Hypoalbuminemic alkalosis is masking part of the metabolic acidosis.";
    }
    if (out.quality_flags.length) {
      out.final_stewart_summary += " Verify the flagged inputs and analyzer/sample consistency before acting on discordant components.";
    }
    if (out.blockedReason) out.final_stewart_summary += ` ${out.blockedReason}`;

    out.stewart_light_tags = Array.from(tags);
    out.interpretation = [
      `Na-Cl difference is ${rounded(out.Na_minus_Cl)} mmol/L.`,
      `The pH-adjusted Na-Cl reference is ${rounded(out.pH_adjusted_reference_Na_minus_Cl)} mmol/L.`,
      `SBE_SID is ${rounded(out.SBE_SID)} mmol/L, indicating ${out.SBE_SID_interpretation}.`,
      `Albumin is ${rounded(out.albumin_g_per_L)} g/L.`,
      `SBE_Albumin is ${rounded(out.SBE_albumin)} mmol/L, indicating ${out.SBE_albumin_interpretation}.`,
      `SBE_UI is ${rounded(out.SBE_unmeasured_ions)} mmol/L, indicating ${out.SBE_unmeasured_ions_interpretation}.`
    ];
    if (has(out.lactate_mmol_per_L)) {
      out.interpretation.push(`Lactate is ${rounded(out.lactate_mmol_per_L)} mmol/L.`);
      out.interpretation.push(`Residual unmeasured ion effect after lactate is ${rounded(out.residual_UI_after_lactate)} mmol/L, indicating ${out.residual_UI_after_lactate_interpretation}.`);
      out.interpretation.push(`ABE is ${rounded(out.ABE)} mmol/L, indicating ${out.ABE_interpretation}.`);
    } else {
      out.interpretation.push(`Lactate-adjusted residual is ${out.residual_UI_after_lactate_interpretation}.`);
      out.interpretation.push(`ABE is ${out.ABE_interpretation}.`);
    }
    out.interpretation.push(`Overall Stewart light interpretation: ${out.final_stewart_summary}`);

    return out;
  }

  function alacticBaseExcess(v) {
    const out = { SBE: v.sbe.value, lactate: v.lactate.value, ABE: NaN, interpretation: "" };
    if (!has(v.sbe.value) || !has(v.lactate.value)) {
      out.interpretation = "Alactic base excess requires SBE and lactate in mmol/L.";
      return out;
    }
    out.ABE = v.sbe.value + v.lactate.value;
    if (out.ABE < -5) out.interpretation = "Significant non-lactate fixed-acid burden.";
    else if (out.ABE < -2) out.interpretation = "Non-lactate metabolic acidosis.";
    else if (out.ABE > 2) out.interpretation = "Non-lactate alkalinizing component.";
    else out.interpretation = "Near-neutral non-lactate metabolic component.";
    return out;
  }

  function oxygenation(v, settings) {
    const out = { A_a_gradient: NaN, PAO2: NaN, interpretation: "", blockedReason: "" };
    if (v.sampleType !== "arterial") {
      out.blockedReason = "A-a gradient blocked: oxygenation interpretation requires an arterial sample.";
      return out;
    }
    const required = ["paO2", "paCO2", "fio2"];
    const missing = required.filter((field) => !has(v[field].value));
    if (missing.length) {
      out.blockedReason = `A-a gradient blocked until ${missing.join(", ")} is available.`;
      return out;
    }
    if (!v.paO2.confirmed || !v.paCO2.confirmed || !v.fio2.confirmed) {
      out.blockedReason = "A-a gradient blocked until PaO2, PaCO2, and FiO2 units are confirmed.";
      return out;
    }
    const pb = Number(settings.barometricPressure) || 760;
    const rq = Number(settings.respiratoryQuotient) || 0.8;
    out.PAO2 = v.fio2.value * (pb - 47) - v.paCO2.value / rq;
    out.A_a_gradient = out.PAO2 - v.paO2.value;
    const elderly = has(v.age.value) && v.age.value >= 65;
    const limit = elderly ? 20 : 10;
    if (out.A_a_gradient <= limit) out.interpretation = `A-a gradient is within the ${limit} mmHg screening threshold.`;
    else if (out.A_a_gradient <= 20) out.interpretation = "A-a gradient is mildly elevated for young adults but may be acceptable in elderly patients.";
    else out.interpretation = "Elevated A-a gradient suggests V/Q mismatch, diffusion limitation, shunt, pneumonia, edema, ARDS, PE, or related pathology.";
    return out;
  }

  function likelyCauses(v, primary, metabolic, stewart, abe, flags) {
    const causes = [];
    const tests = new Set();
    const add = (cause) => {
      if (cause && !causes.includes(cause)) causes.push(cause);
    };
    const addTests = (items) => items.forEach((item) => tests.add(item));

    if (metabolic.anionGapCategory === "high anion gap") {
      add("High anion gap causes: glycols, 5-oxoproline, L-lactate, D-lactate, methanol, aspirin/salicylate, renal failure, rhabdomyolysis, ketoacidosis.");
      addTests(["beta-hydroxybutyrate", "renal function", "measured serum osmolality", "salicylate level", "toxic alcohol screen", "urine microscopy", "liver function", "creatine kinase"]);
    }
    if (has(v.lactate.value) && v.lactate.value >= 4) {
      add("Severe hyperlactatemia: consider shock, sepsis, tissue hypoperfusion, liver failure, seizures, or medications/toxins.");
      addTests(["repeat lactate", "source control assessment", "perfusion markers"]);
    }
    if (has(metabolic.osmolalGap) && metabolic.osmolalGap > 10) {
      add("High osmolal gap with acidosis raises toxic alcohol concern, while DKA, alcoholic ketoacidosis, and lactic acidosis remain possible.");
      addTests(["ethanol level", "methanol/ethylene glycol level", "repeat osmolality", "lactate gap check"]);
    }
    if (primary.tendencies.metabolicAcidosis && (metabolic.anionGapCategory === "normal anion gap" || metabolic.anionGapCategory === "low anion gap")) {
      add("Normal anion gap acidosis: consider saline/hyperchloremia, diarrhea, renal tubular acidosis, renal failure, ureteric diversion, acetazolamide/topiramate.");
      addTests(["urine sodium/potassium/chloride", "urine pH", "renal function", "medication review"]);
    }
    if (metabolic.anionGapCategory === "low anion gap") {
      add("Low or negative anion gap: recheck sodium/chloride/bicarbonate, consider marked hyperchloremia, hypoalbuminemia, paraproteins, lithium/bromide exposure, or analyzer/sample issue.");
      addTests(["repeat electrolytes", "albumin", "total protein", "medication/toxin review"]);
    }
    if (primary.tendencies.metabolicAlkalosis) {
      if (has(v.urineChloride.value) && v.urineChloride.value < 20) add("Chloride-responsive metabolic alkalosis: vomiting, nasogastric suction, remote diuretics, post-hypercapnic alkalosis.");
      if (has(v.urineChloride.value) && v.urineChloride.value >= 25) add("Chloride-resistant or renal chloride-wasting alkalosis: active diuretics, Bartter/Gitelman, mineralocorticoid excess, severe hypokalemia or magnesium deficiency.");
      addTests(["urine chloride", "potassium", "magnesium", "blood pressure", "renin/aldosterone if indicated", "diuretic history"]);
    }
    if (stewart.eligible && has(stewart.residual_UI_after_lactate) && stewart.residual_UI_after_lactate < -2) {
      add("Stewart residual non-lactate unmeasured anion effect: evaluate ketones, renal acids, toxins, phosphate/sulfate, and pyroglutamate risk.");
      addTests(["ketones", "phosphate", "toxicology", "pyroglutamate risk review"]);
    }
    if (has(abe.ABE) && abe.ABE < -2) {
      add("Alactic base excess suggests non-lactate fixed-acid burden.");
      addTests(["renal function", "ketones", "toxin screen", "phosphate/sulfate if available"]);
    }

    Object.keys(flags || {}).forEach((key) => {
      if (!flags[key]) return;
      const label = FLAG_LABELS[key] || key;
      if (key === "vomiting") add("Clinical flag: vomiting supports chloride-responsive alkalosis.");
      else if (key === "diarrhea") add("Clinical flag: diarrhea supports gastrointestinal bicarbonate loss.");
      else if (key === "renalFailure") add("Clinical flag: renal failure supports uremic acidosis or impaired acid excretion.");
      else if (key === "toxicAlcohol") add("Clinical flag: toxic alcohol suspicion requires osmolal gap/toxicology correlation.");
      else add(`Clinical flag: ${label}.`);
    });

    return { causes, recommendedMissingTests: Array.from(tests) };
  }

  function treatmentSuggestions(v, primary, metabolic, compensationResult, stewart, abe, oxy, flags, validation) {
    const immediateThreats = [];
    const ventilationOxygenation = [];
    const circulationLactate = [];
    const fluidsStrongIon = [];
    const electrolytes = [];
    const renalToxinDka = [];
    const bicarbonate = [];
    const stewartActions = [];
    const escalationTriggers = [];
    const bedsideSummary = [];
    const t = primary.tendencies || {};
    const hasFlag = (key) => Boolean(flags && flags[key]);
    const add = (items, item) => {
      if (item && !items.includes(item)) items.push(item);
    };
    const addMany = (items, values) => values.forEach((value) => add(items, value));
    const mixedDisorder = (primary.disorders || []).some((line) => line.toLowerCase().includes("mixed")) ||
      (compensationResult.lines || []).some((line) => line.toLowerCase().includes("additional"));
    const metabolicAcidosis = t.metabolicAcidosis || (has(v.sbe.value) && v.sbe.value < -2);
    const metabolicAlkalosis = t.metabolicAlkalosis || (has(v.sbe.value) && v.sbe.value > 2);
    const compensationText = (compensationResult.lines || []).join(" ").toLowerCase();
    const paCO2HigherThanExpected = compensationText.includes("higher") && compensationText.includes("additional respiratory acidosis");
    const paCO2LowerThanExpected = compensationText.includes("lower") && compensationText.includes("additional respiratory alkalosis");
    const respiratoryAcidosis = t.respiratoryAcidosis || paCO2HigherThanExpected;
    const respiratoryAlkalosis = t.respiratoryAlkalosis || paCO2LowerThanExpected;
    const normalAGAcidosis = metabolicAcidosis && (metabolic.anionGapCategory === "normal anion gap" || metabolic.anionGapCategory === "low anion gap");
    const lowUrineChloride = has(v.urineChloride.value) && v.urineChloride.value < 20;
    const highUrineChloride = has(v.urineChloride.value) && v.urineChloride.value >= 25;
    const chlorideResponsive = metabolicAlkalosis && (lowUrineChloride || hasFlag("vomiting") || hasFlag("diuretics"));
    const chlorideResistant = metabolicAlkalosis && (highUrineChloride || hasFlag("hypertension"));
    const potassium = v.potassium.value;
    const chlorideEffect = (has(v.chloride.value) && v.chloride.value > 110) || (stewart.eligible && has(stewart.SBE_SID) && stewart.SBE_SID < -2);
    const albuminLow = has(v.albumin.value) && v.albumin.value < 35;
    const uiNegative = stewart.eligible && has(stewart.SBE_unmeasured_ions) && stewart.SBE_unmeasured_ions < -2;
    const residualNearNeutral = stewart.eligible && has(stewart.residual_UI_after_lactate) && Math.abs(stewart.residual_UI_after_lactate) <= 2;
    const lactateHigh = has(v.lactate.value) && v.lactate.value >= 4;
    const lactateElevated = has(v.lactate.value) && v.lactate.value > 2;
    const aaHigh = has(oxy.A_a_gradient) && String(oxy.interpretation || "").toLowerCase().includes("elevated");
    const severePH = has(v.pH.value) && (v.pH.value < 7.1 || v.pH.value > 7.6);
    const renalConcern = hasFlag("renalFailure") || (has(v.creatinine.value) && v.creatinine.value >= 2) ||
      (metabolicAcidosis && severePH) || (has(potassium) && potassium >= 6);
    const toxinConcern = hasFlag("toxicAlcohol") || hasFlag("salicylate") || (has(metabolic.osmolalGap) && metabolic.osmolalGap > 10);
    const dkaConcern = metabolicAcidosis &&
      ((has(v.betaHydroxybutyrate.value) && v.betaHydroxybutyrate.value >= 3) ||
      (has(v.glucose.value) && v.glucose.value >= 13.9 && metabolic.anionGapCategory === "high anion gap"));
    const summaryParts = [];

    if (metabolicAcidosis && respiratoryAcidosis) summaryParts.push("mixed metabolic acidosis with additional respiratory acidosis");
    else if (metabolicAcidosis) summaryParts.push("metabolic acidosis");
    else if (metabolicAlkalosis) summaryParts.push("metabolic alkalosis");
    else if (respiratoryAcidosis) summaryParts.push("respiratory acidosis");
    else if (respiratoryAlkalosis) summaryParts.push("respiratory alkalosis");
    else summaryParts.push(primary.pHStatus.toLowerCase());
    if (lactateHigh) summaryParts.push("significant hyperlactatemia");
    else if (lactateElevated) summaryParts.push("elevated lactate");
    if (chlorideEffect) summaryParts.push("low strong ion/hyperchloremic acidosis");
    if (albuminLow) summaryParts.push("low albumin with alkalinising effect");
    if (uiNegative) summaryParts.push("unmeasured anion effect");
    if (aaHigh) summaryParts.push("impaired oxygen transfer suggested by high A-a gradient");

    if (metabolicAcidosis && respiratoryAcidosis) {
      add(immediateThreats, "Mixed metabolic and respiratory acidosis is present. Treat the metabolic cause and ventilatory failure simultaneously.");
    }
    if (severePH) add(immediateThreats, "Severe pH abnormality is present. Escalate early while treating the immediate airway, breathing, circulation, potassium, renal, toxin, or DKA threat.");
    if (respiratoryAcidosis || paCO2HigherThanExpected) add(immediateThreats, "Prioritise airway and breathing assessment because ventilatory failure may be contributing.");
    if (lactateHigh || hasFlag("shock") || hasFlag("sepsis")) add(immediateThreats, "Treat possible shock, sepsis, hypoxia, or tissue ischemia as an immediate threat until proven otherwise.");
    if (has(potassium) && (potassium < 3 || potassium > 5.5)) add(immediateThreats, "Dangerous potassium abnormality risk is present. Use cardiac monitoring and correct potassium according to ICU protocol.");
    if (renalConcern) add(immediateThreats, "Renal failure, severe acidosis, hyperkalemia, or oliguria risk should trigger early consultant/nephrology discussion.");
    if (toxinConcern) add(immediateThreats, "Toxic alcohol or salicylate risk should trigger the toxin pathway and urgent toxicology/nephrology discussion.");
    if (dkaConcern) add(immediateThreats, "Diabetic ketoacidosis pattern is possible. Use the local DKA pathway with potassium-guided insulin and fluids if clinically suspected.");

    if (paCO2HigherThanExpected) {
      add(ventilationOxygenation, "Measured PaCO2 is higher than expected, suggesting added ventilatory failure. Escalate airway and breathing assessment.");
      add(ventilationOxygenation, "Consider non-invasive ventilation or intubation depending on sensorium, work of breathing, oxygenation, shock, vomiting, and aspiration risk.");
    } else if (respiratoryAcidosis) {
      add(ventilationOxygenation, "Respiratory acidosis is present. Assess airway, ventilation, sensorium, work of breathing, oxygenation, and aspiration risk.");
      add(ventilationOxygenation, "Consider ventilatory support depending on clinical status, and treat reversible drivers such as bronchospasm, pneumonia, sedatives, opioid effect, neuromuscular weakness, or ventilator hypoventilation.");
    }
    if (respiratoryAlkalosis) {
      add(ventilationOxygenation, "Respiratory alkalosis is present. Treat hypoxemia, sepsis, fever, pain, anxiety, pneumonia, pulmonary embolism risk, or excessive ventilator minute ventilation as clinically appropriate.");
      add(ventilationOxygenation, "Do not sedate solely to normalize PaCO2 unless sedation is clinically required.");
    }
    if (aaHigh) {
      add(ventilationOxygenation, "High A-a gradient suggests impaired oxygen transfer. Evaluate for pneumonia, pulmonary edema, ARDS, pulmonary embolism, atelectasis, or shunt.");
      add(ventilationOxygenation, "Correlate the oxygenation abnormality with chest imaging, oxygen requirement, and bedside respiratory trajectory.");
    } else if (has(v.paO2.value) && v.paO2.value < 60) {
      add(ventilationOxygenation, "PaO2 is low. Support oxygenation and ventilation according to clinical status.");
    }

    if (lactateHigh) {
      add(circulationLactate, "Lactate is significantly elevated. Treat possible shock, sepsis, hypoxia, or tissue ischemia and repeat lactate after resuscitation.");
      add(circulationLactate, "Support oxygenation, optimise perfusion, use vasopressors if needed, and start cultures, antibiotics, and source control if sepsis is clinically suspected.");
    } else if (lactateElevated) {
      add(circulationLactate, "Lactate is elevated. Optimise oxygen delivery and perfusion, then repeat lactate based on clinical trajectory.");
    }
    if (hasFlag("shock") || hasFlag("sepsis")) {
      add(circulationLactate, "Shock or sepsis context is flagged. Prioritise perfusion, source control, and ongoing reassessment.");
    }

    if (chlorideEffect) {
      add(fluidsStrongIon, "Low strong ion difference/hyperchloremic effect is acidifying the patient. Avoid further unnecessary 0.9% saline; use balanced crystalloid if fluid is required and appropriate.");
    }
    if (normalAGAcidosis && !chlorideEffect) {
      add(fluidsStrongIon, "Normal-anion-gap acidosis is present. Treat likely gastrointestinal or renal bicarbonate loss according to context, and avoid excess chloride load.");
    }
    if (chlorideResponsive && !chlorideResistant) {
      add(fluidsStrongIon, "Chloride-responsive metabolic alkalosis is likely. Consider sodium chloride and potassium chloride replacement if hypovolemic.");
    }
    if (chlorideResistant) {
      add(fluidsStrongIon, "Chloride-resistant or saline-unresponsive alkalosis is possible. Replace potassium and magnesium, avoid blind saline loading if hypertensive or overloaded, and evaluate mineralocorticoid or renal chloride-wasting causes.");
    }
    if (albuminLow) {
      add(fluidsStrongIon, "Low albumin has an alkalinising effect and may mask the severity of metabolic acidosis. Interpret anion gap and base excess accordingly.");
    }
    if (uiNegative) {
      add(fluidsStrongIon, "Unmeasured anion effect is contributing. Correlate with lactate, ketones, renal failure, toxins, phosphate, sulfate, or pyroglutamate depending on context.");
    }
    if (residualNearNeutral) {
      add(fluidsStrongIon, "Lactate explains most of the unmeasured anion effect; additional non-lactate fixed acid burden appears limited.");
    }
    if (stewart.eligible) {
      (stewart.suggested_actions || []).forEach((item) => add(stewartActions, item));
    }

    add(electrolytes, "Correct potassium, magnesium, calcium, and phosphate according to ICU protocol.");
    if (has(potassium) && potassium >= 6) {
      add(electrolytes, "Hyperkalemia is urgent if ECG changes, rapid rise, renal failure, or severe acidosis are present: stabilise membrane when indicated, shift potassium, remove potassium, and stop potassium-raising drugs according to local protocol.");
    } else if (has(potassium) && potassium > 5.5) {
      add(electrolytes, "Potassium is elevated. Use ECG monitoring, stop potassium-raising drugs, and treat urgently if ECG changes, rapid rise, renal failure, or severe acidosis is present.");
    } else if (has(potassium) && potassium < 3) {
      add(electrolytes, "Hypokalemia is urgent with arrhythmia risk, weakness, digoxin use, or alkalosis: replace potassium chloride and correct magnesium according to ICU protocol.");
    }
    if (has(potassium) && (potassium < 3 || potassium > 5.5)) {
      add(electrolytes, "ECG monitoring is appropriate when potassium is abnormal or acidosis is severe.");
    }

    if (renalConcern) {
      add(renalToxinDka, "Review renal function and urine output. If acidosis worsens with oliguria, hyperkalemia, fluid overload, or uremic features, discuss renal replacement therapy.");
    }
    if (toxinConcern) {
      add(renalToxinDka, "Activate the toxic alcohol/salicylate pathway if clinically suspected, with urgent toxicology and nephrology discussion.");
    }
    if (dkaConcern) {
      add(renalToxinDka, "Start the local DKA protocol if clinically suspected, using potassium-guided insulin and fluids.");
    }

    add(bicarbonate, "Do not give bicarbonate routinely. Consider it only as a temporary bridge in severe acidemia with hemodynamic instability, severe hyperkalemia, renal failure, or bicarbonate-loss acidosis, after consultant review.");

    if (has(v.pH.value) && v.pH.value < 7.1) add(escalationTriggers, "pH <7.10.");
    if (has(v.pH.value) && v.pH.value > 7.6) add(escalationTriggers, "pH >7.60.");
    if (respiratoryAcidosis) add(escalationTriggers, "PaCO2 rising with drowsiness, fatigue, or ventilatory failure.");
    if (has(potassium) && potassium >= 6) add(escalationTriggers, "Potassium >=6.0 mmol/L or ECG changes.");
    if (has(potassium) && potassium < 2.5) add(escalationTriggers, "Potassium <2.5 mmol/L or arrhythmia.");
    if (lactateHigh) add(escalationTriggers, "Lactate >=4 mmol/L, rising lactate, or shock.");
    if (renalConcern) add(escalationTriggers, "Severe renal failure, oliguria, hyperkalemia, pulmonary edema, or uremic complication.");
    if (toxinConcern) add(escalationTriggers, "Suspected toxic alcohol or salicylate poisoning.");
    if (mixedDisorder) add(escalationTriggers, "Severe or clinically worsening mixed acid-base disorder.");
    add(escalationTriggers, "Need for intubation, vasopressor, or renal replacement therapy.");

    if (metabolicAcidosis && (hasFlag("shock") || hasFlag("sepsis") || lactateHigh)) add(bedsideSummary, "Acidosis plus shock/lactate: resuscitate, oxygenate, use source control/antibiotics when sepsis is suspected, use vasopressors if needed, and trend lactate.");
    if (metabolicAcidosis && respiratoryAcidosis) add(bedsideSummary, "Acidosis plus high PaCO2: support ventilation while treating the metabolic cause.");
    if (metabolicAcidosis && metabolic.anionGapCategory === "high anion gap") add(bedsideSummary, "High-anion-gap acidosis: prioritise lactate, ketone, renal failure, toxin, ischemia, seizure, or post-arrest pathways based on clinical context.");
    if (normalAGAcidosis) add(bedsideSummary, "Normal-anion-gap acidosis: consider diarrhea, renal tubular acidosis, or saline pathway; replace fluid and potassium and avoid excess saline.");
    if (chlorideResponsive) add(bedsideSummary, "Alkalosis with vomiting/diuretic/low chloride: saline plus potassium chloride and magnesium correction if hypovolemic.");
    if (chlorideResistant) add(bedsideSummary, "Alkalosis with hypertension or high urine chloride: potassium chloride and magnesium, avoid blind saline, and evaluate mineralocorticoid or renal causes.");
    if (has(potassium) && (potassium < 3 || potassium > 5.5)) add(bedsideSummary, "Any dangerous potassium abnormality: treat potassium first.");
    if (!bedsideSummary.length) add(bedsideSummary, "Treat the immediate threat first: airway/breathing, shock/sepsis/hypoxia, dangerous potassium, renal failure/toxin/DKA, or ongoing gastrointestinal/renal electrolyte loss.");

    const correctiveMeasures = []
      .concat(ventilationOxygenation)
      .concat(circulationLactate)
      .concat(fluidsStrongIon)
      .concat(stewartActions)
      .concat(electrolytes)
      .concat(renalToxinDka)
      .concat(bicarbonate);
    const safetyActions = immediateThreats.length ? immediateThreats : bedsideSummary.slice(0, 2);

    return {
      title: "Corrective measures",
      opening_summary: `This pattern suggests ${summaryParts.join(", ")}.`,
      purpose: "Initial stabilisation only. Final diagnosis, dose, fluid choice, ventilator strategy, renal replacement therapy, and definitive treatment should be decided by the consultant.",
      core_rule: "Do not treat pH alone. Treat the immediate threat: airway/breathing, shock/sepsis/hypoxia, dangerous potassium abnormality, renal failure/toxin/DKA, or ongoing gastrointestinal/renal electrolyte loss.",
      immediate_threats: immediateThreats,
      ventilation_oxygenation: ventilationOxygenation,
      circulation_lactate: circulationLactate,
      fluids_strong_ion: fluidsStrongIon,
      stewart_actions: stewartActions,
      electrolytes,
      renal_toxin_dka: renalToxinDka,
      bicarbonate,
      repeat_confirm: [],
      immediate_safety_actions: safetyActions,
      corrective_measures: correctiveMeasures,
      escalation_triggers: escalationTriggers,
      bedside_summary: bedsideSummary,
      related_danger_flags: (validation.danger || []).concat(validation.validation || [])
    };
  }

  function lineItems(v, primary, metabolic, compensationResult, stewart, abe, oxy) {
    const lines = [];
    lines.push(`${primary.pHStatus}.`);
    primary.disorders.forEach((item) => lines.push(item + "."));
    primary.notes.forEach((item) => lines.push(item));
    compensationResult.lines.forEach((item) => lines.push(item));
    if (has(metabolic.correctedAnionGap)) {
      lines.push(`Corrected anion gap is ${round(metabolic.correctedAnionGap)} mmol/L: ${metabolic.anionGapCategory}.`);
    } else if (has(metabolic.anionGap) && metabolic.albuminCorrectionBlocked) {
      lines.push(`Uncorrected anion gap is ${round(metabolic.anionGap)} mmol/L; corrected anion gap is blocked until albumin unit is confirmed.`);
    }
    if (metabolic.deltaInterpretation) lines.push(metabolic.deltaInterpretation);
    if (metabolic.lactateDeltaInterpretation) lines.push(metabolic.lactateDeltaInterpretation);
    if (stewart.eligible) {
      lines.push(`Stewart light: ${stewart.final_stewart_summary}`);
    } else if (stewart.blockedReason) {
      lines.push(stewart.blockedReason);
    }
    if (has(abe.ABE)) lines.push(`Alactic base excess is ${round(abe.ABE)} mmol/L: ${abe.interpretation}`);
    if (has(oxy.A_a_gradient)) lines.push(`A-a gradient is ${round(oxy.A_a_gradient)} mmHg: ${oxy.interpretation}`);
    else if (oxy.blockedReason) lines.push(oxy.blockedReason);
    return lines;
  }

  function stepwiseInterpretation(v, primary, metabolic, compensationResult, stewart, abe, oxy, causes, settings) {
    const steps = [];
    const calculations = [];
    const ph = v.pH.value;
    const paCO2 = v.paCO2.value;
    const hco3 = v.hco3.value;
    const sbe = v.sbe.value;
    const lactate = v.lactate.value;

    if (has(ph)) {
      const severity = ph < 7.2 ? "severe " : "";
      steps.push(`pH ${round(ph, 3)} shows ${severity}${primary.pHStatus.toLowerCase()}.`);
    } else {
      steps.push("pH is missing, so acidemia/alkalemia cannot be classified.");
    }

    if (has(hco3) || has(sbe)) {
      const metabolicParts = [];
      if (has(hco3)) metabolicParts.push(`HCO3 ${round(hco3)} mmol/L`);
      if (has(sbe)) metabolicParts.push(`base excess ${round(sbe)} mmol/L`);
      if (primary.tendencies.metabolicAcidosis) steps.push(`${metabolicParts.join(" and ")} indicate a metabolic acidosis component.`);
      else if (primary.tendencies.metabolicAlkalosis) steps.push(`${metabolicParts.join(" and ")} indicate a metabolic alkalosis component.`);
      else steps.push(`${metabolicParts.join(" and ")} do not show a major metabolic component by the default thresholds.`);
    }

    if (has(paCO2)) {
      if (primary.tendencies.respiratoryAcidosis) steps.push(`PaCO2 ${round(paCO2)} mmHg is high, adding a respiratory acidosis component.`);
      else if (primary.tendencies.respiratoryAlkalosis) steps.push(`PaCO2 ${round(paCO2)} mmHg is low, adding a respiratory alkalosis component.`);
      else steps.push(`PaCO2 ${round(paCO2)} mmHg is in the expected screening range for ventilation.`);
    }

    compensationResult.lines.forEach((line) => steps.push(line));

    if (has(metabolic.correctedAnionGap)) {
      const albuminText = has(v.albumin.value)
        ? `albumin-corrected anion gap is ${round(metabolic.correctedAnionGap, 2)} mmol/L`
        : `anion gap is ${round(metabolic.correctedAnionGap, 2)} mmol/L without albumin correction`;
      steps.push(`${albuminText}, which is ${metabolic.anionGapCategory}.`);
    } else if (has(metabolic.anionGap)) {
      steps.push(`Uncorrected anion gap is ${round(metabolic.anionGap, 2)} mmol/L; albumin correction is not available.`);
    }

    if (has(lactate)) {
      if (lactate >= 4) steps.push(`Lactate ${round(lactate, 2)} mmol/L is severe hyperlactatemia and can drive lactic metabolic acidosis.`);
      else if (lactate > 2) steps.push(`Lactate ${round(lactate, 2)} mmol/L is elevated and may contribute to metabolic acidosis.`);
      else steps.push(`Lactate ${round(lactate, 2)} mmol/L is not elevated by the usual screening threshold.`);
    }

    if (has(abe.ABE)) steps.push(`Alactic base excess is ${round(abe.ABE, 2)} mmol/L, so ${abe.interpretation.toLowerCase()}`);
    if (has(oxy.A_a_gradient)) steps.push(`A-a gradient is ${round(oxy.A_a_gradient, 2)} mmHg; ${oxy.interpretation}`);
    else if (oxy.blockedReason) steps.push(oxy.blockedReason);

    if (has(v.sodium.value) && has(v.chloride.value) && has(v.hco3.value)) {
      calculations.push(`Anion gap = Na - (Cl + HCO3) = ${round(v.sodium.value, 2)} - (${round(v.chloride.value, 2)} + ${round(v.hco3.value, 2)}) = ${round(metabolic.anionGap, 2)} mmol/L.`);
      if (has(v.albumin.value)) {
        calculations.push(`Albumin-corrected AG = AG + 0.25 x (40 - albumin g/L) = ${round(metabolic.anionGap, 2)} + 0.25 x (40 - ${round(v.albumin.value, 2)}) = ${round(metabolic.correctedAnionGap, 2)} mmol/L.`);
      } else {
        calculations.push("Albumin was not entered, so the displayed anion gap is uncorrected. Add albumin if available for albumin-corrected AG.");
      }
    }

    if (primary.tendencies.metabolicAcidosis && has(hco3)) {
      const center = 1.5 * hco3 + 8;
      calculations.push(`Winter formula = 1.5 x HCO3 + 8 +/- 2 = 1.5 x ${round(hco3, 2)} + 8 +/- 2 = expected PaCO2 ${round(center - 2, 2)}-${round(center + 2, 2)} mmHg.`);
    }

    if (metabolic.deltaInterpretation) {
      calculations.push(`Delta gap = (corrected AG - upper limit) - (24 - HCO3) = ${round(metabolic.deltaAG, 2)} - ${round(metabolic.deltaHCO3, 2)} = ${round(metabolic.deltaGap, 2)}; ${metabolic.deltaInterpretation}`);
    }

    if (stewart.eligible) {
      steps.push(`Stewart light partitions the metabolic component into strong ion, albumin, unmeasured ion, lactate, and non-lactate fixed-acid effects.`);
      steps.push(stewart.final_stewart_summary);
      calculations.push(`Stewart Na-Cl difference = Na - Cl = ${round(v.sodium.value, 2)} - ${round(v.chloride.value, 2)} = ${round(stewart.Na_minus_Cl, 2)} mmol/L.`);
      calculations.push(`pH-adjusted Na-Cl reference = ${stewart.pH < 7.3 || stewart.pH > 7.5 ? `35 + 15 x (7.40 - pH) = 35 + 15 x (7.40 - ${round(stewart.pH, 3)}) = ` : ""}${round(stewart.pH_adjusted_reference_Na_minus_Cl, 2)} mmol/L.`);
      calculations.push(`SBE_SID = (Na - Cl) - reference = ${round(stewart.Na_minus_Cl, 2)} - ${round(stewart.pH_adjusted_reference_Na_minus_Cl, 2)} = ${round(stewart.SBE_SID, 2)} mmol/L.`);
      calculations.push(`SBE_Albumin = 0.3 x (40 - albumin g/L) = 0.3 x (40 - ${round(stewart.albumin_g_per_L, 2)}) = ${round(stewart.SBE_albumin, 2)} mmol/L.`);
      calculations.push(`SBE_UI = SBE - SBE_SID - SBE_Albumin = ${round(stewart.SBE, 2)} - (${round(stewart.SBE_SID, 2)}) - (${round(stewart.SBE_albumin, 2)}) = ${round(stewart.SBE_unmeasured_ions, 2)} mmol/L.`);
      if (has(stewart.residual_UI_after_lactate)) {
        calculations.push(`Residual UI after lactate = SBE_UI + lactate = ${round(stewart.SBE_unmeasured_ions, 2)} + ${round(stewart.lactate_mmol_per_L, 2)} = ${round(stewart.residual_UI_after_lactate, 2)} mmol/L.`);
        calculations.push(`ABE = SBE + lactate = ${round(stewart.SBE, 2)} + ${round(stewart.lactate_mmol_per_L, 2)} = ${round(stewart.ABE, 2)} mmol/L.`);
      } else if (stewart.blockedReason) {
        calculations.push(stewart.blockedReason);
      }
    }

    if (has(abe.ABE) && !stewart.eligible) {
      calculations.push(`Alactic base excess = SBE + lactate = ${round(sbe, 2)} + ${round(lactate, 2)} = ${round(abe.ABE, 2)} mmol/L.`);
    }

    if (has(oxy.PAO2) && has(oxy.A_a_gradient)) {
      const pb = Number(settings.barometricPressure) || 760;
      const rq = Number(settings.respiratoryQuotient) || 0.8;
      calculations.push(`Alveolar PO2 = FiO2 x (barometric pressure - 47) - PaCO2/RQ = ${round(v.fio2.value, 2)} x (${pb} - 47) - ${round(v.paCO2.value, 2)}/${rq} = ${round(oxy.PAO2, 2)} mmHg.`);
      calculations.push(`A-a gradient = alveolar PO2 - PaO2 = ${round(oxy.PAO2, 2)} - ${round(v.paO2.value, 2)} = ${round(oxy.A_a_gradient, 2)} mmHg.`);
    }

    return {
      interpretation_steps: steps,
      calculations,
      possible_reasons: causes.causes
    };
  }

  function analyze(raw, settings = {}) {
    const normalized = normalize(raw);
    const v = normalized.converted;
    const validation = validate(v);
    const metabolic = metabolicAnalysis(v, settings);
    const primary = primaryInterpretation(v, metabolic);
    const compensationResult = compensation(v, primary);
    const stewart = stewartLight(v);
    const abe = alacticBaseExcess(v);
    const oxy = oxygenation(v, settings);
    const causes = likelyCauses(v, primary, metabolic, stewart, abe, raw.flags || {});
    const treatment = treatmentSuggestions(v, primary, metabolic, compensationResult, stewart, abe, oxy, raw.flags || {}, validation);
    const finalDiagnosis = lineItems(v, primary, metabolic, compensationResult, stewart, abe, oxy);
    const stepwise = stepwiseInterpretation(v, primary, metabolic, compensationResult, stewart, abe, oxy, causes, settings);

    const blockedCalculations = [];
    if (!has(metabolic.osmolalGap) && has(v.measuredOsmolality.value)) {
      if (!has(v.glucose.value) || !has(v.urea.value) || !v.glucose.confirmed || !v.urea.confirmed) {
        blockedCalculations.push("Osmolal gap blocked until glucose and urea/BUN units are confirmed.");
      }
    }
    if (metabolic.albuminCorrectionBlocked) blockedCalculations.push("Corrected anion gap blocked until albumin unit is explicitly confirmed.");
    if (stewart.blockedReason) blockedCalculations.push(stewart.blockedReason);
    if (oxy.blockedReason) blockedCalculations.push(oxy.blockedReason);

    return {
      severity: {
        pH_status: primary.pHStatus,
        danger_flags: validation.danger
      },
      unit_normalization: {
        raw_inputs: raw,
        converted_inputs: Object.fromEntries(Object.entries(v).map(([key, item]) => [key, item && typeof item === "object" && "value" in item ? {
          value: has(item.value) ? round(item.value, 3) : "",
          unit: item.internalUnit || item.rawUnit || "",
          raw_value: has(item.rawValue) ? item.rawValue : "",
          raw_unit: item.rawUnit || "",
          confirmed: item.confirmed
        } : item])),
        unit_warnings: normalized.warnings,
        blocked_calculations: blockedCalculations
      },
      validation_warnings: validation.validation,
      primary_interpretation: {
        primary_disorders: primary.disorders,
        compensation_status: compensationResult.lines.join(" "),
        expected_values: compensationResult.expected
      },
      metabolic_analysis: {
        anion_gap: has(metabolic.anionGap) ? round(metabolic.anionGap, 2) : "",
        corrected_anion_gap: has(metabolic.correctedAnionGap) ? round(metabolic.correctedAnionGap, 2) : "",
        anion_gap_category: metabolic.anionGapCategory,
        delta_AG: has(metabolic.deltaAG) ? round(metabolic.deltaAG, 2) : "",
        delta_HCO3: has(metabolic.deltaHCO3) ? round(metabolic.deltaHCO3, 2) : "",
        delta_interpretation: metabolic.deltaInterpretation,
        lactate_delta_check: has(metabolic.lactateDeltaCheck) ? round(metabolic.lactateDeltaCheck, 2) : "",
        lactate_delta_interpretation: metabolic.lactateDeltaInterpretation,
        calculated_osmolality: has(metabolic.calculatedOsmolality) ? round(metabolic.calculatedOsmolality, 2) : "",
        osmolal_gap: has(metabolic.osmolalGap) ? round(metabolic.osmolalGap, 2) : "",
        osmolal_interpretation: metabolic.osmolalInterpretation,
        urinary_anion_gap: has(metabolic.urinaryAnionGap) ? round(metabolic.urinaryAnionGap, 2) : "",
        urine_interpretation: metabolic.urineInterpretation,
        alkalosis_interpretation: metabolic.alkalosisInterpretation,
        albumin_correction_blocked: metabolic.albuminCorrectionBlocked
      },
      stewart_light: {
        input_units_validated: stewart.input_units_validated,
        eligible: stewart.eligible,
        Na: has(stewart.Na) ? round(stewart.Na, 2) : "",
        Cl: has(stewart.Cl) ? round(stewart.Cl, 2) : "",
        pH: has(stewart.pH) ? round(stewart.pH, 3) : "",
        SBE: has(stewart.SBE) ? round(stewart.SBE, 2) : "",
        albumin_raw_value: has(stewart.albumin_raw_value) ? round(stewart.albumin_raw_value, 2) : "",
        albumin_raw_unit: stewart.albumin_raw_unit,
        albumin_g_per_L: has(stewart.albumin_g_per_L) ? round(stewart.albumin_g_per_L, 2) : "",
        lactate_mmol_per_L: has(stewart.lactate_mmol_per_L) ? round(stewart.lactate_mmol_per_L, 2) : "",
        Na_minus_Cl: has(stewart.Na_minus_Cl) ? round(stewart.Na_minus_Cl, 2) : "",
        pH_adjusted_reference_Na_minus_Cl: has(stewart.pH_adjusted_reference_Na_minus_Cl) ? round(stewart.pH_adjusted_reference_Na_minus_Cl, 2) : "",
        reference_Na_minus_Cl: has(stewart.reference_Na_minus_Cl) ? round(stewart.reference_Na_minus_Cl, 2) : "",
        SBE_SID: has(stewart.SBE_SID) ? round(stewart.SBE_SID, 2) : "",
        SBE_SID_interpretation: stewart.SBE_SID_interpretation,
        SBE_albumin: has(stewart.SBE_albumin) ? round(stewart.SBE_albumin, 2) : "",
        SBE_albumin_interpretation: stewart.SBE_albumin_interpretation,
        SBE_unmeasured_ions: has(stewart.SBE_unmeasured_ions) ? round(stewart.SBE_unmeasured_ions, 2) : "",
        SBE_unmeasured_ions_interpretation: stewart.SBE_unmeasured_ions_interpretation,
        residual_UI_after_lactate: has(stewart.residual_UI_after_lactate) ? round(stewart.residual_UI_after_lactate, 2) : "",
        SBE_unmeasured_ions_after_lactate: has(stewart.SBE_unmeasured_ions_after_lactate) ? round(stewart.SBE_unmeasured_ions_after_lactate, 2) : "",
        residual_UI_after_lactate_interpretation: stewart.residual_UI_after_lactate_interpretation,
        ABE: has(stewart.ABE) ? round(stewart.ABE, 2) : "",
        ABE_interpretation: stewart.ABE_interpretation,
        stewart_light_tags: stewart.stewart_light_tags,
        final_stewart_summary: stewart.final_stewart_summary,
        acidifying_drivers: stewart.acidifying_drivers,
        alkalinising_drivers: stewart.alkalinising_drivers,
        clinical_inference: stewart.clinical_inference,
        suggested_actions: stewart.suggested_actions,
        quality_flags: stewart.quality_flags,
        missing_inputs: stewart.missing_inputs,
        unit_warnings: stewart.unit_warnings,
        interpretation: stewart.interpretation
      },
      alactic_base_excess: {
        SBE: has(abe.SBE) ? round(abe.SBE, 2) : "",
        lactate: has(abe.lactate) ? round(abe.lactate, 2) : "",
        ABE: has(abe.ABE) ? round(abe.ABE, 2) : "",
        interpretation: abe.interpretation
      },
      oxygenation: {
        PAO2: has(oxy.PAO2) ? round(oxy.PAO2, 2) : "",
        A_a_gradient: has(oxy.A_a_gradient) ? round(oxy.A_a_gradient, 2) : "",
        oxygenation_interpretation: oxy.interpretation || oxy.blockedReason
      },
      final_diagnosis: finalDiagnosis,
      stepwise_interpretation: stepwise,
      likely_causes: causes.causes,
      recommended_missing_tests: causes.recommendedMissingTests,
      treatment_suggestions: treatment,
      clinical_warning: "Interpretation must be correlated with clinical context. This app does not replace clinician judgement."
    };
  }

  window.ABGEngine = {
    analyze,
    convertField,
    REQUIRED_FIELDS,
    FLAG_LABELS,
    round,
    has
  };
})();
