import type { RouteName } from '@renderer/types/registry'
import type { Component } from 'vue'

export const pageLoaders: Partial<Record<RouteName, () => Promise<Component>>> = {
  home: () => import('@renderer/pages/HomePage.vue'),
  bookshelf: () => import('@renderer/novel/views/BookshelfPage.vue'),
  workspace: () => import('@renderer/novel/views/BookshelfPage.vue'),
  inspiration: () => import('@renderer/novel/views/InspirationMode.vue'),
  'novel-detail': () => import('@renderer/novel/views/NovelDetail.vue'),
  'writing-desk': () => import('@renderer/novel/views/WritingDesk.vue'),
  'material-library': () => import('@renderer/novel/views/MaterialLibrary.vue'),
  reading: () => import('@renderer/pages/ReadingWindow.vue'),
  profile: () => import('@renderer/pages/settings/ProfilePage.vue'),
  settings: () => import('@renderer/pages/settings/ProfilePage.vue'),
}
