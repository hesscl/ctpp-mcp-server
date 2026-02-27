import { z } from "zod";
import { BaseTool, CallToolResult } from "./BaseTool.js";
import { getClient } from "../db.js";

const schema = z.object({
  name: z
    .string()
    .max(200, "Name must be 200 characters or fewer")
    .describe(
      "Place name to search for, e.g. 'California', 'Los Angeles County', 'Seattle city'.",
    ),
  type: z
    .enum(["state", "county", "place"])
    .optional()
    .describe("Optional geography type to restrict search: state, county, or place."),
  limit: z
    .number()
    .int()
    .positive()
    .max(10)
    .optional()
    .default(5)
    .describe("Maximum number of matches to return (default 5, max 10)."),
});

interface GeoRow {
  geo_type: string;
  name: string;
  state_fips: string | null;
  county_fips: string | null;
  place_fips: string | null;
  score: string;
}

export class ResolveGeographyFips extends BaseTool<typeof schema> {
  readonly name = "resolve-geography-fips";
  readonly description =
    "Convert a place name to FIPS codes using fuzzy matching against a local geography database. " +
    "Returns pre-formatted 'forGeo' and 'inGeo' values ready to paste into fetch-ctpp-data. " +
    "Requires the mcp-db PostgreSQL database to be running and seeded.";
  readonly schema = schema;
  readonly requiresApiKey = false;

  async run(args: z.infer<typeof schema>, _apiKey: string): Promise<CallToolResult> {
    const client = await getClient();
    if (!client) {
      return this.err(
        "Geography database is unavailable. " +
          "Ensure DATABASE_URL is set and the database is running with migrations applied. " +
          "Run: docker compose up -d db && cd mcp-db && npm run migrate:up && npm run seed",
      );
    }

    try {
      let query: string;
      let queryParams: unknown[];

      if (args.type) {
        query = `
          SELECT geo_type, name, state_fips, county_fips, place_fips,
                 similarity(name, $1) AS score
          FROM geographies
          WHERE geo_type = $2
            AND name % $1
          ORDER BY score DESC
          LIMIT $3
        `;
        queryParams = [args.name, args.type, args.limit ?? 5];
      } else {
        query = `
          SELECT geo_type, name, state_fips, county_fips, place_fips,
                 similarity(name, $1) AS score
          FROM geographies
          WHERE name % $1
          ORDER BY score DESC
          LIMIT $2
        `;
        queryParams = [args.name, args.limit ?? 5];
      }

      const result = await client.query<GeoRow>(query, queryParams);

      if (result.rows.length === 0) {
        return this.ok(
          `No geography matches found for "${args.name}". ` +
            "Try a different spelling or check that the database has been seeded.",
        );
      }

      const matches = result.rows.map((row) => {
        let forGeo = "";
        let inGeo: string | undefined;

        switch (row.geo_type) {
          case "state":
            forGeo = `state:${row.state_fips}`;
            break;
          case "county":
            forGeo = `county:${row.county_fips}`;
            inGeo = `state:${row.state_fips}`;
            break;
          case "place":
            forGeo = `place:${row.place_fips}`;
            inGeo = `state:${row.state_fips}`;
            break;
        }

        return {
          name: row.name,
          type: row.geo_type,
          state_fips: row.state_fips,
          county_fips: row.county_fips ?? undefined,
          place_fips: row.place_fips ?? undefined,
          forGeo,
          inGeo,
          match_score: Number(row.score).toFixed(3),
        };
      });

      return this.ok(JSON.stringify(matches, null, 2));
    } finally {
      client.release();
    }
  }
}
