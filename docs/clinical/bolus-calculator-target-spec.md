# Definitive Bolus Calculator — Complete Field & Formula Specification
**Type 1 diabetes | ADHD-optimised (low decision load) | All constants clinician-set**

> **Provenance note.** This document was supplied by the product owner as the
> clinical target specification for a future upgrade of the deployed bolus
> calculator (`packages/bolus`). It is reproduced here verbatim, unmodified,
> as the durable reference for [`docs/UPGRADE-bolus-calc.md`](../UPGRADE-bolus-calc.md),
> which is the engineering migration plan for closing the gap between this
> target and the current, much simpler, deployed system. Do not edit this
> file to reflect implementation decisions - record those in the upgrade
> plan instead, so the original clinical intent stays distinguishable from
> what has actually been built.

> **Scope statement.** This is a design specification, not a dose recommendation. Every constant below is a blank to be filled in by the treating clinician/diabetes educator. No numeric ratio, factor, target or threshold is supplied here. A self-built calculator is not a regulated medical device (TGA/FDA); validated alternatives include pump bolus wizards, Libre/Dexcom companion apps, and pump-integrated automated insulin delivery (AID/hybrid closed loop), which automates most of §6 in real time. Bring this document to the clinician, complete §11, then have the outputs sanity-checked against the existing wizard for 2–4 weeks before trusting it.

---

## 0. Architecture decision (choose ONE — do not combine)

| | **A. Classic wizard** | **B. Predictive / eventual-BG** |
|---|---|---|
| Logic | Carb dose + correction − IOB | Predict BG at end of insulin action, dose the gap |
| IOB handling | Subtracted explicitly | Built into the prediction |
| Trend/CGM | Optional add-on factor | Native |
| Risk | Simpler, but blind to trend | Stacking-safe, but model error compounds |
| Verdict | Safer starting point | Only after A is well-tuned |

**Double-counting IOB is the single most common cause of hypos in home-built calculators.** Pick an architecture and lock it.

---

## 1. Global configuration

| Field | Type | Notes |
|---|---|---|
| `bg_units` | enum `mmol/L` \| `mg/dL` | Australia = mmol/L. Fix at install; never allow mid-session switching. |
| `insulin_increment` | number | Pen 0.5 U or 1.0 U; pump 0.05 U. All outputs rounded to this. |
| `rounding_mode` | enum | `nearest` \| `down`. `down` is the conservative default. |
| `bolus_insulin_brand` | enum | Rapid (aspart/lispro/glulisine) vs ultra-rapid (Fiasp, Lyumjev) — changes `dia_hours`, `peak_minutes`, prebolus timing. |
| `basal_insulin_brand` | enum | Glargine U100/U300, degludec, detemir, or pump basal. Determines §6-M11 logic. |
| `delivery_method` | enum | MDI pen \| pump \| AID (if AID, most modifiers are handled by the algorithm — do not stack manual factors). |

---

## 2. Profile parameters (clinician-set, time-blocked)

Store as a table of time blocks, not single values. Minimum blocks: overnight / dawn / morning / midday / afternoon / evening.

| Field | Units | Purpose |
|---|---|---|
| `icr[block]` | g carb per 1 U | Insulin-to-carb ratio |
| `isf[block]` | mmol/L (or mg/dL) per 1 U | Insulin sensitivity / correction factor |
| `bg_target[block]` | mmol/L | Single value or `target_low`/`target_high` band |
| `dia_hours` | h | Duration of insulin action (rapid analogues typically 4–6 h — confirm) |
| `peak_minutes` | min | Time to peak effect (typically 55–90 min by brand — confirm) |
| `carb_absorption_time_default` | min | For COB model |
| `max_single_bolus` | U | Hard cap |
| `max_bolus_per_rolling_4h` | U | Hard cap |
| `hypo_threshold` | mmol/L | Below this: treat, do not bolus |
| `severe_hyper_threshold` | mmol/L | Above this: ketone check mandatory |
| `ketone_action_threshold` | mmol/L | Sick-day protocol trigger |
| `prebolus_minutes[bg_band]` | min | Lag time by starting BG |
| `min_correction_interval` | min | Anti-stacking lockout |
| `reverse_correction_enabled` | bool | Reduce carb dose when BG < target |
| `fpu_enabled` | bool | Fat–protein dosing on/off |
| `fpu_carb_equivalent` | g per FPU | Warsaw method uses 10 g/FPU — clinician confirms |
| `protein_conversion_pct` | % | Fraction of protein grams counted as carb in very-low-carb meals |

