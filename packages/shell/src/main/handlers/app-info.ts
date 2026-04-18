import { app } from 'electron';
import type { VersionRequest, VersionResponse } from '@word/ipc-schema';

export function appVersion(_params: VersionRequest): VersionResponse {
  return {
    app: app.getVersion(),
    electron: process.versions['electron'] ?? '',
    chrome: process.versions['chrome'] ?? '',
    node: process.versions['node'] ?? '',
  };
}
