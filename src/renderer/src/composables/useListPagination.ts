import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

export interface ListPaginationOptions {
  pageSize?: number
  pageSizes?: number[]
}

export function useListPagination<T>(
  source: MaybeRefOrGetter<readonly T[] | T[]>,
  options: ListPaginationOptions = {}
) {
  const page = ref(1)
  const pageSize = ref(options.pageSize ?? 20)
  const pageSizes = options.pageSizes ?? [10, 20, 50]

  const items = computed(() => toValue(source) ?? [])
  const itemCount = computed(() => items.value.length)

  const paginatedItems = computed(() => {
    if (itemCount.value === 0) return [] as T[]
    const start = (page.value - 1) * pageSize.value
    return items.value.slice(start, start + pageSize.value) as T[]
  })

  watch([items, pageSize], () => {
    const maxPage = Math.max(1, Math.ceil(itemCount.value / pageSize.value))
    if (page.value > maxPage) page.value = maxPage
  })

  function resetPage() {
    page.value = 1
  }

  return {
    page,
    pageSize,
    pageSizes,
    itemCount,
    paginatedItems,
    resetPage,
  }
}
