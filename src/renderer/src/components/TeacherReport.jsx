const DIRECTION_STYLES = {
  on_track: {
    label: 'On Track',
    className: 'is-on-track'
  },
  needs_work: {
    label: 'Needs Work',
    className: 'is-needs-work'
  },
  off_track: {
    label: 'Off Track',
    className: 'is-off-track'
  }
}

const COVERAGE_STYLES = {
  strong: {
    label: 'Strong',
    className: 'is-strong'
  },
  adequate: {
    label: 'Adequate',
    className: 'is-adequate'
  },
  weak: {
    label: 'Weak',
    className: 'is-weak'
  },
  missing: {
    label: 'Missing',
    className: 'is-missing'
  }
}

const PRIORITY_DOT_COUNT = 5
const COVERAGE_LEGEND = [
  {
    key: 'strong',
    meaning: 'Clearly meets this criterion with convincing evidence or analysis.'
  },
  {
    key: 'adequate',
    meaning: 'Meets the criterion overall, but still needs more precision or development.'
  },
  {
    key: 'weak',
    meaning: 'Touches the criterion, but the support or analysis is not strong enough yet.'
  },
  {
    key: 'missing',
    meaning: 'This criterion is not yet shown clearly enough in the draft.'
  }
]

const PRIORITY_LEGEND = [
  {
    level: 1,
    meaning: 'Most urgent. Start here because it should improve the report fastest.'
  },
  {
    level: 2,
    meaning: 'Important next. Work on this soon after the Priority 1 items.'
  },
  {
    level: 3,
    meaning: 'Worth improving once the most urgent gaps are addressed.'
  },
  {
    level: 4,
    meaning: 'Lower urgency. Useful for polishing and lifting the final quality.'
  },
  {
    level: 5,
    meaning: 'Lowest urgency. Leave this until the bigger issues are fixed first.'
  }
]

function getDirectionStyle(direction) {
  return DIRECTION_STYLES[direction] ?? {
    label: 'Needs Review',
    className: 'is-needs-work'
  }
}

function getCoverageStyle(coverage) {
  return COVERAGE_STYLES[coverage] ?? {
    label: 'Review',
    className: 'is-adequate'
  }
}

function normalizePriority(priority) {
  if (!Number.isFinite(priority)) {
    return PRIORITY_DOT_COUNT
  }

  return Math.min(Math.max(priority, 1), PRIORITY_DOT_COUNT)
}

function renderDocumentReference(documentReference) {
  if (!documentReference) {
    return null
  }

  return (
    <div className="document-reference">
      <p className="document-reference-label">Where this appears in your draft</p>
      <div className="document-reference-meta">
        <span>{documentReference.section}</span>
        <span>{documentReference.block_id}</span>
      </div>
      <blockquote className="document-reference-quote">
        &ldquo;{documentReference.quote}&rdquo;
      </blockquote>
    </div>
  )
}

