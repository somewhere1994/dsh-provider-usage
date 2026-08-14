import assert from 'node:assert/strict'
import test from 'node:test'

import { DEFAULT_TTL_MS, createUsageService } from '../src/usage-service.js'
import { apply, createRpcHandler, inject, name } from '../src/index.js'

const DEEPSEEK = {
  is_available: true,
  balance_infos: [{
    currency: 'CNY',
    total_balance: '12.30',
    granted_balance: '2.30',
    topped_up_balance: '10.00',
  }],
}

const KIMI = {
  usage: { limit: '2048', used: '214', remaining: '1834', resetTime: '2026-08-20T00:00:00Z' },
  limits: [],
}

function credentials(values) {
  const calls = []
  return {
    calls,
    async resolve(ref) {
      calls.push(String(ref))
      const value = values[String(ref)]
      return value === undefined ? undefined : { value, source: 'test' }
    },
  }
}

function providerFetcher(calls = []) {
  return Object.assign(async (url, init) => {
    calls.push({ url, init })
    if (url.includes('deepseek.com')) return Response.json(DEEPSEEK)
    if (url.includes('kimi.com')) return Response.json(KIMI)
    throw new Error('unexpected URL')
  }, { calls })
}

test('default cache TTL stays below the 60 second browser refresh cadence', () => {
  assert.equal(DEFAULT_TTL_MS, 25_000)
  assert.ok(DEFAULT_TTL_MS < 60_000)
})

test('usage service resolves configured references and returns only safe projections', async () => {
  const secretValues = {
    DEEPSEEK_API_KEY: 'deepseek-secret-sentinel',
    KIMI_CODING_API_KEY: 'kimi-secret-sentinel',
  }
  const credentialService = credentials(secretValues)
  const fetcher = providerFetcher()
  const service = createUsageService({ credentials: credentialService, fetcher, now: () => 1_000 })

  const result = await service.read()

  assert.deepEqual(credentialService.calls, ['DEEPSEEK_API_KEY', 'KIMI_CODING_API_KEY'])
  assert.equal(result.fetchedAt, 1_000)
  assert.equal(result.deepseek.ok, true)
  assert.equal(result.deepseek.value.balances[0].total, '12.30')
  assert.equal(result.kimi.ok, true)
  assert.equal(result.kimi.value.usage.remaining, '1834')
  assert.equal(result.kimi.value.rolling5h, null)
  assert.equal(result.kimi.value.weekly7d.remaining, '1834')
  const serialized = JSON.stringify(result)
  assert.equal(serialized.includes(secretValues.DEEPSEEK_API_KEY), false)
  assert.equal(serialized.includes(secretValues.KIMI_CODING_API_KEY), false)
})

test('usage service preserves one provider success when the other credential is missing', async () => {
  const service = createUsageService({
    credentials: credentials({ DEEPSEEK_API_KEY: 'deepseek-secret' }),
    fetcher: providerFetcher(),
    now: () => 2_000,
  })

  const result = await service.read()

  assert.equal(result.deepseek.ok, true)
  assert.deepEqual(result.kimi, { ok: false, error: { code: 'credential-missing' } })
})

test('usage service reuses fresh cache and force refresh bypasses it', async () => {
  let now = 10_000
  const fetcher = providerFetcher()
  const credentialService = credentials({
    DEEPSEEK_API_KEY: 'deepseek-secret',
    KIMI_CODING_API_KEY: 'kimi-secret',
  })
  const service = createUsageService({ credentials: credentialService, fetcher, now: () => now, ttlMs: 60_000 })

  const first = await service.read()
  now += 59_999
  const cached = await service.read()
  now += 1
  const forced = await service.read({ force: true })

  assert.deepEqual(cached, first)
  assert.notEqual(cached, first)
  assert.equal(fetcher.calls.length, 4)
  assert.equal(credentialService.calls.length, 4)
  assert.equal(forced.fetchedAt, 70_000)
})

test('usage service returns detached copies of cached data', async () => {
  const service = createUsageService({
    credentials: credentials({ DEEPSEEK_API_KEY: 'd', KIMI_CODING_API_KEY: 'k' }),
    fetcher: providerFetcher(),
    now: () => 5_000,
  })
  const first = await service.read()
  first.deepseek.value.balances[0].total = 'mutated'

  const second = await service.read()

  assert.equal(second.deepseek.value.balances[0].total, '12.30')
})

