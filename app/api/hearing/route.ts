import { NextRequest, NextResponse } from 'next/server'

const NYC_OPEN_DATA_URL = 'https://data.cityofnewyork.us/resource/jz4z-kudi.json'
const APP_TOKEN = process.env.NYC_OPEN_DATA_APP_TOKEN || ''

async function fetchCasesByCode(code: string, resultFilter: string, limit: number) {
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0]

  const queries = [1, 2, 3].map(i => {
    const params = new URLSearchParams({
      [`$where`]: `charge_${i}_code='${code}' AND hearing_date>='${oneYearAgo}' AND ${resultFilter}`,
      [`$limit`]: String(limit),
      [`$select`]: 'hearing_result,penalty_imposed,charge_1_code_description,charge_2_code_description,charge_3_code_description',
      [`$order`]: 'hearing_date DESC',
    })
    return `${NYC_OPEN_DATA_URL}?${params.toString()}`
  })

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (APP_TOKEN) headers['X-App-Token'] = APP_TOKEN

  const results = await Promise.all(
    queries.map(url =>
      fetch(url, { headers, next: { revalidate: 3600 } } as any)
        .then(r => r.ok ? r.json() : [])
        .catch(() => [])
    )
  )

  // Merge and deduplicate
  const all = results.flat()
  return all
}

export async function POST(req: NextRequest) {
  try {
    const { violations, business_name, questionnaire } = await req.json()

    if (!violations || violations.length === 0) {
      return NextResponse.json({ error: '缺少违规信息' }, { status: 400 })
    }

    const questionnaireNote = questionnaire
      ? `商户补充信息：${JSON.stringify(questionnaire)}`
      : ''

    // 每个违规代码查询败诉和撤销案例
    const violationData: any[] = []
    for (const v of violations) {
      const code = v.violation_code

      // 查败诉案例（guilty/sustained）
      const sustainedFilter = `(hearing_result ilike '%guilty%' OR hearing_result ilike '%sustained%' OR hearing_result ilike '%violation%') AND hearing_result NOT ilike '%not guilty%'`
      const sustainedCases = await fetchCasesByCode(code, sustainedFilter, 20)

      // 查撤销案例
      const dismissedFilter = `(hearing_result ilike '%not guilty%' OR hearing_result ilike '%dismiss%' OR hearing_result ilike '%withdrawn%')`
      const dismissedCases = await fetchCasesByCode(code, dismissedFilter, 10)

      violationData.push({
        code,
        description: v.description,
        sustainedCases: sustainedCases || [],
        dismissedCases: dismissedCases || [],
      })
    }

    // 构建败诉样本摘要
    const casesSummary = violationData.map(vd => {
      const sustainedSample = vd.sustainedCases.slice(0, 8).map((c: any) =>
        `败诉案例：${c.hearing_result || '维持'} | 罚款：$${c.penalty_imposed || '未知'} | 描述：${(c.charge_1_code_description || '').slice(0, 60)}`
      ).join('\n')

      const dismissedSample = vd.dismissedCases.slice(0, 5).map((c: any) =>
        `撤销案例：${c.hearing_result || '撤销'} | 描述：${(c.charge_1_code_description || '').slice(0, 60)}`
      ).join('\n')

      return `
【${vd.code}违规 — 败诉案例分析】
本次违规描述：${vd.description || '见罚单'}
败诉案例样本（共${vd.sustainedCases.length}条）：
${sustainedSample || '暂无数据'}

撤销案例样本（共${vd.dismissedCases.length}条）：
${dismissedSample || '暂无数据'}
`
    }).join('\n---\n')

    const systemPrompt = `你是一位专业的NYC行政法庭听证顾问，擅长帮助餐厅和食品企业准备DOHMH违规听证。`

    const userPrompt = `
生成一份完整的【听证准备手册】。

${casesSummary}
${questionnaireNote}
商户名称：${business_name || '申诉人'}

请生成以下内容（全文中文，专业正式）：

## 一、听证官最可能提问的问题及建议回答
针对每个违规代码，列出3-5个听证官最常问的问题，并给出具体的建议回答。
格式：
**[违规代码] Q1：[问题]**
建议回答：[具体回答，不少于50字，引用具体事实]

## 二、历史败诉的主要原因
基于历史案例，总结该类违规败诉的最常见原因（3-5条），并说明如何避免。

## 三、关键证据清单
列出听证时必须携带的证据文件（按重要性排序），并说明每项证据的作用。

## 四、听证当天注意事项
5条具体的行为建议（着装、态度、陈述方式、时间控制等）。

## 五、最有利的申诉角度
基于历史撤销案例的特征，总结本案最有胜算的1-2个核心论点。

要求：
- 所有建议必须针对本案具体违规事实，不得泛泛而谈
- 引用历史案例数据时用"历史数据显示"表述
- 全文不得出现律师姓名或律所信息
`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 4000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    })

    const data = await response.json()
    if (!response.ok) throw new Error(data.error?.message || '生成失败')

    const content = data.choices[0].message.content
    return NextResponse.json({ success: true, content })

  } catch (err: any) {
    return NextResponse.json({ error: err.message || '生成失败' }, { status: 500 })
  }
}
