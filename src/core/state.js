// Module-level state singleton — mirrors the original loader.js pattern.
// All action files import { state, saveState } and mutate state directly.

const STATE_KEY = 'klaar-ae-state'

function loadState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY)) || {} } catch { return {} }
}

export const state = loadState()

export function saveState() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)) } catch {}
}

export function clearState() {
  localStorage.removeItem(STATE_KEY)
  Object.keys(state).forEach(k => delete state[k])
}

// Expose for debugging in browser console
if (typeof window !== 'undefined') window.__klaarAEState = state
