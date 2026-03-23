import { useEffect, useState } from 'react'
import DebugPanel from './components/DebugPanel'
import History from './components/History'
import Settings from './components/Settings'
import TeacherReport from './components/TeacherReport'
import WordCountReport from './components/WordCountReport'

const MODES = [
  {
    id: 'teacher',
    title: 'Teacher Mode',
    description: 'Gap analysis, directional feedback, and priority areas to focus on.'
  },
  {
    id: 'word-count',
    title: 'Word Count Mode',
    description: 'Per-section expand or reduce guidance against the target criteria.'
  }
]

function createEmptySelections() {
  return {
    criteria: { path: '', name: '' },
    assessment: { path: '', name: '' }
  }
}

function getFriendlyErrorMessage(errorCode) {
  switch (errorCode) {
    case 'NO_API_KEY':
      return 'Please add your OpenAI API key in Settings'
    case 'INVALID_API_KEY':
      return 'Your API key appears to be invalid. Check Settings.'
    case 'RATE_LIMITED':
      return 'OpenAI rate limit reached — please wait and try again'
    case 'MALFORMED_RESPONSE':
      return 'Could not read the AI response. Please try again.'
    case 'TIMEOUT':
      return 'Request timed out. Please try again.'
    default:
      return `Something went wrong: ${errorCode}`
  }
}

function getAnalysisMode(mode) {
  if (mode === 'word-count') {
    return 'wordCount'
  }

  return mode
}

function getUiMode(mode) {
  if (mode === 'wordCount') {
    return 'word-count'
  }

  return mode
}

function formatDirectionLabel(direction) {
  switch (direction) {
    case 'on_track':
      return 'On Track'
    case 'needs_work':
      return 'Needs Work'
    case 'off_track':
      return 'Off Track'
    default:
      return 'Needs Review'
  }
}

function formatCoverageLabel(coverage) {
  if (!coverage) {
    return 'Review'
  }

  return coverage.charAt(0).toUpperCase() + coverage.slice(1)
}

function buildDocumentReferenceText(documentReference) {
  if (!documentReference) {
    return 'Reference: Not available'
  }

  return `Reference: ${documentReference.section} (${documentReference.block_id})
Quote: "${documentReference.quote}"`
}

function buildTeacherReportText(teacherReport) {
  const sortedCriteria = [...(teacherReport.criteria_analysis ?? [])].sort(
    (left, right) => left.priority - right.priority
  )
  const priorityText = (teacherReport.top_3_priorities ?? [])
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n')

  const criteriaText = sortedCriteria
    .map(
      (item) =>
        `${item.criteria_point}
Coverage: ${formatCoverageLabel(item.coverage)}
Priority: ${item.priority}
Feedback: ${item.feedback}
Focus suggestion: ${item.focus_suggestion}
${buildDocumentReferenceText(item.document_reference)}`
    )
    .join('\n\n')

  return `MyTutor Teacher Report

Direction: ${formatDirectionLabel(teacherReport.overall_direction)}

Summary:
${teacherReport.overall_summary}

Top 3 Priorities:
${priorityText}

Criteria Analysis:
${criteriaText}`
}

function formatWordCount(value) {
  return new Intl.NumberFormat('en-US').format(value ?? 0)
}

function formatRecommendationLabel(recommendation) {
  switch (recommendation) {
    case 'reduce':
      return 'Reduce'
    case 'expand':
      return 'Expand'
    default:
      return 'Good'
  }
}

function buildWordCountReportText(wordCountReport) {
  const sectionsText = (wordCountReport.sections ?? [])
    .map(
      (section) =>
        `${section.section_title}
Recommendation: ${formatRecommendationLabel(section.recommendation)}
Word count: ${formatWordCount(section.current_words)} words -> ${formatWordCount(section.suggested_words)} suggested
Reasoning: ${section.reasoning}`
    )
    .join('\n\n')

  return `MyTutor Word Count Report

Total current word count: ${formatWordCount(wordCountReport.overall_word_count)}

Summary:
${wordCountReport.summary}

Sections:
${sectionsText}`
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()

  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)

  if (!copied) {
    throw new Error('Clipboard copy failed.')
  }
}

