// Node-safe port of individualOKR() from src/modules/goals/actions.js ("Individual OKR"
// in the widget UI), for the Slack slash-command proof-of-concept.
//
// INDIVIDUAL_OKR_GOALS is exported (not just a local const) because keyResultJob.js and
// addChildObjectiveJob.js need the exact same name list to recover these objectives' real
// IDs live via resolveObjectiveIds() — see goalsCore.js for why (no durable store).
import { klaarApi, runJobAndReply } from '../shared/klaarCore.js'
import { resolveSheetUserId, resolveActivePeriod } from './goalsCore.js'

// The 20 individual OKR names from INDIVIDUAL_OKR_GOALS in
// src/modules/goals/actions.js:442-463.
export const INDIVIDUAL_OKR_GOALS = [
  'Advance Technical Specialization and Drive Modernization Practices',
  'Autonomously Resolve Critical System Faults and Production Edge Cases',
  'Outperform Expected Velocity Benchmarks Without Compromising Quality',
  'Cultivate High-Trust Collaboration Across Inter-Departmental Teams',
  'Maintain High Standards for Test Automation, Linting, and Clean Code',
  'Drive Component Design and End-to-End Implementation of Features',
  'Pivoting Seamlessly During Changing Priorities While Preserving Throughput',
  'Detect Performance Bottlenecks and Deploy Proactive Optimizations',
  'Evaluate Emerging Technologies and Seamlessly Adopt into Modern Stack',
  'Consistently Meet Sprint Objectives and Key Release Milestones',
  'Map Individual Work Items directly to High-Level Strategic Metrics',
  'Structure Workday Workflows to Minimize Context Switching and Friction',
  'Ensure Uncompromising Uptime for Critical Shared Services and Tools',
  'Improve Team Code Craftsmanship Through Thorough Architectural Reviews',
  'Leverage Systematic Incident Post-Mortems to Eliminate Repeated Errors',
  'Optimize Local Developer Environment and Personal Productivity Pipeline',
  'Translate Technical Observability Data into Clear Actionable Insights',
  'Refactor Legacy Monolith Code to Boost Maintainability and Scalability',
  'Benchmark System Decisions Against Quantitative Data and Performance Metrics',
  'Take Strict Ownership of End-to-End Feature Health and Lifecycles',
];

// Ported from individualOKR() in actions.js, minus the state.js write at the end.
export async function individualOKRJob() {
  const { sheetUserId, error } = await resolveSheetUserId()
  if (error) return { ok: false, message: error }

  const target = await resolveActivePeriod(sheetUserId)
  if (!target) return { ok: false, message: 'No time period found — run /create-time-period first.' }

  const year = new Date().getFullYear()
  const objStart = target.start_at || `${year}-01-01`
  const objEnd = target.end_at || `${year}-12-31`

  const created = []
  for (const name of INDIVIDUAL_OKR_GOALS) {
    const r = await klaarApi(`/okr/performance/objective/?sheet_user_id=${sheetUserId}`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        node_type: 'Objective',
        category: 'Individual',
        time_period: target.id,
        owners: [sheetUserId],
        self_tracker: true,
        visibility: 'PUBLIC',
        parent_node: null,
        description: null,
        groups: [],
        contributors: [],
        tags: [],
        milestones: [],
        milestone_type: '',
        automatic_tracking_enabled: false,
        start_at: objStart,
        end_at: objEnd,
        metric_data: {
          type: 'PERCENTAGE',
          target_type: 'Increase',
          dimension_type: 'RANGE',
          name: 'Progress',
          values: { sign: '%', start_value: 0, target_value: 100 },
        },
      }),
    })
    if (!r.ok) return { ok: false, message: `Created ${created.length}/${INDIVIDUAL_OKR_GOALS.length}; failed "${name}" (${r.status})` }
    created.push(name)
    await new Promise(res => setTimeout(res, 200))
  }

  const periodLabel = target.name || `${objStart} → ${objEnd}`
  return { ok: true, message: `Created ${created.length} Individual OKRs under "${periodLabel}". Go to My Goals in Klaar to view them.` }
}

export async function runIndividualOKRJob({ response_url }) {
  await runJobAndReply(individualOKRJob, response_url)
}
