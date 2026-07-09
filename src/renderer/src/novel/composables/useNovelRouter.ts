import { reactive } from 'vue'
import { route, navigate } from '@renderer/router'

function parseQuery(path: string): Record<string, string> {
  const q = path.indexOf('?')
  if (q < 0) return {}
  const params = new URLSearchParams(path.slice(q + 1))
  const out: Record<string, string> = {}
  params.forEach((value, key) => {
    out[key] = value
  })
  return out
}

const router = {
  push(to: string | { name?: string; path?: string; query?: Record<string, string> }) {
    if (typeof to === 'string') {
      navigate(to)
      return
    }
    const path = to.path || '/home'
    const query = to.query ? `?${new URLSearchParams(to.query).toString()}` : ''
    navigate(`${path}${query}`)
  },
  replace(to: string | { name?: string; path?: string; query?: Record<string, string> }) {
    this.push(to)
  },
  get currentRoute() {
    return {
      path: route.value.path,
      params: { id: route.value.id },
      query: parseQuery(route.value.path),
    }
  },
}

export function useRouter() {
  return router
}

export function useRoute() {
  return reactive({
    get path() {
      return route.value.path
    },
    get params() {
      return { id: route.value.id }
    },
    get query() {
      return parseQuery(route.value.path)
    },
  })
}

export default router
