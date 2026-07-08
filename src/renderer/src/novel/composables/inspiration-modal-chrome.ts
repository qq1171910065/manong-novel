export type InspirationModalFooterKind =
  | null
  | 'blueprint_confirm'
  | 'blueprint_review'
  | 'section_polish_confirm'

export type InspirationModalToolbarKind = null | 'inspiration_chat' | 'polish_chat'

export interface InspirationModalChrome {
  ariaLabel: string
  title?: string
  subtitle?: string
  modalSize?: 'lg' | 'md' | 'auto'
  panelClass?: string
  bodyClass?: string
  footClass?: string
  footerKind: InspirationModalFooterKind
  showShellHeader: boolean
  footerBusy?: boolean
  footerPrimaryLabel?: string
  toolbarKind?: InspirationModalToolbarKind
  confirmBlueprintDisabled?: boolean
  restartDisabled?: boolean
}

export const DEFAULT_INSPIRATION_MODAL_CHROME: InspirationModalChrome = {
  ariaLabel: '灵感对话',
  footerKind: null,
  showShellHeader: false,
  panelClass: 'novel-modal__panel--chat',
  bodyClass: 'inspiration-modal__body--chat',
}
