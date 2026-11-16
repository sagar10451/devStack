import { useCallback, useEffect, useRef, useState } from 'react';

function browserChoices(key: string): string[] | null {
  try {
    const saved = localStorage.getItem(key);
    if (saved === null) return null;
    const ids: unknown = JSON.parse(saved);
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && /^[a-z][a-z0-9_-]*$/.test(id)) : null;
  } catch { return null; }
}

export function useToolbarPreferences(siteId: string, topicSlug: string, subtopicSlug: string) {
  const key = JSON.stringify([siteId, topicSlug, subtopicSlug]);
  const cacheKey = `hiddenTools:${siteId}:${topicSlug}:${subtopicSlug}`;
  const [hiddenTools, setHiddenTools] = useState(() => new Set(browserChoices(cacheKey) || []));
  const choicesRef = useRef(hiddenTools);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const activeKey = useRef(key);
  const saves = useRef<Promise<void>>(Promise.resolve());
  const cache = useCallback((ids: string[]) => {
    try { localStorage.setItem(cacheKey, JSON.stringify(ids)); } catch { /* Shared file still saves when browser storage is unavailable. */ }
  }, [cacheKey]);
  const save = useCallback((ids: string[]) => {
    // Serialize rapid checkbox changes so an older request cannot overwrite
    // the user's final choices. The server updates only this lesson's entry.
    const operation = saves.current.then(async () => {
      const response = await fetch('/__toolbar-preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, hiddenTools: ids }) });
      if (!response.ok) throw new Error('Could not save toolbar choices to the shared file.');
    });
    saves.current = operation.catch(() => {});
    return operation;
  }, [key]);

  useEffect(() => {
    let cancelled = false;
    activeKey.current = key;
    setReady(false);
    setError('');
    const apply = (ids: string[]) => {
      const next = new Set(ids);
      choicesRef.current = next;
      setHiddenTools(next);
      cache(ids);
    };
    const local = browserChoices(cacheKey);
    apply(local || []);
    (async () => {
      const response = await fetch(`/__toolbar-preferences?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load shared toolbar choices. Using this browser’s saved choices.');
      const data = await response.json() as { hiddenTools: string[] | null };
      if (cancelled) return;
      if (data.hiddenTools !== null) apply(data.hiddenTools);
      else if (local !== null) await save(local); // One-time migration; never overwrite an existing shared entry.
    })().catch(error => { if (!cancelled) setError((error as Error).message); }).finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [key, cacheKey, cache, save]);

  const toggleTool = useCallback((id: string) => {
    if (!ready) return;
    const next = new Set(choicesRef.current);
    if (next.has(id)) next.delete(id); else next.add(id);
    choicesRef.current = next;
    setHiddenTools(next);
    const ids = [...next];
    cache(ids);
    void save(ids).then(() => {
      if (activeKey.current === key) setError('');
    }).catch(error => {
      if (activeKey.current === key) setError((error as Error).message);
    });
  }, [ready, key, cache, save]);
  return { hiddenTools, toggleTool, ready, error };
}
