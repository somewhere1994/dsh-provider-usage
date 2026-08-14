export const AUTO_REFRESH_MS = 60_000
export const NOW_TICK_MS = 1_000

export const COPY = {
  zh: {
    deepseek: 'DeepSeek',
    kimi: 'Kimi Code',
    tabsLabel: '额度面板切换',
    loading: '正在查询额度…',
    'credential-missing': '未配置 API Key',
    auth: 'API Key 无效',
    'rate-limited': '查询被限流',
    timeout: '查询超时',
    malformed: '接口数据异常',
    unavailable: '暂时无法获取',
    'not-found': '接口不存在',
    internal: '服务暂时不可用',
    balanceAvailable: '余额可用',
    balanceUnavailable: '余额不足',
    balanceLabel: '可用余额',
    grantedLabel: '赠送',
    toppedUpLabel: '充值',
    weekly7d: '7 天额度',
    rolling5h: '5 小时滚动额度',
    quotaUnavailable: '当前账户未返回该窗口额度',
    usedLabel: '已用',
    remainingLabel: '剩余',
    resetsAt: '{value} 重置',
    refreshedAt: '{value} 刷新',
    nextRefreshIn: '{seconds} 秒后自动刷新',
    autoRefresh: '每 60 秒自动刷新',
    expand: '展开额度面板',
    collapse: '收起额度面板',
    refresh: '刷新额度',
    refreshing: '正在刷新额度',
    stale: '显示上次成功数据',
    switchTo: '切换到 {provider}',
    quotaAria: '{label}：剩余 {remaining}，总额 {limit}',
    balanceAria: '{provider} 余额：{currency} {total}',
  },
  en: {
    deepseek: 'DeepSeek',
    kimi: 'Kimi Code',
    tabsLabel: 'Usage panel tabs',
    loading: 'Loading usage…',
    'credential-missing': 'API key missing',
    auth: 'API key rejected',
    'rate-limited': 'Rate limited',
    timeout: 'Request timed out',
    malformed: 'Invalid provider data',
    unavailable: 'Temporarily unavailable',
    'not-found': 'Endpoint not found',
    internal: 'Service unavailable',
    balanceAvailable: 'Balance available',
    balanceUnavailable: 'Balance unavailable',
    balanceLabel: 'Available balance',
    grantedLabel: 'Granted',
    toppedUpLabel: 'Topped up',
    weekly7d: '7-day allowance',
    rolling5h: '5-hour rolling allowance',
    quotaUnavailable: 'No allowance window returned for this account',
    usedLabel: 'Used',
    remainingLabel: 'Remaining',
    resetsAt: 'Resets {value}',
    refreshedAt: 'Refreshed {value}',
    nextRefreshIn: 'Auto refresh in {seconds}s',
    autoRefresh: 'Auto refresh every 60s',
    expand: 'Expand usage panel',
    collapse: 'Collapse usage panel',
    refresh: 'Refresh usage',
    refreshing: 'Refreshing usage',
    stale: 'Showing last successful data',
    switchTo: 'Switch to {provider}',
    quotaAria: '{label}: {remaining} remaining of {limit}',
    balanceAria: '{provider} balance: {currency} {total}',
  },
}

function languageOf(locale) {
  return typeof locale === 'string' && locale.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

function translateFor(localeOrTranslate) {
  if (typeof localeOrTranslate === 'function') {
    return { locale: undefined, t: localeOrTranslate }
  }
  const copy = COPY[languageOf(localeOrTranslate)]
  return {
    locale: localeOrTranslate,
    t: (key, params = {}) => {
      const template = copy[key] ?? COPY.en[key] ?? key
      return template.replace(/\{(\w+)\}/gu, (_, name) => String(params[name] ?? ''))
    },
  }
}

export function formatDecimal(value) {
  if (typeof value !== 'string') return String(value ?? '--')
  const trimmed = value.trim()
  return trimmed === '' ? '--' : trimmed
}

export function remainingPercent({ remaining, limit }) {
  const denominator = Number(limit)
  const numerator = Number(remaining)
  if (!Number.isFinite(denominator) || denominator <= 0 || !Number.isFinite(numerator)) return 0
  return Math.min(100, Math.max(0, Math.round((numerator / denominator) * 100)))
}

function mergeProvider(previous, incoming, fetchedAt) {
  if (incoming?.ok === true) return { ...incoming, lastSuccessAt: fetchedAt }
  if (previous?.ok === true) {
    return { ...previous, staleError: incoming?.error ?? { code: 'unavailable' } }
  }
  return incoming
}

export function mergeSnapshot(previous, incoming) {
  return {
    fetchedAt: incoming.fetchedAt,
    deepseek: mergeProvider(previous?.deepseek, incoming.deepseek, incoming.fetchedAt),
    kimi: mergeProvider(previous?.kimi, incoming.kimi, incoming.fetchedAt),
  }
}

export function nextProvider(current) {
  return current === 'deepseek' ? 'kimi' : 'deepseek'
}

function quotaView(usage, label) {
  if (usage === undefined || usage === null) {
    return { available: false, label }
  }
  return {
    available: true,
    label,
    limit: usage.limit,
    remaining: usage.remaining,
    used: usage.used,
    percent: remainingPercent(usage),
    resetTime: usage.resetTime,
  }
}

export function displayFor(provider, snapshot, localeOrTranslate) {
  const { locale, t } = translateFor(localeOrTranslate)
  const providerLabel = t(provider)
  const result = snapshot?.[provider]
  if (result === undefined) {
    return { providerLabel, headline: t('loading'), detail: '', state: 'loading' }
  }
  if (result.ok !== true) {
    const code = result.error?.code
    const known = typeof code === 'string' && Object.hasOwn(COPY.en, code)
    return {
      providerLabel,
      headline: t(known ? code : 'unavailable'),
      detail: '',
      state: 'error',
      error: { code: known ? code : 'unavailable' },
    }
  }
  if (provider === 'deepseek') {
    const balance = result.value.balances[0]
    if (balance === undefined) {
      return { providerLabel, headline: t('unavailable'), detail: '', state: 'error', error: { code: 'malformed' } }
    }
    const available = result.value.available === true
    return {
      providerLabel,
      headline: `${balance.currency} ${formatDecimal(balance.total, locale)}`,
      detail: available ? t('balanceAvailable') : t('balanceUnavailable'),
      state: 'ready',
      ...result.staleError === undefined ? {} : { stale: true },
      balance: {
        currency: balance.currency,
        total: balance.total,
        granted: balance.granted,
        toppedUp: balance.toppedUp,
        available,
      },
    }
  }
  const usage = result.value.usage
  const weekly = result.value.weekly7d ?? usage
  const rolling5h = result.value.rolling5h
  return {
    providerLabel,
    headline: `${formatDecimal(weekly.remaining, locale)} / ${formatDecimal(weekly.limit, locale)}`,
    detail: '',
    state: 'ready',
    ...result.staleError === undefined ? {} : { stale: true },
    quotas: [
      { id: 'weekly7d', ...quotaView(weekly, t('weekly7d')) },
      { id: 'rolling5h', ...quotaView(rolling5h, t('rolling5h')) },
    ],
  }
}
