<!-- AIMETA P=角色区_角色信息展示|R=角色分栏|NR=不含编辑功能|E=component:CharactersSection|X=ui|A=角色组件|D=vue|S=dom|RD=./README.ai -->
<template>
  <div class="nd-split-page">
    <DetailEmptyState
      v-if="!characters.length"
      class="nd-split-page__empty"
      :title="t('novelDetail.characters.emptyTitle')"
      :description="t('novelDetail.characters.emptyDesc')"
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
        :aria-label="t('novelDetail.characters.listAria')"
      >
        <button
          v-if="editable"
          type="button"
          class="nd-split-page__list-add md-ripple"
          @click="openCreateForm"
        >
          <Plus :size="16" aria-hidden="true" />
          <span>{{ t('novelDetail.characters.addCharacter') }}</span>
        </button>
        <div class="nd-split-page__list-head">
          <h3 class="nd-split-page__list-title">{{ t('novelDetail.characters.listTitle') }}</h3>
          <span class="nd-split-page__list-count">{{ t('novelDetail.characters.count', { count: characters.length }) }}</span>
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
                  <span v-else>{{ (character.name || t('novelDetail.common.characterFallback')).slice(0, 1) }}</span>
                </span>
                <span class="nd-char-list-btn__body">
                  <span class="nd-char-list-btn__name">{{ character.name || t('novelDetail.common.unnamedCharacter') }}</span>
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
          :aria-label="t('novelDetail.characters.openListAria')"
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
                :label="t('novelDetail.characters.portraitLabel', { name: selectedCharacter.name || t('novelDetail.common.unnamedCharacter') })"
                :placeholder="t('novelDetail.characters.portraitPlaceholder')"
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
                  <h3 class="nd-char-detail__name">{{ selectedCharacter.name || t('novelDetail.common.unnamedCharacter') }}</h3>
                </DetailEditableZone>
                <SubmitToLibraryButton
                  v-if="editable"
                  compact
                  :label="t('novelDetail.characters.saveToLibrary')"
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
                  {{ editable ? t('novelDetail.characters.identityEmpty') : t('novelDetail.characters.identityPending') }}
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
                  {{ t('novelDetail.characters.descriptionEmpty') }}
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
                  {{ selectedCharacter[field.key] || (editable ? t('novelDetail.common.clickToFill') : '—') }}
                </dd>
              </div>
            </DetailEditableZone>
          </dl>
          <DetailEmptyState
            v-else
            compact
            :title="t('novelDetail.characters.settingsEmptyTitle')"
            :description="t('novelDetail.characters.settingsEmptyDesc')"
          />

          <section v-if="characterRelations.length" class="nd-char-detail__relations">
            <h4 class="nd-char-detail__relations-title">{{ t('novelDetail.characters.relationsTitle') }}</h4>
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
import { Plus } from 'lucide-vue-next'
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
import { useI18n } from '@renderer/composables/useI18n'
import { randomUUID } from '@renderer/utils/id'

const { t } = useI18n()

const settingFields = computed((): Array<{ key: CharacterFieldKey; label: string }> => [
  { key: 'personality', label: t('novelDetail.characters.fields.personality') },
  { key: 'goals', label: t('novelDetail.characters.fields.goals') },
  { key: 'abilities', label: t('novelDetail.characters.fields.abilities') },
  { key: 'relationship_to_protagonist', label: t('novelDetail.characters.fields.relationshipToProtagonist') },
])

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
        peer: isFrom ? (rel.character_to || t('novelDetail.common.unknown')) : (rel.character_from || t('novelDetail.common.unknown')),
        type: rel.relationship_type || t('novelDetail.common.relationUndefined'),
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
    { id: 'edit', label: t('novelDetail.common.edit'), onClick: () => openEditAll(index) },
    { id: 'delete', label: t('novelDetail.common.delete'), onClick: () => void deleteCharacter(index) },
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
    globalAlert.showError(error instanceof Error ? error.message : t('novelDetail.common.saveFailed'), t('novelDetail.characters.saveFailed'))
  }
}

async function deleteCharacter(index: number) {
  if (!props.editable || !props.projectId) return
  const name = characters.value[index]?.name?.trim() || t('novelDetail.characters.thisCharacter')
  const confirmed = await globalAlert.showConfirm(t('novelDetail.common.confirmDelete', { name }), t('novelDetail.characters.deleteTitle'))
  if (!confirmed) return

  const list = characters.value.filter((_, i) => i !== index)
  try {
    await NovelAPI.updateBlueprint(props.projectId, { characters: list })
    emit('asset-saved', 'characters')
    if (selectedIndex.value >= list.length) {
      selectedIndex.value = Math.max(0, list.length - 1)
    }
  } catch (error) {
    globalAlert.showError(error instanceof Error ? error.message : t('novelDetail.common.deleteFailed'), t('novelDetail.characters.deleteFailed'))
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
    globalAlert.showError(t('novelDetail.characters.nameRequired'), t('novelDetail.characters.cannotSubmit'))
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
    globalAlert.showSuccess(t('novelDetail.characters.librarySuccess', { title: item.title }), t('novelDetail.common.submitSuccess'))
  } catch (error) {
    globalAlert.showError(error instanceof Error ? error.message : t('novelDetail.common.submitFailed'), t('novelDetail.characters.libraryFailed'))
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
