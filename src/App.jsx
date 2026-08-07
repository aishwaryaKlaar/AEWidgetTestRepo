import React, { useState, useEffect } from 'react'
import { API_BASE } from './core/api.js'
import { ToastContainer, onCollapseWidget } from './components/Toast.jsx'

import { UsersModule }       from './modules/users/index.jsx'
import { GoalsModule }       from './modules/goals/index.jsx'
import { ReviewsModule }     from './modules/reviews/index.jsx'
import { FeedbackModule }    from './modules/feedback/index.jsx'
import { OneOnOneModule }    from './modules/oneOnOne/index.jsx'
import { CalibrationModule } from './modules/calibration/index.jsx'
import { IDPsModule }        from './modules/idps/index.jsx'
import { SurveysModule }     from './modules/surveys/index.jsx'

export default function App() {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    return onCollapseWidget(() => setCollapsed(true))
  }, [])

  if (collapsed) {
    return (
      <>
        <div id="klaar-ae-pill" onClick={() => setCollapsed(false)}>Klaar AE</div>
        <ToastContainer />
      </>
    )
  }

  return (
    <>
      <div id="klaar-ae-panel">
        <header>
          <span className="title">Klaar AE Widget</span>
          <span className="ctrls">
            <span title="Minimise" onClick={() => setCollapsed(true)}>–</span>
            <span title="Close" onClick={() => window.dispatchEvent(new CustomEvent('ae-widget:close'))}>×</span>
          </span>
        </header>

        <div className="content">
          <UsersModule />
          <GoalsModule />
          <CalibrationModule />
          <ReviewsModule />
          <FeedbackModule />
          <OneOnOneModule />
          <IDPsModule />
          <SurveysModule />
        </div>

        <div className="meta">{location.host} &rarr; {API_BASE}</div>
      </div>

      <ToastContainer />
    </>
  )
}
