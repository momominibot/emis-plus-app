/**
 * Wound Product Advisor — a patient/caregiver-facing dressing-category guide.
 *
 * It maps a small set of everyday answers (wound type × exudate × infection
 * signs × depth × fragile skin) to a *category* of wound-care product, plus
 * plain-language care steps and clear "see a professional" triage. It never
 * names a brand-level treatment and never replaces clinical assessment.
 *
 * Evidence base (see references.ts):
 *  - Moist wound healing + dressing families: Nuutila & Eriksson 2021.
 *  - Exudate ↔ absorbency (moisture balance): WUWHS exudate consensus; Wound Balance 2024.
 *  - Antimicrobials only with infection signs, time-limited: IWII 2022; NICE ESMPB2.
 *  - Skin tears → atraumatic/silicone contact layers: ISTAP 2025.
 *  - Diabetes-related foot = limb threat, prompt specialist review: IWGDF 2023.
 *  - Pressure injuries: EPUAP/NPIAP/PPPIA 2019.
 *  - Minor burn first aid (cool running water 20 min): ANZCOR 9.1.3.
 *
 * The specific-dressing evidence base is genuinely weak (NICE ESMPB2), so this
 * tool is deliberately conservative: it matches moisture, flags anything that
 * should be seen, and treats product suggestions as support, not prescription.
 */

import type { ReferenceId } from "./references";

export type WoundType =
  | "graze"
  | "cut"
  | "blister"
  | "surgical"
  | "skinTear"
  | "burn"
  | "pressure"
  | "diabeticFoot"
  | "legUlcer"
  | "notSure";

/** How wet the wound is — drives dressing absorbency (moisture balance). */
export type Exudate = "none" | "low" | "moderate" | "high";

/**
 * Infection signal.
 *  - none: no signs.
 *  - local: redness/warmth/swelling/pain/odour/pus AT the wound only.
 *  - spreading: redness spreading out, feeling feverish/unwell (possible cellulitis/sepsis).
 */
export type Infection = "none" | "local" | "spreading";

export type Depth = "surface" | "deep";

/** The product categories this advisor can point to (map to emis.asia collections). */
export type WoundCategory =
  | "cleansing"
  | "nonadherent"
  | "hydrocolloidHydrogel"
  | "foam"
  | "alginate"
  | "antimicrobial"
  | "npwt";

export type ReferUrgency = "none" | "routine" | "soon" | "urgent";

export interface WoundAdvisorInput {
  woundType: WoundType;
  exudate: Exudate;
  infection: Infection;
  depth: Depth;
  /** Thin/fragile/ageing skin, or a known reaction to sticky dressings. */
  fragileSkin: boolean;
  /** User is diabetic (raises the bar for referral even on non-foot wounds). */
  diabetic: boolean;
}

export interface CategoryPick {
  category: WoundCategory;
  /** Product tag consumed by <ProductRecommendations tags={[...]}/>. */
  tag: string;
  label: string;
  /** Why this category, in plain language. */
  why: string;
}

export interface WoundAdvice {
  headline: string;
  summary: string;
  /** Primary + optional supporting product categories. */
  picks: CategoryPick[];
  /** Concrete self-care steps. */
  careSteps: string[];
  refer: ReferUrgency;
  /** Referral / safety messages shown in the red banner. */
  redFlags: string[];
  references: ReferenceId[];
}

/** Product tags — must match keys added to shopify/recommendations.ts. */
export const CATEGORY_TAG: Record<WoundCategory, string> = {
  cleansing: "wound-cleansing",
  nonadherent: "wound-nonadherent",
  hydrocolloidHydrogel: "wound-hydrocolloid-hydrogel",
  foam: "wound-foam",
  alginate: "wound-alginate",
  antimicrobial: "wound-antimicrobial",
  npwt: "wound-npwt",
};

const CATEGORY_LABEL: Record<WoundCategory, string> = {
  cleansing: "Wound cleansing & basics",
  nonadherent: "Non-adherent contact layers & pads",
  hydrocolloidHydrogel: "Hydrocolloid & hydrogel dressings",
  foam: "Foam dressings",
  alginate: "Alginate & gelling-fibre dressings",
  antimicrobial: "Antimicrobial dressings (silver, iodine, honey)",
  npwt: "Negative pressure wound therapy",
};

function pick(category: WoundCategory, why: string): CategoryPick {
  return {
    category,
    tag: CATEGORY_TAG[category],
    label: CATEGORY_LABEL[category],
    why,
  };
}

