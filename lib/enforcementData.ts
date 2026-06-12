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

const DOB_BORO_MAP: Record<string, string> = {
  MANHATTAN: '1', BRONX: '2', BROOKLYN: '3', QUEENS: '4', 'STATEN ISLAND': '5',
}

const DOHMH_BORO_MAP: Record<string, string> = {
  MANHATTAN: 'Manhattan', BROOKLYN: 'Brooklyn', QUEENS: 'Queens',
  BRONX: 'Bronx', 'STATEN ISLAND': 'Staten Island',
}

export async function fetchEnforcementFrequency(borough: string, violationType?: string) {
  const boro = BORO_MAP[borough] || 'MANHATTAN'
  const { data, error } = await supabase
    .from('oath_violations_slim')
    .select('hearing_date, charge1_code, charge1_code_description, viol_loc_borough')
    .eq('viol_loc_borough', boro)
    .not('hearing_date', 'is', null)
    .lte('hearing_date', new Date().toISOString().split('T')[0])
    .order('hearing_date', { ascending: false })
    .limit(500)
  if (error) throw new Error('fetchEnforcementFrequency error: ' + error.message)
  return data ?? []
}

export async function fetchRestaurantInspections(address: string) {
  const upper = address.toUpperCase()
  const { data, error } = await supabase
    .from('oath_violations_slim')
    .select('hearing_date, charge1_code, charge1_code_description, viol_loc_borough, viol_loc_house_no, viol_loc_street_name')
    .ilike('viol_loc_street_name', '%' + upper + '%')
    .order('hearing_date', { ascending: false })
    .limit(50)
  if (error) throw new Error('fetchRestaurantInspections error: ' + error.message)
  return data ?? []
}

