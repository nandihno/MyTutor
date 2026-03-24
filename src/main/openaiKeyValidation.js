import https from 'node:https'

const KEY_VALIDATION_TIMEOUT_MS = 15_000

export function validateOpenAIAPIKey(apiKey) {
  return new Promise((resolve) => {
    if (typeof apiKey !== 'string' || apiKey.trim() === '') {
      resolve({
        valid: false,
        error: 'MISSING_API_KEY'
      })
      return
    }

    const request = https.request(
      {
        hostname: 'api.openai.com',
        path: '/v1/models',
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`
        }
      },
      (response) => {
        const chunks = []

        response.on('data', (chunk) => {
          chunks.push(chunk)
        })

        response.on('end', () => {
          if (response.statusCode === 200) {
            resolve({ valid: true })
            return
          }

          if (response.statusCode === 401) {
            resolve({
              valid: false,
              error: 'INVALID_API_KEY'
            })
            return
          }

          resolve({
            valid: false,
            error: 'KEY_VALIDATION_FAILED'
          })
        })
      }
    )

    request.setTimeout(KEY_VALIDATION_TIMEOUT_MS, () => {
      request.destroy(new Error('TIMEOUT'))
    })

    request.on('error', (error) => {
      if (error.message === 'TIMEOUT' || error.code === 'ETIMEDOUT') {
        resolve({
          valid: false,
          error: 'TIMEOUT'
        })
        return
      }

      resolve({
        valid: false,
        error: 'NETWORK_ERROR'
      })
    })

    request.end()
  })
}
