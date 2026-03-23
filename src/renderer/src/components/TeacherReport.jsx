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

            return (
              <article key={`${item.criteria_point}-${index}`} className="criteria-card">
                <div className="criteria-card-header">
                  <h4 className="criteria-point">{item.criteria_point}</h4>
                  <span className={`coverage-badge ${coverageStyle.className}`}>
                    {coverageStyle.label}
                  </span>
                </div>

                <div className="priority-row" aria-label={`Priority ${item.priority}`}>
                  <span className="priority-label">Priority {item.priority}</span>
                  <div className="priority-dots" aria-hidden="true">
                    {Array.from({ length: PRIORITY_DOT_COUNT }, (_, dotIndex) => (
                      <span
                        key={dotIndex}
                        className={`priority-dot${dotIndex < item.priority ? ' is-filled' : ''}`}
                      />
                    ))}
                  </div>
                </div>

                <p className="criteria-feedback">{item.feedback}</p>

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
