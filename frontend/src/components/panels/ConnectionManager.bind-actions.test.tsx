import { afterEach, beforeAll, describe, expect, mock, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ConnectionProfile } from '@/types/api'

const patchMetadataCalls: Array<[string, Record<string, unknown>]> = []
const bindPutCalls: Array<[string, string | null]> = []

function profile(id: string): ConnectionProfile {
  return {
    id,
    name: id,
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

const state = {
  profiles: [profile('alpha'), profile('beta')],
  providers: [{ id: 'openai', name: 'OpenAI', default_url: 'https://api.openai.com/v1' }],
  activeProfileId: 'alpha' as string | null,
  activeCharacterConnectionId: null as string | null,
  activeChatId: 'chat-1' as string | null,
  activeChatName: 'My Chat' as string | null,
  activeChatMetadata: null as Record<string, any> | null,
  activeCharacterId: 'char-1' as string | null,
  characters: [{ id: 'char-1', name: 'Hero' }],
  connectionsOrder: { llm: ['alpha', 'beta'], imageGen: [], stt: [], tts: [] },
  setProfiles(profiles: ConnectionProfile[]) {
    state.profiles = profiles
  },
  addProfile() {},
  updateProfile() {},
  removeProfile() {},
  setActiveProfile(id: string | null) {
    state.activeProfileId = id
  },
  setActiveCharacterConnection(id: string | null) {
    state.activeCharacterConnectionId = id
  },
  setActiveChatMetadata(metadata: Record<string, any> | null) {
    state.activeChatMetadata = metadata
  },
  setProviders() {},
  applyProfileOrder() {},
  setSetting() {},
}

const useStore = Object.assign(
  <T,>(selector: (value: typeof state) => T): T => selector(state),
  { getState: () => state },
)

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://lumiverse.test/' })
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  navigator: dom.window.navigator,
  sessionStorage: dom.window.sessionStorage,
  getComputedStyle: dom.window.getComputedStyle,
})
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

mock.module('@/store', () => ({ useStore }))
mock.module('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: { name?: string }) => opts?.name ? `${key}:${opts.name}` : key }),
}))
mock.module('@/api/connections', () => ({
  connectionsApi: {
    providers: async () => ({ providers: state.providers }),
    delete: async () => undefined,
    create: async (input: ConnectionProfile) => input,
    duplicate: async (id: string) => profile(`${id}-copy`),
    test: async () => ({ success: true, message: 'ok' }),
    nanogptUsage: async () => null,
  },
}))
mock.module('@/api/listAllConnections', () => ({
  listAllConnections: async () => ({ data: state.profiles, total: state.profiles.length }),
}))
mock.module('@/api/chats', () => ({
  chatsApi: {
    // Echo the patch back as the merged metadata, like the server does.
    patchMetadata: async (chatId: string, partial: Record<string, unknown>) => {
      patchMetadataCalls.push([chatId, partial])
      return { id: chatId, metadata: { ...partial } }
    },
  },
  messagesApi: {},
}))
mock.module('@/api/character-connection-binds', () => ({
  characterConnectionBindsApi: {
    get: async () => ({ connection_id: null }),
    put: async (characterId: string, connectionId: string | null) => {
      bindPutCalls.push([characterId, connectionId])
      return { connection_id: connectionId }
    },
  },
}))
mock.module('@/api/openrouter', () => ({
  buildOpenRouterOAuthCallbackUrl: () => 'https://openrouter.test/cb',
  openrouterApi: { credits: async () => null, initiateAuth: async () => { throw new Error('unused') } },
}))
mock.module('@/api/nanogpt', () => ({
  buildNanoGptOAuthCallbackUrl: () => 'https://nanogpt.test/cb',
  nanoGptApi: { initiateAuth: async () => { throw new Error('unused') } },
}))
mock.module('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children?: ReactNode }) => <>{children}</>,
  closestCenter: () => null,
}))
mock.module('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children?: ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: () => null,
  arrayMove: <T,>(items: T[]) => items,
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, transition: null, isDragging: false }),
}))
mock.module('./connection-manager/ConnectionForm', () => ({
  default: () => <div data-testid="connection-form" />,
}))
mock.module('./connection-manager/useConnectionDragAndDrop', () => ({
  useConnectionSensors: () => [],
  useVerticalSortModifier: () => [],
}))
mock.module('@/lib/dndUiScale', () => ({
  useScaledSortableStyle: () => ({ setNodeRef: () => {}, style: undefined }),
}))
mock.module('@/components/shared/FormComponents', () => ({
  Button: ({ title, onClick, icon }: { title?: string; onClick?: (e: { currentTarget: HTMLElement }) => void; icon?: ReactNode }) => (
    <button type="button" title={title} onClick={onClick}>{icon}</button>
  ),
}))
mock.module('@/components/shared/Spinner', () => ({
  Spinner: () => <span />,
}))
mock.module('@/components/shared/ProviderIcon', () => ({
  default: () => <span />,
}))
mock.module('@/components/shared/ConfirmationModal', () => ({
  default: () => null,
}))

