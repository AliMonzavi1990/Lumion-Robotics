import { useEffect, useState } from "react";

// Calls fetcher() now and then again every intervalMs.
// Keeps the last good data if a request fails.
// fetcher must keep the same identity between renders (see api.js and useMemo).
export function usePolling(fetcher, intervalMs = 2000) {
  const [state, setState] = useState({ data: null, error: null, loading: true });

  useEffect(() => {
    let active = true;
    let timer;

    async function load() {
      try {
        const data = await fetcher();
        if (active) setState({ data, error: null, loading: false });
      } catch (error) {
        if (active) setState((prev) => ({ data: prev.data, error, loading: false }));
      }
      if (active) timer = setTimeout(load, intervalMs);
    }

    load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [fetcher, intervalMs]);

  return state;
}
