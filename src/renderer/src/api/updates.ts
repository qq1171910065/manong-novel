export interface UpdateLog {
  id: number
  content: string
  created_at: string
  is_pinned?: boolean
}

const STORAGE_KEY = 'arboris-desktop-update-logs'

function readLogs(): UpdateLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as UpdateLog[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function getLatestUpdates(): Promise<UpdateLog[]> {
  return readLogs()
}
