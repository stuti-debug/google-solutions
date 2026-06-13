import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../AppContext';
import toast from 'react-hot-toast';

// ---------------------------------------------------------------------------
// Lightweight CSV parser (no external dependency)
// ---------------------------------------------------------------------------
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.replace(/^"|"$/g, '').trim());
  return lines.slice(1).map((line) => {
    const values = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { values.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    values.push(cur.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
}

// Column alias heuristic for manual fallback
const MANUAL_ALIASES = {
  beneficiary: {
    name: ['name', 'head_of_household', 'headofhousehold', 'beneficiaryname', 'person', 'full_name'],
    village: ['village', 'location', 'camp', 'shelter', 'village_name', 'loc', 'area'],
    household_size: ['household_size', 'hhsize', 'family_size', 'familysize', 'members'],
    need_type: ['need_type', 'need', 'needtype', 'requirement', 'type'],
    status: ['status', 'state', 'delivery_status'],
    phone: ['phone', 'mobile', 'contact', 'phone_number'],
    district: ['district', 'dist', 'region'],
  },
  inventory: {
    item_name: ['item_name', 'item', 'name', 'product', 'material'],
    category: ['category', 'type', 'cat'],
    quantity: ['quantity', 'qty', 'stock', 'amount', 'count'],
    unit: ['unit', 'uom', 'measure'],
    warehouse: ['warehouse', 'godown', 'depot', 'location', 'hub'],
    is_crisis_zone: ['is_crisis_zone', 'crisis_zone', 'crisiszone'],
  },
  donor: {
    donor_name: ['donor_name', 'name', 'donorname', 'organization', 'org'],
    donor_type: ['donor_type', 'type', 'category'],
    amount: ['amount', 'donation', 'contribution', 'amountdonated'],
    currency: ['currency', 'cur'],
    district: ['district', 'region', 'location'],
    date_donated: ['date_donated', 'date', 'donationdate'],
    payment_status: ['payment_status', 'status', 'paymentstatus'],
  },
};

function applyManualMapping(rows, fileType) {
  if (!rows.length) return rows;
  const aliases = MANUAL_ALIASES[fileType] || {};
  const originalHeaders = Object.keys(rows[0]);
  const srcCols = originalHeaders.map((c) => c.toLowerCase().replace(/[^a-z0-9]/g, '_'));

  const colMap = {};
  Object.entries(aliases).forEach(([canonical, candidates]) => {
    for (const cand of candidates) {
      const idx = srcCols.findIndex(
        (c) => c === cand || c.replace(/_/g, '') === cand.replace(/_/g, ''),
      );
      if (idx !== -1) { colMap[canonical] = originalHeaders[idx]; break; }
    }
  });

  return rows.map((row) => {
    const out = {};
    Object.entries(colMap).forEach(([canonical, src]) => { out[canonical] = row[src] ?? null; });
    return out;
  });
}

function detectFileType(rows) {
  if (!rows.length) return 'beneficiary';
  const keys = Object.keys(rows[0]).map((k) => k.toLowerCase());
  const hasAny = (arr) => arr.some((k) => keys.some((c) => c.includes(k)));
  if (hasAny(['donor', 'amount', 'donation'])) return 'donor';
  if (hasAny(['item', 'qty', 'quantity', 'warehouse', 'stock', 'inventory'])) return 'inventory';
  return 'beneficiary';
}

// ---------------------------------------------------------------------------
const UploadOnboarding = () => {
  const {
    currentScreen,
    navigate,
    uploadedFiles,
    setUploadedFiles,
    uploadAndCleanFiles,
    setCleanedDataMap,
    setSessionData,
  } = useAppContext();

  const [selectedNGO, setSelectedNGO] = useState('');
  const [checklistStep, setChecklistStep] = useState(0);
  const [checklistSuccess, setChecklistSuccess] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedTimerRef = useRef(null);
  const autoNavRef = useRef(null);

  const stepNumber = parseInt(currentScreen.replace('screen-onboard-', ''), 10);

  // Auto-navigate to dashboard 1.5s after successful upload
  useEffect(() => {
    if (checklistSuccess === true) {
      autoNavRef.current = setTimeout(() => navigate('screen-dashboard'), 1500);
    }
    return () => { if (autoNavRef.current) clearTimeout(autoNavRef.current); };
  }, [checklistSuccess, navigate]);

  useEffect(() => {
    let timer;
    if (stepNumber === 3) {
      if (checklistSuccess === null) {
        timer = setInterval(() => {
          setChecklistStep((prev) => (prev + 1) % 5);
        }, 900);
        setElapsedSeconds(0);
        elapsedTimerRef.current = setInterval(() => {
          setElapsedSeconds((s) => s + 1);
        }, 1000);
      } else {
        if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
        if (checklistSuccess) setChecklistStep(4);
        if (timer) clearInterval(timer);
      }
    }
    return () => {
      clearInterval(timer);
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, [stepNumber, checklistSuccess]);

  const handleFileDrop = (e, category) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) setUploadedFiles((prev) => ({ ...prev, [category]: file }));
  };

  const handleFileSelect = (e, category) => {
    const file = e.target.files[0];
    if (file) setUploadedFiles((prev) => ({ ...prev, [category]: file }));
  };

  const handleUploadAndAnalyze = () => {
    navigate('screen-onboard-3');
    setChecklistSuccess(null);
    setChecklistStep(0);
    uploadAndCleanFiles(setChecklistStep, setChecklistSuccess);
  };

  // -------------------------------------------------------------------------
  // Manual Fallback — parse CSVs client-side, bypass Gemini entirely
  // -------------------------------------------------------------------------
  const handleManualFallback = useCallback(async () => {
    const selectedFiles = [
      { file: uploadedFiles.beneficiaries, type: 'beneficiary' },
      { file: uploadedFiles.inventory, type: 'inventory' },
      { file: uploadedFiles.donors, type: 'donor' },
    ].filter((f) => f.file);

    if (!selectedFiles.length) {
      toast.error('No files to process. Go back and re-upload your files.');
      return;
    }

    const loadingToast = toast.loading('Parsing files locally — skipping AI…');

    try {
      const newDataMap = {};

      await Promise.all(
        selectedFiles.map(
          (f) =>
            new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (e) => {
                try {
                  const rawRows = parseCSV(e.target.result);
                  const fileType = f.type || detectFileType(rawRows);
                  newDataMap[fileType] = applyManualMapping(rawRows, fileType);
                  resolve();
                } catch (err) { reject(err); }
              };
              reader.onerror = reject;
              reader.readAsText(f.file);
            }),
        ),
      );

      const fallbackSessionId = `fallback-${Date.now()}`;
      localStorage.setItem('crisisgrid_session', fallbackSessionId);
      setSessionData(fallbackSessionId);
      setCleanedDataMap(newDataMap);

      toast.dismiss(loadingToast);
      const totalRecords = Object.values(newDataMap).reduce((s, r) => s + r.length, 0);
      toast.success(
        `Loaded ${totalRecords} records without AI. Some columns may need review.`,
        { duration: 4000 },
      );

      setTimeout(() => navigate('screen-dashboard'), 800);
    } catch (err) {
      toast.dismiss(loadingToast);
      toast.error(`Manual mapping failed: ${err.message}`);
    }
  }, [uploadedFiles, navigate, setCleanedDataMap, setSessionData]);

  const renderCheckItem = (stepIndex, text) => {
    let iconClass = 'ph ph-circle spinner-icon';
    let textClass = '';

    if (checklistSuccess === true) {
      iconClass = 'ph ph-check-circle';
      textClass = 'completed';
    } else if (checklistSuccess === false) {
      iconClass = 'ph ph-warning-circle text-error';
    } else if (checklistStep > stepIndex) {
      iconClass = 'ph ph-check-circle';
      textClass = 'completed';
    } else if (checklistStep === stepIndex) {
      iconClass = 'ph ph-circle-notch ph-spin text-primary';
      textClass = 'active';
    }

    return (
      <div className={`check-item ${textClass}`} id={`check-${stepIndex + 1}`}>
        <i className={iconClass}></i>
        <span>{text}</span>
      </div>
    );
  };

  return (
    <>
      <div id="onboard-header">
        <div className="ob-progress-track">
          <div className="ob-progress-fill" style={{ width: `${stepNumber * 33.33}%` }}></div>
        </div>
        <div className="ob-step-text">Step {stepNumber} of 3</div>
      </div>

      {stepNumber === 1 && (
        <main id="screen-onboard-1" className="screen active fade-in flex-center" aria-label="Select NGO Type">
          <div className="onboard-container">
            <h2 className="text-center">What kind of NGO are you?</h2>
            <p className="text-center">Select your primary focus so we can customize your dashboard.</p>

            <div className="grid-options large-grid mt-6">
              {[
                { id: 'disaster', icon: 'ph-lifebuoy', label: 'Disaster Relief' },
                { id: 'health', icon: 'ph-heartbeat', label: 'Health' },
                { id: 'education', icon: 'ph-books', label: 'Education' },
                { id: 'livelihood', icon: 'ph-plant', label: 'Livelihood' },
                { id: 'other', icon: 'ph-squares-four', label: 'Other' },
              ].map((option) => (
                <div
                  key={option.id}
                  className={`option-card ${selectedNGO === option.id ? 'selected' : ''}`}
                  onClick={() => setSelectedNGO(option.id)}
                >
                  <i className={`ph ${option.icon} option-icon`} aria-hidden="true"></i>
                  <h3>{option.label}</h3>
                </div>
              ))}
            </div>

            <div className="actions center-align mt-8">
              <button
                className="btn primary"
                onClick={() => {
                  if (!selectedNGO) { toast.error('Please select an NGO type.'); return; }
                  navigate('screen-onboard-2');
                }}
              >
                Next <i className="ph ph-arrow-right" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </main>
      )}

      {stepNumber === 2 && (
        <main id="screen-onboard-2" className="screen active fade-in flex-center" aria-label="Upload Data">
          <div className="onboard-container wide">
            <button className="btn minimal icon-left mb-4" onClick={() => navigate('screen-onboard-1')} aria-label="Go back">
              <i className="ph ph-arrow-left" aria-hidden="true"></i> Back
            </button>
            <h2>Upload your data</h2>
            <p>Don't worry about messy columns or missing values — our AI handles that.</p>

            <div className="upload-categories mt-6">
              {['beneficiaries', 'inventory', 'donors'].map((category) => (
                <div className="upload-column" key={category}>
                  <h4 className="category-title" style={{ textTransform: 'capitalize' }}>
                    <i
                      className={`ph ${category === 'beneficiaries' ? 'ph-users' : category === 'inventory' ? 'ph-package' : 'ph-hand-coins'}`}
                      aria-hidden="true"
                    ></i>{' '}
                    {category}
                  </h4>
                  <label
                    htmlFor={`file-upload-${category}`}
                    className={`upload-box ${uploadedFiles[category] ? 'drag-over' : ''}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleFileDrop(e, category)}
                    tabIndex="0"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        document.getElementById(`file-upload-${category}`).click();
                      }
                    }}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
                  >
                    <i className="ph ph-cloud-arrow-up text-primary" aria-hidden="true"></i>
                    <span>{uploadedFiles[category] ? uploadedFiles[category].name : 'Drop files here or click'}</span>
                    <div className="badges">
                      <span className="badge file-badge">CSV</span>
                      <span className="badge file-badge">XLSX</span>
                    </div>
                    <input
                      id={`file-upload-${category}`}
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      className="sr-only"
                      onChange={(e) => handleFileSelect(e, category)}
                      aria-label={`Upload ${category} file`}
                    />
                  </label>
                </div>
              ))}
            </div>

            <p className="text-muted text-center mt-4" style={{ fontSize: '0.9rem' }}>
              You can skip any category and upload it later.
            </p>
            <div className="alert-box info-light mt-4 p-4 text-center" style={{ borderRadius: '8px', fontSize: '0.85rem' }}>
              <strong>Workspace Configured:</strong> Files are processed securely and linked to your current crisis workspace.
            </div>

            <div className="actions right-align mt-6">
              <button className="btn primary" onClick={handleUploadAndAnalyze}>
                Upload &amp; Analyse <i className="ph ph-arrow-right" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </main>
      )}

      {stepNumber === 3 && (
        <main id="screen-onboard-3" className="screen active fade-in flex-center" aria-label="Processing Data">
          <div className="processing-container">
            <h2 className="text-center mb-6" aria-live="polite">CrisisGrid is working its magic</h2>

            <div className="ai-loader mx-auto" aria-hidden="true">
              <div className="circle primary-ring"></div>
              <div className="circle accent-ring"></div>
              <i className="ph ph-magic-wand ai-icon"></i>
            </div>

            <div className="checklist mt-8" id="ai-checklist" aria-live="polite">
              {renderCheckItem(0, 'Reading your files...')}
              {renderCheckItem(1, 'Detecting column types...')}
              {renderCheckItem(2, 'Cleaning inconsistencies...')}
              {renderCheckItem(3, 'Generating AI insights...')}
            </div>

            {checklistSuccess === null && (
              <div
                className="processing-status-hint"
                style={{
                  marginTop: '1.5rem',
                  padding: '0.75rem 1.25rem',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '10px',
                  textAlign: 'center',
                  fontSize: '0.85rem',
                  color: 'var(--text-muted, #9aa0b5)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <i className="ph ph-robot" style={{ marginRight: '0.4rem' }}></i>
                AI is analyzing your data — this typically takes <strong>60–90 seconds</strong>. Please don't close this tab.
                <div style={{ marginTop: '0.4rem', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.03em' }}>
                  ⏱ {Math.floor(elapsedSeconds / 60) > 0 ? `${Math.floor(elapsedSeconds / 60)}m ` : ''}
                  {elapsedSeconds % 60}s elapsed
                </div>
              </div>
            )}

            {checklistSuccess === true && (
              <div className="actions center-align mt-8" id="finish-onboard-btn">
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  <i className="ph ph-check-circle" style={{ color: '#22c55e', marginRight: '0.4rem' }}></i>
                  Success! Navigating to your dashboard…
                </div>
                <button className="btn primary" onClick={() => { if (autoNavRef.current) clearTimeout(autoNavRef.current); navigate('screen-dashboard'); }}>
                  Take me to my Dashboard <i className="ph ph-arrow-right" aria-hidden="true"></i>
                </button>
              </div>
            )}

            {checklistSuccess === false && (
              <div className="actions center-align mt-8" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
                <div
                  style={{
                    padding: '0.75rem 1.25rem',
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    borderRadius: '10px',
                    fontSize: '0.82rem',
                    color: 'var(--text-muted)',
                    textAlign: 'center',
                    maxWidth: '420px',
                  }}
                >
                  <i className="ph ph-warning-circle" style={{ marginRight: '0.4rem', color: '#f87171' }}></i>
                  AI processing encountered an issue. You can retry, or use <strong>Load Data Manually</strong> to load
                  your CSV data without AI — some columns may need review.
                </div>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button className="btn secondary outline" onClick={() => navigate('screen-onboard-2')}>
                    <i className="ph ph-arrow-left"></i> Go Back &amp; Retry
                  </button>
                  <button
                    className="btn primary"
                    onClick={handleManualFallback}
                    title="Parse your CSV files locally without AI — no Gemini required"
                  >
                    <i className="ph ph-table"></i> Load Data Manually
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      )}
    </>
  );
};

export default UploadOnboarding;