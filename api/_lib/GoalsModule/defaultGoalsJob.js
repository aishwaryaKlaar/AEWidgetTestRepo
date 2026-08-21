// Node-safe port of defaultGoals() from src/modules/goals/actions.js ("Default Goals" in
// the widget UI), for the Slack slash-command proof-of-concept.
//
// Two state reads to replace: additional_users (up to 10 org_user_ids from state.users —
// re-derived here via UserModule's fetchAllEmployees(), a legitimate cross-module reuse
// since "list of people in the workspace" is Users-module data) and time periods (via
// goalsCore.js's fetchTimePeriods(), same as createGoalsJob).
import { klaarApi, runJobAndReply } from '../shared/klaarCore.js'
import { resolveSheetUserId, fetchTimePeriods } from './goalsCore.js'
import { fetchAllEmployees } from '../UserModule/klaarStopgapCore.js'

// The 7 assignments from DEFAULT_ASSIGNMENTS in src/modules/goals/actions.js:212-279.
const DEFAULT_ASSIGNMENTS = [
  {
    name: 'Quantum-Safe Cryptography & Post-Quantum Migration',
    goals: [
      'Inventory all public-key cryptographic assets and algorithms currently deployed across production',
      'Pilot NIST-standardized post-quantum encryption algorithms in non-production microservices',
      'Implement crypto-agility frameworks to enable seamless cipher suite rotation without downtime',
      'Upgrade TLS inspection proxies and VPN tunnels to quantum-resistant key-exchange standards',
    ],
  },
  {
    name: 'Regulatory Compliance Automation & Sovereign Cloud Governance',
    goals: [
      'Deploy automated policy-as-code engines to enforce regional data residency boundaries',
      'Establish continuous compliance auditing for GDPR, HIPAA, and SOC 2 Trust Principles',
      'Automate generation of auditor-ready evidence trails directly from cloud infrastructure logs',
      'Implement strict cryptographic data isolation across multi-tenant storage tiers',
      'Conduct automated privacy impact assessments (PIA) for newly provisioned database schemas',
    ],
  },
  {
    name: 'Industrial IoT Telemetry & Edge Intelligence Operations',
    goals: [
      'Deploy lightweight edge container runtimes for real-time anomaly detection on shop-floor gateways',
      'Standardize MQTT and OPC-UA protocol ingestion into centralized streaming pipelines',
      'Implement zero-touch provisioning and cryptographic attestation for remote hardware sensors',
      'Reduce edge-to-cloud telemetry bandwidth consumption via local data filtering and aggregation',
    ],
  },
  {
    name: 'Algorithmic Risk Management & Real-Time Fraud Mitigation',
    goals: [
      'Integrate sub-millisecond fraud scoring models into high-volume transactional checkout paths',
      'Deploy automated behavioral biometrics tracking to detect account takeover (ATO) patterns',
      'Establish dynamic velocity limits and step-up authentication triggers for anomalous requests',
      'Execute continuous backtesting of machine learning risk models against emerging fraud attack vectors',
    ],
  },
  {
    name: 'Enterprise Service Mesh & Zero-Trust Microsegmentation',
    goals: [
      'Enforce mutual TLS (mTLS) with strict identity verification across all inter-service communications',
      'Implement granular Layer-7 authorization policies based on fine-grained IAM claims',
      'Deploy automated traffic mirroring to safely validate canary releases with live production payloads',
      'Centralize access logging and distributed tracing instrumentation across the mesh control plane',
      'Establish automated certificate provisioning and short-lived credential life cycles for workloads',
    ],
  },
  {
    name: 'Customer Experience Telemetry & Omnichannel Journey Optimization',
    goals: [
      'Consolidate multi-touchpoint behavioral events into a unified real-time customer data platform',
      'Implement predictive churn intervention models integrated directly with automated marketing tools',
      'Track Core Web Vitals and client-side rendering performance to reduce user drop-off rates',
      'Deploy automated A/B testing frameworks for rapid experimentation on core conversion funnels',
    ],
  },
  {
    name: 'Strategic Sourcing & Vendor Risk Quantification',
    goals: [
      'Implement continuous cybersecurity rating monitoring for all tier-1 third-party SaaS vendors',
      'Automate SLA tracking and contractual credit calculations for mission-critical vendor outages',
      'Establish centralized procurement approval workflows with automated budget verification',
      'Conduct periodic software license usage audits to eliminate dormant seat allocations',
      'Standardize vendor onboarding security questionnaires and automated risk classification scoring',
    ],
  },
];

