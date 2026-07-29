<!-- /autoplan restore point: /Users/shaktibedantamishra/.gstack/projects/ABGapp/main-autoplan-restore-20260721-052700.md -->
# Plan: OCR photo-capture auto-fill for ABG Interpreter

## Problem statement (user-provided)

User wants to photograph a printed ABG (arterial blood gas) machine report and
have the app auto-populate the numeric input form, instead of typing every
value by hand from the printout.

User attached 5 real example photos, all from the same machine: **Radiometer
ABL800 FLEX** "ABL835 SUM CCM4 ICU PATIENT REPORT" printout. Photos vary in
quality: some flat/well-lit, some skewed/glare, two have handwritten
annotations in pen (ventilator settings, ward markings, a signature) overlaid
on or around the printed table.

## Existing app context (read from source, not assumed)

- Static single-page app, no backend, no build step. `index.html` loads
  `engine.js` (pure calculation engine) then `app.js` (DOM/UI).
  [engine.js](engine.js), [app.js](app.js), [index.html](index.html)
- `index.html` already reads "Capture and Values" / "Start with the image,
  then confirm the main ABG numbers" (index.html:44-45) — this feature was
  planned before but never wired up.
- `styles.css` already has unused rules for `.photo-section`, `.photo-grid`,
  `.photo-inputs`, `.photo-drop`, `.photo-preview`, `.photo-actions`,
  `.ocr-details`, `#ocrText` (styles.css:259-397) — dead CSS from an earlier
  attempt, no matching HTML/JS exists today.
- `vercel.json` already sets `Permissions-Policy: camera=(self)` — camera
  access was anticipated.
- Field schema lives in `app.js` `groups` array (app.js:11-56): `pH, paCO2,
  paO2, fio2, hco3, sbe, sodium, potassium, chloride, lactate, albumin,
  glucose, age, urea, creatinine, measuredOsmolality,
  betaHydroxybutyrate, phosphate, calcium, magnesium, urineSodium,
  urinePotassium, urineChloride, urinePH, sampleType`. Each numeric field
  is `<input id="{id}">` + `<select id="{id}Unit">` (app.js:140-ish,
  `makeField`).
- Existing autofill precedent: `setExample()` (app.js:337-350) already does
  exactly the DOM-write pattern OCR autofill needs — `$('#'+id).value =
  value; $('#'+id+'Unit').value = unit;` then calls `analyze()`. **Reuse
  this pattern, don't invent a new one.**
- Only test harness today: `smoke-test.js`, plain Node `assert` against
  `engine.js`, run via `npm test`. No test infra for `app.js` DOM code yet.
