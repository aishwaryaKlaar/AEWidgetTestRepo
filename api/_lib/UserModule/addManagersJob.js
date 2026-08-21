// Node-safe port of addManagers() from src/modules/users/actions.js, for the Slack
// slash-command proof-of-concept. Shared Klaar/Migadu logic lives in klaarStopgapCore.js.
import { createAndProfileUsers, runJobAndReply } from './klaarStopgapCore.js'

// The 5 is_manager_role: true records from DUMMY_USERS in src/modules/users/actions.js.
// Kept identical to that file's current values on purpose (per explicit decision): whether
// managers are created via the widget in a browser or via /create-manager in Slack, the
// same data must come out — so this is a manual sync point, not an independent data set.
// addEmployeesJob.js's EMPLOYEES.manager_prefix/hrbp_prefix values assume these exact names.
export const MANAGERS = [
  {
    full_name: 'Alistair Montgomery', email_prefix: 'alistair.montgomery', phone: '+1 6505557401', gender: 'Male',
    department: 'Executive Leadership', business_unit: 'Core Platform', title: 'Chief Technology Officer', level: 'Org Band 8A',
    location: 'Seattle, USA', employment_type: 'Full Time', date_of_joining: '1991-04-10',
    manager_prefix: null, hrbp_prefix: 'talia.winter', is_admin: false, is_hrbp: false,
  },
  {
    full_name: 'Talia Winter', email_prefix: 'talia.winter', phone: '+44 1618557402', gender: 'Female',
    department: 'People Operations', business_unit: 'Core Platform', title: 'VP, People & Organization', level: 'Org Band 7A',
    location: 'Manchester, UK', employment_type: 'Full Time', date_of_joining: '1993-09-14',
    manager_prefix: 'alistair.montgomery', hrbp_prefix: null, is_admin: true, is_hrbp: true,
  },
  {
    full_name: 'Declan Mercer', email_prefix: 'declan.mercer', phone: '+65 67897403', gender: 'Male',
    department: 'Product & Design', business_unit: 'Commercial', title: 'Chief Product Officer', level: 'Org Band 7A',
    location: 'Singapore, Singapore', employment_type: 'Full Time', date_of_joining: '1995-12-01',
    manager_prefix: 'alistair.montgomery', hrbp_prefix: 'talia.winter', is_admin: false, is_hrbp: false,
  },
  {
    full_name: 'Elena Rostova', email_prefix: 'elena.rostova', phone: '+49 8920557404', gender: 'Female',
    department: 'Infrastructure & Security', business_unit: 'Core Platform', title: 'VP, Cloud Operations', level: 'Org Band 6A',
    location: 'Munich, Germany', employment_type: 'Full Time', date_of_joining: '1998-03-27',
    manager_prefix: 'alistair.montgomery', hrbp_prefix: 'marcus.vance', is_admin: false, is_hrbp: false,
  },
  {
    full_name: 'Marcus Vance', email_prefix: 'marcus.vance', phone: '+91 2245677405', gender: 'Male',
    department: 'Talent & Organizational Development', business_unit: 'Enterprise Growth', title: 'Director, Talent Management', level: 'Org Band 5A',
    location: 'Mumbai, India', employment_type: 'Full Time', date_of_joining: '2000-06-18',
    manager_prefix: 'talia.winter', hrbp_prefix: null, is_admin: false, is_hrbp: true,
  },
];

// Ported from addManagers() in actions.js, minus: the getWorkspaceDomain() lookup (no
// JWT/localStorage server-side — domain comes from an env var instead) and the state.js
// writes at the end (nothing in this POC reads them back). Migadu mailbox creation IS
// included (unlike the browser's conditional `if (state.emailDomain)`, this always runs
// it, since KLAAR_STOPGAP_EMAIL_DOMAIN is only ever set to an already-activated domain).
export async function addManagersJob() {
  const r = await createAndProfileUsers(MANAGERS)
  if (!r.ok) return r // domain-not-set guard from createAndProfileUsers

  const allFailed = [...r.failed, ...r.updateFailed]
  if (allFailed.length) return { ok: false, message: `Created ${r.created.length}/${r.total} managers, updated ${r.updated.length}/${r.total} profiles. Failed: ${allFailed.join(', ')}` }
  return { ok: true, message: `Created ${r.created.length} managers + updated ${r.updated.length} profiles on ${r.domain}.` }
}

export async function runAddManagersJob({ response_url }) {
  await runJobAndReply(addManagersJob, response_url)
}