/**
 * Choose a moisture-matched primary dressing category from exudate alone.
 * (Nuutila & Eriksson 2021; WUWHS exudate consensus.)
 */
function absorbencyPick(exudate: Exudate): CategoryPick {
  switch (exudate) {
    case "none":
      return pick(
        "hydrocolloidHydrogel",
        "A dry wound needs moisture added back. Hydrogel rehydrates the surface and a hydrocolloid keeps it moist so healing can move on.",
      );
    case "low":
      return pick(
        "hydrocolloidHydrogel",
        "For a lightly moist wound, a hydrocolloid (or thin foam) holds the ideal amount of moisture without drying it out.",
      );
    case "moderate":
      return pick(
        "foam",
        "A foam dressing soaks up a moderate amount of fluid while keeping the wound bed comfortably moist.",
      );
    case "high":
      return pick(
        "alginate",
        "A very wet wound needs a highly absorbent alginate or gelling-fibre dressing to lock away fluid and protect the surrounding skin.",
      );
  }
}

/** Human labels for the wound types (used in headlines/summaries). */
export const WOUND_LABEL: Record<WoundType, string> = {
  graze: "Graze / abrasion",
  cut: "Cut / laceration",
  blister: "Blister",
  surgical: "Surgical / stitched wound",
  skinTear: "Skin tear",
  burn: "Minor burn or scald",
  pressure: "Pressure sore",
  diabeticFoot: "Diabetic foot wound",
  legUlcer: "Leg ulcer",
  notSure: "Not sure",
};

const ALWAYS_REFER_DISCLAIMER =
  "This is general guidance, not a diagnosis. If you're unsure, or the wound isn't clearly improving within about 2 weeks, have it seen by a doctor, nurse or pharmacist.";

