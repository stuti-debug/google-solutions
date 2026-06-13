import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import toast from 'react-hot-toast';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, googleProvider, db } from './firebase';
import { apiFetch } from './utils/api';
import { addSessionToHistory, incrementUsage } from './utils/usageTracker';


export const AppContext = createContext();

export const useAppContext = () => useContext(AppContext);

const protectedScreens = new Set([
  'screen-onboard-1',
  'screen-onboard-2',
  'screen-onboard-3',
  'screen-dashboard',
  'screen-nlq',
  'screen-reports',
  'screen-profile',
]);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const AppProvider = ({ children }) => {
  const [cleanedData, setCleanedData] = useState(null);
  const [cleanedDataMap, setCleanedDataMap] = useState({});
  const [sessionData, setSessionData] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState({
    beneficiaries: null,
    inventory: null,
    donors: null,
  });
  const [currentScreen, setCurrentScreen] = useState('screen-login');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Incrementing this counter tells every data-fetching component to re-fetch
  const [dataVersion, setDataVersion] = useState(0);
  const bumpDataVersion = useCallback(() => setDataVersion((v) => v + 1), []);

  const API_BASE_URL = import.meta.env.VITE_API_URL || '';

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
    const normalize = (result) => ({
      status: 'success',
      fileType: result.fileType || 'unknown',
      recordCount: 0,
      cleanedDocuments: [],
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

  const navigate = useCallback(
    (screenId, options = {}) => {
      const { silent = false } = options;

      if (protectedScreens.has(screenId) && !user) {
        setCurrentScreen('screen-login');
        if (!silent) {
          toast.error('Please sign in to continue.');
        }
        return false;
      }

      setCurrentScreen(screenId);
      return true;
    },
    [user],
  );

  const pollJobStatus = async (jobId) => {
    const maxPollingTime = 5 * 60 * 1000;
    const maxAttempts = 200;
    const startTime = Date.now();
    let attempts = 0;

    while (true) {
      if (Date.now() - startTime > maxPollingTime) {
        throw new Error('Cleaning job timed out after 5 minutes. Please try again.');
      }

      if (attempts >= maxAttempts) {
        throw new Error('Maximum polling attempts reached. The job may be stuck.');
      }

      attempts += 1;

      try {
        const res = await apiFetch(`${API_BASE_URL}/status/${jobId}`);
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(extractErrorMessage(payload, 'Polling failed'));
        }

        const data = await res.json();

        if (data.status === 'completed') {
          return data;
        }

        if (data.status === 'failed') {
          // Add a special marker so the catch block knows it's a server failure
          throw new Error(`JOB_FAILED: ${data.error || 'Job failed on the server'}`);
        }

        await delay(1500);
      } catch (error) {
        if (error.message && error.message.includes('JOB_FAILED')) {
          // Strip the marker and throw the actual error to stop polling
          throw new Error(error.message.replace('JOB_FAILED: ', ''));
        }
        if (attempts >= 5) {
          throw error;
        }
        await delay(3000);
      }
    }
  };

  const generateUUID = () => {
    return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const uploadAndCleanFiles = async (setChecklistStep, setChecklistSuccess) => {
    const selectedFiles = [
      { file: uploadedFiles.beneficiaries, category: 'beneficiary' },
      { file: uploadedFiles.inventory, category: 'inventory' },
      { file: uploadedFiles.donors, category: 'donor' },
    ].filter((f) => f.file);

    if (selectedFiles.length === 0) {
      toast.error('Please upload at least one file.');
      return;
    }

    setChecklistStep?.(0);
    setChecklistSuccess(null);

    const batchSessionId = generateUUID();

    try {
      const uploadTasks = selectedFiles.map((fObj) => {
        return async () => {
          const category = fObj.category;
          const file = fObj.file;
          const formData = new FormData();
          formData.append('file', file, file.name || `${category}.csv`);
          formData.append('session_id', batchSessionId);

          const response = await apiFetch(`${API_BASE_URL}/clean`, {
            method: 'POST',
            body: formData,
          });

          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(extractErrorMessage(payload, `Upload failed for ${category}`));
          }

          const jobResult = await pollJobStatus(payload.job_id);
          return { ...jobResult, category };
        };
      });

      const uploadConcurrency = 1;
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
          () => worker(),
        );
        await Promise.all(workers);
        return results;
      };

      const responses = await runWithConcurrency(uploadTasks, uploadConcurrency);
      const mergedData = mergeCleanResults(responses);
      
      localStorage.setItem('crisisgrid_session', batchSessionId);
      setSessionData(batchSessionId);

      const newDataMap = {};
      const fetchPromises = responses.map(async (res) => {
        const type = res.category;
        try {
          const dataRes = await apiFetch(`${API_BASE_URL}/data/${batchSessionId}?page=1&limit=200&file_type=${type}`);
          if (dataRes.ok) {
            const dataPayload = await dataRes.json();
            newDataMap[type] = dataPayload.rows || [];
          }
        } catch (fetchErr) {
          console.error(`Failed to fetch records for ${type}:`, fetchErr);
        }
      });
      await Promise.all(fetchPromises);
      setCleanedDataMap(newDataMap);
      
      // Clear cleanedData to force DashboardTabs and DataCharts to fetch fresh data from the server
      setCleanedData(null);

      // Track session history and upload stats for Profile page
      const totalRecords = responses.reduce((sum, r) => sum + (r?.recordCount || 0), 0);
      const fileTypes = responses.map((r) => r?.category).filter(Boolean);
      addSessionToHistory(batchSessionId, {
        recordCount: totalRecords,
        fileTypes,
        label: `Upload – ${new Date().toLocaleString()}`,
      });
      incrementUsage('uploads');

      setChecklistStep?.(4);
      setChecklistSuccess(true);
    } catch (error) {
      setChecklistSuccess(false);
      toast.error(error.message || 'Upload failed. Please try again.');
    }
  };

  const runQuery = async (question) => {
    if (!question) return null;

    let storedSession = sessionData || localStorage.getItem('crisisgrid_session');

    if (!storedSession) {
      toast.error('No active session found. Please upload data.');
      return null;
    }

    try {
      const response = await apiFetch(`${API_BASE_URL}/query`, {
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

  const signInWithGoogle = useCallback(async () => {
    try {
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, googleProvider);
      setUser(result.user);

      const hasExistingSession = Boolean(localStorage.getItem('crisisgrid_session'));
      setCurrentScreen(hasExistingSession ? 'screen-dashboard' : 'screen-onboard-1');
      toast.success(`Welcome${result.user.displayName ? `, ${result.user.displayName}` : ''}.`);
    } catch (error) {
      console.error('Sign in error:', error);
      toast.error(error.code === 'auth/popup-closed-by-user'
        ? 'Sign-in was cancelled.'
        : 'Failed to sign in with Google.');
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
      setCleanedData(null);
      setSessionData(null);
      setUploadedFiles({
        beneficiaries: null,
        inventory: null,
        donors: null,
      });
      localStorage.removeItem('crisisgrid_session');
      setCurrentScreen('screen-login');
      toast.success('Logged out successfully.');
    } catch (error) {
      toast.error('Logout failed.');
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

      if (!firebaseUser) {
        setCurrentScreen('screen-login');
        return;
      }

      setCurrentScreen((previousScreen) => {
        if (previousScreen && previousScreen !== 'screen-login') {
          return previousScreen;
        }

        return localStorage.getItem('crisisgrid_session')
          ? 'screen-dashboard'
          : 'screen-onboard-1';
      });
    });

    return () => unsubscribe();
  }, []);

  // Subscribe to Cloud Firestore real-time session changes for multiplayer collaboration
  useEffect(() => {
    const sessionId = sessionData || localStorage.getItem('crisisgrid_session');
    if (!sessionId || !user) return;

    const sessionDocRef = doc(db, 'sessions', sessionId);
    const unsubscribe = onSnapshot(
      sessionDocRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          // Fetch fresh rows from the database cache using apiFetch
          try {
            const typeEntries = await Promise.all(
              ['beneficiary', 'inventory', 'donor'].map(async (fileType) => {
                const res = await apiFetch(`${API_BASE_URL}/data/${sessionId}?page=1&limit=200&file_type=${fileType}`);
                if (!res.ok) return [fileType, []];
                const payload = await res.json();
                return [fileType, payload.rows || []];
              }),
            );
            setCleanedDataMap(Object.fromEntries(typeEntries));
          } catch (err) {
            console.error("Error updating real-time session sync:", err);
          }
        }
      },
      (firestoreError) => {
        // Gracefully handle Firestore permission errors — real-time sync is
        // an optional enhancement; the core app works without it.
        if (firestoreError?.code === 'permission-denied') {
          console.warn(
            '[CrisisGrid] Firestore snapshot: permission-denied. ' +
            'Real-time multi-user sync is disabled. ' +
            'Update Firestore Security Rules to enable it.',
          );
        } else {
          console.warn('[CrisisGrid] Firestore snapshot error (non-fatal):', firestoreError?.message);
        }
      },
    );

    return () => unsubscribe();
  }, [sessionData, user, API_BASE_URL]);


  const value = useMemo(
    () => ({
      cleanedData,
      cleanedDataMap,
      currentScreen,
      sessionData,
      uploadedFiles,
      setUploadedFiles,
      setCleanedDataMap,
      setSessionData,
      user,
      loading,
      signInWithGoogle,
      navigate,
      logout,
      uploadAndCleanFiles,
      runQuery,
      API_BASE_URL,
      dataVersion,
      bumpDataVersion,
    }),
    [
      cleanedData,
      cleanedDataMap,
      currentScreen,
      sessionData,
      uploadedFiles,
      user,
      loading,
      signInWithGoogle,
      navigate,
      logout,
      dataVersion,
      bumpDataVersion,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
