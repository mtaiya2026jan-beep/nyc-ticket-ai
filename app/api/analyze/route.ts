import { NextRequest, NextResponse } from 'next/server'
import { queryTicketData } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { agency, violationCode, violations, summonsNumber, hearingDate, description, mode } = await req.json()

    // ── 多代码批量分析模式 ────────────────────────────────────
    if (violations && Array.isArray(violations) && violations.length > 0) {
      const results = await Promise.all(
        violations.map(async (v: any) => {
          const code = v.violation_code?.toUpperCase().trim()
          if (!code) return null
          const dbData = await queryTicketData(agency, code)
          const dbContext = dbData
            ? `历史${dbData.total}条，撤销率${dbData.dismissRate}%，减免率${dbData.reducedRate}%，平均罚款$${dbData.avgFinalPenalty}`
            : '无历史数据'

  
        // 硬编码罚款范围对照表（DOHMH官方）
        const FINE_RANGE: Record<string, string> = {
          '02B': '$200-$2000', '02G': '$200-$2000', '02H': '$200-$2000',
          '04L': '$300-$2000', '04M': '$300-$2000', '04N': '$300-$2000',
          '06A': '$200-$2000', '06B': '$200-$2000', '06C': '$200-$2000',
          '06D': '$200-$2000', '06E': '$200-$2000', '06F': '$200-$2000',
          '08A': '$200-$2000', '10F': '$200-$2000', '10H': '$200-$2000',
          '10I': '$200-$2000', '10J': '$200-$2000',
          '15I': '$200-$2000',
          '22A': '$200-$2000',
          '28-05': '$250-$1000',
        }
        const fineRange = FINE_RANGE[code] || null

        const systemPrompt = `你是NYC Ticket AI顾问。必须用中文输出。严格输出JSON不含markdown。
格式：{"violationTitle":"英文标题","violationTitleCN":"中文说明","severity":"Critical|Major|Minor","baseFineRange":"如果提供了硬编码范围则使用，否则根据法规填写$X-Y格式","avgFinalPenalty":数字或null,"dismissRate":数字或null,"reducedRate":数字或null,"upheldRate":数字或null,"totalHistoricalCases":数字,"caseJudgment":"中文2-3句分析","strategies":["中文建议1","建议2","建议3"],"risks":[{"level":"danger|warning|ok","text":"中文说明"}],"estimatedSaving":"$X","urgentActions":"中文立即行动","remediationPlan":"基于罚单原文的具体整改步骤，必须包含实际食材/设备/商品名称"}`

          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
            body: JSON.stringify({
              model: 'gpt-4o', max_tokens: 1000,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `机构:${agency} 代码:${code} 法规:${v.law_violated||''} 描述:${v.description||''} 数据库:${dbContext} 请分析` }
              ]
            })
          })
          const aiData = await response.json()
          if (!response.ok) return null
          let analysis
          try { analysis = JSON.parse(aiData.choices[0].message.content) } catch { return null }
          if (dbData) {
            analysis.dismissRate = dbData.dismissRate
            analysis.reducedRate = dbData.reducedRate
            analysis.upheldRate = dbData.upheldRate
            analysis.totalHistoricalCases = dbData.total
            if (dbData.avgFinalPenalty) analysis.avgFinalPenalty = dbData.avgFinalPenalty
          }
          if (fineRange) analysis.baseFineRange = fineRange
          return { violation_code: code, line_item: v.line_item, law_violated: v.law_violated, description: v.description, analysis, hasDbData: !!dbData }
        })
      )
      return NextResponse.json({ success: true, multiResults: results.filter(Boolean) })
    }

    // ── 单代码分析模式（兼容旧版）────────────────────────────
    if (!agency || !violationCode) {
      return NextResponse.json({ error: '请提供机构名称和违规代码' }, { status: 400 })
    }
    const dbData = await queryTicketData(agency, violationCode)
    const dbContext = dbData
      ? `历史${dbData.total}条，撤销率${dbData.dismissRate}%，减免率${dbData.reducedRate}%，平均罚款$${dbData.avgFinalPenalty}`
      : '无历史数据'

    let systemPrompt = ''
    let userPrompt = ''

    if (mode === 'appeal') {
      systemPrompt = '你是纽约市行政处罚申诉专家。用中文生成完整听证申诉材料：1.陈述词（300字）2.主要辩护论点（3条）3.证据清单（5项）4.听证当天注意事项。'
      userPrompt = `机构:${agency} 违规:${violationCode} 数据:${dbContext}`
    } else if (mode === 'evidence') {
      systemPrompt = '你是纽约市行政处罚专家。用中文列出10项具体证据，每项说明：证据名称、获取方式、重要程度（高/中/低）。'
      userPrompt = `机构:${agency} 违规:${violationCode} 罚单描述:${description||'无'} 请根据罚单实际描述生成具体整改计划，必须包含原文提到的食材/设备/商品名称`
    } else if (mode === 'plan') {
      systemPrompt = '你是餐厅合规顾问。用中文制定详细整改计划：立即行动（24小时内）、短期整改（1周内）、长期预防（1个月内），每项列出负责人和验收标准。'
      userPrompt = `机构:${agency} 违规:${violationCode} 罚单描述:${description||'无'} 请根据罚单实际描述生成具体整改计划，必须包含原文提到的食材/设备/商品名称`
    } else {
        systemPrompt = `你是NYC Ticket AI顾问。必须用中文输出。严格JSON不含markdown。格式：{"violationTitle":"英文","violationTitleCN":"中文","severity":"Critical|Major|Minor","baseFineRange":"如果提供了硬编码范围则使用，否则根据法规填写$X-Y格式","avgFinalPenalty":数字或null,"dismissRate":数字或null,"reducedRate":数字或null,"upheldRate":数字或null,"totalHistoricalCases":数字,"caseJudgment":"中文分析","strategies":["建议1","建议2","建议3"],"risks":[{"level":"warning","text":"说明"}],"estimatedSaving":"$X","urgentActions":"行动","remediationPlan":"基于罚单原文的具体整改步骤，必须包含实际食材/设备/商品名称"}`
      userPrompt = `机构:${agency} 代码:${violationCode} 传票:${summonsNumber||'无'} 日期:${hearingDate||'无'} 描述:${description||'无'} 数据:${dbContext} 请用中文分析`
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o', max_tokens: 2000,
        ...(mode ? {} : { response_format: { type: 'json_object' } }),
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]
      })
    })
    const aiData = await response.json()
    if (!response.ok) throw new Error(aiData.error?.message || 'OpenAI调用失败')
    const rawText = aiData.choices[0].message.content

    if (mode) return NextResponse.json({ success: true, content: rawText, mode })

    let analysis
    try { analysis = JSON.parse(rawText.replace(/```json|```/g, '').trim()) }
    catch { return NextResponse.json({ error: '解析失败', raw: rawText }, { status: 500 }) }

    if (dbData) {
      analysis.dismissRate = dbData.dismissRate
      analysis.reducedRate = dbData.reducedRate
      analysis.upheldRate = dbData.upheldRate
      analysis.totalHistoricalCases = dbData.total
      if (dbData.avgFinalPenalty) analysis.avgFinalPenalty = dbData.avgFinalPenalty
    }
    return NextResponse.json({ success: true, analysis, hasDbData: !!dbData })

  } catch (err: any) {
    return NextResponse.json({ error: err.message || '服务异常' }, { status: 500 })
  }
}
