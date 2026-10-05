// Normalize free-form passport answers down to a country name.
// e.g. "I hold the Nigerian passport." -> "Nigeria"

interface CountryEntry {
  country: string;
  aliases: string[];
}

const COUNTRIES: CountryEntry[] = [
  { country: "Nigeria", aliases: ["nigerian"] },
  { country: "Ghana", aliases: ["ghanaian"] },
  { country: "Kenya", aliases: ["kenyan"] },
  { country: "South Africa", aliases: ["south african"] },
  { country: "Egypt", aliases: ["egyptian"] },
  { country: "Ethiopia", aliases: ["ethiopian"] },
  { country: "India", aliases: ["indian"] },
  { country: "Pakistan", aliases: ["pakistani"] },
  { country: "Bangladesh", aliases: ["bangladeshi"] },
  {
    country: "Philippines",
    aliases: ["filipino", "filipina", "philippine"],
  },
  { country: "China", aliases: ["chinese"] },
  {
    country: "United Arab Emirates",
    aliases: ["emirati", "uae", "dubai"],
  },
  {
    country: "United Kingdom",
    aliases: ["british", "briton", "uk", "english", "scottish", "welsh"],
  },
  { country: "United States", aliases: ["american", "usa", "us"] },
  { country: "Canada", aliases: ["canadian"] },
  { country: "Australia", aliases: ["australian"] },
  { country: "Germany", aliases: ["german"] },
  { country: "France", aliases: ["french"] },
  { country: "Netherlands", aliases: ["dutch"] },
  { country: "Italy", aliases: ["italian"] },
  { country: "Spain", aliases: ["spanish"] },
  { country: "Brazil", aliases: ["brazilian"] },
  { country: "Mexico", aliases: ["mexican"] },
  { country: "Turkey", aliases: ["turkish"] },
  { country: "Russia", aliases: ["russian"] },
  { country: "Ukraine", aliases: ["ukrainian"] },
  { country: "Saudi Arabia", aliases: ["saudi"] },
  { country: "Qatar", aliases: ["qatari"] },
  { country: "Japan", aliases: ["japanese"] },
  { country: "South Korea", aliases: ["south korean", "korean"] },
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extract the country from a free-form passport answer. Returns raw input if unknown. */
export function normalizePassport(raw: string): string {
  const value = raw.trim();
  if (!value) return value;

  const lower = value.toLowerCase();

  // Exact country-name match first (handles multi-word names).
  for (const entry of COUNTRIES) {
    if (lower.includes(entry.country.toLowerCase())) return entry.country;
  }

  // Then nationality/demonym aliases with word boundaries.
  for (const entry of COUNTRIES) {
    for (const alias of entry.aliases) {
      if (new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i").test(lower)) {
        return entry.country;
      }
    }
  }

  return value;
}
