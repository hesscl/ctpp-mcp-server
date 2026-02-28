/**
 * Generates mcp-server/src/data/geographies.ts from:
 *   - Hardcoded US state FIPS codes
 *   - County data from the Census TIGERweb REST API
 *
 * Usage (from repo root):
 *   npx tsx scripts/generate-geo-data.ts
 */

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../mcp-server/src/data/geographies.ts");

const STATES: [string, string][] = [
  ["Alabama", "01"],
  ["Alaska", "02"],
  ["Arizona", "04"],
  ["Arkansas", "05"],
  ["California", "06"],
  ["Colorado", "08"],
  ["Connecticut", "09"],
  ["Delaware", "10"],
  ["District of Columbia", "11"],
  ["Florida", "12"],
  ["Georgia", "13"],
  ["Hawaii", "15"],
  ["Idaho", "16"],
  ["Illinois", "17"],
  ["Indiana", "18"],
  ["Iowa", "19"],
  ["Kansas", "20"],
  ["Kentucky", "21"],
  ["Louisiana", "22"],
  ["Maine", "23"],
  ["Maryland", "24"],
  ["Massachusetts", "25"],
  ["Michigan", "26"],
  ["Minnesota", "27"],
  ["Mississippi", "28"],
  ["Missouri", "29"],
  ["Montana", "30"],
  ["Nebraska", "31"],
  ["Nevada", "32"],
  ["New Hampshire", "33"],
  ["New Jersey", "34"],
  ["New Mexico", "35"],
  ["New York", "36"],
  ["North Carolina", "37"],
  ["North Dakota", "38"],
  ["Ohio", "39"],
  ["Oklahoma", "40"],
  ["Oregon", "41"],
  ["Pennsylvania", "42"],
  ["Puerto Rico", "72"],
  ["Rhode Island", "44"],
  ["South Carolina", "45"],
  ["South Dakota", "46"],
  ["Tennessee", "47"],
  ["Texas", "48"],
  ["Utah", "49"],
  ["Vermont", "50"],
  ["Virginia", "51"],
  ["Washington", "53"],
  ["West Virginia", "54"],
  ["Wisconsin", "55"],
  ["Wyoming", "56"],
];

interface TigerCounty {
  GEOID: string;
  NAME: string;
  STATE: string;
  COUNTY: string;
}

async function fetchCounties(): Promise<TigerCounty[]> {
  console.log("Fetching counties from Census TIGERweb...");
  const url =
    "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/82/query" +
    "?where=1%3D1&outFields=GEOID%2CNAME%2CSTATE%2CCOUNTY&returnGeometry=false&f=json&resultRecordCount=4000";
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`TIGERweb error: ${resp.status}`);
  const json = (await resp.json()) as { features: Array<{ attributes: TigerCounty }> };
  return json.features.map((f) => f.attributes);
}

function q(s: string): string {
  return JSON.stringify(s);
}

async function main() {
  const stateMap = new Map(STATES.map(([name, fips]) => [fips, name]));
  const counties = await fetchCounties();
  console.log(`  ${counties.length} counties fetched.`);

  const lines: string[] = [
    "// Auto-generated — do not edit manually.",
    "// To refresh: npx tsx scripts/generate-geo-data.ts",
    "",
    "export type GeoRecord =",
    '  | { t: "s"; n: string; sf: string }',
    '  | { t: "c"; n: string; sf: string; cf: string };',
    "",
    "export const geographies: GeoRecord[] = [",
  ];

  const records: string[] = [];

  for (const [name, fips] of STATES) {
    records.push(`  {t:"s",n:${q(name)},sf:${q(fips)}}`);
  }

  for (const county of counties) {
    const stateName = stateMap.get(county.STATE) ?? "";
    const display = stateName ? `${county.NAME}, ${stateName}` : county.NAME;
    records.push(`  {t:"c",n:${q(display)},sf:${q(county.STATE)},cf:${q(county.COUNTY)}}`);
  }

  lines.push(records.join(",\n"));
  lines.push("];");
  lines.push("");

  const content = lines.join("\n");
  writeFileSync(OUT, content, "utf-8");
  console.log(`Written ${records.length} records to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
