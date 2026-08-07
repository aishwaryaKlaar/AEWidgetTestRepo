/**
 * Klaar AE Widget Loader (v3)
 *
 * Inject on Klaar pages with one-click AE demo-data actions.
 * Source spec: ../widget/SCRIPT_CLASSIFICATION.md
 * Source library: /Users/atriroy/klaar-playwright-goal/
 *
 * Status:
 *   - Wired: fetchUsers, fetchGroups, fetchTimePeriods, fetchRatingScales,
 *            createTimePeriods, createTestGoalCycle, setupPlans
 *   - Stubbed: promoteOliviaToAdmin, updateAdminManager, createGroups,
 *              bulkImportGoals, bulkCheckinGoals, createSingleGoal,
 *              aiGoalsSetup, createOneOnOnes, createReviewTemplates,
 *              createEngagementTemplate, createYearlyReview,
 *              createMidYearReview, createQuarterlyReview,
 *              createEngagementSurvey, uploadCompetencies, mapCompetencies,
 *              setCompetencyRatingScale, bulkRateCompetencies
 *
 * Auth pattern: Authorization = "Bearer " + localStorage["X-AUTH-TOKEN"]
 * Headers required: Authorization, workspace-id, client-domain, client_domain, Accept
 */

(function () {
  'use strict';

  // ===== Guard: only run on known Klaar frontends =====
  const KLAAR_HOSTS = ['app.klaarhq.com', 'us.klaarhq.com', 'localhost:4200'];
  if (!KLAAR_HOSTS.includes(location.host)) {
    console.warn('[Klaar AE Widget] Not on a known Klaar host (' + location.host + '), skipping.');
    return;
  }

  // ===== Guard: don't double-inject =====
  if (window.__klaarAEWidget) return;
  window.__klaarAEWidget = true;

  // ===== API host mapping =====
  const API_BASE_BY_HOST = {
    'app.klaarhq.com': 'https://api.klaarhq.com',
    'us.klaarhq.com': 'https://api-usprod.klaarhq.com',
    'localhost:4200': 'https://dev-api.klaarhq.com',
  };
  const API_BASE = API_BASE_BY_HOST[location.host];

  // ===== Auth helpers =====
  function getToken() { return localStorage.getItem('X-AUTH-TOKEN'); }
  function getWorkspaceId() { return localStorage.getItem('workspace-id'); }
  function getAdminUserIdFromJwt() {
    try {
      const jwt = localStorage.getItem('JWT');
      return JSON.parse(atob(jwt.split('.')[1])).user?.id || '';
    } catch { return ''; }
  }
  function buildHeaders(extra) {
    return Object.assign({
      'Authorization': 'Bearer ' + getToken(),
      'workspace-id': getWorkspaceId(),
      'client-domain': location.host,
      'client_domain': location.host,
      'Accept': 'application/json, text/plain, */*',
    }, extra || {});
  }

  // ===== Shared state (persists across page reloads) =====
  // Replaces the Playwright .env write-back pattern. Holds IDs discovered by
  // earlier actions for use by later actions in the workflow.
  const STATE_KEY = 'klaar-ae-state';
  function loadState() { try { return JSON.parse(localStorage.getItem(STATE_KEY)) || {}; } catch { return {}; } }
  function saveState() { try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch {} }
  function clearState() { localStorage.removeItem(STATE_KEY); state = {}; }
  let state = loadState();
  window.__klaarAEState = state; // expose for debugging

  function getAdminId() {
    return state.adminUserId || getAdminUserIdFromJwt();
  }

  // ===== HTTP helper =====
  async function api(path, init) {
    init = init || {};
    const opts = {
      method: init.method || 'GET',
      headers: buildHeaders(init.body ? { 'Content-Type': 'application/json' } : {}),
    };
    if (init.body) opts.body = init.body;
    const res = await fetch(API_BASE + path, opts);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    return { res, status: res.status, ok: res.ok, data, text };
  }

  function notImplemented(intent) {
    return async function () {
      return {
        ok: false,
        message: 'Not yet wired in widget — see SCRIPT_CLASSIFICATION.md. Intent: ' + intent,
      };
    };
  }

  // Find a user in state by name (case-insensitive substring match — mirrors Playwright's findUserByName)
  function findUserByName(name) {
    if (!state.users || !Array.isArray(state.users)) return null;
    const lower = name.toLowerCase();
    return state.users.find(u => {
      const full = (u.full_name || '').toLowerCase();
      return full === lower || full.includes(lower);
    });
  }

  // Build the standard "employee data" payload (the ~50-field block PUT to /um/accounts/employee/)
  // Preserves overrides from the caller; sensible defaults match update-user-roles.js / update-admin-manager.js.
  function buildEmployeePayload(user, overrides = {}) {
    return {
      data: Object.assign({
        email: user.email,
        personal_email: null,
        gender: null,
        mobile_number: null,
        date_of_birth: null,
        nationality: null,
        home_address: null,
        verification_status: user.status || 'active',
        status: user.status || 'active',
        national_id_no: null,
        social_security_no: null,
        social_security_1: null,
        social_security_2: null,
        // Klaar returns "manager" as a derived role (auto-set when user has reports), but the PUT
        // endpoint rejects it as an input role. Strip it so the payload validates.
        roles: (user.roles || []).filter(r => r && r.toLowerCase() !== 'manager'),
        user_id: null,
        date_of_joining: null,
        is_fulltime_employee: 'YES',
        department: user.department || null,
        department_code: null,
        level: null,
        level_code: null,
        discipline: null,
        discipline_code: null,
        location: null,
        location_code: null,
        business_unit: user.business_unit || null,
        business_unit_code: null,
        title: user.title || null,
        title_code: null,
        legal_entity: null,
        hiring_date: null,
        manager_email: user.manager_email || null,
        hrbp_email: null,
        hrbp_list: [],
        primary_matrix_manager_id: null,
        secondary_matrix_manager_id: null,
        sepration_status: null,
        date_of_resignation: null,
        date_of_exit: null,
        grade: null,
        grade_code: null,
        work_address: null,
        workspace_role: '',
        confirmation_date: null,
        cost: '0.00',
        cost_center: null,
        is_admin: 'NO',
        is_survey_creator: 'NO',
        is_employee: 'NO',
        teams_admin: 'NO',
        teams_manager: 'NO',
        teams_viewer: 'NO',
        teams_browser: 'NO',
        mentoring_admin: 'NO',
        mentoring_program_admin: 'NO',
        idp_admin: 'NO',
        nomination_creator: 'NO',
        review_creator: 'NO',
        extra: {},
        id: user.org_user_id || user.user_id,
        name: user.full_name,
      }, overrides),
    };
  }

  // ============================================================
  // ACTIONS
  // ============================================================

  // ----- USERS DOMAIN -----

  async function fetchUsers() {
    let page = 1, all = [], hasMore = true;
    while (hasMore && page < 30) { // safety bound
      const url = `/um/accounts/employee/?page=${page}&page_size=100&search=&get_disabled=true&filter=%5B%5D`;
      const r = await api(url);
      if (!r.ok) return { ok: false, message: `Failed at page ${page}: ${r.status}` };
      const list = (r.data && r.data.results) || [];
      all.push(...list);
      hasMore = !!(r.data && r.data.next);
      page++;
    }
    state.users = all.map(u => ({
      user_id: u.user?.id, full_name: u.user?.full_name, email: u.user?.email,
      org_user_id: u.org_user?.id, roles: u.org_user?.roles, status: u.user?.status,
      department: u.user?.department, title: u.user?.title, business_unit: u.user?.business_unit,
      manager_email: u.user?.manager, employee_id: u.user?.employee_id,
    }));
    // Self-identify admin
    const myId = getAdminUserIdFromJwt();
    const me = all.find(u => u.user?.id === myId);
    if (me) {
      state.adminUserId = me.user.id;
      state.adminOrgUserId = me.org_user?.id;
      state.adminEmail = me.user.email;
      state.adminFullName = me.user.full_name;
    }
    saveState();
    return {
      ok: true,
      message: `Fetched ${all.length} users` + (me ? `; admin = ${state.adminFullName}` : ''),
      data: { count: all.length },
    };
  }

  async function fetchGroupsAction() {
    let page = 0, all = [], hasMore = true;
    while (hasMore && page < 50) {
      const url = `/groupsj/api/v1/groups/paginated/?size=100&page=${page}&forDropdown=false`;
      const r = await api(url);
      if (!r.ok) return { ok: false, message: `Failed at page ${page}: ${r.status}` };
      const list = (r.data && r.data.data) || [];
      all.push(...list);
      hasMore = list.length >= 100;
      page++;
    }
    state.groups = all.map(g => ({ id: g.id, name: g.name, source: g.source }));
    // Identify the workspace-wide "everyone" group. Preference order:
    //   1. "All Company" — explicit name created by `createGroups` action (matches Playwright pattern)
    //   2. Any group with "Workspace Group" in name — Klaar's auto-created default group (e.g., "demo46636 Workspace Group")
    //   3. The largest group by member count — last-resort fallback
    const allCompany = all.find(g => /^all\s*company$/i.test(g.name || ''));
    const defaultWs  = all.find(g => /workspace\s*group/i.test(g.name || ''));
    const largest    = all.slice().sort((a, b) => (b.groupMembersCount || 0) - (a.groupMembersCount || 0))[0];
    const chosen = allCompany || defaultWs || largest;
    if (chosen) {
      state.workspaceGroupId = chosen.id;
      state.workspaceGroupName = chosen.name;
    }
    saveState();
    return {
      ok: true,
      message: `Fetched ${all.length} groups` + (chosen ? `; using "${chosen.name}"` : '; (no usable workspace group found)'),
      data: { count: all.length },
    };
  }

  async function updateAdminManager() {
    if (!state.users || !state.users.length) {
      const fr = await fetchUsers();
      if (!fr.ok) return { ok: false, message: 'Need users — fetchUsers failed: ' + fr.message };
    }
    const olivia = findUserByName('Olivia Johnson');
    const admin = findUserByName('Admin');
    if (!olivia) return { ok: false, message: 'Olivia Johnson not found in users' };
    if (!admin) return { ok: false, message: 'Admin user not found in users' };

    // PUT admin with manager_email = Olivia's email
    const payload = buildEmployeePayload(admin, {
      roles: ['ADMIN'],
      manager_email: olivia.email,
      is_admin: 'YES',
    });
    const r = await api('/um/accounts/employee/', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (!r.ok) return { ok: false, message: `PUT employee failed (${r.status}): ${(r.text || '').slice(0,200)}` };

    // Refresh org chart
    await api('/um/accounts/org-chart/refresh/'); // best-effort, ignore failure

    return { ok: true, message: `Admin's manager set to Olivia Johnson` };
  }

  async function createGroups() {
    const adminId = getAdminId();
    if (!adminId) return { ok: false, message: 'Run "Fetch users" first.' };

    const groupsToCreate = [
      {
        name: 'People & Culture',
        description: '',
        adminIds: [adminId],
        queryParam: '[["department__function_name","__in",["People & Culture"],""]]',
        refreshGroup: false,
      },
      {
        name: 'All Company',
        description: '',
        adminIds: [adminId],
        queryParam: '[["status","__in",["active"],""]]',
        refreshGroup: true,
      },
    ];

    const created = [];
    for (const g of groupsToCreate) {
      const r = await api('/groupsj/api/v1/groups/', {
        method: 'POST',
        body: JSON.stringify(g),
      });
      if (!r.ok) return { ok: false, message: `Failed creating "${g.name}" (${r.status}): ${(r.text||'').slice(0,150)}` };
      const id = r.data?.id || r.data?.groupId || r.data?.data?.id;
      created.push({ name: g.name, id });
      if (g.name === 'All Company' && id) state.workspaceGroupId = id;
    }
    saveState();
    return {
      ok: true,
      message: `Created ${created.length} groups: ${created.map(c => `${c.name}(${c.id?.slice(0,8)}…)`).join(', ')}`,
      data: created,
    };
  }

  async function promoteOliviaToAdmin() {
    if (!state.users || !state.users.length) {
      const fr = await fetchUsers();
      if (!fr.ok) return { ok: false, message: 'Need users — fetchUsers failed: ' + fr.message };
    }
    const olivia = findUserByName('Olivia Johnson');
    if (!olivia) return { ok: false, message: 'Olivia Johnson not found' };

    // Step 1: PUT Olivia with ADMIN+MANAGER roles + rich defaults from update-user-roles.js
    const oliviaRoles = ['ADMIN', 'MANAGER', 'MANAGER']; // duplicate MANAGER mirrors Playwright (matches curl payload intent)
    const managerUser = findUserByName('Gabriella Brooks');
    const hrbpUser = findUserByName('Andrea Raton');
    const oliviaPayload = buildEmployeePayload(olivia, {
      gender: 'Female',
      date_of_joining: '2012-9-5',
      department: olivia.department || 'People & Culture',
      level: 'Org Band 7A',
      location: 'New York, USA',
      business_unit: olivia.business_unit || 'Online Gaming',
      title: olivia.title || 'Chief People Officer',
      manager_email: olivia.manager_email || (managerUser ? managerUser.email : null),
      hrbp_email: hrbpUser ? hrbpUser.email : null,
      roles: oliviaRoles,
      is_admin: 'YES',
    });
    let r = await api('/um/accounts/employee/', { method: 'PUT', body: JSON.stringify(oliviaPayload) });
    if (!r.ok) return { ok: false, message: `Step 1 (PUT Olivia) failed: ${r.status}` };

    // Step 2: Set Gabriella as org chart head
    if (managerUser) {
      const baseUserId = managerUser.org_user_id || managerUser.user_id;
      await api('/um/accounts/org-chart/', {
        method: 'POST',
        body: JSON.stringify({ base_user_id: [baseUserId] }),
      });
    }

    // Step 3: Refresh org chart
    await api('/um/accounts/org-chart/refresh/');

    // Step 4 + 7: PUT display_settings (Date of Joining, then Level)
    const wsId = getWorkspaceId();
    const displayUrl = `/um/accounts/display_settings/${wsId}/`;
    await api(displayUrl, {
      method: 'PUT',
      body: JSON.stringify({
        display_settings: { profile: { user_details: [
          { id: 'date_of_joining', name: 'Date of Joining', is_visible: true, alias: '', logo: 'calendar_today', order: 2 },
        ]}},
      }),
    });

    // Step 5: GET display_settings (mode=new) — sanity refresh
    await api(`/um/accounts/display_settings/?org_id=${wsId}&mode=new`);

    // Step 6: GET user_customfield
    await api('/um/accounts/user_customfield/?page=1&page_size=10');

    // Step 7: PUT display_settings (Level)
    await api(displayUrl, {
      method: 'PUT',
      body: JSON.stringify({
        display_settings: { profile: { user_details: [
          { id: 'level', name: 'Level', is_visible: true, alias: '', logo: 'account_tree', order: 3 },
        ]}},
      }),
    });

    // Step 8 + 9: PATCH PAS (showMatrixReportees toggle false → true)
    const pasUrl = `/pas/api/v1/pas/${wsId}`;
    const pasBase = (showMatrix) => ({
      org_level: { allowed_modules: { home: { other_settings: {
        showProfile: true, showMatrixManagers: true, showMatrixReportees: showMatrix,
      }}}},
    });
    await api(pasUrl, { method: 'PATCH', body: JSON.stringify(pasBase(false)) });
    await api(pasUrl, { method: 'PATCH', body: JSON.stringify(pasBase(true)) });

    // Step 10: Primary matrix manager assignments (best-effort; gracefully skip missing users)
    const matrixAssignments = [
      { manager: 'Olivia Johnson', reports: ['Alex Richards', 'Alicia Rodriguez'] },
      { manager: 'Alex Richards',  reports: ['Xi Ling', 'Andrea Raton'] },
      { manager: 'Philip Neumann', reports: ['Olivia Johnson', 'Ahed Serhal'] },
    ];
    let matrixCount = 0, matrixSkipped = 0;
    for (const a of matrixAssignments) {
      const mgr = findUserByName(a.manager);
      const mgrId = mgr?.org_user_id || mgr?.user_id;
      if (!mgrId) { matrixSkipped += a.reports.length; continue; }
      for (const reportName of a.reports) {
        const reportUser = findUserByName(reportName);
        if (!reportUser) { matrixSkipped++; continue; }
        const rolesOverride = reportName === 'Olivia Johnson' ? oliviaRoles : reportUser.roles;
        const matrixPayload = buildEmployeePayload(reportUser, {
          primary_matrix_manager_id: mgrId,
          roles: rolesOverride,
        });
        const mr = await api('/um/accounts/employee/', { method: 'PUT', body: JSON.stringify(matrixPayload) });
        if (mr.ok) matrixCount++; else matrixSkipped++;
      }
    }

    return {
      ok: true,
      message: `Olivia promoted; org chart refreshed; ${matrixCount}/${matrixCount + matrixSkipped} matrix-manager links set`,
    };
  }

  // The 9 seed users' HRBP + Primary Matrix Manager relationships — matches the manual demo.
  // Klaar's sign-up-v2 silently ignores these fields during workspace creation, so we set them
  // post-creation via PUT /um/accounts/employee/ for each user that needs an update.
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
  };

  async function applyHRBPAndMatrixManagers() {
    if (!state.users || !state.users.length) {
      const fr = await fetchUsers();
      if (!fr.ok) return { ok: false, message: 'Need users first; ' + fr.message };
    }

    // Build local-part → user lookup against current workspace state
    const byLocalPart = new Map();
    for (const u of state.users) {
      const lp = (u.email || '').split('@')[0];
      if (lp) byLocalPart.set(lp, u);
    }

    let updated = 0, skipped = 0, missing = 0;
    const detail = [];

    for (const [seedLp, rels] of Object.entries(SEED_RELATIONSHIPS)) {
      const u = byLocalPart.get(seedLp);
      if (!u) { missing++; detail.push(`SKIP ${seedLp}: not in workspace users`); continue; }

      const overrides = {};

      // HRBP — endpoint expects an email string at field "hrbp_email"
      if (rels.hrbp_email_localpart) {
        const hrbp = byLocalPart.get(rels.hrbp_email_localpart);
        if (hrbp) overrides.hrbp_email = hrbp.email;
        else detail.push(`WARN ${seedLp}: hrbp ${rels.hrbp_email_localpart} not found in workspace`);
      }

      // Primary Matrix Manager — endpoint expects org_user_id (UUID), NOT email, at field "primary_matrix_manager_id"
      if (rels.pmm_email_localpart) {
        const pmm = byLocalPart.get(rels.pmm_email_localpart);
        if (pmm && pmm.org_user_id) overrides.primary_matrix_manager_id = pmm.org_user_id;
        else detail.push(`WARN ${seedLp}: pmm ${rels.pmm_email_localpart} not found or missing org_user_id`);
      }

      if (Object.keys(overrides).length === 0) { skipped++; continue; }

      const payload = buildEmployeePayload(u, overrides);
      const r = await api('/um/accounts/employee/', { method: 'PUT', body: JSON.stringify(payload) });
      if (r.ok) {
        updated++;
        detail.push(`OK ${seedLp}: set ${Object.keys(overrides).join('+')}`);
      } else {
        skipped++;
        detail.push(`FAIL ${seedLp}: ${r.status} — ${(r.text || '').slice(0, 80)}`);
      }
    }

    // Refresh org chart so PMM links resolve in the UI
    try { await api('/um/accounts/org-chart/refresh/'); } catch {}

    const summary = `Applied HRBP+PMM: ${updated} updated, ${skipped} skipped, ${missing} missing in workspace`;
    console.log('[applyHRBPAndMatrixManagers]', summary, detail);
    return { ok: true, message: summary };
  }

  // mobile_number + grade per the manual demo workspace.
  // Use this when sign-up-v2 dropped these fields or for workspaces created before this seed data was added.
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
  };

  async function restoreSeedDetails() {
    if (!state.users || !state.users.length) {
      const fr = await fetchUsers();
      if (!fr.ok) return { ok: false, message: 'Need users first; ' + fr.message };
    }
    const byLocalPart = new Map();
    for (const u of state.users) {
      const lp = (u.email || '').split('@')[0];
      if (lp) byLocalPart.set(lp, u);
    }
    let updated = 0, skipped = 0, missing = 0;
    const detail = [];
    for (const [seedLp, fields] of Object.entries(SEED_DETAILS)) {
      const u = byLocalPart.get(seedLp);
      if (!u) { missing++; detail.push(`SKIP ${seedLp}: not in workspace`); continue; }
      const overrides = { mobile_number: fields.mobile_number, grade: fields.grade };
      const payload = buildEmployeePayload(u, overrides);
      const r = await api('/um/accounts/employee/', { method: 'PUT', body: JSON.stringify(payload) });
      if (r.ok) {
        updated++;
        detail.push(`OK ${seedLp}: mobile=${fields.mobile_number} grade=${fields.grade || '(empty)'}`);
      } else {
        skipped++;
        detail.push(`FAIL ${seedLp}: ${r.status} — ${(r.text || '').slice(0, 120)}`);
      }
    }
    const summary = `Restored seed details: ${updated} updated, ${skipped} skipped, ${missing} missing in workspace`;
    console.log('[restoreSeedDetails]', summary, detail);
    return { ok: true, message: summary };
  }

  // ----- GOAL CYCLES DOMAIN -----

  async function fetchTimePeriods() {
    const adminId = getAdminId();
    if (!adminId) return { ok: false, message: 'Admin user_id unknown — run "Fetch users" first.' };
    let page = 1, all = [], hasMore = true;
    while (hasMore && page < 30) {
      const url = `/okr/performance/time_period/?sheet_user_id=${adminId}&page=${page}&page_size=10`;
      const r = await api(url);
      if (!r.ok) return { ok: false, message: `Failed at page ${page}: ${r.status}` };
      const list = (r.data && r.data.results) || [];
      all.push(...list);
      hasMore = !!(r.data && r.data.next);
      page++;
    }
    state.timePeriods = all.map(tp => ({ id: tp.id, name: tp.name, start_at: tp.start_at, end_at: tp.end_at }));
    const cy = all.find(tp => /^CY\s/i.test(tp.name || ''));
    if (cy) state.timePeriodId = cy.id;
    saveState();
    return {
      ok: true,
      message: `Fetched ${all.length} time periods` + (cy ? `; CY = ${cy.name}` : ''),
      data: { count: all.length },
    };
  }

  async function createTimePeriods() {
    const adminId = getAdminId();
    if (!adminId) return { ok: false, message: 'Run "Fetch users" first.' };
    let groupId = state.workspaceGroupId;
    if (!groupId) {
      const fg = await fetchGroupsAction();
      if (!fg.ok) return { ok: false, message: 'Need a workspace group_id; ' + fg.message };
      groupId = state.workspaceGroupId;
      if (!groupId) return { ok: false, message: 'No usable workspace group found. Run "Create groups" first.' };
    }
    const year = new Date().getFullYear();
    const periods = [
      { name: `CY ${year}`, start_at: `${year}-01-01`, end_at: `${year}-12-31` },
      { name: `Q1 ${year}`, start_at: `${year}-01-01`, end_at: `${year}-03-31` },
      { name: `Q2 ${year}`, start_at: `${year}-04-01`, end_at: `${year}-06-30` },
      { name: `Q3 ${year}`, start_at: `${year}-07-01`, end_at: `${year}-09-30` },
      { name: `Q4 ${year}`, start_at: `${year}-10-01`, end_at: `${year}-12-31` },
    ];
    const created = [];
    for (const tp of periods) {
      const r = await api(`/okr/performance/time_period/?sheet_user_id=${adminId}`, {
        method: 'POST',
        body: JSON.stringify(Object.assign({}, tp, { groups: [groupId] })),
      });
      if (!r.ok) return { ok: false, message: `Created ${created.length}/5; failed at "${tp.name}" (${r.status}). Response: ${(r.text || '').slice(0,200)}` };
      created.push(r.data?.data?.name || tp.name);
      if (tp.name.startsWith('CY ')) state.timePeriodId = r.data?.data?.id;
      await new Promise(res => setTimeout(res, 200));
    }
    saveState();
    return { ok: true, message: `Created ${created.length} cycles: ${created.join(', ')}` };
  }

  async function createTestGoalCycle() {
    const adminId = getAdminId();
    if (!adminId) return { ok: false, message: 'Run "Fetch users" first or visit any Klaar page.' };
    let groupId = state.workspaceGroupId;
    if (!groupId) {
      // Discover group_id from existing time periods (less work than fetching all groups)
      const r = await api(`/okr/performance/time_period/?sheet_user_id=${adminId}`);
      if (r.ok) {
        groupId = r.data?.results?.[0]?.groups?.[0]?.group_id;
      }
    }
    if (!groupId) return { ok: false, message: 'No group_id available — fetch groups first.' };
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const payload = {
      name: `Test cycle ${stamp} (widget)`,
      start_at: '2027-01-01',
      end_at: '2027-12-31',
      groups: [groupId],
    };
    const r = await api(`/okr/performance/time_period/?sheet_user_id=${adminId}`, {
      method: 'POST', body: JSON.stringify(payload),
    });
    if (!r.ok) return { ok: false, message: `Failed (${r.status}): ${(r.text || '').slice(0,200)}` };
    return { ok: true, message: `Created "${r.data?.data?.name}"` };
  }

  // ----- REVIEWS DOMAIN -----

  async function fetchRatingScales() {
    const r = await api('/review/get_ratings_for_org', {
      method: 'POST',
      body: JSON.stringify({
        filters: [['status', '__in', ['In Use', 'Not In Use'], '']],
        limit: 50, offset: 1,
      }),
    });
    if (!r.ok) return { ok: false, message: `Failed: ${r.status}` };
    const scales = (r.data && r.data.data) || [];
    const targetName = 'Klaar Inbuilt 5 Point Rating Scale with Formal Label Names';
    const target = scales.find(s => s.name === targetName);
    state.ratingScales = scales.map(s => ({ id: s.id, name: s.name }));
    if (target) state.ratingScaleId = target.id;
    saveState();
    return {
      ok: true,
      message: `Fetched ${scales.length} rating scales` + (target ? `; target = ${target.id.slice(0, 8)}…` : '; target NOT found'),
      data: { count: scales.length },
    };
  }

  // ----- PLANS DOMAIN -----

  async function setupPlans() {
    const wsId = getWorkspaceId();
    if (!wsId) return { ok: false, message: 'workspace-id missing' };

    // The IDP/PIP "other_settings" block (stable across calls 11a & 11d, except srsds)
    function buildIdpOtherSettings(srsds) {
      return {
        toen: true, uepipg: true, uepipai: true, uepiptd: true,
        mepipg: true, mepipai: true, mepiptd: true, pipaidm: true,
        pipcg: true, pipcai: true, pipmg: 10, pipmai: 10, efrds: true,
        srsds: srsds, epipier: true, epipiec: true, piprdmta: 0,
        pipaem: true, pipaei: true, pipaeaa: true, pipaa: false, pipa: true,
        meidpg: true, meidpai: true, meidptd: true, mg: true, mai: true,
        idpa: true, idpr: true, pipr: true, pipauagt: true, pipauaat: true,
        pipmap: true, pipgdm: true, idpuaseg: true, idpuaseai: true,
        pipuaseg: true, pipuaseai: true, aicm: true, aidm: true, gcm: true,
        gdm: true, pdm: false,
        custom_labels: { idp: 'IDP', pip: 'PIP', action_item_name_column: 'Name', action_item: 'Action items', goals: 'Goals' },
        last_updated: new Date().toISOString(),
        allow_user_to_add_goal_type: true, allow_user_to_add_action_type: true,
        tracking_goal_and_action_item: 'status', maximum_action_items: 9,
        display_duedate_for_goal_and_action_items: false,
        allow_user_to_add_development_plan: true,
        goal_status_list: ['Getting Started', 'On Track', 'Completed'],
        workspace_admins_to_send_notification: [getAdminId()].filter(Boolean),
        reminder_configuration: {
          times: [], channels: ['EMAIL', 'SLACK'],
          monthly: { one: { days: [] }, two: { days: [] }, three: { days: [] }, four: { days: [] }, five: { days: [] } },
          time: '11:40',
          weekly: {
            days: [
              { times: [], channels: ['EMAIL', 'SLACK'], time: '11:40', day: 'THURSDAY' },
              { times: [], channels: ['EMAIL', 'SLACK'], time: '11:40', day: 'FRIDAY' },
            ],
          },
          every_hour: false,
        },
        action_item_status_list: ['Getting Started', 'On Track', 'Completed'],
        allow_user_to_add_date_action_items: true, maximum_goals: 10,
        AICM: true, AIDM: true, GCM: true, GDM: true, PDM: false,
      };
    }

    const pasUrl = `/pas/api/v1/pas/${wsId}`;

    // Call 1: baseline PAS update (srsds=[])
    let r = await api(pasUrl, {
      method: 'PATCH',
      body: JSON.stringify({
        org_level: { allowed_modules: { idp: {
          other_settings: buildIdpOtherSettings([]),
          sub_modules: {
            development_plans: { is_visible: true },
            my_team: { is_visible: true },
            admin_overview: { is_visible: true },
            admin_development_plans: { is_visible: true },
          },
        }}},
      }),
    });
    if (!r.ok) return { ok: false, message: `Step 1 (PAS baseline) failed: ${r.status}` };

    // Calls 2-7 + 9-11: classification types
    const classifications = [
      { type_name: 'Quantifiable',     classification_for: 'goal',        plan_type: 'pip' },
      { type_name: 'Qualitative',      classification_for: 'goal',        plan_type: 'pip' },
      // After classifications above, we re-PATCH PAS with srsds populated:
      { __pasSrsdsUpdate: true },
      { type_name: 'Behavioral',       classification_for: 'goal',        plan_type: 'idp' },
      { type_name: 'Technical',        classification_for: 'goal',        plan_type: 'idp' },
      { type_name: 'On-the-job',       classification_for: 'action_item', plan_type: 'idp' },
      { type_name: 'Peer',             classification_for: 'action_item', plan_type: 'idp' },
      { type_name: 'Formal classroom', classification_for: 'action_item', plan_type: 'idp' },
    ];
    let stepN = 2;
    for (const c of classifications) {
      if (c.__pasSrsdsUpdate) {
        // We don't have a known srsds rating-scale id from script (it was hardcoded);
        // skip the srsds update or use ratingScaleId if discovered.
        const srsds = state.ratingScaleId ? [state.ratingScaleId] : [];
        if (srsds.length) {
          r = await api(pasUrl, {
            method: 'PATCH',
            body: JSON.stringify({
              org_level: { allowed_modules: { idp: { other_settings: buildIdpOtherSettings(srsds) }}},
            }),
          });
          if (!r.ok) return { ok: false, message: `Step ${stepN} (PAS srsds) failed: ${r.status}` };
        }
      } else {
        r = await api('/idp/idp/settings/classification_type/', {
          method: 'POST', body: JSON.stringify(c),
        });
        if (!r.ok) return { ok: false, message: `Step ${stepN} (classification "${c.type_name}") failed: ${r.status}` };
      }
      stepN++;
    }
    return { ok: true, message: `Configured PAS + ${classifications.length - 1} classification types (PIP: 2, IDP: 5)` };
  }

  // ============================================================
  // FEEDBACK TEMPLATES (review + engagement)
  // ============================================================

  function _uuid() { return (crypto.randomUUID ? crypto.randomUUID() : ('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r=Math.random()*16|0; return (c==='x'?r:(r&0x3|0x8)).toString(16); }))); }

  const _TEMPLATE_PERSONA_BASE = {
    persona_config: { SELF: false, L1_MANAGER: false, L2_MANAGER: false, DIRECT_REPORTS: false, DIRECT_REPORTS_OF_DIRECT_REPORTS: false, PRIMARY_MATRIX_MANAGER: false, SECONDARY_MATRIX_MANAGER: false, PEERS: false, STAKEHOLDERS: false },
    data: [],
  };

  function _qText(question, isRequired = true, labelVisibility = true) {
    return { is_required: isRequired, label_visibility: labelVisibility, id: _uuid(), comment_box: 'NOT_APPLICABLE', view: 'HORIZONTAL', translations: {}, hide_question_in_pms_reports: false, persona_customization: _TEMPLATE_PERSONA_BASE, question_type: 'only_text', question, has_comments: {}, options: [] };
  }
  function _qMultiSelect(question, options, isRequired = true, labelVisibility = false) {
    return { is_required: isRequired, label_visibility: labelVisibility, id: _uuid(), comment_box: 'NOT_APPLICABLE', view: 'HORIZONTAL', translations: {}, hide_question_in_pms_reports: false, persona_customization: _TEMPLATE_PERSONA_BASE, allow_multiple_answers: true, allow_minimum_select: 2, allow_maximum_select: 3, allow_select_all: false, allow_select_none: false, question_type: 'multi_select', question, options: options.map(o => ({ choice_name: o })), has_comments: { is_visible: false, is_mandatory: false } };
  }
  function _qChoice(question, opts, isRequired = true, labelVisibility = false) {
    return { is_required: isRequired, label_visibility: labelVisibility, id: _uuid(), comment_box: 'NOT_APPLICABLE', view: 'DROPDOWN', translations: {}, hide_question_in_pms_reports: false, persona_customization: _TEMPLATE_PERSONA_BASE, question_type: 'multiple_choice', question, options: opts.map((o, i) => ({ choice_name: o.name, label: String(i+1), weight: String(i+1), opt_out: false })), has_comments: { is_visible: false, is_mandatory: false } };
  }
  function _qNPS(question) {
    const options = []; for (let i = 1; i <= 10; i++) options.push({ choice_name: String(i), weight: i });
    return { id: _uuid(), is_required: true, translations: {}, comment_box: 'NOT_APPLICABLE', view: 'HORIZONTAL', question_type: 'enps', question, has_comments: { is_visible: false, is_mandatory: false }, label_visibility: false, options };
  }
  function _qLikert(question) {
    const opts = [
      { name: 'Strongly disagree', label: '1', weight: 1 },
      { name: 'Disagree',          label: '2', weight: 2 },
      { name: 'Neither agree nor disagree', label: '3', weight: 3 },
      { name: 'Agree',             label: '4', weight: 4 },
      { name: 'Strongly Agree',    label: '5', weight: 5 },
    ];
    return { id: _uuid(), is_required: true, translations: {}, persona_customization: _TEMPLATE_PERSONA_BASE, hide_question_in_pms_reports: false, comment_box: 'NOT_APPLICABLE', view: 'HORIZONTAL', question_type: 'multiple_choice', question, options: opts.map(o => ({ choice_name: o.name, label: o.label, weight: o.weight, opt_out: false })), has_comments: { is_visible: false, is_mandatory: false }, label_visibility: true };
  }

  function _templatePayload(name, description, questions, type = '360', extra = {}) {
    return Object.assign({ name, long_description: description, short_description: description, audience_description: description, created_by: null, questions, type, has_persona_customization: false, org_id: getWorkspaceId(), id: '', status: 'PUBLISHED' }, extra);
  }

  const _CORE_THREE_QS = () => [
    _qText('What are the top 2 achievements for this person this quarter?'),
    _qText('What are the top 2 things they could have done better this quarter?'),
    _qMultiSelect('\nWhich 2 values of the organization did they live up to the most and why?',
      ['Bias for action','Think deeply, act quickly','Customer obsession','Default to trust','Set benchmarks','Run upwards']),
  ];
  const _PROMOTION_Q = () => _qChoice('Would you recommend this person for a promotion and why?', [{name:'Yes'},{name:'No'}]);

  function _peerTemplate() { return _templatePayload('Peer Reflection Template', 'Peer reflection template', _CORE_THREE_QS()); }
  function _managerTemplate() {
    const qs = _CORE_THREE_QS();
    qs.push(_PROMOTION_Q());
    qs.push(_qChoice("How would you rate this person's leadership potential?",
      [{name:'Excellent'},{name:'Good'},{name:'Average'},{name:'Needs Improvement'}]));
    return _templatePayload('Manager Reflection Template', 'Manager reflection template', qs);
  }
  function _selfTemplate() {
    const qs = _CORE_THREE_QS();
    qs.push(_PROMOTION_Q());
    qs.push(_qChoice('How would you rate your own growth and development this quarter?',
      [{name:'Significant Growth'},{name:'Moderate Growth'},{name:'Steady Progress'},{name:'Needs More Focus'}]));
    return _templatePayload('Self Reflection Template', 'Self reflection template', qs);
  }
  function _engagementTemplate() {
    const qs = [
      _qNPS('How likely are you to recommend your company as a place to work to a friend or colleague?'),
      _qLikert('I am satisfied with my job'),
      _qLikert('I am satisfied with my work-life balance'),
      _qLikert('I am satisfied with the support I receive from my manager'),
      _qLikert('I am satisfied with the opportunities I receive for my career growth'),
      _qLikert('I am satisfied with my compensation and benefits'),
      _qLikert('I am satisfied with the teamwork and collaboration in my department'),
      _qLikert('I am satisfied with the company culture and values'),
      _qLikert('I am satisfied with communication from leadership?'),
      _qLikert('I am satisfied with recognition and appreciation for your work?'),
    ];
    return _templatePayload('Annual Engagement Survey Template', 'Annual employee engagement survey template with NPS and rating scale questions', qs, 'Normal', { deleted_questions: [] });
  }

  async function _postTemplate(payload) {
    const r = await api('/surveyms/create_template', { method: 'POST', body: JSON.stringify(payload) });
    return r;
  }
  async function _fetchTemplatesByName(names) {
    const r = await api('/surveyms/get_template_for_org?is_reduced_data=false', {
      method: 'POST',
      body: JSON.stringify({ offset: 1, limit: 100, filters: { name: [], status: '', type: [], is_deleted: false }, sort: { sort_field: 'created_at', sort_order: 'desc' } }),
    });
    if (!r.ok) return { ok: false, message: `Fetch templates failed: ${r.status}` };
    const list = (r.data && (r.data.results || r.data.data)) || (Array.isArray(r.data) ? r.data : []);
    const found = {};
    for (const n of names) {
      const t = list.find(x => (x.name || x.template_name) === n);
      if (t) found[n] = t.id || t.template_id || t._id;
    }
    return { ok: true, found };
  }

  async function createReviewTemplates() {
    const wantNames = ['Peer Reflection Template', 'Manager Reflection Template', 'Self Reflection Template'];
    const created = [];
    for (const tpl of [_peerTemplate(), _managerTemplate(), _selfTemplate()]) {
      const r = await _postTemplate(tpl);
      if (!r.ok) return { ok: false, message: `Failed to create "${tpl.name}": ${r.status} — ${(r.text||'').slice(0,120)}` };
      created.push(tpl.name);
    }
    const lookup = await _fetchTemplatesByName(wantNames);
    if (lookup.ok) {
      state.reviewTemplateIds = Object.assign({}, state.reviewTemplateIds || {}, lookup.found);
      saveState();
    }
    return { ok: true, message: `Created ${created.length} review templates: ${created.join(', ')}` };
  }

  async function createEngagementTemplate() {
    const tpl = _engagementTemplate();
    const r = await _postTemplate(tpl);
    if (!r.ok) return { ok: false, message: `Failed to create "${tpl.name}": ${r.status} — ${(r.text||'').slice(0,120)}` };
    const lookup = await _fetchTemplatesByName([tpl.name]);
    if (lookup.ok && lookup.found[tpl.name]) {
      state.engagementTemplateId = lookup.found[tpl.name];
      saveState();
    }
    return { ok: true, message: `Created engagement template: ${tpl.name}` };
  }

  // ============================================================
  // REVIEWS — Yearly / Mid-Year / Quarterly
  // ============================================================
  // Generic 12-call review create+publish. Differs by:
  //   - fromTemplate: 'yearEnd' | 'midYear' | 'quarterly'
  //   - reviewName, timePeriodFinder
  //   - end_date (only for yearly/mid-year)

  function _findCompanyGroupId() {
    if (!state.groups || !state.groups.length) return null;
    // Prefer "All Company" (created by createGroups), else workspace group, else any with "company" or "workspace"
    const allCompany = state.groups.find(g => /^all\s*company$/i.test(g.name || ''));
    const wsGroup = state.groups.find(g => /workspace\s*group/i.test(g.name || ''));
    const partial = state.groups.find(g => /(all\s*company|company\s*workspace)/i.test(g.name || ''));
    return (allCompany || wsGroup || partial || state.groups[0])?.id || null;
  }

  function _findTimePeriodId(matcher) {
    if (!state.timePeriods || !state.timePeriods.length) return null;
    const tp = state.timePeriods.find(t => matcher.test(t.name || ''));
    return tp ? { id: tp.id, name: tp.name } : null;
  }

  function _quarterlyEvalParams(ratingScaleId) {
    const dataItem = (id, name, opOverride = 'OPTIONAL') => ({
      id, name,
      reviewees_goals:    { comments: 'MANDATORY', ratings: 'OPTIONAL', field_settings: 'BOTH' },
      feedback_form:      { survey: { name: '', id: '' }, status: 'MANDATORY' },
      competencies:       { comments: 'MANDATORY', ratings: 'OPTIONAL', field_settings: 'ALL' },
      overall_performance:{ comments: 'MANDATORY', ratings: opOverride },
    });
    return {
      headers_config: { no: true, reviewees_goals: false, feedback_form: false, competencies: false, overall_performance: true, reviewers: true },
      reviewers_config: { PAST_L1_MANAGER: false, DIRECT_REPORTS: false, PEERS: false, SECONDARY_MATRIX_MANAGER: false, L1_MANAGER: true, SELF: true, PRIMARY_MATRIX_MANAGER: false, DEPARTMENT_HEAD: false, L2_MANAGER: false },
      data: [
        dataItem('SELF', 'Self', 'MANDATORY'),
        dataItem('L1_MANAGER', 'Manager', 'MANDATORY'),
        dataItem('L2_MANAGER', 'Skip Manager'),
        dataItem('DIRECT_REPORTS', 'Direct Reports'),
        dataItem('PEERS', 'Peers'),
        dataItem('PAST_L1_MANAGER', 'Previous Manager'),
        dataItem('PRIMARY_MATRIX_MANAGER', 'Primary Matrix Manager'),
        dataItem('SECONDARY_MATRIX_MANAGER', 'Secondary Matrix Manager'),
        dataItem('DEPARTMENT_HEAD', 'Department Head'),
      ],
      rating_scale_ids: {
        overall_performance: ratingScaleId,
        reviewees_goals:     ratingScaleId,
        competencies:        ratingScaleId,
      },
    };
  }

  async function _createReview(opts) {
    // Prereqs
    if (!state.groups || !state.groups.length) { const g = await fetchGroupsAction(); if (!g.ok) return { ok: false, message: 'Need groups first; ' + g.message }; }
    if (!state.timePeriods || !state.timePeriods.length) { const t = await fetchTimePeriods(); if (!t.ok) return { ok: false, message: 'Need time periods first; ' + t.message }; }
    if (!state.ratingScaleId) { const rs = await fetchRatingScales(); if (!rs.ok) return { ok: false, message: 'Need rating scale first; ' + rs.message }; }

    const groupId = _findCompanyGroupId();
    if (!groupId) return { ok: false, message: '"All Company"-style group not found. Run createGroups first.' };

    const tp = _findTimePeriodId(opts.timePeriodMatcher);
    if (!tp) return { ok: false, message: `Time period not found (matcher ${opts.timePeriodMatcher}). Run createTimePeriods first.` };

    // Call 1: create from template
    const r1 = await api(`/reviewj/api/v1/reviews/?fromTemplate=${opts.fromTemplate}`, { method: 'POST', body: JSON.stringify({}) });
    if (!r1.ok) return { ok: false, message: `Call 1 (create) failed: ${r1.status} — ${(r1.text||'').slice(0,120)}` };
    const reviewId = r1.data?.data?.id || r1.data?.id;
    if (!reviewId) return { ok: false, message: 'Call 1 succeeded but no review id returned' };

    const reviewsUrl = `/reviewj/api/v1/reviews/?reviewId=${reviewId}`;
    const updateUrl  = `/review/update_review_for_review_id/${reviewId}`;
    const patch = (url, body) => api(url, { method: 'PATCH', body: JSON.stringify(body) });

    // Yearly + mid-year set end_date too
    if (opts.endDate) {
      const r1b = await patch(reviewsUrl, { end_date: opts.endDate });
      if (!r1b.ok) return { ok: false, message: `Call 1b (end_date) failed: ${r1b.status}` };
    }

    const calls = [
      [reviewsUrl, { name: opts.reviewName }, 'name'],
      [reviewsUrl, { config_chapter_status: { settings: true } }, 'settings'],
      [updateUrl,  { reviewees: [groupId] },                       'reviewees'],
      [reviewsUrl, { config_chapter_status: { reviewees: true } }, 'reviewees-status'],
      [updateUrl,  { time_period: tp },                            'time_period'],
      [reviewsUrl, { config_chapter_status: { reviewers: true } }, 'reviewers-status'],
      [updateUrl,  { evaluation_parameters: _quarterlyEvalParams(state.ratingScaleId) }, 'evaluation_parameters'],
      [reviewsUrl, { config_chapter_status: { reviewersScope: true } }, 'reviewersScope'],
      [reviewsUrl, { config_chapter_status: { nudges: true } },         'nudges'],
      [reviewsUrl, { config_chapter_status: { optionalSettings: true } }, 'optionalSettings'],
      [updateUrl,  { state: 'Published' },                              'publish'],
    ];
    let n = 2;
    for (const [url, body, label] of calls) {
      const r = await patch(url, body);
      if (!r.ok) return { ok: false, message: `Call ${n} (${label}) failed: ${r.status} — ${(r.text||'').slice(0,120)}` };
      n++;
    }
    state.lastReviewId = reviewId;
    saveState();
    return { ok: true, message: `Review "${opts.reviewName}" published (id ${reviewId.slice(0,8)}…)` };
  }

  function _currentYear() { return new Date().getFullYear(); }
  function _currentQuarterName() {
    const m = new Date().getMonth() + 1;
    const q = m <= 3 ? 'Q1' : m <= 6 ? 'Q2' : m <= 9 ? 'Q3' : 'Q4';
    return `${q} ${_currentYear()}`;
  }

  async function createYearlyReview() {
    const y = _currentYear();
    return _createReview({
      fromTemplate: 'yearEnd',
      reviewName: `Year-End Review ${y}`,
      timePeriodMatcher: new RegExp(`^CY\\s+${y}$`, 'i'),
      endDate: `${y}-12-30T23:59:59.000Z`,
    });
  }

  async function createMidYearReview() {
    const y = _currentYear();
    return _createReview({
      fromTemplate: 'midYear',
      reviewName: `Mid-Year Review ${y}`,
      timePeriodMatcher: new RegExp(`^CY\\s+${y}$`, 'i'),
      endDate: `${y}-12-30T23:59:59.000Z`,
    });
  }

  async function createQuarterlyReview() {
    const q = _currentQuarterName();
    return _createReview({
      fromTemplate: 'quarterly',
      reviewName: q,
      timePeriodMatcher: new RegExp(`^${q.replace(/\s+/g,'\\s+')}$`, 'i'),
    });
  }

  // ----- ACTIONS REGISTRY -----

  const ACTIONS = {
    // Users (5 wired, 1 stubbed)
    fetchUsers:                { label: 'Fetch users',                                      fn: fetchUsers },
    promoteOliviaToAdmin:      { label: 'Promote Olivia to ADMIN + org chart setup',        fn: promoteOliviaToAdmin },
    createGroups:              { label: 'Create groups (People & Culture + All Company)',   fn: createGroups },
    fetchGroups:               { label: 'Fetch groups',                                     fn: fetchGroupsAction },
    updateAdminManager:        { label: "Set Olivia as Admin's manager",                    fn: updateAdminManager },
    applyHRBPAndMatrixManagers:{ label: 'Apply HRBP + Primary Matrix Manager (9 seed users)',fn: applyHRBPAndMatrixManagers },
    restoreSeedDetails:        { label: 'Restore mobile + grade for 9 seed users',           fn: restoreSeedDetails },

    // Goal Cycles (3 wired)
    createTimePeriods:         { label: 'Create CY + Q1-Q4 cycles for current year',        fn: createTimePeriods },
    fetchTimePeriods:          { label: 'Fetch time periods',                               fn: fetchTimePeriods },
    createTestGoalCycle:       { label: 'Create one test cycle (smoke test)',               fn: createTestGoalCycle },

    // Competencies (4 stubbed — file uploads needed)
    uploadCompetencies:        { label: 'Upload competencies (CSV)',                        fn: notImplemented('POST /review/bulk_upload_competency multipart with bulk-upload-competencies.csv. Needs file picker.') },
    mapCompetencies:           { label: 'Map competencies (CSV)',                           fn: notImplemented('PATCH /review/bulk_upload_competency_mapping multipart with bulk-upload-competencies-mapping.csv. Needs file picker.') },
    setCompetencyRatingScale:  { label: 'Set competency rating scale',                      fn: notImplemented('PATCH /um/accounts/display_settings/{wsId}/ to enable a found rating scale (e.g., "CLAR 5-point scale with formal rating labels") for competencies.') },
    bulkRateCompetencies:      { label: 'Auto-rate competencies (random)',                  fn: notImplemented('GET /review/get_bulk_competency_rating_template → randomly fill ratings → POST /review/bulk_import_competency_ratings (multipart).') },

    // Goals & OKRs (5 stubbed — most are file uploads or complex)
    bulkImportGoals:           { label: 'Bulk import goals (CSV, per cycle)',               fn: notImplemented('For each time period: POST /okr/performance/bulk_import/?time_period_id=... with bulk_goal_import_payload.csv (titles get suffixed with cycle id like " - Q12026"). Needs file picker.') },
    bulkCheckinGoals:          { label: 'Bulk check-in all goals (random)',                 fn: notImplemented('Fetch all goals + child KRs for current TIME_PERIOD_ID, then POST check-ins with random Way Ahead/On Track/Behind/At Risk and progress 10-40%.') },
    createSingleGoal:          { label: 'Create one test goal',                             fn: notImplemented('POST /okr/performance/objective/?sheet_user_id={admin} with full objective payload (see old_ones_single_actions/create-goal.js).') },
    addTestKR:                 { label: 'Add one test KR (under existing goal)',            fn: notImplemented('POST /okr/performance/objective/?sheet_user_id={admin} with node_type=KR + parent_node id (see old_ones_single_actions/add-kr.js).') },
    aiGoalsSetup:              { label: 'AI goals setup (advanced)',                        fn: notImplemented('Multi-call AI flow: create goal library category → POST /okr/performance/ai/generate_task → poll task_status → POST /okr/performance/ai/add_to_library.') },

    // 1-on-1s (1 stubbed)
    createOneOnOnes:           { label: 'Create 10-15 1-on-1 relationships',                fn: notImplemented('Generate 10-15 random relationships from users.csv (≥5 with Olivia Johnson), bulk-upload via the 1-on-1s API.') },

    // Feedback Templates (2 wired)
    createReviewTemplates:     { label: 'Create review templates (Peer/Manager/Self)',      fn: createReviewTemplates },
    createEngagementTemplate:  { label: 'Create engagement template (10 questions)',        fn: createEngagementTemplate },

    // Reviews (4 wired)
    fetchRatingScales:         { label: 'Fetch rating scales (prereq)',                     fn: fetchRatingScales },
    createYearlyReview:        { label: 'Create yearly review (Year-End {YEAR})',           fn: createYearlyReview },
    createMidYearReview:       { label: 'Create mid-year review (Mid-Year {YEAR})',         fn: createMidYearReview },
    createQuarterlyReview:     { label: 'Create quarterly review (current Q)',              fn: createQuarterlyReview },

    // Surveys (1 stubbed)
    createEngagementSurvey:    { label: 'Create + publish engagement survey',               fn: notImplemented('5-call sequence: POST /surveyms/create_normal_survey → 3× update_normal_survey (type/respondents/dates) → publish_normal_survey. Start time = now-2h.') },

    // Plans (1 wired)
    setupPlans:                { label: 'Configure IDP/PIP plan settings',                  fn: setupPlans },
  };

  // ===== DOMAINS registry =====
  const DOMAINS = [
    { id: 'users',        title: 'Users',              actionIds: ['fetchUsers', 'promoteOliviaToAdmin', 'createGroups', 'fetchGroups', 'updateAdminManager', 'applyHRBPAndMatrixManagers', 'restoreSeedDetails'] },
    { id: 'cycles',       title: 'Goal Cycles',        actionIds: ['createTimePeriods', 'fetchTimePeriods', 'createTestGoalCycle'] },
    { id: 'competencies', title: 'Competencies',       actionIds: ['uploadCompetencies', 'mapCompetencies', 'setCompetencyRatingScale', 'bulkRateCompetencies'] },
    { id: 'goals',        title: 'Goals & OKRs',       actionIds: ['bulkImportGoals', 'bulkCheckinGoals', 'createSingleGoal', 'addTestKR', 'aiGoalsSetup'] },
    { id: 'oneonones',    title: '1-on-1s',            actionIds: ['createOneOnOnes'] },
    { id: 'templates',    title: 'Feedback Templates', actionIds: ['createReviewTemplates', 'createEngagementTemplate'] },
    { id: 'reviews',      title: 'Reviews',            actionIds: ['fetchRatingScales', 'createYearlyReview', 'createMidYearReview', 'createQuarterlyReview'] },
    { id: 'surveys',      title: 'Surveys',            actionIds: ['createEngagementSurvey'] },
    { id: 'plans',        title: 'Plans (IDP/PIP)',    actionIds: ['setupPlans'] },
  ];

  // ===== UI state =====
  let isCollapsed = false;
  let activeTab = 'seeds';
  const openSections = new Set(['users']);

  // ===== Styles =====
  const css = [
    '#klaar-ae-pill, #klaar-ae-panel, #klaar-ae-toasts {',
    '  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;',
    '  box-sizing: border-box;',
    '}',
    '#klaar-ae-pill *, #klaar-ae-panel *, #klaar-ae-toasts * { box-sizing: border-box; }',
    '#klaar-ae-pill {',
    '  position: fixed; right: 0; top: 50%; transform: translateY(-50%);',
    '  z-index: 999999; background: #c44; color: #fff;',
    '  writing-mode: vertical-rl; text-orientation: mixed;',
    '  padding: 14px 8px; border-radius: 8px 0 0 8px;',
    '  cursor: pointer; font-weight: 600; font-size: 13px; letter-spacing: 0.5px;',
    '  box-shadow: -2px 0 8px rgba(0,0,0,0.12); user-select: none;',
    '  transition: background 0.15s;',
    '}',
    '#klaar-ae-pill:hover { background: #a33; }',
    '#klaar-ae-panel {',
    '  position: fixed; right: 16px; top: 50%; transform: translateY(-50%);',
    '  z-index: 999999; width: 320px; max-height: 80vh;',
    '  background: #fff; color: #222;',
    '  border-radius: 12px; border: 1px solid #e5e5e5;',
    '  box-shadow: 0 12px 32px rgba(0,0,0,0.18);',
    '  display: flex; flex-direction: column; font-size: 13px; overflow: hidden;',
    '}',
    '#klaar-ae-panel header {',
    '  display: flex; align-items: center; justify-content: space-between;',
    '  padding: 12px 14px; border-bottom: 1px solid #eee; background: #fafafa;',
    '}',
    '#klaar-ae-panel header .title { font-size: 14px; font-weight: 600; color: #111; }',
    '#klaar-ae-panel header .ctrls { display: flex; gap: 4px; }',
    '#klaar-ae-panel header .ctrls span {',
    '  cursor: pointer; color: #888; font-size: 16px; line-height: 1;',
    '  width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center;',
    '  border-radius: 4px;',
    '}',
    '#klaar-ae-panel header .ctrls span:hover { background: #ececec; color: #333; }',
    '#klaar-ae-panel .tabs { display: flex; border-bottom: 1px solid #eee; }',
    '#klaar-ae-panel .tabs .tab {',
    '  flex: 1; text-align: center; padding: 10px 12px;',
    '  cursor: pointer; font-size: 12px; font-weight: 500; color: #666;',
    '  border-bottom: 2px solid transparent; user-select: none;',
    '}',
    '#klaar-ae-panel .tabs .tab.active { color: #c44; border-bottom-color: #c44; }',
    '#klaar-ae-panel .tabs .tab:hover:not(.active) { color: #333; background: #fafafa; }',
    '#klaar-ae-panel .content { flex: 1; overflow-y: auto; padding: 6px 0; }',
    '#klaar-ae-panel .section { border-bottom: 1px solid #f5f5f5; }',
    '#klaar-ae-panel .section:last-child { border-bottom: 0; }',
    '#klaar-ae-panel .section-header {',
    '  padding: 10px 14px; cursor: pointer;',
    '  display: flex; align-items: center; justify-content: space-between;',
    '  font-weight: 500; color: #333; user-select: none;',
    '}',
    '#klaar-ae-panel .section-header:hover { background: #fafafa; }',
    '#klaar-ae-panel .section-header .caret {',
    '  transition: transform 0.15s; color: #999; font-size: 10px; display: inline-block;',
    '}',
    '#klaar-ae-panel .section.open .caret { transform: rotate(90deg); }',
    '#klaar-ae-panel .section-body { display: none; padding: 4px 14px 10px; }',
    '#klaar-ae-panel .section.open .section-body { display: block; }',
    '#klaar-ae-panel .section-body button {',
    '  display: block; width: 100%; padding: 8px 10px; margin-bottom: 6px;',
    '  background: #c44; color: #fff; border: 0; border-radius: 6px;',
    '  font-size: 12px; cursor: pointer; font-weight: 500; text-align: left;',
    '  transition: background 0.12s;',
    '}',
    '#klaar-ae-panel .section-body button:hover { background: #a33; }',
    '#klaar-ae-panel .section-body button:disabled { background: #aaa; cursor: not-allowed; }',
    '#klaar-ae-panel .section-body button.run-all { background: #333; }',
    '#klaar-ae-panel .section-body button.run-all:hover { background: #111; }',
    '#klaar-ae-panel .section-body button.stub { background: #999; }',
    '#klaar-ae-panel .section-body button.stub:hover { background: #777; }',
    '#klaar-ae-panel .section-body .empty {',
    '  color: #999; font-size: 11px; font-style: italic; padding: 4px 0;',
    '}',
    '#klaar-ae-panel .walkthroughs-empty {',
    '  padding: 32px 16px; text-align: center; color: #999; font-size: 12px;',
    '}',
    '#klaar-ae-panel .meta {',
    '  padding: 6px 14px; border-top: 1px solid #eee;',
    '  color: #999; font-size: 10px; text-align: center; background: #fafafa;',
    '}',
    '#klaar-ae-toasts {',
    '  position: fixed; bottom: 16px; left: 16px; z-index: 1000000;',
    '  display: flex; flex-direction: column-reverse; gap: 8px; pointer-events: none;',
    '}',
    '#klaar-ae-toasts .toast {',
    '  pointer-events: auto;',
    '  background: #333; color: #fff; padding: 10px 14px; border-radius: 8px;',
    '  font-size: 12px; max-width: 360px;',
    '  box-shadow: 0 4px 16px rgba(0,0,0,0.2);',
    '  animation: klaar-toast-in 0.2s ease-out; cursor: pointer;',
    '  word-wrap: break-word; white-space: pre-wrap;',
    '}',
    '#klaar-ae-toasts .toast.ok { background: #1e6e36; }',
    '#klaar-ae-toasts .toast.err { background: #a51c1c; }',
    '#klaar-ae-toasts .toast.warn { background: #946800; }',
    '#klaar-ae-toasts .toast.fading { animation: klaar-toast-out 0.3s ease-in forwards; }',
    '@keyframes klaar-toast-in {',
    '  from { opacity: 0; transform: translateY(8px); }',
    '  to { opacity: 1; transform: translateY(0); }',
    '}',
    '@keyframes klaar-toast-out {',
    '  from { opacity: 1; transform: translateY(0); }',
    '  to { opacity: 0; transform: translateY(-8px); }',
    '}',
  ].join('\n');

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ===== Toast manager =====
  const toastsContainer = document.createElement('div');
  toastsContainer.id = 'klaar-ae-toasts';
  document.body.appendChild(toastsContainer);

  function showToast(message, kind) {
    const toast = document.createElement('div');
    toast.className = 'toast' + (kind ? ' ' + kind : '');
    toast.textContent = message;
    toastsContainer.appendChild(toast);
    let removed = false;
    function remove() {
      if (removed) return;
      removed = true;
      toast.classList.add('fading');
      setTimeout(function () { toast.remove(); }, 300);
    }
    toast.addEventListener('click', remove);
    setTimeout(remove, kind === 'warn' ? 7000 : 4500);
  }

  // ===== UI: Pill =====
  const pill = document.createElement('div');
  pill.id = 'klaar-ae-pill';
  pill.textContent = 'Klaar';
  pill.title = 'Open Klaar AE widget';
  pill.style.display = 'none';
  document.body.appendChild(pill);
  pill.addEventListener('click', function () { isCollapsed = false; render(); });

  // ===== UI: Panel =====
  const panel = document.createElement('div');
  panel.id = 'klaar-ae-panel';
  document.body.appendChild(panel);

  function isStub(actionId) {
    // Heuristic: stubs use the notImplemented helper. Compare fn references.
    const a = ACTIONS[actionId];
    if (!a) return false;
    return a.fn.name === '' || a.fn.toString().indexOf('Not yet wired') !== -1;
  }

  function renderHeader() {
    return [
      '<header>',
      '  <span class="title">Klaar AE Widget</span>',
      '  <span class="ctrls">',
      '    <span class="minimize" title="Minimize">–</span>',
      '    <span class="close" title="Close">×</span>',
      '  </span>',
      '</header>',
    ].join('');
  }

  function renderTabs() {
    return [
      '<div class="tabs">',
      '  <div class="tab' + (activeTab === 'seeds' ? ' active' : '') + '" data-tab="seeds">Seeds</div>',
      '  <div class="tab' + (activeTab === 'walkthroughs' ? ' active' : '') + '" data-tab="walkthroughs">Walkthroughs</div>',
      '</div>',
    ].join('');
  }

  function renderSeeds() {
    return DOMAINS.map(function (d) {
      const open = openSections.has(d.id);
      let bodyHtml;
      if (d.actionIds.length === 0) {
        bodyHtml = '<div class="empty">Coming soon</div>';
      } else {
        const wiredCount = d.actionIds.filter(function (aid) { return !isStub(aid); }).length;
        const runAll = d.actionIds.length > 1 && wiredCount > 1
          ? '<button class="run-all" data-runall="' + d.id + '">Run all wired in ' + d.title + ' (' + wiredCount + ')</button>'
          : '';
        const items = d.actionIds.map(function (aid) {
          const cls = isStub(aid) ? ' class="stub"' : '';
          return '<button' + cls + ' data-action="' + aid + '">' + ACTIONS[aid].label + '</button>';
        }).join('');
        bodyHtml = runAll + items;
      }
      return [
        '<div class="section' + (open ? ' open' : '') + '" data-section="' + d.id + '">',
        '  <div class="section-header"><span>' + d.title + '</span><span class="caret">▶</span></div>',
        '  <div class="section-body">' + bodyHtml + '</div>',
        '</div>',
      ].join('');
    }).join('');
  }

  function renderWalkthroughs() {
    return '<div class="walkthroughs-empty">Walkthroughs coming soon.</div>';
  }

  function renderContent() {
    const inner = activeTab === 'seeds' ? renderSeeds() : renderWalkthroughs();
    return '<div class="content">' + inner + '</div>';
  }

  function renderMeta() {
    return '<div class="meta">' + location.host + ' &rarr; ' + API_BASE + '</div>';
  }

  function render() {
    if (isCollapsed) { panel.style.display = 'none'; pill.style.display = ''; return; }
    pill.style.display = 'none';
    panel.style.display = '';
    panel.innerHTML = renderHeader() + renderTabs() + renderContent() + renderMeta();

    panel.querySelector('.minimize').addEventListener('click', function () { isCollapsed = true; render(); });
    panel.querySelector('.close').addEventListener('click', function () {
      panel.remove(); pill.remove(); toastsContainer.remove(); style.remove();
      window.__klaarAEWidget = false;
    });
    panel.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () { activeTab = tab.dataset.tab; render(); });
    });
    panel.querySelectorAll('.section').forEach(function (section) {
      const id = section.dataset.section;
      section.querySelector('.section-header').addEventListener('click', function () {
        if (openSections.has(id)) openSections.delete(id); else openSections.add(id);
        render();
      });
    });
    panel.querySelectorAll('button[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () { runAction(btn.dataset.action, btn); });
    });
    panel.querySelectorAll('button[data-runall]').forEach(function (btn) {
      btn.addEventListener('click', function () { runAllInDomain(btn.dataset.runall, btn); });
    });
  }

  async function runAction(actionId, btn) {
    const action = ACTIONS[actionId];
    if (!action) return;
    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = 'Working…';
    try {
      const r = await action.fn();
      if (r && r.ok) showToast(r.message || 'Success', 'ok');
      else if (r && r.message && r.message.startsWith('Not yet wired')) showToast(r.message, 'warn');
      else showToast((r && r.message) || 'Failed', 'err');
    } catch (e) {
      showToast('Error: ' + e.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  }

  async function runAllInDomain(domainId, btn) {
    const d = DOMAINS.find(function (x) { return x.id === domainId; });
    if (!d) return;
    btn.disabled = true;
    const oldText = btn.textContent;
    let ranCount = 0;
    for (const aid of d.actionIds) {
      if (isStub(aid)) continue;
      btn.textContent = 'Running ' + ACTIONS[aid].label + '…';
      try {
        const r = await ACTIONS[aid].fn();
        if (r && r.ok) {
          showToast((r.message || ACTIONS[aid].label + ' done'), 'ok');
          ranCount++;
        } else {
          showToast((r && r.message) || (ACTIONS[aid].label + ' failed'), 'err');
          break;
        }
      } catch (e) {
        showToast(ACTIONS[aid].label + ' errored: ' + e.message, 'err');
        break;
      }
    }
    btn.disabled = false;
    btn.textContent = oldText;
    if (ranCount > 0) showToast('Domain "' + d.title + '" — ran ' + ranCount + ' wired actions', 'ok');
  }

  render();
  console.log('[Klaar AE Widget v3] Loaded on ' + location.host + ' → ' + API_BASE);
  console.log('[Klaar AE Widget v3] State:', state);
})();