export default function TeacherReport({
  teacherReport,
  onExportPDF,
  onCopyToClipboard,
  onNewAnalysis,
  isExportingPDF,
  actionMessage,
  actionError
}) {
  const directionStyle = getDirectionStyle(teacherReport.overall_direction)
  const sortedCriteria = [...(teacherReport.criteria_analysis ?? [])].sort(
    (left, right) => left.priority - right.priority
  )

  return (
    <section className="teacher-report-shell">
      <header className="report-toolbar">
        <div>
          <p className="report-kicker">Teacher Mode</p>
          <h2 className="report-title">Assessment Feedback Report</h2>
        </div>

        <div className="report-toolbar-actions">
          <button
            type="button"
            className="ghost-button"
            disabled={isExportingPDF}
            onClick={onExportPDF}
          >
            {isExportingPDF ? 'Exporting PDF...' : 'Export as PDF'}
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={isExportingPDF}
            onClick={onCopyToClipboard}
          >
            Copy to Clipboard
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={isExportingPDF}
            onClick={onNewAnalysis}
          >
            New Analysis
          </button>
        </div>
      </header>

      {actionError ? <p className="report-banner is-error">{actionError}</p> : null}
      {actionMessage ? <p className="report-banner is-success">{actionMessage}</p> : null}

      <section className={`direction-banner ${directionStyle.className}`}>
        <div className="direction-banner-copy">
          <p className="direction-label">{directionStyle.label}</p>
          <p className="direction-summary">{teacherReport.overall_summary}</p>
        </div>
      </section>

      <section className="report-legend">
        <div className="section-heading">
          <p className="section-kicker">How To Read This Report</p>
          <h3 className="section-title">Coverage and priority guide</h3>
        </div>

        <div className="report-legend-grid">
          <article className="report-legend-card">
            <h4 className="report-legend-card-title">Coverage labels</h4>
            <ul className="report-legend-list">
              {COVERAGE_LEGEND.map((item) => {
                const coverageStyle = getCoverageStyle(item.key)

                return (
                  <li key={item.key} className="report-legend-item">
                    <span className={`coverage-badge ${coverageStyle.className}`}>
                      {coverageStyle.label}
                    </span>
                    <span className="report-legend-copy">{item.meaning}</span>
                  </li>
                )
              })}
            </ul>
          </article>

          <article className="report-legend-card">
            <h4 className="report-legend-card-title">Priority scale</h4>
            <p className="report-legend-note">Lower number = more urgent.</p>
            <ul className="report-legend-list">
              {PRIORITY_LEGEND.map((item) => (
                <li key={item.level} className="report-legend-item">
                  <span className="report-priority-pill">Priority {item.level}</span>
                  <span className="report-legend-copy">{item.meaning}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="priorities-card">
        <p className="section-kicker">Start Here</p>
        <h3 className="section-title">Top 3 Priorities</h3>
        <ol className="priority-list">
          {(teacherReport.top_3_priorities ?? []).map((item, index) => (
            <li key={`${item}-${index}`} className="priority-list-item">
              <strong>{item}</strong>
            </li>
          ))}
        </ol>
      </section>

      <section className="criteria-section">
        <div className="section-heading">
          <p className="section-kicker">Criteria Review</p>
          <h3 className="section-title">Where To Improve Next</h3>
        </div>

        <div className="criteria-grid">
          {sortedCriteria.map((item, index) => {
            const coverageStyle = getCoverageStyle(item.coverage)
            const priorityLevel = normalizePriority(item.priority)

            return (
              <article key={`${item.criteria_point}-${index}`} className="criteria-card">
                <div className="criteria-card-header">
                  <h4 className="criteria-point">{item.criteria_point}</h4>
                  <span className={`coverage-badge ${coverageStyle.className}`}>
                    {coverageStyle.label}
                  </span>
                </div>

                <div className="priority-row" aria-label={`Priority ${priorityLevel}`}>
                  <span className="priority-label">Priority {priorityLevel}</span>
                  <div className="priority-scale">
                    <span className="priority-scale-label is-urgent">Urgent</span>
                    <div className="priority-dots" aria-hidden="true">
                      {Array.from({ length: PRIORITY_DOT_COUNT }, (_, dotIndex) => {
                        const dotLevel = dotIndex + 1
                        const isActive = dotLevel === priorityLevel

                        return (
                          <span
                            key={dotIndex}
                            className={`priority-dot is-level-${dotLevel}${isActive ? ' is-active' : ''}`}
                          />
                        )
                      })}
                    </div>
                    <span className="priority-scale-label">Lower urgency</span>
                  </div>
                </div>

                <p className="criteria-feedback">{item.feedback}</p>

                {renderDocumentReference(item.document_reference)}

                <div className="focus-callout">
                  <p className="focus-callout-label">Focus suggestion</p>
                  <p className="focus-callout-copy">{item.focus_suggestion}</p>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </section>
  )
}