export default function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [hasKey, setHasKey] = useState(false)
  const [isLoadingKeyState, setIsLoadingKeyState] = useState(true)
  const [selectedMode, setSelectedMode] = useState('')
  const [selectedFiles, setSelectedFiles] = useState(createEmptySelections)
  const [isAnalysing, setIsAnalysing] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [criteriaDoc, setCriteriaDoc] = useState(null)
  const [assessmentDoc, setAssessmentDoc] = useState(null)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [isExportingPDF, setIsExportingPDF] = useState(false)
  const [reportActionMessage, setReportActionMessage] = useState('')
  const [reportActionError, setReportActionError] = useState('')
  const [historyItems, setHistoryItems] = useState([])
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [historyErrorMessage, setHistoryErrorMessage] = useState('')
  const [loadingHistoryId, setLoadingHistoryId] = useState('')
  const [deletingHistoryId, setDeletingHistoryId] = useState('')

  useEffect(() => {
    let isActive = true

    async function refreshKeyState() {
      try {
        const { exists } = await window.api.hasAPIKey()

        if (!isActive) {
          return
        }

        setHasKey(exists)
      } catch (error) {
        if (isActive) {
          console.error('Unable to check key status', error)
          setHasKey(false)
        }
      } finally {
        if (isActive) {
          setIsLoadingKeyState(false)
        }
      }
    }

    refreshKeyState()

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    if (isHistoryOpen) {
      refreshHistoryList()
    }
  }, [isHistoryOpen])

  const analysisMode = getAnalysisMode(selectedMode)
  const areFilesReady = Boolean(selectedFiles.criteria.path && selectedFiles.assessment.path)
  const isAnalysisDisabled = isLoadingKeyState || isAnalysing || !selectedMode || !areFilesReady || !hasKey
  const isTeacherReportVisible = analysisMode === 'teacher' && Boolean(analysisResult)
  const isWordCountReportVisible = analysisMode === 'wordCount' && Boolean(analysisResult)
  const isReportVisible = isTeacherReportVisible || isWordCountReportVisible

  function clearAnalysisOutput() {
    setCriteriaDoc(null)
    setAssessmentDoc(null)
    setAnalysisResult(null)
    setSuccessMessage('')
    setErrorMessage('')
    setReportActionMessage('')
    setReportActionError('')
  }

  async function refreshHistoryList(options = {}) {
    const { silent = false } = options

    if (!silent) {
      setIsHistoryLoading(true)
    }

    setHistoryErrorMessage('')

    try {
      const response = await window.api.listHistory()

      if (response.error) {
        throw new Error(response.error)
      }

      setHistoryItems(response.items ?? [])
    } catch (error) {
      setHistoryErrorMessage(`Could not load history. ${error.message}`)
    } finally {
      if (!silent) {
        setIsHistoryLoading(false)
      }
    }
  }

  function handleModeSelect(modeId) {
    if (selectedMode !== modeId) {
      setSelectedFiles(createEmptySelections())
      clearAnalysisOutput()
    }

    setSelectedMode(modeId)
  }

  async function handleFileSelect(slot) {
    if (isAnalysing) {
      return
    }

    try {
      const result = await window.api.openDocxDialog()

      if (result.cancelled) {
        return
      }

      setSelectedFiles((currentFiles) => ({
        ...currentFiles,
        [slot]: {
          path: result.filePath,
          name: result.fileName
        }
      }))
      clearAnalysisOutput()
    } catch (error) {
      console.error('Unable to open document picker', error)
    }
  }

  function handleNewAnalysis() {
    setIsSettingsOpen(false)
    setIsHistoryOpen(false)
    setSelectedMode('')
    setSelectedFiles(createEmptySelections())
    setLoadingMessage('')
    setIsAnalysing(false)
    setIsExportingPDF(false)
    clearAnalysisOutput()
  }

  async function handleExportPDF() {
    setReportActionMessage('')
    setReportActionError('')
    setIsExportingPDF(true)

    try {
      const exportResult = await window.api.exportPDF(analysisMode)

      if (exportResult?.cancelled) {
        return
      }

      if (!exportResult?.success) {
        throw new Error(exportResult?.error || 'Unable to export PDF.')
      }

      setReportActionMessage(`PDF saved to ${exportResult.path}`)
    } catch (error) {
      setReportActionError(`Could not export PDF. ${error.message}`)
    } finally {
      setIsExportingPDF(false)
    }
  }

  async function handleCopyTeacherReport() {
    if (!analysisResult) {
      return
    }

    setReportActionMessage('')
    setReportActionError('')

    try {
      const reportText = analysisMode === 'wordCount'
        ? buildWordCountReportText(analysisResult)
        : buildTeacherReportText(analysisResult)

      await copyTextToClipboard(reportText)
      setReportActionMessage('Report copied to the clipboard.')
    } catch (error) {
      setReportActionError(`Could not copy report. ${error.message}`)
    }
  }

  async function handleOpenHistoryEntry(item) {
    setHistoryErrorMessage('')
    setLoadingHistoryId(item.id)

    try {
      const response = await window.api.loadHistory(item.id)

      if (response.error) {
        throw new Error(response.error)
      }

      setIsHistoryOpen(false)
      setSelectedMode(getUiMode(item.mode))
      setSelectedFiles({
        criteria: { path: '', name: item.criteriaFileName },
        assessment: { path: '', name: item.assessmentFileName }
      })
      setCriteriaDoc(null)
      setAssessmentDoc(null)
      setAnalysisResult(response.result)
      setSuccessMessage('')
      setErrorMessage('')
      setReportActionMessage('')
      setReportActionError('')
    } catch (error) {
      setHistoryErrorMessage(`Could not open this report. ${error.message}`)
    } finally {
      setLoadingHistoryId('')
    }
  }

  async function handleDeleteHistoryEntry(item) {
    const confirmed = window.confirm(
      `Delete the saved ${item.mode === 'wordCount' ? 'Word Count' : 'Teacher'} report for "${item.assessmentFileName}"?`
    )

    if (!confirmed) {
      return
    }

    setHistoryErrorMessage('')
    setDeletingHistoryId(item.id)

    try {
      const response = await window.api.deleteHistory(item.id)

      if (!response.success) {
        throw new Error(response.error || 'Delete failed.')
      }

      await refreshHistoryList({ silent: false })
    } catch (error) {
      setHistoryErrorMessage(`Could not delete this report. ${error.message}`)
    } finally {
      setDeletingHistoryId('')
    }
  }

  async function handleAnalyse() {
    if (!hasKey) {
      setIsSettingsOpen(true)
      return
    }

    if (!selectedMode || !areFilesReady) {
      setErrorMessage('Something went wrong: Please select both .docx files before analysing.')
      return
    }

    setIsAnalysing(true)
    setLoadingMessage('Reading criteria document...')
    clearAnalysisOutput()

    try {
      const nextCriteriaDoc = await window.api.parseDocx(selectedFiles.criteria.path)

      if (nextCriteriaDoc.error) {
        throw new Error(nextCriteriaDoc.error)
      }

      const normalizedCriteriaDoc = {
        markdown: nextCriteriaDoc.markdown,
        blocks: nextCriteriaDoc.blocks ?? [],
        images: nextCriteriaDoc.images
      }

      setCriteriaDoc(normalizedCriteriaDoc)

      setLoadingMessage('Reading assessment document...')
      const nextAssessmentDoc = await window.api.parseDocx(selectedFiles.assessment.path)

      if (nextAssessmentDoc.error) {
        throw new Error(nextAssessmentDoc.error)
      }

      const normalizedAssessmentDoc = {
        markdown: nextAssessmentDoc.markdown,
        blocks: nextAssessmentDoc.blocks ?? [],
        images: nextAssessmentDoc.images
      }

      setAssessmentDoc(normalizedAssessmentDoc)

      setLoadingMessage('Analysing with AI...')
      const analysisResponse = await window.api.analyseAssessment(
        normalizedCriteriaDoc,
        normalizedAssessmentDoc,
        analysisMode
      )

      if (analysisResponse.error) {
        throw new Error(getFriendlyErrorMessage(analysisResponse.error))
      }

      const historySaveResponse = await window.api.saveHistory(
        analysisResponse.result,
        selectedFiles.criteria.name,
        selectedFiles.assessment.name,
        analysisMode
      )

      if (historySaveResponse.error) {
        setReportActionError('Analysis completed, but the result could not be saved to history.')
      } else {
        setReportActionError('')
        await refreshHistoryList({ silent: true })
      }

      setAnalysisResult(analysisResponse.result)
      setSuccessMessage('')
      console.log('Analysis result', analysisResponse.result)
    } catch (error) {
      setAnalysisResult(null)
      setSuccessMessage('')
      setErrorMessage(error.message)
    } finally {
      setLoadingMessage('')
      setIsAnalysing(false)
    }
  }

  return (
    <main className={`app-shell${isReportVisible ? ' has-report' : ''}`}>
      <div className="app-toolbar">
        <button
          type="button"
          className="toolbar-trigger"
          disabled={isAnalysing}
          onClick={() => setIsHistoryOpen(true)}
        >
          History
        </button>

        {isReportVisible ? null : (
          <button
            type="button"
            className="toolbar-trigger"
            disabled={isAnalysing}
            onClick={() => setIsSettingsOpen((isOpen) => !isOpen)}
          >
            Settings
          </button>
        )}
      </div>

      {isTeacherReportVisible ? (
        <TeacherReport
          teacherReport={analysisResult}
          onExportPDF={handleExportPDF}
          onCopyToClipboard={handleCopyTeacherReport}
          onNewAnalysis={handleNewAnalysis}
          isExportingPDF={isExportingPDF}
          actionMessage={reportActionMessage}
          actionError={reportActionError}
        />
      ) : isWordCountReportVisible ? (
        <WordCountReport
          wordCountReport={analysisResult}
          onExportPDF={handleExportPDF}
          onCopyToClipboard={handleCopyTeacherReport}
          onNewAnalysis={handleNewAnalysis}
          isExportingPDF={isExportingPDF}
          actionMessage={reportActionMessage}
          actionError={reportActionError}
        />
      ) : (
        <section className="hero-card">
          <p className="eyebrow">Assessment support</p>
          <h1>MyTutor</h1>
          <p className="subtitle">AI Assessment Assistant</p>
          <p className="status-line">
            {hasKey ? 'API key configured.' : 'Configure your OpenAI API key in Settings to enable analysis.'}
          </p>

          {errorMessage ? <p className="error-banner">{errorMessage}</p> : null}
          {successMessage ? <p className="success-banner">{successMessage}</p> : null}

          <section className="mode-selector" aria-label="Analysis mode">
            {MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={`mode-card${selectedMode === mode.id ? ' is-selected' : ''}`}
                disabled={isAnalysing}
                onClick={() => handleModeSelect(mode.id)}
              >
                <span className="mode-card-title">{mode.title}</span>
                <span className="mode-card-copy">{mode.description}</span>
              </button>
            ))}
          </section>

          {selectedMode ? (
            <section className="file-section">
              <div className="file-list">
                <button
                  type="button"
                  className="file-row"
                  disabled={isAnalysing}
                  onClick={() => handleFileSelect('criteria')}
                >
                  <span className="file-row-label">Assessment Criteria</span>
                  <span className={`file-row-value${selectedFiles.criteria.name ? ' has-file' : ''}`}>
                    {selectedFiles.criteria.name || 'Click to select .docx file'}
                  </span>
                </button>

                <button
                  type="button"
                  className="file-row"
                  disabled={isAnalysing}
                  onClick={() => handleFileSelect('assessment')}
                >
                  <span className="file-row-label">Student Assessment</span>
                  <span className={`file-row-value${selectedFiles.assessment.name ? ' has-file' : ''}`}>
                    {selectedFiles.assessment.name || 'Click to select .docx file'}
                  </span>
                </button>
              </div>
            </section>
          ) : (
            <p className="selection-prompt">
              Select a mode to unlock the two required `.docx` uploads.
            </p>
          )}

          <div className="analysis-footer">
            <button
              type="button"
              className="analyse-button"
              disabled={isAnalysisDisabled}
              onClick={handleAnalyse}
            >
              Analyse
            </button>
          </div>
        </section>
      )}

      <Settings
        isOpen={isSettingsOpen}
        hasKey={hasKey}
        onClose={() => setIsSettingsOpen(false)}
        onKeyStateChange={setHasKey}
      />

      <History
        isOpen={isHistoryOpen}
        items={historyItems}
        isLoading={isHistoryLoading}
        errorMessage={historyErrorMessage}
        loadingEntryId={loadingHistoryId}
        deletingEntryId={deletingHistoryId}
        onClose={() => setIsHistoryOpen(false)}
        onOpenEntry={handleOpenHistoryEntry}
        onDeleteEntry={handleDeleteHistoryEntry}
      />

      <DebugPanel
        criteriaFile={selectedFiles.criteria}
        criteriaDoc={criteriaDoc}
        assessmentDoc={assessmentDoc}
        analysisResult={analysisResult}
        errorMessage={errorMessage}
      />

      {isAnalysing ? (
        <div className="loading-overlay" aria-live="polite" aria-busy="true">
          <div className="loading-card">
            <div className="spinner" aria-hidden="true" />
            <p className="loading-text">{loadingMessage}</p>
          </div>
        </div>
      ) : null}
    </main>
  )
}
