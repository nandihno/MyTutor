import https from 'node:https'
import { loadAPIKey } from './keystore.js'

const REQUEST_TIMEOUT_MS = 60_000
const MAX_ANALYSIS_ATTEMPTS = 2
const RETRY_DELAY_MS = 1_500
const PRIMARY_MODEL = 'gpt-5.4-mini'
const FALLBACK_MODEL = 'gpt-5-mini'
const TEACHER_TEMPERATURE = 0
const WORD_COUNT_TEMPERATURE = 0.2
const TEACHER_MAX_COMPLETION_TOKENS = 2600
const WORD_COUNT_MAX_COMPLETION_TOKENS = 2000

const TEACHER_MODE_PROMPT = `You are an experienced academic marker. You will be given assessment criteria and a student's written assessment. Analyse how well the student's work addresses each criteria point.

You will also be given a STUDENT DOCUMENT BLOCK MAP so you can point to where improvements are needed in the student's draft.

Return ONLY valid JSON in this exact structure, with no other text:
{
  "overall_direction": "on_track | needs_work | off_track",
  "overall_summary": "2-3 sentence summary",
  "criteria_analysis": [
    {
      "criteria_point": "string",
      "coverage": "strong | adequate | weak | missing",
      "priority": 1,
      "feedback": "specific actionable feedback",
      "focus_suggestion": "what to do to improve",
      "document_reference": {
        "section": "string",
        "block_id": "p1",
        "quote": "short exact excerpt from the student's assessment"
      }
    }
  ],
  "top_3_priorities": ["string", "string", "string"]
}

Requirements:
- Use block IDs from the STUDENT DOCUMENT BLOCK MAP exactly.
- Keep the quote short and exact.
- If a criterion is missing, cite the closest relevant block and explain the gap.
- Keep feedback actionable and reasonably concise.

Do not include markdown fences, commentary, or any keys outside this structure.`

const WORD_COUNT_MODE_PROMPT = `You are an academic writing coach. You will be given assessment criteria and a student's written assessment. Analyse each section and recommend whether it needs more or fewer words to best satisfy the criteria.

Return ONLY valid JSON in this exact structure, with no other text:
{
  "overall_word_count": 0,
  "sections": [
    {
      "section_title": "string",
      "current_words": 0,
      "recommendation": "reduce | expand | adequate",
      "suggested_words": 0,
      "reasoning": "why this section needs more or fewer words"
    }
  ],
  "summary": "overall word count strategy"
}

Do not include markdown fences, commentary, or any keys outside this structure.`

