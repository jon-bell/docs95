import React from 'react';
import { useUIStore } from '../stores/ui-store.js';

export const StatusBar = React.memo(function StatusBar() {
  const activePage = useUIStore((s) => s.activePage);
  const totalPages = useUIStore((s) => s.totalPages);
  const statusText = useUIStore((s) => s.statusText);

  return (
    <div role="status" aria-label="Status bar" className="status-bar" aria-live="polite">
      <span
        className="status-region status-region-page"
        aria-label={`Page ${activePage} of ${totalPages}`}
      >
        {`Page ${activePage} of ${totalPages}`}
      </span>
      {statusText.length > 0 && (
        <span className="status-region status-region-text">{statusText}</span>
      )}
      <span className="status-region status-region-mode" aria-label="Insert mode">
        INS
      </span>
    </div>
  );
});