export function analyzeTimePattern(data: any[]) {
  const byDayOfWeek: Record<string, number> = {}
  for (const row of data) {
    const dateStr = row.hearing_date || row.violation_date
    if (!dateStr) continue
    const d = new Date(dateStr)
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
    const dateStr = r.hearing_date || r.violation_date
    if (!dateStr) return false
    const d = new Date(dateStr)
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

// DOHMH
export async function getDohmhTopViolations(boro?: string): Promise<{ code: string; description: string; count: number }[]> {
  let query = supabase.from('dohmh_inspections').select('violation_code, violation_description').not('violation_code', 'is', null).limit(100000)
  if (boro) query = query.eq('boro', DOHMH_BORO_MAP[boro] || boro)
  const { data, error } = await query
  if (error || !data) return []
  const map = new Map<string, { description: string; count: number }>()
  for (const row of data) {
    const key = row.violation_code!
    const ex = map.get(key)
    if (ex) { ex.count++ } else { map.set(key, { description: row.violation_description || key, count: 1 }) }
  }
  return Array.from(map.entries()).map(([code, v]) => ({ code, ...v })).sort((a, b) => b.count - a.count).slice(0, 10)
}

// DOB
export async function getDobTopViolations(boro?: string): Promise<{ code: string; description: string; count: number }[]> {
  let query = supabase.from('dob_ecb_violations').select('violation_type, violation_description').not('violation_type', 'is', null).limit(100000)
  if (boro) query = query.eq('boro', DOB_BORO_MAP[boro] || '1')
  const { data, error } = await query
  if (error || !data) return []
  const map = new Map<string, { description: string; count: number }>()
  for (const row of data) {
    const key = row.violation_type!
    const ex = map.get(key)
    if (ex) { ex.count++ } else { map.set(key, { description: row.violation_description || key, count: 1 }) }
  }
  return Array.from(map.entries()).map(([code, v]) => ({ code, ...v })).sort((a, b) => b.count - a.count).slice(0, 10)
}

// DCA
export async function getDcaTopViolations(boro?: string): Promise<{ code: string; description: string; count: number }[]> {
  let query = supabase.from('dca_inspections').select('inspection_type, inspection_status').not('inspection_type', 'is', null).limit(100000)
  if (boro) query = query.eq('borough', DOHMH_BORO_MAP[boro] || boro)
  const { data, error } = await query
  if (error || !data) return []
  const map = new Map<string, { description: string; count: number }>()
  for (const row of data) {
    const key = row.inspection_type!
    const ex = map.get(key)
    if (ex) { ex.count++ } else { map.set(key, { description: row.inspection_status || key, count: 1 }) }
  }
  return Array.from(map.entries()).map(([code, v]) => ({ code, ...v })).sort((a, b) => b.count - a.count).slice(0, 10)
}

export async function fetchDobFrequency(borough: string) {
  const boro = DOB_BORO_MAP[borough] || '1'
  // issue_date 存储格式为 YYYYMMDD（如 '20260428'），无法直接 ORDER BY（无索引会超时）
  // 用近4年范围过滤代替排序，再在 JS 侧转换为 ISO 格式供 analyzeTimePattern/detectClusterRisk 使用
  const fourYearsAgo = new Date()
  fourYearsAgo.setFullYear(fourYearsAgo.getFullYear() - 4)
  const cutoff = fourYearsAgo.toISOString().slice(0, 10).replace(/-/g, '') // 'YYYYMMDD'
  const { data, error } = await supabase
    .from('dob_ecb_violations')
    .select('issue_date, violation_type, violation_description, boro')
    .eq('boro', boro)
    .not('issue_date', 'is', null)
    .gte('issue_date', cutoff)
    .limit(500)
  if (error) throw new Error('fetchDobFrequency error: ' + error.message)
  return (data ?? []).map(row => {
    const d = row.issue_date ?? ''
    const isoDate = d.length === 8
      ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
      : d
    return {
      ...row,
      violation_date: isoDate,
      charge1_code_description: row.violation_description || row.violation_type,
    }
  })
}

export async function fetchDcaFrequency(borough: string) {
  const boro = DOHMH_BORO_MAP[borough] || 'Manhattan'
  const { data, error } = await supabase
    .from('dca_inspections')
    .select('date_of_occurrence, inspection_type, inspection_status, borough')
    .eq('borough', boro)
    .not('date_of_occurrence', 'is', null)
    .order('date_of_occurrence', { ascending: false })
    .limit(500)
  if (error) throw new Error('fetchDcaFrequency error: ' + error.message)
  return (data ?? []).map(row => ({
    ...row,
    violation_date: row.date_of_occurrence,
    charge1_code_description: row.inspection_type || row.inspection_status,
  }))
}

export async function fetchDsnyFrequency(borough: string) {
  const { data, error } = await supabase
    .from('dsny_violations')
    .select('violation_date, charge_1_code, charge_1_code_description, violation_location_borough')
    .eq('violation_location_borough', borough)
    .not('violation_date', 'is', null)
    .order('violation_date', { ascending: false })
    .limit(500)
  if (error) throw new Error('fetchDsnyFrequency error: ' + error.message)
  return (data ?? []).map(row => ({
    ...row,
    charge1_code_description: row.charge_1_code_description || row.charge_1_code,
  }))
}

export async function fetchOathTrends(borough: string): Promise<{
  trend: { month: string; count: number }[]
  mayors: { name: string; start: number; end: number; color: string }[]
}> {
  const res = await fetch(`/api/enforcement-trends?borough=${encodeURIComponent(borough)}`)
  if (!res.ok) throw new Error('fetchOathTrends error: ' + res.status)
  return res.json()
}

// DSNY
export async function getDsnyTopViolations(boro?: string): Promise<{ code: string; description: string; count: number }[]> {
  let query = supabase.from('dsny_violations').select('charge_1_code, charge_1_code_description').not('charge_1_code', 'is', null).limit(100000)
  if (boro) query = query.eq('violation_location_borough', boro)
  const { data, error } = await query
  if (error || !data) return []
  const map = new Map<string, { description: string; count: number }>()
  for (const row of data) {
    const key = row.charge_1_code!
    const ex = map.get(key)
    if (ex) { ex.count++ } else { map.set(key, { description: row.charge_1_code_description || key, count: 1 }) }
  }
  return Array.from(map.entries()).map(([code, v]) => ({ code, ...v })).sort((a, b) => b.count - a.count).slice(0, 10)
}
