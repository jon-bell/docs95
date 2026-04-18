import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { CHANNELS } from './index';

describe('URL Allowlist for shell.openExternal', () => {
  const schema = CHANNELS['shell.openExternal'].request;

  describe('allowed URLs', () => {
    it('allows https://', () => {
      expect(() => schema.parse({ url: 'https://example.com' })).not.toThrow();
    });

    it('allows https:// with path and query', () => {
      expect(() => schema.parse({ url: 'https://example.com/path?query=1' })).not.toThrow();
    });

    it('allows http://', () => {
      expect(() => schema.parse({ url: 'http://example.com' })).not.toThrow();
    });

    it('allows http:// with path', () => {
      expect(() => schema.parse({ url: 'http://example.com:8080/page' })).not.toThrow();
    });

    it('allows mailto:', () => {
      expect(() => schema.parse({ url: 'mailto:user@example.com' })).not.toThrow();
    });

    it('allows mailto: with subject', () => {
      expect(() => schema.parse({ url: 'mailto:user@example.com?subject=Test' })).not.toThrow();
    });
  });

  describe('forbidden URLs (ADR-0014)', () => {
    it('blocks file://', () => {
      expect(() => schema.parse({ url: 'file:///etc/passwd' })).toThrow(ZodError);
    });

    it('blocks file:// with windows path', () => {
      expect(() => schema.parse({ url: 'file:///C:/Windows/System32' })).toThrow(ZodError);
    });

    it('blocks javascript:', () => {
      expect(() => schema.parse({ url: "javascript:alert('xss')" })).toThrow(ZodError);
    });

    it('blocks data:', () => {
      expect(() => schema.parse({ url: "data:text/html,<script>alert('xss')</script>" })).toThrow(
        ZodError,
      );
    });

    it('blocks arbitrary strings', () => {
      expect(() => schema.parse({ url: 'arbitrary-string' })).toThrow(ZodError);
    });

    it('blocks ftp://', () => {
      expect(() => schema.parse({ url: 'ftp://ftp.example.com' })).toThrow(ZodError);
    });

    it('blocks gopher://', () => {
      expect(() => schema.parse({ url: 'gopher://example.com' })).toThrow(ZodError);
    });

    it('blocks relative paths', () => {
      expect(() => schema.parse({ url: '../../../etc/passwd' })).toThrow(ZodError);
    });

    it('blocks protocol-relative URLs', () => {
      expect(() => schema.parse({ url: '//example.com' })).toThrow(ZodError);
    });
  });
});
