import { createApp } from 'vue'
import { createPinia } from 'pinia'

import '@fontsource/noto-sans-sc/400.css'
import '@fontsource/noto-sans-sc/500.css'
import '@renderer/styles/tokens.css'
import '@renderer/styles/shell.css'
import '@renderer/styles/novel-shell.css'
import '@renderer/styles/app-shell-layout.css'
import '@renderer/styles/page-layout.css'
import '@renderer/styles/home-page.css'
import '@renderer/styles/reading-window.css'
import '@renderer/styles/novel-ui.css'
import '@renderer/styles/novel-detail.css'
import '@renderer/styles/novel-dialog.css'
import '@renderer/styles/material-library-page.css'
import './styles/theme-overrides.css'
import './styles/app.css'
import './styles/login-page.css'
import '@renderer/novel/assets/main.css'

import { createMntoolsApp as createRoot } from '@renderer/bootstrap/createApp'
import { appConfig } from './app.config'
import { featureRegistry } from './data/feature-registry'
import { pageLoaders } from './data/page-loaders'
import HomePage from '@renderer/pages/HomePage.vue'

import NovelRouterLink from '@renderer/novel/components/NovelRouterLink.vue'

const Root = createRoot({
  appName: appConfig.displayName,
  appId: appConfig.appId,
  productCode: appConfig.productCode,
  description: appConfig.description,
  login: appConfig.login,
  shellLayout: appConfig.shellLayout,
  shellStyle: appConfig.shellStyle,
  defaultHomePath: appConfig.defaultHomePath,
  features: appConfig.features,
  registry: featureRegistry,
  pageLoaders,
  homeComponent: HomePage,
})

createApp(Root)
  .use(createPinia())
  .component('RouterLink', NovelRouterLink)
  .component('router-link', NovelRouterLink)
  .mount('#app')