---

## 3. Per-event inputs (what the user actually enters)

Target: **≤3 taps for a repeat meal, ≤6 for a new one.**

| Field | Source | Auto-fill strategy |
|---|---|---|
| `bg_now` | CGM API / manual | Auto-pull; flag if sensor reading is >5 min stale |
| `bg_trend_rate` | CGM | mmol/L per min or arrow class |
| `bg_confirmed_by_fingerstick` | bool | Force `true` when CGM–BG discordance suspected, sensor <12 h old, or symptoms mismatch reading |
| `carbs_g` | food DB / barcode / scale / favourite | Meal templates carry carbs, protein, fat, GI, split settings |
| `protein_g`, `fat_g` | food DB | Optional; needed only if `fpu_enabled` |
| `fibre_g`, `sugar_alcohol_g` | food DB | For net-carb rule (clinician decides whether to net out) |
| `gi_band` | enum low/med/high | Drives prebolus + extended split |
| `meal_time` | clock | Selects the time block |
| `iob_u` | dose log | Computed, never typed |
| `cob_g` | meal log | Computed |
| `exercise_state` | enum + timing | See M6/M7 |
| `illness_state` | enum | See M8 |
| `menstrual_phase` | enum | If applicable |
| `alcohol_units` | number | Delayed-hypo flag |
| `stress_sleep_flag` | bool | Optional resistance nudge |
| `site_region` | enum | Abdomen/arm/thigh/buttock — absorption speed differs |
| `site_age_hours` | number | Pump cannula / lipohypertrophy check |
| `ambient_heat_flag` | bool | Hot weather, sauna, spa, hot shower → faster absorption |

---

## 4. Derived fields

**Insulin on board (choose one model; exponential is most accurate):**

*Linear (crude):*
`iob_fraction(t) = max(0, 1 − t/dia_hours)`

*Exponential (Loop model), with `td = dia_hours`, `tp = peak_minutes`:*
```
tau = tp*(1 − tp/td) / (1 − 2*tp/td)
a   = 2*tau/td
S   = 1 / (1 − a + (1 + a)*exp(−td/tau))
iob_fraction(t) = 1 − S*(1 − a)*(( t²/(tau*td*(1 − a)) − t/tau − 1 )*exp(−t/tau) + 1)
```
`iob_u = Σ over all boluses [ dose_i × iob_fraction(t_i) ]`

**Carbs on board:**
`cob_g = Σ over meals [ carbs_i × max(0, 1 − t_i/carb_absorption_time_i) ]`

**Active parameters:**
`icr_active`, `isf_active`, `bg_target_active` = lookup by `meal_time` block, then multiplied by the composite modifier (§5).

**Trend projection:**
`bg_projected = bg_now + (bg_trend_rate × trend_horizon_minutes)`

**Fat–protein units (Warsaw method):**
```
kcal_fp = (fat_g × 9) + (protein_g × 4)
fpu     = kcal_fp / 100
fpu_carb_equiv_g = fpu × fpu_carb_equivalent
```
Extended-delivery duration scales with FPU count (clinician sets the ladder; commonly ~3 h at 1 FPU rising to ~8 h at 5+). MDI users deliver this as a split second injection, not an extension.

---

## 5. Core equations

