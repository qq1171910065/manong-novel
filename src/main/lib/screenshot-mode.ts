import { app, type BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { URL } from 'node:url'
import { setStoredSession } from './auth-session'
import { getNovelStore } from './novel/store'
import {
  createDemoScreenshotProject,
  createDemoScreenshotSession,
  DEMO_SCREENSHOT_PROJECT_ID,
  DEMO_SCREENSHOT_USER_ID,
} from '@shared/demo-screenshot'
import { closeReadingWindow, getReadingWindow, openReadingWindow } from './reading-window'

const DEFAULT_PORT = 17655

let server: Server | null = null

export function isScreenshotMode(): boolean {
  return process.env.MNOVEL_SCREENSHOT_MODE === '1'
}

export function prepareScreenshotMode(appId: string): void {
  setStoredSession(createDemoScreenshotSession())

  const store = getNovelStore(appId, DEMO_SCREENSHOT_USER_ID)
  store.saveProject(createDemoScreenshotProject())

  const extras = store.listProjects().data?.filter((item) => item.id !== DEMO_SCREENSHOT_PROJECT_ID) ?? []
  if (extras.length === 0) {
    store.createProject('雾港档案', '悬疑推理，雾港连环失踪案。', 'full')
    store.createProject('星尘旅人', '科幻冒险，深空殖民船上的身份谜题。', 'simple')
  }
}

type WindowGetter = () => BrowserWindow | null

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'access-control-allow-origin': 'http://127.0.0.1',
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(body))
}

function getRequestUrl(req: IncomingMessage): URL {
  return new URL(req.url || '/', `http://${req.headers.host || `127.0.0.1:${DEFAULT_PORT}`}`)
}

async function waitMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function captureWindow(win: BrowserWindow | null, res: ServerResponse): Promise<void> {
  if (!win || win.isDestroyed()) {
    sendJson(res, 404, { ok: false, error: 'window is not available' })
    return
  }

  if (!win.isVisible()) win.show()
  win.focus()
  await waitMs(120)

  const image = await win.webContents.capturePage()
  const size = image.getSize()
  res.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': 'image/png',
    'x-mnovel-window-width': String(size.width),
    'x-mnovel-window-height': String(size.height),
  })
  res.end(image.toPNG())
}

async function waitForMainWindow(getMainWindow: WindowGetter, timeoutMs = 60000): Promise<BrowserWindow | null> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) return win
    await waitMs(200)
  }
  return null
}

async function handleReady(url: URL, getMainWindow: WindowGetter, res: ServerResponse): Promise<void> {
  const timeoutMs = Number(url.searchParams.get('timeout') || '60000')
  const win = await waitForMainWindow(getMainWindow, timeoutMs)
  if (!win) {
    sendJson(res, 503, { ok: false, error: 'main window is not available' })
    return
  }

  try {
    await win.webContents.executeJavaScript(`
      (async () => {
        const deadline = Date.now() + ${Math.max(1000, timeoutMs - 1000)};
        while (Date.now() < deadline) {
          if (typeof window.__MNOVEL_NAVIGATE__ === 'function') return true;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return false;
      })()
    `)
  } catch {
    sendJson(res, 503, { ok: false, error: 'main window renderer is not ready' })
    return
  }

  sendJson(res, 200, { ok: true, width: win.getBounds().width, height: win.getBounds().height })
}

async function handleRoute(url: URL, getMainWindow: WindowGetter, res: ServerResponse): Promise<void> {
  const win = await waitForMainWindow(getMainWindow, 60000)
  const contents = win?.webContents
  if (!contents) {
    sendJson(res, 404, { ok: false, error: 'main window is not available' })
    return
  }

  const hash = url.searchParams.get('hash') || ''
  if (!hash.startsWith('#/') && !hash.startsWith('/')) {
    sendJson(res, 400, { ok: false, error: 'hash must start with / or #/' })
    return
  }

  const nextPath = (hash.startsWith('#') ? hash.slice(1) : hash).split('?')[0] || '/home'
  const targetHash = hash.startsWith('#') ? hash : `#${hash}`

  await contents.executeJavaScript(`
    (async () => {
      const normalize = (path) => {
        const raw = (path || '/home').split('?')[0];
        if (!raw || raw === '/') return '/home';
        return raw.startsWith('/') ? raw : \`/\${raw}\`;
      };
      const target = ${JSON.stringify(targetHash.startsWith('#') ? targetHash.slice(1) : targetHash)};
      const wantPath = normalize(${JSON.stringify(nextPath)});
      const currentPath = normalize(window.location.hash.replace(/^#/, '') || '/home');
      if (currentPath !== wantPath) {
        if (typeof window.__MNOVEL_NAVIGATE__ === 'function') {
          window.__MNOVEL_NAVIGATE__(target);
        } else {
          window.location.hash = target.startsWith('/') ? target : \`/\${target}\`;
        }
        const deadline = Date.now() + 30000;
        while (Date.now() < deadline) {
          const current = normalize(window.location.hash.replace(/^#/, '') || '/home');
          if (current === wantPath) return true;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error('navigation timeout for ' + wantPath + ' (current=' + currentPath + ')');
      }
      return true;
    })()
  `)

  const wait = Number(url.searchParams.get('wait') || '1200')
  if (Number.isFinite(wait) && wait > 0) await waitMs(wait)

  sendJson(res, 200, { ok: true, hash: targetHash, path: nextPath, waitedMs: wait })
}

