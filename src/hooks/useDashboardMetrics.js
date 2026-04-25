import { useEffect, useState } from 'react';
import { useAppContext } from '../AppContext';

const EMPTY_METRICS = {
  recordCount: 0,
  totalFixed: 0,
  removedDuplicates: 0,
  droppedInvalidRows: 0,
  errorLogs: [],
};

export const useDashboardMetrics = () => {
  const { cleanedData, sessionData, API_BASE_URL, navigate, user, loading } = useAppContext();
  const [floatingQuery, setFloatingQuery] = useState('');
  const [insights, setInsights] = useState([]);
  const [loadingInsights, setLoadingInsights] = useState(true);
  const [metrics, setMetrics] = useState(EMPTY_METRICS);

  useEffect(() => {
    if (!loading && !user) {
      navigate('screen-login', { silent: true });
    }
  }, [loading, navigate, user]);

  useEffect(() => {
    if (!user) return;

    const sessionId = sessionData || localStorage.getItem('crisisgrid_session');
    if (cleanedData) {
      setMetrics({
        recordCount: cleanedData.recordCount || 0,
        totalFixed: cleanedData.summary?.totalFixed || 0,
        removedDuplicates: cleanedData.summary?.removedDuplicates || 0,
        droppedInvalidRows: cleanedData.summary?.droppedInvalidRows || 0,
        errorLogs: cleanedData.summary?.error_logs || [],
      });
      return;
    }

    if (!sessionId) {
      setMetrics(EMPTY_METRICS);
      return;
    }

    let cancelled = false;
    fetch(`${API_BASE_URL}/data/${sessionId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setMetrics({
          recordCount: data.total_records || 0,
          totalFixed: data.summary?.totalFixed || 0,
          removedDuplicates: data.summary?.removedDuplicates || 0,
          droppedInvalidRows: data.summary?.droppedInvalidRows || 0,
          errorLogs: data.summary?.error_logs || [],
        });
      })
      .catch((err) => console.error('Failed to restore dashboard metrics', err));

    return () => {
      cancelled = true;
    };
  }, [cleanedData, sessionData, API_BASE_URL, user]);

  useEffect(() => {
    if (!user) {
      setLoadingInsights(false);
      return;
    }

    const sessionId = sessionData || localStorage.getItem('crisisgrid_session');
    if (!sessionId) {
      setLoadingInsights(false);
      return;
    }

    let cancelled = false;
    setLoadingInsights(true);

    const fetchInsights = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/insights/${sessionId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.insights)) {
          setInsights(data.insights);
        }
      } catch (err) {
        console.error('Failed to fetch insights', err);
      } finally {
        if (!cancelled) {
          setLoadingInsights(false);
        }
      }
    };

    fetchInsights();
    return () => {
      cancelled = true;
    };
  }, [API_BASE_URL, sessionData, user]);

  const openNlqIfReady = (event) => {
    if (event.key === 'Enter' && floatingQuery.trim()) {
      navigate('screen-nlq');
    }
  };

  return {
    user,
    metrics,
    insights,
    loadingInsights,
    floatingQuery,
    setFloatingQuery,
    openNlqIfReady,
  };
};

export default useDashboardMetrics;
