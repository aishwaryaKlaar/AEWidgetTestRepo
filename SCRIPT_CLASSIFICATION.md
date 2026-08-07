# Klaar Playwright Scripts — Widget Classification

This document classifies every script in `/Users/atriroy/klaar-playwright-goal/` into the widget's domain structure (Foundation / Goal Cycles / Goals / Reviews / Surveys / 1-on-1s / Plans / Competencies). It also captures naming conventions, inputs, outputs, and endpoints so we can translate each script into a widget action without re-reading the source.

**Note on CSV locations:** All CSV inputs/outputs live in `/Users/atriroy/klaar-playwright-goal/` itself (NOT `/Users/atriroy/qa-automation-final-do-or-do/` — that folder has no CSVs).

**Note on auth:** The widget reuses the logged-in AE's session (reads `X-AUTH-TOKEN` from localStorage). The 4 auth scripts (`auth-setup.js`, `auth-auto.js`, `auto-login-auth.js`, `auto-login-auth-v2.js`) are not needed in the widget — they only exist for server-side Playwright runs.

**Note on end-user automations:** Three scripts (`bulk-checkin-all-users.js`, `bulk-checkin-goals-for-single-user.js`, `auto-respond-surveys.js`) sign in as *different* users via `login-with-captcha.py` to act on their behalf. The widget runs inside the AE's own logged-in session and cannot switch identities. These are **out of scope for the widget** (would need server-side automation to support; flagging as a future "Server-Run Actions" backend if/when needed).

---

## Domain: Users

User and group setup — prereq for everything else (cycles, goals, reviews, 1-on-1s all depend on user/group structure being in place).

### Fetch users
- **Script:** `fetch-users.js`
- **Endpoint:** `GET /um/accounts/...` (paginated, page_size 100)
- **Inputs:** none beyond auth + workspace
- **Outputs:** `users.csv` (user_id, full_name, email, status, employee_id, title, department, manager, roles, etc.)
- **Used by:** every other script that maps user names → emails / IDs

### Promote Olivia to ADMIN
- **Script:** `update-user-roles.js`
- **Endpoint:** `PUT /um/accounts/employee/`
- **Inputs:** `users.csv` (looks up "Olivia Johnson" by name, case-insensitive)
- **Outputs:** Olivia gets ADMIN role added
- **Convention:** hardcoded target name "Olivia Johnson"

### Set Olivia as Admin's manager
- **Script:** `update-admin-manager.js`
- **Endpoint:** `PUT /um/accounts/employee/`
- **Inputs:** `users.csv`, `NAME_OF_ADMIN` env
- **Outputs:** Admin user gets `manager = Olivia Johnson`
- **Note:** workflow says "may not be required" — keep but maybe demote priority

### Create groups
- **Script:** `create-group.js`
- **Endpoint:** `POST /groupsj/api/v1/groups/`
- **Inputs:** `users.csv`, `create_group_members.csv`, `ADMIN_ID` env, hardcoded `GROUP_CONFIG.jsonGroups` (in source — includes "Company Workspace" group)
- **Outputs:** writes `group_ids` file + `WORKSPACE_GROUP_ID` for "Company Workspace" group
- **Convention:** "Company Workspace" group is the all-employees group

### Fetch groups
- **Script:** `fetch-groups.js`
- **Endpoint:** `GET /groupsj/api/v1/groups/` (paginated)
- **Outputs:** `groups.csv`
- **Used by:** review scripts (find Company Workspace group)

### Update email domains *(utility, no Klaar API)*
- **Script:** `update-email-domains.js`
- **Endpoint:** none — local CSV file edit only
- **Inputs:** interactive prompt for new domain, `users-image-upload.csv`
- **Note for widget:** **skip** — pure local utility, not API-driven

---

## Domain: Goal Cycles (Time Periods)

### Create CY + Q1-Q4
- **Script:** `create-time-periods.js`
- **Endpoint:** `POST /okr/performance/time_period/?sheet_user_id={admin}`
- **Inputs:** `WORKSPACE_GROUP_ID` (must run create-group first), current year (auto)
- **Outputs:** 5 cycles created; writes CY's id back as `TIME_PERIOD_ID`
- **Naming convention:** `CY {YEAR}` (Jan 1 – Dec 31), `Q1 {YEAR}` (Jan–Mar), `Q2 {YEAR}` (Apr–Jun), `Q3 {YEAR}` (Jul–Sep), `Q4 {YEAR}` (Oct–Dec). YEAR comes from `new Date().getFullYear()`.
- **Body shape:** `{ name, start_at, end_at, groups: [WORKSPACE_GROUP_ID] }`

