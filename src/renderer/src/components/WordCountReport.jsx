function formatWordCount(value) {
  return new Intl.NumberFormat('en-US').format(value ?? 0)
}

function getRecommendationStyle(recommendation) {
  switch (recommendation) {
    case 'reduce':
      return {
        label: 'Reduce',
        className: 'is-reduce'
      }
    case 'expand':
      return {
        label: 'Expand',
        className: 'is-expand'
      }
    default:
      return {
        label: 'Good',
        className: 'is-adequate'
      }
  }
}

function getBarMetrics(currentWords, suggestedWords) {
  const normalizedCurrentWords = Math.max(currentWords ?? 0, 0)
  const normalizedSuggestedWords = Math.max(suggestedWords ?? 0, 0)
  const safeSuggestedWords = Math.max(normalizedSuggestedWords, 1)

  if (normalizedCurrentWords <= normalizedSuggestedWords) {
    const currentWidth = normalizedCurrentWords === 0
      ? 0
      : Math.max((normalizedCurrentWords / safeSuggestedWords) * 100, 4)

    return {
      currentWidth: Math.min(currentWidth, 100),
      overflowWidth: 0
    }
  }

  const overflowWidth = Math.max(
    ((normalizedCurrentWords - normalizedSuggestedWords) / safeSuggestedWords) * 100,
    6
  )

  return {
    currentWidth: 100,
    overflowWidth: Math.min(overflowWidth, 70)
  }
}

export default function WordCountReport({
  wordCountReport,
  onExportPDF,
  onCopyToClipboard,
  onNewAnalysis,
  isExportingPDF,
  actionMessage,
  actionError
}) {
  const sections = wordCountReport.sections ?? []

  return (
    <section className="teacher-report-shell word-count-report-shell">
      <header className="report-toolbar">
        <div>
          <p className="report-kicker">Word Count Mode</p>
          <h2 className="report-title">Section Word Count Strategy</h2>
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

      <section className="word-count-summary-card">
        <p className="section-kicker">Current Draft</p>
        <div className="word-count-total-row">
          <div>
            <p className="word-count-total-label">Total word count</p>
            <p className="word-count-total-value">
              {formatWordCount(wordCountReport.overall_word_count)}
            </p>
          </div>
        </div>
        <p className="word-count-summary-copy">{wordCountReport.summary}</p>
      </section>

      <section className="word-section-grid">
        {sections.map((section, index) => {
          const recommendationStyle = getRecommendationStyle(section.recommendation)
          const barMetrics = getBarMetrics(section.current_words, section.suggested_words)

          return (
            <article key={`${section.section_title}-${index}`} className="word-section-card">
              <div className="word-section-header">
                <h3 className="word-section-title">{section.section_title}</h3>
                <span className={`recommendation-badge ${recommendationStyle.className}`}>
                  {recommendationStyle.label}
                </span>
              </div>

              <p className="word-section-counts">
                {formatWordCount(section.current_words)} words &rarr; {formatWordCount(section.suggested_words)} suggested
              </p>

              <div className="word-bar-shell" aria-hidden="true">
                <div className="word-bar-track">
                  <div
                    className="word-bar-current"
                    style={{ width: `${barMetrics.currentWidth}%` }}
                  />
                  {barMetrics.overflowWidth > 0 ? (
                    <div
                      className="word-bar-overflow"
                      style={{ width: `${barMetrics.overflowWidth}%` }}
                    />
                  ) : null}
                </div>
              </div>

              <p className="word-section-reasoning">{section.reasoning}</p>
            </article>
          )
        })}
      </section>
    </section>
  )
}
