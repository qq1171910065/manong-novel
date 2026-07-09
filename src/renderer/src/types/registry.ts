export type RouteName =
  | 'login'
  | 'profile'
  | 'settings'
  | 'home'
  | 'bookshelf'
  | 'inspiration'
  | 'novel-detail'
  | 'writing-desk'
  | 'material-library'
  | 'reading'

export type FeatureGroupId = 'main' | 'materials' | 'settings'

export interface FeatureRegistryItem {
  key: string
  route: RouteName
  path: string
  label: string
  group: FeatureGroupId
  order: number
  icon?: import('vue').Component
  hideInNav?: boolean
}

export interface FeatureRegistryGroup {
  id: FeatureGroupId
  label: string
  items: FeatureRegistryItem[]
}

export type FeatureRegistry = FeatureRegistryItem[]

export const SIDEBAR_FOOTER_GROUPS: FeatureGroupId[] = ['settings']

export function isSidebarFooterGroup(id: FeatureGroupId): boolean {
  return SIDEBAR_FOOTER_GROUPS.includes(id)
}

const GROUP_LABELS: Record<FeatureGroupId, string> = {
  main: '写作',
  materials: '物料库',
  settings: '设置',
}

export function groupRegistry(items: FeatureRegistry): FeatureRegistryGroup[] {
  const order: FeatureGroupId[] = ['main', 'materials', 'settings']
  const groups: FeatureRegistryGroup[] = order.map((id) => ({
    id,
    label: GROUP_LABELS[id],
    items: [],
  }))
  for (const item of [...items].sort((a, b) => a.order - b.order)) {
    const g = groups.find((x) => x.id === item.group)
    if (g) g.items.push(item)
  }
  return groups.filter((g) => g.items.length > 0)
}

export function findRegistryItem(items: FeatureRegistry, path: string): FeatureRegistryItem | undefined {
  const pathname = path.split('?')[0]
  return items.find((i) => i.path === pathname || i.path === pathname.replace(/\/$/, ''))
}
