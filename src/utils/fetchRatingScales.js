import { api } from '../core/api.js'
import { state, saveState } from '../core/state.js'

export async function fetchRatingScales() {
  const r = await api('/review/get_ratings_for_org', {
    method: 'POST',
    body: JSON.stringify({
      filters: [['status', '__in', ['In Use', 'Not In Use'], '']],
      limit: 50, offset: 1,
    }),
  })
  if (!r.ok) return { ok: false, message: `Failed: ${r.status}` }
  const scales = (r.data && r.data.data) || []
  const targetName = 'Klaar Inbuilt 5 Point Rating Scale with Formal Label Names'
  const target = scales.find(s => s.name === targetName)
  state.ratingScales  = scales.map(s => ({ id: s.id, name: s.name }))
  if (target) state.ratingScaleId = target.id
  saveState()
  return {
    ok: true,
    message: `Fetched ${scales.length} rating scales` + (target ? `; found target` : '; target NOT found'),
    data: { count: scales.length },
  }
}
