/**
 * Clinical reference registry.
 *
 * Every clinical figure surfaced in EMIS+ must cite an entry here. This keeps the
 * app's guidance traceable to a published, guideline-grade source and lets the UI
 * render a "References" list next to any recommendation.
 *
 * Audience: patients & caregivers. Nothing here is a substitute for individualised
 * advice from the user's own clinician or dietitian.
 */

export interface Reference {
  /** Stable id used to link a recommendation to its source. */
  id: string;
  /** Short label shown inline, e.g. "NPIAP/EPUAP/PPPIA 2019". */
  label: string;
  /** Full citation text. */
  citation: string;
  /** Publisher / issuing body. */
  publisher: string;
  /** Publication year. */
  year: number;
  /** Canonical URL. */
  url: string;
}

export const REFERENCES = {
  npiap2019: {
    id: "npiap2019",
    label: "EPUAP/NPIAP/PPPIA 2019",
    citation:
      "European Pressure Ulcer Advisory Panel, National Pressure Injury Advisory Panel and Pan Pacific Pressure Injury Alliance. Prevention and Treatment of Pressure Ulcers/Injuries: Clinical Practice Guideline. 3rd ed. 2019.",
    publisher: "EPUAP / NPIAP / PPPIA",
    year: 2019,
    url: "https://www.internationalguideline.com/2019",
  },
  munoz2020: {
    id: "munoz2020",
    label: "Munoz et al. 2020",
    citation:
      "Munoz N, Posthauer ME, Cereda E, Schols JMGA, Haesler E. The Role of Nutrition for Pressure Injury Prevention and Healing: The 2019 International Clinical Practice Guideline Recommendations. Adv Skin Wound Care. 2020;33(3):123-136.",
    publisher: "Advances in Skin & Wound Care (PubMed 32810059)",
    year: 2020,
    url: "https://pubmed.ncbi.nlm.nih.gov/32810059/",
  },
  arginineReview2016: {
    id: "arginineReview2016",
    label: "Arginine ONS review 2016",
    citation:
      "Liu P, et al. Arginine-enriched oral nutritional supplementation in the treatment of pressure ulcers: a literature review. J Tissue Viability / Clinical Nutrition ESPEN. 2016.",
    publisher: "ScienceDirect",
    year: 2016,
    url: "https://www.sciencedirect.com/science/article/pii/S2213909516300404",
  },
  arginineDose2025: {
    id: "arginineDose2025",
    label: "L-arginine dosing 2025",
    citation:
      "Optimal l-arginine dosage for pressure injury healing in home care settings: a six-month retrospective analysis. Front Public Health. 2025.",
    publisher: "Frontiers in Public Health (PMC12434103)",
    year: 2025,
    url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12434103/",
  },
  zincUL: {
    id: "zincUL",
    label: "NIH ODS — Zinc",
    citation:
      "National Institutes of Health, Office of Dietary Supplements. Zinc — Health Professional Fact Sheet. Tolerable Upper Intake Level for adults: 40 mg/day.",
    publisher: "NIH Office of Dietary Supplements",
    year: 2022,
    url: "https://ods.od.nih.gov/factsheets/Zinc-HealthProfessional/",
  },
  hosProtocol2015: {
    id: "hosProtocol2015",
    label: "Arenas Villafranca et al. 2015",
    citation:
      "Arenas Villafranca JJ, et al. Protocol for the detection and nutritional management of high-output stomas. Nutr J. 2015;14:45.",
    publisher: "Nutrition Journal (PMC4461994)",
    year: 2015,
    url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4461994/",
  },
  hosReview2025: {
    id: "hosReview2025",
    label: "High-output stoma review 2025",
    citation:
      "High-output stoma management: an overview. British Journal of Surgery (BJS). 2025;112(9):znaf196.",
    publisher: "British Journal of Surgery",
    year: 2025,
    url: "https://academic.oup.com/bjs/article/112/9/znaf196/8251504",
  },
  stMarksSPS: {
    id: "stMarksSPS",
    label: "NHS SPS — St Mark's solution",
    citation:
      "NHS Specialist Pharmacy Service. Using St Mark's electrolyte solution. (Glucose 20 g, sodium chloride 3.5 g, sodium bicarbonate 2.5 g per 1 litre of water.)",
    publisher: "NHS Specialist Pharmacy Service",
    year: 2023,
    url: "https://www.sps.nhs.uk/articles/using-st-marks-electrolyte-solution/",
  },
  ucDavisHydration: {
    id: "ucDavisHydration",
    label: "UC Davis ileostomy hydration",
    citation:
      "UC Davis Health, Department of Surgery. Monitoring Hydration with an Ileostomy (patient education).",
    publisher: "UC Davis Health",
    year: 2021,
    url: "https://health.ucdavis.edu/surgery/documents/ileostomy-hydration.pdf",
  },
  wocnPSAG: {
    id: "wocnPSAG",
    label: "WOCN Peristomal Skin Assessment Guide",
    citation:
      "Wound, Ostomy and Continence Nurses Society (WOCN). Peristomal Skin Assessment Guide for Consumers — guidance for identifying common peristomal skin problems and next steps.",
    publisher: "WOCN Society",
    year: 2019,
    url: "https://psag.wocn.org/index",
  },
  ostomySkinTool: {
    id: "ostomySkinTool",
    label: "Ostomy Skin Tool 2.0",
    citation:
      "Psychometric validation of the Ostomy Skin Tool 2.0 — the Discoloration, Erosion and Tissue overgrowth (DET) score used to assess peristomal skin.",
    publisher: "PMC10734405",
    year: 2023,
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10734405/",
  },
  iwii2022: {
    id: "iwii2022",
    label: "IWII 2022 consensus",
    citation:
      "International Wound Infection Institute (IWII). Wound Infection in Clinical Practice: International Consensus Update 2022. Wounds International.",
    publisher: "Wounds International",
    year: 2022,
    url: "https://woundsinternational.com/wp-content/uploads/2023/05/IWII-CD-2022-web.pdf",
  },
  moistHealing2021: {
    id: "moistHealing2021",
    label: "Nuutila & Eriksson 2021",
    citation:
      "Nuutila K, Eriksson E. Moist Wound Healing with Commonly Available Dressings. Advances in Wound Care. 2021;10(12):685-698. Reviews how films, foams, hydrocolloids, hydrogels and alginates create and maintain the moist environment that speeds healing.",
    publisher: "Advances in Wound Care (Mary Ann Liebert)",
    year: 2021,
    url: "https://www.liebertpub.com/doi/10.1089/wound.2020.1232",
  },
  wuwhsExudate: {
    id: "wuwhsExudate",
    label: "WUWHS exudate consensus",
    citation:
      "World Union of Wound Healing Societies (WUWHS). Wound exudate: effective assessment and management. Consensus document. Wounds International. Basis for matching dressing absorbency to exudate level (moisture balance).",
    publisher: "Wounds International / WUWHS",
    year: 2019,
    url: "https://woundsinternational.com/world-union-resources/wuwhs-consensus-document-wound-exudate-effective-assessment-and-management/",
  },
  woundBalance2024: {
    id: "woundBalance2024",
    label: "Wound Balance / TIMERS 2024",
    citation:
      "Wounds International. Implementing Wound Balance: outcomes and future recommendations. Consensus document. 2024. Frames holistic wound-bed preparation (TIMERS) and exudate-matched dressing selection.",
    publisher: "Wounds International",
    year: 2024,
    url: "https://woundsinternational.com/consensus-documents/implementing-wound-balance-outcomes-and-future-recommendations/",
  },
  niceDressings2016: {
    id: "niceDressings2016",
    label: "NICE ESMPB2",
    citation:
      "National Institute for Health and Care Excellence (NICE). Chronic wounds: advanced wound dressings and antimicrobial dressings. Evidence summary ESMPB2. Advanced/antimicrobial dressings are not proven superior to simple dressings; reserve silver and other antimicrobials for wounds with clinical signs of infection.",
    publisher: "NICE",
    year: 2016,
    url: "https://www.nice.org.uk/advice/esmpb2",
  },
  istapSkinTears2025: {
    id: "istapSkinTears2025",
    label: "ISTAP skin tears 2025",
    citation:
      "International Skin Tear Advisory Panel (ISTAP). The prevention and management of skin tears in aged skin. Wounds International Made Easy, 2025. Recommends atraumatic, non-adherent (e.g. soft-silicone) contact layers and preserving the skin flap.",
    publisher: "Wounds International / ISTAP",
    year: 2025,
    url: "https://woundsinternational.com/made-easy/the-prevention-and-management-of-skin-tears-in-aged-skin/",
  },
  iwgdf2023: {
    id: "iwgdf2023",
    label: "IWGDF 2023 guidelines",
    citation:
      "Schaper NC, van Netten JJ, Apelqvist J, et al. Practical guidelines on the prevention and management of diabetes-related foot disease (IWGDF 2023 update). Diabetes Metab Res Rev. 2024;40(3):e3657. Foot infection in diabetes is an immediate threat to the limb and needs prompt specialist assessment.",
    publisher: "IWGDF / Diabetes Metab Res Rev",
    year: 2024,
    url: "https://onlinelibrary.wiley.com/doi/10.1002/dmrr.3657",
  },
  anzcorBurns: {
    id: "anzcorBurns",
    label: "ANZCOR burns first aid",
    citation:
      "Australian and New Zealand Committee on Resuscitation (ANZCOR). Guideline 9.1.3 – First Aid for Burns. Cool the burn with cool running water for 20 minutes (not ice); cover with a clean, non-adherent dressing; seek medical care for larger, deeper or high-risk-site burns.",
    publisher: "ANZCOR",
    year: 2021,
    url: "https://www.anzcor.org/home/first-aid-management-of-injuries/guideline-9-1-3-first-aid-for-burns/",
  },
} as const satisfies Record<string, Reference>;

export type ReferenceId = keyof typeof REFERENCES;

export function getReferences(ids: readonly ReferenceId[]): Reference[] {
  return ids.map((id) => REFERENCES[id]);
}
