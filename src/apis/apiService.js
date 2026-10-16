const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '')
const AGENT_ID = import.meta.env.VITE_AGENT_ID || ''
const XI_API_KEY = import.meta.env.VITE_XI_API_KEY || ''

// ── Internal helper ───────────────────────────────────────────────────────────
async function request(url, options = {}) {
  const { headers: optHeaders, ...restOptions } = options
  const res = await fetch(url, {
    headers: {
      'accept': 'application/json',
      'xi-api-key': XI_API_KEY,
      'ngrok-skip-browser-warning': 'true',
      ...optHeaders,
    },
    ...restOptions,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || body.message || `Request failed with status ${res.status}`)
  }

  return res.json()
}

// ── Application ───────────────────────────────────────────────────────────────

export async function getApplicationStatus(jobId, applicationId) {
  const data = await request(
    `${BACKEND_URL}/recruitment/applications/jobs/${jobId}/applications?limit=50&offset=0`
  )
  const app = data.items?.find(item => item.application_id === applicationId)
  if (!app) throw new Error('Application not found.')
  return app.status
}

/**
 * Validates the candidate's application ID.
 * POST /recruitment/agents/technical/validate/{applicationId}
 *
 * @param {string} applicationId
 * @returns {{ detail: string } | object}
 */
// export async function validateApplication(applicationId) {
//   return request(`${BACKEND_URL}/recruitment/agents/technical/validate/${applicationId}`, {
//     method: 'POST',
//   })
// }
export async function validateApplication(applicationId, statusChange = true) {
  return request(
    `${BACKEND_URL}/recruitment/agents/technical/validate/${encodeURIComponent(applicationId)}?status_change=${statusChange}`,
    { method: 'POST' }
  )
}
/**
 * Uploads the candidate's identity images (govt ID + live photo).
 * POST /recruitment/identity/{applicationId}   (multipart/form-data)
 *
 * @param {string} applicationId
 * @param {Blob}   photoBlob   - Live candidate photo (JPEG)
 * @param {Blob}   govtIdBlob  - Live govt ID photo (JPEG)
 */
export async function uploadIdentity(applicationId, photoBlob, govtIdBlob) {
  const formData = new FormData()
  formData.append('govt_id', govtIdBlob, `${applicationId}_govt_id.jpg`)
  formData.append('photo', photoBlob, `${applicationId}_photo.jpg`)

  const res = await fetch(`${BACKEND_URL}/recruitment/identity/${applicationId}`, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'xi-api-key': XI_API_KEY,
      'ngrok-skip-browser-warning': 'true',
    },
    body: formData,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || body.message || `Identity upload failed with status ${res.status}`)
  }

  return res.json()
}

// ── Agent ─────────────────────────────────────────────────────────────────────

/**
 * Fetches a signed URL for the AI agent conversation iframe.
 * GET /redirect/v1/convai/conversation/get_signed_url?agent_id=AGENT_ID
 *
 * @returns {{ signed_url: string }}
 */
export async function getAgentSignedUrl() {
  const res = await fetch(
    `${BACKEND_URL}/redirect/unlock/v1/convai/conversation/get_signed_url?agent_id=${AGENT_ID}`,
    {
      method: 'GET',
      headers: {
        'xi-api-key': XI_API_KEY,
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
    }
  )

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const detail = body?.detail

    if (typeof detail === 'object' && detail !== null) {
      throw new Error(
        detail?.message ||
        detail?.status ||
        `Failed to fetch agent signed URL (${res.status})`
      )
    }

    throw new Error(
      detail ||
      body?.message ||
      `Failed to fetch agent signed URL (${res.status})`
    )
  }

  return res.json()
}

// ── Session ───────────────────────────────────────────────────────────────────

/**
 * Marks the session as started (one-time lock).
 *
 * @param {string} applicationId
 */
export async function startSession(applicationId) {
  return request(`${BACKEND_URL}/recruitment/agents/technical/session/start/${applicationId}`, {
    method: 'POST',
  })
}
/**
 * Tracks a specific interview violation.
 *
 * POST /recruitment/agents/technical/violations/track
 */