**Architecture A — classic wizard**
```
carb_dose      = (carbs_g_effective + fpu_carb_equiv_g) / icr_active
correction     = (bg_now − bg_target_active) / isf_active      // signed
trend_adj      = trend_factor(bg_trend_rate)                    // U, signed, clinician-set
raw_dose       = carb_dose + correction + trend_adj − iob_u
suggested_dose = clamp(round(raw_dose × modifier_composite, insulin_increment), 0, max_single_bolus)
```
Rule: subtract IOB from the **correction** component only, unless the clinician specifies whole-dose subtraction. Never allow `carb_dose` to go negative — clamp at 0 and instead recommend carbs.

**Architecture B — predictive**
```
bg_eventual = bg_now + (bg_trend_rate × horizon)
              − (iob_u × isf_active)
              + ((cob_g + carbs_g_effective + fpu_carb_equiv_g) / icr_active × isf_active)
raw_dose    = (bg_eventual − bg_target_active) / isf_active
```

**Reverse correction (BG below target):** if enabled, `correction` is negative and reduces the carb dose; cap the reduction at a clinician-set percentage so a meal is never left grossly under-dosed.

**Carb effective:** `carbs_g_effective = carbs_g − (fibre_g × fibre_rule) − (sugar_alcohol_g × sa_rule)` — rules clinician-set, often 0 (i.e. no netting).

---

## 6. Modifier layers

Each returns a multiplier (applied to dose) and/or a target shift. **Composite = product of active multipliers, then hard-capped** (e.g. total adjustment never exceeds ±X%) so modifiers can't compound into a dangerous dose.

| ID | Factor | Mechanism | Calculable handles |
|---|---|---|---|
| **M1** | Dawn phenomenon / morning effect | Overnight cortisol + GH → insulin resistance, typically 03:00–09:00 | Separate `icr`/`isf` for dawn + morning blocks; `breakfast_factor` multiplier; longer prebolus; (pump) temp basal increase. Distinguish from Somogyi rebound and from waning basal — needs overnight CGM review, not a factor. |
| **M2** | Glycaemic index / meal composition | Absorption speed vs insulin curve | `prebolus_minutes` by GI + BG band; `split_pct_upfront` and `extension_hours` |
| **M3** | Fat | Delays gastric emptying, causes 3–8 h late rise, induces transient resistance | FPU (§4) delivered extended/split; separate `fat_resistance_factor` if clinician prefers a % uplift over FPU |
| **M4** | Protein | Gluconeogenesis; significant in low-carb meals or large protein loads | `protein_conversion_pct` × `protein_g` added to effective carbs, delivered late |
| **M5** | Trend / rate of change | Momentum not captured by point BG | `trend_adj` U table by arrow class, or Architecture B |
| **M6** | Low/moderate-intensity aerobic exercise | Insulin-independent glucose uptake ↑; hypo risk during and after | `bolus_multiplier < 1` for meals within X h pre-exercise; raised `bg_target`; basal reduction % (pump) or reduced correction (MDI); carb top-up g/h; **late-onset window** (up to 24–48 h, especially overnight) with raised target and reduced sensitivity aggressiveness |
| **M7** | Intense / anaerobic / HIIT / resistance | Catecholamine + cortisol surge can **raise** BG, then crash later | `bolus_multiplier ≥ 1` or no reduction during; small post-session correction rule with an explicit conservatism cap; mandatory late-hypo watch flag |
| **M8** | Illness / infection / inflammation | Counter-regulatory hormones → resistance; risk of DKA | `sick_factor` multiplier; mandatory ketone entry above `severe_hyper_threshold`; **hard stop**: if ketones ≥ threshold or vomiting, calculator refuses to advise and routes to the clinician-issued sick-day plan and urgent care. Never let the app manage DKA. |
| **M9** | Medications | Corticosteroids (large resistance, dose-dependent); GLP-1 RA (slowed emptying → longer prebolus, smaller meals); SGLT2i (**euglycaemic DKA risk** — ketone rule applies even at normal BG); beta-blockers (masked hypo symptoms) | `med_factor` per active medication, with start/taper schedule |
| **M10** | Hormonal cycle | Luteal-phase resistance | `phase_factor` by cycle day, learned from logs |
| **M11** | Long-acting basal | Sets the floor the bolus math assumes | Log `basal_dose`, `basal_time`, `basal_taken` bool. **Do not include basal in `iob_u`.** Basal adequacy verified by fasting/overnight flat-line test, not by the calculator. Degludec: ~42 h action, dose changes take ~3 days to equilibrate — block rapid iteration. Missed/late dose → flag, do not auto-recalculate; escalate to clinician rule. Split detemir = two logged doses. |
| **M12** | Absorption variability | Site region (abdomen fastest), lipohypertrophy, site/cannula age, heat, exercise of the injected limb, massage, alcohol swab, IM injection | Site rotation tracker with a warning; `heat_flag` shortens prebolus; suspected-failed-site rule (BG not falling as predicted ≥ X h post-dose → check site/insulin, do not simply redose) |
| **M13** | Alcohol | Suppresses hepatic glucose output → delayed nocturnal hypo, often 6–12 h later | Overnight target raise, reduced overnight correction, mandatory pre-bed check reminder; no bolus reduction for the carbs in the drink without a clinician rule |
| **M14** | Sleep debt, acute stress, caffeine, heat/cold, altitude, travel/time-zone shift, fasting, vaccination, dental infection, gastroparesis | Mostly resistance or absorption timing | Single `context_factor` with a tight cap; gastroparesis (if diagnosed) inverts prebolus to a **post-meal** or heavily extended strategy |
| **M15** | Insulin integrity | Heat exposure, expiry, in-use days, freezing | `vial_open_date`, `expiry`, `heat_excursion` flag → prompt cartridge change before dose-chasing |

