import { useEffect, useState } from 'react'
import DebugPanel from './components/DebugPanel'
import Settings from './components/Settings'
import TeacherReport from './components/TeacherReport'

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
Focus suggestion: ${item.focus_suggestion}`
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

  const areFilesReady = Boolean(selectedFiles.criteria.path && selectedFiles.assessment.path)
  const isAnalysisDisabled = isLoadingKeyState || isAnalysing || !selectedMode || !areFilesReady || !hasKey
  const isTeacherReportVisible = selectedMode === 'teacher' && Boolean(analysisResult)

  function clearAnalysisOutput() {
    setCriteriaDoc(null)
    setAssessmentDoc(null)
    setAnalysisResult(null)
    setSuccessMessage('')
    setErrorMessage('')
    setReportActionMessage('')
    setReportActionError('')
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
      const exportResult = await window.api.exportPDF()

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
      await copyTextToClipboard(buildTeacherReportText(analysisResult))
      setReportActionMessage('Teacher report copied to the clipboard.')
    } catch (error) {
      setReportActionError(`Could not copy report. ${error.message}`)
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
        images: nextAssessmentDoc.images
      }

      setAssessmentDoc(normalizedAssessmentDoc)

      setLoadingMessage('Analysing with AI...')
      const analysisResponse = await window.api.analyseAssessment(
        normalizedCriteriaDoc,
        normalizedAssessmentDoc,
        getAnalysisMode(selectedMode)
      )

      if (analysisResponse.error) {
        throw new Error(getFriendlyErrorMessage(analysisResponse.error))
      }

      setAnalysisResult(analysisResponse.result)
      setSuccessMessage(selectedMode === 'teacher' ? '' : 'Analysis complete')
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
    <main className={`app-shell${isTeacherReportVisible ? ' has-report' : ''}`}>
      {isTeacherReportVisible ? null : (
        <button
          type="button"
          className="settings-trigger"
          disabled={isAnalysing}
          onClick={() => setIsSettingsOpen((isOpen) => !isOpen)}
        >
          ⚙️ Settings
        </button>
      )}

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
