import React, { useState, useEffect } from 'react';
import { useAppContext } from '../AppContext';

const TAB_CONFIG = {
  beneficiaries: {
    label: 'Beneficiaries',
    fileType: 'beneficiary',
    icon: 'ph-users-three',
    accent: '#0d7377',
    emptyIcon: 'ph-user-circle-plus',
    emptyText: 'No beneficiary records found.',
  },
  inventory: {
    label: 'Inventory',
    fileType: 'inventory',
    icon: 'ph-package',
    accent: '#f4a261',
    emptyIcon: 'ph-cube',
    emptyText: 'No inventory records found.',
  },
  donors: {
    label: 'Donors',
    fileType: 'donor',
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
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' });
  const [searchQuery, setSearchQuery] = useState('');
  const itemsPerPage = 10;

  // Reset sorting and searching on tab change
  useEffect(() => {
    setSortConfig({ key: null, direction: 'ascending' });
    setSearchQuery('');
  }, [activeTab]);

  useEffect(() => {
    const sessionId = sessionData || localStorage.getItem('crisisgrid_session');
    const requestedType = TAB_CONFIG[activeTab].fileType;

    if (cleanedData?.documentsByType?.[requestedType]) {
      setRecords(cleanedData.documentsByType[requestedType]);
    } else if (cleanedData?.cleanedDocuments && cleanedData.fileType !== 'multiple') {
      setRecords(
        cleanedData.cleanedDocuments.filter((row) => !row._file_type || row._file_type === requestedType),
      );
    } else if (sessionId) {
      fetch(`${API_BASE_URL}/data/${sessionId}?page=1&limit=200&file_type=${requestedType}`)
        .then(res => res.json())
        .then(data => {
          if (data.rows) setRecords(data.rows);
        })
        .catch(err => console.error("Failed to restore table records", err));
    }
  }, [activeTab, cleanedData, sessionData, API_BASE_URL]);

  const humanizeHeader = (key) =>
    key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  // Filter out columns where ALL values are null
  const allHeaders = records.length ? Object.keys(records[0]).filter((key) => !key.startsWith('_')) : [];
  const headers = allHeaders.filter((h) =>
    records.some((row) => row[h] != null && row[h] !== '')
  );

  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const sortedRecords = React.useMemo(() => {
    let sortableItems = [...records];
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        const numA = Number(valA);
        const numB = Number(valB);
        if (!isNaN(numA) && !isNaN(numB)) {
          return sortConfig.direction === 'ascending' ? numA - numB : numB - numA;
        }

        valA = valA ? String(valA).toLowerCase() : '';
        valB = valB ? String(valB).toLowerCase() : '';
        if (valA < valB) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (valA > valB) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [records, sortConfig]);

  const filteredRecords = React.useMemo(() => {
    if (!searchQuery) return sortedRecords;
    const query = searchQuery.toLowerCase();
    return sortedRecords.filter(row => {
      return Object.entries(row).some(([key, val]) => {
        if (key.startsWith('_')) return false;
        return val != null && String(val).toLowerCase().includes(query);
      });
    });
  }, [sortedRecords, searchQuery]);

  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const visibleRecords = filteredRecords.slice(startIndex, startIndex + itemsPerPage);

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
        <div className="table-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div className="table-card-title">
            <div className="title-icon" style={{ background: `${tabConfig.accent}15`, color: tabConfig.accent }}>
              <i className={`ph-fill ${tabConfig.icon}`}></i>
            </div>
            <div>
              <h3>{tabConfig.label}</h3>
              <p>{filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''} found</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            {records.length > 0 && (
              <div className="search-bar" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--clr-bg)', padding: '0.4rem 0.8rem', borderRadius: '20px', border: '1px solid var(--glass-border)' }}>
                <i className="ph ph-magnifying-glass" style={{ color: 'var(--clr-text-muted)', fontSize: '0.95rem' }}></i>
                <input
                  type="text"
                  placeholder="Search table..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', color: 'var(--clr-text)', width: '180px' }}
                />
                {searchQuery && (
                  <i 
                    className="ph ph-x" 
                    onClick={() => setSearchQuery('')} 
                    style={{ cursor: 'pointer', color: 'var(--clr-text-muted)', fontSize: '0.85rem' }}
                  ></i>
                )}
              </div>
            )}
            {filteredRecords.length > 0 && (
              <div className="table-card-actions">
                <span className="record-count-pill">
                  Page {currentPage} of {totalPages}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Table Body */}
        {headers.length > 0 ? (
          <div className="apple-table-scroll">
            <table className="apple-data-table">
              <thead>
                <tr>
                  <th className="row-number-col">#</th>
                  {headers.map((h, i) => {
                    const isSorted = sortConfig.key === h;
                    return (
                      <th 
                        key={i} 
                        onClick={() => requestSort(h)} 
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          {humanizeHeader(h)}
                          <i className={
                            isSorted 
                              ? (sortConfig.direction === 'ascending' ? 'ph ph-caret-up' : 'ph ph-caret-down')
                              : 'ph ph-caret-up-down'
                          } style={{ opacity: isSorted ? 1 : 0.3, fontSize: '0.9rem' }}></i>
                        </div>
                      </th>
                    );
                  })}
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
            <p>{searchQuery ? 'No matching records found.' : tabConfig.emptyText}</p>
            <span>{searchQuery ? 'Try adjusting your search terms' : 'Upload a file to get started'}</span>
          </div>
        )}

        {/* Pagination */}
        {filteredRecords.length > 0 && (
          <div className="apple-pagination">
            <span className="pagination-info">
              Showing {startIndex + 1}–{Math.min(startIndex + itemsPerPage, filteredRecords.length)} of {filteredRecords.length}
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
