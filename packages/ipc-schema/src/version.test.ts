import { describe, it, expect } from 'vitest';
import { CHANNEL_NAMES, EVENT_NAMES } from './index';

describe('Version and Metadata', () => {
  it('CHANNEL_NAMES contains exactly 8 channels', () => {
    expect(CHANNEL_NAMES.length).toBe(8);
  });

  it('CHANNEL_NAMES contains all required channels', () => {
    const required = [
      'file.openDialog',
      'file.saveDialog',
      'file.readBytes',
      'file.writeBytes',
      'print.toPDF',
      'window.setTitle',
      'app.version',
      'shell.openExternal',
    ];

    for (const channel of required) {
      expect(CHANNEL_NAMES).toContain(channel as (typeof CHANNEL_NAMES)[number]);
    }
  });

  it('EVENT_NAMES contains exactly 2 events', () => {
    expect(EVENT_NAMES.length).toBe(2);
  });

  it('EVENT_NAMES contains all required events', () => {
    const required = ['menu.command', 'document.externalChange'];

    for (const event of required) {
      expect(EVENT_NAMES).toContain(event as (typeof EVENT_NAMES)[number]);
    }
  });

  it('CHANNEL_NAMES has no duplicates', () => {
    const unique = new Set(CHANNEL_NAMES);
    expect(unique.size).toBe(CHANNEL_NAMES.length);
  });

  it('EVENT_NAMES has no duplicates', () => {
    const unique = new Set(EVENT_NAMES);
    expect(unique.size).toBe(EVENT_NAMES.length);
  });
});
