<!-- AIMETA P=角色区_角色信息展示|R=角色分栏|NR=不含编辑功能|E=component:CharactersSection|X=ui|A=角色组件|D=vue|S=dom|RD=./README.ai -->
<template>
  <div class="nd-split-page">
    <DetailEmptyState
      v-if="!characters.length"
      class="nd-split-page__empty"
      title="还没有角色档案"
      description="点击此处添加第一个角色"
      :clickable="editable"
      @activate="openCreateForm"
    />

    <template v-else>
      <div
        v-if="showCharList"
        class="nd-split-page__overlay"
        @click="showCharList = false"
      />

      <aside
        class="nd-split-page__list"
        :class="{ 'is-open': showCharList }"
        role="tablist"
        aria-label="角色列表"
      >
        <div class="nd-split-page__list-head">
          <h3 class="nd-split-page__list-title">角色</h3>
          <span class="nd-split-page__list-count">{{ characters.length }} 人</span>
        </div>
        <ul class="nd-split-page__list-body">
          <li v-for="(character, index) in characters" :key="character.id || index" class="nd-split-page__list-item">
            <DetailEditableZone
              :editable="editable"
              :click-to-edit="false"
              :include-edit-menu="false"
              block
              :menu-actions="listMenuActions(index)"
            >
              <button
                type="button"
                role="tab"
                class="nd-split-page__list-btn nd-char-list-btn"
                :class="{ 'is-active': selectedIndex === index }"
                :aria-selected="selectedIndex === index"
                @click="selectCharacter(index)"
              >
                <span class="nd-char-list-btn__avatar" :class="{ 'nd-char-list-btn__avatar--has-img': character.portrait_url }">
                  <img v-if="character.portrait_url" :src="character.portrait_url" :alt="character.name" />
                  <span v-else>{{ (character.name || '角').slice(0, 1) }}</span>
                </span>
                <span class="nd-char-list-btn__body">
                  <span class="nd-char-list-btn__name">{{ character.name || '未命名角色' }}</span>
                  <span v-if="character.identity" class="nd-char-list-btn__meta">{{ character.identity }}</span>
                </span>
              </button>
            </DetailEditableZone>
          </li>
        </ul>
      </aside>

      <article v-if="selectedCharacter" class="nd-split-page__main nd-split-page__main--detail" role="tabpanel">
        <button
          v-if="!showCharList"
          type="button"
          class="nd-split-page__mobile-toggle"
          aria-label="打开角色列表"
          @click="showCharList = true"
        >
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div class="nd-char-detail">
          <div class="nd-char-detail__hero">
            <div class="nd-char-detail__portrait-wrap">
              <ImageAssetField
                :model-value="selectedCharacter.portrait_url || null"
                variant="portrait-hero"
                :label="`${selectedCharacter.name || '角色'}立绘`"
                placeholder="立绘"
                :editable="editable"
                :generating="isPortraitGeneratingAt(selectedIndex)"
                :default-prompt="characterPrompt(selectedCharacter)"
                :project-model="projectModel"
                @update:model-value="(value) => emitPortraitUpdate(selectedIndex, value)"
                @generate="(prompt) => emitPortraitGenerate(selectedIndex, prompt)"
                @remove="emitPortraitUpdate(selectedIndex, null)"
              />
            </div>
            <div class="nd-char-detail__headline">
              <div class="nd-char-detail__name-row">
                <DetailEditableZone
                  class="nd-char-detail__name-zone"
                  :editable="editable"
                  @edit="openFieldEdit('name')"
                >
                  <h3 class="nd-char-detail__name">{{ selectedCharacter.name || '未命名角色' }}</h3>
                </DetailEditableZone>
                <SubmitToLibraryButton
                  v-if="editable"
                  compact
                  label="存入角色库"
                  :handler="() => submitCharacter(selectedIndex)"
                />
              </div>
              <DetailEditableZone :editable="editable" @edit="openFieldEdit('identity')">
                <p
                  v-if="selectedCharacter.identity"
                  class="nd-char-detail__identity"
                >
                  {{ selectedCharacter.identity }}
                </p>
                <p v-else class="nd-char-detail__identity nd-char-detail__identity--empty">
                  {{ editable ? '点击填写身份' : '身份待补充' }}
                </p>
              </DetailEditableZone>
              <DetailEditableZone :editable="editable" @edit="openFieldEdit('description')">
                <p
                  v-if="selectedCharacter.description"
                  class="nd-char-detail__desc"
                >
                  {{ selectedCharacter.description }}
                </p>
                <p v-else-if="editable" class="nd-char-detail__desc nd-char-detail__desc--empty">
                  点击填写描述
                </p>
              </DetailEditableZone>
            </div>
          </div>

          <dl v-if="editable || hasCharacterFields(selectedCharacter)" class="nd-char-detail__fields">
            <DetailEditableZone
              v-for="field in settingFields"
              :key="field.key"
              block
              :editable="editable"
              @edit="openFieldEdit(field.key)"
            >
              <div class="nd-field nd-field--cell">
                <dt>{{ field.label }}</dt>
                <dd :class="{ 'nd-field__value--empty': !selectedCharacter[field.key] }">
                  {{ selectedCharacter[field.key] || (editable ? '点击填写' : '—') }}
                </dd>
              </div>
            </DetailEditableZone>
          </dl>
          <DetailEmptyState
            v-else
            compact
            title="角色设定待补充"
            description="完善性格、目标等字段"
          />

          <section v-if="characterRelations.length" class="nd-char-detail__relations">
            <h4 class="nd-char-detail__relations-title">人物关系</h4>
            <ul class="nd-char-detail__relations-list">
              <li v-for="(rel, ri) in characterRelations" :key="rel.id || ri" class="nd-char-detail__relation">
                <div class="nd-char-detail__relation-head">
                  <span class="nd-char-detail__relation-peer">{{ rel.peer }}</span>
                  <span class="nd-char-detail__relation-type">{{ rel.type }}</span>
                </div>
                <p v-if="rel.description" class="nd-char-detail__relation-desc">{{ rel.description }}</p>
              </li>
            </ul>
          </section>
        </div>
      </article>
    </template>

    <CharacterFormModal
      :show="showForm"
      :mode="formMode"
      :scope="formScope"
      :character="formCharacterSource"
      @close="closeForm"
      @save="onFormSave"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Character, Relationship } from '@shared/novel/types'
