import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { violations, questionnaire = {}, business_name } = await req.json()

    if (!violations || violations.length === 0) {
      return NextResponse.json({ error: '缺少违规信息' }, { status: 400 })
    }

    // 每个违规代码查询败诉案例
    const violationData: any[] = []
    for (const v of violations) {
      const code = v.violation_code
      // 查询该违规代码的败诉案例（guilty/sustained）
      const { data: sustainedCases } = await supabase
        .from('hearing_cases')
        .select('hearing_result, penalty_imposed, charge_1_code_description, charge_2_code_description, charge_3_code_description')
        .or(`charge_1_code_description.ilike.%${code}%,charge_2_code_description.ilike.%${code}%,charge_3_code_description.ilike.%${code}%`)
        .or('hearing_result.ilike.%guilty%,hearing_result.ilike.%sustained%,hearing_result.ilike.%violation%')
        .not('hearing_result', 'ilike', '%not guilty%')
        .not('hearing_result', 'ilike', '%dismiss%')
        .limit(20)

      // 查询撤销案例作为对比
      const { data: dismissedCases } = await supabase
        .from('hearing_cases')
        .select('hearing_result, penalty_imposed, charge_1_code_description')
        .or(`charge_1_code_description.ilike.%${code}%,charge_2_code_description.ilike.%${code}%`)
        .or('hearing_result.ilike.%not guilty%,hearing_result.ilike.%dismiss%,hearing_result.ilike.%withdrawn%')
        .limit(10)

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
${sustainedSample || '无数据'}
撤销案例样本（共${vd.dismissedCases.length}条）：
${dismissedSample || '无数据'}
`
    }).join('\n')

    // 问卷信息摘要
    const questionnaireNote = Object.keys(questionnaire).length > 0 ? `
【当事人情况】
- 违规记录：${questionnaire['priorViolations'] || '未填'}
- 整改情况：${questionnaire['immediatelyRemediated'] || '未填'}
- 出席听证：${questionnaire['willingToAttend'] || '未填'}
- 检查方式：${questionnaire['inspectionType'] || '未填'}
- 程序瑕疵：检查员出示证件=${questionnaire['inspectorShowedId'] || '未填'}，给予陈述机会=${questionnaire['allowedToSpeak'] || '未填'}
` : ''

    const systemPrompt = `你是纽约市OATH听证程序的资深辩护顾问，专门帮助餐饮商户准备听证会。
基于真实历史案例数据，生成针对性的听证准备手册。手册必须实用、具体、可操作。`

    const userPrompt = `基于以下历史案例数据和当事人情况，生成一份完整的【听证准备手册】。

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
- 全文不得出现律师姓名或律所信息`

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