function createServiceError(code, message = code, details = {}) {
  const error = new Error(message)
  error.code = code
  Object.assign(error, details)
  return error
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function getSystemPrompt(mode) {
  if (mode === 'teacher') {
    return TEACHER_MODE_PROMPT
  }

  if (mode === 'wordCount') {
    return WORD_COUNT_MODE_PROMPT
  }

  throw createServiceError('INVALID_MODE', `Unsupported analysis mode: ${mode}`)
}

function buildAssessmentContent(assessmentDoc) {
  const markdown = assessmentDoc?.markdown ?? ''
  const imageMap = new Map((assessmentDoc?.images ?? []).map((image) => [image.placeholder, image]))
  const segments = markdown.split(/(\[IMAGE_\d+\])/g)
  const content = []

  for (const segment of segments) {
    if (!segment) {
      continue
    }

    const image = imageMap.get(segment)

    if (image) {
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${image.mimeType};base64,${image.base64}`
        }
      })
      continue
    }

    content.push({
      type: 'text',
      text: segment
    })
  }

  return content
}

function truncateBlockMapText(text, maxLength = 180) {
  const normalizedText = `${text ?? ''}`.replace(/\s{2,}/g, ' ').trim()

  if (normalizedText.length <= maxLength) {
    return normalizedText
  }

  return `${normalizedText.slice(0, maxLength - 1).trimEnd()}…`
}

function buildAssessmentBlockMapText(assessmentDoc) {
  const blocks = assessmentDoc?.blocks ?? []

  if (blocks.length === 0) {
    return 'STUDENT DOCUMENT BLOCK MAP:\nNo block references were generated.'
  }

  const lines = [
    'STUDENT DOCUMENT BLOCK MAP:',
    'Use these block IDs exactly when citing where improvements are needed.'
  ]

  for (const block of blocks) {
    lines.push(
      `[${block.id}] Section: ${block.section}`,
      `Type: ${block.type}`,
      `Excerpt: ${truncateBlockMapText(block.text)}`,
      ''
    )
  }

  return lines.join('\n')
}

function buildMessages(criteriaDoc, assessmentDoc, mode) {
  const userContent = [
    {
      type: 'text',
      text: `ASSESSMENT CRITERIA:\n${criteriaDoc?.markdown ?? ''}`
    },
    {
      type: 'text',
      text: 'STUDENT ASSESSMENT:'
    },
    ...buildAssessmentContent(assessmentDoc)
  ]

  if (mode === 'teacher') {
    userContent.push({
      type: 'text',
      text: buildAssessmentBlockMapText(assessmentDoc)
    })
  }

  return [
    {
      role: 'system',
      content: getSystemPrompt(mode)
    },
    {
      role: 'user',
      content: userContent
    }
  ]
}

function getRequestSettings(mode) {
  if (mode === 'teacher') {
    return {
      temperature: TEACHER_TEMPERATURE,
      maxCompletionTokens: TEACHER_MAX_COMPLETION_TOKENS
    }
  }

  return {
    temperature: WORD_COUNT_TEMPERATURE,
    maxCompletionTokens: WORD_COUNT_MAX_COMPLETION_TOKENS
  }
}

function requestChatCompletion(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify(payload)
    const request = https.request(
      {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(requestBody)
        }
      },
      (response) => {
        const chunks = []

        response.on('data', (chunk) => {
          chunks.push(chunk)
        })

        response.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf8')
          let parsedBody = null

          try {
            parsedBody = rawBody ? JSON.parse(rawBody) : null
          } catch (error) {
            if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
              reject(createServiceError('MALFORMED_RESPONSE', 'Unable to parse OpenAI response JSON.'))
              return
            }
          }

          if (response.statusCode === 401) {
            reject(createServiceError('INVALID_API_KEY'))
            return
          }

          if (response.statusCode === 429) {
            reject(createServiceError('RATE_LIMITED'))
            return
          }

          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            const message = parsedBody?.error?.message || `OpenAI request failed with status ${response.statusCode}.`
            const apiCode = parsedBody?.error?.code

            reject(
              createServiceError('OPENAI_API_ERROR', message, {
                statusCode: response.statusCode,
                apiCode
              })
            )
            return
          }

          resolve(parsedBody)
        })
      }
    )

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(createServiceError('TIMEOUT'))
    })

    request.on('error', (error) => {
      if (
        error.code === 'TIMEOUT' ||
        error.code === 'ETIMEDOUT' ||
        error.message === 'TIMEOUT'
      ) {
        reject(createServiceError('TIMEOUT'))
        return
      }

      reject(error)
    })

    request.write(requestBody)
    request.end()
  })
}

function shouldFallbackModel(error) {
  if (error.code !== 'OPENAI_API_ERROR' || error.statusCode !== 400) {
    return false
  }

  const message = `${error.message} ${error.apiCode ?? ''}`.toLowerCase()
  return message.includes(PRIMARY_MODEL.toLowerCase()) && (
    message.includes('model') ||
    message.includes('not found') ||
    message.includes('does not exist')
  )
}

function normalizeAnalysisError(error) {
  if (
    error?.code === 'TIMEOUT' ||
    error?.code === 'ETIMEDOUT' ||
    error?.message === 'TIMEOUT' ||
    error?.name === 'AbortError'
  ) {
    return createServiceError('TIMEOUT')
  }

  if (error?.code) {
    return error
  }

  return createServiceError('UNKNOWN_ERROR', error?.message || 'Unknown error.')
}

function shouldRetryAnalysis(error, attemptNumber) {
  return attemptNumber < MAX_ANALYSIS_ATTEMPTS && error.code === 'TIMEOUT'
}

function extractResponseText(responseBody) {
  const content = responseBody?.choices?.[0]?.message?.content

  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .filter((item) => item?.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text)
      .join('')
  }

  throw createServiceError('MALFORMED_RESPONSE', 'OpenAI response did not include message content.')
}

function parseJsonText(text) {
  const trimmedText = `${text ?? ''}`.trim()
  const normalizedText = trimmedText.replace(/^```json\s*|^```\s*|```$/gim, '').trim()

  try {
    return JSON.parse(normalizedText)
  } catch (error) {
    throw createServiceError('MALFORMED_RESPONSE', 'Model response was not valid JSON.')
  }
}

function validateTeacherResult(result) {
  const isValidCriteriaAnalysis = Array.isArray(result.criteria_analysis) && result.criteria_analysis.every((entry) =>
    entry &&
    typeof entry.criteria_point === 'string' &&
    typeof entry.coverage === 'string' &&
    Number.isInteger(entry.priority) &&
    typeof entry.feedback === 'string' &&
    typeof entry.focus_suggestion === 'string' &&
    entry.document_reference &&
    typeof entry.document_reference.section === 'string' &&
    typeof entry.document_reference.block_id === 'string' &&
    typeof entry.document_reference.quote === 'string'
  )

  if (
    !result ||
    typeof result.overall_direction !== 'string' ||
    typeof result.overall_summary !== 'string' ||
    !isValidCriteriaAnalysis ||
    !Array.isArray(result.top_3_priorities)
  ) {
    throw createServiceError('MALFORMED_RESPONSE', 'Teacher mode response did not match the expected JSON structure.')
  }
}

function validateWordCountResult(result) {
  const isValidSection = Array.isArray(result.sections) && result.sections.every((section) =>
    section &&
    typeof section.section_title === 'string' &&
    Number.isInteger(section.current_words) &&
    typeof section.recommendation === 'string' &&
    Number.isInteger(section.suggested_words) &&
    typeof section.reasoning === 'string'
  )

  if (
    !result ||
    !Number.isInteger(result.overall_word_count) ||
    !isValidSection ||
    typeof result.summary !== 'string'
  ) {
    throw createServiceError('MALFORMED_RESPONSE', 'Word count mode response did not match the expected JSON structure.')
  }
}

function validateAnalysisResult(result, mode) {
  if (mode === 'teacher') {
    validateTeacherResult(result)
    return
  }

  if (mode === 'wordCount') {
    validateWordCountResult(result)
    return
  }

  throw createServiceError('INVALID_MODE', `Unsupported analysis mode: ${mode}`)
}

async function requestAnalysis(criteriaDoc, assessmentDoc, mode, model) {
  const apiKey = await loadAPIKey()
  const requestSettings = getRequestSettings(mode)

  if (!apiKey) {
    throw createServiceError('NO_API_KEY')
  }

  const responseBody = await requestChatCompletion(apiKey, {
    model,
    temperature: requestSettings.temperature,
    max_completion_tokens: requestSettings.maxCompletionTokens,
    messages: buildMessages(criteriaDoc, assessmentDoc, mode)
  })

  const responseText = extractResponseText(responseBody)
  const parsedResult = parseJsonText(responseText)
  validateAnalysisResult(parsedResult, mode)

  return parsedResult
}

async function requestAnalysisWithRetry(criteriaDoc, assessmentDoc, mode, model) {
  let lastError = null

  for (let attemptNumber = 1; attemptNumber <= MAX_ANALYSIS_ATTEMPTS; attemptNumber += 1) {
    try {
      return await requestAnalysis(criteriaDoc, assessmentDoc, mode, model)
    } catch (error) {
      const normalizedError = normalizeAnalysisError(error)

      if (shouldFallbackModel(normalizedError)) {
        throw normalizedError
      }

      if (!shouldRetryAnalysis(normalizedError, attemptNumber)) {
        throw normalizedError
      }

      lastError = normalizedError
      await wait(RETRY_DELAY_MS)
    }
  }

  throw lastError || createServiceError('TIMEOUT')
}

export async function analyseAssessment(criteriaDoc, assessmentDoc, mode) {
  try {
    return await requestAnalysisWithRetry(criteriaDoc, assessmentDoc, mode, PRIMARY_MODEL)
  } catch (error) {
    if (shouldFallbackModel(error)) {
      return requestAnalysisWithRetry(criteriaDoc, assessmentDoc, mode, FALLBACK_MODEL)
    }

    throw normalizeAnalysisError(error)
  }
}
