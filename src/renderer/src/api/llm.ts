/**
 * LLM 配置 API 兼容层：桌面版通过 Platform 网关统一管理模型，此处提供空实现避免旧页面报错。
 */
import { settingsService } from '@renderer/services/app-settings'

export interface LLMConfig {
  llm_provider_url?: string
  llm_provider_api_key?: string
  llm_provider_model?: string
}

export type LLMConfigCreate = LLMConfig

export async function getLLMConfig(): Promise<LLMConfig | null> {
  const settings = await settingsService.get()
  if (!settings.defaultChatModelId) return null
  return {
    llm_provider_model: settings.defaultChatModelId,
    llm_provider_url: '',
    llm_provider_api_key: '',
  }
}

export async function createOrUpdateLLMConfig(config: LLMConfigCreate): Promise<void> {
  if (config.llm_provider_model?.trim()) {
    await settingsService.save({ defaultChatModelId: config.llm_provider_model.trim() })
  }
}

export async function deleteLLMConfig(): Promise<void> {
  await settingsService.save({ defaultChatModelId: undefined })
}

export async function getAvailableModels(_config?: LLMConfigCreate): Promise<string[]> {
  const config = await getLLMConfig()
  return config?.llm_provider_model ? [config.llm_provider_model] : []
}
