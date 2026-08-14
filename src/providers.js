export const KIMI_WINDOW_5H_MINUTES = 300
export const KIMI_WINDOW_7D_MINUTES = 7 * 24 * 60

export class ProviderError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ProviderError'
    this.code = code
  }
}

const DECIMAL = /^\d+(?:\.\d+)?$/u

function malformed() {
  return new ProviderError('malformed', 'Provider returned malformed usage data')
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nonNegativeDecimal(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64 || !DECIMAL.test(value)) {
    throw malformed()
  }
  return value
}

function isoTime(value) {
  if (typeof value !== 'string' || value.length === 0) throw malformed()
  const time = new Date(value)
  if (!Number.isFinite(time.getTime())) throw malformed()
  return time.toISOString()
}

function allowance(value) {
  if (!record(value)) throw malformed()
  const parsed = {
    limit: nonNegativeDecimal(value.limit),
    remaining: nonNegativeDecimal(value.remaining),
    resetTime: isoTime(value.resetTime),
  }
  if (value.used !== undefined) parsed.used = nonNegativeDecimal(value.used)
  return parsed
}

export function parseDeepSeekBalance(value) {
  if (!record(value) || typeof value.is_available !== 'boolean' || !Array.isArray(value.balance_infos)) {
    throw malformed()
  }
  return {
    available: value.is_available,
    balances: value.balance_infos.map((item) => {
      if (!record(item) || (item.currency !== 'CNY' && item.currency !== 'USD')) throw malformed()
      return {
        currency: item.currency,
        total: nonNegativeDecimal(item.total_balance),
        granted: nonNegativeDecimal(item.granted_balance),
        toppedUp: nonNegativeDecimal(item.topped_up_balance),
      }
    }),
  }
}

function minuteWindow(value) {
  if (!record(value) || !Number.isInteger(value.duration) || value.duration <= 0) throw malformed()
  if (value.timeUnit === 'TIME_UNIT_MINUTE') return value.duration
  if (value.timeUnit === 'TIME_UNIT_HOUR') return value.duration * 60
  throw malformed()
}

export function parseKimiUsage(value) {
  if (!record(value) || !record(value.usage) || !Array.isArray(value.limits)) throw malformed()
  const usage = allowance(value.usage)
  const limits = value.limits.map((item) => {
    if (!record(item) || !record(item.window)) throw malformed()
    const durationMinutes = minuteWindow(item.window)
    return {
      durationMinutes,
      ...allowance(item.detail),
    }
  })
  return {
    usage,
    limits,
    rolling5h: limits.find(item => item.durationMinutes === KIMI_WINDOW_5H_MINUTES) ?? null,
    weekly7d: limits.find(item => item.durationMinutes === KIMI_WINDOW_7D_MINUTES) ?? usage,
  }
}

const VERSION = '0.2.0'
const REQUEST_HEADERS = {
  accept: 'application/json',
  'user-agent': `dsh-provider-usage/${VERSION}`,
}

function httpError(status) {
  if (status === 401 || status === 403) {
    return new ProviderError('auth', 'Provider rejected the configured credential')
  }
  if (status === 429) {
    return new ProviderError('rate-limited', 'Provider rate limit reached')
  }
  return new ProviderError('unavailable', 'Provider usage is temporarily unavailable')
}

async function readJson({ url, apiKey, fetcher, signal, parse }) {
  let response
  try {
    response = await fetcher(url, {
      method: 'GET',
      redirect: 'error',
      headers: { authorization: `Bearer ${apiKey}`, ...REQUEST_HEADERS },
      signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw new ProviderError('timeout', 'Provider usage request timed out')
    }
    throw new ProviderError('unavailable', 'Provider usage is temporarily unavailable')
  }
  if (!response.ok) throw httpError(response.status)
  let value
  try {
    value = await response.json()
  } catch {
    throw malformed()
  }
  return parse(value)
}

export function readDeepSeek({ apiKey, fetcher = fetch, signal } = {}) {
  return readJson({
    url: 'https://api.deepseek.com/user/balance',
    apiKey,
    fetcher,
    signal,
    parse: parseDeepSeekBalance,
  })
}

export function readKimi({ apiKey, fetcher = fetch, signal } = {}) {
  return readJson({
    url: 'https://api.kimi.com/coding/v1/usages',
    apiKey,
    fetcher,
    signal,
    parse: parseKimiUsage,
  })
}
