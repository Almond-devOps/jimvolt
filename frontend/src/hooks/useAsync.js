import { useCallback, useEffect, useState } from 'react';

const RETRY_DELAYS_MS = [1500, 4000];

/**
 * Runs an async loader and tracks loading and error state. A failed load is retried
 * automatically (a brief database or network hiccup should not leave a blank section),
 * and `retry` lets the user try again after the automatic attempts are used up.
 */
export default function useAsync(loader) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer;
    const run = (retries) => {
      loader()
        .then((data) => alive && setState({ data, loading: false, error: null }))
        .catch(() => {
          if (!alive) return;
          if (retries < RETRY_DELAYS_MS.length) {
            timer = window.setTimeout(() => run(retries + 1), RETRY_DELAYS_MS[retries]);
            return;
          }
          setState({ data: null, loading: false, error: 'Could not load this section.' });
        });
    };
    setState((current) => (current.loading ? current : { data: null, loading: true, error: null }));
    run(0);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, retry };
}
