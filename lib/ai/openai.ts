export async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 16384,
  imageBase64?: string
): Promise<string> {
  const OpenAI = (await import('openai')).default
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: false })

  const content: any[] = []

  if (imageBase64) {
    let mediaType = 'image/jpeg'
    if (imageBase64.startsWith('iVBOR')) mediaType = 'image/png'
    content.push({
      type: 'image_url',
      image_url: { url: `data:${mediaType};base64,${imageBase64}` },
    })
  }

  content.push({ type: 'text', text: userPrompt })

  try {
    const res = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content },
      ],
    })
    return res.choices[0]?.message?.content ?? ''
  } catch (e: any) {
    if (e?.status === 429) throw new Error('OpenAI rate limit hit. Wait and try again.')
    if (e?.status === 401) throw new Error('Invalid OpenAI API key.')
    throw e
  }
}
