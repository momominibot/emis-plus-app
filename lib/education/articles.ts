/**
 * Patient education content for EMIS+.
 *
 * Each article is written for patients & caregivers, in plain language, and every
 * clinical claim is backed by an entry in the clinical reference registry. Articles
 * deliberately point users back to their own care team and, where relevant, to the
 * in-app tools and emis.asia products.
 *
 * This is educational information, not medical advice.
 */

import type { ReferenceId } from "../clinical/references";

export type ArticleCategory = "Wound healing" | "Ostomy care" | "Nutrition & hydration";

export interface Callout {
  type: "tip" | "warning" | "redflag";
  text: string;
}

export interface ArticleSection {
  heading: string;
  /** One or more paragraphs. */
  paragraphs?: string[];
  bullets?: string[];
  callout?: Callout;
}

export interface Article {
  slug: string;
  title: string;
  category: ArticleCategory;
  /** One-line summary for cards and meta description. */
  summary: string;
  readingTimeMin: number;
  intro: string;
  sections: ArticleSection[];
  keyTakeaways: string[];
  references: ReferenceId[];
  /** Tags handed to the product recommendation component. */
  relatedProductTags?: string[];
  /** A relevant in-app tool. */
  relatedTool?: { href: string; label: string };
}

export const ARTICLES: Article[] = [
  {
    slug: "eating-to-heal-wounds",
    title: "Eating to heal a wound",
    category: "Wound healing",
    summary:
      "Why wounds need extra protein and energy, and the foods and nutrients that support healing.",
    readingTimeMin: 4,
    intro:
      "Healing a wound is hard work for your body. It needs more building blocks — especially protein and energy — than usual. Eating well can genuinely help wounds close faster, while poor nutrition slows healing down.",
    sections: [
      {
        heading: "Protein is the priority",
        paragraphs: [
          "Protein provides the raw material your body uses to rebuild skin and tissue. International wound-care guidelines recommend more protein than usual while a wound is healing — around 1.25 to 1.5 grams of protein for every kilogram you weigh each day, for people who have a wound and are malnourished or at risk of it.",
          "Good sources include eggs, fish, chicken, lean meat, dairy, beans, lentils, tofu and nuts. Spreading protein across all your meals helps your body use it well.",
        ],
        callout: {
          type: "tip",
          text: "Our wound-nutrition calculator turns your weight into a personal daily target to discuss with your dietitian.",
        },
      },
      {
        heading: "Energy keeps protein doing its job",
        paragraphs: [
          "If you don't eat enough total calories, your body burns protein for energy instead of using it to heal. Guidelines suggest roughly 30 to 35 calories per kilogram of body weight per day during healing. Don't skip meals, and choose nourishing foods rather than 'empty' calories.",
        ],
      },
      {
        heading: "Helpful vitamins and minerals",
        bullets: [
          "Vitamin C helps build collagen (the scaffold of new tissue) — found in citrus, berries, peppers and tomatoes.",
          "Zinc supports tissue repair and immune function — found in meat, shellfish, seeds and wholegrains.",
          "Arginine, zinc and antioxidant-enriched supplement drinks improved healing of pressure injuries in studies when diet alone wasn't enough.",
        ],
        callout: {
          type: "warning",
          text: "More isn't better with supplements. Long-term high-dose zinc (over 40 mg/day) can cause other deficiencies. Use supplements under the guidance of your clinician or dietitian.",
        },
      },
      {
        heading: "Don't forget fluids",
        paragraphs: [
          "Staying hydrated helps deliver nutrients and oxygen to the wound. Unless your clinician has limited your fluids, aim to drink regularly through the day.",
        ],
      },
    ],
    keyTakeaways: [
      "Eat more protein than usual while healing — spread across meals.",
      "Enough total calories let that protein go toward repair, not fuel.",
      "Vitamin C and zinc support healing; supplements should be guided, not guessed.",
      "Your individual targets should be confirmed by a dietitian.",
    ],
    references: ["npiap2019", "munoz2020", "arginineReview2016", "zincUL"],
    relatedProductTags: ["wound-supplements"],
    relatedTool: { href: "/calculators/wound-nutrition", label: "Wound nutrition calculator" },
  },
  {
    slug: "recognising-wound-infection",
    title: "Spotting a wound infection: when to get help",
    category: "Wound healing",
    summary:
      "The warning signs of wound infection and when to contact your nurse or seek urgent care.",
    readingTimeMin: 3,
    intro:
      "Most wounds heal without trouble, but sometimes bacteria take hold. Catching an infection early protects the wound and helps you avoid more serious problems. Here's what to watch for.",
    sections: [
      {
        heading: "Classic signs of infection",
        bullets: [
          "Increasing redness spreading around the wound",
          "Warmth and swelling at the wound edges",
          "More pain than before, or new pain",
          "Pus or cloudy discharge",
          "A new or worsening bad smell",
        ],
      },
      {
        heading: "Subtler signs to know",
        paragraphs: [
          "Especially if you have diabetes, a weakened immune system or a long-standing wound, infection can be quiet. Be alert to a wound that stops improving, bleeds easily, develops fragile or discoloured tissue, or simply 'doesn't look right' to you.",
        ],
      },
      {
        heading: "When to act",
        callout: {
          type: "redflag",
          text: "Contact your nurse or doctor promptly if you notice these signs. Seek urgent care if you also feel feverish or unwell, the redness is spreading quickly, or you feel very sick — these can signal a more serious infection.",
        },
      },
    ],
    keyTakeaways: [
      "Spreading redness, warmth, swelling, increasing pain, pus or odour suggest infection.",
      "Subtle signs matter if you're immunocompromised or have a chronic wound.",
      "Early review by your care team prevents bigger problems; fever or fast-spreading redness needs urgent care.",
    ],
    references: ["iwii2022"],
  },
  {
    slug: "understanding-stoma-output",
    title: "Understanding your stoma output: what's normal?",
    category: "Ostomy care",
    summary:
      "Typical output amounts and consistency for an ileostomy and colostomy, and what 'high output' means.",
    readingTimeMin: 4,
    intro:
      "Knowing what's typical for your stoma makes it much easier to spot when something changes. Output varies from person to person, but there are useful general ranges.",
    sections: [
      {
        heading: "Typical amounts",
        paragraphs: [
          "For an established ileostomy, output is often around 500 to 1,200 mL a day and looks like porridge or paste. A colostomy usually produces more formed stool and less volume. Output is usually higher in the first weeks after surgery and settles over time.",
        ],
      },
      {
        heading: "What counts as 'high output'",
        paragraphs: [
          "Output of more than about 1,500 to 2,000 mL a day is called a high-output stoma. It matters because it can lead to losing too much water and salt, and can leave you dehydrated.",
        ],
        callout: {
          type: "tip",
          text: "The ostomy diary lets you log each emptying and see your daily total, with an automatic 'normal / high' read-out.",
        },
      },
      {
        heading: "Low or no output",
        callout: {
          type: "redflag",
          text: "If your stoma suddenly produces little or nothing and you have cramping, bloating, nausea or vomiting, this can signal a blockage — contact your stoma team urgently.",
        },
      },
    ],
    keyTakeaways: [
      "Established ileostomy output is roughly 500–1,200 mL/day; colostomies are more formed.",
      "Over ~1,500–2,000 mL/day is 'high output' and risks dehydration.",
      "A sudden stop in output with cramps or vomiting needs urgent review.",
    ],
    references: ["hosProtocol2015", "ucDavisHydration"],
    relatedTool: { href: "/ostomy-diary", label: "Ostomy output & hydration diary" },
  },
  {
    slug: "preventing-dehydration-ileostomy",
    title: "Preventing dehydration with an ileostomy",
    category: "Nutrition & hydration",
    summary:
      "Why ileostomies raise dehydration risk, the warning signs, and how electrolyte drinks help.",
    readingTimeMin: 4,
    intro:
      "With an ileostomy, your body loses more water and salt than it used to, because the large bowel — which normally reabsorbs water — is bypassed. A little planning keeps you well hydrated.",
    sections: [
      {
        heading: "Why plain water isn't always enough",
        paragraphs: [
          "Drinking large amounts of plain water can actually wash out more salt and sometimes increase output. Drinks that contain the right balance of salt and sugar are absorbed better — this is the idea behind oral rehydration (electrolyte) solutions.",
        ],
      },
      {
        heading: "Signs you may be getting dehydrated",
        bullets: [
          "Feeling very thirsty or having a dry mouth",
          "Dark, strong-smelling urine, or passing less than usual",
          "Feeling dizzy or lightheaded, especially when standing",
          "Tiredness, headache or muscle cramps",
        ],
      },
      {
        heading: "A common electrolyte recipe (St Mark's solution)",
        paragraphs: [
          "Many stoma teams suggest the St Mark's electrolyte solution: 20 g glucose, 3.5 g table salt and 2.5 g sodium bicarbonate dissolved in 1 litre of water, made fresh each day and sipped through the day. Always check with your stoma nurse or pharmacist about the right amount for you.",
        ],
        callout: {
          type: "tip",
          text: "The ostomy diary includes the full recipe and a hydration self-check based on your symptoms.",
        },
      },
    ],
    keyTakeaways: [
      "Ileostomies lose extra water and salt — hydration needs active attention.",
      "Electrolyte drinks beat large amounts of plain water.",
      "Dark/reduced urine, dizziness and cramps are warning signs — act early.",
    ],
    references: ["ucDavisHydration", "stMarksSPS", "hosProtocol2015"],
    relatedProductTags: ["oral-rehydration"],
    relatedTool: { href: "/ostomy-diary", label: "Hydration check in the diary" },
  },
  {
    slug: "living-with-high-output-stoma",
    title: "Living with a high-output stoma",
    category: "Ostomy care",
    summary:
      "Practical food, fluid and monitoring steps when your stoma output is high.",
    readingTimeMin: 4,
    intro:
      "A high-output stoma (more than about 1,500–2,000 mL a day) is manageable, but needs a bit of strategy around food, fluids and monitoring to avoid dehydration and salt loss.",
    sections: [
      {
        heading: "Foods that can thicken output",
        bullets: [
          "Bananas, white rice, pasta and white bread",
          "Applesauce, smooth peanut butter, cheese and potatoes (no skin)",
          "Marshmallows (a classic stoma-nurse tip)",
        ],
      },
      {
        heading: "Be cautious with",
        bullets: [
          "High-fibre foods and fruit/vegetable skins (can increase output or cause blockages)",
          "Very spicy foods, alcohol and caffeine",
          "Large volumes of sugary drinks or plain water on their own",
        ],
      },
      {
        heading: "Monitor and stay in touch",
        paragraphs: [
          "Keep an eye on your daily output and your hydration. If output stays high for several days, contact your stoma care team — they may adjust your diet, fluids or medicines.",
        ],
        callout: {
          type: "warning",
          text: "Persistent high output can deplete water, salt and magnesium. Don't try to manage it alone — your team can help and may recommend specific treatments.",
        },
      },
    ],
    keyTakeaways: [
      "Certain everyday foods can help thicken output.",
      "Limit high-fibre, spicy, alcoholic, caffeinated and very sugary items.",
      "Track output and loop in your stoma team when it stays high.",
    ],
    references: ["hosProtocol2015", "hosReview2025", "stMarksSPS"],
    relatedProductTags: ["oral-rehydration", "ostomy-supplies"],
    relatedTool: { href: "/ostomy-diary", label: "Track output in the diary" },
  },
  {
    slug: "caring-for-peristomal-skin",
    title: "Caring for the skin around your stoma",
    category: "Ostomy care",
    summary:
      "How to keep peristomal skin healthy, spot early problems, and prevent leaks.",
    readingTimeMin: 4,
    intro:
      "The skin around your stoma (peristomal skin) should look much like the skin elsewhere on your body. Healthy skin means a better seal, fewer leaks and more comfort. Small habits prevent most problems.",
    sections: [
      {
        heading: "Everyday skin care",
        bullets: [
          "Clean the skin gently with warm water and dry it fully before applying a new pouch.",
          "Make sure the opening in your barrier fits your stoma snugly — gaps let output sit on the skin.",
          "Avoid oily soaps, lotions or wipes that can stop the pouch sticking.",
        ],
      },
      {
        heading: "Leaks and skin damage go together",
        paragraphs: [
          "Leakage is one of the biggest causes of sore peristomal skin. If you're getting repeated leaks, it's a signal to review your pouch fit and routine — and often to change the pouch a little more often — rather than to put up with it.",
        ],
      },
      {
        heading: "Watch for these changes",
        bullets: [
          "Redness, soreness or a rash around the stoma",
          "Skin that is broken, weepy or bleeding",
          "Raised or overgrown areas of skin or tissue",
          "Itching or burning under the barrier",
        ],
        callout: {
          type: "warning",
          text: "Clinicians use a simple 'DET' check (Discolouration, Erosion, Tissue overgrowth) to grade peristomal skin. If your skin is red, broken or changing, contact your stoma nurse — early help prevents bigger problems.",
        },
      },
    ],
    keyTakeaways: [
      "Healthy peristomal skin looks like your skin elsewhere.",
      "A snug barrier fit and gentle, oil-free cleaning prevent most damage.",
      "Repeated leaks mean it's time to review your routine, not tolerate it.",
      "Red, broken or changing skin warrants a stoma-nurse review.",
    ],
    references: ["wocnPSAG", "ostomySkinTool"],
    relatedProductTags: ["barrier-accessories", "peristomal-skin-care"],
    relatedTool: { href: "/peristomal-skin", label: "Peristomal skin checker" },
  },
];

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}

export function allArticleSlugs(): string[] {
  return ARTICLES.map((a) => a.slug);
}