export function adviseWound(input: WoundAdvisorInput): WoundAdvice {
  const { woundType, exudate, infection, depth, fragileSkin, diabetic } = input;

  const picks: CategoryPick[] = [];
  const careSteps: string[] = [];
  const redFlags: string[] = [];
  const references: ReferenceId[] = ["moistHealing2021", "wuwhsExudate"];

  const REFER_ORDER = ["none", "routine", "soon", "urgent"] as const;
  let referLevel = 0;
  const escalate = (level: ReferUrgency) => {
    referLevel = Math.max(referLevel, REFER_ORDER.indexOf(level));
  };

  // --- 1. Universal safety: spreading infection overrides everything. ---
  if (infection === "spreading") {
    escalate("urgent");
    redFlags.push(
      "Spreading redness, warmth, swelling or feeling feverish/unwell can mean the infection is moving beyond the wound. Seek medical care today — a dressing is not enough on its own.",
    );
    references.push("iwii2022");
  } else if (infection === "local") {
    redFlags.push(
      "There are signs of local infection. An antimicrobial dressing can help for a short time, but see a clinician if it isn't settling within a few days.",
    );
    references.push("iwii2022", "niceDressings2016");
  }

  // --- 2. Wound-type triage that changes the whole recommendation. ---
  switch (woundType) {
    case "diabeticFoot": {
      escalate(infection !== "none" ? "urgent" : "soon");
      redFlags.push(
        infection !== "none"
          ? "A diabetic foot wound with any infection sign is an emergency for the foot — get it assessed urgently (same day)."
          : "Any wound on a diabetic foot should be professionally assessed promptly — small foot wounds in diabetes can worsen quickly.",
      );
      references.push("iwgdf2023");
      picks.push(
        pick(
          "nonadherent",
          "Until it's seen, cover with a gentle non-adherent dressing and keep all pressure off the area. Avoid tight or sticky dressings on the foot.",
        ),
      );
      if (infection !== "none") picks.push(absorbencyPick(exudate));
      careSteps.push(
        "Keep weight completely off the foot (offloading) — this matters as much as any dressing.",
        "Do not use corn/callus removers or soak the foot; check the foot daily.",
      );
      break;
    }
    case "legUlcer": {
      escalate("soon");
      redFlags.push(
        "Leg ulcers need a proper leg-circulation check (ABPI/Doppler) before any compression — please see a clinician or wound nurse first. The right compression is usually the main thing that heals them.",
      );
      picks.push(
        absorbencyPick(exudate === "none" || exudate === "low" ? "moderate" : exudate),
      );
      if (fragileSkin)
        picks.unshift(
          pick(
            "nonadherent",
            "A non-adherent contact layer protects fragile leg skin and makes changes painless while you arrange a review.",
          ),
        );
      careSteps.push(
        "Keep the leg elevated when resting and stay gently active.",
        "Don't apply compression bandaging yourself until circulation has been checked.",
      );
      break;
    }
    case "pressure": {
      // Simple depth proxy: deep = likely stage 3/4/unstageable → refer.
      escalate(depth === "deep" ? "soon" : "routine");
      references.push("npiap2019");
      if (depth === "deep") {
        redFlags.push(
          "A deep pressure sore (into the fat or beyond, or one you can't see the base of) needs professional assessment. Keep it covered and offloaded meanwhile.",
        );
      }
      picks.push(absorbencyPick(exudate));
      careSteps.push(
        "Relieve the pressure — reposition regularly and use cushioning/offloading. Pressure relief heals these, not the dressing alone.",
        "Good protein and calorie intake supports healing — try the wound-nutrition calculator.",
      );
      break;
    }
    case "burn": {
      references.push("anzcorBurns");
      // Deep/large/high-risk burns → refer; otherwise minor first-aid path.
      const highRisk = depth === "deep" || infection !== "none";
      if (highRisk) {
        escalate("soon");
        redFlags.push(
          "Get this burn seen by a healthcare professional: deeper, blistering, larger than a coin, on the face/hands/feet/genitals/joints, or in a young child or older adult.",
        );
      }
      careSteps.push(
        "First aid: cool the burn under cool (not icy) running water for a full 20 minutes, as soon as possible.",
        "Don't apply ice, butter, toothpaste or oils. Don't burst blisters.",
      );
      picks.push(
        pick(
          "nonadherent",
          "Cover a cooled minor burn with a non-adherent dressing (or clean cling film for transport). It won't stick to the healing surface.",
        ),
      );
      if (exudate === "moderate" || exudate === "high")
        picks.push(absorbencyPick(exudate));
      else
        picks.push(
          pick(
            "hydrocolloidHydrogel",
            "A hydrogel or thin hydrocolloid soothes and keeps a superficial burn moist as it heals.",
          ),
        );
      break;
    }
    case "skinTear": {
      references.push("istapSkinTears2025");
      picks.push(
        pick(
          "nonadherent",
          "Use a non-adherent, atraumatic (soft-silicone) contact layer so the dressing lifts off without tearing the delicate flap of skin.",
        ),
      );
      if (exudate === "moderate" || exudate === "high")
        picks.push(absorbencyPick(exudate));
      careSteps.push(
        "If there's a flap of skin, gently roll it back into place before covering — don't scrub it off.",
        "Mark an arrow on the dressing showing which way to peel, and always change it in that direction.",
      );
      escalate("routine");
      break;
    }
    case "surgical": {
      picks.push(
        fragileSkin
          ? pick(
              "nonadherent",
              "A gentle non-adherent island dressing protects the incision without stressing the skin.",
            )
          : pick(
              "foam",
              "A low-profile absorbent or foam island dressing protects a closed incision and manages any light ooze.",
            ),
      );
      careSteps.push(
        "Follow your surgical team's instructions on when to change the dressing and get it wet.",
        "Keep the incision clean and dry; watch the wound edges.",
      );
      redFlags.push(
        "See your surgical team if the wound opens, the edges gape, or there's increasing pain, redness, swelling or discharge.",
      );
      escalate("routine");
      break;
    }
    case "blister": {
      picks.push(
        pick(
          "hydrocolloidHydrogel",
          "A hydrocolloid 'blister plaster' cushions the area and keeps it moist whether the blister is intact or deroofed.",
        ),
      );
      if (exudate === "moderate" || exudate === "high")
        picks.push(absorbencyPick(exudate));
      careSteps.push(
        "Try not to burst an intact blister — the roof is a natural dressing.",
        "If it has already burst, clean gently and cover; don't pull away loose skin.",
      );
      break;
    }
    case "cut": {
      if (depth === "deep") {
        escalate("soon");
        redFlags.push(
          "A deep or gaping cut, one that won't stop bleeding after 10 minutes of pressure, or a wound from a dirty/rusty object or animal/human bite, should be seen quickly — it may need closure or a tetanus check.",
        );
      }
      picks.push(
        fragileSkin
          ? pick("nonadherent", "A non-adherent pad protects the cut without sticking to it.")
          : absorbencyPick(exudate === "none" ? "low" : exudate),
      );
      careSteps.push(
        "Press firmly with a clean pad to stop bleeding, then clean the wound and bring the edges together.",
      );
      break;
    }
    case "graze": {
      picks.push(
        exudate === "high" || exudate === "moderate"
          ? absorbencyPick(exudate)
          : pick(
              "hydrocolloidHydrogel",
              "A thin hydrocolloid or film keeps a graze moist so it heals faster and with less scarring than drying out under a scab.",
            ),
      );
      picks.push(pick("cleansing", "Rinse out grit and dirt with saline or clean running water before covering."));
      careSteps.push(
        "Clean the graze well to remove any grit, then keep it covered and moist.",
      );
      break;
    }
    case "notSure": {
      escalate("routine");
      picks.push(absorbencyPick(exudate));
      picks.push(pick("cleansing", "Start by cleaning gently with saline or clean water."));
      careSteps.push(
        "When in doubt, keep the wound clean, moist and covered, and have a pharmacist or nurse take a look.",
      );
      break;
    }
  }

  // --- 3. Infection modifier: antimicrobial as the contact layer, time-limited. ---
  if (infection === "local" && woundType !== "diabeticFoot" && woundType !== "legUlcer") {
    picks.unshift(
      pick(
        "antimicrobial",
        "Because there are signs of local infection, an antimicrobial dressing (silver, cadexomer iodine or medical-grade honey) can reduce the bacterial load. Use it as a short 2-week course, then review — it's not for everyday, uninfected wounds.",
      ),
    );
  }

  // --- 4. Depth modifier: deep/cavity wounds need filling + review. ---
  if (depth === "deep" && woundType !== "burn" && woundType !== "cut") {
    escalate("soon");
    if (exudate === "high" || exudate === "moderate") {
      picks.push(
        pick(
          "alginate",
          "A deep, exuding wound can be loosely filled with an alginate or gelling-fibre rope so it heals from the base — but a deep cavity should be assessed by a clinician.",
        ),
      );
    }
    picks.push(
      pick(
        "npwt",
        "Large or stubborn deep wounds are sometimes managed with negative pressure (vacuum) therapy under professional supervision.",
      ),
    );
  }

  // --- 5. Fragile-skin modifier: prefer atraumatic contact layer. ---
  if (
    fragileSkin &&
    !picks.some((p) => p.category === "nonadherent") &&
    woundType !== "diabeticFoot"
  ) {
    picks.unshift(
      pick(
        "nonadherent",
        "Because the skin is fragile or reacts to sticky dressings, use a gentle non-adherent contact layer and hold it with a soft wrap rather than strong tape.",
      ),
    );
    references.push("istapSkinTears2025");
  }

  // --- 6. Extra caution for people with diabetes on any wound. ---
  if (diabetic && woundType !== "diabeticFoot") {
    escalate("routine");
    redFlags.push(
      "Because you have diabetes, wounds can be slower to heal and easier to infect — keep a closer eye on it and get it reviewed sooner rather than later.",
    );
  }

  // De-duplicate categories, keeping the first (highest-priority) occurrence.
  const seen = new Set<WoundCategory>();
  const deduped = picks.filter((p) => {
    if (seen.has(p.category)) return false;
    seen.add(p.category);
    return true;
  });

  const refer: ReferUrgency = REFER_ORDER[referLevel];

  const label = WOUND_LABEL[woundType];
  const headline =
    refer === "urgent"
      ? "Please seek medical care now"
      : deduped.length > 0
        ? `Suggested for a ${label.toLowerCase()}: ${deduped[0].label}`
        : "Here's what may help";

  const summary =
    refer === "urgent"
      ? "Some answers suggest this needs professional care straight away. The products below can protect the wound on the way there, but they don't replace being seen."
      : `Based on a ${label.toLowerCase()} that is ${describeExudate(exudate)}${
          infection === "local" ? " with early infection signs" : ""
        }, here's the type of product that fits — and how to use it.`;

  // Dedupe references while preserving order.
  const refSeen = new Set<ReferenceId>();
  const refDeduped = references.filter((r) => (refSeen.has(r) ? false : (refSeen.add(r), true)));

  return {
    headline,
    summary,
    picks: deduped,
    careSteps: [...careSteps, ALWAYS_REFER_DISCLAIMER],
    refer,
    redFlags,
    references: refDeduped,
  };
}

function describeExudate(e: Exudate): string {
  switch (e) {
    case "none":
      return "dry";
    case "low":
      return "lightly moist";
    case "moderate":
      return "moderately wet";
    case "high":
      return "very wet";
  }
}
