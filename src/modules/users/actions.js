import { api, getWorkspaceId, getEmailFromJwt, getAdminUserIdFromJwt, getOrgUserIdFromJwt, API_BASE, buildHeaders } from '../../core/api.js'
import { state, saveState } from '../../core/state.js'
import { buildEmployeePayload, findUserByName, notImplemented, errorBodyText, searchResults } from '../../core/helpers.js'
import { fetchUsers } from '../../utils/fetchUsers.js'
import { fetchGroups } from '../../utils/fetchGroups.js'
import { setupCloudflareSubdomain } from '../../core/cloudflare.js'
import { ensureMigaduDomain, activateMigaduDomain, createMigaduMailbox } from '../../core/migadu.js'

const DUMMY_ROLES = [
  'Autonomous Systems Strategist',
  'Workforce Transformation Director',
  'Telemetry & Observability Specialist',
  'Revenue Operations & Pricing Lead',
  'Distributed Infrastructure Architect',
  'API Governance & Standards Principal',
];

// Step 3: Add Roles — creates 6 HR workspace roles
// On app.klaarhq.com, role creation requires department + business_unit IDs in params[].
export async function addRoles() {
  const deptNames = state.userDepartments  || []
  const buNames   = state.userBusinessUnits || []

  // Always fetch fresh IDs from the meta endpoint — no state dependency
  async function fetchParamIds(paramType, nameFilter) {
    const ids = []
    let page = 1
    while (ids.length < 6) {
      const r = await api(`/um/accounts/workspace_role/meta/param/value/?param_type=${paramType}&page_size=50&page=${page}`)
      const pageResults = r.ok ? searchResults(r) : []
      if (!pageResults.length) break
      const matched = pageResults
        .filter(d => !nameFilter.length || nameFilter.includes(d.value))
        .map(d => d.id).filter(Boolean)
      ids.push(...matched)
      if (!(r.data?.data?.next || r.data?.next) || ids.length >= 6) break
      page++
    }
    return ids
  }

  const deptIds = await fetchParamIds('department',    deptNames)
  const buIds   = await fetchParamIds('business_unit', buNames)

  console.log('[addRoles] deptIds:', deptIds.length, deptIds.slice(0, 3), '| buIds:', buIds.length, buIds.slice(0, 3))

  const created = []
  const failed  = []

  for (let i = 0; i < DUMMY_ROLES.length; i++) {
    const name   = DUMMY_ROLES[i]
    const params = []

    if (deptIds.length) {
      params.push({ param_type: 'department',    param_condition: 'list', param_values: [deptIds[i % deptIds.length]] })
    }
    if (buIds.length) {
      params.push({ param_type: 'business_unit', param_condition: 'list', param_values: [buIds[i % buIds.length]] })
    }

    const r = await api('/um/accounts/workspace_role/', {
      method: 'POST',
      body: JSON.stringify({ name, params }),
    })
    console.log(`[addRoles] "${name}" → ${r.status}`, r.data || r.text?.slice(0, 120))
    if (r.ok) {
      const id = r.data?.id || r.data?.data?.id
      created.push({ name, id })
    } else {
      const body = errorBodyText(r)
      if (r.status === 400 && body.includes('exist')) {
        created.push({ name, id: null, existing: true })
      } else {
        failed.push(`${name} (${r.status})`)
      }
    }
  }

  state.workspaceRoles = created
  saveState()

  if (failed.length) {
    return { ok: false, message: `Created ${created.length}, failed: ${failed.join(', ')}` }
  }
  return {
    ok: true,
    message: `Added ${created.length} roles: ${created.map(r => r.name).join(', ')}`,
  }
}

const SEED_RELATIONSHIPS = {
  'gabriella.brooks':  { hrbp_email_localpart: 'olivia.johnson', pmm_email_localpart: '' },
  'olivia.johnson':    { hrbp_email_localpart: '',               pmm_email_localpart: 'philip.neumann' },
  'olivia.raton':      { hrbp_email_localpart: '',               pmm_email_localpart: '' },
  'ahed.serhal':       { hrbp_email_localpart: 'olivia.johnson', pmm_email_localpart: '' },
  'philip.neumann':    { hrbp_email_localpart: 'olivia.raton',   pmm_email_localpart: '' },
  'xi.ling':           { hrbp_email_localpart: 'olivia.raton',   pmm_email_localpart: 'olivia.johnson' },
  'alex.richards':     { hrbp_email_localpart: '',               pmm_email_localpart: '' },
  'alicia.rodriguez':  { hrbp_email_localpart: '',               pmm_email_localpart: 'olivia.johnson' },
  'anish.sharma':      { hrbp_email_localpart: 'olivia.johnson', pmm_email_localpart: '' },
}

const SEED_DETAILS = {
  'olivia.johnson':   { mobile_number: '+16124123411', grade: '' },
  'ahed.serhal':      { mobile_number: '+16124123412', grade: 'Org Band 4A' },
  'alex.richards':    { mobile_number: '+16124123413', grade: 'Org Band 3A' },
  'alicia.rodriguez': { mobile_number: '+16124123414', grade: 'Org Band 2B' },
  'anish.sharma':     { mobile_number: '+16124123415', grade: 'Org Band 7A' },
  'gabriella.brooks': { mobile_number: '+16124123416', grade: 'Org Band 8A' },
  'olivia.raton':     { mobile_number: '+16124123417', grade: 'Org Band 5A' },
  'philip.neumann':   { mobile_number: '+16124123418', grade: 'Org Band 6A' },
  'xi.ling':          { mobile_number: '+16124123419', grade: 'Org Band 3A' },
}

