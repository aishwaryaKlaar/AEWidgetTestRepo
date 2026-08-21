// Node-safe port of bulkUploadGroup() from src/modules/users/actions.js, for the Slack
// slash-command proof-of-concept. Shared Klaar logic lives in klaarStopgapCore.js.
//
// Unlike addGroupJob (which only groups the 10 known managers/employees), this uses
// EVERY employee currently in the workspace as candidate members — matching the
// browser's own bulkUploadGroup() fallback fetch (src/modules/users/actions.js:847)
// when it has no state.bulkUsers to fall back on, which is always true for us since we
// have no shared state at all.
//
// Admin identity: same approach as addGroupJob — see that file's comment for why we use
// the is_admin-flagged MANAGERS record instead of a real admin's JWT.
import { getStopgapDomain, createGroup, fetchAllEmployees, resolveAdminIdentity, runJobAndReply } from './klaarStopgapCore.js'
import { MANAGERS } from './addManagersJob.js'

// The 25 group names from BULK_GROUP_NAMES in src/modules/users/actions.js:771-797.
const BULK_GROUP_NAMES = [
  'Applied Foundation Models & Reasoning Systems',
  'Decentralized Trust, ZK Proofs & Ledger Fabrics',
  'Hyperscale Compute Fleet & Kernel Optimization',
  'Neuromorphic Sensing & Spatial Intelligence',
  'Synthetic Media Provenance & Content Authenticity',
  'Automated Threat Modeling & Supply Chain Attestation',
  'Micro-Frontend Architecture & Edge Runtime Engines',
  'Autonomous Telemetry Fabric & Anomaly Forensics',
  'Post-Quantum Infrastructure Migration & Key Management',
  'Algorithmic Pricing Dynamics & Revenue Sciences',
  'Digital Twin Simulation & Industrial Telematics',
  'Developer Friction Eradication & Tooling Labs',
  'Enterprise Vector Indexing & Semantic Retrieval Mesh',
  'Privacy-Preserving Computation & Federated Learning',
  'Continuous Software Bill of Materials (SBOM) Auditing',
  'Cross-Cloud Storage Replication & Data Sovereignty',
  'Low-Latency Streaming Data & Event-Driven Backbone',
  'Resilience Engineering & Automated Traffic Shedding',
  'Unified Customer Graph & Behavioral Telemetry',
  'Next-Gen Identity Federation & Attestation Services',
  'Zero-Copy Serialization & Inter-Process Messaging',
  'Adaptive Access Proxies & Continuous Authorization',
  'Dynamic Capacity Planning & Spot Orchestration',
  'Embedded System Microkernels & Hardware Verification',
  'Asynchronous Organizational Knowledge & RFC Workflows',
];

// Ported from bulkUploadGroup() in actions.js, minus the state.js read/write.
export async function bulkUploadGroupJob() {
  const { domain, error } = getStopgapDomain()
  if (error) return error

  const members = await fetchAllEmployees()
  if (!members.length) {
    return { ok: false, message: 'No users found in this workspace. Run /bulk-upload-user (or /create-manager) first so groups have members to assign.' }
  }

  const admin = resolveAdminIdentity(MANAGERS, domain, members)
  if (admin.error) return { ok: false, message: admin.error }
  const { adminEmail, adminOrgUserId } = admin

  const created = [], failed = []

  for (let i = 0; i < BULK_GROUP_NAMES.length; i++) {
    const name = BULK_GROUP_NAMES[i]

    // Each group gets 6 members, rotating through all known users
    const groupSize = Math.min(6, members.length)
    const groupMembers = []
    for (let j = 0; j < groupSize; j++) {
      groupMembers.push(members[(i + j) % members.length])
    }

    const result = await createGroup(name, groupMembers, adminEmail, adminOrgUserId)
    if (result.ok) {
      created.push({ name, existing: result.existing })
    } else {
      failed.push(`${name} (${result.status})`)
    }
  }

  if (failed.length) {
    return { ok: false, message: `Created ${created.length}/${BULK_GROUP_NAMES.length}, failed: ${failed.join(', ')}` }
  }
  return {
    ok: true,
    message: `Created ${created.length} groups: ${created.slice(0, 5).map(g => g.name).join(', ')}… and ${created.length - 5} more`,
  }
}

export async function runBulkUploadGroupJob({ response_url }) {
  await runJobAndReply(bulkUploadGroupJob, response_url)
}