---

## 7. Delivery shaping (output, not just a number)

| Output field | Meaning |
|---|---|
| `suggested_dose_u` | The single number shown large |
| `prebolus_minutes` | Wait time before eating, with a live timer |
| `split_upfront_u` / `split_later_u` / `split_delay_minutes` | MDI two-injection plan for fat/protein meals |
| `extended_bolus_pct` / `extended_duration_h` | Pump dual-wave equivalent |
| `post_meal_check_at` | Scheduled check time |
| `overnight_watch_flag` | Set by M6/M7/M13 |
| `rationale_breakdown` | Collapsed by default: carb / correction / IOB / modifiers, each line itemised |

---

## 8. Safety layer (non-negotiable, evaluated before any dose is shown)

1. **Hypo gate** — `bg_now < hypo_threshold` → treat first; carbs-only screen; bolus deferred, not merely reduced.
2. **Falling-fast gate** — steep downward trend overrides carb-dose logic per clinician rule.
3. **Anti-stacking** — `min_correction_interval` lockout; if IOB > 0 and a correction is requested, require explicit confirmation and show the last dose time.
4. **Hard caps** — `max_single_bolus`, `max_bolus_per_rolling_4h`, max composite modifier deviation.
5. **Duplicate-dose prevention** — a dose cannot be logged twice within N minutes without a deliberate confirm; a 60-second undo window; every entry timestamped and immutable thereafter.
6. **Ketone gate** — high BG + ketones → sick-day plan and urgent-care routing, calculator suspends.
7. **Sensor trust rule** — require fingerstick confirmation when the reading is stale, discordant, in the first hours of a new sensor, or when symptoms disagree.
8. **Stale-input rule** — inputs older than X minutes are discarded, not reused.
9. **Sanity display** — always show the inputs used, so a wrong carb entry is visible before delivery.
10. **Fail-safe default** — on any missing/invalid input, the calculator refuses rather than guessing.
11. **Data integrity** — local-first storage, encrypted, exportable; no silent overwrites; version-stamp every parameter change so past decisions remain interpretable.
12. **No autonomous action** — the app suggests; the human doses. No auto-delivery without a regulated pump/AID system.