- **No git repo existed before this session** — initialized during this
  /autoplan run (see commit "Initial commit: ABG Clinical Interpreter static
  app").

## Critical constraint found during intake (not in user's original ask)

**The photographed reports carry real patient-identifying information**:
Patient ID, Patient Last Name, Sex, sample date/time, and in two photos a
ward/doctor's handwritten signature. This is PHI. Any OCR approach that
sends the photo to a third-party server (cloud Vision API, hosted LLM
vision endpoint) would exfiltrate patient data off-device from a tool that
today makes zero network calls other than serving static files.

This changes the architecture decision from "which OCR service is most
accurate" to "OCR must run 100% client-side, zero network calls on the
image itself." This is treated as a hard constraint in the reviews below,
not a preference.

## Rough shape of the feature

1. Photo input UI (reusing the existing dead CSS): drop zone / file picker
   + `capture="environment"` for direct mobile camera capture, thumbnail
   preview, remove/retake action.
2. Client-side OCR (Tesseract.js, WASM, self-hosted — no CDN, no network
   call with the image) run in a Web Worker so the UI doesn't freeze.
3. Lightweight canvas preprocessing (grayscale + contrast stretch, downscale
   large phone photos) before OCR to improve accuracy on glare/skew photos.
4. A label-based parser scoped **only** to the Radiometer ABL800 FLEX layout
   seen in the 5 example photos — matches known field labels (`pH`, `pCO2`,
   `pO2`, `cHCO3-(P,st)c`, `cBase(Ecf)c`, `cK+`, `cNa+`, `cCl-`, `cGlu`,
   `cLac`, `cCa2+`, `mOsmc`, header `FO2(l)`, `Sample type`) against OCR'd
   text lines (fuzzy on OCR noise like `pC02`/`cNat`), pulls the value next
   to each label, and maps to the app's existing field ids + units.
5. Recognized values populate the existing number inputs + unit selects
   (same mechanism as `setExample()`) but do **not** auto-run analysis —
   user must review/correct in the visible form and press Analyze, same as
   today. Raw OCR text shown in a collapsible `<details class="ocr-details">`
   for transparency when something looks wrong.
6. Fields with no printed value on this report (e.g. albumin, urea,
   creatinine — not present on Radiometer printout) are left untouched for
   manual entry, exactly as today.

## Explicitly NOT in scope for this pass

- Other ABG machine formats (Siemens RAPIDPoint, Abbott i-STAT, Roche
  cobas b 221, GEM Premier) — different label sets/layouts, deferred to
  TODOS.md.
- Reading/using the handwritten annotations (ventilator settings, etc.) —
  unstructured, out of scope, parser should simply not match on those
  lines.
- Any server/cloud OCR — rejected on the PHI constraint above.

---

## Phase 1: CEO Review

### Premise challenge (0A)

| Premise | Verdict | Notes |
|---|---|---|
| "OCR the printout" is the right feature | **Challenged** | See alternative below — native OS OCR (iOS Live Text / Android ML Kit) already does photo→text far better than Tesseract.js, on-device, for free. A "paste recognized text, we parse it" flow gets ~80% of the value with a fraction of the code. |
| "Must be 100% client-side, no image leaves device" (PHI) | **Confirmed** | Correctly identified and load-bearing — reports carry Patient ID/Last Name/Sex. Not just an inference: this is a hard constraint. |
| "Only need to support the one Radiometer ABL800 FLEX layout shown" | **Confirmed, scope-limited on purpose** | Correct call for v1. Flagged in the registry below: no accuracy corpus exists yet to catch silent regression if the parser's fuzzy matching drifts. |
| Photo can be silently discarded after OCR, no other privacy handling needed | **Challenged** | Plan never states what happens to the photo/canvas/blob URL after parsing. "No network call" ≠ "no PHI-at-rest risk" on a shared/lost device. |

### Claude subagent (CEO — strategic independence)

Ran independently via Agent tool, no prior-phase context, full findings below:

> **Right problem?** Jumps straight to in-app OCR without testing cheaper alternatives. iOS Live Text / Android ML Kit already turn a photo into selectable text, free, on-device, far more accurate than Tesseract.js on skewed/glare photos, zero WASM payload, zero new attack surface. Cheaper version: add a "paste report text" textarea; user photographs with their normal camera app, long-presses to copy the OCR'd text (native OS feature), pastes it in. The label-matching parser (step 4 of the rough plan) works identically on pasted text — this removes the drop zone, Tesseract-in-a-worker, and canvas preprocessing entirely, while likely *improving* accuracy.
> **Is OCR even the bottleneck?** Typing ~10-15 numbers takes well under a minute. If the real friction is field-order/unit-fumbling rather than data entry, a faster manual-entry UX might deliver most of the benefit with none of the misread risk below. Wasn't considered as a competing option.
> **6-month regret (critical): silent wrong-value autofill.** Fuzzy-matching noisy OCR text into number inputs the physician then "reviews" is worse than blank — review complacency ("the app read it") is the exact failure mode OCR introduces into a clinical tool. No per-field confidence signal, no diff against physiologic ranges, no test harness validates the parser against the 5 real sample photos. **Required before shipping:** (a) fixture-based accuracy test using the 5 real photos, checked into the repo; (b) visually flag low-confidence/ambiguous field matches (e.g. highlighted input) rather than silently filling every field identically.
> **Alternative dismissed too quickly:** native-OS-OCR-plus-paste matches or beats Tesseract.js accuracy and ships with zero new bundle/worker/preprocessing code. Recommend prototyping that path first; only build in-app camera+Tesseract if paste-based flow proves too clunky in real bedside use.

CEO consensus (single independent voice — Codex unavailable, tagged `[subagent-only]`):

| Dimension | Claude (primary) | Claude subagent | Consensus |
|---|---|---|---|
| Premises valid? | Mostly, PHI constraint correct | Challenges "OCR the printout" framing | **DISAGREE → taste decision** |
| Right problem to solve? | Yes, as photo→autofill | Questions if paste-based is enough | **DISAGREE → taste decision** |
| Scope calibration correct? | Yes (one machine format) | Agrees | CONFIRMED |
| Alternatives sufficiently explored? | No — didn't consider paste-based | Flags same gap | CONFIRMED (both agree more exploration needed) |
| Competitive/market risks covered? | Not assessed | Names native OS OCR as reference | N/A (single voice) |
| 6-month trajectory sound? | Flagged silent-wrong-value risk | Same finding, more specific (confidence signal, fixture tests) | CONFIRMED — critical |

### 0B: What already exists (leverage map)

| Sub-problem | Existing code to reuse |
|---|---|
| Write recognized value into a field | `setExample()` DOM-write pattern, app.js:337-350 — reuse exactly, don't invent a second mechanism |
| Photo capture UI shell | Dead CSS already in styles.css:259-397 (`.photo-drop`, `.photo-preview`, `.ocr-details`, `#ocrText`) — needs HTML + JS wiring, not new design |
| Camera permission | `Permissions-Policy: camera=(self)` already set in vercel.json |
| Field/unit schema | `groups` array + `fieldHints`, app.js:11-77 |

### 0C-bis: Implementation alternatives

| Approach | Effort (human / CC) | Risk | Pros | Cons |
|---|---|---|---|---|
| **A. Paste-parse only** — textarea for OCR'd text (from native OS Live Text/ML Kit), app parses pasted text with the label-matching parser | ~1-2 hrs human / ~20 min CC | Low | Reuses the best OCR available (native OS), zero new bundle, zero new attack surface, ships fastest | Extra manual step (leave app → camera app → copy → back → paste); no in-app "single button" feel |
| **B. In-app camera + Tesseract.js (original rough plan)** | ~2-3 days human / ~2-3 hrs CC | Medium | Single-flow "scan" button, works offline, no dependency on OS OCR quality across devices | Large WASM bundle to self-host, worker plumbing, preprocessing needed for glare/skew, likely *lower* raw accuracy than native OS OCR on the same photo |
| **C. Both — paste-parse now, add in-app camera+Tesseract later if needed** | Sum of A now + B later, staged | Low now | Ships the high-value, low-risk core immediately; defers the expensive/uncertain part until real usage shows it's needed | Two-step delivery instead of one |

**Recommendation: C.** Ship the parser + paste-text flow first (approach A's engineering, which B needs anyway), get it in front of real bedside use, then decide if the extra in-app-camera engineering (B) earns its cost. This is a **taste decision surfaced at the final gate**, not auto-decided — it changes the shape of what ships in this pass and the user has bedside-workflow context neither model has.

### 0E: Temporal interrogation

- **Hour 1:** User photographs a report with their phone's normal camera, or opens Photos and uses Live Text / long-press.
- **Hour 1, 2 min later:** Pastes the recognized text into a new "Paste report text" box in the Capture and Values panel. Parser matches known Radiometer labels, fills matched fields + units the same way `setExample()` does, leaves unmatched fields blank, shows raw pasted text in `.ocr-details` for reference.
- **Hour 1, 3 min:** User reviews the now-populated form (as they already do today for manual entry), corrects/fills gaps, hits Analyze — unchanged from today's flow.
- **Hour 6+ (if approach C's phase 2 is greenlit later):** In-app "Scan" button captures via `capture="environment"`, runs Tesseract.js in a worker, same parser underneath — additive, not a rewrite.

### 0F: Mode selection

**SELECTIVE EXPANSION** — hold the user's stated scope (OCR photos → autofill) but cherry-pick the CEO-phase finding that changes *how*: build the parser once, ship it behind the lower-risk paste-text entry point first (approach A/C), same parser reusable if in-app camera capture (approach B) is added later.

### Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale |
|---|---|---|---|---|---|
| 1 | CEO | Reject cloud/server OCR (Google Vision, AWS Textract, GPT-4V) | Mechanical | P4 DRY / hard constraint | Reports carry real Patient ID/Last Name/Sex (PHI); app has zero backend today; sending photos off-device is a privacy regression, not a preference |
| 2 | CEO | Require explicit photo/canvas/blob disposal immediately after parse, no persistence | Mechanical | P1 completeness (safety) | Subagent flagged: "no network call" ≠ "no PHI-at-rest risk" on a shared/lost device |
| 3 | CEO | Require fixture-based parser accuracy test using the 5 real sample photos, checked into repo | Mechanical | P1 completeness | Both reviewers independently flagged missing test coverage for the highest-risk new code path |
| 4 | CEO | Require visual "unconfirmed/low-confidence" flagging on OCR-filled fields, never auto-run analysis | Mechanical | P1 completeness (patient safety) | Subagent: silent wrong-value autofill is the single largest risk this feature introduces to a clinical tool |
| 5 | CEO | In-app camera+Tesseract.js (B) vs. paste-native-OCR-text (A) vs. staged (C) | **Taste decision** | P3/P5 lean toward C, but surfaced, not auto-decided | Changes feature shape significantly; user has bedside-workflow context (do they usually have a phone camera app open vs. already copying text from an LIS?) that neither model has |
| 6 | CEO | Multi-vendor ABG machine format support | Deferred to TODOS.md | P2 (boil lakes) — outside blast radius, different label sets per vendor, not <1 day | Only Radiometer ABL800 FLEX photos were provided; other formats are a distinct, larger effort |

### NOT in scope (this pass)
- Other ABG machine/vendor report formats (TODOS.md)
- Reading/using handwritten annotations on the printouts
- Any cloud/server-side OCR or LLM vision API
- Auto-running analysis without user review of OCR-filled fields

### CEO Completion Summary
Mode: SELECTIVE EXPANSION. 1 taste decision surfaced (paste-vs-camera architecture). 4 mechanical safety/scope decisions auto-decided (reject cloud OCR, discard photo after parse, require fixture tests, require confidence flagging). 1 item deferred to TODOS.md (multi-vendor formats). Dual voice: Claude subagent only (codex unavailable), consensus 3/6 confirmed, 2 disagreements → resolved as the one taste decision above.

---

## Phase 2: Design Review

UI scope confirmed (photo/paste capture UI + form + review states). Claude subagent ran independently (no prior-phase context, read the plan + source directly).

### Claude subagent (design — independent review)

> **1. Information hierarchy is backwards for the crash scenario.** The plan (and index.html:45's existing copy) puts photo/paste first. But the paste flow only saves time on the long tail of fields — the 6 time-critical core fields (pH, PaCO2, PaO2, FiO2, HCO3, SBE) already take seconds to type and need to be visible/editable *immediately*, not gated behind a decision to hunt for a printout first. **High.** Fix: Core tab stays the default, always-visible surface; paste box is a secondary, collapsed-by-default accelerator.
> **2. Missing states.** No design for: idle/empty paste box (placeholder copy), zero-match error (pasted text matches nothing — user must know *nothing* happened), and critically the **partial-match state** with no "N of 12 fields recognized" summary distinguishing "not printed on this report" (expected blank) from "should have matched but didn't" (parser failure). **High** — a partial fill that looks identical to a full fill relocates the CEO phase's silent-wrong-value risk into missing fields.
> **3. Bedside failure mode of the paste flow itself, unstated.** Leaving the app to the camera/Photos app, invoking Live Text, copying, returning, pasting is a 5-6 step app-hop with wet/gloved hands, one-handed, mid-crisis. **Medium.** Fix: state this cost explicitly; auto-focus/scroll the paste box into view on app resume.
> **4. CSS-reuse claim (Phase 1, 0B table) doesn't match the recommended approach.** `.photo-drop`/`.photo-preview` (styles.css:297-353) are drop-zone/thumbnail UI for a *photo* — the CEO-recommended approach (A/C, paste-text first) needs a *textarea*, not a drop zone. Only `.ocr-details`/`#ocrText` are genuinely reusable now; the photo-* classes are dead weight unless/until the later camera phase (B) ships. **Medium**, corrected below.
> **5. Low-confidence field styling is completely undesigned — critical.** CEO decision #4 mandates visual flagging but specifies no color/border/icon/copy, no definition of "confidence" for a binary label-matcher, no spec for when the flag clears. Left ambiguous, this clinical-safety requirement gets shipped as an ad hoc afterthought. **Critical**, spec'd below.

### Design decisions (resolving the subagent's findings)

1. **Reordered hierarchy:** Core tab (existing manual fields) stays the default visible surface, unchanged. "Paste report text" is a collapsed `<details>`-style accelerator above the tab strip — opens to a single textarea + "Parse" button. Corrects index.html:44-45 copy from "Start with the image, then confirm the main ABG numbers" to something like "Enter values manually, or paste a report printout to auto-fill."
2. **CSS reuse corrected:** `.ocr-details`/`#ocrText` (raw-text review) — reused as-is. `.photo-drop`/`.photo-preview`/`.photo-grid`/`.photo-inputs`/`.photo-actions` — **not used in this pass** (they're for a camera/drop-zone flow that's now deferred to the later "approach B" phase, if greenlit). New minimal CSS needed instead: a `.paste-box` textarea + "Parse" button + a `.parse-summary` line.
3. **States, explicitly specified:**
   - *Idle:* textarea with placeholder "Paste the OCR'd/copied report text here."
   - *Parsed — full or partial:* a one-line summary directly under the textarea, e.g. "7 of 9 printed fields recognized" (denominator = fields actually present on this report's labels, not the full 24-field schema — so "not printed on this machine" fields never count against the match rate).
   - *Zero match:* explicit message "Couldn't recognize any fields — check the pasted text starts with the report's Blood Gas Values section" plus the raw pasted text still visible for the user to read manually. Never silently show an unchanged, all-blank form with no explanation.
4. **Low-confidence visual spec (resolves finding 5):** Confidence is binary per field: *matched-unambiguous* (exactly one candidate value found immediately after the label) vs. *matched-ambiguous* (label found but multiple numeric candidates on that line, or fuzzy-match below a defined threshold). Ambiguous fields get an amber left-border (2px) on the field's `<label class="field">` plus a small inline "unconfirmed" tag next to the field label text. The flag clears the instant the user focuses that specific field (signals "I've looked at this one"), not on any other action (not on Analyze, not on editing a different field).

### Design Litmus Scorecard (dual voice: subagent-only, codex unavailable)

| Dimension | Score | Note |
|---|---|---|
| Information hierarchy | 6/10 → 9/10 after fix | Reordered so Core tab stays primary |
| State coverage | 3/10 → 8/10 after fix | Idle/zero-match/partial-match now specified |
| Consistency with existing design language | 5/10 → 8/10 after fix | Corrected CSS-reuse claim, minimal new CSS instead of misapplied dead CSS |
| Specificity (concrete vs. generic) | 4/10 → 8/10 after fix | Confidence visual language now fully spec'd |
| Bedside/real-world resilience | 5/10 | Paste app-hop cost is inherent to approach A; acceptable trade for v1, revisit if approach B (in-app camera) ships later |

### Design Completion Summary
5 findings from the independent design subagent, all resolved inline above (1 information-hierarchy reorder, 2 new specified states + partial-match summary line, 1 corrected CSS-reuse plan, 1 concrete confidence visual spec). No taste decisions from this phase — all were "undesigned, now designed" fixes, not judgment calls.

---

## Phase 3: Eng Review

### Architecture (Section 1)

```
index.html
  └─ engine.js   (existing, pure calc functions, window.ABGEngine)
  └─ ocr-parser.js   (NEW, pure parsing functions, window.ABGParser — same
  │                    pattern as engine.js: zero DOM, testable in Node)
  └─ app.js      (existing DOM wiring, calls both ABGEngine.analyze()
                   and, on Parse click, ABGParser.parse(pastedText) then
                   writes results via the existing setExample()-style
                   DOM-write path)
```

`ocr-parser.js` must not duplicate `engine.js`'s existing unit-ambiguity handling (`convertField`, `"auto"` unit + range heuristics for glucose/albumin/etc.) — when the parser can't confidently read a printed unit, it emits `unit: "auto"` and lets the existing engine logic handle it, per the Claude eng subagent's coupling finding.

### Claude subagent (eng — independent review)

> **Architecture:** sound for v1 — a pure `parse(text) -> {fields, matches, summary}` function, its own file mirroring `engine.js`'s `window.ABGEngine` pattern, not inline in app.js (would be untestable without a DOM shim).
> **Edge cases, ranked by real risk:**
> 1. **(Highest, unaddressed in original plan) Reference ranges on the same line as the value** — Radiometer printouts render `pH 7.003 [7.350-7.450]`. A "first number after label" regex is fine; "any number after label" will grab from the range instead. Single most likely source of a wrong-but-plausible autofill.
> 2. **Column-major OCR ordering** — native OS OCR on tabular printouts doesn't always read row-by-row; value can land on a different line than its label. Needs an explicit lookahead fallback (check next 1-2 lines), not just same-line assumption.
> 3. **Trailing-minus convention** on some lab printouts (`17.4-` instead of `-17.4`) — needs confirming against the actual sample photos.
> 4. Standard OCR noise (`pC02`, `cNat`, `cCa2'`) — tractable with fuzzy label matching, lower risk than 1-2.
> 5. Thousands separators / decimal commas / no-space unit concatenation (`49mg/dL`) — need explicit regex handling, not called out in original plan.
> **Failure-mode gap:** parser return value needs a third per-field state — "label found, value regex didn't match" — distinct from "field not printed on this report," to satisfy the Design phase's partial-match summary.
> **Tests:** mirror `smoke-test.js` exactly — literal multi-line template-string fixtures from the 5 real photos' actual text (OCR noise preserved, not cleaned up), each paired with expected parsed values, asserted via Node `assert`. Add adversarial fixtures: empty paste, garbage text, only-handwritten-annotation lines, duplicate labels, partial (top-half-only) paste, very large paste (regex-DoS check).
> **Security:** `escapeHTML()` in app.js is irrelevant to the paste textarea itself (`.value` is never HTML-parsed) — the real requirement is that raw pasted text echoed into `.ocr-details`/`#ocrText` must use `.textContent`, never `.innerHTML` (easy one-line XSS regression to introduce). Cap input length and avoid nested-quantifier regexes (regex-DoS against arbitrary pasted text).
> **Hidden complexity:** "label-matching parser" bundles six distinct sub-problems treated as one in the plan: fuzzy label recognition, value-token extraction across line-break variance, **disambiguating value from an adjacent reference range**, per-field unit resolution, the binary confidence classification from the Design phase, and label→field-id/unit mapping.

### Verified against the 5 real sample photos (grounding the #1 risk above)

Checked directly against the report text visible in the user's 5 attached photos — every single Blood Gas/Electrolyte/Metabolite row follows the exact same shape:

```
[↑/↓ optional]  <label>  <value>  <unit>  [ <low> - <high> ]
```

e.g. `↓ pH  7.303  [ 7.350 - 7.450 ]`, `cBase(Ecf)c  -7.4  mmol/L`. This confirms the fix is tractable and cheap: the parser's value regex must stop at the first `[` (reference-range open bracket) or end-of-line, and take the *first* numeric token (including an optional leading `-`) after the label — never scan into the bracketed range. All 5 samples also use **leading**-sign negatives (`-7.4`, `-3.8`, `-2.6`, `-17.4`) — no trailing-minus convention appears in the actual examples provided, so that edge case is deferred (not built) rather than spent effort on speculatively.

### Eng consensus (single voice — codex unavailable, tagged `[subagent-only]`)

| Dimension | Consensus |
|---|---|
| Architecture sound? | CONFIRMED — own module, mirrors engine.js pattern |
| Test coverage sufficient (once built)? | CONFIRMED — fixture-based, mirrors smoke-test.js |
| Performance risks addressed? | CONFIRMED — regex-DoS + input length cap called out |
| Security threats covered? | CONFIRMED — textContent-not-innerHTML requirement added |
| Error paths handled? | CONFIRMED after fix — third per-field state (label-found-value-missing) added |
| Deployment risk manageable? | CONFIRMED — no new backend, no new deploy surface |

### Mandatory engineering requirements (added to plan, mechanical — not taste)

1. New file `ocr-parser.js`, loaded after `engine.js` before `app.js`, exposes `window.ABGParser.parse(text) -> { fields: { [id]: {value, unit, confidence} }, matchedCount, totalPrintable, rawText }`.
2. Value-extraction regex stops at `[` or end-of-line; takes first numeric token (optional leading `-`) after the matched label — never scans into the bracketed reference range.
3. Per-field result is one of three states: `matched-unambiguous`, `matched-ambiguous` (multiple numeric candidates or fuzzy-match below threshold — Design phase's amber-border/"unconfirmed" state), or `not-found` (distinguished at the UI layer from "not printed on this report" using a fixed list of labels expected on the Radiometer ABL800 FLEX layout).
4. Unit strings the parser emits are normalized to exactly match each field's `units` array in app.js (case-sensitive `<select>` values) — falls back to `"auto"` when not confidently read, letting `engine.js`'s existing `convertField` heuristics handle ambiguity rather than duplicating them.
5. Raw pasted text rendered into `.ocr-details`/`#ocrText` via `.textContent`, never `.innerHTML`.
6. Paste input length capped (e.g. 20,000 chars) before running any regex against it.
7. Test file `ocr-parser.test.js` (or appended to `smoke-test.js`), fixtures built from the 5 real sample photos' actual text plus adversarial cases (empty, garbage, handwriting-only, duplicate labels, partial/top-half paste, oversized paste). Must pass before shipping — this was independently flagged by both the CEO and Eng reviews as the single highest-value test surface.

### Eng Completion Summary
Architecture confirmed sound (own module, existing engine.js pattern reused, no coupling duplication). One critical, previously-unaddressed edge case found and verified against real data (reference-range-adjacent-to-value) with a cheap fix. One security hardening item added (textContent, input cap, regex-DoS guard). Test plan concretized to fixture-based Node tests mirroring the existing smoke-test.js convention. No taste decisions this phase — all findings were "unspecified, now specified" engineering requirements.

---

## Phase 4: Final Decision — RESOLVED

**Capture method: Paste native-OS-OCR text first.** User chose this over in-app camera+Tesseract.js or the staged "both" option. Scope for this pass is now final: paste-a-textarea flow only. In-app camera capture is not being built in this pass — if it's wanted later, it layers on top of the same `ocr-parser.js` parser (deferred to TODOS.md, not designed further here).

### TODOS.md additions
- Other ABG machine/vendor report formats (Siemens RAPIDPoint, Abbott i-STAT, Roche cobas b 221, GEM Premier) — different label sets/layouts than Radiometer ABL800 FLEX.
- In-app camera capture + Tesseract.js OCR, layered on the same `ocr-parser.js`, if the paste flow proves too clunky in real bedside use.

### Cross-phase theme (flagged independently in all 3 phases — high-confidence signal)
"Silent wrong or missing autofill in a clinical tool" surfaced independently in every phase: CEO (silent wrong-value autofill risk), Design (partial-match state / confidence visual spec), Eng (reference-range disambiguation, third per-field state). All three converge on the same mitigation already built into this plan: binary confidence classification, visible "N of M recognized" summary, amber-flagged ambiguous fields that clear on focus, and never auto-running analysis on OCR-filled values.

**STATUS: DONE — implemented, tested, committed** (`88ba39a`). `ocr-parser.js` + `ocr-parser.test.js` added; `app.js`/`index.html`/`styles.css` wired up. Verified end-to-end in-browser: paste → parse → autofill → Analyze all work; zero-match and ambiguous-confidence states verified. One real bug found and fixed during manual browser testing (not caught by the fixture tests at the time): FiO2 in the header block was picking up the following "T 37.0 °C" temperature line as a false second candidate and getting incorrectly flagged ambiguous — fixed by checking the label's own line first, only falling back to the next line if nothing matched there. Regression test added for this case.

---

## Addendum: In-app camera capture (approach B), added after live testing

After trying the live paste-text flow, the user decided the extra app-switch (camera app → Live Text → copy → back → paste) was worth removing — greenlighting the "approach B" item that was deferred to TODOS in the Phase 1 CEO review. Implemented on top of the same `ocr-parser.js` (P4 DRY — zero new parsing logic):

- **Tesseract.js 5.1.1** loaded lazily from a pinned, SRI-hashed jsdelivr URL, only when a photo is actually selected (never on page load). The photo itself never leaves the device — only the generic OCR engine/language files (identical for every user) are fetched over the network, same privacy posture as the CEO phase's hard constraint (no PHI ever transits the network).
- Photo is downscaled (max 1600px) and converted to grayscale + contrast-stretched via canvas before recognition, per the original rough plan's preprocessing note — cheap, helps with the glare/skew visible in the user's real sample photos.
- Photo/canvas/object-URL is discarded immediately after recognition (`URL.revokeObjectURL`, worker terminated) — nothing persisted, satisfying CEO decision #2.
- Recognized text feeds the exact same `parser.parse()` → `applyOcrResult()` pipeline already built for paste-text — same confidence flagging, same "N of M recognized" summary, same never-auto-runs-analysis behavior.
- UI reuses the dead `.photo-drop`/`.photo-preview`/`.photo-grid`/`.photo-actions` CSS from the original May commits (finally wired up, ~14 months after it was first styled) inside the same "Auto-fill from a photo" disclosure, above the existing paste-text box (now offered as a fallback "or paste text directly" option, not removed).
- **Verified against a real OCR run** (not hand-written test text): generated a synthetic report image and ran it through the actual in-browser Tesseract pipeline. Found two more real misreads this way — `FO2(l)` → `F02(1)` (zero for letter O) and `cHCO3` → `cHCO03` (spurious inserted zero) — both fixed in `ocr-parser.js` and covered by new regression fixtures built from the literal OCR output, not authored by hand.

TODOS.md item "in-app camera capture" — done, no longer deferred.

---

## Addendum 2: Tesseract.js replaced with Claude API vision (privacy tradeoff explicitly re-opened)

Real bedside-photo testing (multiple actual Radiometer printouts, not synthetic images) repeatedly showed Tesseract.js underperforming badly — recognition rates as low as 1/14–6/14, and a recurring failure mode where thermal-printer decimal points were misread or dropped entirely (`5.3` → `52` → `532` across successive tests). Several rounds of real fixes were made along the way (auto-levels contrast stretching, upload resolution, PSM tuning, label-pattern fixes) and each helped somewhat, but the ceiling remained low — consistent with the original CEO-phase finding that native/vision OCR engines are structurally better at this than Tesseract.js, now re-confirmed empirically rather than just theoretically.

During diagnosis, Claude (asked directly, in-conversation, to read one of the same real photos) transcribed every field correctly. This directly demonstrated that a capable vision model reads this report type far better than Tesseract, and reopened the CEO phase's original hard constraint ("OCR must run 100% client-side, zero network calls on the image") as an explicit decision point rather than a settled one.

**User was presented the tradeoff explicitly and chose to reopen it:** send the photo to the Claude API for transcription, accepting that the photo — including the real Patient ID/Last Name/Sex printed on it — now leaves the device and transits Anthropic's API. Offered a middle option (crop the identifying header out client-side before sending) — user explicitly declined and chose to send the whole photo as-is.

Implementation:
- New `api/scan.js` Vercel serverless function — the first backend this app has ever had. Holds `ANTHROPIC_API_KEY` as a server-side env var (never exposed to client JS). Calls the Claude API's vision endpoint with the photo, asking for a verbatim transcription (not structured extraction) of the printed text.
- Client-side (`app.js`): photo is downscaled to Claude's own recommended ~1568px long edge and JPEG-encoded, POSTed to `/api/scan`, and the returned transcription is fed through the **same** `ocr-parser.js` → `applyOcrResult()` pipeline used by paste-text — same plausibility/confidence safety net, zero new parsing logic (P4 DRY held even through this architecture change).
- Tesseract.js removed entirely (CDN script loading, canvas preprocessing, worker lifecycle, PSM tuning) — superseded, no reason to maintain two OCR engines once one is both more accurate and simpler.
- UI copy corrected to honestly state the photo is sent to Anthropic's Claude API — the previous "never uploaded anywhere" claim would now be false and is a hard requirement to get right, not a nice-to-have.
- `publish-now.js` updated: added `api/scan.js` to its deploy whitelist and fixed its flat-file copy loop (previously assumed only top-level files, would have silently failed to deploy anything under a subdirectory).
- **Not yet done:** `ANTHROPIC_API_KEY` needs to be set as a Vercel production env var by the user (a credential-handling step Claude Code won't do on the user's behalf) before this path is live — until then, `/api/scan` returns a clear "not configured, use paste-text" error rather than failing silently.

**Update: switched to Gemini before the API key was ever set, so this never actually went live on Claude.** User had a `gemini-3.6-flash` key available and asked to use that instead. `api/scan.js` rewritten for Gemini's `generateContent` REST endpoint (`x-goog-api-key` header, `contents[].parts[]` request shape, `candidates[0].content.parts[]` response shape) — same transcribe-verbatim prompt, same downstream `ocr-parser.js` pipeline, no other logic changed. Env var is now `GEMINI_API_KEY`. Deliberately used the standard Flash tier over the cheaper Flash-Lite tier: Flash-Lite targets high-volume/low-latency agentic workloads, not a single careful read of a clinical document, and the cost difference between tiers is a fraction of a cent per scan at this app's volume — not worth trading transcription accuracy for.

**Update 2: switched back to Claude, this time Sonnet (not Haiku).** User briefly asked for Haiku (cheaper), was told plainly that Haiku's OCR precision on this task is unverified — no benchmark data available for a decimal-point-sensitive clinical transcription task — and chose Sonnet instead once that tradeoff was named. `api/scan.js` rewritten again for Anthropic's Messages API (`x-api-key`/`anthropic-version` headers, `system`+`messages` request shape, `content[]` response shape). Env var is `ANTHROPIC_API_KEY` again (the never-actually-used `GEMINI_API_KEY` can stay set and unused, or be removed later — harmless either way). Added prompt caching: the transcription instructions live in `system` with `cache_control: {type: "ephemeral"}`, since they're identical on every call and the app is used for multiple scans in a session — the image itself is never cacheable (different every call) and stays in `messages`. Not independently verified against a live key yet (only checked that the endpoint correctly reports "missing key" locally) — verify the actual transcription + cache_read_input_tokens > 0 on a second scan once `ANTHROPIC_API_KEY` is set.

