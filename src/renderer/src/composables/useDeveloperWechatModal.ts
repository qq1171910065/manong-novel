import { ref } from 'vue'

const showDeveloperWechat = ref(false)

export function useDeveloperWechatModal() {
  function openDeveloperWechatModal() {
    showDeveloperWechat.value = true
  }

  function closeDeveloperWechatModal() {
    showDeveloperWechat.value = false
  }

  return {
    showDeveloperWechat,
    openDeveloperWechatModal,
    closeDeveloperWechatModal,
  }
}
