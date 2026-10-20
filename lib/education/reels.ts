// EMIS+ reels: the wound care explainer series on YouTube (@emis_asia),
// 13 shorts published 1 Sep to 19 Oct 2026. IDs, titles, dates and lengths
// were read from YouTube on 21 Oct 2026; all are public and embeddable.
// Each reel can point to an in-app tool and to the recommendation tags in
// lib/clinical/recommendations.ts.

export const REELS_CHANNEL_URL = 'https://www.youtube.com/@emis_asia/shorts';

export interface Reel {
  id: string;          // YouTube video id
  episode: number;     // order in the series, 1 = first published
  title: string;       // as published on YouTube
  topic: string;       // short label for cards
  published: string;   // YYYY-MM-DD
  seconds: number;
  productTags?: string[];
  relatedTool?: { route: string; label: string };
}

const ADVISOR = { route: '/tools/wound-advisor', label: 'Wound Product Advisor' };

export const WOUND_CARE_SERIES: Reel[] = [
  { id: 'zDMBflLAJ-s', episode: 1, title: 'Why a scab slows wound healing down', topic: 'Moist healing', published: '2026-09-01', seconds: 73, relatedTool: ADVISOR },
  { id: 'P_0JhrqZYLI', episode: 2, title: 'Medical honey heals, but not every wound', topic: 'Medical honey', published: '2026-09-07', seconds: 74, productTags: ['wound-antimicrobial'], relatedTool: ADVISOR },
  { id: 'E1J_VLJEJ-s', episode: 3, title: 'Silver dressings: the two week rule', topic: 'Silver dressings', published: '2026-09-14', seconds: 70, productTags: ['wound-antimicrobial'], relatedTool: ADVISOR },
  { id: 'RU-JtaDlpGw', episode: 4, title: 'Iodine Gauze: Why Dilution Beats Full Strength', topic: 'Iodine gauze', published: '2026-09-16', seconds: 84, productTags: ['wound-antimicrobial'], relatedTool: ADVISOR },
  { id: 'Jr6YTyc2Zto', episode: 5, title: 'The gel is not pus: hydrocolloid dressings explained', topic: 'Hydrocolloid', published: '2026-09-18', seconds: 111, productTags: ['wound-hydrocolloid-hydrogel'], relatedTool: ADVISOR },
  { id: '7J8bdhRk0Co', episode: 6, title: 'A wound vacuum does not suck the wound closed', topic: 'Wound vacuum (NPWT)', published: '2026-09-21', seconds: 72, productTags: ['wound-npwt'] },
  { id: '1sw5_SFhsak', episode: 7, title: 'This dressing is mostly water (hydrogel dressing explained)', topic: 'Hydrogel', published: '2026-09-25', seconds: 89, productTags: ['wound-hydrocolloid-hydrogel'], relatedTool: ADVISOR },
  { id: 'qZg9U4jUuZo', episode: 8, title: 'Iodine that heals (cadexomer iodine explained)', topic: 'Cadexomer iodine', published: '2026-09-28', seconds: 88, productTags: ['wound-antimicrobial'], relatedTool: ADVISOR },
  { id: 'q991n_laJI0', episode: 9, title: 'This dressing starts in the ocean (alginate dressing explained)', topic: 'Alginate', published: '2026-10-02', seconds: 77, productTags: ['wound-alginate'], relatedTool: ADVISOR },
  { id: 'e1kCtCPKYO4', episode: 10, title: 'This dressing is a cushion for your wound (foam dressing explained)', topic: 'Foam dressings', published: '2026-10-06', seconds: 88, productTags: ['wound-foam'], relatedTool: ADVISOR },
  { id: 'HuzO0jn8QHw', episode: 11, title: 'Five ways to remove dead tissue (wound debridement explained)', topic: 'Debridement', published: '2026-10-11', seconds: 86 },
  { id: '7AS2hjGuHc0', episode: 12, title: 'Compression Therapy for Venous Leg Ulcers: Who Can Use It, Who Cannot', topic: 'Compression', published: '2026-10-16', seconds: 78, relatedTool: { route: '/tools/compression', label: 'Compression sizing' } },
  { id: 'S0Dgmo9wwcg', episode: 13, title: 'Wound Biofilm: The Invisible Barrier That Stops Healing', topic: 'Biofilm', published: '2026-10-19', seconds: 88 },
];

/** Newest first, for the Learn tab row. */
export function latestReels(): Reel[] {
  return [...WOUND_CARE_SERIES].sort((a, b) => b.published.localeCompare(a.published));
}

export function getReel(id: string): Reel | undefined {
  return WOUND_CARE_SERIES.find(r => r.id === id);
}

export function reelThumb(id: string): string {
  // hq720 is the vertical frame centred on a 16:9 canvas; crop to fill a 9:16 card.
  return `https://i.ytimg.com/vi/${id}/hq720.jpg`;
}

export function reelWatchUrl(id: string): string {
  return `https://www.youtube.com/shorts/${id}`;
}

export function reelEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0&modestbranding=1`;
}

export function formatLength(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