### Fetch time periods
- **Script:** `fetch-time-periods.js`
- **Endpoint:** `GET /okr/performance/time_period/?sheet_user_id={admin}` (paginated, page_size 10)
- **Outputs:** `list-of-time-periods.csv`
- **Used by:** bulk-import-goals, all 3 review scripts

### Set default time period *(broken per WORKFLOW.md)*
- **Script:** `set-default-time-period.js`
- **Status:** WORKFLOW.md says "do not run this, it does not work" — **skip in widget**

---

## Domain: Goals & OKRs

Depends on Foundation + Goal Cycles.

### Bulk import goals
- **Script:** `bulk-import-goals.js`
- **Endpoint:** `POST /okr/performance/bulk_import/?time_period_id={...}`
- **Inputs:** `bulk_goal_import_payload.csv`, `groups.csv`, `users.csv`, `list-of-time-periods.csv`
- **Naming convention:** appends ` - Q1{YEAR}` (or other quarter id) suffix to titles. Adjusts start/end dates per time period.
- **Behavior:** runs the same payload **once per time period** in `list-of-time-periods.csv` (so a workspace gets goals across CY + all 4 quarters)
- **Note for widget:** needs file upload for `bulk_goal_import_payload.csv`

### Bulk check-in goals (admin-driven)
- **Script:** `bulk-checkin-goals.js`
- **Endpoint:** likely `POST /okr/performance/objectives/...` for check-ins (need to confirm in code)
- **Inputs:** `TIME_PERIOD_ID` env, `ADMIN_ID`
- **Behavior:** fetches all goals + child KRs for the time period, posts random status (Way Ahead / On Track / Behind / At Risk) + random progress (10–40%) + status-appropriate comments

### Create one goal (single)
- **Script:** `old_ones_single_actions/create-goal.js`
- **Endpoint:** `POST /okr/performance/objective/?sheet_user_id={admin}`
- **Use:** standalone test of single-goal creation (we already used this as the reference for the validated widget action)
- **Body shape:** full payload with `name`, `time_period`, `category`, `visibility`, `groups`, `owners`, `node_type` (`OBJECTIVE` or `KR`), `parent_node`, `metric_data`, `milestones`

### Add KR (single)
- **Script:** `old_ones_single_actions/add-kr.js`
- **Endpoint:** same as above with `node_type: "KR"` and `parent_node` set

### AI goals setup
- **Script:** `ai-goals-setup.js`
- **Endpoints:**
  - `POST /okr/performance/library/categories/` — create a goal library category
  - `POST /okr/performance/ai/generate_task/` — kick off AI goal generation
  - `GET /okr/performance/ai/task_status/{taskId}/` — poll for completion
  - `POST /okr/performance/ai/add_to_library/` — add generated results to the library
- **Status:** advanced demo; likely Phase 2 for the widget

---

## Domain: Reviews

Depends on Users + Goal Cycles + Templates + Rating Scale.

### Fetch rating scales
- **Script:** `fetch-rating-scales.js`
- **Endpoint:** `GET /review/get_ratings_for_org`
- **Inputs:** none
- **Outputs:** writes `RATING_SCALE_ID` to `.env` (finds "Klaar Inbuilt 5 Point Rating Scale with Formal Label Names")
- **Note for widget:** widget won't write to `.env`; instead store discovered IDs in in-memory state. This action is a prereq for all review-creation actions in this domain.

### Create feedback templates
- **Script:** `create-templates.js`
- **Endpoint:** `POST /review/...`
- **Outputs:** 3 templates (Peer Reflection, Manager Reflection, Self Reflection); writes IDs to `feedback-template-ids.csv`
- **Used by:** all review-creation scripts

