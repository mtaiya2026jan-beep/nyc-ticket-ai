// 二期：执法规律分析数据接口（接口已就绪，前端展示层二期再加）

const ECB_URL = 'https://data.cityofnewyork.us/resource/6bgk-3dad.json'
const DOHMH_URL = 'https://data.cityofnewyork.us/resource/43nn-pn8j.json'

// 按地址查ECB历史违规记录
export async function fetchViolationsByAddress(address: string, limit = 200) {
  try {
    const encoded = encodeURIComponent(address.toUpperCase().trim())
    const url = `${ECB_URL}?$where=respondent_address_city='NEW YORK'&$q=${encoded}&$limit=${limit}&$order=issue_date DESC`
    const res = await fetch(url, { next: { revalidate: 86400 } })
    if (!res.ok) return []
    return await res.json()
  } catch { return [] }
}

// 按街区查执法频率（用于规律分析）
export async function fetchEnforcementFrequency(borough: string, violationType?: string) {
  try {
    let url = `${ECB_URL}?$where=respondent_address_borough='${borough.toUpperCase()}'`
    if (violationType) url += ` AND violation_type='${violationType}'`
    url += `&$select=issue_date,violation_type,issuing_agency,hearing_result&$limit=500&$order=issue_date DESC`
    const res = await fetch(url, { next: { revalidate: 86400 } })
    if (!res.ok) return []
    return await res.json()
  } catch { return [] }
}

// 按地址查DOHMH餐厅检查历史
export async function fetchRestaurantInspections(address: string) {
  try {
    const encoded = encodeURIComponent(address.toUpperCase().trim())
    const url = `${DOHMH_URL}?$q=${encoded}&$limit=100&$order=inspection_date DESC`
    const res = await fetch(url, { next: { revalidate: 86400 } })
    if (!res.ok) return []
    return await res.json()
  } catch { return [] }
}

// 分析执法时间规律（返回按星期几的频率）
export function analyzeTimePattern(violations: any[]) {
  const byDayOfWeek: Record<string, number> = { Mon:0, Tue:0, Wed:0, Thu:0, Fri:0, Sat:0, Sun:0 }
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  violations.forEach(v => {
    if (v.issue_date) {
      const day = days[new Date(v.issue_date).getDay()]
      byDayOfWeek[day] = (byDayOfWeek[day] || 0) + 1
    }
  })
  const peak = Object.entries(byDayOfWeek).sort((a,b) => b[1]-a[1])[0]
  return { byDayOfWeek, peakDay: peak?.[0], peakCount: peak?.[1] }
}

// 识别跨店传染风险（某类违规近期是否集中爆发）
export function detectClusterRisk(violations: any[], days = 30) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const recent = violations.filter(v => v.issue_date && new Date(v.issue_date) > cutoff)
  const byType: Record<string, number> = {}
  recent.forEach(v => {
    const t = v.violation_type || 'unknown'
    byType[t] = (byType[t] || 0) + 1
  })
  const risks = Object.entries(byType)
    .filter(([,count]) => count >= 3)
    .sort((a,b) => b[1]-a[1])
  return { hasRisk: risks.length > 0, riskTypes: risks }
}
