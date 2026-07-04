<script setup lang="ts">
import { navigate } from '@renderer/router'

const props = defineProps<{ to: string | { path?: string; query?: Record<string, string> } }>()

function handleClick(event: MouseEvent) {
  event.preventDefault()
  if (typeof props.to === 'string') {
    navigate(props.to)
    return
  }
  const path = props.to.path || '/home'
  const query = props.to.query ? `?${new URLSearchParams(props.to.query).toString()}` : ''
  navigate(`${path}${query}`)
}
</script>

<template>
  <a href="#" class="novel-router-link" @click="handleClick"><slot /></a>
</template>
