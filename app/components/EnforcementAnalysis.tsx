'use client'
import { useState } from 'react'
import {
  fetchEnforcementFrequency,
  fetchRestaurantInspections,
  analyzeTimePattern,
  detectClusterRisk,
  getDohmhTopViolations,
  getDobTopViolations,
  getDcaTopViolations,
  getDsnyTopViolations,
  fetchOathTrends,
} from '@/lib/enforcementData'

const BOROUGHS = ['MANHATTAN', 'BROOKLYN', 'QUEENS', 'BRONX', 'STATEN ISLAND']

const TABS = [
  { key: 'DOHMH',  label: '🍽 卫生 DOHMH', desc: '餐厅食品安全' },
  { key: 'DOB',    label: '🏗 建筑 DOB',   desc: '建筑施工违规' },
  { key: 'DCA',    label: '📋 执照 DCA',   desc: '营业执照违规' },
  { key: 'DSNY',   label: '🗑 环卫 DSNY',  desc: '垃圾环卫违规' },
  { key: 'POLICY', label: '📈 政策周期 NEW',   desc: '历届市长执法趋势预测' },
]

type MayorInfo = { name: string; start: number; end: number; color: string }
type TrendPoint = { month: string; count: number }

function PolicyCycleChart({ trend, mayors, borough }: {
  trend: TrendPoint[]
  mayors: MayorInfo[]
  borough: string
}) {
  const yearMap: Record<number, number> = {}
  for (const { month, count } of trend) {
    const year = parseInt(month.slice(0, 4))
    if (year >= 2002 && year <= 2026) yearMap[year] = (yearMap[year] || 0) + count
  }
  const yearlyData = Object.entries(yearMap)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .map(([y, c]) => ({ year: parseInt(y), count: c }))

  if (yearlyData.length === 0) {
    return <div style={{ color: 'var(--text3)', fontSize: 13, padding: 20 }}>暂无趋势数据</div>
  }

  const W = 760, H = 270
  const padL = 60, padR = 20, padT = 34, padB = 46
  const chartW = W - padL - padR
  const chartH = H - padT - padB

  const minYear = yearlyData[0].year
  const maxYear = Math.max(yearlyData[yearlyData.length - 1].year, 2026)
  const span = maxYear - minYear || 1
  const maxCount = Math.max(...yearlyData.map(d => d.count))

  const xS = (y: number) => padL + ((y - minYear) / span) * chartW
  const yS = (c: number) => padT + chartH - (c / maxCount) * chartH

  const points = yearlyData.map(d => `${xS(d.year).toFixed(1)},${yS(d.count).toFixed(1)}`).join(' ')

  const last2 = yearlyData.slice(-2)
  const predicts: { year: number; count: number }[] = []
  if (last2.length === 2) {
    const slope = last2[1].count - last2[0].count
    for (let y = last2[1].year + 1; y <= 2026; y++) {
      predicts.push({ year: y, count: Math.max(0, last2[1].count + slope * (y - last2[1].year)) })
    }
  }
  const predPoints = predicts.length > 0
    ? [yearlyData[yearlyData.length - 1], ...predicts]
        .map(d => `${xS(d.year).toFixed(1)},${yS(d.count).toFixed(1)}`).join(' ')
    : ''

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({
    y: padT + chartH - f * chartH,
    label: Math.round(f * maxCount).toLocaleString(),
  }))
  const xTicks: { x: number; label: string }[] = []
  for (let y = minYear % 2 === 0 ? minYear : minYear + 1; y <= maxYear; y += 2) {
    xTicks.push({ x: xS(y), label: String(y) })
  }

  const stats = mayors.map(m => {
    const ys = yearlyData.filter(d => d.year >= m.start && d.year <= m.end)
    const avg = ys.length ? Math.round(ys.reduce((s, d) => s + d.count, 0) / ys.length) : 0
    return { ...m, avg }
  })
  const bloombergAvg = stats.find(m => m.name === 'Bloomberg')?.avg ?? 0
  const deblasioAvg  = stats.find(m => m.name === 'De Blasio')?.avg ?? 0
  const adamsYears   = yearlyData.filter(d => d.year >= 2022)
  const adamsAvg     = adamsYears.length
    ? Math.round(adamsYears.reduce((s, d) => s + d.count, 0) / adamsYears.length) : 0
  const vsBloomberg  = bloombergAvg
    ? Math.round(((adamsAvg - bloombergAvg) / bloombergAvg) * 100) : 0
  const adamsTrend   = adamsYears.length >= 2
    ? adamsYears[adamsYears.length - 1].count > adamsYears[0].count ? '上升' : '下降'
    : '稳定'
  const nextYearEst  = predicts[0]?.count ? Math.round(predicts[0].count).toLocaleString() : null

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {mayors.map(m => {
          const x1 = xS(Math.max(m.start, minYear))
          const x2 = xS(Math.min(m.end + 1, maxYear + 1))
          return (
            <rect key={m.name} x={x1} y={padT} width={Math.max(0, x2 - x1)} height={chartH}
              fill={m.color} fillOpacity={0.1} />
          )
        })}

        {yTicks.map(t => (
          <line key={t.y} x1={padL} y1={t.y} x2={W - padR} y2={t.y}
            stroke="rgba(128,128,128,0.2)" strokeWidth={1} />
        ))}

        {predPoints && (
          <polyline points={predPoints}
            style={{ fill: 'none', stroke: 'var(--accent)', strokeWidth: 1.5, strokeDasharray: '5,4', opacity: 0.5 }} />
        )}

        <polyline points={points}
          style={{ fill: 'none', stroke: 'var(--accent)', strokeWidth: 2.5 }} />

        {yearlyData.map(d => (
          <circle key={d.year} cx={xS(d.year)} cy={yS(d.count)} r={3.5}
            style={{ fill: 'var(--accent)', stroke: 'var(--surface)', strokeWidth: 1.5 }} />
        ))}

        {yTicks.map(t => (
          <text key={t.y} x={padL - 6} y={t.y + 4} textAnchor="end"
            fontSize={9} fill="rgba(128,128,128,0.8)">{t.label}</text>
        ))}

        {xTicks.map(t => (
          <text key={t.label} x={t.x} y={H - 7} textAnchor="middle"
            fontSize={9} fill="rgba(128,128,128,0.8)">{t.label}</text>
        ))}

        {mayors.map(m => {
          const x1 = xS(Math.max(m.start, minYear))
          const x2 = xS(Math.min(m.end + 1, maxYear + 1))
          return (
            <text key={m.name + '-lbl'} x={(x1 + x2) / 2} y={padT - 10}
              textAnchor="middle" fontSize={11} fill={m.color} fontWeight="600">
              {m.name}
            </text>
          )
        })}
      </svg>

      <div style={{ display: 'flex', gap: 14, marginTop: 6, marginBottom: 20, flexWrap: 'wrap', fontSize: 12 }}>
        {mayors.map(m => (
          <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: m.color }} />
            <span style={{ color: 'var(--text2)' }}>{m.name} {m.start}–{m.end}</span>
          </div>
        ))}
        {predPoints && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="22" height="10" style={{ display: 'block' }}>
              <line x1="0" y1="5" x2="22" y2="5"
                stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="5,4" opacity="0.6" />
            </svg>
            <span style={{ color: 'var(--text2)' }}>预测趋势</span>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        {stats.map(m => (
          <div key={m.name} style={{
            background: 'var(--bg)', border: `1px solid ${m.color}40`,
            borderRadius: 10, padding: '12px 16px',
          }}>
            <div style={{ fontSize: 11, color: m.color, fontWeight: 600, marginBottom: 4 }}>
              {m.name}（{m.start}–{m.end}）
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
              {m.avg.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>年均执法次数</div>
          </div>
        ))}
      </div>

      <div style={{
        background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)',
        borderRadius: 10, padding: '14px 18px',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>
          📋 执法预测摘要 · {borough}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
          <span>• Bloomberg 时代年均 {bloombergAvg.toLocaleString()} 次，奠定执法基准。</span>
          <span>
            • De Blasio 时代年均 {deblasioAvg.toLocaleString()} 次，较 Bloomberg{' '}
            {deblasioAvg > bloombergAvg ? '增长' : '下降'}{' '}
            {Math.abs(Math.round(((deblasioAvg - bloombergAvg) / (bloombergAvg || 1)) * 100))}%。
          </span>
          <span>
            • Adams 现任年均 {adamsAvg.toLocaleString()} 次，执法力度
            {adamsTrend === '上升' ? '持续加强' : '趋于收缩'}。
            {nextYearEst ? `预计下一年约 ${nextYearEst} 次。` : ''}
          </span>
          {vsBloomberg !== 0 && (
            <span>
              • 当前执法量与 Bloomberg 基准相比{vsBloomberg > 0 ? '偏高' : '偏低'} {Math.abs(vsBloomberg)}%，
              {vsBloomberg > 0
                ? '整体监管环境趋严，建议提前合规自查。'
                : '整体监管有所松弛，仍需关注专项执法行动。'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function EnforcementAnalysis({ user }: { user: any }) {
  const [borough, setBorough] = useState('MANHATTAN')
  const [activeTab, setActiveTab] = useState('DOHMH')
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [freqData, setFreqData] = useState<any[]>([])
  const [inspData, setInspData] = useState<any[]>([])
  const [timePattern, setTimePattern] = useState<any>(null)
  const [topViolations, setTopViolations] = useState<any[]>([])
  const [clusterRisk, setClusterRisk] = useState<any>(null)
  const [error, setError] = useState('')
  const [trendData, setTrendData] = useState<TrendPoint[]>([])
  const [mayorData, setMayorData] = useState<MayorInfo[]>([])

  async function runAnalysis() {
    setLoading(true)
    setError('')
    setTimePattern(null)
    try {
      if (activeTab === 'POLICY') {
        const { trend, mayors } = await fetchOathTrends(borough)
        setTrendData(trend ?? [])
        setMayorData(mayors ?? [])
        return
      }

      let topFn: (boro: string) => Promise<any[]>
      if (activeTab === 'DOHMH') topFn = getDohmhTopViolations
      else if (activeTab === 'DOB') topFn = getDobTopViolations
      else if (activeTab === 'DCA') topFn = getDcaTopViolations
      else topFn = getDsnyTopViolations

      const [freq, insp, top] = await Promise.all([
        fetchEnforcementFrequency(borough),
        address ? fetchRestaurantInspections(address) : Promise.resolve([]),
        topFn(borough),
      ])
      setFreqData(freq ?? [])
      setInspData(insp ?? [])
      setTopViolations(top ?? [])
      setTimePattern(analyzeTimePattern(freq ?? []))
      setClusterRisk(detectClusterRisk(freq ?? []))
    } catch (e: any) {
      setError('数据加载失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const dayLabels: Record<string, string> = {
    Sun: '周日', Mon: '周一', Tue: '周二', Wed: '周三',
    Thu: '周四', Fri: '周五', Sat: '周六',
  }

  const maxDayCount = timePattern
    ? Math.max(...Object.values(timePattern.byDayOfWeek as Record<string, number>))
    : 1

  return (
    <div style={{ padding: '0 0 40px' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
          执法规律分析
        </div>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>
          基于 NYC Open Data，分析你所在街区的执法频率与时间规律，提前预判风险
        </div>
      </div>

      {/* Tab 切换 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setTimePattern(null); setTrendData([]) }}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid',
              borderColor: activeTab === tab.key ? 'var(--accent)' : 'var(--border)',
              background: activeTab === tab.key ? 'var(--accent)' : 'var(--surface)',
              color: activeTab === tab.key ? '#000' : 'var(--text2)',
              fontSize: 13, fontWeight: activeTab === tab.key ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 查询条件 */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '20px', marginBottom: 20,
      }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 160px' }}>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>街区</div>
            <select
              value={borough}
              onChange={e => setBorough(e.target.value)}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg)',
                color: 'var(--text)', fontSize: 13,
              }}
            >
              {BOROUGHS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          {activeTab !== 'POLICY' && (
            <div style={{ flex: '2 1 240px' }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>
                餐厅地址（可选，查检查历史）
              </div>
              <input
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder='如：123 MAIN ST'
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', fontSize: 13, boxSizing: 'border-box',
                }}
              />
            </div>
          )}
          <button
            onClick={runAnalysis}
            disabled={loading}
            style={{
              padding: '8px 24px', borderRadius: 8, border: 'none',
              background: loading ? 'var(--border)' : 'var(--accent)',
              color: loading ? 'var(--text3)' : '#000',
              fontSize: 13, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {loading ? '分析中...' : '开始分析'}
          </button>
        </div>
      </div>

      {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {/* 政策周期结果 */}
      {activeTab === 'POLICY' && trendData.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>
            📈 {borough} · 历届市长任期执法趋势（2002–2026）
          </div>
          <PolicyCycleChart trend={trendData} mayors={mayorData} borough={borough} />
        </div>
      )}

      {/* 其他 Tab 结果 */}
      {activeTab !== 'POLICY' && timePattern && (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>

          {/* 执法时间分布 */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>
              📅 执法时间分布（近2年）
            </div>
            {Object.entries(timePattern.byDayOfWeek as Record<string, number>).map(([day, count]) => (
              <div key={day} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: day === timePattern.peakDay ? 'var(--accent)' : 'var(--text2)' }}>
                    {dayLabels[day] || day}{day === timePattern.peakDay && ' 🔥 高峰'}
                  </span>
                  <span style={{ color: 'var(--text3)' }}>{count} 次</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: 'var(--border)' }}>
                  <div style={{
                    height: '100%', borderRadius: 4,
                    width: `${Math.round((count / maxDayCount) * 100)}%`,
                    background: day === timePattern.peakDay ? 'var(--accent)' : 'var(--text3)',
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>
            ))}
          </div>

          {/* 集群风险 */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>
              ⚠️ 近30天集群风险
            </div>
            {clusterRisk?.hasRisk ? (
              <>
                <div style={{
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 8, padding: '10px 14px', marginBottom: 12,
                  fontSize: 13, color: 'var(--red)',
                }}>
                  检测到 {clusterRisk.riskTypes.length} 类违规集中爆发，建议立即自查
                </div>
                {clusterRisk.riskTypes.map(([type, count]: [string, number]) => (
                  <div key={type} style={{
                    display: 'flex', justifyContent: 'space-between',
                    padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13,
                  }}>
                    <span style={{ color: 'var(--text2)' }}>{type}</span>
                    <span style={{ color: 'var(--red)', fontWeight: 600 }}>{count} 起</span>
                  </div>
                ))}
              </>
            ) : (
              <div style={{
                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
                borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--green)',
              }}>
                ✓ 近30天该街区无集群风险
              </div>
            )}
          </div>

          {/* Top 10 违规 */}
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 20, gridColumn: 'span 2',
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
              📊 {borough} · {TABS.find(t => t.key === activeTab)?.label} 高频违规 Top 10
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
              {TABS.find(t => t.key === activeTab)?.desc}数据
            </div>
            {topViolations.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text3)' }}>暂无数据</div>
            ) : (() => {
              const max = topViolations[0]?.count || 1
              return topViolations.map((v: any) => (
                <div key={v.code} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: 'var(--text2)' }}>{v.description || v.code}</span>
                    <span style={{ color: 'var(--text3)' }}>{v.count} 次</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--border)' }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      width: `${Math.round((v.count / max) * 100)}%`,
                      background: 'var(--accent)',
                    }} />
                  </div>
                </div>
              ))
            })()}
          </div>

          {/* 餐厅检查历史 */}
          {inspData.length > 0 && (
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 20, gridColumn: 'span 2',
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 16 }}>
                🏠 餐厅检查历史（{inspData.length} 条）
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['检查日期', '违规代码', '执法机构', '裁决结果'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text3)', fontWeight: 500 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {inspData.slice(0, 20).map((row: any, i: number) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 10px', color: 'var(--text2)' }}>{row.issue_date || '-'}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text2)' }}>{row.violation_type || '-'}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text2)' }}>{row.issuing_agency || '-'}</td>
                        <td style={{ padding: '6px 10px', color: row.hearing_result === 'GUILTY' ? 'var(--red)' : 'var(--green)' }}>
                          {row.hearing_result || '待定'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && !timePattern && (activeTab !== 'POLICY' || trendData.length === 0) && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)', fontSize: 13 }}>
          {activeTab === 'POLICY'
            ? '选择街区后点击「开始分析」，查看历届市长任期执法趋势与预测'
            : '选择街区和数据源后点击「开始分析」，查看执法规律与风险预警'}
        </div>
      )}
    </div>
  )
}
