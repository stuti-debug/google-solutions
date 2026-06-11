import React, { useState, useEffect } from 'react';
import { useAppContext } from '../AppContext';
import { apiFetch } from '../utils/api';
import { exportToPdf } from '../utils/exportPdf';
import toast from 'react-hot-toast';
import ShareButton from './ShareButton';
import { formatReportSummary, formatSitRepBrief } from '../utils/shareFormatter';
import { incrementUsage } from '../utils/usageTracker';

const REPORT_TYPES = [
  { id: 'sitrep', label: 'AI Situation Report', icon: 'ph-file-text', color: '#0A6C74', description: 'AI-generated humanitarian SitRep with executive summary, gaps, and recommendations.' },
  { id: 'inventory_status', label: 'Inventory Status', icon: 'ph-package', color: '#E76F51', description: 'Current stock levels per item across all warehouses — critical, low, and healthy.' },
  { id: 'beneficiary_coverage', label: 'Beneficiary Coverage', icon: 'ph-users-three', color: '#6366F1', description: 'Breakdown by district and need type. Shows who is being served and where gaps exist.' },
  { id: 'donor_ledger', label: 'Donor Contribution Ledger', icon: 'ph-hand-coins', color: '#F59E0B', description: 'All donor contributions, total amounts, and item allocations.' },
  { id: 'data_quality', label: 'Data Quality Audit', icon: 'ph-shield-check', color: '#10B981', description: 'Transparency report — errors fixed, duplicates removed, null columns detected.' },
  { id: 'gap_analysis', label: 'Gap Analysis', icon: 'ph-chart-scatter', color: '#EF4444', description: 'Cross-references demand vs. supply to surface unmet needs by location.' },
];

