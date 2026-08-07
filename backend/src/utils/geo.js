// Great-circle distance (haversine) computed in SQL against a shop's
// stored coordinates. Returns NULL when either side is missing lat/lng,
// which callers should sort as NULLS LAST so "unknown distance" never
// outranks a real nearby match.
//
// latParam/lngParam are 1-based positional parameter indices ($1, $2, ...)
// for the buyer's coordinates, pointing at values already pushed onto the
// query's values array by the caller.
export function distanceKmExpr(latParamIndex, lngParamIndex, shopAlias = 's') {
  return `(
    6371 * acos(
      LEAST(1, GREATEST(-1,
        cos(radians($${latParamIndex})) * cos(radians(${shopAlias}.location_lat)) *
        cos(radians(${shopAlias}.location_lng) - radians($${lngParamIndex})) +
        sin(radians($${latParamIndex})) * sin(radians(${shopAlias}.location_lat))
      ))
    )
  )`;
}

// Basic sanity check for lat/lng query params — guards against NaN,
// missing values, or out-of-range coordinates reaching raw SQL.
export function parseCoords(lat, lng) {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;
  if (Math.abs(latNum) > 90 || Math.abs(lngNum) > 180) return null;
  return { lat: latNum, lng: lngNum };
}
