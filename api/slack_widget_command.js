import { waitUntil } from '@vercel/functions'
import { resolveCommand } from './_lib/shared/commandRouter.js'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// Slack times out a slash command ack at ~3s. This handler must respond almost
// instantly and do the real Klaar API work afterward via waitUntil, then deliver
// the result directly to response_url (bypassing slack-router for the reply).
//
// Commands are grouped by Klaar module (see commandRouter.js) rather than one Slack
// command per action — Slack's app-management console caps a single app at 25
// registered slash commands, and this project has 29 distinct actions. `command` picks
// the module ("/user", "/goals", ...) and `text`'s first word picks the action within it
// ("create-manager", "add-employee", ...) — resolveCommand() does that lookup and returns
// either a handler to run or a help/validation message to reply with directly.
export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let params = req.body || {}
  if (typeof params === 'string') {
    params = Object.fromEntries(new URLSearchParams(params))
  }

  const { command, text, response_url } = params
  const resolved = resolveCommand(command, text)

  if (!resolved.ok || resolved.kind === 'help') {
    return res.status(200).json({ response_type: 'ephemeral', text: resolved.message })
  }

  res.status(200).json({ response_type: 'ephemeral', text: 'Working on it… I will post the result here shortly.' })

  waitUntil(
    resolved.handler(params).catch(async e => {
      console.error('[slack_widget_command] job failed:', e.message)
      if (response_url) {
        try {
          await fetch(response_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ response_type: 'ephemeral', text: `⚠️ Unexpected error: ${e.message}` }),
          })
        } catch {}
      }
    })
  )
}
