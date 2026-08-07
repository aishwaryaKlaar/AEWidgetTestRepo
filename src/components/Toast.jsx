import React, { useState, useEffect, useRef } from 'react'

// Singleton event emitter for toasts
const listeners = []

// Collapse event — fires whenever a step succeeds (ok toast)
const collapseListeners = []
export function onCollapseWidget(fn) {
  collapseListeners.push(fn)
  return () => { const i = collapseListeners.indexOf(fn); if (i >= 0) collapseListeners.splice(i, 1) }
}

export function showToast(message, kind = '') {
  listeners.forEach(fn => fn(message, kind))
  if (kind === 'ok') collapseListeners.forEach(fn => fn())
}

let _id = 0

export function ToastContainer() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    function handler(message, kind) {
      const id = ++_id
      setToasts(prev => [...prev, { id, message, kind, fading: false }])
      const delay = kind === 'warn' ? 7000 : 4500
      setTimeout(() => {
        setToasts(prev => prev.map(t => t.id === id ? { ...t, fading: true } : t))
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300)
      }, delay)
    }
    listeners.push(handler)
    return () => { const i = listeners.indexOf(handler); if (i >= 0) listeners.splice(i, 1) }
  }, [])

  function dismiss(id) {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, fading: true } : t))
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300)
  }

  return (
    <div id="klaar-ae-toasts">
      {toasts.map(t => (
        <div
          key={t.id}
          className={['toast', t.kind, t.fading ? 'fading' : ''].filter(Boolean).join(' ')}
          onClick={() => dismiss(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
