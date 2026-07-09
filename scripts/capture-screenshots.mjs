/**
 * Capture real Electron screenshots via the screenshot probe HTTP API.
 * Usage: pnpm capture:screenshots
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const outputDir = join(root, 'docs', 'screenshots')
const outMain = join(root, 'out', 'main', 'index.js')
const probePort = Number(process.env.MNOVEL_SCREENSHOT_PORT || 17655)
const probeBase = `http://127.0.0.1:${probePort}`
const demoProjectId = '11111111-1111-4111-8111-111111111111'

const require = createRequire(import.meta.url)
const electronPath = require('electron')

const screens = [
  { file: 'home.png', label: '首页', hash: '#/home', wait: 3000 },
  { file: 'bookshelf.png', label: '书架', hash: '#/bookshelf', wait: 3000 },
  {
    file: 'inspiration.png',
    label: '灵感模式',
    hash: `#/inspiration?project_id=${demoProjectId}`,
    wait: 5000,
  },
  { file: 'writing-desk.png', label: '写作台', hash: `#/novel/${demoProjectId}`, wait: 5000, eval: `document.querySelector('.m3-chapter-card')?.click()`, evalWait: 2000 },
  { file: 'blueprint.png', label: '项目蓝图', hash: `#/detail/${demoProjectId}`, wait: 4000 },
  { file: 'material-library.png', label: '素材库', hash: '#/library/characters', wait: 3000 },
]

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function probeJson(path, init) {
  const res = await fetch(`${probeBase}${path}`, init)
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  if (!res.ok) {
    throw new Error(`Probe ${path} failed (${res.status}): ${typeof body === 'string' ? body : JSON.stringify(body)}`)
  }
  return body
}

async function waitForProbe(timeoutMs = 120000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const health = await probeJson('/health')
      if (health?.ok) {
        await probeJson('/ready?timeout=90000')
        return health
      }
    } catch {
      /* retry */
    }
    await sleep(500)
  }
  throw new Error(`Screenshot probe did not become ready within ${timeoutMs}ms`)
}

async function captureMainScreen(screen) {
  await probeJson(`/route?hash=${encodeURIComponent(screen.hash)}&wait=${screen.wait}`)
  if (screen.eval) {
    await probeJson(
      `/eval?script=${encodeURIComponent(screen.eval)}&wait=${screen.evalWait ?? 1500}`
    )
  }
  const res = await fetch(`${probeBase}/screenshot?target=main`)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Screenshot failed for ${screen.file}: ${text}`)
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  writeFileSync(join(outputDir, screen.file), buffer)
  console.log(`[capture-screenshots] ${screen.label} -> ${screen.file}`)
}

async function captureReadingWindow() {
  await probeJson(`/reading/open?projectId=${demoProjectId}&wait=2800`)
  const res = await fetch(`${probeBase}/screenshot?target=reading`)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Reading window screenshot failed: ${text}`)
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  writeFileSync(join(outputDir, 'reading-window.png'), buffer)
  console.log('[capture-screenshots] 阅读窗口 -> reading-window.png')
  await probeJson('/reading/close')
}

function ensureBuilt() {
  if (existsSync(outMain)) return
  console.log('[capture-screenshots] building app...')
  const { spawnSync } = require('node:child_process')
  const build = spawnSync('pnpm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: true })
  if (build.status !== 0) {
    throw new Error('pnpm run build failed')
  }
}

async function main() {
  ensureBuilt()

  const userDataDir = join(tmpdir(), `manong-novel-screenshots-${Date.now()}`)
  mkdirSync(userDataDir, { recursive: true })

  mkdirSync(outputDir, { recursive: true })

  const electron = spawn(electronPath, ['.', `--user-data-dir=${userDataDir}`], {
    cwd: root,
    env: {
      ...process.env,
      MNOVEL_SCREENSHOT_MODE: '1',
      MNOVEL_SCREENSHOT_PORT: String(probePort),
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  electron.stdout?.on('data', (chunk) => process.stdout.write(chunk))
  electron.stderr?.on('data', (chunk) => process.stderr.write(chunk))

  try {
    await waitForProbe()
    await sleep(1500)

    for (const screen of screens) {
      await captureMainScreen(screen)
    }

    await captureReadingWindow()
    console.log('[capture-screenshots] done')
    await probeJson('/shutdown')
  } finally {
    try {
      electron.kill()
    } catch {
      /* ignore */
    }
    await sleep(500)
    try {
      rmSync(userDataDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

main().catch((error) => {
  console.error('[capture-screenshots] failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
