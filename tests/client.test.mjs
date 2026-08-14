import assert from 'node:assert/strict'
import test, { afterEach } from 'node:test'
import { JSDOM } from 'jsdom'
import React from 'react'

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'http://127.0.0.1:3080/',
})
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Node = dom.window.Node
globalThis.MutationObserver = dom.window.MutationObserver
globalThis.getComputedStyle = dom.window.getComputedStyle

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react')
const {
  AUTO_REFRESH_MS,
  COPY,
  NOW_TICK_MS,
  UsageDock,
  apply,
  displayFor,
  inject,
  mergeSnapshot,
  nextProvider,
  remainingPercent,
} = await import('../src/client.js')

function zhT(key, params = {}) {
  const template = COPY.zh[key] ?? key
  return template.replace(/\{(\w+)\}/gu, (_, name) => String(params[name] ?? ''))
}

afterEach(() => {
  cleanup()
  document.head.querySelectorAll('[data-plugin="dsh-provider-usage"]').forEach(node => node.remove())
})

const weekly = {
  limit: '100',
  used: '27',
  remaining: '73',
  resetTime: '2026-08-19T01:51:09.000Z',
}

const rolling = {
  limit: '100',
  used: '0',
  remaining: '100',
  resetTime: '2026-08-14T20:51:09.000Z',
}

const snapshot = {
  fetchedAt: Date.parse('2026-08-15T12:00:00Z'),
  deepseek: {
    ok: true,
    value: {
      available: true,
      balances: [{ currency: 'CNY', total: '12.30', granted: '2.30', toppedUp: '10.00' }],
    },
  },
  kimi: {
    ok: true,
    value: {
      usage: weekly,
      limits: [{ durationMinutes: 300, ...rolling }],
      rolling5h: { durationMinutes: 300, ...rolling },
      weekly7d: weekly,
    },
  },
}

test('client cadence is one tick per second with a 60 second refresh target', () => {
  assert.equal(NOW_TICK_MS, 1_000)
  assert.equal(AUTO_REFRESH_MS, 60_000)
})

test('nextProvider switches between the two configured providers', () => {
  assert.equal(nextProvider('deepseek'), 'kimi')
  assert.equal(nextProvider('kimi'), 'deepseek')
})

test('remainingPercent clamps the remaining ratio to 0..100', () => {
  assert.equal(remainingPercent({ remaining: '73', limit: '100' }), 73)
  assert.equal(remainingPercent({ remaining: '250', limit: '100' }), 100)
  assert.equal(remainingPercent({ remaining: '0', limit: '0' }), 0)
})

test('mergeSnapshot keeps the last successful provider result when a refresh returns an error', () => {
  const merged = mergeSnapshot(snapshot, {
    fetchedAt: Date.parse('2026-08-15T12:01:00Z'),
    deepseek: { ok: true, value: { available: true, balances: [{ currency: 'CNY', total: '9.00', granted: '0', toppedUp: '9.00' }] } },
    kimi: { ok: false, error: { code: 'auth' } },
  })

  assert.equal(merged.fetchedAt, Date.parse('2026-08-15T12:01:00Z'))
  assert.equal(merged.deepseek.value.balances[0].total, '9.00')
  assert.equal(merged.kimi.ok, true)
  assert.equal(merged.kimi.staleError.code, 'auth')
})

test('displayFor formats the DeepSeek balance headline', () => {
  assert.deepEqual(displayFor('deepseek', snapshot, 'zh-CN'), {
    providerLabel: 'DeepSeek',
    headline: 'CNY 12.30',
    detail: '余额可用',
    state: 'ready',
    balance: {
      currency: 'CNY',
      total: '12.30',
      granted: '2.30',
      toppedUp: '10.00',
      available: true,
    },
  })
})

test('displayFor exposes both Kimi allowance windows', () => {
  const result = displayFor('kimi', snapshot, 'zh-CN')
  assert.equal(result.providerLabel, 'Kimi Code')
  assert.equal(result.headline, '73 / 100')
  assert.equal(result.state, 'ready')
  assert.deepEqual(result.quotas.map(quota => quota.id), ['weekly7d', 'rolling5h'])
  assert.deepEqual(result.quotas[0], {
    id: 'weekly7d',
    available: true,
    label: '7 天额度',
    limit: '100',
    remaining: '73',
    used: '27',
    percent: 73,
    resetTime: '2026-08-19T01:51:09.000Z',
  })
  assert.equal(result.quotas[1].label, '5 小时滚动额度')
  assert.equal(result.quotas[1].remaining, '100')
})

