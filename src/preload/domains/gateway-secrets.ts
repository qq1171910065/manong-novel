import { ipcRenderer } from 'electron'

export const gatewaySecretsDomain = {
  gatewayGetStoredKey: () =>
    ipcRenderer.invoke('gateway:get-stored-key') as Promise<{ ok: boolean; key?: string }>,
  gatewaySetStoredKey: (key: string) =>
    ipcRenderer.invoke('gateway:set-stored-key', key) as Promise<{ ok: boolean }>,
  gatewayClearStoredKey: () =>
    ipcRenderer.invoke('gateway:clear-stored-key') as Promise<{ ok: boolean }>,
}
