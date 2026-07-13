import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { buildApi, windowControls, readingDomain } from './domains'
import { novelDomain } from './domains/novel'
import { agentLockDomain } from './domains/agent-lock'
import { novelGenerationDomain } from './domains/novel-generation'
import { gatewaySecretsDomain } from './domains/gateway-secrets'

const modulesRaw = process.env.MNTOOLS_MODULES || 'request,sse,file,notification,storage,shell,window,tray'
const modules = modulesRaw.split(',').map((m) => m.trim()).filter(Boolean)

const api = buildApi(modules)

contextBridge.exposeInMainWorld('electron', electronAPI)
contextBridge.exposeInMainWorld('api', {
  ...api,
  ...novelDomain,
  ...readingDomain,
  ...agentLockDomain,
  ...novelGenerationDomain,
  ...gatewaySecretsDomain,
})
contextBridge.exposeInMainWorld('windowControls', windowControls)

export type { MntoolsApi } from './domains'
