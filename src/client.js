import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  AUTO_REFRESH_MS,
  COPY,
  NOW_TICK_MS,
  displayFor,
  formatDecimal,
  mergeSnapshot,
} from './client-model.js'

export {
  AUTO_REFRESH_MS,
  COPY,
  NOW_TICK_MS,
  displayFor,
  formatDecimal,
  mergeSnapshot,
  nextProvider,
  remainingPercent,
} from './client-model.js'

const NS = 'providerUsage'
const CHANNEL = '/dsh-provider-usage'

const STYLE = `
#dsh-provider-usage-style{display:none}
.dpu-card{
  --dpu-accent:#4d84ff;--dpu-accent-2:#b7c8fe;--dpu-accent-soft:rgba(77,132,255,.10);
  position:relative;display:flex;flex-direction:column;align-self:center;box-sizing:border-box;
  width:100%;max-width:440px;margin:0 auto;
  padding:8px 11px 8px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;
  background:var(--dsw-specific-tip,var(--dsw-alias-bg-layer-1));
  color:var(--dsw-alias-label-primary);
  box-shadow:0 6px 20px rgba(15,17,21,.06),inset 0 1px 0 var(--dsw-alias-border-l1);
  overflow:hidden;transition:box-shadow .18s ease,border-color .18s ease,padding .28s cubic-bezier(.2,.8,.2,1);
}
.dpu-card[data-expanded="true"]{padding:10px 11px 9px 14px}
.dpu-card[data-provider="deepseek"]{--dpu-accent:var(--dsw-static-deepseek-450,#4d84ff);--dpu-accent-2:var(--dsw-static-deepseek-300,#b7c8fe);--dpu-accent-soft:rgba(77,132,255,.12)}
.dpu-card[data-provider="kimi"]{--dpu-accent:#8b5cf6;--dpu-accent-2:#a78bfa;--dpu-accent-soft:rgba(139,92,246,.12)}
body[data-ds-dark-theme] .dpu-card{box-shadow:0 10px 28px rgba(0,0,0,.32),inset 0 1px 0 var(--dsw-alias-border-l1)}
[data-phase="hero"] .dpu-card{
  position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:60;
  width:min(440px,calc(100vw - 24px));max-height:calc(100vh - 32px);
  overflow-x:hidden;overflow-y:auto;
}
[data-phase="hero"] .dpu-card[data-expanded="true"]{box-shadow:0 18px 44px rgba(15,17,21,.18)}
[data-phase="active"] .dpu-card{order:99;margin-bottom:4px}
.dpu-card:hover{border-color:var(--dsw-alias-border-l3);box-shadow:0 10px 28px rgba(15,17,21,.09),inset 0 1px 0 var(--dsw-alias-border-l1)}
body[data-ds-dark-theme] .dpu-card:hover{box-shadow:0 14px 36px rgba(0,0,0,.38),inset 0 1px 0 var(--dsw-alias-border-l1)}
.dpu-card[data-expanded="true"] .dpu-head{animation:dpu-rise .22s cubic-bezier(.2,.8,.2,1)}
.dpu-card[data-expanded="true"] .dpu-foot{animation:dpu-rise .32s cubic-bezier(.2,.8,.2,1)}
.dpu-card[data-expanded="true"] .dpu-body[data-tab-direction="forward"]{animation:dpu-tab-forward .26s cubic-bezier(.2,.8,.2,1)}
.dpu-card[data-expanded="true"] .dpu-body[data-tab-direction="back"]{animation:dpu-tab-back .26s cubic-bezier(.2,.8,.2,1)}
@keyframes dpu-rise{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}
@keyframes dpu-tab-forward{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:translateX(0)}}
@keyframes dpu-tab-back{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:translateX(0)}}
.dpu-expand{display:grid;grid-template-rows:0fr;opacity:0;transform:translateY(-6px);visibility:hidden;pointer-events:none;transition:grid-template-rows .32s cubic-bezier(.2,.8,.2,1),opacity .22s ease,transform .32s cubic-bezier(.2,.8,.2,1),visibility 0s linear .32s}
.dpu-expand[data-open="true"]{grid-template-rows:1fr;opacity:1;transform:translateY(0);visibility:visible;pointer-events:auto;transition-delay:0s}
.dpu-expand-inner{min-height:0;overflow:hidden}
.dpu-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(180deg,var(--dpu-accent),transparent);opacity:.9}
.dpu-card[data-expanded="true"]::before{opacity:1}
.dpu-collapsed{display:flex;align-items:center;gap:8px;min-width:0;width:100%;max-height:40px;padding:2px 4px;border:0;border-radius:9px;background:transparent;color:inherit;text-align:left;font:inherit;cursor:pointer;opacity:1;overflow:hidden;transition:background .18s ease,transform .18s cubic-bezier(.2,.8,.2,1),max-height .3s cubic-bezier(.2,.8,.2,1),opacity .22s ease,padding .3s cubic-bezier(.2,.8,.2,1)}
.dpu-card[data-expanded="true"] .dpu-collapsed{max-height:0;padding-top:0;padding-bottom:0;opacity:0;pointer-events:none}
.dpu-collapsed:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dpu-collapsed:active{transform:scale(.985)}
.dpu-collapsed:hover .dpu-collapsed-provider{color:var(--dsw-alias-label-primary)}
.dpu-collapsed:hover .dpu-chevron{transform:translateY(1px);color:var(--dsw-alias-label-primary)}
.dpu-collapsed-provider{flex:none;font-size:11px;font-weight:700;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.dpu-collapsed-headline{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:600 13px/18px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
.dpu-collapsed-count{margin-left:auto;flex:none;font-size:10px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-caption)}
.dpu-chevron{flex:none;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:5px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1;transition:transform .18s ease}
.dpu-card[data-expanded="true"] .dpu-chevron{transform:rotate(180deg)}
.dpu-head{display:flex;align-items:center;gap:6px}
.dpu-card[data-expanded="true"] .dpu-head{margin-bottom:8px}
.dpu-tabs{display:flex;flex:1;min-width:0;gap:2px;padding:2px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-module-platform)}
.dpu-tab{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;height:26px;padding:0 8px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;font-weight:600;line-height:1;cursor:pointer;white-space:nowrap;transition:background .18s cubic-bezier(.2,.8,.2,1),color .18s ease,box-shadow .18s ease,transform .18s cubic-bezier(.2,.8,.2,1)}
.dpu-tab:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.dpu-tab:hover .dpu-dot{transform:scale(1.18)}
.dpu-tab:active{transform:scale(.96)}
.dpu-tab[aria-selected="true"]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 1px 4px rgba(15,17,21,.12),inset 0 0 0 1px var(--dsw-alias-border-l2)}
.dpu-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-dimmed);box-shadow:0 0 0 2px transparent;transition:background .18s ease,box-shadow .18s ease,transform .18s cubic-bezier(.2,.8,.2,1)}
.dpu-dot.ready{background:var(--dsw-alias-state-success-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-success-primary) 18%,transparent)}
.dpu-dot.warn{background:var(--dsw-alias-state-warn-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-warn-primary) 18%,transparent)}
.dpu-dot.error{background:var(--dsw-alias-state-error-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-error-primary) 18%,transparent)}
.dpu-tab[data-provider="deepseek"] .dpu-dot.ready{background:var(--dsw-static-deepseek-450,#4d84ff)}
.dpu-tab[data-provider="kimi"] .dpu-dot.ready{background:#8b5cf6}
.dpu-refresh{flex:none;display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 9px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:11px;font-weight:600;line-height:1;cursor:pointer;transition:border-color .18s ease,color .18s ease,background .18s ease,box-shadow .18s ease,transform .18s cubic-bezier(.2,.8,.2,1)}
.dpu-refresh:hover:not(:disabled){border-color:var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-module-platform);box-shadow:0 4px 12px rgba(15,17,21,.08);transform:translateY(-1px)}
.dpu-refresh:active:not(:disabled){transform:translateY(0) scale(.94);box-shadow:none}
.dpu-refresh:disabled{cursor:default;opacity:.62}
.dpu-refresh-icon{display:inline-block;font-size:15px;line-height:1;transform-origin:50% 50%;transition:transform .28s cubic-bezier(.2,.8,.2,1)}
.dpu-refresh:hover:not(:disabled) .dpu-refresh-icon{transform:rotate(180deg)}
.dpu-refresh[aria-busy="true"] .dpu-refresh-icon{animation:dpu-spin .8s linear infinite}
.dpu-collapse{flex:none;display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);cursor:pointer;transition:border-color .18s ease,color .18s ease,background .18s ease,box-shadow .18s ease,transform .18s cubic-bezier(.2,.8,.2,1)}
.dpu-collapse:hover{border-color:var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-module-platform);box-shadow:0 4px 12px rgba(15,17,21,.08);transform:translateY(-1px)}
.dpu-collapse:active{transform:translateY(0) scale(.9);box-shadow:none}
.dpu-collapsed:focus-visible,.dpu-tab:focus-visible,.dpu-refresh:focus-visible,.dpu-collapse:focus-visible{outline:2px solid var(--dpu-accent,#4d84ff);outline-offset:2px}
@keyframes dpu-spin{to{transform:rotate(360deg)}}
.dpu-body{min-height:38px}
.dpu-skeleton{display:flex;flex-direction:column;gap:8px;padding:6px 2px 4px}
.dpu-skeleton-line{height:11px;border-radius:7px;background:linear-gradient(90deg,var(--dsw-alias-bg-skeleton),var(--dsw-alias-bg-module-platform),var(--dsw-alias-bg-skeleton));background-size:200% 100%;animation:dpu-shimmer 1.4s ease-in-out infinite}
.dpu-skeleton-line.dpu-skeleton-lg{width:52%;height:20px;border-radius:9px}
@keyframes dpu-shimmer{to{background-position:-200% 0}}
.dpu-error{display:flex;align-items:center;gap:9px;min-height:38px;padding:7px 9px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 28%,transparent);border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 7%,transparent)}
.dpu-error-code{font-size:12px;font-weight:650;color:var(--dsw-alias-label-primary)}
.dpu-error-hint{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dpu-ds{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:4px 2px 2px}
.dpu-ds-main{display:flex;align-items:baseline;gap:7px;min-width:0}
.dpu-ds-currency{font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--dsw-alias-label-tertiary);text-transform:uppercase}
.dpu-ds-total{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:22px;font-weight:760;line-height:26px;letter-spacing:-.02em;font-variant-numeric:tabular-nums;white-space:nowrap;background:linear-gradient(100deg,var(--dpu-accent),var(--dpu-accent-2));-webkit-background-clip:text;background-clip:text;color:transparent}
.dpu-ds-meta{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:5px}
.dpu-pill{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 7px;border-radius:999px;font-size:10px;font-weight:650;line-height:1}
.dpu-pill.ok{color:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-state-success-tertiary)}
.dpu-pill.bad{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)}
.dpu-chip{display:inline-flex;align-items:center;height:20px;padding:0 7px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;color:var(--dsw-alias-label-tertiary);font-size:10px;font-weight:550;line-height:1;white-space:nowrap}
.dpu-kimi{display:flex;flex-direction:column;gap:8px;padding-top:2px}
.dpu-quota{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:5px 10px;padding:8px 9px 7px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);--quota-a:#8b5cf6;--quota-b:#a78bfa;transition:border-color .18s ease,transform .18s cubic-bezier(.2,.8,.2,1),box-shadow .18s ease}
.dpu-quota:hover{border-color:var(--dsw-alias-border-l2);box-shadow:0 4px 14px rgba(15,17,21,.06);transform:translateY(-1px)}
.dpu-quota[data-quota="rolling5h"]{--quota-a:#0ea5e9;--quota-b:#38bdf8}
.dpu-quota-label{display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.dpu-quota-label::before{content:"";flex:none;width:7px;height:7px;border-radius:2.5px;background:linear-gradient(135deg,var(--quota-a),var(--quota-b))}
.dpu-quota-value{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);white-space:nowrap}
.dpu-quota-limit{color:var(--dsw-alias-label-tertiary);font-weight:600}
.dpu-meter{grid-column:1/-1;height:5px;border-radius:999px;background:var(--dsw-alias-bg-skeleton);overflow:hidden}
.dpu-meter-fill{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--quota-a),var(--quota-b));transition:width .45s ease}
.dpu-meter-fill.tone-warn{background:linear-gradient(90deg,#f59e0b,#fbbf24)}
.dpu-meter-fill.tone-danger{background:linear-gradient(90deg,#ef4444,#f87171)}
.dpu-quota-meta{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;font-size:10px;color:var(--dsw-alias-label-tertiary)}
.dpu-quota-meta-left,.dpu-quota-meta-right{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dpu-quota-empty{display:flex;align-items:center;gap:7px;min-height:30px;padding:7px 9px;border:1px dashed var(--dsw-alias-border-l3);border-radius:10px;color:var(--dsw-alias-label-tertiary);font-size:11px}
.dpu-foot{display:flex;align-items:center;gap:8px;min-width:0;margin-top:8px;padding-top:7px;border-top:1px solid var(--dsw-alias-border-l1);font-size:10px;line-height:14px;color:var(--dsw-alias-label-tertiary)}
.dpu-foot-left{display:flex;align-items:center;gap:5px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dpu-countdown{margin-left:auto;flex:none;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-caption)}
.dpu-stale{flex:none;font-weight:700;color:var(--dsw-alias-state-warn-label)}
@media(max-width:640px){
  .dpu-refresh-label{display:none}
  .dpu-refresh{padding:0 8px}
  .dpu-collapsed-count{display:none}
  .dpu-ds-meta .dpu-chip{display:none}
}
@media(prefers-reduced-motion:reduce){
  .dpu-refresh[aria-busy="true"] .dpu-refresh-icon,.dpu-skeleton-line,
  .dpu-card[data-expanded="true"] .dpu-head,
  .dpu-card[data-expanded="true"] .dpu-body,
  .dpu-card[data-expanded="true"] .dpu-foot{animation:none}
  .dpu-card,.dpu-collapsed,.dpu-expand,.dpu-chevron,.dpu-tab,.dpu-dot,.dpu-refresh,.dpu-refresh-icon,.dpu-collapse,.dpu-quota,.dpu-meter-fill{transition:none}
  .dpu-refresh:hover:not(:disabled),.dpu-collapse:hover,.dpu-quota:hover{transform:none}
}
`

