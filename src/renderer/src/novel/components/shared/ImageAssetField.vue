<script setup lang="ts">

import { computed, ref } from 'vue'

import { ImagePlus, Sparkles, Trash2, Upload } from 'lucide-vue-next'

import { persistUploadedImage } from '@renderer/services/image-service'

import ImageDrawPromptDialog from './ImageDrawPromptDialog.vue'



const props = withDefaults(

  defineProps<{

    modelValue?: string | null

    variant?: 'cover' | 'portrait' | 'portrait-hero'

    label?: string

    placeholder?: string

    editable?: boolean

    generating?: boolean

    defaultPrompt?: string

    projectModel?: { chat_model_id?: string; image_model_id?: string } | null

  }>(),

  {

    variant: 'portrait',

    label: '图像',

    placeholder: '暂无图像',

    editable: true,

    generating: false,

    defaultPrompt: '',

    projectModel: null,

  }

)



const emit = defineEmits<{

  'update:modelValue': [value: string | null]

  generate: [prompt: string]

  remove: []

}>()



const fileInputRef = ref<HTMLInputElement | null>(null)

const promptDialogOpen = ref(false)

const hovered = ref(false)



const dialogTitle = computed(() => (props.variant === 'cover' ? 'AI 绘制封面' : 'AI 绘制立绘'))

const showOverlay = computed(() => props.editable && (hovered.value || props.generating) && !promptDialogOpen.value)



function openFilePicker() {

  if (!props.editable || props.generating) return

  fileInputRef.value?.click()

}



async function onFileSelected(event: Event) {

  const input = event.target as HTMLInputElement

  const file = input.files?.[0]

  input.value = ''

  if (!file || props.generating) return

  try {

    const dataUrl = await persistUploadedImage(file)

    emit('update:modelValue', dataUrl)

  } catch (err) {

    alert(err instanceof Error ? err.message : '上传失败')

  }

}



function openGenerateDialog() {

  if (!props.editable || props.generating) return

  promptDialogOpen.value = true

}



function submitGenerate(prompt: string) {

  promptDialogOpen.value = false

  emit('generate', prompt)

}



function removeImage() {

  if (!props.editable || props.generating) return

  emit('update:modelValue', null)

  emit('remove')

}

</script>



<template>

  <div

    class="image-asset-field"

    :class="[`image-asset-field--${variant}`, { 'image-asset-field--editable': editable }]"

    @mouseenter="hovered = true"

    @mouseleave="hovered = false"

  >

    <div class="image-asset-field__preview">

      <img v-if="modelValue" :src="modelValue" :alt="label" />

      <div v-else class="image-asset-field__placeholder">

        <ImagePlus :size="variant === 'cover' || variant === 'portrait-hero' ? 28 : 22" />

        <span>{{ placeholder }}</span>

      </div>



      <Transition name="image-asset-fade">

        <div v-if="showOverlay" class="image-asset-field__overlay">

          <div v-if="generating" class="image-asset-field__loading">

            <div class="md-spinner"></div>

            <span>AI 绘制中…</span>

          </div>

          <div v-else class="image-asset-field__overlay-actions">

            <button
              type="button"
              class="image-asset-field__overlay-btn"
              title="上传图片"
              aria-label="上传图片"
              @click.stop="openFilePicker"
            >
              <Upload :size="16" />
            </button>

            <button
              type="button"
              class="image-asset-field__overlay-btn"
              title="AI 绘制"
              aria-label="AI 绘制"
              @click.stop="openGenerateDialog"
            >
              <Sparkles :size="16" />
            </button>

            <button
              v-if="modelValue"
              type="button"
              class="image-asset-field__overlay-btn image-asset-field__overlay-btn--danger"
              title="移除图片"
              aria-label="移除图片"
              @click.stop="removeImage"
            >
              <Trash2 :size="16" />
            </button>

          </div>

        </div>

      </Transition>

    </div>



    <ImageDrawPromptDialog

      v-model="promptDialogOpen"

      :title="dialogTitle"

      :kind="variant === 'portrait-hero' ? 'portrait' : variant"

      :draft-prompt="defaultPrompt"

      :submitting="generating"

      :project-model="projectModel"

      @submit="submitGenerate"

    />



    <input

      ref="fileInputRef"

      type="file"

      accept="image/png,image/jpeg,image/webp"

      class="image-asset-field__file-input"

      @change="onFileSelected"

    />

  </div>

</template>



<style scoped>

.image-asset-field {

  display: grid;

}



.image-asset-field__preview {

  position: relative;

  overflow: hidden;

  border-radius: 16px;

  background: color-mix(in srgb, var(--surface-soft, #f1f5f9) 80%, transparent);

}



.image-asset-field--cover .image-asset-field__preview {

  aspect-ratio: 3 / 4;

  max-width: 220px;

}



.image-asset-field--portrait .image-asset-field__preview {

  width: 96px;

  height: 96px;

  border-radius: 999px;

}



.image-asset-field--portrait-hero .image-asset-field__preview {

  width: 100%;

  aspect-ratio: 3 / 4;

  max-width: 300px;

  margin: 0 auto;

  border-radius: 20px;

  box-shadow:

    0 4px 24px color-mix(in srgb, var(--brand, #1f7a67) 12%, transparent),

    0 1px 3px color-mix(in srgb, #000 8%, transparent);

}



.image-asset-field__preview img {

  width: 100%;

  height: 100%;

  object-fit: cover;

  display: block;

}



.image-asset-field--portrait .image-asset-field__preview img {

  border-radius: 999px;

}



.image-asset-field--portrait-hero .image-asset-field__preview img {

  border-radius: 20px;

}



.image-asset-field__placeholder {

  display: flex;

  flex-direction: column;

  align-items: center;

  justify-content: center;

  gap: 8px;

  width: 100%;

  height: 100%;

  min-height: 96px;

  color: #64748b;

  font-size: 12px;

  text-align: center;

  padding: 12px;

}



.image-asset-field__overlay {

  position: absolute;

  inset: 0;

  z-index: 2;

  display: flex;

  align-items: center;

  justify-content: center;

  background: rgba(15, 23, 42, 0.52);

  backdrop-filter: blur(2px);

}



.image-asset-field--portrait .image-asset-field__overlay {

  border-radius: 999px;

}



.image-asset-field__overlay-actions {

  display: flex;

  flex-direction: row;

  align-items: center;

  justify-content: center;

  gap: 8px;

}



.image-asset-field__overlay-btn {

  display: grid;

  place-items: center;

  width: 34px;

  height: 34px;

  padding: 0;

  border: 0;

  border-radius: 999px;

  background: rgba(255, 255, 255, 0.94);

  color: #334155;

  cursor: pointer;

  transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;

}



.image-asset-field__overlay-btn:hover {

  background: #fff;

  color: #0f4b44;

  transform: scale(1.06);

}



.image-asset-field__overlay-btn--danger:hover {

  color: #dc2626;

}



.image-asset-field__loading {

  display: flex;

  flex-direction: column;

  align-items: center;

  justify-content: center;

  gap: 8px;

  color: #fff;

  font-size: 12px;

}



.image-asset-field__file-input {

  display: none;

}



.image-asset-fade-enter-active,

.image-asset-fade-leave-active {

  transition: opacity 0.18s ease;

}



.image-asset-fade-enter-from,

.image-asset-fade-leave-to {

  opacity: 0;

}

</style>