### Create yearly review
- **Script:** `create-review-v2.js`
- **Endpoints:** 12 sequential calls per review, including `update_review_for_review_id`, `update_reviewers_for_review_id`, `add_instructions_for_reviewer_type` (×5 reviewer types: SELF / L1_MANAGER / L2_MANAGER / PEERS / DIRECT_REPORTS), `add_remove_reviewee_additional_field_to_review`, `reviewj/api/v1/reviews/`
- **Inputs:** `groups.csv` (Company Workspace group), `list-of-time-periods.csv` (CY period), `feedback-template-ids.csv`, `RATING_SCALE_ID`, `YEARLY_REVIEW_NAME` env, `evaluation_parameters_payload_updated.json`
- **Naming convention:** `{YEARLY_REVIEW_NAME} {YEAR}` — e.g., `Annual Review 2026`
- **Outputs:** appends to `reviews_launched_through_script.csv`

### Create mid-year review
- **Script:** `create-review-mid-year.js`
- **Naming convention:** hardcoded `Mid-Year-Perf`
- **Inputs:** uses CY time period, `evaluation_parameters_payload_updated.json` (mid-year params), `feedback-template-ids.csv`
- **Endpoints:** same 12-call pattern as yearly

### Create quarterly review
- **Script:** `create-review-quarterly.js`
- **Naming convention:** auto-detects current quarter from date → `Q{1-4} {YEAR}` (e.g., `Q1 2026`)
- **Inputs:** uses quarter-specific time period (`Q1 {YEAR}` etc.), `evaluation_parameters_payload_quarterly.json`
- **Endpoints:** same 12-call pattern with quarterly evaluation params

---

## Domain: Surveys

### Create engagement template
- **Script:** `create-template-engagement.js`
- **Endpoint:** `POST /review/...`
- **Outputs:** "Annual Engagement Survey Template" with 10 questions (1 eNPS 0–10 + 9 Likert); appends to `feedback-template-ids.csv`
- **Type:** "Normal" (not "360")

### Create + publish engagement survey
- **Script:** `create-engagement-survey.js`
- **Endpoints (5 sequential):**
  - `POST /surveyms/create_normal_survey`
  - `POST /surveyms/update_normal_survey?ns_id={nsId}` (×3 — type, respondents, dates)
  - `POST /surveyms/publish_normal_survey?ns_id={nsId}`
- **Naming/timing:** `start = now - 2 hours` so it's already live for users
- **Inputs:** template id from `feedback-template-ids.csv`, groups for respondents, `users.csv`

---

## Domain: 1-on-1s

### Create 1-on-1 relationships
- **Script:** `create-one-on-ones.js`
- **Endpoint:** bulk-upload (POST + multipart file)
- **Inputs:** `users.csv`, `list-of-template-ids.csv`
- **Behavior:** generates 10–15 relationships randomly, ensures **at least 5 with Olivia Johnson**, saves to `one-on-one-list.csv`, then bulk-uploads

---

## Domain: Plans (IDP/PIP)

### Configure IDP/PIP settings
- **Script:** `setup-plans.js`
- **Endpoints:**
  - `PATCH /pas/api/v1/pas/{WORKSPACE_ID}` — PAS settings update
  - `POST /idp/idp/settings/classification_type/` — creates classification types for PIP goals + IDP goals/action items
- **Inputs:** workspace + token only

---

## Domain: Competencies

Used by Reviews. Depends on Foundation.

### Bulk upload competencies
- **Script:** `bulk-upload-competencies.js`
- **Endpoint:** `POST /review/bulk_upload_competency` (multipart/form-data)
- **Input file:** `bulk-upload-competencies.csv` (columns: Competency Name, Competency Type, Description, Level Name, Level Order, Level Behaviors)
- **Note for widget:** needs file picker

### Bulk map competencies
- **Script:** `bulk-map-competencies.js`
- **Endpoint:** `PATCH /review/bulk_upload_competency_mapping` (multipart/form-data)
- **Input file:** `bulk-upload-competencies-mapping.csv` (columns: Competency Name, Competency Type, Level Name, Department, Discipline, Level, Role Name, Title)

### Set competency rating scale
- **Script:** `set-competency-rating-scale.js`
- **Endpoint:** `PATCH /um/accounts/display_settings/{WORKSPACE_ID}/`
- **Behavior:** finds "CLAR 5-point scale with formal rating labels" rating scale and configures it for competencies

### Bulk rate competencies (auto-fill random ratings)
- **Script:** `bulk-rate-competencies.js`
- **Endpoints:**
  - `GET /review/get_bulk_competency_rating_template` — downloads the user-competency mapping CSV
  - `POST /review/bulk_import_competency_ratings` — uploads filled CSV (multipart)