// is_manager_role: true  → created + PUT with full profile by addManagers() (4 users)
// is_manager_role: false → created + PUT with full profile by addEmployees() (6 users)
const DUMMY_USERS = [
  { 
    full_name: 'Barnaby Sterling', 
    email_prefix: 'barnaby.sterling', 
    phone: '+1 4155553301', 
    gender: 'Male',
    department: 'Executive Office', 
    business_unit: 'Commercial',
    title: 'Chief Executive Officer',
    level: 'Org Band 8A', 
    location: 'San Francisco, USA', 
    employment_type: 'Full Time',
    date_of_joining: '1990-04-18', 
    manager_prefix: null, 
    hrbp_prefix: 'clara.pemberton',
    is_admin: false, 
    is_hrbp: false, 
    is_manager_role: true 
  },
  { 
    full_name: 'Clara Pemberton', 
    email_prefix: 'clara.pemberton', 
    phone: '+1 2125553302',  
    gender: 'Female',
    department: 'People & Culture', 
    business_unit: 'Commercial', 
    title: 'Chief People Officer',
    level: 'Org Band 7A', 
    location: 'New York, USA',  
    employment_type: 'Full Time',
    date_of_joining: '1992-08-22',  
    manager_prefix: 'barnaby.sterling', 
    hrbp_prefix: null,
    is_admin: true, 
    is_hrbp: true, 
    is_manager_role: true 
  },
  { 
    full_name: 'Dominic Croft',  
    email_prefix: 'dominic.croft',  
    phone: '+44 2079463303', 
    gender: 'Male',
    department: 'Sales',            
    business_unit: 'Commercial', 
    title: 'Chief Revenue Officer',
    level: 'Org Band 7A', 
    location: 'London, UK',        
    employment_type: 'Full Time',
    date_of_joining: '1995-11-14',  
    manager_prefix: 'barnaby.sterling', 
    hrbp_prefix: 'clara.pemberton',
    is_admin: false, 
    is_hrbp: false, 
    is_manager_role: true 
  },
  { 
    full_name: 'Eleanor Vance', 
    email_prefix: 'eleanor.vance', 
    phone: '+91 8045673304', 
    gender: 'Female',
    department: 'Engineering',        
    business_unit: 'Enterprise Growth',
    title: 'VP, Engineering',
    level: 'Org Band 6A', 
    location: 'Bengaluru, India',  
    employment_type: 'Full Time',
    date_of_joining: '1997-06-03',  
    manager_prefix: 'barnaby.sterling', 
    hrbp_prefix: 'felix.kensington',
    is_admin: false, 
    is_hrbp: false, 
    is_manager_role: true 
  },
  { 
    full_name: 'Felix Kensington',  
    email_prefix: 'felix.kensington',   
    phone: '+971 45553305',  
    gender: 'Male',
    department: 'People & Culture - BU2',  
    business_unit: 'Enterprise Growth',
    title: 'Director, People & Culture',
    level: 'Org Band 5A',  
    location: 'Dubai, UAE',        
    employment_type: 'Full Time',
    date_of_joining: '1999-02-17',  
    manager_prefix: 'clara.pemberton',     
    hrbp_prefix: null,
    is_admin: false, 
    is_hrbp: true, 
    is_manager_role: true 
  },
  { 
    full_name: 'Gemma Blackwood',    
    email_prefix: 'gemma.blackwood',    
    phone: '+44 2079463306', 
    gender: 'Female',
    department: 'Sales',            
    business_unit: 'Commercial', 
    title: 'Director, Account Management',
    level: 'Org Band 4A', 
    location: 'London, UK',        
    employment_type: 'Full Time',
    date_of_joining: '2001-05-19',  
    manager_prefix: 'dominic.croft',      
    hrbp_prefix: 'clara.pemberton',
    is_admin: false, 
    is_hrbp: false, 
    is_manager_role: false 
  },
  { 
    full_name: 'Harrison Drake',    
    email_prefix: 'harrison.drake',    
    phone: '+65 81233307',    
    gender: 'Male',
    department: 'Engineering',        
    business_unit: 'Enterprise Growth',
    title: 'Staff Engineer',
    level: 'Org Band 3B', 
    location: 'Singapore, Singapore', 
    employment_type: 'Full Time',
    date_of_joining: '2002-11-25',  
    manager_prefix: 'eleanor.vance',        
    hrbp_prefix: 'felix.kensington',
    is_admin: false, 
    is_hrbp: false, 
    is_manager_role: false 
  },
  { 
    full_name: 'Imogen Ashford',      
    email_prefix: 'imogen.ashford',      
    phone: '+1 2125553308',  
    gender: 'Female',
    department: 'Sales',            
    business_unit: 'Commercial', 
    title: 'Account Executive',
    level: 'Org Band 2B', 
    location: 'New York, USA',    
    employment_type: 'Full Time',
    date_of_joining: '2003-09-08',  
    manager_prefix: 'dominic.croft',      
    hrbp_prefix: 'clara.pemberton',
    is_admin: false, 
    is_hrbp: false, 
    is_manager_role: false 
  },
  { 
    full_name: 'Julian Finch',  
    email_prefix: 'julian.finch',  
    phone: '+91 8045673309',  
    gender: 'Male',
    department: 'Engineering',        
    business_unit: 'Enterprise Growth',
    title: 'Software Engineer II',
    level: 'Org Band 2A', 
    location: 'Bengaluru, India',  
    employment_type: 'Full Time',
    date_of_joining: '2004-07-12',  
    manager_prefix: 'eleanor.vance',        
    hrbp_prefix: 'felix.kensington',
    is_admin: false, 
    is_hrbp: false, 
    is_manager_role: false 
  },
  { 
    full_name: 'Kira Holloway',     
    email_prefix: 'kira.holloway',     
    phone: '+971 45553310',  
    gender: 'Female',
    department: 'People & Culture - BU2',  
    business_unit: 'Enterprise Growth',
    title: 'People Ops Associate',
    level: 'Org Band 1B', 
    location: 'Dubai, UAE',        
    employment_type: 'Full Time',
    date_of_joining: '2005-03-29',  
    manager_prefix: 'felix.kensington',      
    hrbp_prefix: 'felix.kensington',
    is_admin: false, 
    is_hrbp: false, 
    is_manager_role: false 
  }
];

