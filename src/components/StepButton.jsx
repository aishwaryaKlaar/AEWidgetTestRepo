import React from 'react'

export function StepButton({ label, onClick, loading, isStub, disabled }) {
  return (
    <button
      className={isStub ? 'stub' : ''}
      onClick={onClick}
      disabled={loading || disabled}
      title={isStub ? 'Coming soon — not yet wired' : label}
    >
      {loading ? 'Working…' : label}
    </button>
  )
}
