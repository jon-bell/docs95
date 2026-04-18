import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { CHANNELS, EVENTS } from './index';

describe('Channel Schemas', () => {
  describe('file.openDialog', () => {
    it('accepts valid request', () => {
      const schema = CHANNELS['file.openDialog'].request;
      const valid = { title: 'Open File' };
      expect(() => schema.parse(valid)).not.toThrow();
    });

    it('rejects invalid request', () => {
      const schema = CHANNELS['file.openDialog'].request;
      const invalid = { title: 123 };
      expect(() => schema.parse(invalid)).toThrow(ZodError);
    });

    it('accepts valid response (cancelled)', () => {
      const schema = CHANNELS['file.openDialog'].response;
      const valid = { cancelled: true };
      expect(() => schema.parse(valid)).not.toThrow();
    });

    it('accepts valid response (not cancelled)', () => {
      const schema = CHANNELS['file.openDialog'].response;
      const valid = { cancelled: false, path: '/tmp/file.txt' };
      expect(() => schema.parse(valid)).not.toThrow();
    });
  });

  describe('file.saveDialog', () => {
    it('accepts valid request with filters', () => {
      const schema = CHANNELS['file.saveDialog'].request;
      const valid = {
        title: 'Save As',
        filters: [{ name: 'Word Documents', extensions: ['docx'] }],
      };
      expect(() => schema.parse(valid)).not.toThrow();
    });

    it('accepts valid response (cancelled)', () => {
      const schema = CHANNELS['file.saveDialog'].response;
      const valid = { cancelled: true };
      expect(() => schema.parse(valid)).not.toThrow();
    });
  });

  describe('file.readBytes', () => {
    it('accepts valid request', () => {
      const schema = CHANNELS['file.readBytes'].request;
      const valid = { path: '/path/to/file.docx' };
      expect(() => schema.parse(valid)).not.toThrow();
    });

    it('rejects missing path', () => {
      const schema = CHANNELS['file.readBytes'].request;
      expect(() => schema.parse({})).toThrow(ZodError);
    });

    it('accepts valid response', () => {
      const schema = CHANNELS['file.readBytes'].response;
      const valid = { bytes: 'SGVsbG8gV29ybGQ=', size: 11 };
      expect(() => schema.parse(valid)).not.toThrow();
    });

    it('rejects negative size', () => {
      const schema = CHANNELS['file.readBytes'].response;
      const invalid = { bytes: 'SGVsbG8gV29ybGQ=', size: -1 };
      expect(() => schema.parse(invalid)).toThrow(ZodError);
    });
  });

  describe('file.writeBytes', () => {
    it('accepts valid request', () => {
      const schema = CHANNELS['file.writeBytes'].request;
      const valid = {
        path: '/path/to/file.docx',
        bytes: 'SGVsbG8gV29ybGQ=',
        atomic: true,
      };
      expect(() => schema.parse(valid)).not.toThrow();
    });

    it('accepts request without atomic flag', () => {
      const schema = CHANNELS['file.writeBytes'].request;
      const valid = {
        path: '/path/to/file.docx',
        bytes: 'SGVsbG8gV29ybGQ=',
      };
      expect(() => schema.parse(valid)).not.toThrow();
    });

    it('accepts valid response', () => {
      const schema = CHANNELS['file.writeBytes'].response;
      const valid = { ok: true, bytesWritten: 11 };
      expect(() => schema.parse(valid)).not.toThrow();
    });
  });

  describe('print.toPDF', () => {
    it('accepts empty request', () => {
      const schema = CHANNELS['print.toPDF'].request;
      expect(() => schema.parse({})).not.toThrow();
    });

    it('accepts request with all options', () => {
      const schema = CHANNELS['print.toPDF'].request;
      const valid = {
        path: '/tmp/output.pdf',
        options: {
          landscape: true,
          scale: 1.5,
          marginsMM: { top: 10, bottom: 10, left: 15, right: 15 },
        },
      };
      expect(() => schema.parse(valid)).not.toThrow();
    });

    it('accepts response (cancelled)', () => {
      const schema = CHANNELS['print.toPDF'].response;
      const valid = { cancelled: true };
      expect(() => schema.parse(valid)).not.toThrow();
    });

    it('accepts response (not cancelled)', () => {
      const schema = CHANNELS['print.toPDF'].response;
      const valid = {
        cancelled: false,
        path: '/tmp/output.pdf',
        bytesWritten: 5000,
      };
      expect(() => schema.parse(valid)).not.toThrow();
    });
  });

  describe('window.setTitle', () => {
    it('accepts valid request', () => {
      const schema = CHANNELS['window.setTitle'].request;
      const valid = { title: 'My Document - Word Processor' };
      expect(() => schema.parse(valid)).not.toThrow();
    });

    it('rejects title exceeding max length', () => {
      const schema = CHANNELS['window.setTitle'].request;
      const invalid = { title: 'x'.repeat(513) };
      expect(() => schema.parse(invalid)).toThrow(ZodError);
    });

    it('accepts response', () => {
      const schema = CHANNELS['window.setTitle'].response;
      const valid = { ok: true };
      expect(() => schema.parse(valid)).not.toThrow();
    });
  });

  describe('app.version', () => {
    it('accepts empty request', () => {
      const schema = CHANNELS['app.version'].request;
      expect(() => schema.parse({})).not.toThrow();
    });

    it('accepts valid response', () => {
      const schema = CHANNELS['app.version'].response;
      const valid = {
        app: '1.0.0',
        electron: '28.0.0',
        chrome: '120.0.0',
        node: '18.20.0',
      };
      expect(() => schema.parse(valid)).not.toThrow();
    });
  });

  describe('shell.openExternal', () => {
    it('accepts https URLs', () => {
      const schema = CHANNELS['shell.openExternal'].request;
      const valid = { url: 'https://example.com' };
      expect(() => schema.parse(valid)).not.toThrow();
    });

    it('accepts http URLs', () => {
      const schema = CHANNELS['shell.openExternal'].request;
      const valid = { url: 'http://example.com' };
      expect(() => schema.parse(valid)).not.toThrow();
    });

    it('accepts mailto URLs', () => {
      const schema = CHANNELS['shell.openExternal'].request;
      const valid = { url: 'mailto:test@example.com' };
      expect(() => schema.parse(valid)).not.toThrow();
    });

    it('rejects file:// URLs', () => {
      const schema = CHANNELS['shell.openExternal'].request;
      const invalid = { url: 'file:///etc/passwd' };
      expect(() => schema.parse(invalid)).toThrow(ZodError);
    });

    it('rejects javascript: URLs', () => {
      const schema = CHANNELS['shell.openExternal'].request;
      const invalid = { url: "javascript:alert('xss')" };
      expect(() => schema.parse(invalid)).toThrow(ZodError);
    });

    it('rejects arbitrary strings', () => {
      const schema = CHANNELS['shell.openExternal'].request;
      const invalid = { url: 'arbitrary-string' };
      expect(() => schema.parse(invalid)).toThrow(ZodError);
    });

    it('accepts valid response', () => {
      const schema = CHANNELS['shell.openExternal'].response;
      const valid = { ok: true };
      expect(() => schema.parse(valid)).not.toThrow();
    });
  });
});

describe('Event Schemas', () => {
  describe('menu.command', () => {
    it('accepts valid payload', () => {
      const schema = EVENTS['menu.command'].payload;
      const valid = { commandId: 'file.new' };
      expect(() => schema.parse(valid)).not.toThrow();
    });

    it('rejects missing commandId', () => {
      const schema = EVENTS['menu.command'].payload;
      expect(() => schema.parse({})).toThrow(ZodError);
    });
  });

  describe('document.externalChange', () => {
    it('accepts valid payload', () => {
      const schema = EVENTS['document.externalChange'].payload;
      const valid = { path: '/path/to/document.docx' };
      expect(() => schema.parse(valid)).not.toThrow();
    });

    it('rejects missing path', () => {
      const schema = EVENTS['document.externalChange'].payload;
      expect(() => schema.parse({})).toThrow(ZodError);
    });
  });
});
