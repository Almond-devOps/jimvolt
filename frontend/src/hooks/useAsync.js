import { useEffect, useState } from 'react';

/** Runs an async loader once and tracks loading and error state. */
export default function useAsync(loader) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  useEffect(() => {
    let alive = true;
    loader()
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch(() => alive && setState({ data: null, loading: false, error: 'Could not load this section. Refresh to try again.' }));
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
