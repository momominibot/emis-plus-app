/**
 * Peristomal skin self-assessment, aligned to the DET score (Ostomy Skin Tool).
 *
 * The Ostomy Skin Tool (Martins et al., Coloplast; validated 2011, 2.0 in 2023)
 * scores three domains — Discolouration, Erosion, Tissue overgrowth — each on an
 * AREA dimension (0–3, proportion of skin under the baseplate) and a SEVERITY
 * dimension (0–2). Total ranges 0–15, banded normal / mild / moderate / severe.
 *
 * This module reproduces that structure for a patient-facing self-check (plain
 * language severity descriptors live in the UI), adds contextual cause-pattern
 * hints and triage, and always points the user back to their stoma nurse. It is
 * educational, not a diagnosis. Severity can only be > 0 where area > 0.
 */

import type { ReferenceId } from "./references";

export type DomainKey = "discoloration" | "erosion" | "tissueOvergrowth";

/** area: proportion affected (0–3). severity: clinical severity (0–2). */
export interface DETDomainScore {
  area: 0 | 1 | 2 | 3;
  severity: 0 | 1 | 2;
}

export type LeakageFrequency = "none" | "occasional" | "frequent";

export interface PeristomalInput {
  domains: Record<DomainKey, DETDomainScore>;
  leakageFrequency: LeakageFrequency;
  /** Itching or burning under/around the barrier (possible fungal). */
  itchOrBurning: boolean;
  /** Pain or soreness when removing the pouch (possible adhesive injury). */
  painOnRemoval: boolean;
  /** Bleeding from the skin or raised tissue. */
  bleeding: boolean;
  /** Spreading redness, pus, or fever (possible infection). */
  signsOfInfection: boolean;
}

export type DETCategory = "normal" | "mild" | "moderate" | "severe";

export interface DomainResult extends DETDomainScore {
  key: DomainKey;
  /** area + severity, capped per the tool. */
  subtotal: number;
}

export interface PeristomalAssessment {
  detTotal: number; // 0–15
  category: DETCategory;
  byDomain: DomainResult[];
  headline: string;
  interpretation: string;
  likelyContributors: string[];
  actions: string[];
  redFlags: string[];
  references: ReferenceId[];
}

/** Normalise a domain: severity is only meaningful where area > 0. */
function normaliseDomain(d: DETDomainScore): DETDomainScore {
  if (d.area === 0) return { area: 0, severity: 0 };
  return d;
}

export function detCategory(total: number): DETCategory {
  if (total <= 0) return "normal";
  if (total <= 3) return "mild"; // tool bands mild as 2–3; we include 1 as mild
  if (total <= 6) return "moderate";
  return "severe";
}

const DOMAIN_ORDER: DomainKey[] = ["discoloration", "erosion", "tissueOvergrowth"];

export function assessPeristomal(input: PeristomalInput): PeristomalAssessment {
  const byDomain: DomainResult[] = DOMAIN_ORDER.map((key) => {
    const d = normaliseDomain(input.domains[key]);
    return { key, area: d.area, severity: d.severity, subtotal: d.area + d.severity };
  });

  const detTotal = byDomain.reduce((sum, d) => sum + d.subtotal, 0);
  const category = detCategory(detTotal);

  const erosion = byDomain.find((d) => d.key === "erosion")!;
  const overgrowth = byDomain.find((d) => d.key === "tissueOvergrowth")!;

  // --- Cause-pattern hints (educational, not diagnostic) ---
  const likelyContributors: string[] = [];

  if (erosion.area > 0 && input.leakageFrequency === "frequent") {
    likelyContributors.push(
      "Frequent leakage together with broken skin points to output sitting on the skin (irritant / moisture-associated damage). Reviewing the barrier fit and changing the pouch before it leaks usually helps the most.",
    );
  } else if (input.leakageFrequency === "frequent") {
    likelyContributors.push(
      "Frequent leakage is the single biggest driver of peristomal skin problems — it's a reason to review your appliance fit and routine, not to change less often.",
    );
  }

  if (input.itchOrBurning) {
    likelyContributors.push(
      "Itching or burning — especially with spreading redness or small 'satellite' spots — can suggest a fungal (yeast) skin infection. Worth showing your stoma nurse.",
    );
  }

  if (input.painOnRemoval || (erosion.area > 0 && input.bleeding)) {
    likelyContributors.push(
      "Soreness or bleeding when the pouch comes off can be adhesive-related skin injury. Gentle removal (an adhesive remover, supporting the skin as you peel) often reduces this.",
    );
  }

  if (overgrowth.area > 0) {
    likelyContributors.push(
      "Raised or overgrown tissue can develop with long-standing leakage or friction (for example, granulomas). Have your stoma nurse take a look.",
    );
  }

  if (likelyContributors.length === 0 && category !== "normal") {
    likelyContributors.push(
      "Keep protecting the skin and monitoring. If changes persist or worsen, your stoma nurse can help find the cause.",
    );
  }

  // --- Actions by severity band ---
  const actions: string[] = [];
  switch (category) {
    case "normal":
      actions.push("Your skin looks healthy — keep up your current routine.");
      actions.push(
        "Clean gently with warm water, dry fully, and check the barrier opening fits snugly.",
      );
      break;
    case "mild":
      actions.push(
        "Protect the skin and make sure the barrier opening matches your stoma — small gaps let output reach the skin.",
      );
      actions.push(
        "Barrier accessories (a ring, paste or protective powder) can help. Monitor over the next few changes.",
      );
      break;
    case "moderate":
      actions.push(
        "Review your appliance fit and change routine, and consider barrier accessories.",
      );
      actions.push(
        "A stoma nurse review is recommended — moderate changes often need a tailored plan.",
      );
      break;
    case "severe":
      actions.push(
        "Please contact your stoma care nurse promptly — extensive skin changes need hands-on assessment and treatment.",
      );
      break;
  }

  // --- Red flags ---
  const redFlags: string[] = [];
  if (input.signsOfInfection) {
    redFlags.push(
      "Spreading redness, pus, or fever can signal infection — seek medical care promptly.",
    );
  }
  if (erosion.severity === 2) {
    redFlags.push(
      "Deep or widespread skin breakdown should be seen by your stoma nurse soon.",
    );
  }

  const headline =
    category === "normal"
      ? "Skin looks healthy"
      : `Peristomal skin changes — ${category} (DET ${detTotal}/15)`;

  const interpretation =
    category === "normal"
      ? "No discolouration, erosion or tissue overgrowth scored. Keep monitoring at each change."
      : `Your DET score is ${detTotal} out of 15 (${category}). The DET score is the framework stoma nurses use to grade peristomal skin across discolouration, erosion and tissue overgrowth.`;

  return {
    detTotal,
    category,
    byDomain,
    headline,
    interpretation,
    likelyContributors,
    actions,
    redFlags,
    references: ["ostomySkinTool", "wocnPSAG"],
  };
}
