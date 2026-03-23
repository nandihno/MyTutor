import { useEffect, useState } from 'react'

export default function Settings({ isOpen, hasKey, onClose, onKeyStateChange }) {
  const [key, setKey] = useState('')
  const [isConfigured, setIsConfigured] = useState(hasKey)
  const [isSaving, setIsSaving] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [showReplaceForm, setShowReplaceForm] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setIsConfigured(hasKey)
  }, [hasKey])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    let isActive = true

    async function refreshKeyStatus() {
      try {
        const { exists } = await window.api.hasAPIKey()

        if (!isActive) {
          return
        }

        setIsConfigured(exists)
        setShowReplaceForm(false)
        setError('')
        onKeyStateChange(exists)
      } catch (refreshError) {
        if (!isActive) {
          return
        }

        setError(refreshError.message)
      }
    }

    refreshKeyStatus()

    return () => {
      isActive = false
    }
  }, [isOpen, onKeyStateChange])

  async function handleSave() {
    if (!key.trim()) {
      setError('Enter an OpenAI API key before saving.')
      return
    }

    setIsSaving(true)
    setError('')

    try {
      await window.api.saveAPIKey(key)
      setKey('')
      setIsConfigured(true)
      setShowReplaceForm(false)
      onKeyStateChange(true)
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRemove() {
    const confirmed = window.confirm('Remove the stored OpenAI API key from this device?')

    if (!confirmed) {
      return
    }

    setIsRemoving(true)
    setError('')

    try {
      await window.api.deleteAPIKey()
      setKey('')
      setIsConfigured(false)
      setShowReplaceForm(false)
      onKeyStateChange(false)
    } catch (removeError) {
      setError(removeError.message)
    } finally {
      setIsRemoving(false)
    }
  }

  if (!isOpen) {
    return null
  }

  const showEntryForm = !isConfigured || showReplaceForm

  return (
    <div className="settings-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-header">
          <div>
            <p className="settings-kicker">Security</p>
            <h2 id="settings-title">Settings</h2>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="settings-copy">
          Your API key is encrypted and stored on this device only. It is never
          transmitted except to OpenAI directly. Get a key at
          {' '}
          <span className="inline-link">platform.openai.com</span>
        </p>

        {showEntryForm ? (
          <div className="settings-form">
            <label className="field-label" htmlFor="api-key">
              OpenAI API key
            </label>
            <input
              id="api-key"
              className="settings-input"
              type="password"
              value={key}
              placeholder="sk-..."
              autoComplete="off"
              onChange={(event) => setKey(event.target.value)}
            />
            <div className="settings-actions">
              <button
                type="button"
                className="primary-button"
                disabled={isSaving}
                onClick={handleSave}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              {isConfigured ? (
                <button
                  type="button"
                  className="ghost-button"
                  disabled={isSaving}
                  onClick={() => {
                    setShowReplaceForm(false)
                    setKey('')
                    setError('')
                  }}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="settings-status-card">
            <p className="status-badge">API key configured ✓</p>
            <div className="settings-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setShowReplaceForm(true)
                  setError('')
                }}
              >
                Replace
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={isRemoving}
                onClick={handleRemove}
              >
                {isRemoving ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        )}

        {error ? <p className="settings-error">{error}</p> : null}
      </aside>
    </div>
  )
}
