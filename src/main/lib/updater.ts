import { app } from 'electron'
import { registerClientUpdateHandlers } from './client-update'

export function registerUpdaterHandlers(): void {
  registerClientUpdateHandlers(() => {
    app.quit()
  })
}
