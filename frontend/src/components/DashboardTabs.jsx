import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useAppContext } from '../AppContext';
import { apiFetch } from '../utils/api';
import { queueRequest } from '../utils/indexed_db_sync';

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
  const { cleanedData, sessionData, API_BASE_URL, bumpDataVersion } = useAppContext();

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
  const [editingCell, setEditingCell] = useState(null); // { rowIndex, field }
  const [editValue, setEditValue] = useState('');
  const itemsPerPage = 10;
  // Tracks last tap info for mobile double-tap detection
  const lastTapRef = useRef({ rowIndex: null, field: null, time: 0 });

  // Called by both onDoubleClick (desktop) and onTouchEnd (mobile)
  const activateEdit = (rowIndex, field, currentValue) => {
    setEditingCell({ rowIndex, field });
    setEditValue(currentValue != null ? String(currentValue) : '');
  };

  // Detect double-tap on mobile (two taps within 300ms on the same cell)
  const handleCellTap = (e, row, h) => {
    // Don't interfere if already editing
    if (editingCell) return;
    const now = Date.now();
    const last = lastTapRef.current;
    if (last.rowIndex === row._row_index && last.field === h && now - last.time < 300) {
      // Second tap on same cell within 300ms → trigger edit
      e.preventDefault();
      activateEdit(row._row_index, h, row[h]);
      lastTapRef.current = { rowIndex: null, field: null, time: 0 };
    } else {
      lastTapRef.current = { rowIndex: row._row_index, field: h, time: now };
    }
  };

  const handleCellSave = (row, header, newValue) => {
    const sessionId = sessionData || localStorage.getItem('crisisgrid_session');
    if (!sessionId) {
      setEditingCell(null);
      return;
    }

    const updatedValue = newValue.trim();
    if (String(row[header] || '').trim() === updatedValue) {
      setEditingCell(null);
      return;
    }

    // Optimistic UI update
    const updatedRecords = records.map((r) => {
      if (r._row_index === row._row_index) {
        return { ...r, [header]: updatedValue };
      }
      return r;
    });
    setRecords(updatedRecords);
    setEditingCell(null);

    const url = `${API_BASE_URL}/data/update/${sessionId}`;
    const payload = {
      row_index: row._row_index,
      updated_row: { [header]: updatedValue },
    };

    if (!navigator.onLine) {
      queueRequest(url, 'PUT', payload, 'cell_update');
      toast.success("Offline: Change saved locally. Will sync when online.");
      return;
    }

    apiFetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) {
          toast.error(`Failed to update: ${data.message}`);
        } else {
          toast.success("Cell updated successfully!");
          // Notify all other dashboard components to re-fetch with the new data
          bumpDataVersion();
        }
      })
      .catch((err) => {
        console.warn('Cell update fetch failed, queueing offline:', err);
        queueRequest(url, 'PUT', payload, 'cell_update');
        toast.success("Saved locally. Will sync when connection is restored.");
      });
  };

  // Reset sorting and searching on tab change
  useEffect(() => {
    setSortConfig({ key: null, direction: 'ascending' });
    setSearchQuery('');
  }, [activeTab]);

  useEffect(() => {
    const sessionId = sessionData || localStorage.getItem('crisisgrid_session');
    const requestedType = TAB_CONFIG[activeTab].fileType;

    if (cleanedData?.documentsByType?.[requestedType] && cleanedData.documentsByType[requestedType].length > 0) {
      setRecords(cleanedData.documentsByType[requestedType]);
    } else if (cleanedData?.cleanedDocuments && cleanedData.cleanedDocuments.length > 0 && cleanedData.fileType !== 'multiple') {
      setRecords(
        cleanedData.cleanedDocuments.filter((row) => !row._file_type || row._file_type === requestedType),
      );
    } else if (sessionId) {
      apiFetch(`${API_BASE_URL}/data/${sessionId}?page=1&limit=200&file_type=${requestedType}`)
        .then(res => res.json())
        .then(data => {
          if (data.rows) setRecords(data.rows);
          else setRecords([]);
        })
        .catch(err => console.error("Failed to restore table records", err));
    } else {
      setRecords([]);
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
                    {headers.map((h, j) => {
                      const isEditing = editingCell && editingCell.rowIndex === row._row_index && editingCell.field === h;
                      return (
                        <td 
                          key={j}
                          onDoubleClick={() => activateEdit(row._row_index, h, row[h])}
                          onTouchEnd={(e) => handleCellTap(e, row, h)}
                          style={{ cursor: 'pointer' }}
                          title="Double-tap to edit"
                        >
                          {isEditing ? (
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => handleCellSave(row, h, editValue)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleCellSave(row, h, editValue);
                                } else if (e.key === 'Escape') {
                                  setEditingCell(null);
                                }
                              }}
                              autoFocus
                              className="inline-cell-input"
                              style={{
                                width: '100%',
                                padding: '4px 8px',
                                border: '1px solid var(--tab-accent, #0d7377)',
                                borderRadius: '4px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                backdropFilter: 'blur(5px)',
                                color: 'var(--clr-text, #ffffff)',
                                outline: 'none',
                                boxSizing: 'border-box',
                                fontSize: '0.85rem'
                              }}
                            />
                          ) : (
                            row[h] != null && row[h] !== ''
                              ? <span className="cell-value">{row[h]}</span>
                              : <span className="cell-empty">—</span>
                          )}
                        </td>
                      );
                    })}
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
                aria-label="Previous page"
              >
                <i className="ph ph-caret-left" aria-hidden="true"></i>
              </button>
              <button
                className="pagination-btn"
                onClick={handleNext}
                disabled={currentPage === totalPages}
                aria-label="Next page"
              >
                <i className="ph ph-caret-right" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardTabs;
