import { ProviderError, readDeepSeek, readKimi } from './providers.js'

export const DEFAULT_TTL_MS = 25_000
export const DEFAULT_TIMEOUT_MS = 15_000
export const DEEPSEEK_REF = 'DEEPSEEK_API_KEY'
export const KIMI_REF = 'KIMI_CODING_API_KEY'

function resultForCaller(promise, signal) {
  if (signal === undefined) return promise.then(structuredClone)
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise((resolve, reject) => {
    const finish = (callback, value) => {
      signal.removeEventListener('abort', onAbort)
      callback(value)
    }
    const onAbort = () => finish(reject, signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      value => finish(resolve, structuredClone(value)),
      error => finish(reject, error),
    )
  })
}

function publicFailure(error) {
  return {
    ok: false,
    error: { code: error instanceof ProviderError ? error.code : 'unavailable' },
  }
}

export function createUsageService(options) {
  const credentials = options.credentials
  const fetcher = options.fetcher ?? fetch
  const now = options.now ?? Date.now
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let cached
  let inFlight

  const loadProvider = async (ref, read, signal) => {
    try {
      const resolved = await credentials.resolve(ref)
      if (resolved === undefined) return { ok: false, error: { code: 'credential-missing' } }
      return { ok: true, value: await read({ apiKey: resolved.value, fetcher, signal }) }
    } catch (error) {
      return publicFailure(error)
    }
  }

  const load = async () => {
    const timeout = AbortSignal.timeout(timeoutMs)
    const [deepseek, kimi] = await Promise.all([
      loadProvider(DEEPSEEK_REF, readDeepSeek, timeout),
      loadProvider(KIMI_REF, readKimi, timeout),
    ])
    return { fetchedAt: now(), deepseek, kimi }
  }

  return Object.freeze({
    read({ force = false, signal } = {}) {
      if (inFlight !== undefined) return resultForCaller(inFlight, signal)
      if (!force && cached !== undefined && now() - cached.fetchedAt < ttlMs) {
        return Promise.resolve(structuredClone(cached))
      }
      const current = load()
        .then((value) => {
          cached = structuredClone(value)
          return structuredClone(value)
        })
        .finally(() => {
          if (inFlight === current) inFlight = undefined
        })
      inFlight = current
      return resultForCaller(inFlight, signal)
    },
  })
}
