import { api, getWorkspaceId, getEmailFromJwt, getAdminUserIdFromJwt, API_BASE, buildHeaders } from '../../core/api.js'
import { state, saveState } from '../../core/state.js'
import { buildEmployeePayload, findUserByName, notImplemented, errorBodyText, searchResults } from '../../core/helpers.js'
import { fetchUsers } from '../../utils/fetchUsers.js'
import { fetchGroups } from '../../utils/fetchGroups.js'
import { setupCloudflareSubdomain } from '../../core/cloudflare.js'
import { ensureMigaduDomain, activateMigaduDomain, createMigaduMailbox } from '../../core/migadu.js'

const DUMMY_ROLES = [
  'Talent Growth Architect',
  'Strategic Transformation Partner',
  'Revenue Operations Specialist',
  'Global Integration Lead',
  'Organizational Effectiveness Director',
  'Client Experience Strategist',
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

// is_manager_role: true  → created by addManagers() (4 users)
// is_manager_role: false → created by addEmployees() (6 users)
// Both steps then PUT all 10 with full profile (phone, BU, level, manager, hrbp, etc.)
const DUMMY_USERS = [
  { 
    full_name: 'Alistair Pendelton', 
    email_prefix: 'alistair.pendelton', 
    phone: '+1 4155556101', 
    gender: 'Male',
    department: 'Executive Office', 
    business_unit: 'BU1', 
    title: 'Chief Executive Officer',
    level: 'Org Band 8A', 
    location: 'San Francisco, USA', 
    employment_type: 'Full Time',
    date_of_joining: '1996-01-13', 
    manager_prefix: null, 
    hrbp_prefix: 'beatrice.kingsford',
    is_admin: false, 
    is_hrbp: false, 
    is_manager_role: true 
  },
  { 
    full_name: 'Beatrice Kingsford', 
    email_prefix: 'beatrice.kingsford', 
    phone: '+1 2125556102',  
    gender: 'Female',
    department: 'People & Culture', 
    business_unit: 'BU1',  
    title: 'Chief People Officer',
    level: 'Org Band 7A', 
    location: 'New York, USA',  
    employment_type: 'Full Time',
    date_of_joining: '1998-05-18',  
    manager_prefix: 'alistair.pendelton', 
    hrbp_prefix: null,
    is_admin: true, 
    is_hrbp: true, 
    is_manager_role: true 
  },
  { 
    full_name: 'Caspian Whitmore',  
    email_prefix: 'caspian.whitmore',  
    phone: '+44 2079466103', 
    gender: 'Male',
    department: 'Sales',            
    business_unit: 'BU1',  
    title: 'Chief Revenue Officer',
    level: 'Org Band 7A', 
    location: 'London, UK',        
    employment_type: 'Full Time',
    date_of_joining: '2001-07-23',  
    manager_prefix: 'alistair.pendelton', 
    hrbp_prefix: 'beatrice.kingsford',
    is_admin: false, 
    is_hrbp: false, 
    is_manager_role: true 
  },
  { 
    full_name: 'Dahlia Prescott', 
    email_prefix: 'dahlia.prescott', 
    phone: '+91 8045676104', 
    gender: 'Female',
    department: 'Engineering',        
    business_unit: 'BU2',  
    title: 'VP, Engineering',
    level: 'Org Band 6A', 
    location: 'Bengaluru, India',  
    employment_type: 'Full Time',
    date_of_joining: '2003-09-15',  
    manager_prefix: 'alistair.pendelton', 
    hrbp_prefix: 'ezra.sinclair',
    is_admin: false, 
    is_hrbp: false, 
    is_manager_role: true 
  },
  { 
    full_name: 'Ezra Sinclair',  
    email_prefix: 'ezra.sinclair',   
    phone: '+971 45556105',  
    gender: 'Male',
    department: 'People & Culture - BU2',  
    business_unit: 'BU2',  
    title: 'Director, People & Culture',
    level: 'Org Band 5A',  
    location: 'Dubai, UAE',        
    employment_type: 'Full Time',
    date_of_joining: '2004-04-12',  
    manager_prefix: 'beatrice.kingsford',     
    hrbp_prefix: null,
    is_admin: false, 
    is_hrbp: true, 
    is_manager_role: false 
  },
  { 
    full_name: 'Fiona Vanderbilt',    
    email_prefix: 'fiona.vanderbilt',    
    phone: '+44 2079466106', 
    gender: 'Female',
    department: 'Sales',            
    business_unit: 'BU1',  
    title: 'Director, Account Management',
    level: 'Org Band 4A', 
    location: 'London, UK',        
    employment_type: 'Full Time',
    date_of_joining: '2006-02-20',  
    manager_prefix: 'caspian.whitmore',      
    hrbp_prefix: 'beatrice.kingsford',
    is_admin: false, 
    is_hrbp: false, 
    is_manager_role: false 
  },
  { 
    full_name: 'Gideon Mercer',    
    email_prefix: 'gideon.mercer',    
    phone: '+65 81236107',    
    gender: 'Male',
    department: 'Engineering',        
    business_unit: 'BU2',  
    title: 'Staff Engineer',
    level: 'Org Band 3B', 
    location: 'Singapore, Singapore', 
    employment_type: 'Full Time',
    date_of_joining: '2007-06-11',  
    manager_prefix: 'dahlia.prescott',        
    hrbp_prefix: 'ezra.sinclair',
    is_admin: false, 
    is_hrbp: false, 
    is_manager_role: false 
  },
  { 
    full_name: 'Helena Fontaine',      
    email_prefix: 'helena.fontaine',      
    phone: '+1 2125556108',  
    gender: 'Female',
    department: 'Sales',            
    business_unit: 'BU1',  
    title: 'Account Executive',
    level: 'Org Band 2B', 
    location: 'New York, USA',    
    employment_type: 'Full Time',
    date_of_joining: '2008-10-27',  
    manager_prefix: 'caspian.whitmore',      
    hrbp_prefix: 'beatrice.kingsford',
    is_admin: false, 
    is_hrbp: false, 
    is_manager_role: false 
  },
  { 
    full_name: 'Julian Ashford',  
    email_prefix: 'julian.ashford',  
    phone: '+91 8045676109',  
    gender: 'Male',
    department: 'Engineering',        
    business_unit: 'BU2',  
    title: 'Software Engineer II',
    level: 'Org Band 2A', 
    location: 'Bengaluru, India',  
    employment_type: 'Full Time',
    date_of_joining: '2009-03-16',  
    manager_prefix: 'dahlia.prescott',        
    hrbp_prefix: 'ezra.sinclair',
    is_admin: false, 
    is_hrbp: false, 
    is_manager_role: false 
  },
  { 
    full_name: 'Kendra Reyes',     
    email_prefix: 'kendra.reyes',     
    phone: '+971 45556110',  
    gender: 'Female',
    department: 'People & Culture - BU2',  
    business_unit: 'BU2',  
    title: 'People Ops Associate',
    level: 'Org Band 1B', 
    location: 'Dubai, UAE',        
    employment_type: 'Full Time',
    date_of_joining: '2010-01-18',  
    manager_prefix: 'ezra.sinclair',      
    hrbp_prefix: 'ezra.sinclair',
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
  { full_name: 'Arthur Pendelton',    email_prefix: 'arthur.pendelton',    department: DEPTS[0], business_unit: BUS[0] },
  { full_name: 'Beatrix Vane',        email_prefix: 'beatrix.vane',        department: DEPTS[1], business_unit: BUS[1] },
  { full_name: 'Cassian Oakridge',    email_prefix: 'cassian.oakridge',    department: DEPTS[2], business_unit: BUS[2] },
  { full_name: 'Dorothea Vance',      email_prefix: 'dorothea.vance',      department: DEPTS[3], business_unit: BUS[0] },
  { full_name: 'Ebenezer Croft',      email_prefix: 'ebenezer.croft',      department: DEPTS[0], business_unit: BUS[1] },
  { full_name: 'Felicity Starling',   email_prefix: 'felicity.starling',   department: DEPTS[1], business_unit: BUS[2] },
  { full_name: 'Gareth Nightfall',    email_prefix: 'gareth.nightfall',    department: DEPTS[2], business_unit: BUS[0] },
  { full_name: 'Henrietta Sterling',  email_prefix: 'henrietta.sterling',  department: DEPTS[3], business_unit: BUS[1] },
  { full_name: 'Ignatius Blackwood',  email_prefix: 'ignatius.blackwood',  department: DEPTS[0], business_unit: BUS[2] },
  { full_name: 'Juliet Kingswood',    email_prefix: 'juliet.kingswood',    department: DEPTS[1], business_unit: BUS[0] },
  { full_name: 'Kaelan Mercer',       email_prefix: 'kaelan.mercer',       department: DEPTS[2], business_unit: BUS[1] },
  { full_name: 'Lysandra Fairchild',  email_prefix: 'lysandra.fairchild',  department: DEPTS[3], business_unit: BUS[2] },
  { full_name: 'Maximilian Ashford',  email_prefix: 'maximilian.ashford',  department: DEPTS[0], business_unit: BUS[0] },
  { full_name: 'Nicolette Thorne',    email_prefix: 'nicolette.thorne',    department: DEPTS[1], business_unit: BUS[1] },
  { full_name: 'Orson Kensington',    email_prefix: 'orson.kensington',    department: DEPTS[2], business_unit: BUS[2] },
  { full_name: 'Priscilla Eldridge',  email_prefix: 'priscilla.eldridge',  department: DEPTS[3], business_unit: BUS[0] },
  { full_name: 'Quinton Stanhope',    email_prefix: 'quinton.stanhope',    department: DEPTS[0], business_unit: BUS[1] },
  { full_name: 'Rosalind Winslow',    email_prefix: 'rosalind.winslow',    department: DEPTS[1], business_unit: BUS[2] },
  { full_name: 'Silas Radcliffe',     email_prefix: 'silas.radcliffe',     department: DEPTS[2], business_unit: BUS[0] },
  { full_name: 'Theadora Prescott',   email_prefix: 'theadora.prescott',   department: DEPTS[3], business_unit: BUS[1] },
  { full_name: 'Ulysses Abernathy',   email_prefix: 'ulysses.abernathy',   department: DEPTS[0], business_unit: BUS[2] },
  { full_name: 'Valerie Whitmore',    email_prefix: 'valerie.whitmore',    department: DEPTS[1], business_unit: BUS[0] },
  { full_name: 'Wilfred Kingsford',   email_prefix: 'wilfred.kingsford',   department: DEPTS[2], business_unit: BUS[1] },
  { full_name: 'Ximena Ravenscroft',  email_prefix: 'ximena.ravenscroft',  department: DEPTS[3], business_unit: BUS[2] },
  { full_name: 'Yevgeny Harrington',  email_prefix: 'yevgeny.harrington',  department: DEPTS[0], business_unit: BUS[0] },
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
      created.push({ full_name: u.full_name, email })
    } else {
      const body = errorBodyText(r)
      if (r.status === 400 && (body.includes('exist') || body.includes('already'))) {
        created.push({ full_name: u.full_name, email, existing: true })
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

// Step 2a: Add Managers — POST only the 4 manager-role users (no manager/HRBP refs yet)
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
      const dataField = r.data?.data
      const rec  = Array.isArray(dataField) ? dataField[0]
        : Array.isArray(r.data?.results)    ? r.data.results[0]
        : Array.isArray(r.data)             ? r.data[0]
        : null
      let uuid = rec?.id || rec?.org_user?.id || rec?.org_user_id
      if (!uuid) {
        // Response is encrypted or unexpected shape — search by email to get the UUID
        const sr = await api(`/um/accounts/employee/?search=${encodeURIComponent(email)}&page_size=5`)
        const match = searchResults(sr).find(e =>
          [e.email, e.company_email, e.user?.email, e.work_email].some(em => em?.toLowerCase() === email.toLowerCase())
        )
        uuid = match?.org_user?.id || match?.id || match?.user?.id
        console.log(`[addManagers] ${u.full_name} POST ok but uuid not in response → search → uuid=${uuid}`)
      }
      console.log(`[addManagers] ${u.full_name} → uuid=${uuid}`)
      created.push({ name: u.full_name, email, uuid })
    } else {
      const bodyText = errorBodyText(r)
      if (r.status === 400 && (bodyText.includes('exist') || bodyText.includes('already'))) {
        // User already exists — try to find their UUID via search
        const sr = await api(`/um/accounts/employee/?search=${encodeURIComponent(email)}&page_size=5`)
        const match = searchResults(sr).find(e =>
          [e.email, e.company_email, e.user?.email, e.work_email].some(em => em?.toLowerCase() === email.toLowerCase())
        )
        const uuid = match?.org_user?.id || match?.id || match?.user?.id
        console.log(`[addManagers] ${u.full_name} already exists → uuid=${uuid}`)
        created.push({ name: u.full_name, email, uuid })
      } else {
        failed.push(`${u.full_name} (${r.status})`)
        console.warn(`[addManagers] POST failed for ${u.full_name}:`, r.status, bodyText.slice(0, 200))
      }
    }
    await new Promise(res => setTimeout(res, 200))
  }

  state.managers          = created   // [{name, email, uuid}] — used by addEmployees for PUT
  state.userDepartments   = [...new Set(DUMMY_USERS.map(u => u.department).filter(Boolean))]
  state.userBusinessUnits = [...new Set(DUMMY_USERS.map(u => u.business_unit).filter(Boolean))]
  saveState()

  if (failed.length) return { ok: false, message: `Created ${created.length}/${managers.length} managers. Failed: ${failed.join(', ')}` }
  return { ok: true, message: `Created ${created.length} managers on ${domain}. Now click Add Employees.` }
}

// Helper: find a user's UUID by email (checks all known email fields in the API response)
async function findEmployeeByEmail(email, logFirst) {
  const fr = await api(`/um/accounts/employee/?search=${encodeURIComponent(email)}&page_size=10`)
  if (!fr.ok) return null
  const results = searchResults(fr)
  if (logFirst && results.length) {
    console.log('[findEmployee] sample result keys:', Object.keys(results[0]), '| full:', JSON.stringify(results[0]).slice(0, 500))
  }
  const match = results.find(e => {
    const candidates = [e.email, e.company_email, e.user?.email, e.work_email].filter(Boolean)
    return candidates.some(c => c.toLowerCase() === email.toLowerCase())
  })
  if (!match) return null
  // The org_user UUID may come back as `id`, `org_user_id`, or the same as `user_id`
  const uuid   = match.org_user?.id || match.id || match.user?.id
  const userId = match.user?.id || match.org_user?.user_id
  console.log(`[findEmployee] ${email} → id=${uuid} user_id=${userId}`)
  return { uuid, userId }
}

// Step 2b: Add Employees — POST the 6 non-manager users, then PUT full profile on all 10
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
      const dataField = r.data?.data
      const rec  = Array.isArray(dataField) ? dataField[0]
        : Array.isArray(r.data?.results)    ? r.data.results[0]
        : Array.isArray(r.data)             ? r.data[0]
        : null
      let uuid = rec?.id || rec?.org_user?.id || rec?.org_user_id
      if (!uuid) {
        // Response is encrypted or unexpected shape — search by email to get the UUID
        const sr = await api(`/um/accounts/employee/?search=${encodeURIComponent(email)}&page_size=5`)
        const match = searchResults(sr).find(e =>
          [e.email, e.company_email, e.user?.email, e.work_email].some(em => em?.toLowerCase() === email.toLowerCase())
        )
        uuid = match?.org_user?.id || match?.id || match?.user?.id
        console.log(`[addEmployees] ${u.full_name} POST ok but uuid not in response → search → uuid=${uuid}`)
      }
      console.log(`[addEmployees] ${u.full_name} → uuid=${uuid}`)
      postCreated.push({ name: u.full_name, email, uuid })
    } else {
      const body = errorBodyText(r)
      if (r.status === 400 && (body.includes('exist') || body.includes('already'))) {
        const sr = await api(`/um/accounts/employee/?search=${encodeURIComponent(email)}&page_size=5`)
        const match = searchResults(sr).find(e =>
          [e.email, e.company_email, e.user?.email, e.work_email].some(em => em?.toLowerCase() === email.toLowerCase())
        )
        const uuid = match?.org_user?.id || match?.id || match?.user?.id
        console.log(`[addEmployees] ${u.full_name} already exists → uuid=${uuid}`)
        postCreated.push({ name: u.full_name, email, uuid })
      } else {
        postFailed.push(`${u.full_name} (${r.status})`)
        console.warn(`[addEmployees] POST failed for ${u.full_name}:`, r.status, body.slice(0, 200))
      }
    }
    await new Promise(res => setTimeout(res, 200))
  }

  // Build email→UUID map from IDs saved during POST (most reliable — no listing API needed)
  const emailToId = {}
  for (const m of (state.managers || [])) {
    if (m.email && m.uuid) emailToId[m.email.toLowerCase()] = { uuid: m.uuid }
  }
  for (const e of postCreated) {
    if (e.email && e.uuid) emailToId[e.email.toLowerCase()] = { uuid: e.uuid }
  }
  console.log(`[addEmployees] emailToId from POST responses: ${Object.keys(emailToId).length} entries`, Object.keys(emailToId))

  // Fetch param name→UUID maps — plain strings in PUT fields cause 500
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
      console.warn(`[addEmployees] fetchParamMap(${paramType}) error:`, e.message)
    }
    console.log(`[addEmployees] ${paramType} map (${Object.keys(map).length} entries):`, map)
    return map
  }

  const buUuidMap       = await fetchParamMap('business_unit')
  const levelUuidMap    = await fetchParamMap('level')
  const locationUuidMap = await fetchParamMap('location')

  // PUT full profile on all 10 users (phone, BU, level, grade, manager, hrbp, etc.)
  const updated = [], updateFailed = []

  for (let i = 0; i < DUMMY_USERS.length; i++) {
    const u = DUMMY_USERS[i]
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

    if (i === 0) console.log('[addEmployees] PUT payload sample:', JSON.stringify(putPayload))
    console.log(`[addEmployees] PUT ${u.full_name} (uuid=${uuid ?? 'none'})…`)

    const rPut = await api('/um/accounts/employee/', {
      method: 'PUT',
      body: JSON.stringify(putPayload),
    })

    if (rPut.ok) {
      updated.push(u.full_name)
    } else {
      console.warn(`[addEmployees] PUT failed for ${u.full_name}:`, rPut.status, errorBodyText(rPut).slice(0, 500))
      updateFailed.push(`${u.full_name} (PUT ${rPut.status})`)
    }
    await new Promise(res => setTimeout(res, 200))
  }

  state.dummyUsers = DUMMY_USERS.map(u => ({ email: `${u.email_prefix}@${domain}`, full_name: u.full_name }))
  saveState()

  const allFailed = [...postFailed, ...updateFailed]
  if (allFailed.length) return { ok: false, message: `Created ${postCreated.length} employees, updated ${updated.length}/10 profiles. Failed: ${allFailed.join(', ')}` }
  return { ok: true, message: `Created ${postCreated.length} employees + updated all ${updated.length} user profiles with full data on ${domain}` }
}

