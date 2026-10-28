-- Read-only verification for migration 20261026_003_public_player_details.sql.
-- Run this AFTER the migration in Supabase SQL Editor. No rows or schema are changed.
WITH required(column_name) AS (
  VALUES ('gender'), ('address'), ('district_tehsil')
), found AS (
  SELECT r.column_name,
         c.ordinal_position IS NOT NULL AS present,
         c.ordinal_position
  FROM required r
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = 'public_participants'
   AND c.column_name = r.column_name
)
SELECT CASE WHEN bool_and(present) THEN 'PASS' ELSE 'FAIL' END AS migration_003_status,
       array_agg(column_name ORDER BY column_name) FILTER (WHERE present) AS columns_found,
       array_agg(column_name ORDER BY column_name) FILTER (WHERE NOT present) AS columns_missing
FROM found;
