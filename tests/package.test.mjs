import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import vm from 'node:vm'

const root = new URL('../', import.meta.url)

async function json(path) {
  return JSON.parse(await readFile(new URL(path, root), 'utf8'))
}

test('package exposes a host plugin, browser client, and Cordis bundle patch', async () => {
  const manifest = await json('package.json')

  assert.equal(manifest.main, './lib/index.js')
  assert.equal(manifest.exports['.'], './lib/index.js')
  assert.equal(manifest.exports['./client'], './lib/client.js')
  assert.equal(manifest.exports['./cordis.patch.yml'], './cordis.patch.yml')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.deepEqual(manifest.dsh.client.inject, [
    '@deepseek-ai/dsh-client-connection',
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-ui-conversation',
  ])
})

test('Harness peer ranges accept the installed rc.5 host and the published rc.6 line', async () => {
  const manifest = await json('package.json')
  const harnessPeers = Object.entries(manifest.peerDependencies)
    .filter(([name]) => name.startsWith('@deepseek-ai/dsh-'))

  assert.ok(harnessPeers.length > 0)
  for (const [name, range] of harnessPeers) {
    assert.equal(range, '^0.1.0-rc.5', `${name} should remain compatible across the 0.1 RC line`)
  }
})

test('Cordis patch inserts provider-usage exactly once', async () => {
  const patch = await readFile(new URL('cordis.patch.yml', root), 'utf8')
  assert.match(patch, /^- insert:\n {4}- id: provider-usage\n {6}name: dsh-provider-usage\n$/)
  assert.equal(patch.match(/id: provider-usage/g)?.length, 1)
})

test('built host module has the expected Cordis surface', async () => {
  const host = await import(new URL(`lib/index.js?test=${Date.now()}`, root))
  assert.equal(host.name, 'provider-usage')
  assert.deepEqual(host.inject, ['credentials', 'connection'])
  assert.equal(typeof host.apply, 'function')
})

test('built browser artifact ships the hero floating rule and active bottom-dock order', async () => {
  const source = await readFile(new URL('lib/client.js', root), 'utf8')
  assert.match(source, /\[data-phase="hero"\]\s*\.dpu-card\{[^}]*position:fixed/)
  assert.match(source, /\[data-phase="active"\]\s*\.dpu-card\{[^}]*order:99/)
  assert.match(source, /max-height:calc\(100vh - 32px\)/)
  assert.match(source, /max-width:440px/)
})

test('built browser artifact registers with the Harness module loader', async () => {
  const source = await readFile(new URL('lib/client.js', root), 'utf8')
  let registration
  const context = vm.createContext({
    window: { __ModuleLoader__: { load(value) { registration = value } } },
  })

  vm.runInContext(source, context, { filename: 'lib/client.js' })
  assert.equal(registration.id, 'dsh-provider-usage')
  assert.equal(typeof registration.factory, 'function')

  const react = { createElement() {}, useEffect() {}, useRef() {}, useState() {} }
  const client = registration.factory((id) => {
    assert.equal(id, 'react')
    return react
  })
  assert.deepEqual([...client.inject], ['slots', 'locale', 'connection'])
  assert.equal(typeof client.apply, 'function')
})
