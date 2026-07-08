export type WritingDeskFooterAction =
  | 'generate'
  | 'regenerate'
  | 'clear'
  | 'cancel'
  | 'confirm-version'
  | 'evaluate'
  | 'optimize'
  | 'edit'

export interface WritingDeskFooterButton {
  action: WritingDeskFooterAction
  label: string
  disabled?: boolean
  loading?: boolean
  variant?: 'filled' | 'tonal' | 'outlined'
  align?: 'left' | 'right'
  danger?: boolean
}

export interface WritingDeskFooterState {
  visible: boolean
  buttons: WritingDeskFooterButton[]
}

export const EMPTY_WRITING_DESK_FOOTER: WritingDeskFooterState = {
  visible: false,
  buttons: [],
}