const BULK_GROUP_NAMES = [
  'Enterprise Strategy & Corporate Steering',
  'Platform Architecture & Infrastructure Systems',
  'Commercial Execution & Revenue Acceleration',
  'User Experience & Interface Design Lab',
  'Global Talent Acquisition & People Insights',
  'Corporate Treasury & Capital Management',
  'Customer Value Operations & Strategic Accounts',
  'Brand Growth & Digital Marketing Operations',
  'Regulatory Affairs & Ethics Governance',
  'Strategic Alliances & Ecosystem Partnerships',
  'Cybersecurity Defense & Threat Operations',
  'Advanced Data Science & Machine Learning',
  'Global Procurement & Logistics Management',
  'Facilities Management & Workplace Operations',
  'Site Reliability & Operations Engineering',
  'Software Quality Engineering & Test Performance',
  'Process Excellence & Agile Practice',
  'Inclusion, Diversity & Community Impact',
  'Internal Governance & Enterprise Risk Audit',
  'Investor Relations & Market Communications',
  'ESG Governance & Sustainability Leadership',
  'Emerging Technologies & Applied Innovation',
  'Partner Channel & Global Expansion',
  'Organizational Learning & Executive Development',
  'Business Continuity & Crisis Resilience Office',
];

// Step 4: Bulk Upload Group — creates 25 CUSTOM groups via CSV, members from bulkUploadUser()
export async function bulkUploadGroup() {
  const adminEmail = getEmailFromJwt() || state.adminEmail
  if (!adminEmail) return { ok: false, message: 'Could not read admin email from session.' }

  if (!state.bulkUsers?.length) {
    return { ok: false, message: 'Run "Bulk Upload User" first so groups have members to assign.' }
  }

  const emails = state.bulkUsers.map(u => u.email).filter(Boolean)
  if (emails.length === 0) {
    return { ok: false, message: 'No emails found in bulk users. Run "Bulk Upload User" again.' }
  }

  const created = []
  const failed  = []

  for (let i = 0; i < BULK_GROUP_NAMES.length; i++) {
    const name = BULK_GROUP_NAMES[i]

    // Each group gets 8 members, rotating through all 25 users
    const groupSize = Math.min(8, emails.length)
    const groupEmails = []
    for (let j = 0; j < groupSize; j++) {
      groupEmails.push(emails[(i + j) % emails.length])
    }

    // CSV format — same as addGroup()
    const csvLines = ['members,admins']
    for (let k = 0; k < groupEmails.length; k++) {
      csvLines.push(`${groupEmails[k]},${k === 0 ? adminEmail : ''}`)
    }

    const formData = new FormData()
    formData.append('file', new Blob([csvLines.join('\n')], { type: 'text/csv' }), 'members.csv')

    const res = await fetch(
      API_BASE + `/groupsj/api/v1/groups/csv?name=${encodeURIComponent(name)}&description=`,
      { method: 'POST', headers: buildHeaders(), body: formData }
    )

    if (res.ok) {
      created.push({ name })
    } else {
      const txt = await res.text()
      if (res.status === 400 && txt.toLowerCase().includes('exist')) {
        created.push({ name, existing: true })
      } else {
        failed.push(`${name} (${res.status})`)
      }
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
  'Developer Relations & API Ecosystem Governance',
  'FinOps, Infrastructure Cost & Cloud Economics',
  'Crisis Management, Security Ops & Resiliency',
  'Talent Mobility, Upskilling & Workforce Planning',
  'Commercial Deal Desk & Revenue Operations',
  'Strategic ESG, Circularity & Decarbonization',
  'Customer Success Engineering & Solutions Architecture',
];
// Step 5: Add Group — creates 7 CUSTOM groups via CSV upload (accepts emails, no IDs needed)
export async function addGroup() {
  // Get admin email for the admins column in CSV
  const adminEmail = getEmailFromJwt() || state.adminEmail
  if (!adminEmail) return { ok: false, message: 'Could not read admin email from session.' }

  // Need emails saved by addUser()
  if (!state.dummyUsers?.length) {
    return { ok: false, message: 'Run "Add User" first so groups have members to assign.' }
  }

  const emails = state.dummyUsers.map(u => u.email).filter(Boolean)
  if (emails.length === 0) {
    return { ok: false, message: 'No emails found in saved dummy users. Run "Add User" again.' }
  }

  const created = []
  const failed  = []

  for (let i = 0; i < GROUP_NAMES.length; i++) {
    const name = GROUP_NAMES[i]

    // Rotate: group i gets 4 emails starting at index i (wraps around)
    const groupSize = Math.min(4, emails.length)
    const groupEmails = []
    for (let j = 0; j < groupSize; j++) {
      groupEmails.push(emails[(i + j) % emails.length])
    }

    // Build CSV: members column + admins column (admin email on first row only)
    // This creates a CUSTOM group — Klaar resolves emails to users on the server
    const csvLines = ['members,admins']
    for (let k = 0; k < groupEmails.length; k++) {
      csvLines.push(`${groupEmails[k]},${k === 0 ? adminEmail : ''}`)
    }
    const csvContent = csvLines.join('\n')

    const formData = new FormData()
    formData.append('file', new Blob([csvContent], { type: 'text/csv' }), 'members.csv')

    const encodedName = encodeURIComponent(name)
    const res = await fetch(
      API_BASE + `/groupsj/api/v1/groups/csv?name=${encodedName}&description=`,
      {
        method:  'POST',
        headers: buildHeaders(),   // no Content-Type — browser sets multipart boundary automatically
        body:    formData,
      }
    )

    if (res.ok) {
      created.push({ name })
    } else {
      const txt = await res.text()
      const body = txt.toLowerCase()
      if (res.status === 400 && body.includes('exist')) {
        created.push({ name, existing: true })
      } else {
        failed.push(`${name} (${res.status})`)
      }
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

