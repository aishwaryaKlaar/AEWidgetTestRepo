// Module-grouped Slack command routing. Slack is registered with only these 8 top-level
// slash commands (well under its real 25-command-per-app cap) instead of one command per
// action — each command's `text` field is parsed as "<action> [...ignored]", and the first
// word picks which existing job function runs. No job function, Klaar API call, or
// KLAAR_STOPGAP_* workspace-targeting logic changes here — this file only decides which
// already-existing handler a given (command, text) pair resolves to.
import { runAddManagersJob } from '../UserModule/addManagersJob.js'
import { runAddEmployeesJob } from '../UserModule/addEmployeesJob.js'
import { runAddRolesJob } from '../UserModule/addRolesJob.js'
import { runAddGroupJob } from '../UserModule/addGroupJob.js'
import { runBulkUploadUserJob } from '../UserModule/bulkUploadUserJob.js'
import { runBulkUploadGroupJob } from '../UserModule/bulkUploadGroupJob.js'
import { runCreateTimePeriodJob } from '../GoalsModule/createTimePeriodJob.js'
import { runCreateGoalsJob } from '../GoalsModule/createGoalsJob.js'
import { runAddGoalsAILibraryJob } from '../GoalsModule/addGoalsAILibraryJob.js'
import { runDefaultGoalsJob } from '../GoalsModule/defaultGoalsJob.js'
import { runIndividualOKRJob } from '../GoalsModule/individualOKRJob.js'
import { runGroupOKRJob } from '../GoalsModule/groupOKRJob.js'
import { runKeyResultJob } from '../GoalsModule/keyResultJob.js'
import { runAddChildObjectiveJob } from '../GoalsModule/addChildObjectiveJob.js'
import { runKeyResultGroupJob } from '../GoalsModule/keyResultGroupJob.js'
import { runAddChildObjectiveGroupJob } from '../GoalsModule/addChildObjectiveGroupJob.js'
import { runCreateRatingScaleJob } from '../ReviewsModule/createRatingScaleJob.js'
import { runCreateReviewsJob } from '../ReviewsModule/createReviewsJob.js'
import { runCreateReportsJob } from '../ReviewsModule/createReportsJob.js'
import { runCreateCalibrationJob } from '../CalibrationModule/createCalibrationJob.js'
import { runGiveFeedbackJob } from '../FeedbackModule/giveFeedbackJob.js'
import { runCreateSessionJob } from '../OneOnOneModule/createSessionJob.js'
import { runCreateCompetenciesJob } from '../IDPsModule/createCompetenciesJob.js'
import { runCreateIDPJob } from '../IDPsModule/createIDPJob.js'
import { runCreatePIPJob } from '../IDPsModule/createPIPJob.js'
import { runCreate360TemplateJob } from '../SurveysModule/create360TemplateJob.js'
import { runCreateNominationJob } from '../SurveysModule/createNominationJob.js'
import { runCreate360SurveyJob } from '../SurveysModule/create360SurveyJob.js'
import { runCreate360ReportJob } from '../SurveysModule/create360ReportJob.js'

