import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const BORO_MAP: Record<string, string> = {
  MANHATTAN: 'MANHATTAN',
  BROOKLYN: 'BROOKLYN',
  QUEENS: 'QUEENS',
  BRONX: 'BRONX',
  'STATEN ISLAND': 'STATEN IS',
}

export async function fetchEnforcementFrequency(borough: string, violationType: string) {
  const boro = BORO_MAP[borough] || 'Manhattan'

  let query = supabase
    .from('oath_violations_slim')
    .select('violation_date, charge1_code, charge1_code_description, viol_loc_borough')
    .eq('viol_loc_borough', boro)
    .not('violation_date', 'is', null)
    .lte('violation_date', new Date().toISOString().split('T')[0])
    .order('violation_date', { ascending: false })
    .limit(5000)

  if (violationType) {
    // DOHMH uses separate table, skip OATH filter
  }

  const { data, error } = await query
  if (error) throw new Error('Supabase enforcement query error: ' + error.message)
  return data
}

export async function fetchRestaurantInspections(address: string) {
  const upper = address.toUpperCase()

  const { data, error } = await supabase
    .from('oath_violations_slim')
    .select('violation_date, charge1_code, charge1_code_description, viol_loc_borough, respondent_address')
    .ilike('respondent_address', '%' + upper + '%')
    .order('violation_date', { ascending: false })
    .limit(50)

  if (error) throw new Error('Supabase inspections query error: ' + error.message)
  return data
}

export function analyzeTimePattern(data: any[]) {
  const byDayOfWeek: Record<string, number> = {}
  for (const row of data) {
    if (!row.violation_date) continue
    const d = new Date(row.violation_date)
    if (d.getFullYear() < 2000 || d > new Date()) continue
    const day = d.toLocaleDateString('en-US', { weekday: 'short' })
    byDayOfWeek[day] = (byDayOfWeek[day] || 0) + 1
  }
  const entries = Object.entries(byDayOfWeek)
  const peakDay = entries.length > 0
    ? entries.sort((a, b) => (b[1] as number) - (a[1] as number))[0][0]
    : 'Mon'
  return { byDayOfWeek, peakDay }
}

export function detectClusterRisk(data: any[]) {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const recent = data.filter(r => {
    if (!r.violation_date) return false
    const d = new Date(r.violation_date)
    return d.getFullYear() >= 2000 && d > thirtyDaysAgo
  })
  const typeCounts: Record<string, number> = {}
  recent.forEach(r => {
    const t = r.charge1_code_description || r.charge1_code || '未知'
    typeCounts[t] = (typeCounts[t] || 0) + 1
  })
  const riskTypes = Object.entries(typeCounts)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 5)
  return {
    hasRisk: recent.length >= 3,
    count: recent.length,
    riskTypes,
    message: recent.length >= 3 ? '近30天发现 ' + recent.length + ' 次执法，存在集群风险' : null,
  }
}

// =============================================
// DOHMH 餐厅卫生 Top 10 违规分析
// =============================================
export async function getDohmhTopViolations(
  boro?: string,
  days: number = 730
): Promise<{ code: string; description: string; count: number }[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split('T')[0]

  let query = supabase
    .from('dohmh_inspections')
    .select('violation_code, violation_description')
    .not('violation_code', 'is', null)
    .gte('inspection_date', sinceStr)
    .lte('inspection_date', new Date().toISOString().split('T')[0])
    .limit(10000)

  if (boro) query = query.eq('boro', boro.toUpperCase())

  const { data, error } = await query
  if (error || !data) return []

  const map = new Map<string, { description: string; count: number }>()
  for (const row of data) {
    const key = row.violation_code!
    const existing = map.get(key)
    if (existing) {
      existing.count++
    } else {
      map.set(key, { description: row.violation_description || key, count: 1 })
    }
  }

  return [...map.entries()]
    .map(([code, v]) => ({ code, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
}