const Reports = () => {
  const { sessionData, API_BASE_URL, user, loading, navigate } = useAppContext();
  const [activeReport, setActiveReport] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('screen-login', { silent: true });
    }
  }, [loading, navigate, user]);

  if (!user) return null;

  const sessionId = sessionData || localStorage.getItem('crisisgrid_session');

  const generateReport = async (type) => {
    if (!sessionId) {
      toast.error('No active session. Please upload data first.');
      return;
    }
    setActiveReport(type);
    setReportData(null);
    setReportLoading(true);

    try {
      let url, data;
      if (type === 'sitrep') {
        url = `${API_BASE_URL}/sitrep/${sessionId}`;
        const res = await apiFetch(url);
        data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed');
        setReportData({ type: 'sitrep', ...data });
      } else {
        url = `${API_BASE_URL}/reports/generate/${sessionId}/${type}`;
        const res = await apiFetch(url);
        data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed');
        setReportData({ type, ...data.report });
      }
      toast.success('Report generated!');
      try { incrementUsage('reports'); } catch (e) {}
    } catch (err) {
      toast.error(err.message || 'Failed to generate report.');
    } finally {
      setReportLoading(false);
    }
  };

  const goBack = () => { setActiveReport(null); setReportData(null); };

  // --- Render helpers ---
  const renderBold = (text) => {
    if (!text) return text;
    const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) => p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p);
  };

  const statusBadge = (status) => {
    const colors = { critical: '#EF4444', low: '#F59E0B', healthy: '#22C55E', moderate: '#F59E0B', covered: '#22C55E' };
    return (
      <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.2rem 0.5rem', borderRadius: '6px', background: `${colors[status] || '#6366F1'}15`, color: colors[status] || '#6366F1' }}>
        {status}
      </span>
    );
  };

  // --- SitRep Renderer ---
  const renderSitRep = () => {
    const md = reportData.report || '';
    const lines = md.split('\n');
    const sections = [];
    let cur = null;
    const icons = { 'executive summary': 'ph-file-text', 'affected': 'ph-users-three', 'resource': 'ph-package', 'critical gap': 'ph-warning-circle', 'data quality': 'ph-chart-bar', 'recommended': 'ph-rocket-launch' };
    const colors = { 'executive summary': '#0A6C74', 'affected': '#E76F51', 'resource': '#2A9D8F', 'critical gap': '#EF4444', 'data quality': '#6366F1', 'recommended': '#F59E0B' };

    for (const line of lines) {
      if (line.startsWith('## ')) {
        if (cur) sections.push(cur);
        const title = line.replace('## ', '').trim();
        const tl = title.toLowerCase();
        const key = Object.keys(icons).find(k => tl.includes(k));
        cur = { title, icon: key ? icons[key] : 'ph-article', color: key ? colors[key] : '#6366F1', content: [] };
      } else if (cur && line.trim()) {
        cur.content.push(line);
      }
    }
    if (cur) sections.push(cur);

    return (
      <div className="sitrep-sections">
        {sections.map((s, i) => (
          <div key={i} className="sitrep-section-card" style={{ '--section-color': s.color }}>
            <div className="sitrep-section-header">
              <div className="sitrep-section-icon" style={{ background: `${s.color}15`, color: s.color }}><i className={`ph-fill ${s.icon}`}></i></div>
              <h4>{s.title}</h4>
            </div>
            <div className="sitrep-section-body">
              {s.content.map((line, j) => {
                const isBullet = /^[-•]/.test(line.trim()) || /^\d+\.\s/.test(line.trim());
                const clean = line.trim().replace(/^[-•]\s*/, '').replace(/^\d+\.\s*/, '');
                return isBullet ? (
                  <div key={j} className="sitrep-bullet">
                    <span className="sitrep-bullet-dot" style={{ background: s.color }}></span>
                    <span>{renderBold(clean)}</span>
                  </div>
                ) : <p key={j} className="sitrep-paragraph">{renderBold(line)}</p>;
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // --- Inventory Status Renderer ---
  const renderInventory = () => (
    <div className="report-detail-content">
      <div className="report-stat-row">
        <div className="report-stat-pill"><span className="report-stat-num" style={{ color: '#EF4444' }}>{reportData.critical_count}</span><span className="report-stat-label">Critical</span></div>
        <div className="report-stat-pill"><span className="report-stat-num" style={{ color: '#F59E0B' }}>{reportData.low_count}</span><span className="report-stat-label">Low</span></div>
        <div className="report-stat-pill"><span className="report-stat-num" style={{ color: '#22C55E' }}>{reportData.healthy_count}</span><span className="report-stat-label">Healthy</span></div>
      </div>
      <div className="report-table-wrapper">
        <table className="report-table">
          <thead><tr><th>Item</th><th>Location</th><th>Qty</th><th>Status</th></tr></thead>
          <tbody>
            {reportData.items?.map((item, i) => (
              <tr key={i}><td style={{ fontWeight: 600 }}>{item.item}</td><td>{item.location}</td><td style={{ fontWeight: 700 }}>{item.quantity}</td><td>{statusBadge(item.status)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // --- Beneficiary Coverage Renderer ---
  const renderBeneficiary = () => (
    <div className="report-detail-content">
      <div className="report-stat-row">
        <div className="report-stat-pill"><span className="report-stat-num" style={{ color: '#6366F1' }}>{reportData.total_beneficiaries?.toLocaleString()}</span><span className="report-stat-label">Beneficiaries</span></div>
        <div className="report-stat-pill"><span className="report-stat-num" style={{ color: '#0A6C74' }}>{reportData.total_districts}</span><span className="report-stat-label">Districts</span></div>
      </div>
      <h4 style={{ margin: '1.5rem 0 0.75rem', fontSize: '0.95rem', fontWeight: 700 }}><i className="ph-fill ph-map-pin" style={{ color: '#6366F1', marginRight: '0.4rem' }}></i>By District</h4>
      <div className="report-bar-list">
        {reportData.districts?.map((d, i) => (
          <div key={i} className="report-bar-item">
            <div className="report-bar-label"><span>{d.name}</span><span style={{ fontWeight: 700 }}>{d.count} <span style={{ fontWeight: 400, color: 'var(--clr-text-muted)', fontSize: '0.8rem' }}>({d.pct}%)</span></span></div>
            <div className="report-bar-track"><div className="report-bar-fill" style={{ width: `${d.pct}%`, background: '#6366F1' }}></div></div>
          </div>
        ))}
      </div>
      {reportData.needs?.length > 0 && (
        <>
          <h4 style={{ margin: '1.5rem 0 0.75rem', fontSize: '0.95rem', fontWeight: 700 }}><i className="ph-fill ph-first-aid-kit" style={{ color: '#E76F51', marginRight: '0.4rem' }}></i>By Need Type</h4>
          <div className="report-bar-list">
            {reportData.needs.map((n, i) => {
              const maxCount = reportData.needs[0]?.count || 1;
              return (
                <div key={i} className="report-bar-item">
                  <div className="report-bar-label"><span>{n.need}</span><span style={{ fontWeight: 700 }}>{n.count}</span></div>
                  <div className="report-bar-track"><div className="report-bar-fill" style={{ width: `${(n.count / maxCount) * 100}%`, background: '#E76F51' }}></div></div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  // --- Donor Ledger Renderer ---
  const renderDonor = () => (
    <div className="report-detail-content">
      <div className="report-stat-row">
        <div className="report-stat-pill"><span className="report-stat-num" style={{ color: '#F59E0B' }}>{reportData.total_donors}</span><span className="report-stat-label">Donors</span></div>
        <div className="report-stat-pill"><span className="report-stat-num" style={{ color: '#0A6C74' }}>₹{reportData.total_amount?.toLocaleString()}</span><span className="report-stat-label">Total</span></div>
      </div>
      <div className="report-table-wrapper">
        <table className="report-table">
          <thead><tr><th>Donor</th><th>Items / Category</th><th>Amount</th><th>Date</th></tr></thead>
          <tbody>
            {reportData.donors?.map((d, i) => (
              <tr key={i}><td style={{ fontWeight: 600 }}>{d.name}</td><td style={{ color: 'var(--clr-text-muted)', fontSize: '0.85rem' }}>{d.items}</td><td style={{ fontWeight: 700 }}>₹{d.amount?.toLocaleString()}</td><td style={{ fontSize: '0.85rem', color: 'var(--clr-text-muted)' }}>{d.date}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // --- Data Quality Audit Renderer ---
  const renderQuality = () => (
    <div className="report-detail-content">
      <div className="report-stat-row">
        <div className="report-stat-pill"><span className="report-stat-num" style={{ color: '#10B981' }}>{reportData.clean_rate}%</span><span className="report-stat-label">Quality Score</span></div>
        <div className="report-stat-pill"><span className="report-stat-num" style={{ color: '#0A6C74' }}>{reportData.total_records}</span><span className="report-stat-label">Records</span></div>
        <div className="report-stat-pill"><span className="report-stat-num" style={{ color: '#F59E0B' }}>{reportData.total_fixed}</span><span className="report-stat-label">Auto-Fixed</span></div>
        <div className="report-stat-pill"><span className="report-stat-num" style={{ color: '#EF4444' }}>{reportData.rows_dropped}</span><span className="report-stat-label">Dropped</span></div>
      </div>
      <div className="report-detail-cards">
        <div className="report-detail-card">
          <h5><i className="ph-fill ph-copy" style={{ color: '#E76F51' }}></i> Duplicates Removed</h5>
          <span className="report-detail-big">{reportData.duplicates_removed}</span>
        </div>
        <div className="report-detail-card">
          <h5><i className="ph-fill ph-columns" style={{ color: '#6366F1' }}></i> Total Columns</h5>
          <span className="report-detail-big">{reportData.total_columns}</span>
        </div>
        <div className="report-detail-card">
          <h5><i className="ph-fill ph-files" style={{ color: '#0A6C74' }}></i> File Types</h5>
          <span style={{ fontSize: '0.9rem', color: 'var(--clr-text)' }}>{reportData.file_types?.join(', ') || 'N/A'}</span>
        </div>
        <div className="report-detail-card">
          <h5><i className="ph-fill ph-warning" style={{ color: '#F59E0B' }}></i> Error Logs</h5>
          <span className="report-detail-big">{reportData.error_log_count}</span>
        </div>
      </div>
      {reportData.top_null_columns?.length > 0 && (
        <>
          <h4 style={{ margin: '1.5rem 0 0.75rem', fontSize: '0.95rem', fontWeight: 700 }}><i className="ph-fill ph-prohibit" style={{ color: '#EF4444', marginRight: '0.4rem' }}></i>Columns with Missing Values</h4>
          <div className="report-bar-list">
            {reportData.top_null_columns.map((c, i) => {
              const maxN = reportData.top_null_columns[0]?.nulls || 1;
              return (
                <div key={i} className="report-bar-item">
                  <div className="report-bar-label"><span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{c.column}</span><span style={{ fontWeight: 700, color: '#EF4444' }}>{c.nulls} nulls</span></div>
                  <div className="report-bar-track"><div className="report-bar-fill" style={{ width: `${(c.nulls / maxN) * 100}%`, background: '#EF4444' }}></div></div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  // --- Gap Analysis Renderer ---
  const renderGap = () => (
    <div className="report-detail-content">
      <div className="report-stat-row">
        <div className="report-stat-pill"><span className="report-stat-num" style={{ color: reportData.overall_coverage < 60 ? '#EF4444' : '#22C55E' }}>{reportData.overall_coverage}%</span><span className="report-stat-label">Coverage</span></div>
        <div className="report-stat-pill"><span className="report-stat-num" style={{ color: '#EF4444' }}>{reportData.critical_gaps}</span><span className="report-stat-label">Critical Gaps</span></div>
        <div className="report-stat-pill"><span className="report-stat-num" style={{ color: '#0A6C74' }}>{reportData.total_locations}</span><span className="report-stat-label">Locations</span></div>
      </div>
      <div className="report-table-wrapper">
        <table className="report-table">
          <thead><tr><th>Location</th><th>Demand</th><th>Supply</th><th>Gap</th><th>Coverage</th><th>Status</th></tr></thead>
          <tbody>
            {reportData.gaps?.map((g, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{g.location}</td>
                <td>{g.demand.toLocaleString()}</td>
                <td>{g.supply.toLocaleString()}</td>
                <td style={{ fontWeight: 700, color: g.gap > 0 ? '#EF4444' : '#22C55E' }}>{g.gap > 0 ? `-${g.gap.toLocaleString()}` : '0'}</td>
                <td style={{ fontWeight: 700 }}>{g.coverage}%</td>
                <td>{statusBadge(g.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderers = {
    sitrep: renderSitRep,
    inventory_status: renderInventory,
    beneficiary_coverage: renderBeneficiary,
    donor_ledger: renderDonor,
    data_quality: renderQuality,
    gap_analysis: renderGap,
  };

  const activeInfo = REPORT_TYPES.find(r => r.id === activeReport);

  return (
    <main id="screen-reports" className="screen active with-nav fade-in" aria-label="Reports">
      <div className="sitrep-shell" style={{ maxWidth: activeReport ? '900px' : '1000px', paddingTop: '2rem' }}>
        <header className="page-header" style={{ marginBottom: '2rem' }}>
          <div>
            <h2 style={{ fontSize: '2.2rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Reports</h2>
            <p className="text-muted">Generate structured reports from your crisis data.</p>
          </div>
        </header>

        {/* Report Type Grid */}
        {!activeReport && (
          <div className="report-type-grid">
            {REPORT_TYPES.map((rt, idx) => (
              <div 
                key={rt.id} 
                className="report-type-card table-row-animate" 
                onClick={() => generateReport(rt.id)} 
                style={{ '--rt-color': rt.color, animationDelay: `${idx * 80}ms` }}
              >
                <div className="report-type-icon" style={{ background: `${rt.color}12`, color: rt.color }}>
                  <i className={`ph-fill ${rt.icon}`}></i>
                </div>
                <div className="report-type-info">
                  <h4>{rt.label}</h4>
                  <p>{rt.description}</p>
                </div>
                <i className="ph ph-arrow-right report-type-arrow"></i>
              </div>
            ))}
          </div>
        )}

        {/* Active Report View */}
        {activeReport && (
          <div>
            <button className="btn minimal" onClick={goBack} style={{ marginBottom: '1.5rem' }} aria-label="Back to all reports">
              <i className="ph ph-arrow-left" aria-hidden="true"></i> Back to all reports
            </button>

            {reportLoading && (
              <div className="sitrep-loading" aria-live="polite" aria-busy="true">
                <div className="sitrep-loading-icon"><i className="ph ph-circle-notch ph-spin" aria-hidden="true"></i></div>
                <h3>Generating {activeInfo?.label}...</h3>
                <p className="text-muted">Analyzing your session data.</p>
                <div className="sitrep-skeleton-grid" aria-hidden="true">
                  <div className="sitrep-skeleton-card"></div>
                  <div className="sitrep-skeleton-card delay-1"></div>
                </div>
              </div>
            )}

            {reportData && !reportLoading && (
              <div className="sitrep-report" id="sitrep-printable">
                <div className="sitrep-report-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: `${activeInfo?.color}12`, color: activeInfo?.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                      <i className={`ph-fill ${activeInfo?.icon}`}></i>
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>{reportData.title || activeInfo?.label}</h3>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--clr-text-muted)' }}>{reportData.summary}</p>
                    </div>
                  </div>
                  <div className="sitrep-actions">
                    <button className="btn minimal" onClick={() => { navigator.clipboard.writeText(JSON.stringify(reportData, null, 2)); toast.success('Copied!'); }} aria-label="Copy report data">
                      <i className="ph ph-copy" aria-hidden="true"></i> Copy
                    </button>
                    <button className="btn minimal" disabled={exporting} onClick={() => {
                      setExporting(true);
                      const toastId = toast.loading('Generating PDF...');
                      const pdfName = `CrisisGrid-${(activeInfo?.label || 'Report').replace(/\s+/g, '-')}`;
                      exportToPdf('sitrep-printable', pdfName)
                        .then(() => {
                          toast.success('PDF downloaded!', { id: toastId });
                          try { incrementUsage('exports'); } catch (e) {}
                        })
                        .catch(() => toast.error('PDF export failed.', { id: toastId }))
                        .finally(() => setExporting(false));
                    }} aria-label="Export report to PDF">
                      {exporting ? <i className="ph ph-spinner ph-spin" aria-hidden="true"></i> : <i className="ph ph-file-pdf" aria-hidden="true"></i>} Export PDF
                    </button>
                    <ShareButton size="md" label="Share" getText={() => {
                      if (activeReport === 'sitrep' && reportData?.report) return formatSitRepBrief(reportData.report);
                      return formatReportSummary(reportData || {});
                    }} />
                    <button className="btn primary" onClick={() => generateReport(activeReport)} aria-label="Refresh report">
                      <i className="ph-fill ph-arrows-clockwise" aria-hidden="true"></i> Refresh
                    </button>
                  </div>
                </div>

                {renderers[activeReport] ? renderers[activeReport]() : null}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
};

export default Reports;
