import { geographies, type GeoRecord } from "./data/geographies.js";

// Replicates PostgreSQL pg_trgm trigram similarity.
// Pads the lowercased string with two leading spaces and one trailing space,
// then extracts all 3-grams. Similarity = 2|A∩B| / (|A|+|B|).
function trigrams(s: string): string[] {
  const padded = `  ${s.toLowerCase()} `;
  const result: string[] = [];
  for (let i = 0; i <= padded.length - 3; i++) {
    result.push(padded.slice(i, i + 3));
  }
  return result;
}

function similarity(a: string, b: string): number {
  const ta = new Set(trigrams(a));
  const tb = new Set(trigrams(b));
  let intersection = 0;
  for (const t of ta) {
    if (tb.has(t)) intersection++;
  }
  if (ta.size + tb.size === 0) return 0;
  return (2 * intersection) / (ta.size + tb.size);
}

const SIMILARITY_THRESHOLD = 0.3; // same default as pg_trgm

export interface GeoMatch {
  name: string;
  type: "state" | "county";
  stateFips: string;
  countyFips?: string;
  forGeo: string;
  inGeo?: string;
  matchScore: string;
}

export function searchGeographies(
  name: string,
  type: "state" | "county" | undefined,
  limit: number,
): GeoMatch[] {
  const candidates = type
    ? geographies.filter((g: GeoRecord) => g.t === (type === "state" ? "s" : "c"))
    : geographies;

  return (candidates as GeoRecord[])
    .map((g: GeoRecord) => ({ g, score: similarity(name, g.n) }))
    .filter(({ score }) => score >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ g, score }) => {
      if (g.t === "s") {
        return {
          name: g.n,
          type: "state" as const,
          stateFips: g.sf,
          forGeo: `state:${g.sf}`,
          matchScore: score.toFixed(3),
        };
      } else {
        return {
          name: g.n,
          type: "county" as const,
          stateFips: g.sf,
          countyFips: g.cf,
          forGeo: `county:${g.cf}`,
          inGeo: `state:${g.sf}`,
          matchScore: score.toFixed(3),
        };
      }
    });
}
