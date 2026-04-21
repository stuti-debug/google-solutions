import React, { useState, useEffect } from 'react';
import { useAppContext } from '../AppContext';

const DashboardTabs = () => {
  const { cleanedData, sessionData, API_BASE_URL } = useAppContext();
  
  // Decide which tab to show by default based on fileType if available, or just 'beneficiaries'
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
       // Fetch a large chunk for client-side pagination if refreshed
       fetch(`${API_BASE_URL}/data/${sessionId}?page=1&limit=200`)
         .then(res => res.json())
         .then(data => {
            if (data.rows) setRecords(data.rows);
         })
         .catch(err => console.error("Failed to restore table records", err));
    }
  }, [cleanedData, sessionData, API_BASE_URL]);

  // Humanize raw DB column names: "beneficiary_id" → "Beneficiary Id"
  const humanizeHeader = (key) => {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  // Filter out columns where ALL values are null (useless in the table)
  const allHeaders = records.length ? Object.keys(records[0]) : [];
  const headers = allHeaders.filter((h) => {
    return records.some((row) => row[h] != null && row[h] !== '');
  });

  const totalPages = Math.ceil(records.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const visibleRecords = records.slice(startIndex, startIndex + itemsPerPage);

  const handleNext = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };
  const handlePrev = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  return (
    <div className="data-panel mt-6">
      <div className="tabs-header">
        <button 
          className={`tab-btn ${activeTab === 'beneficiaries' ? 'active' : ''}`} 
          onClick={() => { setActiveTab('beneficiaries'); setCurrentPage(1); }}
        >
          Beneficiaries
        </button>
        <button 
          className={`tab-btn ${activeTab === 'inventory' ? 'active' : ''}`} 
          onClick={() => { setActiveTab('inventory'); setCurrentPage(1); }}
        >
          Inventory
        </button>
        <button 
          className={`tab-btn ${activeTab === 'donors' ? 'active' : ''}`} 
          onClick={() => { setActiveTab('donors'); setCurrentPage(1); }}
        >
          Donors
        </button>
        
        {cleanedData?.fileType && cleanedData.fileType !== 'unknown' && (
          <span id="dashboard-filetype-badge" className="badge default" style={{ textTransform: 'capitalize' }}>
            {cleanedData.fileType}
          </span>
        )}
      </div>
      
      <div className="tab-content active" style={{ overflowX: 'auto' }}>
        <table className="data-table dashboard-table">
          <thead>
            {headers.length > 0 ? (
              <tr>
                {headers.map((h, i) => <th key={i}>{humanizeHeader(h)}</th>)}
              </tr>
            ) : (
              <tr><th>Data</th></tr>
            )}
          </thead>
          <tbody>
            {headers.length > 0 ? (
              visibleRecords.map((row, i) => (
                <tr key={i}>
                  {headers.map((h, j) => (
                    <td key={j}>{row[h] != null ? row[h] : <span style={{ color: 'var(--clr-text-muted)', fontStyle: 'italic' }}>—</span>}</td>
                  ))}
                </tr>
              ))
            ) : (
              <tr><td>No cleaned records available.</td></tr>
            )}
          </tbody>
        </table>

        {/* Pagination Controls */}
        {records.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid var(--clr-border)' }}>
             <span style={{ fontSize: '0.9rem', color: 'var(--clr-text-muted)' }}>
               Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, records.length)} of {records.length} entries
             </span>
             <div style={{ display: 'flex', gap: '0.5rem' }}>
               <button className="btn secondary outline" onClick={handlePrev} disabled={currentPage === 1}>Prev</button>
               <button className="btn secondary outline" onClick={handleNext} disabled={currentPage === totalPages}>Next</button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardTabs;
