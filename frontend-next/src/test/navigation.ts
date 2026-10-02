import { vi } from 'vitest'

/**
 * Подмена next/navigation для jsdom: текущий URL — в памяти, push/replace его меняют и записываются в history.
 * Подключается в setup.ts через vi.mock
 */
const state = { pathname: '/ru', search: '' }
const listeners = new Set<() => void>()

export const navigation = {
  /** Задать URL перед рендером: setUrl('/ru/search?q=молоко') */
  setUrl(url: string) {
    const [pathname, search = ''] = url.split('?')
    state.pathname = pathname
    state.search = search
    listeners.forEach((notify) => notify())
  },
  get url() {
    return state.search ? `${state.pathname}?${state.search}` : state.pathname
  },
  history: [] as { method: 'push' | 'replace'; url: string }[],
  reset() {
    this.history = []
    this.setUrl('/ru')
  },
}

const router = {
  push: vi.fn((url: string) => {
    navigation.history.push({ method: 'push', url })
    navigation.setUrl(url)
  }),
  replace: vi.fn((url: string) => {
    navigation.history.push({ method: 'replace', url })
    navigation.setUrl(url)
  }),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
}

export async function mockNextNavigation() {
  const { useSyncExternalStore } = await import('react')
  const subscribe = (notify: () => void) => {
    listeners.add(notify)
    return () => listeners.delete(notify)
  }
  // Перерисовка подписчиков при смене URL — как у настоящего роутера
  const useUrl = () => useSyncExternalStore(subscribe, () => navigation.url)

  return {
    useRouter: () => router,
    usePathname: () => useUrl().split('?')[0],
    useSearchParams: () => new URLSearchParams(useUrl().split('?')[1] ?? ''),
    useParams: () => ({ lang: useUrl().split('/')[1] }),
    notFound: () => {
      throw new Error('NEXT_NOT_FOUND')
    },
  }
}
