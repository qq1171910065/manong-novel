<!-- AIMETA P=小说工作区_小说列表管理|R=小说列表_创建|NR=不含章节编辑|E=route:/workspace#component:NovelWorkspace|X=ui|A=工作区|D=vue|S=dom,net|RD=./README.ai -->
<template>
  <div class="aa-subpage">
    <div class="aa-page-scroll">
      <div class="aa-page-inner">
        <div class="workspace-home">
          <transition
            enter-active-class="transition-all duration-300"
            leave-active-class="transition-all duration-300"
            enter-from-class="opacity-0 translate-y-4"
            leave-to-class="opacity-0 translate-y-4"
          >
            <div v-if="deleteMessage" class="workspace-home__snackbar">
              <span>{{ deleteMessage.text }}</span>
            </div>
          </transition>

          <header class="workspace-home__hero">
        <p class="workspace-home__eyebrow">小说家写作台</p>
        <h1 class="workspace-home__title">我的作品</h1>
        <p class="workspace-home__desc">管理你的小说项目，从蓝图到章节，持续打磨每一部未完之作。</p>
      </header>

      <div v-if="novelStore.isLoading" class="workspace-home__state">
        <div class="md-spinner"></div>
        <p class="workspace-home__state-desc">正在加载项目...</p>
      </div>

      <div v-else-if="novelStore.error" class="workspace-home__state">
        <div class="workspace-home__state-icon">
          <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 class="workspace-home__state-title">加载失败</h2>
        <p class="workspace-home__state-desc">{{ novelStore.error }}</p>
        <button type="button" class="workspace-home__btn workspace-home__btn--primary" @click="loadProjects">重试</button>
      </div>

      <div v-else class="workspace-home__grid">
        <div v-if="novelStore.projects.length === 0" class="workspace-home__state">
          <div class="workspace-home__state-icon">
            <svg class="w-9 h-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h2 class="workspace-home__state-title">还没有作品</h2>
          <p class="workspace-home__state-desc">开笔写第一部小说，从这里开始。</p>
          <button
            type="button"
            class="workspace-home__btn workspace-home__btn--primary"
            :disabled="isCreating"
            @click="openCreateModal"
          >
            {{ isCreating ? '正在创建...' : '创建' }}
          </button>
        </div>

        <ProjectCard
          v-for="project in novelStore.projects"
          :key="project.id"
          :project="project"
          @click="enterProject(project)"
          @detail="viewProjectDetail"
          @continue="enterProject"
          @delete="handleDeleteProject"
        />

        <button
          type="button"
          class="workspace-home__utility-card"
          :disabled="isCreating"
          @click="openCreateModal"
        >
          <span class="workspace-home__utility-icon">
            <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </span>
          <span class="workspace-home__utility-label">创建新项目</span>
        </button>

        <button
          type="button"
          class="workspace-home__utility-card workspace-home__utility-card--import"
          :disabled="isImporting"
          @click="triggerImport"
        >
          <span class="workspace-home__utility-icon">
            <svg v-if="!isImporting" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span v-else class="md-spinner w-6 h-6"></span>
          </span>
          <span class="workspace-home__utility-label">{{ isImporting ? '正在导入...' : '导入小说文件' }}</span>
        </button>

        <input
          ref="fileInput"
          type="file"
          accept=".txt"
          class="hidden"
          @change="handleFileImport"
        />
          </div>
        </div>
      </div>
    </div>

    <transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div v-if="showDeleteDialog" class="novel-dialog-overlay">
        <transition
          enter-active-class="transition-all duration-300"
          leave-active-class="transition-all duration-200"
          enter-from-class="opacity-0 scale-95"
          leave-to-class="opacity-0 scale-95"
        >
          <div class="novel-dialog">
            <div class="novel-dialog__head">
              <div class="novel-dialog__icon is-error">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 class="novel-dialog__title">确认删除</h3>
                <p class="text-muted" style="margin:4px 0 0;">此操作无法撤销</p>
              </div>
            </div>

            <div class="novel-dialog__body">
              <p style="margin:0;">
                确定要删除项目「<strong>{{ projectToDelete?.title }}</strong>」吗？所有相关数据将被永久删除。
              </p>
            </div>

            <div class="novel-dialog__actions">
              <button type="button" class="novel-btn novel-btn--text" @click="cancelDelete">取消</button>
              <button
                type="button"
                class="novel-btn novel-btn--danger"
                :disabled="isDeleting"
                @click="confirmDelete"
              >
                {{ isDeleting ? '删除中...' : '确认删除' }}
              </button>
            </div>
          </div>
        </transition>
      </div>
    </transition>
  </div>

  <WritingModeSelectModal
    :show="showModeModal"
    :creating="isCreating"
    @close="closeCreateModal"
    @confirm="handleCreateWithMode"
  />
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from '@renderer/novel/composables/useNovelRouter'
import { useNovelStore } from '@renderer/stores/novel'
import ProjectCard from '@renderer/novel/components/ProjectCard.vue'
import WritingModeSelectModal from '@renderer/novel/components/shared/WritingModeSelectModal.vue'
import { useCreateNovelProject } from '@renderer/novel/composables/useCreateNovelProject'
import type { NovelProjectSummary } from '@renderer/services/novel/api'
import { NovelAPI } from '@renderer/services/novel/api'
import type { WritingMode } from '@shared/novel/types'
import type { CreateProjectMaterialSelection } from '@renderer/novel/composables/useCreateNovelProject'

