import { createUsageService } from './usage-service.js'

export const name = 'provider-usage'
export const inject = ['credentials', 'connection']

export function createRpcHandler(service) {
  return async (endpoint, payload, signal) => {
    if (endpoint !== 'usage/read') {
      return {
        ok: false,
        error: { code: 'not-found', message: 'Unknown provider usage endpoint' },
      }
    }
    try {
      const value = await service.read({ force: payload?.force === true, signal })
      return { ok: true, value }
    } catch {
      return {
        ok: false,
        error: { code: 'internal', message: 'Usage is temporarily unavailable' },
      }
    }
  }
}

export function apply(ctx) {
  const service = createUsageService({ credentials: ctx.credentials })
  const handler = createRpcHandler(service)
  ctx.effect(
    () => ctx.connection.rpc.handle('/dsh-provider-usage', handler, { authority: 'loopback' }),
    'provider-usage: loopback usage RPC',
  )
}
