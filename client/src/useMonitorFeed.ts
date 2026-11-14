import { useEffect, useState } from 'react';
import { API_BASE } from './fire-data';
import { loadObservations } from './fire-api';
import type { FireCollection } from './analytics-model';

/** Independent feed state keeps monitoring refreshes from replacing research selections. */
export function useMonitorFeed() {
  const [collection, setCollection] = useState<FireCollection | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    async function refresh() {
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const next = await loadObservations(API_BASE, controller.signal);
        if (!stopped) {
          setCollection(previous => next.metadata.feed_status === 'stale'
            ? (previous ? { ...previous, metadata: { ...previous.metadata, feed_status: 'stale' } } : next) : next);
          if (next.metadata.feed_status !== 'stale') setCheckedAt(Date.now());
          setError('');
        }
      } catch { if (!stopped) setError('Feed update unavailable. The last successful response is retained.'); }
      finally { clearTimeout(timeout); if (!stopped) { setLoading(false); timer = setTimeout(() => void refresh(), 60000); } }
    }
    void refresh();
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); };
  }, []);
  return { collection, checkedAt, error, loading };
}
