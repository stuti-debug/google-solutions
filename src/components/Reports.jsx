import React, { useEffect } from 'react';
import { useAppContext } from '../AppContext';
import toast from 'react-hot-toast';

const Reports = () => {
  const { sessionData, API_BASE_URL, user, loading, navigate } = useAppContext();

  useEffect(() => {
    if (!loading && !user) {
      navigate('screen-login', { silent: true });
    }
  }, [loading, navigate, user]);

  if (!user) {
    return null;
  }

  const handleDownload = async (reportName) => {
    const sessionId = sessionData || localStorage.getItem('crisisgrid_session');
    if (!sessionId) {
      toast.error('No active session. Please upload data first.');
      return;
    }

    try {
      toast.loading(`Preparing ${reportName}...`, { id: 'download-toast' });
      const response = await fetch(`${API_BASE_URL}/reports/${sessionId}`);
      if (!response.ok) {
        throw new Error('Failed to download report.');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CrisisGrid_${reportName.replace(/\s+/g, '_')}_${sessionId}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success(`${reportName} downloaded successfully!`, { id: 'download-toast' });
    } catch (err) {
      toast.error(err.message, { id: 'download-toast' });
    }
  };

  return (
    <section id="screen-reports" className="screen active with-nav header-offset fade-in">
      <header className="page-header">
        <div>
          <h2>Generated Reports</h2>
          <p className="text-muted">Automatically compiled from your connected datasets.</p>
        </div>
        <button className="btn secondary"><i className="ph ph-funnel"></i> Filter</button>
      </header>
      
      <div className="reports-grid">
        <div className="report-card">
          <div className="report-icon"><i className="ph ph-file-pdf"></i></div>
          <div className="report-content">
            <h4>Weekly Distribution Summary</h4>
            <p>Nov 1 - Nov 7, 2026</p>
          </div>
          <button className="btn minimal" onClick={() => handleDownload('Distribution_Summary')}><i className="ph ph-download-simple"></i></button>
        </div>
        <div className="report-card">
          <div className="report-icon"><i className="ph ph-file-csv"></i></div>
          <div className="report-content">
            <h4>Inventory Discrepancy Log</h4>
            <p>Generated dynamically</p>
          </div>
          <button className="btn minimal" onClick={() => handleDownload('Inventory_Discrepancy')}><i className="ph ph-download-simple"></i></button>
        </div>
        <div className="report-card">
          <div className="report-icon"><i className="ph ph-chart-polar"></i></div>
          <div className="report-content">
            <h4>Donor Engagement Analytics</h4>
            <p>Q3 2026 Overview</p>
          </div>
          <button className="btn minimal" onClick={() => handleDownload('Donor_Analytics')}><i className="ph ph-download-simple"></i></button>
        </div>
        <div className="report-card">
          <div className="report-icon"><i className="ph ph-file-pdf"></i></div>
          <div className="report-content">
            <h4>Entity Consolidation Audit</h4>
            <p>AI Cleanup proof and merged rows</p>
          </div>
          <button className="btn minimal" onClick={() => handleDownload('Entity_Audit')}><i className="ph ph-download-simple"></i></button>
        </div>
      </div>
    </section>
  );
};

export default Reports;
