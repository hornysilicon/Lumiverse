import { describe, expect, mock, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ConnectionProfile } from '@/types/api'

// InputArea pulls in the whole store (→ i18n → import.meta.glob), which is
// vite-only; mock the store so the resolver is importable under bun test.
mock.module('@/store', () => ({
  useStore: (selector: (state: unknown) => unknown) => selector({}),
}))

const { resolveEffectiveChatConnection } = await import('@/hooks/useEffectiveChatConnection')

const here = dirname(fileURLToPath(import.meta.url))

function inputAreaSource(): string {
  return readFileSync(join(here, 'InputArea.tsx'), 'utf8')
}

function profile(id: string): ConnectionProfile {
  return {
    id,
    name: `Profile ${id}`,
    provider: 'openai',
    api_url: '',
    model: 'gpt-test',
    preset_id: null,
    is_default: false,
    has_api_key: false,
    metadata: {},
    created_at: 1,
    updated_at: 1,
  }
}

const BASE = {
  profiles: [profile('pinned'), profile('charbound'), profile('active')],
  activeProfileId: 'active',
}

describe('InputArea connection indicator', () => {
  test('trigger and popover render from the effective connection', () => {
    const source = inputAreaSource()
    expect(source).toContain('useEffectiveChatConnection()')
    // Trigger: effective connection title, bound state highlighted + badged.
    expect(source).toContain('overrideSource: connectionOverrideSource')
    expect(source).toContain('profile: effectiveConnectionProfile')
    expect(source).toMatch(/connectionOverrideSource !== null && styles\.actionBtnHasSelection/)
    expect(source).toMatch(/connectionOverrideSource === 'chat' \? <Pin size=\{9\} \/> : <Link2 size=\{9\} \/>/)
    // Popover: the effective row is highlighted and labelled, not activeProfileId.
    expect(source).toMatch(/effectiveConnectionId === p\.id && styles\.popRowBtnActive/)
    expect(source).not.toMatch(/activeProfileId === p\.id && styles\.popRowBtnActive/)
    expect(source).toContain("t('quickMenu.connectionBindBadgeChat')")
    expect(source).toContain("t('quickMenu.connectionBindBadgeChar')")
    expect(source).toContain("t('quickMenu.connectionBindHint', { name: effectiveConnectionProfile.name })")
    // Selection behavior is unchanged: picking a row still only acknowledges
    // the global active profile.
    expect(source).toMatch(/renderPopover === 'connections'[\s\S]*?acknowledgeConnectionProfileSelection/)
  })

  test('guided generation follows the effective connection (char bind now counts)', () => {
    const source = inputAreaSource()
    expect(source).toMatch(/connectionProfileId: effectiveConnectionId,/)
    // The old pin-only derivation is gone.
    expect(source).not.toContain('pinnedConnectionId')
  })

  test('chat pin: trigger shows the bound connection with a chat badge and the popover hints', () => {
    const result = resolveEffectiveChatConnection({
      ...BASE,
      activeChatMetadata: { connection_profile_id: 'pinned' },
      activeCharacterConnectionId: 'charbound',
    })
    expect(result.effectiveConnectionId).toBe('pinned')
    expect(result.overrideSource).toBe('chat')
    expect(result.profile?.name).toBe('Profile pinned')
  })

  test('character bind in a solo chat drives the Link2 badge', () => {
    const result = resolveEffectiveChatConnection({
      ...BASE,
      activeChatMetadata: null,
      activeCharacterConnectionId: 'charbound',
    })
    expect(result.effectiveConnectionId).toBe('charbound')
    expect(result.overrideSource).toBe('character')
  })

  test('group chats suppress the character override', () => {
    const result = resolveEffectiveChatConnection({
      ...BASE,
      activeChatMetadata: { group: true },
      activeCharacterConnectionId: 'charbound',
    })
    expect(result.effectiveConnectionId).toBe('active')
    expect(result.overrideSource).toBeNull()
  })

  test('without bindings the indicator is inert (no badge, no hint, active highlighted)', () => {
    const result = resolveEffectiveChatConnection({
      ...BASE,
      activeChatMetadata: null,
      activeCharacterConnectionId: null,
    })
    expect(result.effectiveConnectionId).toBe('active')
    expect(result.overrideSource).toBeNull()
    expect(result.profile?.name).toBe('Profile active')
  })
})
