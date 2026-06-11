import React, { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, 
  PieChart, Pie, Legend
} from 'recharts';
import { useAppContext } from '../AppContext';
import { apiFetch } from '../utils/api';

// Shared hook to parse and memoize charts data from active session
export const useChartData = () => {
  const { cleanedData } = useAppContext();

  return useMemo(() => {
    let barData = [];
    let pieData = [];

    // Fallback Demo Data for Hackathon
    const demoBarData = [
      { name: 'Chetpet Camp', affected: 1200 },
      { name: 'Velachery', affected: 850 },
      { name: 'Tambaram', affected: 400 },
      { name: 'Guindy', affected: 250 },
    ];
    
    const demoPieData = [
      { name: 'Water', value: 450, color: '#0088FE' },
      { name: 'Food', value: 300, color: '#00C49F' },
      { name: 'Medical', value: 200, color: '#FFBB28' },
      { name: 'Blankets', value: 150, color: '#FF8042' },
    ];

    return { bar: demoBarData, pie: demoPieData };
  }, []);
};

export const AffectedPopulationChart = () => {
  const { sessionData, API_BASE_URL } = useAppContext();
  const [chartData, setChartData] = React.useState({ bar: [], pie: [] });
  const sessionId = sessionData || localStorage.getItem('crisisgrid_session');

  React.useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    apiFetch(`${API_BASE_URL}/data/${sessionId}?limit=500`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        const rawDocs = data.rows || [];
        if (rawDocs.length === 0) return;

        const locationCounts = {};
        rawDocs.forEach(row => {
          const locKey = Object.keys(row).find(k => k.toLowerCase().includes('district') || k.toLowerCase().includes('village') || k.toLowerCase().includes('location') || k.toLowerCase().includes('camp'));
          if (locKey && row[locKey]) {
            const loc = row[locKey];
            const numKey = Object.keys(row).find(k => k.toLowerCase().includes('affected') || k.toLowerCase().includes('quantity'));
            const val = numKey && !isNaN(row[numKey]) ? Number(row[numKey]) : 1;
            locationCounts[loc] = (locationCounts[loc] || 0) + val;
          }
        });

        let barData = [];
        Object.keys(locationCounts).slice(0, 5).forEach(loc => {
          barData.push({ name: String(loc).substring(0, 15), affected: locationCounts[loc] });
        });
        if (barData.length > 0) setChartData(prev => ({ ...prev, bar: barData }));
      });
    return () => { cancelled = true; };
  }, [sessionId, API_BASE_URL]);

  const defaultData = useChartData();
  const displayData = chartData.bar.length > 0 ? chartData.bar : defaultData.bar;

  return (
    <div className="chart-card" style={{ background: 'var(--clr-surface)', border: '1px solid var(--glass-border)', borderRadius: '16px', padding: '1.5rem', boxShadow: 'var(--shadow-sm)', width: '100%' }}>
      <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem', fontWeight: 600, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
        <i className="ph-fill ph-users-three text-primary"></i> Affected Population
      </h3>
      <p style={{ color: 'var(--clr-text-muted)', fontSize: '0.75rem', marginTop: '0.2rem', marginBottom: '1rem' }}>Civilians affected by relief hotspot locations.</p>
      <div style={{ width: '100%', height: 250 }}>
        <ResponsiveContainer>
          <BarChart data={displayData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--clr-text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--clr-text-muted)' }} axisLine={false} tickLine={false} />
            <Tooltip 
              cursor={{ fill: 'var(--clr-border)', opacity: 0.4 }}
              contentStyle={{ background: 'var(--clr-bg)', borderRadius: '8px', border: '1px solid var(--clr-border)', color: 'var(--clr-text)' }}
            />
            <Bar dataKey="affected" radius={[4, 4, 0, 0]}>
              {displayData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill="var(--clr-primary)" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// 2. Inventory Breakdown Chart (Pie Chart) - Default Export
const InventoryBreakdownChart = () => {
  const { sessionData, API_BASE_URL } = useAppContext();
  const [chartData, setChartData] = React.useState({ pie: [] });
  const sessionId = sessionData || localStorage.getItem('crisisgrid_session');

  React.useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    apiFetch(`${API_BASE_URL}/data/${sessionId}?limit=500`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        const rawDocs = data.rows || [];
        if (rawDocs.length === 0) return;

        const categoryCounts = {};
        rawDocs.forEach(row => {
          const itemKey = Object.keys(row).find(k => k.toLowerCase() === 'item' || k.toLowerCase() === 'category' || k.toLowerCase().includes('need'));
          if (itemKey && row[itemKey]) {
            const item = row[itemKey];
            const numKey = Object.keys(row).find(k => k.toLowerCase().includes('quantity') || k.toLowerCase().includes('amount'));
            const val = numKey && !isNaN(row[numKey]) ? Number(row[numKey]) : 1;
            categoryCounts[item] = (categoryCounts[item] || 0) + val;
          }
        });

        let pieData = [];
        const colors = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#a855f7'];
        Object.keys(categoryCounts).slice(0, 5).forEach((item, idx) => {
          pieData.push({ name: String(item), value: categoryCounts[item], color: colors[idx % colors.length] });
        });

        if (pieData.length > 0) setChartData({ pie: pieData });
      });
    return () => { cancelled = true; };
  }, [sessionId, API_BASE_URL]);

  const defaultData = useChartData();
  const displayData = chartData.pie.length > 0 ? chartData.pie : defaultData.pie;

  return (
    <div className="chart-card" style={{ background: 'var(--clr-surface)', border: '1px solid var(--glass-border)', borderRadius: '16px', padding: '1.5rem', boxShadow: 'var(--shadow-sm)', width: '100%' }}>
      <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem', fontWeight: 600, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
        <i className="ph-fill ph-package text-success"></i> Inventory Breakdown
      </h3>
      <p style={{ color: 'var(--clr-text-muted)', fontSize: '0.75rem', marginTop: '0.2rem', marginBottom: '1rem' }}>Distribution of current supply stocks by item category.</p>
      <div style={{ width: '100%', height: 250 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={displayData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
              stroke="none"
            >
              {displayData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ background: 'var(--clr-bg)', borderRadius: '8px', border: '1px solid var(--clr-border)', color: 'var(--clr-text)' }}
              itemStyle={{ color: 'var(--clr-text)' }}
            />
            <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px', color: 'var(--clr-text)' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default InventoryBreakdownChart;
