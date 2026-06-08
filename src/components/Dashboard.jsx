import React, { useState } from 'react';
import DashboardTabs from './DashboardTabs';
import MetricCard from './MetricCard';
import useDashboardMetrics from '../hooks/useDashboardMetrics';
import { useAppContext } from '../AppContext';
import PriorityScores from './PriorityScores';
import { AffectedPopulationChart } from './DataCharts';
import BurnDownChart from './BurnDownChart';
import { exportToPdf } from '../utils/exportPdf';
import toast from 'react-hot-toast';

const Dashboard = () => {
  const { API_BASE_URL } = useAppContext();
  const {
    user,
    metrics,
    insights,
    loadingInsights,
    floatingQuery,
    setFloatingQuery,
    openNlqIfReady,
    districts,
  } = useDashboardMetrics();

  const handleExport = () => {
    const sessionId = localStorage.getItem('crisisgrid_session');
    if (sessionId) {
      window.open(`${API_BASE_URL}/export/${sessionId}`, '_blank');
    }
  };

  if (!user) {
    return null;
  }

  return (
    <section id="screen-dashboard" className="screen active with-nav fade-in dashboard-premium">
      <div className="dashboard-wrapper header-offset">
        
        <div className="main-content-panel" id="dashboard-content">
          <div className="flex justify-between items-center mb-4" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', marginTop: '10px' }}>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--clr-text)' }}>Overview</h2>
            <button className="btn primary" onClick={handleExport}>
              <i className="ph ph-download-simple"></i> Export Cleaned Data
            </button>
          </div>
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
            <div className="data-quality-alerts mt-6">
              <h3 className="data-quality-title">
                 <i className="ph-fill ph-warning-circle"></i> Data Quality Attention Required
              </h3>
              <p className="data-quality-copy">
                 The automated cleaning pipeline dropped {metrics.droppedInvalidRows} invalid rows. Please review these sample drops below to ensure no critical data is lost.
              </p>
              <div className="data-quality-list">
                 {metrics.errorLogs.slice(0, 10).map((log, idx) => (
                   <div key={idx} className="data-quality-row">
                      <span className="data-quality-row-index">Row {log.row_index}</span>
                      <span>{log.reason}</span>
                   </div>
                 ))}
                 {metrics.errorLogs.length > 10 && (
                   <div className="data-quality-more">...and {metrics.errorLogs.length - 10} more. Export report to view all.</div>
                 )}
              </div>
            </div>
          )}

          <DashboardTabs />

          <BurnDownChart />
        </div>

        {/* Right Sidebar Column */}
        <div className="sidebar-column" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', flexShrink: 0, width: '320px' }}>
          
          {/* Priority Box */}
          <aside className="insights-sidebar" style={{ width: '100%' }}>
            <PriorityScores />
          </aside>

          {/* Insights Box */}
          <aside className="insights-sidebar" style={{ width: '100%' }}>
            <div className="sidebar-header">
              <h3><i className="ph-fill ph-sparkle text-primary"></i> AI Insights</h3>
              <span className="refresh-time">Auto-generated</span>
            </div>
            
            <div className="insight-cards-list mt-4">
              {loadingInsights ? (
                <>
                  <div className="insight-card insight-card-skeleton"></div>
                  <div className="insight-card insight-card-skeleton delay-1"></div>
                  <div className="insight-card insight-card-skeleton delay-2"></div>
                </>
              ) : insights.length > 0 ? (
                 insights.slice(0, 3).map((insight, index) => (
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

          {/* Affected Population Chart */}
          <div style={{ width: '100%', marginTop: '1rem' }}>
            <AffectedPopulationChart />
          </div>

        </div>

      </div>
    </section>
  );
};

export default Dashboard;
