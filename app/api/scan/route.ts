import { NextRequest, NextResponse } from 'next/server'
import { fromBuffer } from 'pdf2pic'
import mammoth from 'mammoth'

function safeParseJSON(raw: string) {
  // 1. direct parse
  try { return JSON.parse(raw) } catch {}
  // 2. strip markdown fences
  const stripped = raw.replace(/```json\n?|```/g, '').trim()
  try { return JSON.parse(stripped) } catch {}
  // 3. extract first {...} block
  const match = stripped.match(/\{[\s\S]*\}/)
  if (match) {
    try { return JSON.parse(match[0]) } catch {}
    // 4. fix trailing commas before } or ]
    const fixed = match[0].replace(/,(\s*[}\]])/g, '$1')
    try { return JSON.parse(fixed) } catch {}
    // 5. truncated JSON — try to close open structure
    const truncFixed = fixed
      .replace(/,\s*$/, '')
      .replace(/"\s*$/, '"')
    const opens = (truncFixed.match(/\[/g) || []).length - (truncFixed.match(/\]/g) || []).length
    const closes = opens > 0 ? ']'.repeat(opens) + '}' : '}'
    try { return JSON.parse(truncFixed + closes) } catch {}
  }
  throw new Error('无法解析 JSON 响应，原始内容片段：' + raw.slice(0, 200))
}

export async function POST(req: NextRequest) {
  try {
    let pages: {base64: string, mimeType: string}[] = []
    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const json = await req.json()
      pages = json.pages
    } else {
      const formData = await req.formData()
      const file = formData.get('file') as File
      if (!file) return NextResponse.json({ error: '请上传文件' }, { status: 400 })
      const bytes = await file.arrayBuffer()
      const base64 = Buffer.from(bytes).toString('base64')
      const mimeType = file.type || 'image/jpeg'
      pages = [{ base64, mimeType }]
    }

    const systemPrompt = `你是纽约市行政罚单识别专家。从罚单图片中提取所有违规项信息。
必须输出合法JSON，不得包含注释或尾部逗号：
{
  "agency": "执法机构代码，如 DOHMH、DOB、DSNY、DCA",
  "summons_number": { "value": "传票号码", "confidence": 0.95 },
  "hearing_date": { "value": "听证日期YYYY-MM-DD，没有则null", "confidence": 0.95 },
  "business_name": { "value": "商户名称，没有则null", "confidence": 0.95 },
  "place_of_occurrence": { "value": "完整地址，没有则null", "confidence": 0.95 },
  "violations": [
    {
      "line_item": 1,
      "violation_code": "违规代码如02B",
      "condition": "违规条数",
      "law_violated": "违反法规如NYCHC 81.09(a)",
      "description": "违规描述完整原文，必须逐字复制罚单上该违规项的DESCRIPTION栏全部内容，不得截断或概括"
    }
  ]
}`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      signal: AbortSignal.timeout(90000),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 4096,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              ...pages.map((p: {base64: string, mimeType: string}) => ({
                type: 'image_url' as const,
                image_url: { url: `data:${p.mimeType};base64,${p.base64}`, detail: 'high' as const }
              })),
              { type: 'text', text: '这是一张NYC行政罚单，可能有多页。识别所有违规项（violations数组），每个LINE ITEM一条记录。重要要求：1) description字段必须将每个违规项DESCRIPTION栏的全部英文原文完整复制，包括温度数值、食品名称、数量、位置、当事人陈述、案例引用等所有内容，绝对不得截断或概括；2) 如果描述跨越多页，必须拼接完整；3) 原文有多长就写多长，宁可输出太多也不能遗漏。' }
            ]
          }
        ]
      })
    })

    const data = await response.json()
    if (!response.ok) throw new Error(data.error?.message || '识别失败')
    const raw = data.choices[0].message.content
    const result = safeParseJSON(raw)
    return NextResponse.json({ success: true, result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '识别失败' }, { status: 500 })
  }
}
