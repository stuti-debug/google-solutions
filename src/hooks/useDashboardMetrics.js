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

    if (cleanedData && cleanedData.fileType === 'multiple') {
      setMetrics({
        recordCount: cleanedData.recordCount || 0,
        totalFixed: cleanedData.summary?.totalFixed || 0,
        removedDuplicates: cleanedData.summary?.removedDuplicates || 0,
        droppedInvalidRows: cleanedData.summary?.droppedInvalidRows || 0,
        errorLogs: cleanedData.summary?.error_logs || [],
      });
      return;
    }

    let currentSessionMap = sessionData;
    if (!currentSessionMap) {
      try {
        const raw = localStorage.getItem('crisisgrid_session');
        currentSessionMap = raw?.startsWith('{') ? JSON.parse(raw) : raw;
      } catch (e) {
        currentSessionMap = null;
      }
    }

    if (!currentSessionMap) {
      setMetrics(EMPTY_METRICS);
      return;
    }

    let cancelled = false;

    const fetchAllMetrics = async () => {
      let sessionIds = [];
      if (typeof currentSessionMap === 'object') {
        sessionIds = Object.values(currentSessionMap);
      } else {
        sessionIds = [currentSessionMap];
      }

      let totalRecordCount = 0;
      let totalFixed = 0;
      let totalDuplicates = 0;
      let totalDropped = 0;
      const allLogs = [];

      await Promise.all(sessionIds.map(async (sId) => {
        try {
          const res = await fetch(`${API_BASE_URL}/data/${sId}?page=1&limit=1`);
          if (res.ok) {
            const data = await res.json();
            totalRecordCount += data.total_records || 0;
            totalFixed += data.summary?.totalFixed || 0;
            totalDuplicates += data.summary?.removedDuplicates || 0;
            totalDropped += data.summary?.droppedInvalidRows || 0;
            if (data.summary?.error_logs) {
              allLogs.push(...data.summary.error_logs);
            }
          }
        } catch(err) {
          console.error("Failed to fetch metrics for", sId, err);
        }
      }));

      if (!cancelled) {
        setMetrics({
          recordCount: totalRecordCount,
          totalFixed: totalFixed,
          removedDuplicates: totalDuplicates,
          droppedInvalidRows: totalDropped,
          errorLogs: allLogs,
        });
      }
    };

    fetchAllMetrics();

    return () => {
      cancelled = true;
    };
  }, [cleanedData, sessionData, API_BASE_URL, user]);

  useEffect(() => {
    if (!user) {
      setLoadingInsights(false);
      return;
    }

    let currentSessionMap = sessionData;
    if (!currentSessionMap) {
      try {
        const raw = localStorage.getItem('crisisgrid_session');
        currentSessionMap = raw?.startsWith('{') ? JSON.parse(raw) : raw;
      } catch (e) {
        currentSessionMap = null;
      }
    }

    if (!currentSessionMap) {
      setLoadingInsights(false);
      return;
    }

    let sessionIds = [];
    if (typeof currentSessionMap === 'object') {
      sessionIds = Object.values(currentSessionMap);
    } else {
      sessionIds = [currentSessionMap];
    }

    let cancelled = false;
    setLoadingInsights(true);

    const fetchInsights = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/insights`, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ session_ids: sessionIds })
        });
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