// Resolve workspace email domain without depending on bulkUploadUser.
// Priority: 1) JWT payload email  2) state.adminEmail (set by bulkUploadUser)
// 3) single lightweight API call to fetch one user record
async function getWorkspaceDomain() {
  // Try JWT first — zero API calls, instant
  const jwtEmail = getEmailFromJwt()
  if (jwtEmail && jwtEmail.includes('@')) return jwtEmail.split('@')[1]

  // Try state (set if bulkUploadUser ran earlier)
  if (state.adminEmail && state.adminEmail.includes('@')) return state.adminEmail.split('@')[1]

  // Fall back: fetch just 1 user record from the workspace
  const r = await api('/um/accounts/employee/?page=1&page_size=1')
  const results = r.ok ? searchResults(r) : []
  if (results.length) {
    const email = results[0]?.user?.email
    if (email && email.includes('@')) return email.split('@')[1]
  }

  return null
}

// 25 generic users for bulk creation — different from the 7 seed users in addUser()

const DEPTS = ['Corporate Strategy', 'Talent Management', 'Operations', 'Business Development']
const BUS   = ['Enterprise Growth', 'People & Culture', 'Commercial']

const BULK_USERS = [
  { full_name: 'Arthur Albright',       email_prefix: 'arthur.albright',       department: DEPTS[0], business_unit: BUS[0] },
  { full_name: 'Blythe Callahan',       email_prefix: 'blythe.callahan',       department: DEPTS[1], business_unit: BUS[1] },
  { full_name: 'Callum Devereux',       email_prefix: 'callum.devereux',       department: DEPTS[2], business_unit: BUS[2] },
  { full_name: 'Delphine Holloway',     email_prefix: 'delphine.holloway',     department: DEPTS[3], business_unit: BUS[0] },
  { full_name: 'Evander Thorne',        email_prefix: 'evander.thorne',        department: DEPTS[0], business_unit: BUS[1] },
  { full_name: 'Flora Macallister',     email_prefix: 'flora.macallister',     department: DEPTS[1], business_unit: BUS[2] },
  { full_name: 'Griffin Beaumont',      email_prefix: 'griffin.beaumont',      department: DEPTS[2], business_unit: BUS[0] },
  { full_name: 'Helena Kingsley',       email_prefix: 'helena.kingsley',       department: DEPTS[3], business_unit: BUS[1] },
  { full_name: 'Inigo Sutherland',      email_prefix: 'inigo.sutherland',      department: DEPTS[0], business_unit: BUS[2] },
  { full_name: 'Jocelyn Faulkner',      email_prefix: 'jocelyn.faulkner',      department: DEPTS[1], business_unit: BUS[0] },
  { full_name: 'Killian Drake',         email_prefix: 'killian.drake',         department: DEPTS[2], business_unit: BUS[1] },
  { full_name: 'Leona Sinclair',        email_prefix: 'leona.sinclair',        department: DEPTS[3], business_unit: BUS[2] },
  { full_name: 'Miles Huntington',      email_prefix: 'miles.huntington',      department: DEPTS[0], business_unit: BUS[0] },
  { full_name: 'Nerissa Carlisle',      email_prefix: 'nerissa.carlisle',      department: DEPTS[1], business_unit: BUS[1] },
  { full_name: 'Octavius Brandt',       email_prefix: 'octavius.brandt',       department: DEPTS[2], business_unit: BUS[2] },
  { full_name: 'Philippa Lancaster',    email_prefix: 'philippa.lancaster',    department: DEPTS[3], business_unit: BUS[0] },
  { full_name: 'Quillan Voss',          email_prefix: 'quillan.voss',          department: DEPTS[0], business_unit: BUS[1] },
  { full_name: 'Rosalind Fairweather',  email_prefix: 'rosalind.fairweather',  department: DEPTS[1], business_unit: BUS[2] },
  { full_name: 'Sebastian Valerius',    email_prefix: 'sebastian.valerius',    department: DEPTS[2], business_unit: BUS[0] },
  { full_name: 'Theodora Lockhart',     email_prefix: 'theodora.lockhart',     department: DEPTS[3], business_unit: BUS[1] },
  { full_name: 'Uriah Pendleton',       email_prefix: 'uriah.pendleton',       department: DEPTS[0], business_unit: BUS[2] },
  { full_name: 'Vivienne Strathmore',   email_prefix: 'vivienne.strathmore',   department: DEPTS[1], business_unit: BUS[0] },
  { full_name: 'Warren Ashcroft',       email_prefix: 'warren.ashcroft',       department: DEPTS[2], business_unit: BUS[1] },
  { full_name: 'Xavier Tremaine',       email_prefix: 'xavier.tremaine',       department: DEPTS[3], business_unit: BUS[2] },
  { full_name: 'Yvette Montclaire',     email_prefix: 'yvette.montclaire',     department: DEPTS[0], business_unit: BUS[0] },
];