// Every module's command, display label (for help/error text), and action→handler map.
// Action names are exactly the old top-level command names (minus the leading "/") so
// nothing about what each action does or which handler it calls has changed — only how
// Slack routes to it.
export const MODULES = {
  '/user': {
    label: 'User',
    actions: {
      'create-manager':    runAddManagersJob,
      'add-employee':      runAddEmployeesJob,
      'add-roles':         runAddRolesJob,
      'add-group':         runAddGroupJob,
      'bulk-upload-user':  runBulkUploadUserJob,
      'bulk-upload-group': runBulkUploadGroupJob,
    },
  },
  '/goals': {
    label: 'Goals',
    actions: {
      'create-time-period':          runCreateTimePeriodJob,
      'import-goals':                runCreateGoalsJob,
      'add-goals-ai-library':        runAddGoalsAILibraryJob,
      'default-goals':               runDefaultGoalsJob,
      // Individual-OKR chain: individual-okr before key-result and add-child-objective
      // (both need the objectives it creates to already exist, resolved live by name).
      'individual-okr':              runIndividualOKRJob,
      'key-result':                  runKeyResultJob,
      'add-child-objective':         runAddChildObjectiveJob,
      // Group-OKR chain: same ordering requirement, plus group-okr itself needs
      // /user add-group to have already run so a group exists to attach to.
      'group-okr':                   runGroupOKRJob,
      'key-result-group':            runKeyResultGroupJob,
      'add-child-objective-group':   runAddChildObjectiveGroupJob,
    },
  },
  '/reviews': {
    label: 'Reviews',
    actions: {
      // create-rating-scale before create-reviews; create-reports needs /calibration
      // create-calibration to have run.
      'create-rating-scale': runCreateRatingScaleJob,
      'create-reviews':      runCreateReviewsJob,
      'create-reports':      runCreateReportsJob,
    },
  },
  '/calibration': {
    label: 'Calibration',
    actions: {
      // Needs /reviews create-reviews and /reviews create-rating-scale to have run first.
      'create-calibration': runCreateCalibrationJob,
    },
  },
  '/give-feedback': {
    label: 'Feedback',
    actions: {
      // Just needs some employees to already exist (/user add-employee or
      // /user bulk-upload-user).
      'create-feedback': runGiveFeedbackJob,
    },
  },
  '/one-on-one': {
    label: '1-on-1',
    actions: {
      'create-session': runCreateSessionJob,
    },
  },
  '/idps': {
    label: 'IDPs',
    actions: {
      // create-idp and create-pip both need /user add-group or /user bulk-upload-group to
      // have already run. create-competencies is fully independent.
      'create-competencies': runCreateCompetenciesJob,
      'create-idp':           runCreateIDPJob,
      'create-pip':           runCreatePIPJob,
    },
  },
  '/surveys': {
    label: 'Surveys',
    actions: {
      // create-360-template before create-360-survey (needs published 360 templates);
      // create-360-nomination before create-360-survey (needs an unlinked nomination).
      // create-360-report just needs 360 templates to already exist.
      'create-360-template':   runCreate360TemplateJob,
      'create-360-nomination': runCreateNominationJob,
      'create-360-survey':     runCreate360SurveyJob,
      'create-360-report':     runCreate360ReportJob,
    },
  },
}

function helpText(command, mod) {
  const lines = Object.keys(mod.actions).map(a => `• \`${command} ${a}\``)
  return `Available ${mod.label} actions:\n${lines.join('\n')}`
}

// Parses `text` as "<action> [...ignored]" and resolves it against `command`'s module.
// Pure and side-effect-free — never calls a handler itself, just decides which one (if
// any) the caller should invoke next. Returns one of:
//   { ok: false, kind: 'unknown-module', message }
//   { ok: false, kind: 'missing-action', message }
//   { ok: false, kind: 'unknown-action',  message }
//   { ok: true,  kind: 'help',   message }
//   { ok: true,  kind: 'action', handler, action }
export function resolveCommand(command, text) {
  const mod = MODULES[command]
  if (!mod) {
    return { ok: false, kind: 'unknown-module', message: `Unknown command: ${command}` }
  }

  const action = (text || '').trim().split(/\s+/)[0] || ''

  if (!action) {
    return {
      ok: false,
      kind: 'missing-action',
      message: `Please specify an action. Use \`${command} help\` to see available ${mod.label} actions.`,
    }
  }

  if (action === 'help') {
    return { ok: true, kind: 'help', message: helpText(command, mod) }
  }

  const handler = mod.actions[action]
  if (!handler) {
    return {
      ok: false,
      kind: 'unknown-action',
      message: `Unknown ${mod.label} action: ${action}\n\n${helpText(command, mod)}`,
    }
  }

  return { ok: true, kind: 'action', handler, action }
}
