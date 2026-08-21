// Node-safe port of bulkUploadUser() from src/modules/users/actions.js, for the Slack
// slash-command proof-of-concept. Shared Klaar/Migadu logic lives in klaarStopgapCore.js.
//
// Deliberately NOT built on createAndProfileUsers() (used by addManagersJob/addEmployeesJob):
// this flow sends department/business_unit inline on the create POST itself and never does
// a follow-up profile PUT at all — a genuinely simpler, one-shot shape than the managers/
// employees flow, matching the original bulkUploadUser()'s own behavior exactly.
import { getStopgapDomain, createMailbox, klaarApi, resolveCreatedUuid, errorBodyText, runJobAndReply } from './klaarStopgapCore.js'

const DEPTS = ['Corporate Strategy', 'Talent Management', 'Operations', 'Business Development']
const BUS   = ['Enterprise Growth', 'People & Culture', 'Commercial']

// The 25 generic bulk users from BULK_USERS in src/modules/users/actions.js:327-353.
const BULK_USERS = [
  { full_name: 'Althea Vance',       email_prefix: 'althea.vance',       department: DEPTS[0], business_unit: BUS[0] },
  { full_name: 'Benton Cross',        email_prefix: 'benton.cross',        department: DEPTS[1], business_unit: BUS[1] },
  { full_name: 'Cassia Linwood',      email_prefix: 'cassia.linwood',      department: DEPTS[2], business_unit: BUS[2] },
  { full_name: 'Dorian Sterling',     email_prefix: 'dorian.sterling',     department: DEPTS[3], business_unit: BUS[0] },
  { full_name: 'Evander Hayes',       email_prefix: 'evander.hayes',       department: DEPTS[0], business_unit: BUS[1] },
  { full_name: 'Farrah Sinclair',     email_prefix: 'farrah.sinclair',     department: DEPTS[1], business_unit: BUS[2] },
  { full_name: 'Gareth Thorne',       email_prefix: 'gareth.thorne',       department: DEPTS[2], business_unit: BUS[0] },
  { full_name: 'Hesperia Cole',       email_prefix: 'hesperia.cole',       department: DEPTS[3], business_unit: BUS[1] },
  { full_name: 'Ignatius Drake',      email_prefix: 'ignatius.drake',      department: DEPTS[0], business_unit: BUS[2] },
  { full_name: 'Jessamine Baird',     email_prefix: 'jessamine.baird',     department: DEPTS[1], business_unit: BUS[0] },
  { full_name: 'Kenelm Porter',       email_prefix: 'kenelm.porter',       department: DEPTS[2], business_unit: BUS[1] },
  { full_name: 'Lucinda Valen',       email_prefix: 'lucinda.valen',       department: DEPTS[3], business_unit: BUS[2] },
  { full_name: 'Merrick Vance',       email_prefix: 'merrick.vance',       department: DEPTS[0], business_unit: BUS[0] },
  { full_name: 'Nerissa Calder',      email_prefix: 'nerissa.calder',      department: DEPTS[1], business_unit: BUS[1] },
  { full_name: 'Oberon Finch',        email_prefix: 'oberon.finch',        department: DEPTS[2], business_unit: BUS[2] },
  { full_name: 'Petra Holloway',      email_prefix: 'petra.holloway',      department: DEPTS[3], business_unit: BUS[0] },
  { full_name: 'Quintus Rayne',       email_prefix: 'quintus.rayne',       department: DEPTS[0], business_unit: BUS[1] },
  { full_name: 'Rosalind Mercer',     email_prefix: 'rosalind.mercer',     department: DEPTS[1], business_unit: BUS[2] },
  { full_name: 'Soren Faulkner',      email_prefix: 'soren.faulkner',      department: DEPTS[2], business_unit: BUS[0] },
  { full_name: 'Theodora Ward',       email_prefix: 'theodora.ward',       department: DEPTS[3], business_unit: BUS[1] },
  { full_name: 'Urban Blackwell',     email_prefix: 'urban.blackwell',     department: DEPTS[0], business_unit: BUS[2] },
  { full_name: 'Vivienne St. George', email_prefix: 'vivienne.stgeorge',   department: DEPTS[1], business_unit: BUS[0] },
  { full_name: 'Wyatt Winslow',       email_prefix: 'wyatt.winslow',       department: DEPTS[2], business_unit: BUS[1] },
  { full_name: 'Xavier Tremaine',     email_prefix: 'xavier.tremaine',     department: DEPTS[3], business_unit: BUS[2] },
  { full_name: 'Yvaine Lockwood',     email_prefix: 'yvaine.lockwood',     department: DEPTS[0], business_unit: BUS[0] },
];

// Ported from bulkUploadUser() in actions.js, minus the getWorkspaceDomain() lookup and
// the state.js write at the end.
export async function bulkUploadUserJob() {
  const { domain, error } = getStopgapDomain()
  if (error) return error

  const created = [], failed = []

  for (let i = 0; i < BULK_USERS.length; i++) {
    const u     = BULK_USERS[i]
    const email = `${u.email_prefix}@${domain}`

    await createMailbox(domain, u.email_prefix, u.full_name)

    const r = await klaarApi('/um/accounts/employee/', {
      method: 'POST',
      body: JSON.stringify({
        data: [{
          full_name:           u.full_name,
          email,
          title:               null,
          department:          u.department,
          business_unit:       u.business_unit,
          status:              'active',
          verification_status: 'active',
        }],
        send_mail:   false,
        single_mode: true,
      }),
    })

    if (r.ok) {
      const uuid = await resolveCreatedUuid(r, email)
      created.push({ full_name: u.full_name, email, uuid })
    } else {
      const body = errorBodyText(r)
      if (r.status === 400 && (body.includes('exist') || body.includes('already'))) {
        const uuid = await resolveCreatedUuid(null, email)
        created.push({ full_name: u.full_name, email, uuid, existing: true })
      } else {
        failed.push(`${u.full_name} (${r.status})`)
      }
    }
  }

  if (failed.length) {
    return { ok: false, message: `Created ${created.length}/${BULK_USERS.length}, failed: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}` }
  }
  return { ok: true, message: `Bulk uploaded ${created.length} users on ${domain}` }
}

export async function runBulkUploadUserJob({ response_url }) {
  await runJobAndReply(bulkUploadUserJob, response_url)
}