const router = useRouter()
const novelStore = useNovelStore()
const { showModeModal, isCreating, openCreateModal, closeCreateModal, createWithMode } = useCreateNovelProject()

const fileInput = ref<HTMLInputElement | null>(null)
const isImporting = ref(false)
const showDeleteDialog = ref(false)
const projectToDelete = ref<NovelProjectSummary | null>(null)
const isDeleting = ref(false)
const deleteMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null)

const handleCreateWithMode = async (mode: WritingMode, materials: CreateProjectMaterialSelection) => {
  try {
    const project = await createWithMode(mode, { materials, onCreated: loadProjects })
    if (project) router.push(`/detail/${project.id}`)
  } catch (error) {
    console.error('创建项目失败:', error)
    alert(error instanceof Error ? error.message : '创建项目失败，请重试')
  }
}

const viewProjectDetail = (projectId: string) => {
  router.push(`/detail/${projectId}`)
}

const enterProject = (project: NovelProjectSummary) => {
  router.push(`/detail/${project.id}`)
}

const loadProjects = async () => {
  await novelStore.loadProjects()
}

const triggerImport = () => {
  if (isImporting.value) return
  fileInput.value?.click()
}

const handleFileImport = async (event: Event) => {
  const target = event.target as HTMLInputElement
  if (!target.files || target.files.length === 0) return

  const file = target.files[0]
  if (!file.name.endsWith('.txt')) {
    alert('请上传 .txt 格式的文件')
    return
  }

  isImporting.value = true
  try {
    const response = await NovelAPI.importNovel(file)
    await loadProjects()
    router.push(`/detail/${response.id}`)
  } catch (error: unknown) {
    console.error('导入失败:', error)
    alert(error instanceof Error ? error.message : '导入失败，请重试')
  } finally {
    isImporting.value = false
    target.value = ''
  }
}

const handleDeleteProject = (projectId: string) => {
  const project = novelStore.projects.find((p) => p.id === projectId)
  if (project) {
    projectToDelete.value = project
    showDeleteDialog.value = true
  }
}

const cancelDelete = () => {
  showDeleteDialog.value = false
  projectToDelete.value = null
}

const confirmDelete = async () => {
  if (!projectToDelete.value) return

  isDeleting.value = true
  try {
    await novelStore.deleteProjects([projectToDelete.value.id])
    deleteMessage.value = { type: 'success', text: `项目 "${projectToDelete.value.title}" 已成功删除` }
    showDeleteDialog.value = false
    projectToDelete.value = null

    setTimeout(() => {
      deleteMessage.value = null
    }, 3000)
  } catch (error) {
    console.error('删除项目失败:', error)
    deleteMessage.value = { type: 'error', text: '删除项目失败，请重试' }

    setTimeout(() => {
      deleteMessage.value = null
    }, 3000)
  } finally {
    isDeleting.value = false
  }
}

onMounted(() => {
  void loadProjects()
})
</script>
