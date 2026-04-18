import '@word/ui/styles.css';
import '@word/render/styles.css';
import './styles.css';

import { createRoot } from 'react-dom/client';
import React from 'react';
import { App } from './app.js';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