- **Behavior:** replaces "RATING LABEL" column with random values from {Needs Improvement, Below Expectations, Meets Expectations, Exceeds Expectations, Outstanding}, saves locally as `competency-ratings-temp.csv`, then uploads

---

## Out of Scope for Widget (Phase 1)

These cannot run from inside the AE's logged-in browser session because they require switching to other users' identities (login + captcha solving):

- `bulk-checkin-all-users.js` — signs in as each goal-owner, runs check-ins twice
- `bulk-checkin-goals-for-single-user.js` — signs in as one specified user
- `auto-respond-surveys.js` — signs in as each user, fills pending surveys randomly

To support these in the widget, we'd need a backend that runs Playwright server-side (or have the widget call out to a hosted service that runs them). Defer until Phase 2+.

---

## Cross-cutting concerns for widget translation

1. **CSV file pickers** — multiple actions need users to upload a CSV. Plan: add a file input next to each such action's button. Browser `FormData` with `multipart/form-data` to translate `bulk-upload-competencies.js` etc.

2. **State sharing between actions** — the Playwright scripts pass IDs via `.env`. Widget needs an in-memory store (or `localStorage`) to hold discovered IDs (`WORKSPACE_GROUP_ID`, `TIME_PERIOD_ID`, `RATING_SCALE_ID`, template IDs) so a "Run all" sequence works. Recommend a simple `state` object keyed by domain.

3. **Multipart uploads** — `FormData` works fine in browser; just don't set `Content-Type` header manually (let browser set the boundary).

4. **Naming conventions to surface as widget inputs** — for now, keep them as the Playwright scripts have them (current year auto, `YEARLY_REVIEW_NAME` configurable). Widget could later expose a settings panel where the AE picks a workspace persona and the names adjust.

5. **Order matters** — "Run all in <domain>" in the widget should respect WORKFLOW.md ordering. Cross-domain "Run full setup" runs domains in order: Foundation → Goal Cycles → Competencies → Goals → 1-on-1s → Templates+Reviews → Surveys → Plans.

---

## Proposed widget DOMAINS structure (driven by this classification)

```js
const DOMAINS = [
  { id: 'users',        title: 'Users',              actionIds: [
    'fetchUsers',
    'promoteOliviaToAdmin',
    'createGroups',
    'fetchGroups',
    'updateAdminManager',
  ]},
  { id: 'cycles',       title: 'Goal Cycles',        actionIds: [
    'createTimePeriods',
    'fetchTimePeriods',
  ]},
  { id: 'competencies', title: 'Competencies',       actionIds: [
    'uploadCompetencies',           // file picker
    'mapCompetencies',              // file picker
    'setCompetencyRatingScale',
    'bulkRateCompetencies',
  ]},
  { id: 'goals',        title: 'Goals & OKRs',       actionIds: [
    'bulkImportGoals',              // file picker
    'bulkCheckinGoals',
    'createSingleGoal',             // optional/test
    'aiGoalsSetup',                 // optional/advanced
  ]},
  { id: 'oneonones',    title: '1-on-1s',            actionIds: [
    'createOneOnOnes',
  ]},
  { id: 'templates',    title: 'Feedback Templates', actionIds: [
    'createReviewTemplates',
    'createEngagementTemplate',
  ]},
  { id: 'reviews',      title: 'Reviews',            actionIds: [
    'fetchRatingScales',            // prereq, runs first in this domain
    'createYearlyReview',
    'createMidYearReview',
    'createQuarterlyReview',
  ]},
  { id: 'surveys',      title: 'Surveys',            actionIds: [
    'createEngagementSurvey',
  ]},
  { id: 'plans',        title: 'Plans (IDP/PIP)',    actionIds: [
    'setupPlans',
  ]},
];
```

Notes:
- `Users` absorbs all user/group bootstrap (was previously called `Foundation`). It's the first domain to run.
- `fetchRatingScales` is placed first inside `Reviews` since it's a prerequisite for every review-creation action and is exclusively used by reviews.
- `Feedback Templates` is split from `Reviews` because templates are also a prerequisite for `Surveys` (engagement template) — surfacing them separately lets an AE create just the templates without committing to launching reviews.
