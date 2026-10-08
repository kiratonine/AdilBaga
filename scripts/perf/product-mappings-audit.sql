-- pm-audit-v1: fixed field order, JSON escaping/null encoding, exact timestamp
-- microseconds (timestamp without time zone), and IEEE float8 network bytes.
WITH encoded AS (
  SELECT id,
    json_build_array(id, "rawProductId", "canonicalProductId",
      "matchMethod"::text, "reviewStatus"::text,
      to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.US'))::text AS non_float,
    encode(float8send("matchConfidence"), 'hex') AS float_bits
  FROM product_mappings
)
SELECT json_build_object(
  'version', 'pm-audit-v1',
  'count', count(*),
  'nonFloatFieldsFingerprint', md5(coalesce(string_agg(md5(non_float), E'\n' ORDER BY id COLLATE "C"), '')),
  'matchConfidenceBinaryFingerprint', md5(coalesce(string_agg(md5(float_bits), E'\n' ORDER BY id COLLATE "C"), '')),
  'fullCanonicalFingerprint', md5('pm-audit-v1|' || coalesce(string_agg(
    md5('pm-audit-v1|' || non_float || '|' || float_bits), E'\n' ORDER BY id COLLATE "C"), ''))
) FROM encoded;
