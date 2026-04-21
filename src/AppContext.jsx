import React, { createContext, useState, useContext } from 'react';
import toast from 'react-hot-toast';

export const AppContext = createContext();

export const useAppContext = () => useContext(AppContext);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const AppProvider = ({ children }) => {
  const [cleanedData, setCleanedData] = useState(null);
  const [sessionData, setSessionData] = useState(null); // hold latest sessionId
  const [uploadedFiles, setUploadedFiles] = useState({
    beneficiaries: null,
    inventory: null,
    donors: null,
  });
  const [currentScreen, setCurrentScreen] = useState('screen-login');

  const API_BASE_URL = 'http://localhost:8000';

  const extractErrorMessage = (payload, fallbackMessage) => {
    if (!payload) return fallbackMessage;
    if (typeof payload === 'string') return payload;
    if (payload.detail) {
      if (typeof payload.detail === 'string') return payload.detail;
      if (payload.detail.message) return payload.detail.message;
    }
    if (payload.message) return payload.message;
    if (payload.error) return payload.error;
    return fallbackMessage;
  };

  const mergeCleanResults = (results) => {
    // Normalize single result to same shape as multi-result
    const normalize = (result) => ({
      status: 'success',
      fileType: result.fileType || 'unknown',
      recordCount: 0, // will be populated by /data fetch
      cleanedDocuments: [], // will be populated by /data fetch
      session_id: result.session_id,
      summary: {
        totalFixed: Number(result.summary?.totalFixed || 0),
        removedDuplicates: Number(result.summary?.removedDuplicates || 0),
        droppedInvalidRows: Number(result.summary?.droppedInvalidRows || 0),
        error_logs: result.summary?.error_logs || [],
        message: result.summary?.message || '',
      },
    });

    if (results.length === 1) return normalize(results[0]);

    const combined = {
      status: 'success',
      fileType: 'multiple',
      recordCount: 0,
      cleanedDocuments: [],
      session_id: results[results.length - 1].session_id,
      summary: {
        totalFixed: 0,
        removedDuplicates: 0,
        droppedInvalidRows: 0,
        error_logs: [],
      },
    };

    results.forEach((result) => {
      combined.summary.totalFixed += Number(result.summary?.totalFixed || 0);
      combined.summary.removedDuplicates += Number(result.summary?.removedDuplicates || 0);
      combined.summary.droppedInvalidRows += Number(result.summary?.droppedInvalidRows || 0);
      if (result.summary?.error_logs) {
        combined.summary.error_logs.push(...result.summary.error_logs);
      }
    });

    combined.summary.message = `Fixed ${combined.summary.totalFixed} errors, removed ${combined.summary.removedDuplicates} duplicates, dropped ${combined.summary.droppedInvalidRows} invalid rows.`;
    return combined;
  };

  const pollJobStatus = async (jobId) => {
    const MAX_POLLING_TIME = 5 * 60 * 1000; // 5 minutes timeout
    const startTime = Date.now();
    let attempts = 0;
    const MAX_ATTEMPTS = 200; // ~5 minutes with 1.5s delays

    while (true) {
      // Check timeout
      if (Date.now() - startTime > MAX_POLLING_TIME) {
        throw new Error('Cleaning job timed out after 5 minutes. Please try again.');
      }
      
      if (attempts >= MAX_ATTEMPTS) {
        throw new Error('Maximum polling attempts reached. The job may be stuck.');
      }
      
      attempts++;

      try {
        const res = await fetch(`${API_BASE_URL}/status/${jobId}`);
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(extractErrorMessage(payload, 'Polling failed'));
        }
        const data = await res.json();
        
        console.log(`Polling attempt ${attempts}: Status = ${data.status}`);
        
        if (data.status === 'completed') {
          return data; // contains session_id and summary
        }
        if (data.status === 'failed') {
          throw new Error(data.error || 'Job failed on the server');
        }
        if (data.status === 'processing' || data.status === 'pending') {
          await delay(1500); // Wait 1.5s before next check
          continue;
        }
        
        // Unknown status - wait and retry
        console.warn(`Unknown status: ${data.status}`);
        await delay(1500);
      } catch (error) {
        console.error(`Polling error on attempt ${attempts}:`, error);
        if (attempts >= 5) {
          throw error; // Re-throw after 5 failed attempts
        }
        await delay(3000); // Wait longer on errors
      }
    }
  };

  const uploadAndCleanFiles = async (setChecklistStep, setChecklistSuccess) => {
    const files = Object.entries(uploadedFiles).filter(([, file]) => !!file);
    if (!files.length) {
      toast.error('Please select at least one file to upload.');
      setCurrentScreen('screen-onboard-2');
      return;
    }

    try {
      const uploadTasks = files.map(([category, file]) => async () => {
        const formData = new FormData();
        formData.append('file', file, file.name || `${category}.csv`);

        const response = await fetch(`${API_BASE_URL}/clean`, {
          method: 'POST',
          body: formData,
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(extractErrorMessage(payload, `Upload failed for ${category}`));
        }

        const jobResult = await pollJobStatus(payload.job_id);
        
        if (jobResult.session_id) {
          localStorage.setItem('crisisgrid_session', jobResult.session_id);
          setSessionData(jobResult.session_id);
        }
        return jobResult;
      });

      const UPLOAD_CONCURRENCY = 1;
      const runWithConcurrency = async (tasks, limit) => {
        const results = new Array(tasks.length);
        let cursor = 0;

        const worker = async () => {
          while (true) {
            const taskIndex = cursor;
            cursor += 1;
            if (taskIndex >= tasks.length) return;
            results[taskIndex] = await tasks[taskIndex]();
          }
        };

        const workers = Array.from(
          { length: Math.min(limit, tasks.length) },
          () => worker()
        );
        await Promise.all(workers);
        return results;
      };

      const responses = await runWithConcurrency(uploadTasks, UPLOAD_CONCURRENCY);

      const mergedData = mergeCleanResults(responses);

      // Fetch actual records from the API to populate the dashboard table
      const finalSessionId = mergedData.session_id;
      if (finalSessionId) {
        try {
          const dataRes = await fetch(`${API_BASE_URL}/data/${finalSessionId}?page=1&limit=200`);
          if (dataRes.ok) {
            const dataPayload = await dataRes.json();
            mergedData.recordCount = dataPayload.total_records || 0;
            mergedData.cleanedDocuments = dataPayload.rows || [];
          }
        } catch (fetchErr) {
          console.error('Failed to fetch records after cleaning:', fetchErr);
        }
      }

      setCleanedData(mergedData);
      setChecklistSuccess(true);
      // Let the user see the success state and click "Take me to Dashboard"
    } catch (error) {
      setChecklistSuccess(false);
      toast.error(error.message || 'Upload failed. Please try again.');
      // Stay on step 3 so user sees the error checklist and can click "Go Back"
    }
  };

  const runQuery = async (question) => {
    if (!question) return null;
    
    // Retrieve latest session from State or LocalStorage
    const storedSession = sessionData || localStorage.getItem('crisisgrid_session');
    
    if (!storedSession) {
      toast.error('No active session found. Please upload data.');
      return null;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question,
          session_id: storedSession,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(extractErrorMessage(payload, 'Query failed.'));
      }
      return payload;
    } catch (error) {
      toast.error(error.message || 'Query failed.');
      return null;
    }
  };

  const navigate = (screenId) => {
    setCurrentScreen(screenId);
  };

  const logout = () => {
    setCleanedData(null);
    setSessionData(null);
    localStorage.removeItem('crisisgrid_session');
    setUploadedFiles({
      beneficiaries: null,
      inventory: null,
      donors: null,
    });
    setCurrentScreen('screen-login');
  };

  return (
    <AppContext.Provider
      value={{
        cleanedData,
        sessionData,
        uploadedFiles,
        setUploadedFiles,
        currentScreen,
        navigate,
        logout,
        uploadAndCleanFiles,
        runQuery,
        API_BASE_URL,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
