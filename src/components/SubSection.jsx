import React, { useState } from 'react'

export function SubSection({ label, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`sub-section${open ? ' open' : ''}`}>
      <div className="sub-section-header" onClick={() => setOpen(o => !o)}>
        <span>{label}</span>
        <span className="caret">▶</span>
      </div>
      <div className="sub-section-body">
        {children}
      </div>
    </div>
  )
}
