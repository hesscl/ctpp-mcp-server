/**
 * Creates the geographies lookup table used by the resolve-geography-fips MCP tool.
 * Requires the pg_trgm extension for fuzzy name matching.
 */
export const up = async (pgm) => {
  // Enable trigram extension for fuzzy text search
  await pgm.db.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");

  pgm.createTable("geographies", {
    id: "id",
    geo_type: {
      type: "varchar(20)",
      notNull: true,
      comment: "One of: state, county, place",
    },
    name: {
      type: "text",
      notNull: true,
      comment: "Full display name, e.g. 'Los Angeles County, California'",
    },
    state_fips: {
      type: "varchar(2)",
      comment: "2-digit state FIPS code",
    },
    county_fips: {
      type: "varchar(3)",
      comment: "3-digit county FIPS code (within state)",
    },
    place_fips: {
      type: "varchar(5)",
      comment: "5-digit place FIPS code (within state)",
    },
  });

  pgm.createIndex("geographies", "geo_type");
  pgm.createIndex("geographies", ["state_fips", "county_fips"]);

  // GIN trigram index for fast fuzzy name matching
  pgm.createIndex("geographies", "name", {
    name: "geographies_name_trgm",
    method: "gin",
    opclass: "gin_trgm_ops",
  });

  // Set trigram similarity threshold (default 0.3)
  await pgm.db.query("ALTER DATABASE mcp_db SET pg_trgm.similarity_threshold = 0.2");
};

export const down = (pgm) => {
  pgm.dropTable("geographies");
};