// Step 1: Bulk Upload User — creates 25 dummy users one by one (single_mode: true)
// Batch mode (single_mode: false) returns 200 but silently skips users on some envs.
export async function bulkUploadUser() {
  const domain = state.emailDomain || await getWorkspaceDomain()
  if (!domain) return { ok: false, message: 'Could not determine workspace email domain. Please ensure you are logged in.' }

  const created = []
  const failed  = []

  for (let i = 0; i < BULK_USERS.length; i++) {
    const u     = BULK_USERS[i]
    const email = `${u.email_prefix}@${domain}`

    // Create real Migadu mailbox (non-blocking — Klaar creation continues even if this fails)
    if (state.emailDomain) {
      await createMigaduMailbox(domain, u.email_prefix, u.full_name)
    }

    const r = await api('/um/accounts/employee/', {
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

    if (i === 0) console.log('[bulkUploadUser] first response:', r.status, (r.text || '').slice(0, 300))

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

  state.bulkUsers = created
  saveState()

  if (failed.length) {
    return { ok: false, message: `Created ${created.length}/${BULK_USERS.length}, failed: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}` }
  }
  return {
    ok: true,
    message: `Bulk uploaded ${created.length} users on ${domain}`,
  }
}

// Step 2 (optional): Setup Demo Domain — creates slug.klaar.team in CF + Migadu before adding users
export async function setupDemoDomain() {
  const GENERIC_DOMAINS = new Set(['gmail', 'outlook', 'hotmail', 'yahoo', 'icloud', 'protonmail'])
  let slug
  const jwtEmail = getEmailFromJwt()
  if (jwtEmail && jwtEmail.includes('@')) {
    const emailDomainPart = jwtEmail.split('@')[1]
    if (emailDomainPart.endsWith('.klaar.team')) {
      // e.g. deepa.nayak@omicron.klaar.team → slug = 'omicron'
      slug = emailDomainPart.replace(/\.klaar\.team$/, '').split('.').pop()
    } else {
      const domainParts = emailDomainPart.split('.')
      const company = domainParts.length >= 2 ? domainParts[domainParts.length - 2] : domainParts[0]
      const RESERVED = new Set(['klaar', 'klaarhq', 'gmail', 'outlook', 'hotmail', 'yahoo', 'icloud', 'protonmail'])
      if (RESERVED.has(company.toLowerCase())) {
        slug = jwtEmail.split('@')[0].replace(/[^a-z0-9]/gi, '-').toLowerCase()
      } else {
        slug = company.replace(/[^a-z0-9]/gi, '-').toLowerCase()
      }
    }
  } else {
    const h = location.hostname
    const parts = h.split('.')
    if (parts.length >= 3 && parts[parts.length - 2] === 'klaarhq') {
      slug = parts[0]
    } else {
      slug = h.replace(/[^a-z0-9]/gi, '-').toLowerCase()
    }
  }

  const emailDomain = `${slug}.klaar.team`

  // Step 1: Create Migadu domain + get DNS records it needs
  const migaduResult = await ensureMigaduDomain(emailDomain)
  console.log('[setup] Migadu ensure_domain:', JSON.stringify(migaduResult, null, 2))
  if (!migaduResult.ok) {
    return { ok: false, message: `Migadu domain setup failed: ${migaduResult.error || 'unknown error'}` }
  }

  // Step 2: Push ALL DNS records to Cloudflare (MX + SPF + 3 DKIM CNAMEs + DMARC + dns_verification)
  const cfResult = await setupCloudflareSubdomain(slug, migaduResult.dnsRecords)
  console.log('[setup] Cloudflare setup_subdomain:', JSON.stringify(cfResult, null, 2))

  // Step 2b: List what's actually in Cloudflare now (for debugging)
  try {
    const listResult = await fetch(`${import.meta.env.VITE_PROXY_BASE || ''}/api/cloudflare`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_records', subdomain: slug }),
    })
    const listData = await listResult.json()
    console.log('[setup] Cloudflare records for', emailDomain, ':', JSON.stringify(listData.records, null, 2))
  } catch (_) {}

  // Step 3: Activate Migadu domain now that DNS is set (best-effort)
  const activateResult = await activateMigaduDomain(emailDomain)
  console.log('[setup] Migadu activate:', JSON.stringify(activateResult, null, 2))

  state.emailDomain = emailDomain
  saveState()

  const cfNote = !cfResult.ok ? ` Cloudflare warning: ${cfResult.error || 'some DNS records failed'}.` : ''
  if (!activateResult?.ok && activateResult?.error === 'dns_check_failed') {
    return {
      ok: true,
      message: `Domain ${emailDomain} registered but DNS is still propagating (${activateResult.checks ? Object.entries(activateResult.checks).filter(([,v]) => v === 'error').map(([k]) => k).join(', ') + ' failed' : 'checks failed'}). Wait 5–10 min then run Setup Demo Domain again before adding users.${cfNote}`,
    }
  }
  const note = cfNote || (!activateResult?.ok ? ` Migadu activation warning: ${activateResult?.error || 'unknown'}.` : '')
  return {
    ok: true,
    message: `Demo domain ${emailDomain} is ready.${note} Users will get real mailboxes at @${emailDomain}.`,
  }
}

// Fetch a param_type's value→UUID map (e.g. business_unit, level, location) — plain
// strings in PUT fields cause 500, so callers validate against this before sending.
async function fetchParamMap(paramType) {
  const map = {}
  try {
    let page = 1
    while (true) {
      const r = await api(`/um/accounts/workspace_role/meta/param/value/?param_type=${paramType}&page_size=50&page=${page}`)
      if (!r.ok || !r.data?.results?.length) break
      for (const rec of r.data.results) {
        if (rec.value && rec.id) map[rec.value] = rec.id
      }
      if (!r.data.next) break
      page++
    }
  } catch (e) {
    console.warn(`[fetchParamMap] fetchParamMap(${paramType}) error:`, e.message)
  }
  console.log(`[fetchParamMap] ${paramType} map (${Object.keys(map).length} entries):`, map)
  return map
}

async function fetchWorkspaceParamMaps() {
  const buUuidMap       = await fetchParamMap('business_unit')
  const levelUuidMap    = await fetchParamMap('level')
  const locationUuidMap = await fetchParamMap('location')
  return { buUuidMap, levelUuidMap, locationUuidMap }
}

// PUT full profile (phone, BU, level, grade, manager, hrbp, etc.) for the given users.
// emailToId maps each user's own email → their org_user_id (needed to identify the record).
async function putUserProfiles(users, domain, emailToId, paramMaps) {
  const { buUuidMap, levelUuidMap, locationUuidMap } = paramMaps
  const updated = [], updateFailed = []

  for (let i = 0; i < users.length; i++) {
    const u = users[i]
    const email = `${u.email_prefix}@${domain}`
    // Use UUID from POST response if available; Klaar identifies by email when id is omitted
    const uuid = emailToId[email.toLowerCase()]?.uuid

    // Send value strings, not UUIDs — meta map used only to validate the value exists
    const buId       = buUuidMap.hasOwnProperty(u.business_unit) ? u.business_unit : null
    const levelId    = levelUuidMap.hasOwnProperty(u.level)       ? u.level         : null
    const locationId = locationUuidMap.hasOwnProperty(u.location) ? u.location      : null

    const putPayload = buildEmployeePayload({
      email,
      full_name:     u.full_name,
      org_user_id:   uuid,   // undefined when encrypted API can't give us the ID
      status:        'active',
      department:    u.department,
      business_unit: buId,
      title:         u.title,
      manager_email: u.manager_prefix ? `${u.manager_prefix}@${domain}` : null,
      roles:         [],
    }, {
      mobile_number:        u.phone,
      gender:               u.gender,
      date_of_joining:      u.date_of_joining,
      location:             locationId,
      level:                levelId,
      grade:                levelId,
      hrbp_email:           u.hrbp_prefix ? `${u.hrbp_prefix}@${domain}` : null,
      is_admin:             u.is_admin ? 'YES' : 'NO',
      is_employee:          'YES',
      is_fulltime_employee: u.employment_type === 'Full Time' ? 'YES' : 'NO',
    })

    if (i === 0) console.log('[putUserProfiles] PUT payload sample:', JSON.stringify(putPayload))
    console.log(`[putUserProfiles] PUT ${u.full_name} (uuid=${uuid ?? 'none'})…`)

    const rPut = await api('/um/accounts/employee/', {
      method: 'PUT',
      body: JSON.stringify(putPayload),
    })

    if (rPut.ok) {
      updated.push(u.full_name)
    } else {
      console.warn(`[putUserProfiles] PUT failed for ${u.full_name}:`, rPut.status, errorBodyText(rPut).slice(0, 500))
      updateFailed.push(`${u.full_name} (PUT ${rPut.status})`)
    }
    await new Promise(res => setTimeout(res, 200))
  }

  return { updated, updateFailed }
}

// Step 2a: Add Managers — POST the 4 manager-role users, then PUT their full profile
// (phone, BU, level, manager/HRBP refs). Self-contained: does not depend on addEmployees.
export async function addManagers() {
  const domain = state.emailDomain || await getWorkspaceDomain()
  if (!domain) return { ok: false, message: 'Could not determine workspace email domain. Please try again after logging in.' }

  const managers = DUMMY_USERS.filter(u => u.is_manager_role)
  const created = [], failed = []

  for (const u of managers) {
    const email = `${u.email_prefix}@${domain}`

    // Create real Migadu mailbox first (non-blocking — Klaar creation continues even if this fails)
    if (state.emailDomain) {
      await createMigaduMailbox(domain, u.email_prefix, u.full_name)
    }

    const r = await api('/um/accounts/employee/', {
      method: 'POST',
      body: JSON.stringify({
        data: [{
          full_name:            u.full_name,
          email,
          title:                u.title,
          department:           u.department,
          business_unit:        null,
          mobile_number:        null,
          location:             u.location,
          manager_email:        null,
          hrbp_email:           null,
          is_admin:             u.is_admin ? 'YES' : 'NO',
          hrbp:                 u.is_hrbp  ? 'YES' : 'NO',
          is_employee:          'YES',
          is_fulltime_employee: u.employment_type === 'Full Time' ? 'YES' : 'NO',
          status:               'active',
          verification_status:  'active',
        }],
        send_mail: false, single_mode: true,
      }),
    })

    if (r.ok) {
      if (created.length === 0) console.log('[addManagers] POST response sample:', JSON.stringify(r.data).slice(0, 400))
      const uuid = await resolveCreatedUuid(r, email)
      console.log(`[addManagers] ${u.full_name} → uuid=${uuid}`)
      created.push({ name: u.full_name, email, uuid })
    } else {
      const bodyText = errorBodyText(r)
      if (r.status === 400 && (bodyText.includes('exist') || bodyText.includes('already'))) {
        const uuid = await resolveCreatedUuid(null, email)
        console.log(`[addManagers] ${u.full_name} already exists → uuid=${uuid}`)
        created.push({ name: u.full_name, email, uuid })
      } else {
        failed.push(`${u.full_name} (${r.status})`)
        console.warn(`[addManagers] POST failed for ${u.full_name}:`, r.status, bodyText.slice(0, 200))
      }
    }
    await new Promise(res => setTimeout(res, 200))
  }

  state.managers          = created   // [{name, email, uuid}]
  state.userDepartments   = [...new Set(DUMMY_USERS.map(u => u.department).filter(Boolean))]
  state.userBusinessUnits = [...new Set(DUMMY_USERS.map(u => u.business_unit).filter(Boolean))]
  saveState()

  // PUT full profile (phone, BU, level, manager/HRBP refs) on the managers just created/found —
  // all 4 already exist by this point, so cross-references between them resolve fine.
  const emailToId = {}
  for (const m of created) {
    if (m.email && m.uuid) emailToId[m.email.toLowerCase()] = { uuid: m.uuid }
  }

  const paramMaps = await fetchWorkspaceParamMaps()
  const { updated, updateFailed } = await putUserProfiles(managers, domain, emailToId, paramMaps)

  const allFailed = [...failed, ...updateFailed]
  if (allFailed.length) return { ok: false, message: `Created ${created.length}/${managers.length} managers, updated ${updated.length}/${managers.length} profiles. Failed: ${allFailed.join(', ')}` }
  return { ok: true, message: `Created ${created.length} managers + updated ${updated.length} profiles on ${domain}. Now click Add Employees.` }
}

// Resolve a just-created (or already-existing) user's org_user UUID: try the POST response
// first (r may be null/failed if the user already existed), then fall back to searching by
// email — handles encrypted/unexpected response shapes and the "already exists" case alike.
async function resolveCreatedUuid(r, email) {
  if (r?.ok) {
    const dataField = r.data?.data
    const rec = Array.isArray(dataField) ? dataField[0]
      : Array.isArray(r.data?.results)    ? r.data.results[0]
      : Array.isArray(r.data)             ? r.data[0]
      : null
    const uuid = rec?.id || rec?.org_user?.id || rec?.org_user_id
    if (uuid) return uuid
  }
  const sr = await api(`/um/accounts/employee/?search=${encodeURIComponent(email)}&page_size=5`)
  const match = searchResults(sr).find(e =>
    [e.email, e.company_email, e.user?.email, e.work_email].some(em => em?.toLowerCase() === email.toLowerCase())
  )
  return match?.org_user?.id || match?.id || match?.user?.id
}

// Step 2b: Add Employees — POST the 6 non-manager users, then PUT full profile on those 6
// (managers get their full profile from addManagers() instead — see that function).
export async function addEmployees() {
  const domain = state.emailDomain || await getWorkspaceDomain()
  if (!domain) return { ok: false, message: 'Could not determine workspace email domain. Please try again after logging in.' }

  const employees = DUMMY_USERS.filter(u => !u.is_manager_role)
  const postCreated = [], postFailed = []

  // POST the 6 employees (managers already exist so their HRBP/manager refs are safe in PUT)
  for (const u of employees) {
    const email = `${u.email_prefix}@${domain}`

    // Create real Migadu mailbox first (non-blocking — Klaar creation continues even if this fails)
    if (state.emailDomain) {
      await createMigaduMailbox(domain, u.email_prefix, u.full_name)
    }

    const r = await api('/um/accounts/employee/', {
      method: 'POST',
      body: JSON.stringify({
        data: [{
          full_name:            u.full_name,
          email,
          title:                u.title,
          department:           u.department,
          business_unit:        null,
          mobile_number:        null,
          location:             u.location,
          manager_email:        null,
          hrbp_email:           null,
          is_admin:             u.is_admin ? 'YES' : 'NO',
          hrbp:                 u.is_hrbp  ? 'YES' : 'NO',
          is_employee:          'YES',
          is_fulltime_employee: u.employment_type === 'Full Time' ? 'YES' : 'NO',
          status:               'active',
          verification_status:  'active',
        }],
        send_mail: false, single_mode: true,
      }),
    })

    if (r.ok) {
      if (postCreated.length === 0) console.log('[addEmployees] POST response sample:', JSON.stringify(r.data).slice(0, 400))
      const uuid = await resolveCreatedUuid(r, email)
      console.log(`[addEmployees] ${u.full_name} → uuid=${uuid}`)
      postCreated.push({ name: u.full_name, email, uuid })
    } else {
      const body = errorBodyText(r)
      if (r.status === 400 && (body.includes('exist') || body.includes('already'))) {
        const uuid = await resolveCreatedUuid(null, email)
        console.log(`[addEmployees] ${u.full_name} already exists → uuid=${uuid}`)
        postCreated.push({ name: u.full_name, email, uuid })
      } else {
        postFailed.push(`${u.full_name} (${r.status})`)
        console.warn(`[addEmployees] POST failed for ${u.full_name}:`, r.status, body.slice(0, 200))
      }
    }
    await new Promise(res => setTimeout(res, 200))
  }

  // Build email→UUID map from IDs saved during this function's own POSTs
  const emailToId = {}
  for (const e of postCreated) {
    if (e.email && e.uuid) emailToId[e.email.toLowerCase()] = { uuid: e.uuid }
  }
  console.log(`[addEmployees] emailToId from POST responses: ${Object.keys(emailToId).length} entries`, Object.keys(emailToId))

  // PUT full profile on the 6 employees only — managers were already updated by addManagers()
  const paramMaps = await fetchWorkspaceParamMaps()
  const { updated, updateFailed } = await putUserProfiles(employees, domain, emailToId, paramMaps)

  // dummyUsers spans all 10 (managers + employees) — pull manager UUIDs from state.managers
  // (set by addManagers()) and employee UUIDs from this run's own POSTs.
  const managerUuidByEmail = {}
  for (const m of (state.managers || [])) {
    if (m.email && m.uuid) managerUuidByEmail[m.email.toLowerCase()] = m.uuid
  }
  state.dummyUsers = DUMMY_USERS.map(u => {
    const email = `${u.email_prefix}@${domain}`
    const uuid  = emailToId[email.toLowerCase()]?.uuid || managerUuidByEmail[email.toLowerCase()]
    return { email, full_name: u.full_name, uuid }
  })
  saveState()

  const allFailed = [...postFailed, ...updateFailed]
  if (allFailed.length) return { ok: false, message: `Created ${postCreated.length} employees, updated ${updated.length}/${employees.length} profiles. Failed: ${allFailed.join(', ')}` }
  return { ok: true, message: `Created ${postCreated.length} employees + updated all ${updated.length} employee profiles with full data on ${domain}` }
}

const BULK_GROUP_NAMES = [
  'Quantum Cryptography & Post-Quantum Security',
  'Cognitive Automation & Decision Intelligence',
  'Multimodal Perception & Computer Vision Labs',
  'Strategic Sourcing & Category Management',
  'Workplace Experience & Global Real Estate',
  'Structured Finance & Balance Sheet Strategy',
  'Threat Intelligence & Active Cyber Defense',
  'Targeted Therapeutics & Molecular Informatics',
  'Fault-Tolerant Architecture & Core Platform SRE',
  'Direct-to-Consumer Growth & Retention Strategy',
  'Enterprise Data Fabric & Semantic Governance',
  'Talent Acquisition & Executive Search Operations',
  'Business Continuity & Operational Resiliency',
  'Conversational Intelligence & Agentic AI Research',
  'Corporate Development & Joint Venture Strategy',
  'Developer Experience & Tooling Modernization',
  'Grid Modernization & Energy Storage Systems',
  'Clearing, Custody & Digital Asset Settlement',
  'Strategic Portfolio Governance & Delivery Assurance',
  'Semiconductor Design & ASIC Packaging Labs',
  'Compensation Strategy & Executive Total Rewards',
  'Corporate Narrative & Strategic Communications',
  'Anti-Financial Crime & Trade Sanctions Compliance',
  'Hybrid Mesh Networking & Software-Defined WAN',
  'Predictive Logistics & Last-Mile Orchestration',
];

// Create a CUSTOM group. Tries the CSV-upload endpoint first — that's what's proven to work
// on India/US prod (app.klaarhq.com / us.klaarhq.com). If that fails (e.g. dev-api rejects it —
// see project_group_creation_endpoint_fix memory), falls back to the plain JSON endpoint, which
// a manual test against Klaar's own UI confirmed works there. This keeps prod's already-working
// path completely unchanged while fixing dev.
async function createGroup(name, members, adminEmail, adminOrgUserId) {
  const memberEmails = members.map(m => m.email).filter(Boolean)

  if (memberEmails.length && adminEmail) {
    const csvLines = ['members,admins']
    for (let k = 0; k < memberEmails.length; k++) {
      csvLines.push(`${memberEmails[k]},${k === 0 ? adminEmail : ''}`)
    }
    const formData = new FormData()
    formData.append('file', new Blob([csvLines.join('\n')], { type: 'text/csv' }), 'members.csv')

    const res = await fetch(
      API_BASE + `/groupsj/api/v1/groups/csv?name=${encodeURIComponent(name)}`,
      { method: 'POST', headers: buildHeaders(), body: formData }
    )
    if (res.ok) return { ok: true }
    const txt = (await res.text()).toLowerCase()
    if (res.status === 400 && txt.includes('exist')) return { ok: true, existing: true }
    console.warn(`[createGroup] CSV upload failed for "${name}" (${res.status}) — falling back to JSON endpoint`)
  }

  const memberIds = members.map(m => m.uuid).filter(Boolean)
  if (!memberIds.length || !adminOrgUserId) return { ok: false, status: 400 }

  const r = await api('/groupsj/api/v1/groups/', {
    method: 'POST',
    body: JSON.stringify({ name, description: '', adminIds: [adminOrgUserId], memberIds }),
  })
  if (r.ok) return { ok: true }
  const body = errorBodyText(r)
  if (r.status === 400 && body.includes('exist')) return { ok: true, existing: true }
  return { ok: false, status: r.status }
}

// Step 4: Bulk Upload Group — creates 25 CUSTOM groups, using whatever users already exist in the workspace
export async function bulkUploadGroup() {
  const adminEmail     = getEmailFromJwt() || state.adminEmail
  const adminOrgUserId = getOrgUserIdFromJwt()
  if (!adminEmail && !adminOrgUserId) return { ok: false, message: 'Could not read admin identity from session.' }

  // Prefer members already known locally (fast, no API call); otherwise fetch real workspace employees
  let members = (state.bulkUsers || []).map(u => ({ email: u.email, uuid: u.uuid })).filter(m => m.email || m.uuid)
  if (!members.length) {
    const r = await api('/um/accounts/employee/?page=1&page_size=100')
    const results = r.ok ? searchResults(r) : []
    members = results
      .map(e => ({
        email: e.email || e.company_email || e.user?.email || e.work_email,
        uuid:  e.org_user?.id || e.id || e.user?.id,
      }))
      .filter(m => m.email || m.uuid)
  }

  if (!members.length) {
    return { ok: false, message: 'No users found in this workspace. Run "Add User" first so groups have members to assign.' }
  }

  const created = []
  const failed  = []

  for (let i = 0; i < BULK_GROUP_NAMES.length; i++) {
    const name = BULK_GROUP_NAMES[i]

    // Each group gets 8 members, rotating through all known users
    const groupSize = Math.min(8, members.length)
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

  state.bulkGroups = created
  saveState()

  if (failed.length) {
    return { ok: false, message: `Created ${created.length}/25, failed: ${failed.join(', ')}` }
  }
  return {
    ok: true,
    message: `Created ${created.length} groups: ${created.slice(0, 5).map(g => g.name).join(', ')}… and ${created.length - 5} more`,
  }
}

const GROUP_NAMES = [
  'Hyperscale Observability, Telemetry & Distributed Tracing',
  'Neuromorphic Hardware, Silicon Engineering & Edge Accelerators',
  'Predictive Maintenance, Digital Twins & Industrial Robotics',
  'Synthetic Media Forensics, Deepfake Defense & Content Provenance',
  'RegTech Compliance, AML Automation & Transaction Surveillance',
  'Smart Grid Telematics, Microgrid Storage & Clean Energy Dispatch',
  'Cold Chain Telemetry, Global Bio-Logistics & Pharma Distribution',
];
// Step 5: Add Group — creates 7 CUSTOM groups from the users created by Add Manager/Add Employees
export async function addGroup() {
  const adminEmail     = getEmailFromJwt() || state.adminEmail
  const adminOrgUserId = getOrgUserIdFromJwt()
  if (!adminEmail && !adminOrgUserId) return { ok: false, message: 'Could not read admin identity from session.' }

  // Need emails/UUIDs saved by addManagers()/addEmployees()
  const members = (state.dummyUsers || []).filter(u => u.email || u.uuid)
  if (!members.length) {
    return { ok: false, message: 'Run "Add User" first so groups have members to assign.' }
  }

  const created = []
  const failed  = []

  for (let i = 0; i < GROUP_NAMES.length; i++) {
    const name = GROUP_NAMES[i]

    // Rotate: group i gets 4 members starting at index i (wraps around)
    const groupSize = Math.min(4, members.length)
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

  state.workspaceGroups = created
  saveState()

  if (failed.length) {
    return { ok: false, message: `Created ${created.length}/7, failed: ${failed.join(', ')}` }
  }
  return {
    ok: true,
    message: `Created ${created.length} groups: ${created.map(g => g.name).join(', ')}`,
  }
}

