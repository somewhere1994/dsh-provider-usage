import assert from 'node:assert/strict'
import test from 'node:test'

import {
  KIMI_WINDOW_5H_MINUTES,
  KIMI_WINDOW_7D_MINUTES,
  ProviderError,
  parseDeepSeekBalance,
  parseKimiUsage,
  readDeepSeek,
  readKimi,
} from '../src/providers.js'

test('parseDeepSeekBalance returns only validated balance fields', () => {
  assert.deepEqual(parseDeepSeekBalance({
    is_available: true,
    balance_infos: [{
      currency: 'CNY',
      total_balance: '12.30',
      granted_balance: '2.30',
      topped_up_balance: '10.00',
    }],
  }), {
    available: true,
    balances: [{ currency: 'CNY', total: '12.30', granted: '2.30', toppedUp: '10.00' }],
  })
})

test('parseKimiUsage exposes the 5h rolling window and falls back to usage for the 7d view', () => {
  const weekly = {
    limit: '2048',
    used: '214',
    remaining: '1834',
    resetTime: '2026-08-20T00:00:00Z',
  }
  const rolling = {
    limit: '200',
    used: '139',
    remaining: '61',
    resetTime: '2026-08-15T18:00:00Z',
  }
  assert.deepEqual(parseKimiUsage({
    usage: weekly,
    limits: [{
      window: { duration: KIMI_WINDOW_5H_MINUTES, timeUnit: 'TIME_UNIT_MINUTE' },
      detail: rolling,
    }],
  }), {
    usage: {
      limit: '2048',
      used: '214',
      remaining: '1834',
      resetTime: '2026-08-20T00:00:00.000Z',
    },
    limits: [{
      durationMinutes: 300,
      limit: '200',
      used: '139',
      remaining: '61',
      resetTime: '2026-08-15T18:00:00.000Z',
    }],
    rolling5h: {
      durationMinutes: 300,
      limit: '200',
      used: '139',
      remaining: '61',
      resetTime: '2026-08-15T18:00:00.000Z',
    },
    weekly7d: {
      limit: '2048',
      used: '214',
      remaining: '1834',
      resetTime: '2026-08-20T00:00:00.000Z',
    },
  })
})

test('parseKimiUsage prefers an explicit 7d window when the provider returns one', () => {
  const sevenDay = {
    limit: '500',
    remaining: '450',
    resetTime: '2026-08-20T00:00:00Z',
  }
  const parsed = parseKimiUsage({
    usage: { limit: '100', used: '27', remaining: '73', resetTime: '2026-08-19T01:51:09.550419Z' },
    limits: [
      {
        window: { duration: KIMI_WINDOW_7D_MINUTES, timeUnit: 'TIME_UNIT_MINUTE' },
        detail: sevenDay,
      },
      {
        window: { duration: KIMI_WINDOW_5H_MINUTES, timeUnit: 'TIME_UNIT_MINUTE' },
        detail: { limit: '100', remaining: '100', resetTime: '2026-08-14T20:51:09.550419Z' },
      },
    ],
  })

  assert.equal(parsed.weekly7d.limit, '500')
  assert.equal(parsed.weekly7d.remaining, '450')
  assert.equal(parsed.rolling5h.remaining, '100')
})

test('parseKimiUsage accepts the current response when used fields are omitted', () => {
  const parsed = parseKimiUsage({
    usage: { limit: '100', remaining: '76', resetTime: '2026-08-20T00:00:00Z' },
    limits: [{
      window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' },
      detail: { limit: '100', remaining: '88', resetTime: '2026-08-15T18:00:00Z' },
    }],
  })
  assert.equal(parsed.usage.used, undefined)
  assert.equal(parsed.rolling5h.used, undefined)
})

const malformedDeepSeek = [
  null,
  { is_available: true },
  { is_available: true, balance_infos: {} },
  { is_available: true, balance_infos: [{ currency: 'EUR', total_balance: '1', granted_balance: '0', topped_up_balance: '1' }] },
  { is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '-1', granted_balance: '0', topped_up_balance: '0' }] },
]

