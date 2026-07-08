<script setup lang="ts">
import { ref, watch } from 'vue'
import { FileJson, FileText } from 'lucide-vue-next'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'

const props = defineProps<{
  show: boolean
  importing?: boolean
}>()

const emit = defineEmits<{
  close: []
  import: [kind: 'txt' | 'project', file: File]
}>()

const selectedKind = ref<'txt' | 'project'>('txt')
const txtInput = ref<HTMLInputElement | null>(null)
const projectInput = ref<HTMLInputElement | null>(null)

const importOptions = [
  {
    id: 'txt' as const,
    icon: FileText,
    title: '导入 TXT 正文',
    summary: '从纯文本草稿导入，自动分章后可进行智能解析。',
    features: ['支持 .txt 纯文本', '自动识别章节结构', '导入后可智能解析设定'],
  },
  {
    id: 'project' as const,
    icon: FileJson,
    title: '导入创作项目',
    summary: '从 JSON 项目文件恢复蓝图、章节与全部设定。',
    features: ['完整项目备份恢复', '含蓝图与章节数据', '保留创作流水线配置'],
  },
]

watch(
  () => props.show,
  (open) => {
    if (!open) return
    selectedKind.value = 'txt'
  }
)

function pickFile() {
  if (props.importing) return
  if (selectedKind.value === 'txt') {
    txtInput.value?.click()
  } else {
    projectInput.value?.click()
  }
}

function onTxtChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  emit('import', 'txt', file)
  target.value = ''
}

function onProjectChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  emit('import', 'project', file)
  target.value = ''
}
</script>

<template>
  <NovelModalShell
    :show="show"
    variant="form"
    auto-min-width="lg"
    panel-class="novel-modal__panel--writing-mode"
    title="导入作品"
    subtitle="选择导入方式，从本地文件恢复创作内容"
    aria-label="导入作品"
    foot-class="novel-modal__foot--form novel-modal__foot--between"
    @close="emit('close')"
  >
    <div class="import-select">
      <button
        v-for="option in importOptions"
        :key="option.id"
        type="button"
        class="import-card"
        :class="{ 'import-card--active': selectedKind === option.id }"
        :disabled="importing"
        @click="selectedKind = option.id"
      >
        <div class="import-card__icon">
          <component :is="option.icon" :size="26" aria-hidden="true" />
        </div>
        <div class="import-card__body">
          <h3>{{ option.title }}</h3>
          <p>{{ option.summary }}</p>
          <ul>
            <li v-for="feature in option.features" :key="feature">
              {{ feature }}
            </li>
          </ul>
        </div>
      </button>
    </div>

    <template #footer>
      <p v-if="importing" class="import-hint">正在导入，请稍候...</p>
      <div v-else class="import-footer-spacer" aria-hidden="true"></div>
      <button
        type="button"
        class="md-btn md-btn-filled md-ripple"
        :disabled="importing"
        @click="pickFile"
      >
        {{ importing ? '导入中...' : '选择文件' }}
      </button>
    </template>

    <input
      ref="txtInput"
      type="file"
      accept=".txt,text/plain"
      class="hidden"
      @change="onTxtChange"
    />
    <input
      ref="projectInput"
      type="file"
      accept=".json,application/json"
      class="hidden"
      @change="onProjectChange"
    />
  </NovelModalShell>
</template>

<style scoped>
.import-select {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  width: 100%;
}

.import-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  min-height: 200px;
  padding: 18px 20px 20px;
  border: 1px solid color-mix(in srgb, var(--line, rgba(0, 0, 0, 0.1)) 85%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface) 72%, transparent);
  text-align: left;
  cursor: pointer;
  transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease, transform 160ms ease;
}

.import-card:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--brand, var(--primary)) 40%, var(--line));
  transform: translateY(-1px);
}

.import-card--active {
  border-color: color-mix(in srgb, var(--brand, var(--primary)) 45%, transparent);
  background: color-mix(in srgb, var(--brand, var(--primary)) 8%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand, var(--primary)) 24%, transparent);
}

.import-card:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.import-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--brand, var(--primary)) 12%, transparent);
  color: var(--brand, var(--primary));
  flex-shrink: 0;
}

.import-card__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.import-card__body h3 {
  margin: 0 0 8px;
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--text);
}

.import-card__body p {
  margin: 0 0 14px;
  font-size: var(--text-sm);
  line-height: 1.6;
  color: var(--muted);
}

.import-card__body ul {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
}

.import-card__body li {
  font-size: var(--text-sm);
  line-height: 1.55;
  color: var(--text);
}

.import-hint {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-sm);
}

.import-footer-spacer {
  flex: 1;
}

.hidden {
  display: none;
}

@media (max-width: 760px) {
  .import-select {
    grid-template-columns: 1fr;
    min-width: 0;
  }

  .import-card {
    min-height: 0;
  }
}
</style>
