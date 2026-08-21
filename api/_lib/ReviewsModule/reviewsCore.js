// Reviews-module-specific shared helpers.
import { klaarApi } from '../shared/klaarCore.js'

// Try every response-array shape this project has actually seen so far, across different
// endpoints: plain array, {data: [...]}, {data: {data: [...]}} (the extra envelope our
// stopgap token specifically gets on some endpoints — confirmed on Goals' all_objectives,
// and now apparently on get_ratings_for_org too, even though the browser's own real-session
// capture of get_reviews_for_org/get_all_calibrations showed no such wrapping), and the
// paginated {results: [...]} / {data: {results: [...]}} shapes seen elsewhere.
export function _extractArray(data) {
  const candidates = [
    Array.isArray(data) ? data : null,
    Array.isArray(data?.data) ? data.data : null,
    Array.isArray(data?.data?.data) ? data.data.data : null,
    Array.isArray(data?.results) ? data.results : null,
    Array.isArray(data?.data?.results) ? data.data.results : null,
  ]
  return candidates.find(Array.isArray) || []
}

// Ported from fetchRatingScales() in src/utils/fetchRatingScales.js — a CONFIRMED real
// list endpoint (the browser widget's own createReviews() calls this exact function as a
// fallback when it has no stored rating scales), unlike Goals' objective lookup which had
// no prior art at all. Live-fetch every rating scale currently in the workspace and match
// by name to recover the IDs createRatingScaleJob created earlier — no durable store.
export async function resolveRatingScaleIds(names) {
  const r = await klaarApi('/review/get_ratings_for_org', {
    method: 'POST',
    body: JSON.stringify({
      filters: [['status', '__in', ['In Use', 'Not In Use'], '']],
      limit: 50, offset: 1,
    }),
  })
  if (!r.ok) return names.map(() => null)
  const scales = _extractArray(r.data)
  return names.map(name => scales.find(s => s?.name === name)?.id || null)
}

// CONFIRMED live via network capture of Klaar's own Reviews list page: a plain
// {success, message, count, data: [...]} response — but using _extractArray() defensively
// anyway now that get_ratings_for_org showed our stopgap token doesn't always get the same
// shape a real browser session does. Live-fetch every review currently in the workspace
// and match by name to recover the IDs createReviewsJob created earlier — needed by
// createCalibrationJob.
export async function resolveReviewIds(names) {
  const r = await klaarApi('/review/get_reviews_for_org', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  if (!r.ok) return names.map(() => null)
  const reviews = _extractArray(r.data)
  return names.map(name => reviews.find(rv => rv?.name === name)?.id || null)
}
