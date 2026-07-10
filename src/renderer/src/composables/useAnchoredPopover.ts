import { nextTick, onUnmounted, ref, watch, type Ref } from 'vue'

type AnchoredPopoverOptions = {
  offsetY?: number
  offsetRight?: number
}

export function useAnchoredPopover(
  open: Ref<boolean>,
  triggerRef: Ref<HTMLElement | null>,
  options: AnchoredPopoverOptions = {}
) {
  const offsetY = options.offsetY ?? 10
  const offsetRight = options.offsetRight ?? 0
  const style = ref<Record<string, string>>({})

  function sync() {
    const trigger = triggerRef.value
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    style.value = {
      top: `${rect.bottom + offsetY}px`,
      right: `${Math.max(12, window.innerWidth - rect.right + offsetRight)}px`,
    }
  }

  function bind() {
    sync()
    window.addEventListener('resize', sync)
    window.addEventListener('scroll', sync, true)
  }

  function unbind() {
    window.removeEventListener('resize', sync)
    window.removeEventListener('scroll', sync, true)
  }

  watch(open, async (isOpen) => {
    if (isOpen) {
      await nextTick()
      bind()
      return
    }
    unbind()
  })

  onUnmounted(unbind)

  return { style, sync }
}
