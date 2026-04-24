import React, { useEffect, useState } from 'react';
import DashboardTabs from './DashboardTabs';
import MetricCard from './MetricCard';
import { useAppContext } from '../AppContext';

const Dashboard = () => {
  const { cleanedData, sessionData, API_BASE_URL, navigate, user, loading } = useAppContext();
  const [floatingQuery, setFloatingQuery] = useState('');
  const [insights, setInsights] = useState([]);
  const [loadingInsights, setLoadingInsights] = useState(true);
  const [metrics, setMetrics] = useState({
    recordCount: 0,
    totalFixed: 0,
    removedDuplicates: 0,
    droppedInvalidRows: 0,
    errorLogs: []
  });

  useEffect(() => {
    if (!loading && !user) {
      navigate('screen-login', { silent: true });
    }
  }, [loading, navigate, user]);

  useEffect(() => {
    if (!user) return;

    // If we just uploaded, use Context data. If we refreshed the page, fetch it!
    const sessionId = sessionData || localStorage.getItem('crisisgrid_session');
    
    if (cleanedData) {
      setMetrics({
        recordCount: cleanedData.recordCount || 0,
        totalFixed: cleanedData.summary?.totalFixed || 0,
        removedDuplicates: cleanedData.summary?.removedDuplicates || 0,
        droppedInvalidRows: cleanedData.summary?.droppedInvalidRows || 0,
        errorLogs: cleanedData.summary?.error_logs || []
      });
    } else if (sessionId) {
      fetch(`${API_BASE_URL}/data/${sessionId}`)
        .then(res => res.json())
        .then(data => {
          setMetrics({
            recordCount: data.total_records || 0,
            totalFixed: data.summary?.totalFixed || 0,
            removedDuplicates: data.summary?.removedDuplicates || 0,
            droppedInvalidRows: data.summary?.droppedInvalidRows || 0,
            errorLogs: data.summary?.error_logs || []
          });
        })
        .catch(err => console.error("Failed to restore dashboard metrics", err));
    }
  }, [cleanedData, sessionData, API_BASE_URL, user]);

  useEffect(() => {
    if (!user) {
      setLoadingInsights(false);
      return;
    }

    const fetchInsights = async () => {
      const sessionId = sessionData || localStorage.getItem('crisisgrid_session');
      if (!sessionId) {
        setLoadingInsights(false);
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/insights/${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.insights && Array.isArray(data.insights)) {
            setInsights(data.insights);
          }
        }
      } catch (err) {
        console.error("Failed to fetch insights", err);
      }
      setLoadingInsights(false);
    };
    fetchInsights();
  }, [sessionData, user]);

  if (!user) {
    return null;
  }

  return (
    <section id="screen-dashboard" className="screen active with-nav fade-in">
      <div className="dashboard-wrapper header-offset">
        
        <div className="main-content-panel">
          {/* Summary Cards */}
          <div className="metric-row">
            <MetricCard 
              label="Record Count" 
              value={metrics.recordCount} 
              trendText="From latest cleaned upload" 
              trendClass="up" 
              icon="ph-trend-up"
            />
            <MetricCard 
              label="Total Fixed" 
              value={metrics.totalFixed} 
              trendText="Auto-fixed by AI pipeline" 
              trendClass="plain" 
              icon="ph-check-circle"
            />
            <MetricCard 
              label="Removed Duplicates" 
              value={metrics.removedDuplicates} 
              trendText="Duplicate rows removed" 
              trendClass="plain" 
              icon="ph-info"
            />
            <MetricCard 
              label="Dropped Invalid Rows" 
              value={metrics.droppedInvalidRows} 
              trendText="Rows with missing fields" 
              trendClass="down" 
              icon="ph-warning"
            />
          </div>
          
          {/* Surface Error Logs as Actionable Dashboard Cards */}
          {metrics.errorLogs.length > 0 && (
            <div className="data-quality-alerts mt-6" style={{ background: 'rgba(224, 92, 92, 0.05)', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(224, 92, 92, 0.2)' }}>
              <h3 style={{ color: 'var(--clr-warning)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                 <i className="ph-fill ph-warning-circle"></i> Data Quality Attention Required
              </h3>
              <p style={{ marginBottom: '1rem', color: 'var(--clr-text-muted)' }}>
                 The automated cleaning pipeline dropped {metrics.droppedInvalidRows} invalid rows. Please review these sample drops below to ensure no critical data is lost.
              </p>
              <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                 {metrics.errorLogs.slice(0, 10).map((log, idx) => (
                   <div key={idx} style={{ display: 'flex', gap: '1rem', padding: '0.5rem 0', borderBottom: '1px solid var(--clr-border)', fontSize: '0.9rem' }}>
                      <span style={{ fontWeight: 600, minWidth: '80px' }}>Row {log.row_index}</span>
                      <span>{log.reason}</span>
                   </div>
                 ))}
                 {metrics.errorLogs.length > 10 && (
                   <div style={{ padding: '0.5rem 0', fontSize: '0.9rem', color: 'var(--clr-text-muted)', fontStyle: 'italic' }}>...and {metrics.errorLogs.length - 10} more. Export report to view all.</div>
                 )}
              </div>
            </div>
          )}

          <DashboardTabs />
        </div>

        {/* Right Sidebar Insights */}
        <aside className="insights-sidebar">
          <div className="sidebar-header">
            <h3><i className="ph-fill ph-sparkle text-primary"></i> AI Insights</h3>
            <span className="refresh-time">Auto-generated</span>
          </div>
          
          <div className="insight-cards-list mt-4">
            {loadingInsights ? (
              // Skeleton loaders
              <>
                <div className="insight-card" style={{ background: 'var(--clr-bg)', height: '80px', animation: 'fadeIn 1s infinite alternate opacity' }}></div>
                <div className="insight-card" style={{ background: 'var(--clr-bg)', height: '80px', animation: 'fadeIn 1s infinite alternate opacity', animationDelay: '0.2s' }}></div>
                <div className="insight-card" style={{ background: 'var(--clr-bg)', height: '80px', animation: 'fadeIn 1s infinite alternate opacity', animationDelay: '0.4s' }}></div>
              </>
            ) : insights.length > 0 ? (
               insights.map((insight, index) => (
                 <div key={index} className="insight-card primary-light">
                    <div className="insight-icon">💡</div>
                    <p>{insight}</p>
                 </div>
               ))
            ) : (
                <div className="insight-card plain">
                  <p>No extra insights found for this dataset.</p>
                </div>
            )}
          </div>
        </aside>

      </div>

      {/* Floating Query Bar */}
      <div className="floating-query-wrap">
        <div className="floating-query-bar relative">
          <i className="ph-fill ph-sparkle spark-input-icon"></i>
          <input 
            type="text" 
            placeholder="Ask CrisisGrid anything →" 
            className="always-on-input" 
            value={floatingQuery}
            onChange={(e) => setFloatingQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && floatingQuery.trim()) {
                navigate('screen-nlq');
              }
            }}
          />
        </div>
      </div>
    </section>
  );
};

export default Dashboard;
