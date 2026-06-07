const BORO_MAP = {
  MANHATTAN: 'Manhattan',
  BROOKLYN: 'Brooklyn',
  QUEENS: 'Queens',
  BRONX: 'Bronx',
  'STATEN ISLAND': 'Staten Island',
}

export async function fetchEnforcementFrequency(borough, violationType) {
  const boro = BORO_MAP[borough] || 'Manhattan'
  const params = new URLSearchParams({ boro: boro, $limit: '500', $order: 'inspection_date DESC' })
  const res = await fetch('https://data.cityofnewyork.us/resource/43nn-pn8j.json?' + params)
  if (!res.ok) throw new Error('NYC API error: ' + res.status)
  return res.json()
}

export async function fetchRestaurantInspections(address) {
  const upper = address.toUpperCase()
  const w = "upper(building) || ' ' || upper(street) like '%" + upper + "%'"
  const params = new URLSearchParams({ $limit: '50', $order: 'inspection_date DESC' })
  params.set('$where', w)
  const res = await fetch('https://data.cityofnewyork.us/resource/43nn-pn8j.json?' + params)
  if (!res.ok) throw new Error('NYC Inspections API error: ' + res.status)
  return res.json()
}

export function analyzeTimePattern(data) {
  const byDayOfWeek = {}
  for (const row of data) {
    if (!row.inspection_date) continue
    const d = new Date(row.inspection_date)
    if (d.getFullYear() < 2000) continue
    const day = d.toLocaleDateString('en-US', { weekday: 'short' })
    byDayOfWeek[day] = (byDayOfWeek[day] || 0) + 1
  }
  const entries = Object.entries(byDayOfWeek)
  const peakDay = entries.length > 0 ? entries.sort((a, b) => (b[1] as number) - (a[1] as number))[0][0] : 'Mon'
  return { byDayOfWeek, peakDay }
}

export function detectClusterRisk(data) {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const recent = data.filter(r => {
    if (!r.inspection_date) return false
    const d = new Date(r.inspection_date)
    return d.getFullYear() >= 2000 && d > thirtyDaysAgo
  })
  const typeCounts = {}
  recent.forEach(r => {
    const t = r.violation_description || r.violation_code || '未知'
    typeCounts[t] = (typeCounts[t] || 0) + 1
  })
  const riskTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
  return {
    hasRisk: recent.length >= 3,
    count: recent.length,
    riskTypes: riskTypes,
    message: recent.length >= 3 ? '近30天发现 ' + recent.length + ' 次执法，存在集群风险' : null
  }
}
