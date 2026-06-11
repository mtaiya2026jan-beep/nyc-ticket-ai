import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAYORS = [
  { name: 'Bloomberg', start: 2002, end: 2013, color: '#3B82F6' },
  { name: 'De Blasio', start: 2014, end: 2021, color: '#8B5CF6' },
  { name: 'Adams',     start: 2022, end: 2026, color: '#F59E0B' },
]

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const borough = searchParams.get('borough') || 'MANHATTAN'

  const BORO_MAP: Record<string, string> = {
    MANHATTAN: 'MANHATTAN', BROOKLYN: 'BROOKLYN',
    QUEENS: 'QUEENS', BRONX: 'BRONX', 'STATEN ISLAND': 'STATEN IS',
  }
  const boro = BORO_MAP[borough] || 'MANHATTAN'

  const { data, error } = await supabase
    .from('oath_violations_slim')
    .select('violation_date')
    .eq('viol_loc_borough', boro)
    .not('violation_date', 'is', null)
    .gte('violation_date', '2002-01-01')
    .lte('violation_date', new Date().toISOString().split('T')[0])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const monthMap: Record<string, number> = {}
  for (const row of data ?? []) {
    const d = row.violation_date?.slice(0, 7)
    if (!d) continue
    monthMap[d] = (monthMap[d] || 0) + 1
  }

  const trend = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }))

  return NextResponse.json({ trend, mayors: MAYORS })
}
