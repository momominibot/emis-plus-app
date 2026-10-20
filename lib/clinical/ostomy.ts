/**
 * Ostomy output, hydration and food guidance.
 *
 * Supports the in-app ostomy diary: classifies stoma output, estimates hydration
 * status from user-reported signs and urine colour, and offers food guidance for
 * managing output. Anchored to high-output-stoma literature (Arenas Villafranca
 * 2015; BJS 2025), the St Mark's electrolyte solution (NHS SPS) and patient
 * hydration guidance (UC Davis).
 *
 * IMPORTANT — educational only. High output and dehydration can become dangerous
 * quickly. The app must always steer users toward their stoma nurse / clinician
 * and flag red-flag symptoms for urgent care.
 */

import type { ReferenceId } from "./references";

export type StomaType = "ileostomy" | "colostomy" | "urostomy";

export type OutputLevel = "low" | "normal" | "high" | "very-high";

export interface OutputClassification {
  level: OutputLevel;
  headline: string;
  detail: string;
  references: ReferenceId[];
}

/**
 * Classify a 24-hour ostomy output volume (mL). Thresholds follow the widely used
 * high-output-stoma definitions: >1500–2000 mL/24h indicates a high-output stoma
 * with risk of water/sodium/magnesium depletion. Most relevant to ileostomy.
 */
export function classifyOutput(
  volumeMl: number,
  type: StomaType,
): OutputClassification {
  if (type === "urostomy") {
    return {
      level: "normal",
      headline: "Urostomy output reflects urine, not stool",
      detail:
        "For a urostomy, low urine volume or dark, strong-smelling urine can signal dehydration. Aim for pale urine and contact your stoma nurse if output drops noticeably.",
      references: ["ucDavisHydration"],
    };
  }

  // Ileostomy / colostomy volume thresholds.
  if (volumeMl >= 2000) {
    return {
      level: "very-high",
      headline: "Very high output (≥ 2000 mL/day)",
      detail:
        "Output at or above 2000 mL/day is a high-output stoma and a common cause of dehydration and salt/magnesium depletion. Contact your stoma care team promptly; if you also feel very unwell, faint, or can't keep fluids down, seek urgent care.",
      references: ["hosProtocol2015", "hosReview2025"],
    };
  }
  if (volumeMl >= 1500) {
    return {
      level: "high",
      headline: "High output (1500–2000 mL/day)",
      detail:
        "Output of 1500 mL/day or more on consecutive days meets the definition of a high-output stoma. Prioritise an oral rehydration (electrolyte) solution over plain water and contact your stoma care team for review.",
      references: ["hosProtocol2015", "hosReview2025"],
    };
  }
  if (volumeMl >= 1200) {
    return {
      level: "normal",
      headline: "Upper-normal output (1200–1500 mL/day)",
      detail:
        "This is at the upper end of typical ileostomy output. Keep monitoring and make sure your fluids include electrolytes, not just water.",
      references: ["ucDavisHydration", "hosProtocol2015"],
    };
  }
  if (volumeMl >= 500) {
    return {
      level: "normal",
      headline: "Typical output (about 500–1200 mL/day)",
      detail:
        "This is within the usual range for an established ileostomy. Keep recording so you can spot trends.",
      references: ["ucDavisHydration"],
    };
  }
  return {
    level: "low",
    headline: "Low output (under 500 mL/day)",
    detail:
      "Low or absent output can occasionally indicate a blockage, especially with cramps, bloating, nausea or vomiting. If output stops and you have these symptoms, contact your stoma team urgently.",
    references: ["ucDavisHydration"],
  };
}

// --- Hydration assessment -----------------------------------------------------

export type UrineColour = "pale" | "yellow" | "dark";

export interface HydrationInput {
  /** Symptoms the user reports today. */
  symptoms: {
    thirst: boolean;
    dryMouth: boolean;
    dizziness: boolean; // especially on standing
    fatigue: boolean;
    headache: boolean;
    crampingMuscles: boolean;
    reducedUrine: boolean;
  };
  urineColour: UrineColour;
  /** Most recent 24h stoma output if known. */
  outputMl?: number;
  stomaType: StomaType;
}

export type HydrationStatus = "likely-ok" | "watch" | "concern" | "urgent";

export interface HydrationAssessment {
  status: HydrationStatus;
  headline: string;
  advice: string[];
  redFlags: string[];
  references: ReferenceId[];
}

/**
 * Estimate hydration status from reported signs. Deliberately conservative: the
 * combination of dark urine + reduced urine + dizziness, or very-high output,
 * escalates toward "urgent".
 */
