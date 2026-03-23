import { useMemo, useState } from 'react'

export default function DebugPanel({
  criteriaFile,
  criteriaDoc,
  assessmentDoc,
  analysisResult,
  errorMessage
}) {
  const [isOpen, setIsOpen] = useState(false)

  const placeholderTokens = useMemo(() => {
    const matches = criteriaDoc?.markdown?.match(/\[IMAGE_\d+\]/g) ?? []
    return [...new Set(matches)]
  }, [criteriaDoc])

  if (!import.meta.env.DEV) {
    return null
  }

  return (
    <section className={`debug-panel${isOpen ? ' is-open' : ''}`}>
      <div className="debug-panel-header">
        <div>
          <p className="debug-kicker">Development</p>
          <h2 className="debug-title">Parser Debug</h2>
        </div>
        <button
          type="button"
          className="debug-toggle"
          onClick={() => setIsOpen((currentValue) => !currentValue)}
        >
          {isOpen ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {isOpen ? (
        <div className="debug-panel-body">
          <p className="debug-copy">
            Inspect the most recent parser and AI output produced by the full analysis pipeline.
          </p>

          <div className="debug-meta">
            <span>Selected file: {criteriaFile.name || 'None selected'}</span>
            <span>Criteria images: {criteriaDoc?.images?.length ?? 0}</span>
            <span>Assessment images: {assessmentDoc?.images?.length ?? 0}</span>
            <span>Tokens: {placeholderTokens.length > 0 ? placeholderTokens.join(', ') : 'None'}</span>
          </div>

          {errorMessage ? <p className="debug-error">{errorMessage}</p> : null}

          <h3 className="debug-subtitle">Criteria Markdown</h3>
          <pre className="debug-output">{criteriaDoc?.markdown || 'No parser output yet.'}</pre>

          <h3 className="debug-subtitle">Assessment Markdown</h3>
          <pre className="debug-output">{assessmentDoc?.markdown || 'No assessment parser output yet.'}</pre>

          <h3 className="debug-subtitle">AI Response</h3>
          <pre className="debug-output">
            {analysisResult ? JSON.stringify(analysisResult, null, 2) : 'No AI output yet.'}
          </pre>
        </div>
      ) : null}
    </section>
  )
}
