export async function callClaude(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  imageBase64?: string
): Promise<string> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: false })

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
    const res = await client.messages.create({
      model,
      max_tokens: 16384, // Safe limit that works across all models
      system: systemPrompt,
      messages: [{ role: 'user', content }],
    })
    return (res.content[0] as any)?.text ?? ''
  } catch (e: any) {
    // Friendly rate limit message
    if (e?.status === 429 || e?.message?.includes('rate limit') || e?.message?.includes('overloaded')) {
      throw new Error('Claude rate limit hit (free tier: 5 req/min). Wait 60 seconds and try again, or switch to Groq.')
    }
    if (e?.status === 401 || e?.message?.includes('authentication')) {
      throw new Error('Invalid Claude API key. Check your key at console.anthropic.com')
    }
    if (e?.status === 400 && e?.message?.includes('max_tokens')) {
      throw new Error('Claude output limit exceeded. Try a shorter prompt or switch to Groq.')
    }
    throw e
  }
}
