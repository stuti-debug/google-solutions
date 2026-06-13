import React, { useState, useEffect } from 'react';
import { useAppContext } from '../AppContext';
import toast from 'react-hot-toast';

const UploadOnboarding = () => {
  const { currentScreen, navigate, uploadedFiles, setUploadedFiles, uploadAndCleanFiles } = useAppContext();
  const [selectedNGO, setSelectedNGO] = useState('');
  const [checklistStep, setChecklistStep] = useState(0);
  const [checklistSuccess, setChecklistSuccess] = useState(null);

  const stepNumber = parseInt(currentScreen.replace('screen-onboard-', ''), 10);

  useEffect(() => {
    let timer;
    if (stepNumber === 3) {
      if (checklistSuccess === null) {
        timer = setInterval(() => {
          setChecklistStep((prev) => (prev + 1) % 5);
        }, 900);
      } else if (checklistSuccess) {
        setChecklistStep(4); // Set to fully completed visual
      } else if (checklistSuccess === false) {
        if (timer) clearInterval(timer);
      }
    }
    return () => clearInterval(timer);
  }, [stepNumber, checklistSuccess]);

  const handleFileDrop = (e, category) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      setUploadedFiles(prev => ({ ...prev, [category]: file }));
    }
  };

  const handleFileSelect = (e, category) => {
    const file = e.target.files[0];
    if (file) {
      setUploadedFiles(prev => ({ ...prev, [category]: file }));
    }
  };

  const handleUploadAndAnalyze = () => {
    navigate('screen-onboard-3');
    setChecklistSuccess(null);
    setChecklistStep(0);
    uploadAndCleanFiles(setChecklistStep, setChecklistSuccess);
  };

  const renderCheckItem = (stepIndex, text) => {
    let iconClass = "ph ph-circle spinner-icon";
    let textClass = "";

    if (checklistSuccess === true) {
      iconClass = "ph ph-check-circle";
      textClass = "completed";
    } else if (checklistSuccess === false) {
      iconClass = "ph ph-warning-circle text-error";
    } else if (checklistStep > stepIndex) {
      iconClass = "ph ph-check-circle";
      textClass = "completed";
    } else if (checklistStep === stepIndex) {
      iconClass = "ph ph-circle-notch ph-spin text-primary";
      textClass = "active";
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
              ].map(option => (
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
                  if (!selectedNGO) {
                    toast.error('Please select an NGO type.');
                    return;
                  }
                  navigate('screen-onboard-2')
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
              {['beneficiaries', 'inventory', 'donors'].map(category => (
                <div className="upload-column" key={category}>
                  <h4 className="category-title" style={{ textTransform: 'capitalize' }}>
                    <i className={`ph ${category === 'beneficiaries' ? 'ph-users' : category === 'inventory' ? 'ph-package' : 'ph-hand-coins'}`} aria-hidden="true"></i> 
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
                    <div className="badges"><span className="badge file-badge">CSV</span><span className="badge file-badge">XLSX</span></div>
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
            <p className="text-muted text-center mt-4" style={{ fontSize: '0.9rem' }}>You can skip any category and upload it later.</p>
            <div className="alert-box info-light mt-4 p-4 text-center" style={{ borderRadius: '8px', fontSize: '0.85rem' }}>
              <strong>Workspace Configured:</strong> Files are processed securely and linked to your current crisis workspace.
            </div>

            <div className="actions right-align mt-6">
              <button className="btn primary" onClick={handleUploadAndAnalyze}>Upload & Analyse <i className="ph ph-arrow-right" aria-hidden="true"></i></button>
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
              {renderCheckItem(0, "Reading your files...")}
              {renderCheckItem(1, "Detecting column types...")}
              {renderCheckItem(2, "Cleaning inconsistencies...")}
              {renderCheckItem(3, "Generating insights...")}
            </div>

            {checklistSuccess && (
              <div className="actions center-align mt-8" id="finish-onboard-btn">
                <button className="btn primary" onClick={() => navigate('screen-dashboard')}>Take me to my Dashboard <i className="ph ph-arrow-right" aria-hidden="true"></i></button>
              </div>
            )}
            {checklistSuccess === false && (
               <div className="actions center-align mt-8" style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                 <button className="btn secondary outline" onClick={() => navigate('screen-onboard-2')}>Go Back</button>
                 <button className="btn primary outline" onClick={() => toast.error('Fallback to Manual Mapping (Coming Soon)')}>Manual Mapping (Fallback)</button>
               </div>
            )}
          </div>
        </main>
      )}
    </>
  );
};

export default UploadOnboarding;