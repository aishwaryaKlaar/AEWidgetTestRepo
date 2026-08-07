import { api } from '../../core/api.js'
import { state, saveState } from '../../core/state.js'
import { _uuid } from '../../core/helpers.js'

const CALIBRATION_NAMES = [
  'Talent Consensus & Equity Forum',
  'Strategic Performance Distribution Review',
  'Leadership Merit & Benchmarking Council',
  'Enterprise Rating Alignment Session',
  'Cross-Functional Performance Audit',
  'Organizational Talent Parity Review',
  'Executive Capability & Calibration Board',
];

async function _createOneCalibration({ name, reviewId, ratingScaleId }) {
  // Step 1: Create
  const r1 = await api('/review/create_calibration', {
    method: 'POST',
    body: JSON.stringify({ name, review_ids: [reviewId] }),
  })
  if (!r1.ok) return { ok: false, message: `Create "${name}" failed: ${r1.status}` }
  const caliId = r1.data?.id || r1.data?.data?.id
  if (!caliId) return { ok: false, message: `No calibration id returned for "${name}"` }

  // Step 2: Standard Parameters — use parameters from create response if available
  let params = r1.data?.calibration_parameters || r1.data?.data?.calibration_parameters || []
  if (params.length && ratingScaleId) {
    params = params.map(p =>
      p.parameter_type === 'rating' ? { ...p, rating_scale: ratingScaleId } : p
    )
  } else if (ratingScaleId) {
    params = [{
      id: _uuid(),
      parameter_name: 'Final Rating (Calibration)',
      parameter_type: 'rating',
      is_disabled: false,
      for_graph_rating: true,
      rating_scale: ratingScaleId,
      prefill: false,
      prefill_linkage: { config: false, data: [] },
      default_value_config: 'NO',
      default_value_set: false,
      default_rating_value: {},
      parameter_description: '',
    }]
  }
  if (params.length) {
    const r2 = await api(`/review/update_calibration?cali_id=${caliId}`, {
      method: 'PATCH',
      body: JSON.stringify({ calibration_parameters: params }),
    })
    if (!r2.ok) return { ok: false, message: `Update params for "${name}" failed: ${r2.status}` }
  }

  // Step 3: Publish
  const r3 = await api(`/review/publish_calibration?cali_id=${caliId}`)
  if (!r3.ok) return { ok: false, message: `Publish "${name}" failed: ${r3.status}` }

  return { ok: true, caliId }
}

export async function createCalibration() {
  const reviewIds = state.reviewIds?.length ? state.reviewIds
    : state.lastReviewId ? [state.lastReviewId]
    : null
  if (!reviewIds) return { ok: false, message: 'No reviews found. Run "Reviews → Create Reviews" first.' }

  const ratingScales = (state.ratingScales || []).filter(s => s.id)
  const fallbackScale = state.ratingScaleId ? [{ id: state.ratingScaleId }] : []
  const scales = ratingScales.length ? ratingScales : fallbackScale

  const created = [], failed = [], createdIds = []

  for (let i = 0; i < CALIBRATION_NAMES.length; i++) {
    const name = CALIBRATION_NAMES[i]
    const reviewId = reviewIds[i % reviewIds.length]
    const ratingScaleId = scales.length ? scales[i % scales.length].id : null
    const r = await _createOneCalibration({ name, reviewId, ratingScaleId })
    if (r.ok) { created.push(name); if (r.caliId) createdIds.push(r.caliId) }
    else failed.push(`${name} (${r.message})`)
  }

  if (!created.length) return { ok: false, message: `All calibrations failed: ${failed.join(' | ')}` }

  if (createdIds.length) { state.calibrationIds = createdIds; saveState() }

  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Created ${created.length} calibrations: ${created.map(n => n.split(' ')[0]).join(', ')}${failNote}` }
}
