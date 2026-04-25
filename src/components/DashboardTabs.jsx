import React, { useState, useEffect } from 'react';
import { useAppContext } from '../AppContext';

const TAB_CONFIG = {
  beneficiaries: {
    label: 'Beneficiaries',
    icon: 'ph-users-three',
    accent: '#0d7377',
    emptyIcon: 'ph-user-circle-plus',
    emptyText: 'No beneficiary records found.',
  },
  inventory: {
    label: 'Inventory',
    icon: 'ph-package',
    accent: '#f4a261',
    emptyIcon: 'ph-cube',
    emptyText: 'No inventory records found.',
  },
  donors: {
    label: 'Donors',
    icon: 'ph-hand-heart',
    accent: '#4caf78',
    emptyIcon: 'ph-heart',
    emptyText: 'No donor records found.',
  },
};

const DashboardTabs = () => {
  const { cleanedData, sessionData, API_BASE_URL } = useAppContext();

  const determineInitialTab = () => {
    const fileType = String(cleanedData?.fileType || '').toLowerCase();
    if (fileType.includes('inventory')) return 'inventory';
    if (fileType.includes('donor')) return 'donors';
    return 'beneficiaries';
  };

  const [activeTab, setActiveTab] = useState(determineInitialTab());
  const [currentPage, setCurrentPage] = useState(1);
  const [records, setRecords] = useState([]);
  const itemsPerPage = 10;

  useEffect(() => {
    const sessionId = sessionData || localStorage.getItem('crisisgrid_session');
    if (cleanedData && cleanedData.cleanedDocuments) {
      setRecords(cleanedData.cleanedDocuments);
    } else if (sessionId) {
      fetch(`${API_BASE_URL}/data/${sessionId}?page=1&limit=200`)
        .then(res => res.json())
        .then(data => {
          if (data.rows) setRecords(data.rows);
        })
        .catch(err => console.error("Failed to restore table records", err));
    }
  }, [cleanedData, sessionData, API_BASE_URL]);

  const humanizeHeader = (key) =>
    key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  // Filter out columns where ALL values are null
  const allHeaders = records.length ? Object.keys(records[0]) : [];
  const headers = allHeaders.filter((h) =>
    records.some((row) => row[h] != null && row[h] !== '')
  );

  const totalPages = Math.ceil(records.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const visibleRecords = records.slice(startIndex, startIndex + itemsPerPage);

  const handleNext = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };
  const handlePrev = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const tabConfig = TAB_CONFIG[activeTab];

  return (
    <div className="dashboard-tabs-container mt-6">
      {/* Premium Tab Bar */}
      <div className="apple-tabs-bar">
        {Object.entries(TAB_CONFIG).map(([key, config]) => (
          <button
            key={key}
            className={`apple-tab-btn ${activeTab === key ? 'active' : ''}`}
            onClick={() => { setActiveTab(key); setCurrentPage(1); }}
            style={{ '--tab-accent': config.accent }}
          >
            <i className={`ph-fill ${config.icon}`}></i>
            <span>{config.label}</span>
            {activeTab === key && <div className="tab-indicator" />}
          </button>
        ))}

        {cleanedData?.fileType && cleanedData.fileType !== 'unknown' && (
          <span className="tab-file-badge">
            <i className="ph ph-file-text"></i>
            {cleanedData.fileType}
          </span>
        )}
      </div>

      {/* Table Card */}
      <div className="apple-table-card">
        {/* Card Header */}
        <div className="table-card-header">
          <div className="table-card-title">
            <div className="title-icon" style={{ background: `${tabConfig.accent}15`, color: tabConfig.accent }}>
              <i className={`ph-fill ${tabConfig.icon}`}></i>
            </div>
            <div>
              <h3>{tabConfig.label}</h3>
              <p>{records.length} record{records.length !== 1 ? 's' : ''} found</p>
            </div>
          </div>
          {records.length > 0 && (
            <div className="table-card-actions">
              <span className="record-count-pill">
                Page {currentPage} of {totalPages}
              </span>
            </div>
          )}
        </div>

        {/* Table Body */}
        {headers.length > 0 ? (
          <div className="apple-table-scroll">
            <table className="apple-data-table">
              <thead>
                <tr>
                  <th className="row-number-col">#</th>
                  {headers.map((h, i) => (
                    <th key={i}>{humanizeHeader(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRecords.map((row, i) => (
                  <tr key={i} className="table-row-animate" style={{ animationDelay: `${i * 30}ms` }}>
                    <td className="row-number-col">{startIndex + i + 1}</td>
                    {headers.map((h, j) => (
                      <td key={j}>
                        {row[h] != null && row[h] !== ''
                          ? <span className="cell-value">{row[h]}</span>
                          : <span className="cell-empty">—</span>
                        }
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="apple-empty-state">
            <div className="empty-icon-wrap" style={{ background: `${tabConfig.accent}10`, color: tabConfig.accent }}>
              <i className={`ph-fill ${tabConfig.emptyIcon}`}></i>
            </div>
            <p>{tabConfig.emptyText}</p>
            <span>Upload a file to get started</span>
          </div>
        )}

        {/* Pagination */}
        {records.length > 0 && (
          <div className="apple-pagination">
            <span className="pagination-info">
              Showing {startIndex + 1}–{Math.min(startIndex + itemsPerPage, records.length)} of {records.length}
            </span>
            <div className="pagination-buttons">
              <button
                className="pagination-btn"
                onClick={handlePrev}
                disabled={currentPage === 1}
              >
                <i className="ph ph-caret-left"></i>
              </button>
              <button
                className="pagination-btn"
                onClick={handleNext}
                disabled={currentPage === totalPages}
              >
                <i className="ph ph-caret-right"></i>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardTabs;
