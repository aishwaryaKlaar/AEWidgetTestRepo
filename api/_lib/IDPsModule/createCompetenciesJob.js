// Node-safe port of createCompetencies() from src/modules/idps/actions.js ("Create
// Competencies" in the widget UI), for the Slack slash-command proof-of-concept.
import { klaarApi, runJobAndReply } from '../shared/klaarCore.js'
import { resolveCompetencyTypeId } from './idpsCore.js'

const COMPETENCY_LIST = [
  { name: 'DeterministicThinking', description: 'Deconstructs ambiguous technical challenges into highly predictable, provable engineering outcomes.' },
  { name: 'OperationalFrictionHunting', description: 'Systematically audits workflows to eradicate manual toil, repetitive churn, and pipeline drag.' },
  { name: 'HighCaliberMentorship', description: 'Accelerates peer capability through rigorous code reviews, thoughtful feedback, and continuous pairing.' },
  { name: 'BoundaryDecoupling', description: 'Architects isolated, modular components that prevent cascading failures and eliminate service lock-in.' },
  { name: 'RadicalCandor', description: 'Surfaces uncomfortable project realities and technical debt early while committing fully to execution.' },
  { name: 'ObservabilityDepth', description: 'Instruments holistic, high-cardinality telemetry across services to diagnose anomalies before users notice.' },
  { name: 'PragmaticInnovation', description: 'Balances emerging technologies against operational complexity to drive genuine business value over hype.' },
  { name: 'DefensiveArchitecture', description: 'Builds self-healing systems and fault-tolerant mechanisms designed to withstand severe downstream outages.' },
  { name: 'ContextualSynthesis', description: 'Translates high-level enterprise goals into precise technical execution plans without losing strategic intent.' },
  { name: 'UnitEconomicsAwareness', description: 'Maintains strict visibility into compute, network, and storage costs to ensure architecture scales sustainably.' },
  { name: 'CrossDomainEmpathy', description: 'Partners seamlessly across non-engineering functions to unblock dependencies and align product roadmaps.' },
  { name: 'ContinuousVerification', description: 'Integrates automated security checks, contract tests, and performance benchmarks into every stage of deployment.' },
  { name: 'HighAgencyExecution', description: 'Takes uncompromising end-to-end ownership of initiatives from ambiguous problem framing to production delivery.' },
  { name: 'CustomerSignalExtraction', description: 'Separates foundational customer friction from vocal edge cases to prioritize impactful feature work.' },
  { name: 'PivotingCadence', description: 'Adapts architecture and delivery priorities rapidly in response to shifting organizational strategies.' },
];

// Ported from createCompetencies() in actions.js.
export async function createCompetenciesJob() {
  const typeId = await resolveCompetencyTypeId()
  if (!typeId) return { ok: false, message: 'Could not find or create a competency type.' }

  const created = [], failed = []
  for (const c of COMPETENCY_LIST) {
    const r = await klaarApi('/review/create_competency', {
      method: 'POST',
      body: JSON.stringify({ name: c.name, description: c.description, type_id: typeId }),
    })
    if (r.ok) {
      created.push(c.name)
    } else {
      const body = (r.text || '').toLowerCase()
      if (body.includes('exist') || body.includes('already')) created.push(c.name)
      else failed.push(`${c.name} (${r.status})`)
    }
  }

  if (!created.length) return { ok: false, message: `All competencies failed: ${failed.join(', ')}` }
  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Created ${created.length}/${COMPETENCY_LIST.length} competencies: ${created.join(', ')}${failNote}. Go to Competencies in Klaar to view them.` }
}

export async function runCreateCompetenciesJob({ response_url }) {
  await runJobAndReply(createCompetenciesJob, response_url)
}