import ImageAssetField from '@renderer/novel/components/shared/ImageAssetField.vue'
import SubmitToLibraryButton from '@renderer/novel/components/shared/SubmitToLibraryButton.vue'
import CharacterFormModal from './CharacterFormModal.vue'
import type { CharacterFieldKey, CharacterFormScope } from './CharacterFormModal.vue'
import DetailEditableZone from './DetailEditableZone.vue'
import type { DetailMenuAction } from './DetailEditableZone.vue'
import DetailEmptyState from './DetailEmptyState.vue'
import { buildCharacterPortraitPrompt } from '@renderer/services/image-service'
import { NovelAPI } from '@renderer/services/novel/api'
import { submitCharacterToLibrary } from '@renderer/services/novel/material-library-submit'
import { globalAlert } from '@renderer/novel/composables/useAlert'
import { randomUUID } from '@renderer/utils/id'

const settingFields: Array<{ key: CharacterFieldKey; label: string }> = [
  { key: 'personality', label: '性格' },
  { key: 'goals', label: '目标' },
  { key: 'abilities', label: '能力' },
  { key: 'relationship_to_protagonist', label: '与主角的关系' },
]

const props = defineProps<{
  data: { characters?: Character[] } | null
  relationships?: Relationship[]
  editable?: boolean
  projectId?: string
  projectTitle?: string
  novelMeta?: {
    genre?: string | null
    style?: string | null
  } | null
  portraitGeneratingIndex?: number | null
  isPortraitGenerating?: (index: number) => boolean
  projectModel?: { chat_model_id?: string; image_model_id?: string }
}>()

const emit = defineEmits<{
  (e: 'portrait-update', payload: { index: number; value: string | null }): void
  (e: 'portrait-generate', payload: { index: number; prompt: string }): void
  (e: 'asset-saved', section: 'characters'): void
}>()

const isPortraitGeneratingAt = (index: number) =>
  props.isPortraitGenerating?.(index) ?? props.portraitGeneratingIndex === index

const characters = computed(() => props.data?.characters || [])
const selectedIndex = ref(0)
const showCharList = ref(false)
const showForm = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const formScope = ref<CharacterFormScope>('all')
const formIndex = ref(-1)

watch(characters, (list) => {
  if (!list.length) {
    selectedIndex.value = 0
    return
  }
  if (selectedIndex.value >= list.length) {
    selectedIndex.value = list.length - 1
  }
})

const selectedCharacter = computed(() => characters.value[selectedIndex.value] ?? null)

const formCharacterSource = computed(() => {
  if (formMode.value === 'create') return null
  return characters.value[formIndex.value] ?? null
})

interface CharacterRelationView {
  id?: string
  peer: string
  type: string
  description?: string
}

