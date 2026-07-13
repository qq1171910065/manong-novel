import { ipcMain } from 'electron'
import StoreImport from 'electron-store'
import { app } from 'electron'

const Store =
  (StoreImport as unknown as { default: typeof StoreImport }).default ?? StoreImport

type GatewaySecretsStore = InstanceType<typeof Store>

let store: GatewaySecretsStore | null = null

function getStore(): GatewaySecretsStore {
  if (!store) {
    store = new Store({
      name: 'mntools-gateway',
      cwd: app.getPath('userData'),
      defaults: { gatewayApiKey: '' },
    }) as unknown as GatewaySecretsStore
  }
  return store
}

export function getStoredGatewayKey(): string {
  return String(getStore().get('gatewayApiKey') ?? '').trim()
}

export function setStoredGatewayKey(key: string): void {
  const normalized = String(key || '').trim()
  if (normalized) getStore().set('gatewayApiKey', normalized)
  else getStore().delete('gatewayApiKey')
}

export function clearStoredGatewayKey(): void {
  getStore().delete('gatewayApiKey')
}

export function registerGatewaySecretHandlers(): void {
  ipcMain.removeHandler('gateway:get-stored-key')
  ipcMain.handle('gateway:get-stored-key', () => ({
    ok: true as const,
    key: getStoredGatewayKey(),
  }))

  ipcMain.removeHandler('gateway:set-stored-key')
  ipcMain.handle('gateway:set-stored-key', (_event, key: string) => {
    setStoredGatewayKey(key)
    return { ok: true as const }
  })

  ipcMain.removeHandler('gateway:clear-stored-key')
  ipcMain.handle('gateway:clear-stored-key', () => {
    clearStoredGatewayKey()
    return { ok: true as const }
  })
}
