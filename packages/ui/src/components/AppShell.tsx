import React from 'react';
import { MenuBar } from './MenuBar.js';
import { StatusBar } from './StatusBar.js';

export interface AppShellProps {
  readonly children?: React.ReactNode;
  readonly onCommand: (commandId: string) => void;
}

export const AppShell = React.memo(function AppShell({ children, onCommand }: AppShellProps) {
  return (
    <div className="app-shell">
      <header role="banner">
        <MenuBar onCommand={onCommand} />
      </header>
      <main role="main" className="workspace">
        {children}
      </main>
      <StatusBar />
    </div>
  );
});
