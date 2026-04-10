export async function callClaude(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 16384,
  imageBase64?: string
): Promise<string> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: false, timeout: 120_000 })

  const content: any[] = []

  if (imageBase64) {
    let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg'
    if (imageBase64.startsWith('iVBOR')) mediaType = 'image/png'
    else if (imageBase64.startsWith('R0lGOD')) mediaType = 'image/gif'
    else if (imageBase64.startsWith('UklGR')) mediaType = 'image/webp'
    content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } })
  }

  content.push({ type: 'text', text: userPrompt })

  try {
    const stream = await client.messages.stream({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content }],
    })
    const response = await stream.finalMessage()
    return (response.content[0] as any)?.text ?? ''
  } catch (e: any) {
    if (e?.name === 'AbortError' || e?.message?.includes('timed out') || e?.message?.includes('timeout')) {
      throw new Error('Claude took too long to respond. Try a simpler request or switch to Groq.')
    }
    if (e?.status === 429 || e?.message?.includes('rate limit')) {
      throw new Error('Claude rate limit hit. Wait 60 seconds and try again, or switch to Groq.')
    }
    if (e?.status === 401 || e?.message?.includes('authentication')) {
      throw new Error('Invalid Claude API key. Check your key at console.anthropic.com')
    }
    if (e?.status === 529 || e?.message?.includes('overloaded')) {
      throw new Error('Claude is overloaded. Wait a moment and try again.')
    }
    throw new Error(e?.message || 'Claude API error')
  }
}
