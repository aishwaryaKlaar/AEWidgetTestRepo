import { api, getAdminUserIdFromJwt, getOrgUserIdFromJwt } from '../../core/api.js'
import { state, saveState } from '../../core/state.js'
import { notImplemented, unwrapPayload } from '../../core/helpers.js'
import { fetchGroups } from '../../utils/fetchGroups.js'

// Step 1: Create Time Period — creates 7 cycles for current year
export async function createTimePeriod() {
  // Use org_user.id so the time period sheet is created for the same user that will create objectives
  const adminId = getOrgUserIdFromJwt() || getAdminUserIdFromJwt() || state.adminOrgUserId || state.adminUserId || ''
  if (!adminId) return { ok: false, message: 'Could not read user ID from session. Please log in.' }

  // Try to get a group to associate — optional, not a hard requirement
  let groupId = state.workspaceGroupId
  if (!groupId) {
    const fg = await fetchGroups()
    if (fg.ok) groupId = state.workspaceGroupId
  }

  const year = new Date().getFullYear()
const periods = [
  { name: `Organizational Inception & Roadmap Alignment ${year}`, start_at: `${year}-01-01`, end_at: `${year}-02-28` },
  { name: `Capability Mobilization & Platform Hardening ${year}`,   start_at: `${year}-03-01`, end_at: `${year}-04-30` },
  { name: `Core Velocity & Initiative Delivery ${year}`,          start_at: `${year}-05-01`, end_at: `${year}-06-30` },
  { name: `System Resilience & Ecosystem Expansion ${year}`,      start_at: `${year}-07-01`, end_at: `${year}-08-31` },
  { name: `Strategic Monetization & Customer Adoption ${year}`,   start_at: `${year}-09-01`, end_at: `${year}-10-31` },
  { name: `Risk Governance & Compliance Certification ${year}`,   start_at: `${year}-11-01`, end_at: `${year}-11-30` },
  { name: `Annual Impact Synthesis & Horizon Planning ${year}`,   start_at: `${year}-12-01`, end_at: `${year}-12-31` },
];
  const created = []
  const allCreated = [] // collect all {id, start_at, end_at} so we can pick the active one
  for (const tp of periods) {
    const body = groupId ? { ...tp, groups: [groupId] } : { ...tp }
    const r = await api(`/okr/performance/time_period/?sheet_user_id=${adminId}`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    if (!r.ok) return { ok: false, message: `Created ${created.length}/${periods.length}; failed "${tp.name}" (${r.status})` }
    created.push(r.data?.data?.name || tp.name)
    allCreated.push({
      id: r.data?.data?.id,
      name: r.data?.data?.name || tp.name,
      start_at: r.data?.data?.start_at || tp.start_at,
      end_at: r.data?.data?.end_at || tp.end_at,
    })
    await new Promise(res => setTimeout(res, 200))
  }

  // Pick the period that covers today, or the next future one, or fall back to the first
  const today = new Date().toISOString().slice(0, 10)
  const active = allCreated.find(p => p.id && p.start_at <= today && today <= p.end_at)
  const next = allCreated.find(p => p.id && p.start_at > today)
  const target = active || next || allCreated[0]
  if (target?.id) {
    state.timePeriodId = target.id
    state.timePeriodStart = target.start_at
    state.timePeriodEnd = target.end_at
  }
  // Save all created periods with full date data so defaultGoals() can cycle through them
  state.timePeriods = allCreated.filter(p => p.id).map(p => ({
    id: p.id, name: p.name, start_at: p.start_at, end_at: p.end_at,
  }))

  saveState()
  return { ok: true, message: `Created ${created.length} time periods: ${created.join(', ')}` }
}

const DUMMY_GOALS = [
  'Deploy Multi-Region Active-Active Database Topologies',
  'Enforce Dynamic Role-Based Access Across Vector Storage',
  'Pioneer Strategic Joint Ventures in Emerging Markets',
  'Automate Contract Lifecycle Auditing and Tier-1 Vendor SLAs',
  'Institutionalize Cross-Domain Pair Programming and Tech Talks',
  'Decarbonize Compute Workloads via Green Region Scheduling',
  'Embed Behavioral Anomaly Scoring into Checkout Gateways',
  'Modernize Core Ledger Services Using Event Sourcing Patterns',
  'Compress End-to-End Build and Deployment Pipeline Latency',
  'Formulate Enterprise AI Governance and Provenance Standards',
  'Automate Policy-as-Code Audits for Sovereign Cloud Mandates',
  'Implement Automated Traffic Shedding and Circuit Breakers',
  'Orchestrate Continuous Static and Dynamic Software Bill Audits',
  'Model Unit Economics and Consumption-Based Monetization Tiers',
  'Instrument Real-Time Behavioral Telemetry for Core Funnels',
  'Eliminate Redundant SaaS Allocations and Inefficient Licenses',
  'Automate Triage and Tier-3 Escalation via Runbook Diagnostics',
  'Align Cloud Infrastructure Spend Directly with P&L Targets',
  'Publish Ephemeral Sandbox Environments for Third-Party APIs',
  'Standardize Micro-Frontend Design Tokens and Design Systems',
  'Harmonize Identity Provider Schemas Following Corporate M&A',
  'Simulate Cascading Network Partitions via Chaos Injection',
  'Streamline Technical Onboarding with Interactive Sandboxes',
  'Build Graph-Powered Knowledge Retrieval for Field Engineers',
  'Process Sensor Telemetry via Ultra-Lightweight Edge Runtimes'
];

// Step 2: Create Goals — creates 25 individual goals under an active time period
export async function createGoals() {
  // OKR endpoints need org_user.id (workspace-level), not user.id (auth-level)
  const sheetUserId = getOrgUserIdFromJwt() || state.adminOrgUserId || ''
  if (!sheetUserId) return { ok: false, message: 'Could not read org user ID from session. Please log in.' }

  // Prefer state set by the most recent createTimePeriod() (which uses org user ID).
  // Fall back to GET only if state is empty, to avoid accidentally picking one of the
  // old periods created with the auth user ID (which have no sheet for org user ID).
  let timePeriodId = state.timePeriodId || null
  let timePeriodStart = state.timePeriodStart || null
  let timePeriodEnd = state.timePeriodEnd || null

  if (!timePeriodId) {
    const tpr = await api(`/okr/performance/time_period/?sheet_user_id=${sheetUserId}`)
    const periods = tpr.ok ? (tpr.data?.results || tpr.data?.data || []) : []
    const today = new Date().toISOString().slice(0, 10)
    const active = periods.find(p => p.id && p.start_at <= today && today <= p.end_at)
    const target = active || periods.find(p => p.id) || null
    timePeriodId = target?.id || null
    timePeriodStart = target?.start_at || null
    timePeriodEnd = target?.end_at || null
  }

  if (!timePeriodId) return { ok: false, message: 'No time period found — run "Create Time Period" first.' }

  const year = new Date().getFullYear()
  const objStart = timePeriodStart || `${year}-01-01`
  const objEnd = timePeriodEnd || `${year}-12-31`

  const created = []
  for (const name of DUMMY_GOALS) {
    const r = await api(`/okr/performance/objective/?sheet_user_id=${sheetUserId}`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        node_type: 'Objective',
        category: 'Individual',
        time_period: timePeriodId,
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
  return { ok: true, message: `Created ${created.length} goals (period: ${objStart} → ${objEnd})` }
}

const LIBRARY_GOALS = [
  'Operationalize Zero-Trust Microsegmentation Across Multi-Cloud Estates',
  'Accelerate Retrieval-Augmented Generation & Enterprise Vector Search',
  'Optimize Multi-Cloud Unit Economics & Programmatic FinOps Guardrails',
  'Institutionalize Blameless Root-Cause Auditing & Resilience Drills',
  'Harden Software Supply Chains via Continuous Cryptographic SBOM Verification',
  'Harmonize Cross-Functional Discovery & Continuous Product Experimentation',
  'Modernize Event-Driven Streaming Fabrics & Asynchronous Integration Mesh',
  'Pioneer Decentralized Identity Standards & Privacy-Preserving Cryptography',
  'Establish Dynamic SLA/SLO Telemetry & Proactive Outage Prevention Protocols',
  'Cultivate Cross-Domain Succession Pathways & High-Agency Leadership'
];

// Step 3: Add Goals in Goal Library — posts 10 template goals to the workspace library
export async function addGoalsAILibrary() {
  const sheetUserId = getOrgUserIdFromJwt() || state.adminOrgUserId || ''
  if (!sheetUserId) return { ok: false, message: 'Could not read org user ID from session. Please log in.' }

  const created = []
  for (const name of LIBRARY_GOALS) {
    const r = await api(`/okr/performance/library/nodes/?sheet_user_id=${sheetUserId}`, {
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
  return { ok: true, message: `Added ${created.length} goals to Goal Library` }
}

// Step 4: Default Goals — creates a test goal cycle (smoke test)
const DEFAULT_ASSIGNMENTS = [
  {
    name: 'Cognitive Systems & Autonomous Agent Orchestration',
    goals: [
      'Architect event-driven agentic loops with multi-step deterministic safety checks',
      'Deploy localized inference nodes to minimize round-trip latency for real-time edge processing',
      'Implement multi-agent consensus protocols to arbitrate complex decision workflows',
      'Establish continuous regression suites for automated prompt and context drift detection',
    ],
  },
  {
    name: 'Decentralized Identity & Zero-Knowledge Verification',
    goals: [
      'Integrate verifiable credential issuance protocols across employee and vendor portals',
      'Deploy zero-knowledge proof verification circuits to eliminate raw PII transmission',
      'Standardize DID (Decentralized Identifier) resolvers across federated IAM architectures',
      'Automate cryptographic revocation registry updates across distributed identity brokers',
      'Enforce tamper-evident audit logging for high-assurance credential handshakes',
    ],
  },
  {
    name: 'Distributed Core Ledger & Transaction Resiliency',
    goals: [
      'Migrate relational financial ledgers to an immutable event-sourced log architecture',
      'Implement two-phase commit consensus optimizations across globally partitioned shards',
      'Deploy automated double-entry verification workers to detect balance mismatches in real time',
      'Establish sub-second multi-region disaster recovery replication with zero data loss',
    ],
  },
  {
    name: 'Hardware Acceleration & Low-Latency Systems Tuning',
    goals: [
      'Profile kernel-level network packet processing to bypass user-space context switches',
      'Optimize GPU cluster allocation workloads to maximize tensor core utilization efficiency',
      'Implement zero-copy memory buffers across inter-process communication layers',
      'Conduct hardware-level cache line contention audits for high-frequency processing engines',
    ],
  },
  {
    name: 'Autonomous Governance & Continuous Audit Automation',
    goals: [
      'Codify cloud infrastructure security benchmarks using declarative policy engines',
      'Automate real-time reconciliation of sovereign data storage boundaries across regions',
      'Generate auditor-certified compliance snapshots continuously via CI/CD triggers',
      'Deploy automated toxic combination detection for IAM privilege escalation paths',
      'Implement continuous cryptographic attestation for all running container images',
    ],
  },
  {
    name: 'Engineering Ecosystem Health & Asynchronous Culture',
    goals: [
      'Transition architectural decision-making to structured, asynchronous RFC workflows',
      'Instrument continuous code review latency tracking to prevent PR stagnation',
      'Establish blameless incident retrospective playbooks with traceable remediation tasks',
      'Deploy centralized schema registries to eliminate cross-team synchronous blockers',
    ],
  },
  {
    name: 'Predictive Infrastructure Scaling & Cost Intelligence',
    goals: [
      'Train time-series forecasting models to pre-provision compute capacity ahead of surges',
      'Implement automated ephemeral namespace termination policies for staging environments',
      'Embed real-time cost-per-query visibility directly into internal developer dashboards',
      'Automate multi-cloud spot instance failover orchestrations for batch workloads',
      'Audit unused storage block volumes and cold assets for automated lifecycle tiering',
    ],
  },
];

// Step 4: Default Goals — creates 7 assignments each with 4-5 goals
export async function defaultGoals() {
  // OKR endpoints need org_user.id (same as createGoals)
  const adminId = getOrgUserIdFromJwt() || getAdminUserIdFromJwt() || state.adminOrgUserId || state.adminUserId || ''
  if (!adminId) return { ok: false, message: 'Could not read admin ID from session. Please log in.' }

  // Resolve users for additional_users (up to 10)
  const allUsers = (state.users || []).filter(u => u.org_user_id)
  const additionalUsers = allUsers.slice(0, 10).map(u => u.org_user_id)

  // Use time periods saved by createTimePeriod() — they include accurate start_at / end_at
  let timePeriods = (state.timePeriods || []).filter(t => t.id && t.start_at && t.end_at)
  if (!timePeriods.length && state.timePeriodId && state.timePeriodStart && state.timePeriodEnd) {
    timePeriods = [{ id: state.timePeriodId, name: 'Active Period', start_at: state.timePeriodStart, end_at: state.timePeriodEnd }]
  }
  if (!timePeriods.length) return { ok: false, message: 'No time periods found. Run "Goals → Create Time Period" first.' }

  const created = [], failed = []

  for (let i = 0; i < DEFAULT_ASSIGNMENTS.length; i++) {
    const assignment = DEFAULT_ASSIGNMENTS[i]
    const tp = timePeriods[i % timePeriods.length]
    const startAt = tp.start_at.slice(0, 10)
    const endAt = tp.end_at.slice(0, 10)

    // Step 1: Create assignment
    const r1 = await api(`/okr/performance/default/assignments/?sheet_user_id=${adminId}`, {
      method: 'POST',
      body: JSON.stringify({
        name: assignment.name,
        additional_users: additionalUsers,
        role_groups: [],
        roles: [],
      }),
    })
    if (!r1.ok) { failed.push(`${assignment.name} (create failed: ${r1.status})`); continue }
    const assignmentId = r1.data?.id || r1.data?.data?.id
    if (!assignmentId) { failed.push(`${assignment.name} (no assignment id)`); continue }

    // Step 2: Create goals for this assignment (all share the same time period)
    let goalsFailed = 0
    for (const goalName of assignment.goals) {
      const r2 = await api(`/okr/performance/default/okrs/?sheet_user_id=${adminId}`, {
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
  return { ok: true, message: `Created ${created.length} assignments: ${created.join(' | ')}${failNote}` }
}

const GROUP_OKR_GOALS = [
  'Operationalize Multi-Domain Data Mesh Contracts Across Squad Boundaries',
  'Accelerate Shared Infrastructure Decoupling and Automated Self-Service Tooling',
  'Standardize Cross-Ecosystem Telemetry and Unified Observability Dashboards',
  'Establish Federated Security Risk Acceptance Criteria and Rapid Triage Protocols',
  'Align Cross-Functional Release Cadences to Reduce Inter-Service Deployment Drag',
  'Co-Develop Scalable Machine Learning Pipelines for Joint Predictive Initiatives',
  'Consolidate Enterprise API Gateways and Unified Ingress Rate-Limiting Models',
  'Institutionalize Blameless Cross-Departmental Architecture Review Boards',
  'Streamline Vendor Procurement Evaluations Across Collaborative Business Units',
  'Quantify Holistic Business Value Realization via Shared KPI Scorecards'
];

// Step 5: Group OKR — creates 10 group-level objectives tied to the workspace group
export async function groupOKR() {
  const sheetUserId = getOrgUserIdFromJwt() || state.adminOrgUserId || ''
  if (!sheetUserId) return { ok: false, message: 'Could not read org user ID from session. Please log in.' }

  // Group ID — must be set by the Users module ("Add Group" step)
  const groupId = state.workspaceGroupId
  if (!groupId) return { ok: false, message: 'No group found — run "Add Group" in the Users module first.' }

  const timePeriodId = state.timePeriodId || null
  const timePeriodStart = state.timePeriodStart || null
  const timePeriodEnd = state.timePeriodEnd || null
  if (!timePeriodId) return { ok: false, message: 'No time period found — run "Create Time Period" first.' }

  const year = new Date().getFullYear()
  const objStart = timePeriodStart || `${year}-01-01`
  const objEnd = timePeriodEnd || `${year}-12-31`

  const created = []
  const createdIds = []
  for (const name of GROUP_OKR_GOALS) {
    const r = await api(`/okr/performance/objective/?sheet_user_id=${sheetUserId}`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        node_type: 'Objective',
        category: 'Group',
        time_period: timePeriodId,
        groups: [groupId],
        owners: [sheetUserId],
        self_tracker: true,
        visibility: 'PUBLIC',
        parent_node: null,
        description: null,
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
    if (!r.ok) return { ok: false, message: `Created ${created.length}/${GROUP_OKR_GOALS.length}; failed "${name}" (${r.status})` }
    created.push(name)
    const payload = unwrapPayload(r)
    const objId = Array.isArray(payload) ? payload[0] : (payload?.id || null)
    if (objId) createdIds.push(objId)
    await new Promise(res => setTimeout(res, 200))
  }

  state.groupOKRIds = createdIds
  saveState()
  return { ok: true, message: `Created ${created.length} Group OKRs (period: ${objStart} → ${objEnd})` }
}

const INDIVIDUAL_OKR_GOALS = [
  'Eliminate High-Frequency Toil Through Automated Diagnostic Runbooks',
  'Champion Rigorous Type Safety and Zero-Warning Linter Standards',
  'Design Decoupled Service Contracts to Prevent Downstream Breaking Changes',
  'Accelerate Pull Request Review Latency to Unblock Peer Velocity',
  'Profile Hot Code Paths to Cut P99 Query and Response Latencies',
  'Author Comprehensive Technical RFCs for Ambiguous Architectural Problems',
  'Harden Microservice Fault Tolerance via Chaos Injection and Resilience Probes',
  'Integrate Granular Telemetry Spans Across Newly Authored Core Endpoints',
  'Standardize Ephemeral Development Sandboxes to Shorten Feature Onboarding',
  'Proactively Remediate High-Severity Vulnerabilities in Transitive Dependencies',
  'Conduct Impactful Knowledge Transfer Sessions on Emerging Toolchains',
  'Deconstruct Monolithic Modules into Discrete Event-Driven Micro-Packages',
  'Optimize Memory Allocation Profiles to Reduce Cloud Worker Footprint',
  'Formulate Clear Acceptance Criteria and Contract Tests with Product Counterparts',
  'Establish Automated Health Check Probes to Expedite Zero-Downtime Rollouts',
  'Audit Database Index Coverage to Eliminate Inefficient Table Scans',
  'Instrument Client-Side Interaction Metrics to Validate User Journey Health',
  'Uphold Uncompromising Branch Test Coverage for All Critical Path Business Logic',
  'Synthesize Complex Incident Logs into Actionable Architectural Safeguards',
  'Drive Seamless Deprecation Pathways for Sunsetting Legacy API Endpoints'
];

// Step 6: Individual OKR — creates 10 individual-level objectives
export async function individualOKR() {
  const sheetUserId = getOrgUserIdFromJwt() || state.adminOrgUserId || ''
  if (!sheetUserId) return { ok: false, message: 'Could not read org user ID from session. Please log in.' }

  const timePeriodId = state.timePeriodId || null
  const timePeriodStart = state.timePeriodStart || null
  const timePeriodEnd = state.timePeriodEnd || null
  if (!timePeriodId) return { ok: false, message: 'No time period found — run "Create Time Period" first.' }

  const year = new Date().getFullYear()
  const objStart = timePeriodStart || `${year}-01-01`
  const objEnd = timePeriodEnd || `${year}-12-31`

  const created = []
  const createdIds = []
  for (const name of INDIVIDUAL_OKR_GOALS) {
    const r = await api(`/okr/performance/objective/?sheet_user_id=${sheetUserId}`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        node_type: 'Objective',
        category: 'Individual',
        time_period: timePeriodId,
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
    const payload = unwrapPayload(r)
    const objId = Array.isArray(payload) ? payload[0] : (payload?.id || null)
    if (objId) createdIds.push(objId)
    await new Promise(res => setTimeout(res, 200))
  }

  state.individualOKRIds = createdIds
  saveState()
  return { ok: true, message: `Created ${created.length} Individual OKRs (period: ${objStart} → ${objEnd})` }
}

const KR_NAMES = [
  'Achieve 98% on-time completion for all assigned project milestones across the review period',
  'Autonomously resolve at least 8 high-complexity technical or operational edge cases',
  'Maintain a 95%+ first-pass quality rate on core deliverables, requiring minimal revisions',
  'Secure a minimum 4.5/5 stakeholder satisfaction rating across key collaborative initiatives',
  'Maintain 99% data precision and compliance accuracy in all documentation and reports',
  'Drive 5 high-impact, business-critical deliverables from initiation through successful launch',
  'Maintain 100% SLA adherence on core priorities during unexpected shifts in business demand',
  'Formulate and execute 6 proactive risk mitigation plans for identified operational bottlenecks',
  'Earn 2 advanced domain certifications and successfully implement learnings into team workflows',
  'Achieve or exceed 100% of target metrics defined in individual performance scorecards',

  'Reduce personal task rollover and overdue action items by 30% through improved planning',
  'Facilitate 4 technical coaching or domain best-practice sessions to upskill team members',
  'Exceed target output capacity for 6 consecutive monthly performance cycles',
  'Engineer root-cause fixes for 5 persistent operational roadblocks within your functional area',
  'Resolve 95% of assigned high-priority service requests within established SLA thresholds',
  'Maintain schedule variance under 5% for all committed sprint and quarterly deliverables',
  'Propose 5 continuous process improvements, successfully launching at least 2 into production',
  'Achieve a 100% zero-missed-deadline record across all critical client and internal commitments',
  'Partner with 5 cross-functional leads to successfully deliver co-owned strategic initiatives',
  'Incorporate 3 newly mastered tools or methodologies to measurably increase project velocity'
];

// Step 7: Key Result — creates 1 KR per Individual OKR stored by the previous step
export async function keyResult() {
  const sheetUserId = getOrgUserIdFromJwt() || state.adminOrgUserId || ''
  if (!sheetUserId) return { ok: false, message: 'Could not read org user ID from session. Please log in.' }

  const parentIds = state.individualOKRIds || []
  if (!parentIds.length) return { ok: false, message: 'No Individual OKRs found — run "Individual OKR" first.' }

  const timePeriodId = state.timePeriodId || null
  const timePeriodStart = state.timePeriodStart || null
  const timePeriodEnd = state.timePeriodEnd || null
  if (!timePeriodId) return { ok: false, message: 'No time period found — run "Create Time Period" first.' }

  const year = new Date().getFullYear()
  const objStart = timePeriodStart || `${year}-01-01`
  const objEnd = timePeriodEnd || `${year}-12-31`

  const created = []
  const createdIds = []
  for (let i = 0; i < parentIds.length; i++) {
    const name = KR_NAMES[i] || `Key Result ${i + 1}`
    const r = await api(`/okr/performance/objective/?sheet_user_id=${sheetUserId}`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        node_type: 'KR',
        category: 'Individual',
        parent_node: parentIds[i],
        time_period: timePeriodId,
        owners: [sheetUserId],
        self_tracker: true,
        visibility: 'PUBLIC',
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
          name: '',
          values: { sign: '%', start_value: 0, target_value: 100 },
        },
      }),
    })
    if (!r.ok) return { ok: false, message: `Created ${created.length}/${parentIds.length}; failed KR ${i + 1} (${r.status})` }
    created.push(name)
    const payload = unwrapPayload(r)
    const krId = Array.isArray(payload) ? payload[0] : (payload?.id || null)
    if (krId) createdIds.push(krId)
    await new Promise(res => setTimeout(res, 200))
  }
  state.individualKRIds = createdIds
  saveState()
  return { ok: true, message: `Created ${created.length} Key Results` }
}

const KR_GROUP_NAMES = [
  'Conduct monthly cross-functional alignment reviews with 100% participation from all partner team leads',
  'Publish real-time group progress dashboards covering 100% of active joint objectives and key milestones',
  'Successfully deliver at least 4 cross-departmental initiatives that achieve 100% of target business metrics',
  'Reduce average cycle time for multi-team operational bottlenecks by 25% through capacity planning',
  'Achieve 95% on-time milestone delivery across all shared group commitments during the review period',
  'Standardize 5 inter-departmental workflows and achieve full adoption across participating teams',
  'Facilitate 6 joint decision-making forums resulting in documented and executed strategic roadmaps',
  'Organize 4 cross-team domain expertise sessions with 90%+ attendance to accelerate knowledge scaling',
  'Increase the group cross-functional synergy rating by 15% in the internal collaboration survey',
  'Achieve 90% completion rate on all high-impact OKR key results co-owned across business units'
];

// Key Result for Group OKRs — creates 1 KR per Group OKR stored by groupOKR()
export async function keyResultGroup() {
  const sheetUserId = getOrgUserIdFromJwt() || state.adminOrgUserId || ''
  if (!sheetUserId) return { ok: false, message: 'Could not read org user ID from session. Please log in.' }

  const parentIds = state.groupOKRIds || []
  if (!parentIds.length) return { ok: false, message: 'No Group OKRs found — run "Group OKR" first.' }

  const timePeriodId = state.timePeriodId || null
  const timePeriodStart = state.timePeriodStart || null
  const timePeriodEnd = state.timePeriodEnd || null
  if (!timePeriodId) return { ok: false, message: 'No time period found — run "Create Time Period" first.' }

  const year = new Date().getFullYear()
  const objStart = timePeriodStart || `${year}-01-01`
  const objEnd = timePeriodEnd || `${year}-12-31`

  const groupId = state.workspaceGroupId || null

  const created = []
  for (let i = 0; i < parentIds.length; i++) {
    const name = KR_GROUP_NAMES[i] || `Group Key Result ${i + 1}`
    const r = await api(`/okr/performance/objective/?sheet_user_id=${sheetUserId}`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        node_type: 'KR',
        category: 'Group',
        parent_node: parentIds[i],
        time_period: timePeriodId,
        groups: groupId ? [groupId] : [],
        owners: [sheetUserId],
        self_tracker: true,
        visibility: 'PUBLIC',
        description: null,
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
          name: '',
          values: { sign: '%', start_value: 0, target_value: 100 },
        },
      }),
    })
    if (!r.ok) return { ok: false, message: `Created ${created.length}/${parentIds.length}; failed Group KR ${i + 1} (${r.status})` }
    created.push(name)
    await new Promise(res => setTimeout(res, 200))
  }
  return { ok: true, message: `Created ${created.length} Group Key Results` }
}

const CHILD_OBJECTIVE_NAMES = [
  'Define clear KPIs and success metrics for all primary daily tasks',
  'Utilize root-cause analysis frameworks to tackle operational friction',
  'Enforce rigorous QA and code/document review standards on all outputs',
  'Establish proactive status update cadences with key internal stakeholders',
  'Conduct post-project audits to identify error patterns and optimize accuracy',
  'Partner actively across departments to align multi-team deliverables',
  'Dynamically adjust sprint backlogs to support shifting enterprise goals',
  'Document operational edge cases early to prevent deployment bottlenecks',
  'Complete specialized skill modules and integrate techniques into live sprints',
  'Monitor personal productivity metrics weekly to ensure continuous SLA compliance',
  'Map individual task outputs directly to high-level departmental OKRs',
  'Apply Eisenhower matrix prioritization to maximize high-leverage focus time',
  'Maintain complete lifecycle ownership of high-priority operational features',
  'Drive solution architecture during joint technical and business reviews',
  'Synthesize operational dataset trends to formulate actionable process recommendations',
  'Streamline individual toolchains to maximize throughput and eliminate redundant steps',
  'Deliver structured, data-backed briefings to internal leadership and peers',
  'Launch targeted process refinements within core daily workflow routines',
  'Incorporate empirical performance logs to guide task estimation and execution',
  'Maintain end-to-end follow-through on all assigned team action items'
];

// Add Child Objective (Individual) — child of each Individual Key Result
export async function addChildObjective() {
  const sheetUserId = getOrgUserIdFromJwt() || state.adminOrgUserId || ''
  if (!sheetUserId) return { ok: false, message: 'Could not read org user ID from session. Please log in.' }

  const parentIds = state.individualOKRIds || []
  if (!parentIds.length) return { ok: false, message: 'No Individual OKRs found — run "Individual OKR" first.' }

  const timePeriodId = state.timePeriodId || null
  const timePeriodStart = state.timePeriodStart || null
  const timePeriodEnd = state.timePeriodEnd || null
  if (!timePeriodId) return { ok: false, message: 'No time period found — run "Create Time Period" first.' }

  const year = new Date().getFullYear()
  const objStart = timePeriodStart || `${year}-01-01`
  const objEnd = timePeriodEnd || `${year}-12-31`

  const created = []
  for (let i = 0; i < parentIds.length; i++) {
    const name = CHILD_OBJECTIVE_NAMES[i] || `Child Objective ${i + 1}`
    const r = await api(`/okr/performance/objective/?sheet_user_id=${sheetUserId}`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        node_type: 'Objective',
        category: 'Individual',
        parent_node: parentIds[i],
        time_period: timePeriodId,
        owners: [sheetUserId],
        self_tracker: true,
        visibility: 'PUBLIC',
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
    if (!r.ok) return { ok: false, message: `Created ${created.length}/${parentIds.length}; failed child objective ${i + 1} (${r.status})` }
    created.push(name)
    await new Promise(res => setTimeout(res, 200))
  }
  return { ok: true, message: `Created ${created.length} Individual Child Objectives` }
}


const GROUPCHILD_OBJECTIVE_NAMES = [
  'Align business unit roadmaps around unified enterprise performance metrics',
  'Deploy real-time visibility dashboards for co-owned cross-departmental OKRs',
  'Synchronize delivery schedules and handoffs across joint-project teams',
  'Harmonize operational standards and protocols across collaborating departments',
  'Assign clear single-threaded leaders for every cross-functional initiative',
  'Eliminate process variations between inter-departmental workflows',
  'Establish structured governance forums to streamline cross-team decision-making',
  'Build a centralized knowledge repository for cross-departmental documentation',
  'Launch joint skill-building workshops to bridge domain knowledge gaps',
  'Monitor quarterly milestone trajectories across all co-owned group goals',
  'Unblock cross-team dependency chains through weekly escalation reviews',
  'Establish dedicated communication channels between interdependent business units',
  'Track operational throughput metrics across shared departmental initiatives',
  'Standardize collaboration software and tooling across participating teams',
  'Conduct bi-weekly progress syncs to validate alignment on shared outcomes',
  'Identify and mitigate cross-functional dependency risks before sprint locks',
  'Optimize joint resource allocation to balance cross-team workload capacity',
  'Highlight and scale successful cross-departmental execution frameworks',
  'Execute actionable retrospective plans after completing multi-team launches',
  'Validate that group-level project deliverables directly feed overarching company targets'
];

// Add Child Objective (Group) — child of each Group Key Result
export async function addChildObjectiveGroup() {
  const sheetUserId = getOrgUserIdFromJwt() || state.adminOrgUserId || ''
  if (!sheetUserId) return { ok: false, message: 'Could not read org user ID from session. Please log in.' }

  const parentIds = state.groupOKRIds || []
  if (!parentIds.length) return { ok: false, message: 'No Group OKRs found — run "Group OKR" in Add Group OKR first.' }

  const timePeriodId = state.timePeriodId || null
  const timePeriodStart = state.timePeriodStart || null
  const timePeriodEnd = state.timePeriodEnd || null
  if (!timePeriodId) return { ok: false, message: 'No time period found — run "Create Time Period" first.' }

  const year = new Date().getFullYear()
  const objStart = timePeriodStart || `${year}-01-01`
  const objEnd = timePeriodEnd || `${year}-12-31`

  const groupId = state.workspaceGroupId || null

  const created = []
  for (let i = 0; i < parentIds.length; i++) {
    const name = GROUPCHILD_OBJECTIVE_NAMES[i] || `Group Child Objective ${i + 1}`
    const r = await api(`/okr/performance/objective/?sheet_user_id=${sheetUserId}`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        node_type: 'Objective',
        category: 'Group',
        parent_node: parentIds[i],
        time_period: timePeriodId,
        groups: groupId ? [groupId] : [],
        owners: [sheetUserId],
        self_tracker: true,
        visibility: 'PUBLIC',
        description: null,
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
    if (!r.ok) return { ok: false, message: `Created ${created.length}/${parentIds.length}; failed group child objective ${i + 1} (${r.status})` }
    created.push(name)
    await new Promise(res => setTimeout(res, 200))
  }
  return { ok: true, message: `Created ${created.length} Group Child Objectives` }
}
