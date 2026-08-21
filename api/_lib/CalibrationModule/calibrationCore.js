// Calibration-module-specific shared helper.
import { klaarApi } from '../shared/klaarCore.js'
import { _extractArray } from '../ReviewsModule/reviewsCore.js'

// CONFIRMED live via network capture of Klaar's own Calibration list page: a plain
// {success, message, count, data: [...]} response, matching get_ratings_for_org's and
// get_reviews_for_org's shape — but using _extractArray() defensively anyway, since
// get_ratings_for_org already showed our stopgap token doesn't always get the same shape
// a real browser session does. Live-fetch every calibration currently in the workspace
// and match by name to recover the IDs createCalibrationJob created earlier — needed by
// ReviewsModule's createReportsJob.
export async function resolveCalibrationIds(names) {
  const r = await klaarApi('/review/get_all_calibrations', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  if (!r.ok) return names.map(() => null)
  const calibrations = _extractArray(r.data)
  return names.map(name => calibrations.find(c => c?.name === name)?.id || null)
}