---

## 9. ADHD-optimised automation layer

The clinical maths above is the easy half. Adherence failure modes for ADHD are **forgetting, double-dosing, uncertainty about whether a dose happened, and abandoning any flow with too many taps.**

| Problem | Design response |
|---|---|
| Too many decisions | One big number, everything else collapsed. Defaults chosen, never blank. |
| Repetitive entry | Meal favourites/templates carrying carbs, protein, fat, GI, split and prebolus; "same as last time" one-tap; barcode scan; scale integration |
| "Did I bolus?" | Persistent home-screen state: last dose, amount, minutes ago, IOB — visible without opening anything. Widget + lock screen. |
| Double-dosing | Lockout + undo window + explicit confirm dialog naming the previous dose |
| Prebolus forgotten mid-task | Timer with escalating alarm that survives app closure; snooze-resistant; "eat now" notification |
| Basal dose forgotten | Fixed-time hard reminder, streak/state display, non-dismissable until answered yes/no, and a logged "missed" state |
| Post-meal check forgotten | Auto-scheduled, context-aware (extended for high-fat meals) |
| Overnight risk after exercise/alcohol | Automatic pre-bed check reminder and overnight watch flag |
| Executive-function crashes | Emergency simple mode: BG + carbs only, conservative fixed factors, no modifiers |
| Supply/kit lapses | Cartridge, sensor, strip and hypo-treatment stock countdowns; travel checklist |
| Losing the thread of what's working | Automatic weekly summary; no manual diary required |

---

## 10. Logging & clinician review outputs

Log every field in §3 plus the resulting dose, the modifier composite, and the outcome BG at +1 h, +2 h, +4 h (and +6/+8 h for high-fat meals). Then generate:

- Time in range, time below range, time above range, coefficient of variation, GMI
- Post-meal excursion by meal type, by time block, by GI band — the evidence for changing `icr`/`isf`
- Hypo events with preceding dose, IOB, exercise and alcohol context
- Modifier audit: which factors fired, and whether they improved outcomes
- Missed-basal and missed-bolus counts
- Parameter change history with the before/after outcome comparison

This export is the point of the whole system: it converts guesswork into a fortnightly clinician conversation with data behind it.

---

## 11. Clinician sign-off worksheet

Print this and have it completed and signed. Nothing below should be self-set.

| Parameter | Value(s) | Signed off |
|---|---|---|
| `icr` per time block | | |
| `isf` per time block | | |
| `bg_target` per time block (and band) | | |
| `dia_hours`, `peak_minutes` | | |
| Basal insulin, dose, timing, missed-dose rule | | |
| `prebolus_minutes` by BG band and GI band | | |
| `max_single_bolus`, `max_bolus_per_rolling_4h` | | |
| `hypo_threshold` and hypo treatment protocol | | |
| `severe_hyper_threshold`, `ketone_action_threshold`, sick-day plan | | |
| `sick_factor` range | | |
| Exercise rules: M6 and M7 multipliers, target shifts, carb top-ups, late-onset window | | |
| FPU on/off, `fpu_carb_equivalent`, extension ladder, MDI split strategy | | |
| `protein_conversion_pct` and when it applies | | |
| Fibre / sugar-alcohol netting rules | | |
| Trend adjustment table | | |
| Reverse correction on/off and cap | | |
| Maximum composite modifier deviation | | |
| Medication factors (steroids, GLP-1, SGLT2i) | | |
| Architecture: A or B | | |
| Review cadence and escalation contacts | | |

---

**Build order recommendation:** §1–§5 with all modifiers off → validate against the existing bolus wizard for 2–4 weeks → add M1, M2, M5 → add M6/M7 → add M3/M4 (FPU) last, since fat/protein dosing is where home-built calculators most often overshoot. §8 and §9 are built first, not last.
