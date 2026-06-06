import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const {
      agency, summons_number, hearing_date, business_name, place_of_occurrence,
      violations, results,
      questionnaire = {},
      evidenceFiles = [],
      storeHistory = {}
    } = await req.json()

    if (!violations || violations.length === 0) {
      return NextResponse.json({ error: '缺少违规信息' }, { status: 400 })
    }

    // 构建每项违规的摘要
    const violationSummaries = violations.map((v: any, i: number) => {
      const r = results?.[i]?.analysis || results?.[i]
      return `
违规项 ${i+1}：代码 ${v.violation_code}
- 法规依据：${v.law_violated || '未知'}
- 违规描述：${v.description || '未知'}
- 历史撤销率：${r?.dismissRate !== null ? r?.dismissRate + '%' : '无数据'}
- AI建议策略：${r?.strategies?.join('；') || '无'}
`
    }).join('\n')

    // 第二层：问卷数据
    const questionnaireSection = Object.keys(questionnaire).length > 0 ? `
【当事人情况问卷（共${Object.keys(questionnaire).length}题）】
通用情况：
- 过去3年同类违规记录：${questionnaire['priorViolations'] || '未填'}
- 当天立即整改：${questionnaire['immediatelyRemediated'] || '未填'}
- 愿意出席听证：${questionnaire['willingToAttend'] || '未填'}
- 检查员额外陈述：${questionnaire['inspectorExtraStatement'] || '未填'}${questionnaire['inspectorExtraDetail'] ? '，内容：' + questionnaire['inspectorExtraDetail'] : ''}
- 检查方式：${questionnaire['inspectionType'] || '未填'}
- 检查时是否营业：${questionnaire['storeOpenDuringInspection'] || '未填'}
- 员工在场目击：${questionnaire['witnessEmployee'] || '未填'}
- 已联系律师：${questionnaire['hasLegalCounsel'] || '未填'}
- 当前整改状态：${questionnaire['currentRemediationStatus'] || '未填'}
- 有书面整改证明：${questionnaire['hasWrittenProof'] || '未填'}

程序瑕疵：
- 检查员出示证件：${questionnaire['inspectorShowedId'] || '未填'}
- 检查时间合理性：${questionnaire['inspectionTimeReasonable'] || '未填'}
- 给予陈述机会：${questionnaire['allowedToSpeak'] || '未填'}
- 罚单签字方式：${questionnaire['ticketSignMethod'] || '未填'}
${questionnaire['02B_offDuration'] ? `\n02B专项：关火时长=${questionnaire['02B_offDuration']}，复热情况=${questionnaire['02B_reheated']}，食品类型=${questionnaire['02B_foodType'] || '未填'}` : ''}
${questionnaire['06C_hairLocation'] ? `\n06C专项：异物位置=${questionnaire['06C_hairLocation']}，自取区=${questionnaire['06C_selfServeArea']}，防护罩=${questionnaire['06C_coverInstalled']}` : ''}
${questionnaire['10F_dustArea'] ? `\n10F专项：积灰面积=${questionnaire['10F_dustArea']}，食品接触面=${questionnaire['10F_foodContact']}，清洁记录=${questionnaire['10F_lastCleaned'] || '未填'}` : ''}
${questionnaire['2805_productTypes'] ? `\n28-05专项：商品种类=${questionnaire['2805_productTypes']}，数量=${questionnaire['2805_productCount']}，原因=${questionnaire['2805_labelReason']}，已更换=${questionnaire['2805_nowReplaced']}` : ''}
` : ''

    // 第三层：证据清单
    const evidenceSection = evidenceFiles.length > 0 ? `
【当事人已提供的实质证据文件（共${evidenceFiles.length}份）】
${evidenceFiles.map((f: any, i: number) => `${i+1}. ${f.name}（${f.type}）`).join('\n')}
请在申诉书证据清单中明确引用以上文件，标注"已附"。
` : ''

    // 第四层：本店历史
    const historySection = (storeHistory.pastViolations || storeHistory.allRemediated) ? `
【本店合规历史】
- 过去3年违规次数：${storeHistory.pastViolations || '未填'}
- 历史违规是否按时整改：${storeHistory.allRemediated || '未填'}
请在申诉书中用一段话突出本店良好合规记录，强化诚意整改形象。
` : ''

    // 证据能力评估
    const evidenceCapability = []
    if (questionnaire['hasRemedyPhotos'] === '有') evidenceCapability.push('整改对比照片')
    if (questionnaire['hasPurchaseReceipts'] === '有') evidenceCapability.push('整改设备收据')
    if (questionnaire['hasTrainingRecords'] === '有') evidenceCapability.push('员工培训记录')
    if (questionnaire['hasSupplierDocs'] === '有') evidenceCapability.push('供应商资质文件')
    if (questionnaire['hasEquipmentInvoice'] === '有') evidenceCapability.push('设备购置发票')
    if (questionnaire['hasEmployeeTestimony'] === '有') evidenceCapability.push('员工证人')
    if (evidenceFiles.length > 0) evidenceCapability.push(`已上传文件${evidenceFiles.length}份`)

    const systemPrompt = `你是一位经验丰富的纽约市行政处罚辩护律师，擅长OATH听证程序。请用专业、正式的中文起草一份完整的听证申诉书。

申诉书必须包含以下结构：
1. 【申诉人信息】
2. 【案件基本情况】
3. 【总体申诉意见】
4. 【逐项辩护意见】（针对每个违规代码分别辩护）
5. 【综合证据清单】
6. 【请求事项】
7. 【结语】

严禁占位符（XXX、[地址]等）。严禁虚构律师姓名、律师事务所、电话号码等任何联系信息——申诉书中不得出现任何律师信息，申诉人直接以商户名称出庭。每项违规辩护不少于200字，必须引用描述中的具体事实。

特别辩护指引：
【02B】必须正面回应当事人承认关火的陈述，论证属于necessary preparation短暂例外；引用NYCHC 81.09(a)；强调2小时内复热至165°F说明无主观故意；区别Everyday Gourmet案（本案已复热）。
【06C】必须正面回应头发指控，提出头发来源无法归责商户（顾客自取区）或空间布局证明无实质接触；承认短暂疏漏并强调立即整改。
【10F】承认积灰事实，强调非食品接触面无直接食品安全风险，请求最低罚款。
【28-05】不得否认违规（商品数量庞大且当场拒绝提供英文标签，否认损害可信度）；策略为：承认违规+说明历史合规+强调已全部整改+请求减轻罚款至最低额；必须提及具体商品种类和数量。`

    const userPrompt = `请为以下案件起草完整的听证申诉书：

执法机构：${agency} (Department of Health and Mental Hygiene)
传票号码：${summons_number || '未提供'}
听证日期：${hearing_date || '待定'}
商户名称：${business_name || '申诉人'}
违规地点：${place_of_occurrence || '见罚单'}

违规详情（以下每项必须逐字阅读描述，针对其中每个具体指控逐一反驳）：
${violationSummaries}
${questionnaireSection}
${evidenceSection}
${historySection}
${evidenceCapability.length > 0 ? `\n当事人可提供的证据能力：${evidenceCapability.join('、')}` : ''}

要求：
- 申诉书要有实际法律效力
- 必须将问卷中当事人的具体情况（关火时长、整改时间、证人等）直接写入辩护论点
- 程序瑕疵（如检查员未出示证件、未给陈述机会等）如存在，必须作为独立申诉理由
- 证据清单必须对应问卷中确认"有"的实质证据，不得捏造
- 本店合规历史如良好，必须在开头和结尾各提一次
- 必须针对违规描述中的每个具体事实逐一反驳（如温度数值、具体食品名称、具体位置等），不得泛泛而谈
- 引用相关法规（NYCHC等）
- 全文用中文，专业正式`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 6000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    })

    const data = await response.json()
    if (!response.ok) throw new Error(data.error?.message || '生成失败')

    const content = data.choices[0].message.content
    // 存入 pending_appeals 供付款后关联
    if (storeHistory?.sessionId && summons_number) {
      await supabase.from('pending_appeals').upsert({
        session_id: storeHistory.sessionId,
        summons_number: summons_number || '',
        appeal_text: content,
        user_id: storeHistory.userId || null,
      }, { onConflict: 'session_id' })
    }

    return NextResponse.json({ success: true, content })

  } catch (err: any) {
    return NextResponse.json({ error: err.message || '生成失败' }, { status: 500 })
  }
}