export function assessHydration(input: HydrationInput): HydrationAssessment {
  const s = input.symptoms;
  let score = 0;
  if (s.thirst) score += 1;
  if (s.dryMouth) score += 1;
  if (s.fatigue) score += 1;
  if (s.headache) score += 1;
  if (s.crampingMuscles) score += 2; // can reflect salt/magnesium loss
  if (s.dizziness) score += 2; // postural dizziness is a flag
  if (s.reducedUrine) score += 2;
  if (input.urineColour === "yellow") score += 1;
  if (input.urineColour === "dark") score += 3;
  if (input.outputMl !== undefined && input.outputMl >= 2000) score += 3;
  else if (input.outputMl !== undefined && input.outputMl >= 1500) score += 2;

  const advice: string[] = [];
  const redFlags: string[] = [];

  // Universal hydration advice for ileostomy/high output.
  advice.push(
    "Sip an oral rehydration (electrolyte) solution through the day rather than gulping large amounts of plain water — plain water alone can worsen salt loss with a high-output stoma.",
  );
  advice.push(
    "Aim for pale-yellow urine and a reasonable urine volume across the day as a simple hydration check.",
  );

  let status: HydrationStatus;
  let headline: string;

  if (score >= 8 || (s.dizziness && s.reducedUrine && input.urineColour === "dark")) {
    status = "urgent";
    headline = "Signs point to significant dehydration — seek help now";
    redFlags.push(
      "Contact your stoma care team or seek urgent medical care today, especially with dizziness on standing, very dark or greatly reduced urine, or feeling faint/confused.",
    );
  } else if (score >= 5) {
    status = "concern";
    headline = "Several dehydration signs — act today";
    advice.push(
      "Increase electrolyte solution intake, reduce sugary and caffeinated drinks, and contact your stoma nurse for advice. Consider whether a St Mark's-type solution is appropriate for you.",
    );
  } else if (score >= 2) {
    status = "watch";
    headline = "Early/mild signs — keep an eye on it";
    advice.push(
      "Top up electrolyte fluids now and recheck your symptoms and urine colour later today.",
    );
  } else {
    status = "likely-ok";
    headline = "No strong signs of dehydration right now";
    advice.push("Keep up your usual fluids and continue recording your output.");
  }

  return {
    status,
    headline,
    advice,
    redFlags,
    references: ["ucDavisHydration", "hosProtocol2015"],
  };
}

// --- St Mark's electrolyte solution ------------------------------------------

export interface OralRehydrationRecipe {
  name: string;
  ingredients: { item: string; amount: string }[];
  instructions: string;
  caution: string;
  references: ReferenceId[];
}

/** The St Mark's electrolyte solution, per the NHS Specialist Pharmacy Service. */
export const ST_MARKS_SOLUTION: OralRehydrationRecipe = {
  name: "St Mark's electrolyte solution",
  ingredients: [
    { item: "Glucose powder", amount: "20 g (about 6 level 5 mL spoons)" },
    { item: "Sodium chloride (table salt)", amount: "3.5 g (1 level 5 mL spoon)" },
    {
      item: "Sodium bicarbonate (baking soda)",
      amount: "2.5 g (1 heaped 2.5 mL spoon)",
    },
    { item: "Water", amount: "1 litre" },
  ],
  instructions:
    "Dissolve the powders in 1 litre of water. Make it fresh each day and keep chilled to improve the taste. Sip throughout the day rather than drinking it all at once.",
  caution:
    "Check with your stoma nurse, dietitian or pharmacist before starting — the amount that's right for you depends on your output and other conditions. Not a substitute for medical advice.",
  references: ["stMarksSPS"],
};

// --- Food guidance ------------------------------------------------------------

export interface FoodGuidance {
  thickening: string[];
  limitOrAvoid: string[];
  hydrationTips: string[];
  references: ReferenceId[];
  caution: string;
}

/** General food guidance to help manage output (most relevant to ileostomy). */
export function foodGuidance(type: StomaType): FoodGuidance {
  if (type === "urostomy") {
    return {
      thickening: [],
      limitOrAvoid: ["Excess caffeine and alcohol (can worsen dehydration)"],
      hydrationTips: [
        "Keep urine pale by drinking steadily through the day.",
        "Cranberry or extra fluids may be suggested by your team to reduce odour and infection risk — check with them first.",
      ],
      references: ["ucDavisHydration"],
      caution:
        "Food affects urostomies less than ileostomies. Personalise any dietary changes with your stoma nurse or dietitian.",
    };
  }

  return {
    thickening: [
      "Bananas",
      "White rice",
      "Pasta and white bread",
      "Applesauce",
      "Smooth peanut butter",
      "Cheese",
      "Potatoes (without skin)",
      "Marshmallows",
    ],
    limitOrAvoid: [
      "High-fibre foods and fruit/vegetable skins (can increase output or cause blockages)",
      "Nuts, sweetcorn, mushrooms, celery and other tough/fibrous foods (blockage risk)",
      "Very spicy foods",
      "Alcohol and caffeine (increase fluid loss)",
      "Large volumes of sugary drinks and plain water on their own (can increase output)",
    ],
    hydrationTips: [
      "Choose electrolyte/oral rehydration drinks over large amounts of plain water.",
      "Add a little salt to meals (unless told otherwise) to help replace sodium lost in output.",
      "Eat regular, smaller meals and chew thoroughly to reduce blockage risk.",
    ],
    references: ["ucDavisHydration", "hosProtocol2015"],
    caution:
      "Tolerance is individual — reintroduce foods one at a time. Always confirm dietary changes with your stoma nurse or dietitian, especially if output is high.",
  };
}
