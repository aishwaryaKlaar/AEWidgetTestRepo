// Node-safe port of giveFeedback() from src/modules/feedback/actions.js ("Give Feedback" —
// the only wired-up step in the widget's Feedback section), for the Slack slash-command
// proof-of-concept.
//
// No durable state (state.users/state.dummyUsers) — always fetch live employees instead,
// same pattern as every other module. The admin identity is only used to keep the admin out
// of their own feedback recipients, so unlike Goals/Reviews it's optional here: if it can't
// be resolved, just skip the exclusion rather than failing the whole job.
import { klaarApi, runJobAndReply, resolveSheetUserId, searchResults } from '../shared/klaarCore.js'

const FEEDBACK_TEXTS = [
  'Demonstrates a consistent commitment to quality, ownership, and professional excellence in daily responsibilities.',
  'Effectively balances multiple priorities while maintaining strong attention to detail and execution standards.',
  'Actively contributes to a collaborative team environment through open communication and constructive engagement.',
  'Approaches challenges with a thoughtful and analytical mindset, leading to practical and effective solutions.',
  'Shows reliability in meeting commitments and maintaining accountability across assigned responsibilities.',
  'Continuously identifies opportunities to improve processes, workflows, and overall operational effectiveness.',
  'Builds positive stakeholder relationships through trust, responsiveness, and professional collaboration.',
  'Adapts confidently to evolving priorities and changing business needs with a proactive attitude.',
  'Contributes meaningful insights and support that strengthen team performance and business outcomes.',
  'Demonstrates initiative in personal development and consistently seeks opportunities for continuous learning.',
];

// Ported from giveFeedback() in actions.js, minus the state.js reads.
export async function giveFeedbackJob() {
  const { sheetUserId } = await resolveSheetUserId()
  const seen = new Set(sheetUserId ? [sheetUserId] : [])
  const candidates = []

  const r = await klaarApi('/um/accounts/employee/?page=1&page_size=20')
  if (r.ok) {
    for (const emp of searchResults(r)) {
      if (candidates.length >= 7) break
      const oid = emp.org_user?.id
      if (!oid || seen.has(oid)) continue
      seen.add(oid)
      candidates.push({ full_name: emp.user?.full_name, org_user_id: oid })
    }
  }

  if (!candidates.length) {
    return { ok: false, message: 'No users found to give feedback to. Run /add-employee or /bulk-upload-user first.' }
  }

  const created = [], failed = []
  for (let i = 0; i < candidates.length; i++) {
    const user = candidates[i]
    const feedback = FEEDBACK_TEXTS[i % FEEDBACK_TEXTS.length]
    const r2 = await klaarApi('/cf/api/v1/feedbacks', {
      method: 'POST',
      body: JSON.stringify({
        feedbackFor: [user.org_user_id],
        feedback,
        feedbackVisibility: 'RECIPIENT',
        linkedItems: { goals: [], competencies: [] },
      }),
    })
    if (r2.ok) created.push(user.full_name)
    else failed.push(`${user.full_name} (${r2.status})`)
  }

  if (!created.length) return { ok: false, message: `All feedbacks failed: ${failed.join(', ')}` }

  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Gave feedback to ${created.length} users: ${created.join(', ')}${failNote}. Go to Continuous Feedback in Klaar to view them.` }
}

export async function runGiveFeedbackJob({ response_url }) {
  await runJobAndReply(giveFeedbackJob, response_url)
}