const characterRelations = computed<CharacterRelationView[]>(() => {
  const name = selectedCharacter.value?.name?.trim()
  if (!name || !props.relationships?.length) return []

  return props.relationships
    .filter((rel) => rel.character_from === name || rel.character_to === name)
    .map((rel) => {
      const isFrom = rel.character_from === name
      return {
        id: rel.id,
        peer: isFrom ? (rel.character_to || '未知') : (rel.character_from || '未知'),
        type: rel.relationship_type || '关系未定义',
        description: rel.description,
      }
    })
})

function selectCharacter(index: number) {
  selectedIndex.value = index
  showCharList.value = false
}

function hasCharacterFields(character: Character) {
  return Boolean(
    character.personality ||
      character.goals ||
      character.abilities ||
      character.relationship_to_protagonist
  )
}

function characterPrompt(character: Character) {
  return buildCharacterPortraitPrompt(character, {
    genre: props.novelMeta?.genre || undefined,
    style: props.novelMeta?.style || undefined,
  })
}

function listMenuActions(index: number): DetailMenuAction[] {
  if (!props.editable) return []
  return [
    { id: 'edit', label: '编辑', onClick: () => openEditAll(index) },
    { id: 'delete', label: '删除', onClick: () => void deleteCharacter(index) },
  ]
}

function openCreateForm() {
  if (!props.editable) return
  formMode.value = 'create'
  formScope.value = 'all'
  formIndex.value = -1
  showForm.value = true
}

function openFieldEdit(field: CharacterFieldKey) {
  if (!props.editable || !selectedCharacter.value) return
  formMode.value = 'edit'
  formScope.value = field
  formIndex.value = selectedIndex.value
  showForm.value = true
}

function openEditAll(index: number) {
  if (!props.editable) return
  selectedIndex.value = index
  formMode.value = 'edit'
  formScope.value = 'all'
  formIndex.value = index
  showForm.value = true
}

function closeForm() {
  showForm.value = false
}

async function onFormSave(character: Character) {
  if (!props.projectId) return
  const list = [...characters.value]

  try {
    if (formMode.value === 'create') {
      list.push({ ...character, id: randomUUID() })
      selectedIndex.value = list.length - 1
    } else {
      const index = formIndex.value
      if (index < 0 || index >= list.length) return
      const current = list[index]
      if (formScope.value === 'all') {
        list[index] = {
          ...current,
          ...character,
          id: current.id,
          portrait_url: current.portrait_url,
        }
      } else {
        list[index] = { ...current, [formScope.value]: character[formScope.value] }
      }
    }

    await NovelAPI.updateBlueprint(props.projectId, { characters: list })
    emit('asset-saved', 'characters')
    showForm.value = false
  } catch (error) {
    globalAlert.showError(error instanceof Error ? error.message : '保存失败', '角色保存失败')
  }
}

async function deleteCharacter(index: number) {
  if (!props.editable || !props.projectId) return
  const name = characters.value[index]?.name?.trim() || '该角色'
  const confirmed = await globalAlert.showConfirm(`确定删除「${name}」吗？此操作不可撤销。`, '删除角色')
  if (!confirmed) return

  const list = characters.value.filter((_, i) => i !== index)
  try {
    await NovelAPI.updateBlueprint(props.projectId, { characters: list })
    emit('asset-saved', 'characters')
    if (selectedIndex.value >= list.length) {
      selectedIndex.value = Math.max(0, list.length - 1)
    }
  } catch (error) {
    globalAlert.showError(error instanceof Error ? error.message : '删除失败', '删除角色失败')
  }
}

function emitPortraitUpdate(index: number, value: string | null) {
  if (!props.editable) return
  emit('portrait-update', { index, value })
}

function emitPortraitGenerate(index: number, prompt: string) {
  if (!props.editable) return
  emit('portrait-generate', { index, prompt })
}

async function submitCharacter(index: number) {
  if (!props.editable || !props.projectId) return
  const list = [...characters.value]
  const character = list[index]
  if (!character?.name?.trim()) {
    globalAlert.showError('请先填写角色姓名', '无法提交')
    return
  }
  try {
    const { item, character: next } = await submitCharacterToLibrary(character, {
      projectId: props.projectId,
      projectTitle: props.projectTitle,
      project: props.projectModel,
    })
    list[index] = next
    await NovelAPI.updateBlueprint(props.projectId, { characters: list })
    emit('asset-saved', 'characters')
    globalAlert.showSuccess(`「${item.title}」已存入角色库`, '提交成功')
  } catch (error) {
    globalAlert.showError(error instanceof Error ? error.message : '提交失败', '存入角色库失败')
  }
}

defineExpose({
  openAddCharacter: openCreateForm,
})
</script>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'CharactersSection',
})
</script>
