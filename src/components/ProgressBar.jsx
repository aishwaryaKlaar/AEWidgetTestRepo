import React from 'react'

export function ProgressBar({ completed, total }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  return (
    <div>
      <div className="klaar-progress">
        <div className="klaar-progress-fill" style={{ width: pct + '%' }} />
      </div>
    </div>
  )
}
