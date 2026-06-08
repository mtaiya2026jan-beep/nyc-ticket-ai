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
    .order('violation_date', { ascending: false })
    .gte('violation_date', new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .limit(5000)

  if (violationType) {
    query = query.ilike('charge1_code', '%' + violationType + '%')
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
    if (d.getFullYear() < 2000) continue
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