for (const [index, fixture] of malformedDeepSeek.entries()) {
  test(`parseDeepSeekBalance rejects malformed payload ${index + 1}`, () => {
    assert.throws(() => parseDeepSeekBalance(fixture), error => (
      error instanceof ProviderError && error.code === 'malformed'
    ))
  })
}

const malformedKimi = [
  null,
  { usage: {}, limits: [] },
  { usage: { limit: '1', used: '0', remaining: '-1', resetTime: '2026-08-20T00:00:00Z' }, limits: [] },
  { usage: { limit: '1', used: '0', remaining: '1', resetTime: 'not-a-time' }, limits: [] },
  {
    usage: { limit: '1', used: '0', remaining: '1', resetTime: '2026-08-20T00:00:00Z' },
    limits: [{
      window: { duration: 300, timeUnit: 'TIME_UNIT_DAY' },
      detail: { limit: '1', used: '0', remaining: '1', resetTime: '2026-08-20T00:00:00Z' },
    }],
  },
]

for (const [index, fixture] of malformedKimi.entries()) {
  test(`parseKimiUsage rejects malformed payload ${index + 1}`, () => {
    assert.throws(() => parseKimiUsage(fixture), error => (
      error instanceof ProviderError && error.code === 'malformed'
    ))
  })
}

const deepSeekPayload = {
  is_available: true,
  balance_infos: [{
    currency: 'CNY',
    total_balance: '12.30',
    granted_balance: '2.30',
    topped_up_balance: '10.00',
  }],
}

const kimiPayload = {
  usage: { limit: '2048', used: '214', remaining: '1834', resetTime: '2026-08-20T00:00:00Z' },
  limits: [],
}

test('readDeepSeek sends the required safe balance request', async () => {
  const calls = []
  const signal = new AbortController().signal
  const value = await readDeepSeek({
    apiKey: 'deepseek-test-key',
    signal,
    fetcher: async (...args) => {
      calls.push(args)
      return Response.json(deepSeekPayload)
    },
  })

  assert.deepEqual(value, {
    available: true,
    balances: [{ currency: 'CNY', total: '12.30', granted: '2.30', toppedUp: '10.00' }],
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'https://api.deepseek.com/user/balance')
  assert.equal(calls[0][1].method, 'GET')
  assert.equal(calls[0][1].redirect, 'error')
  assert.equal(calls[0][1].signal, signal)
  assert.deepEqual(calls[0][1].headers, {
    authorization: 'Bearer deepseek-test-key',
    accept: 'application/json',
    'user-agent': 'dsh-provider-usage/0.2.0',
  })
})

test('readKimi sends the required safe usage request', async () => {
  const calls = []
  const signal = new AbortController().signal
  const value = await readKimi({
    apiKey: 'kimi-test-key',
    signal,
    fetcher: async (...args) => {
      calls.push(args)
      return Response.json(kimiPayload)
    },
  })

  assert.equal(value.usage.remaining, '1834')
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'https://api.kimi.com/coding/v1/usages')
  assert.equal(calls[0][1].method, 'GET')
  assert.equal(calls[0][1].redirect, 'error')
  assert.equal(calls[0][1].signal, signal)
  assert.deepEqual(calls[0][1].headers, {
    authorization: 'Bearer kimi-test-key',
    accept: 'application/json',
    'user-agent': 'dsh-provider-usage/0.2.0',
  })
})

for (const [status, code] of [[401, 'auth'], [403, 'auth'], [429, 'rate-limited'], [500, 'unavailable']]) {
  test(`provider requests map HTTP ${status} to ${code} without exposing the body`, async () => {
    await assert.rejects(
      readDeepSeek({
        apiKey: 'secret-key-that-must-not-leak',
        fetcher: async () => new Response('raw-secret-provider-body', { status }),
      }),
      error => error instanceof ProviderError
        && error.code === code
        && !error.message.includes('secret-key')
        && !error.message.includes('raw-secret'),
    )
  })
}
