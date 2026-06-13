import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { useAppContext } from '../AppContext';
import { apiFetch } from '../utils/api';
import ShareButton from './ShareButton';
import { formatBurnDown } from '../utils/shareFormatter';

const CHART_COLORS = ['#EF4444', '#F59E0B', '#E76F51', '#6366F1', '#0A6C74', '#10B981', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#06B6D4', '#84CC16', '#A855F7', '#FB923C', '#22D3EE'];

// Custom opaque tooltip
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div style={{
      background: 'var(--glass-bg)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderRadius: '12px',
      padding: '0.8rem 1rem',
      boxShadow: 'var(--shadow-md)',
      border: '1px solid var(--glass-border)',
      minWidth: '220px',
    }}>
      <p style={{ margin: '0 0 0.5rem 0', fontWeight: 700, fontSize: '0.8rem', color: 'var(--clr-text-muted)' }}>{label}</p>
      {payload.map((entry, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '0.2rem 0' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--clr-text)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color, flexShrink: 0 }}></span>
            {entry.name}
          </span>
          <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--clr-text)' }}>
            {Math.round(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

const BurnDownChart = () => {
  const { API_BASE_URL, sessionData } = useAppContext();
  const [forecasts, setForecasts] = useState([]);
  const [loading, setLoading] = useState(false);

  const sessionId = sessionData || localStorage.getItem('crisisgrid_session');

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;
    setLoading(true);

    apiFetch(`${API_BASE_URL}/forecast/${sessionId}`)
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data.forecasts) {
          const sortedForecasts = [...data.forecasts].sort((a, b) => a.days_remaining - b.days_remaining);
          setForecasts(sortedForecasts);
        }
      })
      .catch(err => console.error('Failed to fetch forecast', err))
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [sessionId, API_BASE_URL]);

  if (!sessionId) return null;

  // Use top 5 critical forecast items on the chart to prevent clutter
  const chartForecasts = forecasts.slice(0, 5);

  // Transform forecast data for Recharts
  const chartData = [];
  if (chartForecasts.length > 0) {
    const days = chartForecasts[0]?.timeline?.length || 8;
    for (let d = 0; d < days; d++) {
      const point = { day: `Day ${d}` };
      chartForecasts.forEach(f => {
        const entry = f.timeline?.[d];
        point[f.item] = entry?.projected_stock ?? 0;
      });
      chartData.push(point);
    }
  }

  const getDaysColor = (days) => {
    if (days <= 2) return '#EF4444';
    if (days <= 4) return '#F59E0B';
    return '#22C55E';
  };

  return (
    <div className="burndown-container mt-6">
      <div className="burndown-header">
        <h3 style={{ fontSize: '1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <i className="ph-fill ph-trend-down text-warning" style={{ color: '#E76F51' }}></i> 
          Resource Burn-Down Forecast
        </h3>
        <span style={{ fontSize: '0.8rem', color: 'var(--clr-text-muted)', fontWeight: 500 }}>
          7-day projection · {forecasts.length > 5 ? `Top 5 critical items` : `${forecasts.length} items`}
        </span>
      </div>

      {loading ? (
        <div className="burndown-skeleton">
          <div className="insight-card-skeleton" style={{ height: '280px', borderRadius: '12px' }}></div>
        </div>
      ) : chartForecasts.length > 0 ? (
        <>
          {/* Chart Card */}
          <div className="burndown-chart-card">
            {/* Compact legend */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem', paddingLeft: '2.5rem' }}>
              {chartForecasts.map((f, idx) => (
                <span key={f.item} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--clr-text-muted)' }}>
                  <span style={{ width: 10, height: 3, borderRadius: 2, background: CHART_COLORS[idx % CHART_COLORS.length] }}></span>
                  {f.item}
                </span>
              ))}
            </div>

            <div style={{ width: '100%', height: 260 }} role="img" aria-label="Resource Burn-Down Forecast Chart">
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 5, right: 45, left: -10, bottom: 5 }}>
                  <XAxis 
                    dataKey="day" 
                    tick={{ fontSize: 12, fill: 'var(--clr-text-muted)' }} 
                    axisLine={false} 
                    tickLine={false} 
                  />
                  <YAxis 
                    tick={{ fontSize: 12, fill: 'var(--clr-text-muted)' }} 
                    axisLine={false} 
                    tickLine={false}
                    width={45}
                    label={{ value: 'Units', angle: -90, position: 'insideLeft', offset: 15, style: { fontSize: '11px', fill: 'var(--clr-text-muted)' } }}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--clr-border)', strokeDasharray: '4 4' }} />
                  <ReferenceLine 
                    y={10} 
                    stroke="#EF4444" 
                    strokeDasharray="6 4" 
                    strokeWidth={1.5}
                    label={{ 
                      value: 'Critical', 
                      position: 'right', 
                      style: { fontSize: '11px', fill: '#EF4444', fontWeight: 600 } 
                    }} 
                  />
                  {chartForecasts.map((f, idx) => (
                    <Line
                      key={f.item}
                      type="monotone"
                      dataKey={f.item}
                      stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Days-of-Cover Pills */}
          <div className="burndown-pills">
            {forecasts.map((f, idx) => (
              <div 
                key={f.item} 
                className={`burndown-pill ${f.is_critical ? 'critical-pulse' : ''}`}
                style={{ '--pill-color': getDaysColor(f.days_remaining) }}
              >
                <div className="burndown-pill-icon" style={{ 
                  background: `${CHART_COLORS[idx % CHART_COLORS.length]}15`, 
                  color: CHART_COLORS[idx % CHART_COLORS.length] 
                }}>
                  <i className="ph-fill ph-package"></i>
                </div>
                <div className="burndown-pill-info">
                  <span className="burndown-pill-item">{f.item}</span>
                  <span className="burndown-pill-stock">{Math.round(f.current_stock)} units</span>
                </div>
                <div className="burndown-pill-days" style={{ color: getDaysColor(f.days_remaining) }}>
                  <span className="burndown-days-number">{f.days_remaining.toFixed(1)}</span>
                  <span className="burndown-days-label">days left</span>
                </div>
                <ShareButton getText={() => formatBurnDown(f)} />
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{
          background: 'var(--clr-surface)',
          border: '1px dashed var(--clr-border)',
          borderRadius: '16px',
          padding: '3rem 2rem',
          textAlign: 'center',
          marginTop: '1rem'
        }}>
          <div style={{ background: 'var(--clr-bg)', width: '56px', height: '56px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
            <i className="ph-fill ph-chart-line-down" style={{ fontSize: '1.8rem', color: 'var(--clr-text-muted)', opacity: 0.5 }}></i>
          </div>
          <h4 style={{ margin: '0 0 0.4rem 0', color: 'var(--clr-text)', fontWeight: 600 }}>No Forecast Data Available</h4>
          <p style={{ color: 'var(--clr-text-muted)', fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto' }}>
            Upload inventory data with stock quantities to generate 7-day burn-down projections.
          </p>
        </div>
      )}
    </div>
  );
};

export default BurnDownChart;
