function formatHistoryDate(value) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Unknown date'
  }

  return date.toLocaleString()
}

function getModeBadge(mode) {
  if (mode === 'wordCount') {
    return {
      label: 'WC',
      title: 'Word Count Mode',
      className: 'is-word-count'
    }
  }

  return {
    label: 'T',
    title: 'Teacher Mode',
    className: 'is-teacher'
  }
}

export default function History({
  isOpen,
  items,
  isLoading,
  errorMessage,
  loadingEntryId,
  deletingEntryId,
  onClose,
  onOpenEntry,
  onDeleteEntry
}) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="history-backdrop" onClick={onClose}>
      <section
        className="history-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="history-header">
          <div>
            <p className="settings-kicker">Saved Reports</p>
            <h2 id="history-title">History</h2>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </header>

        <p className="history-copy">
          Review previous analyses without re-running the AI call.
        </p>

        {errorMessage ? <p className="history-error">{errorMessage}</p> : null}

        {isLoading ? (
          <p className="history-empty">Loading saved analyses...</p>
        ) : items.length === 0 ? (
          <p className="history-empty">No saved analyses yet. Run an analysis to build your history.</p>
        ) : (
          <div className="history-list">
            {items.map((item) => {
              const modeBadge = getModeBadge(item.mode)
              const isOpening = loadingEntryId === item.id
              const isDeleting = deletingEntryId === item.id

              return (
                <article
                  key={item.id}
                  className="history-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (!isDeleting && !isOpening) {
                      onOpenEntry(item)
                    }
                  }}
                  onKeyDown={(event) => {
                    if ((event.key === 'Enter' || event.key === ' ') && !isDeleting && !isOpening) {
                      event.preventDefault()
                      onOpenEntry(item)
                    }
                  }}
                >
                  <div className="history-row-main">
                    <div className="history-row-topline">
                      <span className={`history-mode-badge ${modeBadge.className}`} title={modeBadge.title}>
                        {modeBadge.label}
                      </span>
                      <span className="history-date">{formatHistoryDate(item.date)}</span>
                    </div>
                    <p className="history-file-line">{item.criteriaFileName}</p>
                    <p className="history-file-line">{item.assessmentFileName}</p>
                  </div>

                  <div className="history-row-actions">
                    <span className="history-open-label">
                      {isOpening ? 'Opening...' : 'Open'}
                    </span>
                    <button
                      type="button"
                      className="danger-button"
                      disabled={isOpening || isDeleting}
                      onClick={(event) => {
                        event.stopPropagation()
                        onDeleteEntry(item)
                      }}
                    >
                      {isDeleting ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
