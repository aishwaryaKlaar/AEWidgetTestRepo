// Tests for the module-grouped Slack command router (api/_lib/shared/commandRouter.js).
// Uses Node's built-in test runner — no new dependency. Run with `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveCommand, MODULES } from '../api/_lib/shared/commandRouter.js'

test('/user create-manager resolves to the create-manager handler', () => {
  const r = resolveCommand('/user', 'create-manager')
  assert.equal(r.ok, true)
  assert.equal(r.kind, 'action')
  assert.equal(r.action, 'create-manager')
  assert.equal(r.handler, MODULES['/user'].actions['create-manager'])
})

test('/user help lists every User action', () => {
  const r = resolveCommand('/user', 'help')
  assert.equal(r.ok, true)
  assert.equal(r.kind, 'help')
  for (const action of Object.keys(MODULES['/user'].actions)) {
    assert.match(r.message, new RegExp(`/user ${action}`))
  }
})

test('/user invalid-action reports the unknown action and lists valid ones', () => {
  const r = resolveCommand('/user', 'invalid-action')
  assert.equal(r.ok, false)
  assert.equal(r.kind, 'unknown-action')
  assert.match(r.message, /Unknown User action: invalid-action/)
  for (const action of Object.keys(MODULES['/user'].actions)) {
    assert.match(r.message, new RegExp(`/user ${action}`))
  }
})

// The task spec's example used "/goals create-goal", but this project's real Goals module
// has no action by that name (closest is "import-goals") — substituting the real action
// name here rather than inventing a fictional one that doesn't map to any actual handler.
test('/goals import-goals resolves to the import-goals handler', () => {
  const r = resolveCommand('/goals', 'import-goals')
  assert.equal(r.ok, true)
  assert.equal(r.kind, 'action')
  assert.equal(r.action, 'import-goals')
  assert.equal(r.handler, MODULES['/goals'].actions['import-goals'])
})

test('/goals help lists every Goals action', () => {
  const r = resolveCommand('/goals', 'help')
  assert.equal(r.ok, true)
  assert.equal(r.kind, 'help')
  for (const action of Object.keys(MODULES['/goals'].actions)) {
    assert.match(r.message, new RegExp(`/goals ${action}`))
  }
})

test('/goals invalid-action reports the unknown action and lists valid ones', () => {
  const r = resolveCommand('/goals', 'invalid-action')
  assert.equal(r.ok, false)
  assert.equal(r.kind, 'unknown-action')
  assert.match(r.message, /Unknown Goals action: invalid-action/)
})

test('/user with no text at all asks for an action', () => {
  const r = resolveCommand('/user', undefined)
  assert.equal(r.ok, false)
  assert.equal(r.kind, 'missing-action')
  assert.match(r.message, /`\/user help`/)
})

test('/user with empty-string text asks for an action', () => {
  const r = resolveCommand('/user', '')
  assert.equal(r.ok, false)
  assert.equal(r.kind, 'missing-action')
})

test('/user with whitespace-only text asks for an action', () => {
  const r = resolveCommand('/user', '   ')
  assert.equal(r.ok, false)
  assert.equal(r.kind, 'missing-action')
})

test('extra words after the action are ignored — only the first word is used', () => {
  const r = resolveCommand('/user', 'create-manager some extra junk')
  assert.equal(r.ok, true)
  assert.equal(r.kind, 'action')
  assert.equal(r.action, 'create-manager')
})

test('an unregistered top-level command is reported as unknown', () => {
  const r = resolveCommand('/not-a-real-module', 'create-manager')
  assert.equal(r.ok, false)
  assert.equal(r.kind, 'unknown-module')
  assert.match(r.message, /Unknown command: \/not-a-real-module/)
})

test('every module exposes at least one action, and the total matches the pre-refactor command count (29)', () => {
  const moduleNames = Object.keys(MODULES)
  assert.equal(moduleNames.length, 8)

  let total = 0
  for (const name of moduleNames) {
    const actionCount = Object.keys(MODULES[name].actions).length
    assert.ok(actionCount > 0, `${name} has no actions`)
    total += actionCount
  }
  assert.equal(total, 29)
})
