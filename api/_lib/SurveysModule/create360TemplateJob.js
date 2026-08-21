// Node-safe port of create360Template() from src/modules/surveys/actions.js ("Create 360
// Template" in the widget UI), for the Slack slash-command proof-of-concept.
import { runJobAndReply } from '../shared/klaarCore.js'
import { build360Templates, postTemplate } from './surveysCore.js'

// Ported from create360Template() in actions.js, minus the state.js writes.
export async function create360TemplateJob() {
  const templates = build360Templates()
  const created = [], failed = []

  for (const tpl of templates) {
    const r = await postTemplate(tpl)
    if (r.ok) {
      created.push(tpl.name)
    } else {
      const body = (r.text || '').toLowerCase()
      if (body.includes('exist')) created.push(tpl.name)
      else failed.push(`${tpl.name} (${r.status})`)
    }
  }

  if (!created.length) return { ok: false, message: `All 360 templates failed: ${failed.join(', ')}` }

  const failNote = failed.length ? ` | Failed: ${failed.join(', ')}` : ''
  return { ok: true, message: `Created ${created.length} 360 templates: ${created.map(n => n.split('°')[1]?.trim().split(' ')[0] || n.split(' ')[0]).join(', ')}${failNote}. Go to Surveys in Klaar to view them.` }
}

export async function runCreate360TemplateJob({ response_url }) {
  await runJobAndReply(create360TemplateJob, response_url)
}
