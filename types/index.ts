export type AIProvider = 'groq' | 'claude'

export type AIModel = {
  id: string
  name: string
  vision?: boolean
  contextWindow: number   // max input tokens
  maxOutput: number       // max output/completion tokens
}

export const MODELS: Record<AIProvider, AIModel[]> = {
  groq: [
    { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'LLaMA 4 Scout (vision) ✨', vision: true, contextWindow: 131072, maxOutput: 8192 },
    { id: 'llama-3.3-70b-versatile', name: 'LLaMA 3.3 70B', contextWindow: 131072, maxOutput: 32768 },
    { id: 'llama-3.1-8b-instant', name: 'LLaMA 3.1 8B (fast)', contextWindow: 131072, maxOutput: 131072 },
    { id: 'moonshotai/kimi-k2-instruct', name: 'Kimi K2', contextWindow: 131072, maxOutput: 65536 },
    { id: 'qwen/qwen3-32b', name: 'Qwen3 32B', contextWindow: 131072, maxOutput: 40960 },
    { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', contextWindow: 131072, maxOutput: 65536 },
    { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', contextWindow: 131072, maxOutput: 65536 },
  ],
  claude: [
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 ✨', vision: true, contextWindow: 1000000, maxOutput: 128000 },
    { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', vision: true, contextWindow: 1000000, maxOutput: 64000 },
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', vision: true, contextWindow: 1000000, maxOutput: 64000 },
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6 (powerful)', vision: true, contextWindow: 1000000, maxOutput: 128000 },
    { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5', vision: true, contextWindow: 200000, maxOutput: 64000 },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5 (fast)', vision: true, contextWindow: 200000, maxOutput: 64000 },
  ],
}

// Rough token estimation: ~4 chars per token for English/HTML
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// Calculate how much context we can send given model limits
export function getContextBudget(provider: AIProvider, modelId: string, systemPromptTokens: number): {
  model: AIModel
  totalContext: number
  maxOutput: number
  availableForInput: number  // context - system prompt - output reservation
} {
  const model = MODELS[provider].find((m) => m.id === modelId) ?? MODELS[provider][0]
  const availableForInput = model.contextWindow - systemPromptTokens - model.maxOutput
  return {
    model,
    totalContext: model.contextWindow,
    maxOutput: model.maxOutput,
    availableForInput: Math.max(0, availableForInput),
  }
}

// Trim HTML to fit within token budget, keeping structure intact
export function trimHtmlToFit(html: string, maxTokens: number): string {
  const estimated = estimateTokens(html)
  if (estimated <= maxTokens) return html
  // Trim from the middle — keep head and tail for structure
  const maxChars = maxTokens * 4
  const keepEach = Math.floor(maxChars / 2)
  const head = html.substring(0, keepEach)
  const tail = html.substring(html.length - keepEach)
  return head + '\n<!-- ... content trimmed to fit context window ... -->\n' + tail
}

export function getVisionModels(provider: AIProvider): AIModel[] {
  return MODELS[provider].filter((m) => m.vision)
}

export function bestVisionModel(provider: AIProvider): AIModel | undefined {
  return MODELS[provider].find((m) => m.vision)
}

export function bestModel(provider: AIProvider): AIModel {
  return MODELS[provider][0]
}
