import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { buildApi, windowControls, readingDomain } from './domains'
import { novelDomain } from './domains/novel'

const modulesRaw = process.env.MNTOOLS_MODULES || 'request,sse,file,notification,storage,shell,window,file,tray'
const modules = modulesRaw.split(',').map((m) => m.trim()).filter(Boolean)

const api = buildApi(modules)

contextBridge.exposeInMainWorld('electron', electronAPI)
contextBridge.exposeInMainWorld('api', { ...api, ...novelDomain, ...readingDomain })
contextBridge.exposeInMainWorld('windowControls', windowControls)

export type { MntoolsApi } from './domains'
