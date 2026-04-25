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
import { auth, googleProvider } from './firebase';

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
  const [sessionData, setSessionData] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState({
    beneficiaries: null,
    inventory: null,
    donors: null,
  });
  const [currentScreen, setCurrentScreen] = useState('screen-login');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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
        const res = await fetch(`${API_BASE_URL}/status/${jobId}`);
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(extractErrorMessage(payload, 'Polling failed'));
        }

        const data = await res.json();

        if (data.status === 'completed') {
          return data;
        }

        if (data.status === 'failed') {
          throw new Error(data.error || 'Job failed on the server');
        }

        await delay(1500);
      } catch (error) {
        if (attempts >= 5) {
          throw error;
        }
        await delay(3000);
      }
    }
  };

  const uploadAndCleanFiles = async (setChecklistStep, setChecklistSuccess) => {
    const files = Object.entries(uploadedFiles).filter(([, file]) => !!file);
    if (!files.length) {
      toast.error('Please select at least one file to upload.');
      navigate('screen-onboard-2', { silent: true });
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
      setChecklistStep?.(4);
      setChecklistSuccess(true);
    } catch (error) {
      setChecklistSuccess(false);
      toast.error(error.message || 'Upload failed. Please try again.');
    }
  };

  const runQuery = async (question) => {
    if (!question) return null;

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

  const value = useMemo(
    () => ({
      cleanedData,
      currentScreen,
      sessionData,
      uploadedFiles,
      setUploadedFiles,
      user,
      loading,
      signInWithGoogle,
      navigate,
      logout,
      uploadAndCleanFiles,
      runQuery,
      API_BASE_URL,
    }),
    [
      cleanedData,
      currentScreen,
      sessionData,
      uploadedFiles,
      user,
      loading,
      signInWithGoogle,
      navigate,
      logout,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
