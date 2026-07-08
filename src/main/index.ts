import { createMntoolsApp } from './create-mntools-app'
import type { MntoolsModuleId } from '../shared/types'

const modules = ('request,sse,notification,storage,shell,window,file,tray'.split(',').filter(Boolean) as MntoolsModuleId[])

createMntoolsApp({
  appId: 'com.manong.novel',
  appName: 'Manong Novel',
  modules,
  features: {
    autoUpdate: false,
    platform: true,
    tray: true,
  },
  login: {
    emailCode: true,
    password: true,
    wechatOAuth: true,
  },
  shellLayout: 'sidebar',
  shellStyle: 'grouped',
  defaultHomePath: '/home',
})