test('displayFor marks a missing 5h window as unavailable instead of crashing', () => {
  const result = displayFor('kimi', {
    kimi: {
      ok: true,
      value: {
        usage: weekly,
        limits: [],
        rolling5h: null,
        weekly7d: weekly,
      },
    },
  }, 'zh-CN')

  assert.equal(result.state, 'ready')
  assert.equal(result.quotas[1].available, false)
})

test('displayFor localizes loading and provider failures', () => {
  assert.deepEqual(displayFor('deepseek', undefined, 'en-US'), {
    providerLabel: 'DeepSeek',
    headline: 'Loading usage…',
    detail: '',
    state: 'loading',
  })
  assert.deepEqual(displayFor('kimi', {
    kimi: { ok: false, error: { code: 'credential-missing' } },
  }, 'zh-CN'), {
    providerLabel: 'Kimi Code',
    headline: '未配置 API Key',
    detail: '',
    state: 'error',
    error: { code: 'credential-missing' },
  })
  assert.equal(displayFor('kimi', {
    kimi: { ok: false, error: { code: 'rate-limited' } },
  }, 'en-US').headline, 'Rate limited')
})

test('UsageDock loads once, switches locally, and force refreshes separately', async () => {
  const calls = []
  let releaseRefresh
  const refreshGate = new Promise(resolve => { releaseRefresh = resolve })
  const rpc = {
    call(channel, endpoint, payload) {
      calls.push({ channel, endpoint, payload })
      if (calls.length === 1) return Promise.resolve({ ok: true, value: snapshot })
      return refreshGate.then(() => ({ ok: true, value: snapshot }))
    },
  }

  render(React.createElement(UsageDock, { rpc, t: zhT, locale: 'zh' }))

  await screen.findByText('CNY 12.30')
  const root = document.querySelector('[data-provider-usage]')
  const stage = document.querySelector('.dpu-expand')
  assert.equal(root?.dataset.expanded, 'false')
  assert.equal(stage?.dataset.open, 'false')
  assert.equal(stage?.getAttribute('aria-hidden'), 'true')
  assert.deepEqual(calls, [{
    channel: '/dsh-provider-usage',
    endpoint: 'usage/read',
    payload: { force: false },
  }])
  assert.match(document.body.textContent, /秒后自动刷新/u)

  fireEvent.click(screen.getByRole('button', { name: '展开额度面板' }))
  assert.equal(root?.dataset.expanded, 'true')
  assert.equal(stage?.dataset.open, 'true')
  assert.equal(document.querySelector('.dpu-body')?.dataset.tabDirection, 'back')

  fireEvent.click(screen.getByRole('tab', { name: 'Kimi Code' }))
  assert.equal(document.querySelector('.dpu-body')?.dataset.tabDirection, 'forward')
  assert.ok(screen.getByText('7 天额度'))
  assert.ok(screen.getByText('5 小时滚动额度'))
  assert.ok(screen.getByText('73'))
  assert.ok(screen.getByText('100'))
  assert.equal(calls.length, 1)

  const refresh = screen.getByRole('button', { name: '刷新额度' })
  fireEvent.click(refresh)
  assert.equal(refresh.disabled, true)
  assert.equal(refresh.getAttribute('aria-busy'), 'true')
  assert.deepEqual(calls[1], {
    channel: '/dsh-provider-usage',
    endpoint: 'usage/read',
    payload: { force: true },
  })
  releaseRefresh()
  await waitFor(() => assert.equal(refresh.disabled, false))

  fireEvent.click(screen.getByRole('tab', { name: 'DeepSeek' }))
  assert.equal(document.querySelector('.dpu-body')?.dataset.tabDirection, 'back')
  assert.ok(screen.getByText('12.30'))
  fireEvent.click(screen.getByRole('button', { name: '收起额度面板' }))
  assert.equal(document.querySelector('[data-provider-usage]')?.dataset.expanded, 'false')
  assert.equal(stage?.dataset.open, 'false')
})

