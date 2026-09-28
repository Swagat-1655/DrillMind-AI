import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: (value: T | null) => void;
}

/** Runs an async loader, re-running whenever `deps` change. */
export function useAsync<T>(loader: (signal: AbortSignal) => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    loaderRef
      .current(controller.signal)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((err: unknown) => {
        if (!active || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { data, loading, error, reload, setData };
}

/** Repeatedly calls `tick` on an interval while `enabled` is true. */
export function usePolling(tick: () => void, ms: number, enabled = true): void {
  const tickRef = useRef(tick);
  tickRef.current = tick;
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => tickRef.current(), ms);
    return () => window.clearInterval(id);
  }, [ms, enabled]);
}

/** A ticking clock, restarting from zero on unmount. */
export function useTicker(ms: number): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setValue((v) => v + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return value;
}

export function useLocalStorage<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          /* storage unavailable — keep in-memory */
        }
        return resolved;
      });
    },
    [key],
  );
  return [value, update];
}

/** Blends a target number smoothly, for KPI read-outs that should "settle". */
export function useAnimatedNumber(target: number, duration = 700): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef(0);

  useEffect(() => {
    fromRef.current = value;
    startRef.current = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(fromRef.current + (target - fromRef.current) * eased);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return value;
}

/** Observes an element's size — used to keep SVG charts responsive. */
export function useElementSize<T extends HTMLElement>(): [React.RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(node);
    setSize({ width: node.clientWidth, height: node.clientHeight });
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

/** Debounces a rapidly changing value (search boxes, sliders). */
export function useDebounced<T>(value: T, delay = 220): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function useClickOutside<T extends HTMLElement>(onOutside: () => void): React.RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const handler = useRef(onOutside);
  handler.current = onOutside;
  useEffect(() => {
    const listener = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) handler.current();
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, []);
  return ref;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const listener = () => setMatches(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);
  return matches;
}

export function useCopyToClipboard(): (text: string) => void {
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(null), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);
  return useCallback((text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopied(text);
  }, []);
}

/** Groups an array by a key selector. */
export function useGrouped<T, K extends string | number>(items: T[], key: (item: T) => K): Map<K, T[]> {
  return useMemo(() => {
    const map = new Map<K, T[]>();
    for (const item of items) {
      const k = key(item);
      const list = map.get(k);
      if (list) list.push(item);
      else map.set(k, [item]);
    }
    return map;
  }, [items, key]);
}
