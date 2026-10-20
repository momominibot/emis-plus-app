/**
 * Wound-healing nutrition calculator.
 *
 * Estimates daily protein, energy, fluid and supportive-micronutrient targets to
 * support wound / pressure-injury healing, anchored to the 2019 EPUAP/NPIAP/PPPIA
 * international guideline as summarised by Munoz et al. (2020).
 *
 * IMPORTANT — this is an educational estimate for patients & caregivers, not a
 * prescription. Outputs are ranges. Real targets must be individualised by a
 * registered dietitian / clinician, especially in kidney disease, liver disease,
 * diabetes or fluid-restricted states.
 */

import type { ReferenceId } from "./references";

export type Sex = "female" | "male";

/** A clinical factor that nudges protein needs toward the upper end of the range. */
export type WoundSeverity =
  | "at-risk" // at risk of pressure injury / early/superficial wound
  | "established" // established stage 2 wound
  | "severe"; // large / multiple / stage 3-4 / heavily exuding wound

export interface WoundNutritionInput {
  weightKg: number;
  /** Optional — only used to flag plausibility and BMI context, not core to the calc. */
  heightCm?: number;
  age?: number;
  sex?: Sex;
  severity: WoundSeverity;
  /** User has been told they are malnourished or at risk (raises protein/energy emphasis). */
  malnourished: boolean;
  /**
   * User reports diagnosed kidney disease. When true we DO NOT push high protein;
   * we surface a strong "your protein target must be set by your kidney team" warning.
   */
  renalImpairment: boolean;
  /** Fluid restricted by a clinician (e.g. heart/kidney failure). Suppresses fluid target. */
  fluidRestricted: boolean;
}

export interface Range {
  low: number;
  high: number;
  unit: string;
}

export interface MicronutrientGuidance {
  name: string;
  /** Human-readable dose/range as stated by guidelines. */
  dose: string;
  rationale: string;
  caution?: string;
  references: ReferenceId[];
  /** Tag used to match emis.asia products. */
  productTag: string;
}

export interface WoundNutritionResult {
  protein: Range;
  energy: Range;
  fluid: Range | null;
  micronutrients: MicronutrientGuidance[];
  warnings: string[];
  notes: string[];
  references: ReferenceId[];
}

// --- Guideline constants (all cite npiap2019 / munoz2020) ---------------------

/** Protein g/kg/day. Guideline range for adults with a pressure injury who are
 *  malnourished or at risk: 1.25–1.5 g/kg/day. */
const PROTEIN_GKG = { low: 1.25, high: 1.5 } as const;

/** Energy kcal/kg/day for individuals with / at risk of pressure injury. */
const ENERGY_KCAL_KG = { low: 30, high: 35 } as const;

/** Fluid ~1 mL per kcal of estimated energy need (guideline rule of thumb). */
const FLUID_ML_PER_KCAL = 1;

const round = (n: number, dp = 0) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/**
 * Severity nudges WHERE in the guideline range we centre the estimate. We never
 * exceed the published guideline bounds — severity only shifts emphasis within them.
 */
function proteinRangeFor(input: WoundNutritionInput): Range {
  let low: number = PROTEIN_GKG.low;
  let high: number = PROTEIN_GKG.high;

  // For lower-risk / superficial situations, allow the lower bound to start a touch
  // below the guideline floor toward general healthy intake (~1.0 g/kg) so we don't
  // over-state needs for someone merely "at risk".
  if (input.severity === "at-risk" && !input.malnourished) {
    low = 1.0;
    high = 1.25;
  } else if (input.severity === "severe" || input.malnourished) {
    low = 1.5;
    high = 1.5; // stay at the guideline ceiling; do not invent higher numbers
  }

  return {
    low: round(input.weightKg * low),
    high: round(input.weightKg * high),
    unit: "g/day",
  };
}

function energyRangeFor(input: WoundNutritionInput): Range {
  return {
    low: round(input.weightKg * ENERGY_KCAL_KG.low),
    high: round(input.weightKg * ENERGY_KCAL_KG.high),
    unit: "kcal/day",
  };
}

