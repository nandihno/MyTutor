import path from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { app, screen } from 'electron'

const DEFAULT_WINDOW_STATE = {
  width: 1200,
  height: 800
}

function getWindowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json')
}

async function ensureStateDirectory() {
  await mkdir(path.dirname(getWindowStatePath()), { recursive: true })
}

function isVisibleWithinDisplay(bounds) {
  return screen.getAllDisplays().some((display) => {
    const workArea = display.workArea
    const horizontalOverlap = bounds.x < workArea.x + workArea.width && bounds.x + bounds.width > workArea.x
    const verticalOverlap = bounds.y < workArea.y + workArea.height && bounds.y + bounds.height > workArea.y
    return horizontalOverlap && verticalOverlap
  })
}

function normalizeStoredState(value) {
  if (!value || typeof value !== 'object') {
    return DEFAULT_WINDOW_STATE
  }

  const nextState = {
    width: Number.isFinite(value.width) ? value.width : DEFAULT_WINDOW_STATE.width,
    height: Number.isFinite(value.height) ? value.height : DEFAULT_WINDOW_STATE.height
  }

  if (Number.isFinite(value.x) && Number.isFinite(value.y)) {
    nextState.x = value.x
    nextState.y = value.y
  }

  if (value.isMaximized === true) {
    nextState.isMaximized = true
  }

  if (!('x' in nextState) || !('y' in nextState) || !isVisibleWithinDisplay(nextState)) {
    return {
      width: nextState.width,
      height: nextState.height,
      isMaximized: nextState.isMaximized === true
    }
  }

  return nextState
}

export async function loadWindowState() {
  try {
    const rawState = await readFile(getWindowStatePath(), 'utf8')
    return normalizeStoredState(JSON.parse(rawState))
  } catch {
    return DEFAULT_WINDOW_STATE
  }
}

export async function saveWindowState(browserWindow) {
  if (!browserWindow || browserWindow.isDestroyed()) {
    return
  }

  await ensureStateDirectory()

  const bounds = browserWindow.getBounds()
  const nextState = {
    ...bounds,
    isMaximized: browserWindow.isMaximized()
  }

  await writeFile(getWindowStatePath(), JSON.stringify(nextState, null, 2), 'utf8')
}
