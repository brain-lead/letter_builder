export async function callGroq(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  imageBase64?: string
): Promise<string> {
  const Groq = (await import('groq-sdk')).default
  const client = new Groq({ apiKey, dangerouslyAllowBrowser: false })

  const content: any[] = []

  if (imageBase64) {
    let mediaType = 'image/jpeg'
    if (imageBase64.startsWith('iVBOR')) mediaType = 'image/png'
    else if (imageBase64.startsWith('R0lGOD')) mediaType = 'image/gif'
    else if (imageBase64.startsWith('UklGR')) mediaType = 'image/webp'

    content.push({
      type: 'image_url',
      image_url: { url: `data:${mediaType};base64,${imageBase64}` },
    })
  }

  content.push({ type: 'text', text: userPrompt })

  const res = await client.chat.completions.create({
    model,
    max_tokens: model.includes('scout') ? 8192 : 16384,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content },
    ],
  })
  return res.choices[0]?.message?.content ?? ''
}
