<script setup lang="ts">
export type NovelSelectOption = {
  label: string
  value: string
  disabled?: boolean
}

withDefaults(
  defineProps<{
    options?: NovelSelectOption[]
    variant?: 'inline' | 'pill' | 'default'
    disabled?: boolean
    ariaLabel?: string
  }>(),
  {
    options: () => [],
    variant: 'inline',
    disabled: false,
  }
)

const model = defineModel<string>({ required: true })
</script>

<template>
  <label class="novel-select" :class="`novel-select--${variant}`">
    <select
      v-model="model"
      class="novel-select__control"
      :disabled="disabled"
      :aria-label="ariaLabel"
    >
      <slot>
        <option
          v-for="opt in options"
          :key="opt.value"
          :value="opt.value"
          :disabled="opt.disabled"
        >
          {{ opt.label }}
        </option>
      </slot>
    </select>
    <span class="novel-select__chevron" aria-hidden="true" />
  </label>
</template>

<style scoped>
.novel-select {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-width: 0;
}

.novel-select__control {
  width: 100%;
  margin: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #243066;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  padding-right: 18px;
}

.novel-select__control:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.novel-select__chevron {
  position: absolute;
  right: 0;
  top: 50%;
  width: 12px;
  height: 12px;
  pointer-events: none;
  transform: translateY(-50%);
  background: center / contain no-repeat
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2366709d' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  opacity: 0.82;
}

.novel-select--inline .novel-select__control {
  min-width: 72px;
  max-width: 132px;
  padding-left: 2px;
}

.novel-select--pill {
  height: 38px;
  padding: 0 12px 0 14px;
  border-radius: 999px;
  border: 1px solid rgba(130, 142, 207, 0.18);
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(8px);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
}

.novel-select--pill:hover {
  border-color: rgba(112, 105, 255, 0.28);
  background: rgba(255, 255, 255, 0.88);
}

.novel-select--pill:focus-within {
  border-color: rgba(91, 87, 243, 0.42);
  box-shadow: 0 0 0 3px rgba(112, 105, 255, 0.12);
}

.novel-select--pill .novel-select__control {
  font-size: 13px;
  min-width: 88px;
  padding-right: 20px;
}

.novel-select--pill .novel-select__chevron {
  right: 12px;
}

.novel-select--default {
  width: 100%;
  height: 38px;
  padding: 0 12px 0 14px;
  border-radius: 12px;
  border: 1px solid rgba(130, 142, 207, 0.18);
  background: rgba(255, 255, 255, 0.82);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.novel-select--default:focus-within {
  border-color: rgba(91, 87, 243, 0.42);
  box-shadow: 0 0 0 3px rgba(112, 105, 255, 0.12);
}

.novel-select--default .novel-select__control {
  font-size: 13.5px;
  padding-right: 22px;
}

.novel-select--default .novel-select__chevron {
  right: 12px;
}
</style>
