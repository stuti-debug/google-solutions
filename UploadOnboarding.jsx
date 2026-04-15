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
        <section id="screen-onboard-1" className="screen active fade-in flex-center">
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
                  <i className={`ph ${option.icon} option-icon`}></i>
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
                Next <i className="ph ph-arrow-right"></i>
              </button>
            </div>
          </div>
        </section>
      )}

      {stepNumber === 2 && (
        <section id="screen-onboard-2" className="screen active fade-in flex-center">
          <div className="onboard-container wide">
            <button className="btn minimal icon-left mb-4" onClick={() => navigate('screen-onboard-1')}>
              <i className="ph ph-arrow-left"></i> Back
            </button>
            <h2>Upload your data</h2>
            <p>Don't worry about messy columns or missing values — our AI handles that.</p>
            
            <div className="upload-categories mt-6">
              {['beneficiaries', 'inventory', 'donors'].map(category => (
                <div className="upload-column" key={category}>
                  <h4 className="category-title" style={{ textTransform: 'capitalize' }}>
                    <i className={`ph ${category === 'beneficiaries' ? 'ph-users' : category === 'inventory' ? 'ph-package' : 'ph-hand-coins'}`}></i> 
                    {category}
                  </h4>
                  <label 
                    className={`upload-box ${uploadedFiles[category] ? 'drag-over' : ''}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleFileDrop(e, category)}
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
                  >
                    <i className="ph ph-cloud-arrow-up text-primary"></i>
                    <span>{uploadedFiles[category] ? uploadedFiles[category].name : 'Drop files here or click'}</span>
                    <div className="badges"><span className="badge file-badge">CSV</span><span className="badge file-badge">XLSX</span></div>
                    <input 
                      type="file" 
                      accept=".csv,.xlsx,.xls" 
                      style={{ display: 'none' }}
                      onChange={(e) => handleFileSelect(e, category)}
                    />
                  </label>
                </div>
              ))}
            </div>
            <p className="text-muted text-center mt-4" style={{ fontSize: '0.9rem' }}>You can skip any category and upload it later.</p>
            <div className="alert-box info-light mt-4 p-4 text-center" style={{ borderRadius: '8px', fontSize: '0.85rem' }}>
               <strong>MVP Notice:</strong> Files are processed sequentially. Future metrics will be bound to a single persistent session.
            </div>

            <div className="actions right-align mt-6">
              <button className="btn primary" onClick={handleUploadAndAnalyze}>Upload & Analyse <i className="ph ph-arrow-right"></i></button>
            </div>
          </div>
        </section>
      )}

      {stepNumber === 3 && (
        <section id="screen-onboard-3" className="screen active fade-in flex-center">
          <div className="processing-container">
            <h2 className="text-center mb-6">CrisisGrid is working its magic</h2>
            
            <div className="ai-loader mx-auto">
              <div className="circle primary-ring"></div>
              <div className="circle accent-ring"></div>
              <i className="ph ph-magic-wand ai-icon"></i>
            </div>
            
            <div className="checklist mt-8" id="ai-checklist">
              {renderCheckItem(0, "Reading your files...")}
              {renderCheckItem(1, "Detecting column types...")}
              {renderCheckItem(2, "Cleaning inconsistencies...")}
              {renderCheckItem(3, "Generating insights...")}
            </div>

            {checklistSuccess && (
              <div className="actions center-align mt-8" id="finish-onboard-btn">
                <button className="btn primary" onClick={() => navigate('screen-dashboard')}>Take me to my Dashboard <i className="ph ph-arrow-right"></i></button>
              </div>
            )}
            {checklistSuccess === false && (
               <div className="actions center-align mt-8">
                 <button className="btn secondary outline" onClick={() => navigate('screen-onboard-2')}>Go Back</button>
               </div>
            )}
          </div>
        </section>
      )}
    </>
  );
};

export default UploadOnboarding;
