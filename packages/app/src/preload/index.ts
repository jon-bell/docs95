// Electron preload entry for @word/app. The real implementation is in @word/shell.
// This file exists so Electron has a single-file preload target, independent of
// @word/shell's module layout. All it does is re-run the shell preload code.
import '@word/shell/preload';
