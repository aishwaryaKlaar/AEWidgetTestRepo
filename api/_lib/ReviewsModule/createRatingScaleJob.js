// Node-safe port of createRatingScale() from src/modules/reviews/actions.js ("Create
// Rating Scale" in the widget UI), for the Slack slash-command proof-of-concept.
// Fully self-contained — no cross-step dependency, same as /create-manager.
import { klaarApi, errorBodyText, runJobAndReply } from '../shared/klaarCore.js'

// The 11 rating scale names from RATING_SCALE_NAMES in
// src/modules/reviews/actions.js:103-115. Exported — createReviewsJob.js needs the exact
// same list to recover these scales' real IDs live via resolveRatingScaleIds().
export const RATING_SCALE_NAMES = [
  '5-Point Systems Mastery & Architectural Rigor Index',
  '5-Level Autonomous Delivery & Execution Scale',
  '5-Point Cross-Functional Impact & Influence Gradient',
  '5-Level Problem Decomposition & Analytical Depth Metric',
  '5-Point High-Agency Ownership & Initiative Benchmark',
  '5-Level Craft Quality & Engineering Standards Continuum',
  '5-Point Resilience & Operational Readiness Index',
  '5-Level Team Enablement & Force-Multiplier Scale',
  '5-Point Customer Obsession & Value Realization Spectrum',
  '5-Level Strategic Foresight & Horizon Planning Matrix',
  '5-Point Pragmatic Innovation & Continuous Improvement Scale',
];

// The 5 rating options from RATING_OPTIONS in src/modules/reviews/actions.js:117-138.
const RATING_OPTIONS = [
  { label: 'Needs Improvement',    value: 1,
    description: 'Requires significant improvement to consistently meet role expectations.',
    achievement_lower_bound: 10, achievement_upper_bound: 10,
    auto_rating_lower_bound: 10, auto_rating_upper_bound: 10 },
  { label: 'Below Expectations',   value: 2,
    description: 'Performance occasionally meets expectations but needs greater consistency.',
    achievement_lower_bound: 10, achievement_upper_bound: 10,
    auto_rating_lower_bound: 10, auto_rating_upper_bound: 10 },
  { label: 'Meets Expectations',   value: 3,
    description: 'Consistently fulfills role responsibilities and expected performance standards.',
    achievement_lower_bound: 10, achievement_upper_bound: 10,
    auto_rating_lower_bound: 10, auto_rating_upper_bound: 10 },
  { label: 'Exceeds Expectations', value: 4,
    description: 'Frequently delivers results beyond expectations with minimal guidance.',
    achievement_lower_bound: 10, achievement_upper_bound: 10,
    auto_rating_lower_bound: 10, auto_rating_upper_bound: 10 },
  { label: 'Outstanding',          value: 5,
    description: 'Consistently achieves exceptional results and sets a benchmark for excellence.',
    achievement_lower_bound: 10, achievement_upper_bound: 10,
    auto_rating_lower_bound: 10, auto_rating_upper_bound: 10 },
];

// Ported from createRatingScale() in actions.js, minus the state.js write at the end.
export async function createRatingScaleJob() {
  const created = []
  const failed = []

  for (const name of RATING_SCALE_NAMES) {
    const r = await klaarApi('/review/create_rating', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
    if (r.ok) {
      const id = r.data?.data?.id || r.data?.id
      if (id) {
        await klaarApi(`/review/update_rating_for_rating_id/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ rating_options: RATING_OPTIONS }),
        })
      }
      created.push({ name, id })
    } else {
      const body = errorBodyText(r)
      if (r.status === 400 && body.includes('exist')) {
        created.push({ name, id: null, existing: true })
      } else {
        failed.push(`${name} (${r.status})`)
      }
    }
  }

  if (!created.length) return { ok: false, message: `All failed: ${failed.join(', ')}` }

  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Created ${created.length} rating scales${failNote}. Go to Review Settings in Klaar to view them.` }
}

export async function runCreateRatingScaleJob({ response_url }) {
  await runJobAndReply(createRatingScaleJob, response_url)
}
