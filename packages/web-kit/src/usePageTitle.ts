import { useEffect } from 'react';

/** Keeps the browser tab title in sync with the page, for history and screen readers. */
export function usePageTitle(title: string | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} · Plateia` : 'Plateia';
  }, [title]);
}