function healthOf(provider, snapshot) {
  const result = snapshot?.[provider]
  if (result === undefined) return 'idle'
  if (result.ok !== true) return 'error'
  if (result.staleError !== undefined) return 'warn'
  return 'ready'
}

function failedSnapshotFor(provider) {
  return { [provider]: { ok: false, error: { code: 'unavailable' } } }
}

function clearHeroAnchor(root) {
  if (root === null) return
  root.style.position = ''
  root.style.left = ''
  root.style.top = ''
  root.style.bottom = ''
  root.style.transform = ''
  root.style.width = ''
  root.style.maxHeight = ''
}

function anchorHeroCard(root) {
  if (typeof document === 'undefined' || root === null) return
  const phaseRoot = root.closest('[data-phase]')
  const composerCard = document.querySelector('[data-composer-card]')
  if (phaseRoot?.getAttribute('data-phase') !== 'hero' || composerCard === null) {
    clearHeroAnchor(root)
    return
  }
  const rect = composerCard.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth || 0
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight || 0
  const width = Math.min(440, Math.max(280, viewportWidth - 24))
  const top = rect.bottom + 10
  const maxHeight = Math.min(480, Math.max(96, viewportHeight - top - 16))
  root.style.position = 'fixed'
  root.style.left = `${rect.left + rect.width / 2}px`
  root.style.top = `${top}px`
  root.style.bottom = 'auto'
  root.style.transform = 'translateX(-50%)'
  root.style.width = `${width}px`
  root.style.maxHeight = `${maxHeight}px`
}

