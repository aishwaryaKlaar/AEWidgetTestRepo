// Node-safe port of addGoalsAILibrary() from src/modules/goals/actions.js ("Add Goals in
// AI Library" in the widget UI), for the Slack slash-command proof-of-concept.
//
// Simplest Goals job so far — library nodes have no time_period, so this only needs
// resolveSheetUserId() from goalsCore.js, nothing else.
import { klaarApi, runJobAndReply } from '../shared/klaarCore.js'
import { resolveSheetUserId } from './goalsCore.js'

// The 10 library goals from LIBRARY_GOALS in src/modules/goals/actions.js:163-174.
const LIBRARY_GOALS = [
  'Establish Enterprise-Wide Data Governance & Integrity Standards',
  'Accelerate Cloud Native Migration & Infrastructure Modernization',
  'Scale Autonomous Edge Systems & Telemetry Processing',
  'Build Inclusive High-Performance Culture & Peer Coaching',
  'Implement Continuous Threat Exposure & Vulnerability Management',
  'Optimize Commercial Revenue Engine & Enterprise Pricing Models',
  'Eliminate Systemic Toil via Intelligent Process Automation',
  'Drive Sustainable Product Lifecycle & Environmental Stewardship',
  'Navigate Cross-Border Regulatory Directives & Audit Readiness',
  'Elevate Platform Reliability & Developer Velocity Metrics',
];

// Ported from addGoalsAILibrary() in actions.js, minus the state.js read.
export async function addGoalsAILibraryJob() {
  const { sheetUserId, error } = await resolveSheetUserId()
  if (error) return { ok: false, message: error }

  const created = []
  for (const name of LIBRARY_GOALS) {
    const r = await klaarApi(`/okr/performance/library/nodes/?sheet_user_id=${sheetUserId}`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        node_type: 'Objective',
        self_tracker: true,
        time_period: null,
        category: null,
        description: null,
        start_at: null,
        end_at: null,
        tags: [],
        metric_data: {
          type: 'PERCENTAGE',
          target_type: 'Increase',
          dimension_type: 'RANGE',
          name: '',
          values: { sign: '%', start_value: 0, target_value: 100 },
        },
      }),
    })
    if (!r.ok) return { ok: false, message: `Created ${created.length}/${LIBRARY_GOALS.length}; failed "${name}" (${r.status})` }
    created.push(name)
    await new Promise(res => setTimeout(res, 200))
  }
  return { ok: true, message: `Added ${created.length} goals to Goal Library. Go to Goal Library in Klaar to view them.` }
}

export async function runAddGoalsAILibraryJob({ response_url }) {
  await runJobAndReply(addGoalsAILibraryJob, response_url)
}