// Ported from defaultGoals() in actions.js, minus the state.js reads.
export async function defaultGoalsJob() {
  const { sheetUserId: adminId, error } = await resolveSheetUserId()
  if (error) return { ok: false, message: error }

  const allEmployees = await fetchAllEmployees()
  const additionalUsers = allEmployees.slice(0, 10).map(u => u.uuid).filter(Boolean)

  const periods = await fetchTimePeriods(adminId)
  const timePeriods = periods.filter(t => t.id && t.start_at && t.end_at)
  if (!timePeriods.length) return { ok: false, message: 'No time periods found. Run /create-time-period first.' }

  const created = [], failed = []

  for (let i = 0; i < DEFAULT_ASSIGNMENTS.length; i++) {
    const assignment = DEFAULT_ASSIGNMENTS[i]
    const tp = timePeriods[i % timePeriods.length]
    const startAt = tp.start_at.slice(0, 10)
    const endAt = tp.end_at.slice(0, 10)

    // Step 1: Create assignment
    const r1 = await klaarApi(`/okr/performance/default/assignments/?sheet_user_id=${adminId}`, {
      method: 'POST',
      body: JSON.stringify({
        name: assignment.name,
        additional_users: additionalUsers,
        role_groups: [],
        roles: [],
      }),
    })
    if (!r1.ok) { failed.push(`${assignment.name} (create failed: ${r1.status})`); continue }
    // Confirmed live: a successful create response is wrapped as
    // {data:{success:true, message:"...", data:{id, name, ...}}} — one level deeper than
    // the {id}/{data:{id}} shapes checked elsewhere in this codebase, so the real record
    // sits at r1.data.data.data, not r1.data.data.
    const assignmentId = r1.data?.id || r1.data?.data?.id || r1.data?.data?.data?.id
    if (!assignmentId) {
      failed.push(`${assignment.name} (no assignment id)`); continue
    }

    // Step 2: Create goals for this assignment (all share the same time period)
    let goalsFailed = 0
    for (const goalName of assignment.goals) {
      const r2 = await klaarApi(`/okr/performance/default/okrs/?sheet_user_id=${adminId}`, {
        method: 'POST',
        body: JSON.stringify({
          name: goalName,
          assignment: assignmentId,
          automatic_tracking_enabled: false,
          category: 'Individual',
          description: '',
          end_at: endAt,
          metric_data: {
            type: 'PERCENTAGE',
            target_type: 'Increase',
            dimension_type: 'RANGE',
            name: '',
            values: { sign: '%', start_value: 0, target_value: 100 },
          },
          milestone_type: '',
          milestones: [],
          node_type: 'Objective',
          parent_node: null,
          self_tracker: true,
          sheet_weightages: [{ node_id: null, weight: 100, updater_type: 'System' }],
          start_at: startAt,
          state: 'Unpublished',
          tags: [],
          time_period: tp.id,
          visibility: 'PUBLIC',
        }),
      })
      if (!r2.ok) goalsFailed++
    }

    const goalCount = assignment.goals.length - goalsFailed
    const tpName = tp.name || tp.id.slice(0, 8)
    created.push(`${assignment.name} [${goalCount} goals, period: ${tpName}]`)
  }

  if (!created.length) return { ok: false, message: `All assignments failed: ${failed.join(' | ')}` }

  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Created ${created.length} assignments: ${created.join(' | ')}${failNote}. Go to Default Goals in Klaar to view them.` }
}

export async function runDefaultGoalsJob({ response_url }) {
  await runJobAndReply(defaultGoalsJob, response_url)
}