function safeDate(value) {
  if (value === undefined || value === null || value === '') return undefined
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : undefined
}

function formatClock(value, locale) {
  const date = safeDate(value)
  if (date === undefined) return '--:--:--'
  try {
    return new Intl.DateTimeFormat(locale || undefined, {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(date)
  } catch {
    return date.toLocaleTimeString()
  }
}

function formatReset(value, locale) {
  const date = safeDate(value)
  if (date === undefined) return '--'
  try {
    return new Intl.DateTimeFormat(locale || undefined, {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date)
  } catch {
    return date.toLocaleString()
  }
}

function toneFor(percent) {
  if (percent <= 10) return 'tone-danger'
  if (percent <= 25) return 'tone-warn'
  return ''
}

function createTab(tab, provider, selected, select) {
  const health = healthOf(tab.id, tab.snapshot)
  return React.createElement('button', {
    key: tab.id,
    type: 'button',
    role: 'tab',
    'aria-selected': selected,
    'data-provider': tab.id,
    'data-provider-tab': '',
    className: 'dpu-tab',
    onClick: select,
  },
  React.createElement('span', { className: `dpu-dot ${health}` }),
  React.createElement('span', { className: 'dpu-tab-label' }, tab.label))
}

function LoadingBody() {
  return React.createElement('div', {
    className: 'dpu-skeleton',
    'aria-hidden': 'true',
  },
  React.createElement('span', { className: 'dpu-skeleton-line dpu-skeleton-lg' }),
  React.createElement('span', { className: 'dpu-skeleton-line' }))
}

function ErrorBody({ display }) {
  return React.createElement('div', {
    className: 'dpu-error',
    role: 'status',
  },
  React.createElement('span', { className: 'dpu-dot error' }),
  React.createElement('div', { className: 'dpu-error-stack' },
    React.createElement('div', { className: 'dpu-error-code' }, display.headline),
    display.detail === '' ? null : React.createElement('div', { className: 'dpu-error-hint' }, display.detail)))
}

function DeepSeekBody({ display, locale }) {
  const balance = display.balance
  return React.createElement('div', { className: 'dpu-ds' },
    React.createElement('div', {
      className: 'dpu-ds-main',
      'aria-label': `DeepSeek ${balance.currency} ${formatDecimal(balance.total, locale)}`,
    },
    React.createElement('span', { className: 'dpu-ds-currency' }, balance.currency),
    React.createElement('strong', { className: 'dpu-ds-total' }, formatDecimal(balance.total, locale))),
    React.createElement('div', { className: 'dpu-ds-meta' },
      React.createElement('span', {
        className: `dpu-pill ${balance.available ? 'ok' : 'bad'}`,
      }, balance.available ? display.detail : display.detail),
      React.createElement('span', {
        className: 'dpu-chip',
        title: balance.granted,
      }, `+ ${formatDecimal(balance.granted, locale)}`),
      React.createElement('span', {
        className: 'dpu-chip',
        title: balance.toppedUp,
      }, `${formatDecimal(balance.toppedUp, locale)}`)))
}

function QuotaRow({ quota, locale, t }) {
  const percent = quota.percent
  const used = quota.used === undefined ? undefined : formatDecimal(quota.used, locale)
  return React.createElement('div', {
    className: 'dpu-quota',
    'data-quota': quota.id,
  },
  React.createElement('span', { className: 'dpu-quota-label' }, quota.label),
  React.createElement('span', {
    className: 'dpu-quota-value',
  },
  React.createElement('strong', null, formatDecimal(quota.remaining, locale)),
  React.createElement('span', { className: 'dpu-quota-limit' }, ` / ${formatDecimal(quota.limit, locale)}`)),
  React.createElement('div', {
    className: 'dpu-meter',
    role: 'progressbar',
    'aria-label': t('quotaAria', {
      label: quota.label,
      remaining: formatDecimal(quota.remaining, locale),
      limit: formatDecimal(quota.limit, locale),
    }),
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    'aria-valuenow': String(percent),
  },
  React.createElement('span', {
    className: `dpu-meter-fill ${toneFor(percent)}`,
    style: { width: `${percent}%` },
  })),
  React.createElement('div', { className: 'dpu-quota-meta' },
    React.createElement('span', { className: 'dpu-quota-meta-left' },
      `${t('usedLabel')} ${used ?? '--'}`),
    React.createElement('span', { className: 'dpu-quota-meta-right' },
      t('resetsAt', { value: formatReset(quota.resetTime, locale) }))))
}

function KimiBody({ display, locale, t }) {
  return React.createElement('div', { className: 'dpu-kimi' },
    display.quotas.map(quota => quota.available
      ? React.createElement(QuotaRow, { key: quota.id, quota, locale, t })
      : React.createElement('div', {
        key: quota.id,
        className: 'dpu-quota-empty',
        'data-quota-empty': quota.id,
      },
      React.createElement('span', { className: 'dpu-dot idle' }),
      React.createElement('span', null, quota.label),
      React.createElement('span', { className: 'dpu-quota-empty-hint' }, t('quotaUnavailable')))))
}

export function UsageDock({ rpc, t, locale = 'zh' }) {
  const [provider, setProvider] = useState('deepseek')
  const [expanded, setExpanded] = useState(false)
  const [snapshot, setSnapshot] = useState()
  const [busy, setBusy] = useState(true)
  const [failed, setFailed] = useState(false)
  const [stale, setStale] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const request = useRef(0)
  const busyRef = useRef(false)
  const snapshotRef = useRef()
  const nextDueAt = useRef(0)
  const rpcRef = useRef(rpc)
  const rootRef = useRef(null)
  rpcRef.current = rpc

  const load = (force) => {
    if (busyRef.current) return Promise.resolve()
    const id = ++request.current
    busyRef.current = true
    setBusy(true)
    setFailed(false)
    return Promise.resolve(rpcRef.current.call(CHANNEL, 'usage/read', { force }))
      .then((response) => {
        if (response?.ok !== true) throw new Error('Provider usage RPC failed')
        if (request.current !== id) return
        const merged = mergeSnapshot(snapshotRef.current, response.value)
        snapshotRef.current = merged
        setSnapshot(merged)
        setStale(false)
      })
      .catch(() => {
        if (request.current !== id) return
        setFailed(true)
        setStale(snapshotRef.current !== undefined)
      })
      .finally(() => {
        if (request.current !== id) return
        busyRef.current = false
        setBusy(false)
        nextDueAt.current = Date.now() + AUTO_REFRESH_MS
        setNow(Date.now())
      })
  }

  useEffect(() => {
    nextDueAt.current = Date.now() + AUTO_REFRESH_MS
    void load(false)
    const timer = setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (!busyRef.current && nextDueAt.current !== 0 && current >= nextDueAt.current) {
        void load(false)
      }
    }, NOW_TICK_MS)
    return () => {
      request.current += 1
      busyRef.current = false
      clearInterval(timer)
    }
  }, [])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (typeof document === 'undefined' || root === null) return undefined
    const update = () => { anchorHeroCard(root) }
    update()
    window.addEventListener('resize', update)
    const composerCard = document.querySelector('[data-composer-card]')
    let resizeObserver
    if (typeof ResizeObserver !== 'undefined' && composerCard !== null) {
      resizeObserver = new ResizeObserver(update)
      resizeObserver.observe(composerCard)
    }
    const phaseRoot = root.closest('[data-phase]')
    let mutationObserver
    if (typeof MutationObserver !== 'undefined' && phaseRoot !== null) {
      mutationObserver = new MutationObserver(update)
      mutationObserver.observe(phaseRoot, { attributes: true, attributeFilter: ['data-phase'] })
    }
    return () => {
      window.removeEventListener('resize', update)
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      clearHeroAnchor(root)
    }
  }, [])

  const visibleSnapshot = snapshot ?? (failed ? failedSnapshotFor(provider) : undefined)
  const display = displayFor(provider, visibleSnapshot, t)
  const dateLocale = String(locale ?? '').toLowerCase().startsWith('zh') ? 'zh-CN' : undefined
  const health = healthOf(provider, snapshot)
  const statusHealth = stale ? 'warn' : health
  const countdown = Math.max(0, Math.ceil((nextDueAt.current - now) / 1000))
  const tabs = [
    { id: 'deepseek', label: t('deepseek'), snapshot },
    { id: 'kimi', label: t('kimi'), snapshot },
  ]

  const collapsedRow = React.createElement('button', {
    type: 'button',
    className: 'dpu-collapsed',
    'aria-label': t('expand'),
    'aria-expanded': 'false',
    'aria-hidden': expanded ? 'true' : 'false',
    tabIndex: expanded ? -1 : 0,
    title: t('autoRefresh'),
    onClick: () => { setExpanded(true) },
  },
  React.createElement('span', { className: `dpu-dot ${statusHealth}` }),
  React.createElement('span', { className: 'dpu-collapsed-provider' }, display.providerLabel),
  React.createElement('strong', { className: 'dpu-collapsed-headline' }, display.headline),
  React.createElement('span', {
    className: 'dpu-collapsed-count',
    title: t('autoRefresh'),
  }, t('nextRefreshIn', { seconds: countdown })),
  React.createElement('span', {
    className: 'dpu-chevron',
    'aria-hidden': 'true',
  }, '▾'))

  const expandedPanel = React.createElement(React.Fragment, null,
    React.createElement('div', { className: 'dpu-head' },
      React.createElement('div', {
        className: 'dpu-tabs',
        role: 'tablist',
        'aria-label': t('tabsLabel'),
      },
      tabs.map(tab => createTab(tab, provider, provider === tab.id, () => setProvider(tab.id)))),
      React.createElement('button', {
        type: 'button',
        className: 'dpu-refresh',
        'aria-label': t('refresh'),
        title: busy ? t('refreshing') : t('refresh'),
        'aria-busy': busy,
        disabled: busy,
        onClick: () => { void load(true) },
      },
      React.createElement('span', {
        className: 'dpu-refresh-icon',
        'aria-hidden': 'true',
      }, '↻'),
      React.createElement('span', { className: 'dpu-refresh-label' }, t('refresh'))),
      React.createElement('button', {
        type: 'button',
        className: 'dpu-collapse',
        'aria-label': t('collapse'),
        title: t('collapse'),
        'aria-expanded': 'true',
        onClick: () => { setExpanded(false) },
      },
      React.createElement('span', {
        className: 'dpu-chevron',
        'aria-hidden': 'true',
      }, '▾'))),
    React.createElement('div', {
      key: provider,
      className: 'dpu-body',
      'data-tab-direction': provider === 'kimi' ? 'forward' : 'back',
    },
      display.state === 'loading'
        ? React.createElement(LoadingBody)
        : display.state === 'error'
          ? React.createElement(ErrorBody, { display })
          : provider === 'deepseek'
            ? React.createElement(DeepSeekBody, { display, locale: dateLocale })
            : React.createElement(KimiBody, { display, locale: dateLocale, t })),
    React.createElement('div', { className: 'dpu-foot' },
      React.createElement('span', { className: 'dpu-foot-left' },
        React.createElement('span', { className: `dpu-dot ${statusHealth}` }),
        busy
          ? React.createElement('span', null, t('refreshing'))
          : snapshot?.fetchedAt === undefined
            ? React.createElement('span', null, t('loading'))
            : React.createElement('span', null, t('refreshedAt', { value: formatClock(snapshot.fetchedAt, dateLocale) }))),
      React.createElement('span', {
        className: 'dpu-countdown',
        title: t('autoRefresh'),
      }, t('nextRefreshIn', { seconds: countdown })),
      stale ? React.createElement('span', { className: 'dpu-stale' }, t('stale')) : null))

  const expandStage = React.createElement('div', {
    className: 'dpu-expand',
    'data-open': expanded ? 'true' : 'false',
    'aria-hidden': expanded ? 'false' : 'true',
  },
  React.createElement('div', { className: 'dpu-expand-inner' }, expandedPanel))

  return React.createElement('div', {
    ref: rootRef,
    className: 'dpu-card',
    'data-provider-usage': '',
    'data-provider': provider,
    'data-state': display.state,
    'data-expanded': expanded ? 'true' : 'false',
    'data-stale': stale || display.stale === true ? 'true' : 'false',
  }, collapsedRow, expandStage)
}

export const inject = ['slots', 'locale', 'connection']

export function apply(ctx) {
  ctx.effect(
    () => ctx.locale.register(NS, { zh: COPY.zh, en: COPY.en }),
    'provider-usage: locale',
  )
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.id = 'dsh-provider-usage-style'
    tag.dataset.plugin = 'dsh-provider-usage'
    tag.textContent = STYLE
    document.head.append(tag)
    return () => tag.remove()
  }, 'provider-usage: styles')
  ctx.effect(
    () => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
      name: 'conversation.input.dock',
      id: 'provider-usage',
      order: 5,
      locale: NS,
      inject: () => ({
        rpc: ctx.connection.rpc,
        locale: ctx.locale.getLocale?.().active ?? 'zh',
      }),
    }, UsageDock)),
    'provider-usage: input dock',
  )
}