test('usage service shares one in-flight refresh between concurrent readers', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const calls = []
  const fetcher = async (url) => {
    calls.push(url)
    await gate
    return Response.json(url.includes('deepseek.com') ? DEEPSEEK : KIMI)
  }
  const credentialService = credentials({ DEEPSEEK_API_KEY: 'd', KIMI_CODING_API_KEY: 'k' })
  const service = createUsageService({ credentials: credentialService, fetcher, now: () => 9_000 })

  const first = service.read()
  const second = service.read({ force: true })
  await Promise.resolve()
  release()

  assert.deepEqual(await first, await second)
  assert.equal(calls.length, 2)
  assert.equal(credentialService.calls.length, 2)
})

test('one aborted caller does not cancel the shared refresh', async () => {
  const firstCaller = new AbortController()
  let release
  const gate = new Promise(resolve => { release = resolve })
  const calls = []
  const fetcher = async (url, init) => {
    calls.push({ url, signal: init.signal })
    await gate
    return Response.json(url.includes('deepseek.com') ? DEEPSEEK : KIMI)
  }
  const service = createUsageService({
    credentials: credentials({ DEEPSEEK_API_KEY: 'd', KIMI_CODING_API_KEY: 'k' }),
    fetcher,
  })

  const first = service.read({ force: true, signal: firstCaller.signal })
  const second = service.read({ force: true })
  firstCaller.abort(new DOMException('caller left', 'AbortError'))
  await assert.rejects(first, error => error.name === 'AbortError')
  release()

  const value = await second
  assert.equal(value.deepseek.ok, true)
  assert.equal(value.kimi.ok, true)
  assert.equal(calls.length, 2)
  assert.equal(calls.every(call => call.signal !== firstCaller.signal), true)
})

test('the internal timeout terminates hanging provider requests', async () => {
  const fetcher = async (_url, init) => await new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
  })
  const service = createUsageService({
    credentials: credentials({ DEEPSEEK_API_KEY: 'd', KIMI_CODING_API_KEY: 'k' }),
    fetcher,
    timeoutMs: 10,
  })

  const value = await service.read({ force: true })
  assert.deepEqual(value.deepseek, { ok: false, error: { code: 'timeout' } })
  assert.deepEqual(value.kimi, { ok: false, error: { code: 'timeout' } })
})

test('Host plugin registers one loopback-only package RPC effect', async () => {
  const registrations = []
  let disposed = false
  const ctx = {
    credentials: credentials({}),
    connection: {
      rpc: {
        handle(channel, handler, options) {
          registrations.push({ channel, handler, options })
          return () => { disposed = true }
        },
      },
    },
    effect(factory) {
      this.dispose = factory()
    },
  }

  apply(ctx)

  assert.equal(name, 'provider-usage')
  assert.deepEqual(inject, ['credentials', 'connection'])
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].channel, '/dsh-provider-usage')
  assert.deepEqual(registrations[0].options, { authority: 'loopback' })
  const response = await registrations[0].handler('usage/read', { force: false })
  assert.equal(response.ok, true)
  assert.equal(response.value.deepseek.error.code, 'credential-missing')
  ctx.dispose()
  assert.equal(disposed, true)
})

test('Host RPC rejects unknown endpoints without invoking the service', async () => {
  let calls = 0
  const handler = createRpcHandler({
    async read() {
      calls += 1
      return { fetchedAt: 1 }
    },
  })

  assert.deepEqual(await handler('other/read', {}, new AbortController().signal), {
    ok: false,
    error: { code: 'not-found', message: 'Unknown provider usage endpoint' },
  })
  assert.equal(calls, 0)
})

test('Host RPC sanitizes unexpected failures', async () => {
  const handler = createRpcHandler({
    async read() {
      throw new Error('raw upstream failure with secret-sentinel')
    },
  })

  const response = await handler('usage/read', { force: true }, new AbortController().signal)

  assert.deepEqual(response, {
    ok: false,
    error: { code: 'internal', message: 'Usage is temporarily unavailable' },
  })
  assert.equal(JSON.stringify(response).includes('secret-sentinel'), false)
})