export async function trackViolation(
  applicationId,
  round = 'technical',
  violationType
) {
  return request(
    `${BACKEND_URL}/recruitment/agents/technical/violations/track`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        application_id: applicationId,
        round,
        violation_type: violationType,
      }),
    }
  )
}

/**
 * Records a violation event during the interview.
 *
 * @param {string} applicationId
 * @param {{ type: string, message: string, timestamp: string }} violation
 */
export async function reportViolation(applicationId, violation) {
  return request(`${BACKEND_URL}/recruitment/agents/technical/session/violation/${applicationId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(violation),
  })
}

/**
 * Marks the technical round incomplete when the candidate ends the interview
 * before the agent submits. Returns 409 if the round has already moved on.
 * POST /recruitment/agents/technical/exit/{applicationId}
 *
 * @param {string} applicationId
 */
export async function exitTechnicalInterview(applicationId) {
  return request(`${BACKEND_URL}/recruitment/agents/technical/exit/${encodeURIComponent(applicationId)}`, {
    method: 'POST',
  })
}

/**
 * Flags the application as Round 2 violated when the session is terminated.
 * POST /recruitment/agents/technical/violate/{applicationId}
 *
 * @param {string} applicationId
 */
export async function reportTermination(applicationId) {
  return request(`${BACKEND_URL}/recruitment/agents/technical/violate/${applicationId}`, {
    method: 'POST',
  })
}

// ── Recording ─────────────────────────────────────────────────────────────────

/**
 * Uploads the recorded interview video to the backend.
 * POST /recruitment/recordings/{applicationId}
 *
 * @param {string} applicationId
 * @param {Blob}   blob  - WebM recording blob
 */
export async function uploadRecording(applicationId, blob) {
  const formData = new FormData()
  formData.append('file', blob, `${applicationId}_recording.webm`)

  const res = await fetch(`${BACKEND_URL}/recruitment/recordings/${applicationId}`, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'xi-api-key': XI_API_KEY,
      'ngrok-skip-browser-warning': 'true',
    },
    body: formData,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || body.message || `Upload failed with status ${res.status}`)
  }

  return res.json()
}

/**
 * Uploads with real XHR progress events.
 * Resolves with the parsed JSON response.
 * onProgress receives 0-100 integer.
 *
 * @param {string}   applicationId
 * @param {Blob}     blob
 * @param {function} onProgress
 */
export function uploadRecordingWithProgress(applicationId, blob, onProgress) {
  return new Promise((resolve, reject) => {
    const formData = new FormData()
    formData.append('file', blob, `${applicationId}_recording.webm`)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BACKEND_URL}/recruitment/recordings/${applicationId}`)
    xhr.setRequestHeader('accept', 'application/json')
    xhr.setRequestHeader('xi-api-key', XI_API_KEY)
    xhr.setRequestHeader('ngrok-skip-browser-warning', 'true')
    xhr.timeout = 120000 // 2 min

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)) } catch { resolve({}) }
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`))
      }
    }
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.ontimeout = () => reject(new Error('Upload timed out'))
    xhr.send(formData)
  })
}

// ── Coding round ─────────────────────────────────────────────────────────────

export async function reportCodingViolation(applicationId) {
  return request(`${BACKEND_URL}/recruitment/agents/technical/coding/violate/${applicationId}`, {
    method: 'POST',
  })
}

export async function collectCodingRound(applicationId) {
  return request(`${BACKEND_URL}/recruitment/agents/technical/coding/collect/${applicationId}`, {
    method: 'POST',
  })
}

// ── Compiler ──────────────────────────────────────────────────────────────────

export async function getCompilerLanguages() {
  return request(`${BACKEND_URL}/recruitment/compiler/languages`)
}

export async function getCodingQuestions(applicationId) {
  return request(`${BACKEND_URL}/recruitment/compiler/${applicationId}`)
}

export async function runCode(applicationId, { question_index, language_id, source_code, custom_test_cases = [] }) {
  return request(`${BACKEND_URL}/recruitment/compiler/run/${applicationId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question_index, language_id, source_code, custom_test_cases }),
  })
}

export async function submitCode(applicationId, { question_index, language_id, language_name, source_code }) {
  return request(`${BACKEND_URL}/recruitment/compiler/submit/${applicationId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question_index, language_id, language_name, source_code }),
  })
}
