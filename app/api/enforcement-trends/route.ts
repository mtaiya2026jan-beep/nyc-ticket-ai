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

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: currentYear - 2002 + 1 }, (_, i) => 2002 + i)

  const counts = await Promise.all(
    years.map(async year => {
      const { count } = await supabase
        .from('oath_violations_slim')
        .select('*', { count: 'exact', head: true })
        .eq('viol_loc_borough', boro)
        .gte('hearing_date', `${year}-01-01`)
        .lte('hearing_date', `${year}-12-31`)
      return { month: `${year}-01`, count: count ?? 0 }
    })
  )

  const trend = counts.filter(d => d.count > 0)

  return NextResponse.json({ trend, mayors: MAYORS })
}
