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
    <main id="screen-dashboard" className="screen active with-nav fade-in dashboard-premium" aria-label="Dashboard">
      <div className="dashboard-wrapper header-offset">
        
        <section className="main-content-panel" id="dashboard-content" aria-labelledby="dashboard-heading">
          <header className="page-header" style={{ marginBottom: '1.5rem', marginTop: '10px' }}>
            <h2 id="dashboard-heading" style={{ fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--clr-text)' }}>Overview</h2>
            <button className="btn primary" onClick={handleExport} aria-label="Export Cleaned Data to PDF">
              <i className="ph ph-download-simple" aria-hidden="true"></i> Export Cleaned Data
            </button>
          </header>
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
            <div className="data-quality-alerts mt-6" role="alert" aria-live="polite">
              <h3 className="data-quality-title">
                 <i className="ph-fill ph-warning-circle" aria-hidden="true"></i> Data Quality Attention Required
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
        </section>

        {/* Right Sidebar Column */}
        <aside className="sidebar-column" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', flexShrink: 0, width: '320px' }} aria-label="Dashboard Sidebar">
          
          {/* Priority Box */}
          <div className="insights-sidebar" style={{ width: '100%' }}>
            <PriorityScores />
          </div>

          {/* Insights Box */}
          <div className="insights-sidebar" style={{ width: '100%' }} aria-labelledby="insights-heading">
            <header className="sidebar-header">
              <h3 id="insights-heading"><i className="ph-fill ph-sparkle text-primary" aria-hidden="true"></i> AI Insights</h3>
              <span className="refresh-time">Auto-generated</span>
            </header>
            
            <div className="insight-cards-list mt-4" aria-live="polite">
              {loadingInsights ? (
                <>
                  <div className="insight-card insight-card-skeleton" aria-hidden="true"></div>
                  <div className="insight-card insight-card-skeleton delay-1" aria-hidden="true"></div>
                  <div className="insight-card insight-card-skeleton delay-2" aria-hidden="true"></div>
                </>
              ) : insights.length > 0 ? (
                 insights.slice(0, 3).map((insight, index) => (
                   <div key={index} className="insight-card primary-light">
                      <div className="insight-icon" aria-hidden="true">💡</div>
                      <p>{insight}</p>
                   </div>
                 ))
              ) : (
                  <div className="insight-card plain">
                    <p>No extra insights found for this dataset.</p>
                  </div>
              )}
            </div>
          </div>

          {/* Affected Population Chart */}
          <div style={{ width: '100%', marginTop: '1rem' }}>
            <AffectedPopulationChart />
          </div>

        </aside>

      </div>
    </main>
  );
};

export default Dashboard;
