import { useEffect, useRef, useState } from 'react';

// Progressive ("lazy") rendering for long lists. Renders `pageSize` items up
// front and reveals another `pageSize` each time the sentinel scrolls into
// view. The full array stays in memory, so search / sort / totals still run
// over the whole set — this only caps how many DOM rows exist at once.
//
// `resetKey` collapses the window back to the first page whenever the list's
// context changes (new date range, search term, sort order). Pass a string
// that changes with those inputs — the array's identity alone can't be used,
// since a filtered array is a fresh reference on every render.
export function useProgressiveList<T>(items: T[], resetKey: string, pageSize = 150) {
  const [count, setCount] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCount(pageSize);
  }, [resetKey, pageSize]);

  const shown = items.slice(0, count);
  const hasMore = count < items.length;

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    // Re-create the observer after each reveal (count in deps) so it re-checks
    // intersection — this keeps loading when the sentinel stays visible on a
    // short list, which IntersectionObserver wouldn't re-fire for on its own.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setCount((c) => c + pageSize);
      },
      { rootMargin: '600px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, pageSize, count]);

  return { shown, hasMore, sentinelRef, shownCount: shown.length, total: items.length };
}
