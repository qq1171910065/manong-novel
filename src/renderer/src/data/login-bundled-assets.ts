import bgClean from '@renderer/assets/home/login-bg-ink-jade.png'
import statusLogo from '@renderer/assets/branding/status-logo-ink-jade.png'
import appIcon from '@renderer/assets/branding/app-icon-ink-jade.png'
import coverFantasyArchive from '@renderer/assets/login/covers/cover-fantasy-archive.png'
import coverLiteraryMystery from '@renderer/assets/login/covers/cover-literary-mystery.png'
import coverBookstoreRain from '@renderer/assets/login/covers/cover-bookstore-rain.png'
import coverOrbitalArchive from '@renderer/assets/login/covers/cover-orbital-archive.png'

/** 登录页与主窗口壳层必备素材：Vite 打进安装包，不依赖首次素材下载 */
export const loginBundledAssets = {
  bgClean,
  statusLogo,
  defaultUserAvatar: appIcon,
  avatars: {
    doubao: coverFantasyArchive,
    gpt: coverLiteraryMystery,
    claude: coverBookstoreRain,
  },
  sampleCovers: [
    coverFantasyArchive,
    coverLiteraryMystery,
    coverBookstoreRain,
    coverOrbitalArchive,
  ],
} as const
