// Node-safe port of addEmployees() from src/modules/users/actions.js, for the Slack
// slash-command proof-of-concept. Shared Klaar/Migadu logic lives in klaarStopgapCore.js.
//
// Ordering dependency: manager_email/hrbp_email below are just constructed strings
// (`${manager_prefix}@${domain}`) — Klaar resolves them server-side by matching an
// existing employee's email, not by UUID. So /create-manager must already have run
// for this workspace (the managers in addManagersJob.js's MANAGERS must actually exist)
// before this job's manager/HRBP links will resolve to anyone real — same ordering
// dependency the browser widget already has between its own "Add Managers" and
// "Add Employees" buttons, just never enforced or checked there either.
import { createAndProfileUsers, runJobAndReply } from './klaarStopgapCore.js'

// The 5 is_manager_role: false records from DUMMY_USERS in src/modules/users/actions.js.
// Kept identical to that file's current values on purpose — see addManagersJob.js's
// MANAGERS comment. manager_prefix/hrbp_prefix here must match MANAGERS' email_prefix values.
export const EMPLOYEES = [
  {
    full_name: 'Rowan Sterling', email_prefix: 'rowan.sterling', phone: '+49 3020958411', gender: 'Non-Binary',
    department: 'Product Management', business_unit: 'Core Platform', title: 'Principal Product Manager', level: 'Org Band 4B',
    location: 'Berlin, Germany', employment_type: 'Full Time', date_of_joining: '2006-05-19',
    manager_prefix: 'talia.winter', hrbp_prefix: 'marcus.vance', is_admin: false, is_hrbp: false,
  },
  {
    full_name: 'Seraphina Lin', email_prefix: 'seraphina.lin', phone: '+81 355558412', gender: 'Female',
    department: 'Data & Analytics', business_unit: 'Enterprise Growth', title: 'Lead Data Scientist', level: 'Org Band 3A',
    location: 'Tokyo, Japan', employment_type: 'Full Time', date_of_joining: '2007-09-03',
    manager_prefix: 'nathaniel.cross', hrbp_prefix: 'marcus.vance', is_admin: false, is_hrbp: false,
  },
  {
    full_name: 'Callum Thorne', email_prefix: 'callum.thorne', phone: '+61 298768413', gender: 'Male',
    department: 'Security & Infrastructure', business_unit: 'Core Platform', title: 'Senior Security Architect', level: 'Org Band 3B',
    location: 'Sydney, Australia', employment_type: 'Full Time', date_of_joining: '2008-01-14',
    manager_prefix: 'talia.winter', hrbp_prefix: 'elena.rostova', is_admin: false, is_hrbp: false,
  },
  {
    full_name: 'Amara Okafor', email_prefix: 'amara.okafor', phone: '+1 4165558414', gender: 'Female',
    department: 'Design & Research', business_unit: 'Commercial', title: 'Senior UX Researcher', level: 'Org Band 2B',
    location: 'Toronto, Canada', employment_type: 'Full Time', date_of_joining: '2009-06-25',
    manager_prefix: 'declan.mercer', hrbp_prefix: 'elena.rostova', is_admin: false, is_hrbp: false,
  },
  {
    full_name: 'Darius Thorne', email_prefix: 'darius.thorne', phone: '+31 205558415', gender: 'Male',
    department: 'Finance & Strategy', business_unit: 'Commercial', title: 'Financial Systems Analyst', level: 'Org Band 2A',
    location: 'Amsterdam, Netherlands', employment_type: 'Full Time', date_of_joining: '2010-11-30',
    manager_prefix: 'declan.mercer', hrbp_prefix: 'marcus.vance', is_admin: false, is_hrbp: false,
  },
];

// Ported from addEmployees() in actions.js, minus: the getWorkspaceDomain() lookup and
// the state.js writes at the end — same deltas as addManagersJob.js.
export async function addEmployeesJob() {
  const r = await createAndProfileUsers(EMPLOYEES)
  if (!r.ok) return r // domain-not-set guard from createAndProfileUsers

  const allFailed = [...r.failed, ...r.updateFailed]
  if (allFailed.length) return { ok: false, message: `Created ${r.created.length}/${r.total} employees, updated ${r.updated.length}/${r.total} profiles. Failed: ${allFailed.join(', ')}` }
  return { ok: true, message: `Created ${r.created.length} employees + updated ${r.updated.length} profiles on ${r.domain}.` }
}

export async function runAddEmployeesJob({ response_url }) {
  await runJobAndReply(addEmployeesJob, response_url)
}
