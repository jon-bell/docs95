// @word/engine — Commands, Patches, Transactions, Selection, History.
// Depends on @word/domain only.

export * from './op.js';
export * from './patch.js';
export * from './transaction.js';
export * from './command.js';
export * from './command-bus.js';
export * from './history.js';
export * from './selection.js';
export * from './editor-instance.js';
export * from './apply-op.js';

// Find service
export * from './find.js';

// Built-in commands
export * from './commands/insert-text.js';
export * from './commands/delete-range.js';
export * from './commands/split-paragraph.js';
export * from './commands/undo.js';
export * from './commands/redo.js';

// Find/replace commands
export * from './commands/find-commands.js';
export * from './commands/replace.js';
export * from './commands/replace-all.js';

// Formatting commands
export * from './commands/formatting/toggle-bold.js';
export * from './commands/formatting/toggle-italic.js';
export * from './commands/formatting/toggle-underline.js';
export * from './commands/formatting/toggle-strikethrough.js';
export * from './commands/formatting/set-font-name.js';
export * from './commands/formatting/set-font-size.js';
export * from './commands/formatting/set-font-color.js';
export * from './commands/formatting/set-alignment.js';
export * from './commands/formatting/set-indent.js';
export * from './commands/formatting/set-spacing.js';
export * from './commands/formatting/apply-style.js';
export * from './commands/formatting/toggle-bulleted-list.js';
export * from './commands/formatting/toggle-numbered-list.js';
