/**
 * Seed script: populates the geographies table with US states and counties.
 *
 * Sources:
 *   States:  hardcoded (stable FIPS codes)
 *   Counties: Census TIGERweb REST API (https://tigerweb.geo.census.gov)
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx tsx seed/seed.ts
 */

import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });

// All 50 states + DC + PR with FIPS codes
const STATES = [
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
] as const;

interface TigerCounty {
  GEOID: string; // state_fips + county_fips (5 digits)
  NAME: string;
  STATE: string; // state_fips (2 digits)
  COUNTY: string; // county_fips (3 digits)
}

async function fetchCounties(): Promise<TigerCounty[]> {
  console.log("Fetching counties from Census TIGERweb...");
  const url =
    "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/82/query" +
    "?where=1%3D1&outFields=GEOID%2CNAME%2CSTATE%2CCOUNTY&returnGeometry=false&f=json&resultRecordCount=4000";

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`TIGERweb error: ${resp.status}`);

  const json = (await resp.json()) as {
    features: Array<{ attributes: TigerCounty }>;
  };
  return json.features.map((f) => f.attributes);
}

async function seed() {
  await client.connect();
  console.log("Connected to database.");

  // Clear existing data
  await client.query("TRUNCATE geographies RESTART IDENTITY");

  // Insert states
  console.log("Inserting states...");
  for (const [name, fips] of STATES) {
    await client.query(
      "INSERT INTO geographies (geo_type, name, state_fips) VALUES ($1, $2, $3)",
      ["state", name, fips],
    );
  }
  console.log(`  ${STATES.length} states inserted.`);

  // Insert counties from TIGERweb
  let counties: TigerCounty[] = [];
  try {
    counties = await fetchCounties();
  } catch (err) {
    console.warn(`  Warning: could not fetch counties from TIGERweb: ${err}`);
    console.warn("  Skipping county data. Re-run after network is available.");
  }

  if (counties.length > 0) {
    console.log(`Inserting ${counties.length} counties...`);
    for (const county of counties) {
      // Find state name for full display name
      const stateName = STATES.find(([, fips]) => fips === county.STATE)?.[0] ?? "";
      const displayName = stateName
        ? `${county.NAME}, ${stateName}`
        : county.NAME;

      await client.query(
        "INSERT INTO geographies (geo_type, name, state_fips, county_fips) VALUES ($1, $2, $3, $4)",
        ["county", displayName, county.STATE, county.COUNTY],
      );
    }
    console.log(`  ${counties.length} counties inserted.`);
  }

  console.log("Seed complete.");
  await client.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