test('UsageDock anchors itself directly below the composer card on the hero new-conversation page', async () => {
  const composerRef = {}
  function HeroFixture() {
    return React.createElement('div', { 'data-phase': 'hero' },
      React.createElement('div', {
        'data-composer-card': '',
        ref(node) {
          composerRef.current = node
          if (node !== null) {
            node.getBoundingClientRect = () => ({
              x: 200, y: 300, left: 200, top: 300, right: 600, bottom: 420, width: 400, height: 120,
            })
          }
        },
      }),
      React.createElement(UsageDock, {
        rpc: { call: () => Promise.resolve({ ok: true, value: snapshot }) },
        t: zhT,
        locale: 'zh',
      }))
  }

  render(React.createElement(HeroFixture))

  await screen.findByText('CNY 12.30')
  const root = document.querySelector('[data-provider-usage]')
  assert.equal(root.style.position, 'fixed')
  assert.equal(root.style.left, '400px')
  assert.equal(root.style.top, '430px')
  assert.equal(root.style.width, '440px')
})

test('UsageDock schedules its refresh driver on a one-second interval', async () => {
  const originalSetInterval = globalThis.setInterval
  const originalClearInterval = globalThis.clearInterval
  const intervals = []
  globalThis.setInterval = (fn, ms) => {
    intervals.push(ms)
    return 1
  }
  globalThis.clearInterval = () => {}
  try {
    render(React.createElement(UsageDock, {
      rpc: { call: () => Promise.resolve({ ok: true, value: snapshot }) },
      t: zhT,
      locale: 'zh',
    }))
    await screen.findByText('CNY 12.30')
    assert.ok(intervals.includes(NOW_TICK_MS), `expected a ${NOW_TICK_MS}ms refresh driver, saw ${JSON.stringify(intervals)}`)
  } finally {
    globalThis.setInterval = originalSetInterval
    globalThis.clearInterval = originalClearInterval
  }
})

test('UsageDock preserves the last value when refresh fails', async () => {
  let calls = 0
  const rpc = {
    call() {
      calls += 1
      return calls === 1
        ? Promise.resolve({ ok: true, value: snapshot })
        : Promise.reject(new Error('raw failure'))
    },
  }
  render(React.createElement(UsageDock, { rpc, t: zhT, locale: 'zh' }))
  await screen.findByText('CNY 12.30')
  fireEvent.click(screen.getByRole('button', { name: '展开额度面板' }))

  fireEvent.click(screen.getByRole('button', { name: '刷新额度' }))

  await screen.findByText('显示上次成功数据')
  assert.ok(screen.getByText('12.30'))
  assert.equal(document.body.textContent.includes('raw failure'), false)
})

test('Client apply registers and disposes the hero-visible input dock entry', () => {
  const registrations = []
  const disposed = []
  const effects = []
  const ctx = {
    connection: { rpc: { call() {} } },
    locale: {
      getLocale() { return { active: 'zh' } },
      register(namespace, dictionaries) {
        registrations.push({ kind: 'locale', namespace, dictionaries })
        return () => disposed.push('locale')
      },
    },
    slots: {
      inject(slot, factory) {
        registrations.push({ kind: 'inject', slot })
        const dispose = factory()
        return () => {
          dispose?.()
          disposed.push('inject')
        }
      },
      register(options, component) {
        registrations.push({ kind: 'slot', options, component })
        return () => disposed.push('slot')
      },
    },
    effect(factory) {
      effects.push(factory())
    },
  }

  apply(ctx)

  assert.deepEqual(inject, ['slots', 'locale', 'connection'])
  const entry = registrations.find(item => item.kind === 'slot')
  assert.equal(registrations.find(item => item.kind === 'inject').slot, 'conversation.input.dock')
  assert.equal(entry.options.name, 'conversation.input.dock')
  assert.equal(entry.options.id, 'provider-usage')
  assert.equal(entry.options.order, 5)
  assert.equal(entry.component, UsageDock)
  assert.equal(document.head.querySelectorAll('[data-plugin="dsh-provider-usage"]').length, 1)

  effects.reverse().forEach(dispose => dispose?.())

  assert.equal(document.head.querySelectorAll('[data-plugin="dsh-provider-usage"]').length, 0)
  assert.deepEqual(disposed.sort(), ['inject', 'locale', 'slot'])
})
