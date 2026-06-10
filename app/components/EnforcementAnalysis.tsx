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
} from '@/lib/enforcementData'

const BOROUGHS = ['MANHATTAN', 'BROOKLYN', 'QUEENS', 'BRONX', 'STATEN ISLAND']

const TABS = [
  { key: 'DOHMH', label: '🍽 卫生 DOHMH', desc: '餐厅食品安全' },
  { key: 'DOB',   label: '🏗 建筑 DOB',   desc: '建筑施工违规' },
  { key: 'DCA',   label: '📋 执照 DCA',   desc: '营业执照违规' },
  { key: 'DSNY',  label: '🗑 环卫 DSNY',  desc: '垃圾环卫违规' },
]

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

  async function runAnalysis() {
    setLoading(true)
    setError('')
    setTimePattern(null)
    try {
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
            onClick={() => { setActiveTab(tab.key); setTimePattern(null) }}
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

      {/* 结果区 */}
      {timePattern && (
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

      {!loading && !timePattern && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)', fontSize: 13 }}>
          选择街区和数据源后点击「开始分析」，查看执法规律与风险预警
        </div>
      )}
    </div>
  )
}
