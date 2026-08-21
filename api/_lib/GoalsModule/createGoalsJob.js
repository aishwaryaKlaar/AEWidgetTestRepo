// Node-safe port of createGoals() from src/modules/goals/actions.js ("Import Goals" in
// the widget UI), for the Slack slash-command proof-of-concept.
//
// The browser prefers state.timePeriodId (set by createTimePeriod() earlier in the same
// session, using the same org-user sheet) and only GETs live if that's empty — specifically
// to avoid picking a period created under a different sheet_user_id. We have no shared
// state, so we always take the GET path via fetchTimePeriods() in goalsCore.js — which is
// safe precisely because resolveSheetUserId() always resolves to the same person, so the
// periods it finds are guaranteed to be on that same sheet, never a different one.
import { klaarApi, runJobAndReply } from '../shared/klaarCore.js'
import { resolveSheetUserId, resolveActivePeriod } from './goalsCore.js'

// The 25 individual goals from DUMMY_GOALS in src/modules/goals/actions.js:67-93.
const DUMMY_GOALS = [
  'Build Resilience Across Critical Distributed Systems',
  'Implement Automated Data Security and Loss Prevention',
  'Explore New High-Growth Market Segments and Partnerships',
  'Streamline Procurement and Vendor Relationship Workflows',
  'Foster Collaborative Team Culture and Knowledge Sharing',
  'Incorporate Sustainable Practices Across Logistics Networks',
  'Integrate Machine Learning for Real-Time Anomaly Detection',
  'Transition Legacy Financial Systems to Cloud Native Stack',
  'Accelerate Release Cadence with Continuous Integration',
  'Establish Guidelines for Responsible Technology Adoption',
  'Maintain Compliance with Evolving Global Data Directives',
  'Achieve High Availability via Fault-Tolerant Architectures',
  'Integrate Security Automation directly into CI/CD Pipelines',
  'Evaluate Subscription Tiering and Revenue Optimizations',
  'Deliver Personalized Digital Experiences Across Endpoints',
  'Reduce Operational Waste and Support Reusable Materials',
  'Decrease First-Response Times for High-Priority Tickets',
  'Track Capital Investments Against Quarterly Target Metrics',
  'Expand API Documentation and Self-Service Developer Tools',
  'Unify Component Libraries to Ensure UI/UX Consistency',
  'Consolidate Operations and Data Stores Post-Acquisition',
  'Test Incident Response Plans via Automated Disaster Drills',
  'Enhance Initial Training Programs for Faster Team Integration',
  'Implement Semantic Search Solutions for Corporate Documentation',
  'Optimize Low-Latency Data Ingestion at Network Edge Nodes',
];

// Ported from createGoals() in actions.js, minus the state.js read/write.
export async function createGoalsJob() {
  const { sheetUserId, error } = await resolveSheetUserId()
  if (error) return { ok: false, message: error }

  const target = await resolveActivePeriod(sheetUserId)
  if (!target) return { ok: false, message: 'No time period found — run /create-time-period first.' }

  const year = new Date().getFullYear()
  const objStart = target.start_at || `${year}-01-01`
  const objEnd = target.end_at || `${year}-12-31`

  const created = []
  for (const name of DUMMY_GOALS) {
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
    if (!r.ok) return { ok: false, message: `Created ${created.length}/${DUMMY_GOALS.length}; failed "${name}" (${r.status})` }
    created.push(name)
    await new Promise(res => setTimeout(res, 200))
  }
  const periodLabel = target.name || `${objStart} → ${objEnd}`
  return { ok: true, message: `Created ${created.length} goals under "${periodLabel}". Go to All OKRs in Klaar to view them.` }
}

export async function runCreateGoalsJob({ response_url }) {
  await runJobAndReply(createGoalsJob, response_url)
}