// The real ConnectionItem + ContextMenu are under test here; only their heavy
// leaf dependencies are mocked above.
const { default: ConnectionManager } = await import('./ConnectionManager')

let root: Root

beforeAll(() => {
  root = createRoot(document.getElementById('root')!)
})

function menuItem(label: string): HTMLButtonElement | null {
  return Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === label) ?? null
}

function moreButton(): HTMLButtonElement {
  const buttons = Array.from(document.querySelectorAll('button[title="connectionItem.moreActions"]'))
  return buttons[0] as HTMLButtonElement
}

async function openMenu() {
  await act(async () => {
    moreButton().click()
  })
}

afterEach(async () => {
  patchMetadataCalls.length = 0
  bindPutCalls.length = 0
  state.activeProfileId = 'alpha'
  state.profiles = [profile('alpha'), profile('beta')]
  state.activeChatId = 'chat-1'
  state.activeChatName = 'My Chat'
  state.activeChatMetadata = null
  state.activeCharacterId = 'char-1'
  state.activeCharacterConnectionId = null
  await act(async () => {
    root.render(<div />)
  })
})

describe('ConnectionManager bind actions', () => {
  test('shows bind items with target names and binds the chat on click', async () => {
    await act(async () => {
      root.render(<ConnectionManager />)
    })
    await openMenu()

    const chatItem = menuItem('connectionItem.bindToChat:My Chat')
    const charItem = menuItem('connectionItem.bindToChar:Hero')
    expect(chatItem).not.toBeNull()
    expect(charItem).not.toBeNull()
    expect(chatItem!.disabled).toBe(false)
    expect(charItem!.disabled).toBe(false)

    await act(async () => {
      chatItem!.click()
    })
    // The pinned model must always be cleared together with the pin so a stale
    // model from a previously pinned connection can never leak onto the new pin.
    expect(patchMetadataCalls).toEqual([['chat-1', { connection_profile_id: 'alpha', connection_model: null }]])
    expect(state.activeChatMetadata).toEqual({ connection_profile_id: 'alpha', connection_model: null })
  })

  test('binds the character via the binds API and updates the store', async () => {
    await act(async () => {
      root.render(<ConnectionManager />)
    })
    await openMenu()

    await act(async () => {
      menuItem('connectionItem.bindToChar:Hero')!.click()
    })
    expect(bindPutCalls).toEqual([['char-1', 'alpha']])
    expect(state.activeCharacterConnectionId).toBe('alpha')
  })

  test('bound state renders unbind labels, badges, and unbinds on click', async () => {
    state.activeChatMetadata = { connection_profile_id: 'alpha', connection_model: 'stale-model' }
    state.activeCharacterConnectionId = 'alpha'
    await act(async () => {
      root.render(<ConnectionManager />)
    })

    // Row badges mark the bound profile
    expect(document.body.textContent).toContain('connectionItem.boundToChatBadge')
    expect(document.body.textContent).toContain('connectionItem.boundToCharBadge')

    await openMenu()
    const unbindChat = menuItem('connectionItem.unbindFromChat:My Chat')
    const unbindChar = menuItem('connectionItem.unbindFromChar:Hero')
    expect(unbindChat).not.toBeNull()
    expect(unbindChar).not.toBeNull()

    await act(async () => {
      unbindChat!.click()
    })
    expect(patchMetadataCalls).toEqual([['chat-1', { connection_profile_id: null, connection_model: null }]])

    await openMenu()
    await act(async () => {
      menuItem('connectionItem.unbindFromChar:Hero')!.click()
    })
    expect(bindPutCalls).toEqual([['char-1', null]])
    expect(state.activeCharacterConnectionId).toBeNull()
  })

  test('bind items are disabled with an explanatory title without an active chat/character', async () => {
    state.activeChatId = null
    state.activeChatName = null
    state.activeChatMetadata = null
    state.activeCharacterId = null
    state.activeCharacterConnectionId = null
    await act(async () => {
      root.render(<ConnectionManager />)
    })
    await openMenu()

    const chatItem = menuItem('connectionItem.bindToChatNoTarget')
    const charItem = menuItem('connectionItem.bindToCharNoTarget')
    expect(chatItem).not.toBeNull()
    expect(charItem).not.toBeNull()
    expect(chatItem!.disabled).toBe(true)
    expect(chatItem!.title).toBe('connectionItem.bindNoChatHint')
    expect(charItem!.disabled).toBe(true)
    expect(charItem!.title).toBe('connectionItem.bindNoCharacterHint')

    // Disabled buttons must not fire the API calls
    chatItem!.click()
    charItem!.click()
    expect(patchMetadataCalls).toEqual([])
    expect(bindPutCalls).toEqual([])
  })
})