function fluidRangeFor(input: WoundNutritionInput, energy: Range): Range | null {
  if (input.fluidRestricted) return null;
  return {
    low: round(energy.low * FLUID_ML_PER_KCAL),
    high: round(energy.high * FLUID_ML_PER_KCAL),
    unit: "mL/day",
  };
}

/**
 * Supportive micronutrients. These are offered as supplementation that *may* be
 * considered when wounds are not healing and dietary intake is inadequate — they
 * are adjuncts, not replacements for adequate protein/energy. Doses are the ones
 * cited in the guideline literature; cautions reflect upper intake limits.
 */
function micronutrientsFor(input: WoundNutritionInput): MicronutrientGuidance[] {
  const recommend = input.severity !== "at-risk" || input.malnourished;
  if (!recommend) return [];

  return [
    {
      name: "Arginine (with zinc & antioxidants)",
      dose: "Arginine-enriched oral nutritional supplement, ~7–9 g arginine/day",
      rationale:
        "Arginine, zinc and antioxidant-enriched high-protein/high-energy oral supplements improved healing of stage 2+ pressure injuries in randomised trials when needs were not met by diet alone.",
      caution:
        "Use a wound-specific supplement product rather than stand-alone high-dose arginine. Discuss with your clinician if you have severe liver or kidney disease.",
      references: ["munoz2020", "arginineReview2016", "arginineDose2025"],
      productTag: "arginine-wound-supplement",
    },
    {
      name: "Vitamin C",
      dose: "Commonly 500 mg/day (sometimes given as 500 mg twice daily for healing)",
      rationale:
        "Vitamin C is a cofactor for collagen synthesis; supplementation is used to support wound repair where intake or status is low.",
      caution: "Very high doses offer no extra benefit and can cause stomach upset.",
      references: ["munoz2020", "npiap2019"],
      productTag: "vitamin-c",
    },
    {
      name: "Zinc",
      dose: "15–30 mg/day, short-term only",
      rationale:
        "Zinc supports protein synthesis and immune function during healing; used when deficiency is suspected.",
      caution:
        "Do not exceed 40 mg/day (adult upper limit) and avoid prolonged high-dose zinc — it can cause copper deficiency. Use under guidance.",
      references: ["munoz2020", "zincUL"],
      productTag: "zinc",
    },
  ];
}

export function calculateWoundNutrition(
  input: WoundNutritionInput,
): WoundNutritionResult {
  const warnings: string[] = [];
  const notes: string[] = [];

  const energy = energyRangeFor(input);
  let protein = proteinRangeFor(input);
  const fluid = fluidRangeFor(input, energy);

  if (input.renalImpairment) {
    // Safety override: do NOT recommend high protein in renal impairment.
    warnings.push(
      "You indicated kidney disease. High-protein targets can be harmful in some kidney conditions. The protein figure below is shown for reference only — your actual target MUST be set by your kidney specialist or renal dietitian.",
    );
    // Cap displayed protein at the general (non-wound) level to avoid over-recommending.
    protein = {
      low: round(input.weightKg * 0.8),
      high: round(input.weightKg * 1.0),
      unit: "g/day",
    };
  }

  if (input.fluidRestricted) {
    warnings.push(
      "You indicated a clinician-set fluid restriction, so no fluid target is shown. Follow the fluid limit your care team gave you.",
    );
  }

  if (input.malnourished) {
    notes.push(
      "Because you indicated malnutrition or risk of it, targets sit at the upper end of the healing range and a dietitian referral is strongly advised.",
    );
  }

  notes.push(
    "These are starting estimates to discuss with your dietitian — they are not a prescription and do not account for every medical condition or medication.",
  );

  return {
    protein,
    energy,
    fluid,
    micronutrients: micronutrientsFor(input),
    warnings,
    notes,
    references: ["npiap2019", "munoz2020"],
  };
}

/** Optional BMI helper used only for context messaging. */
export function bmi(weightKg: number, heightCm?: number): number | null {
  if (!heightCm || heightCm <= 0) return null;
  const m = heightCm / 100;
  return round(weightKg / (m * m), 1);
}