async function handleEval(url: URL, getMainWindow: WindowGetter, res: ServerResponse): Promise<void> {
  const contents = getMainWindow()?.webContents
  if (!contents) {
    sendJson(res, 404, { ok: false, error: 'main window is not available' })
    return
  }

  const script = url.searchParams.get('script')
  if (!script) {
    sendJson(res, 400, { ok: false, error: 'script query parameter is required' })
    return
  }

  const result = await contents.executeJavaScript(script)
  const wait = Number(url.searchParams.get('wait') || '0')
  if (Number.isFinite(wait) && wait > 0) await waitMs(wait)
  sendJson(res, 200, { ok: true, result, waitedMs: wait })
}

async function handleReadingOpen(url: URL, res: ServerResponse): Promise<void> {
  const projectId = url.searchParams.get('projectId') || DEMO_SCREENSHOT_PROJECT_ID
  openReadingWindow(projectId)
  const wait = Number(url.searchParams.get('wait') || '1500')
  if (Number.isFinite(wait) && wait > 0) await waitMs(wait)
  sendJson(res, 200, { ok: true, projectId, waitedMs: wait })
}

async function handleReadingClose(res: ServerResponse): Promise<void> {
  closeReadingWindow()
  sendJson(res, 200, { ok: true })
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  getMainWindow: WindowGetter,
  getReadingWindowFn: WindowGetter
): Promise<void> {
  try {
    const url = getRequestUrl(req)

    if (url.pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        packaged: app.isPackaged,
        screenshotMode: true,
        demoProjectId: DEMO_SCREENSHOT_PROJECT_ID,
        mainWindowReady: Boolean(getMainWindow() && !getMainWindow()?.isDestroyed()),
      })
      return
    }

    if (url.pathname === '/ready') {
      await handleReady(url, getMainWindow, res)
      return
    }

    if (url.pathname === '/route') {
      await handleRoute(url, getMainWindow, res)
      return
    }

    if (url.pathname === '/eval') {
      await handleEval(url, getMainWindow, res)
      return
    }

    if (url.pathname === '/reading/open') {
      await handleReadingOpen(url, res)
      return
    }

    if (url.pathname === '/reading/close') {
      await handleReadingClose(res)
      return
    }

    if (url.pathname === '/shutdown') {
      sendJson(res, 200, { ok: true })
      setImmediate(() => app.quit())
      return
    }

    if (url.pathname === '/screenshot') {
      const target = url.searchParams.get('target') || 'main'
      if (target === 'reading') {
        await captureWindow(getReadingWindowFn(), res)
        return
      }
      await captureWindow(getMainWindow(), res)
      return
    }

    sendJson(res, 404, { ok: false, error: 'unknown screenshot endpoint' })
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}

export function registerScreenshotProbe(
  getMainWindow: WindowGetter,
  getReadingWindowFn: WindowGetter = getReadingWindow
): void {
  if (server) return

  const port = Number(process.env.MNOVEL_SCREENSHOT_PORT || DEFAULT_PORT)
  server = createServer((req, res) => void handleRequest(req, res, getMainWindow, getReadingWindowFn))
  server.listen(port, '127.0.0.1', () => {
    console.info(`[mnovel:screenshot] probe listening on http://127.0.0.1:${port}`)
    if (process.env.MNOVEL_SCREENSHOT_READY_FILE) {
      mkdirSync(join(process.env.MNOVEL_SCREENSHOT_READY_FILE, '..'), { recursive: true })
      writeFileSync(process.env.MNOVEL_SCREENSHOT_READY_FILE, `${port}\n`, 'utf8')
    }
  })
  server.on('error', (error) => {
    console.warn('[mnovel:screenshot] probe failed to start:', error)
    server = null
  })
}

export function closeScreenshotProbe(): void {
  const current = server
  server = null
  current?.close()
}
