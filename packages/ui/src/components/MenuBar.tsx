import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface MenuBarProps {
  onCommand: (commandId: string) => void;
}

interface MenuItemDef {
  readonly label: string;
  readonly mnemonic: string;
  readonly commandId: string;
  readonly shortcut?: string;
  readonly disabled?: boolean;
  readonly separator?: false;
}

interface MenuSeparatorDef {
  readonly separator: true;
}

type MenuEntry = MenuItemDef | MenuSeparatorDef;

interface MenuDef {
  readonly id: string;
  readonly label: string;
  readonly mnemonic: string;
  readonly items: readonly MenuEntry[];
}

const MENUS: readonly MenuDef[] = [
  {
    id: 'file',
    label: 'File',
    mnemonic: 'F',
    items: [
      { label: 'New', mnemonic: 'N', commandId: 'app.file.new', shortcut: 'Ctrl+N' },
      { label: 'Open...', mnemonic: 'O', commandId: 'app.file.open', shortcut: 'Ctrl+O' },
      { label: 'Save', mnemonic: 'S', commandId: 'app.file.save', shortcut: 'Ctrl+S' },
      {
        label: 'Save As...',
        mnemonic: 'A',
        commandId: 'app.file.saveAs',
        shortcut: 'Ctrl+Shift+S',
      },
      { separator: true },
      { label: 'Print...', mnemonic: 'P', commandId: 'app.file.print', shortcut: 'Ctrl+P' },
      { separator: true },
      { label: 'Exit', mnemonic: 'x', commandId: 'app.file.exit', shortcut: 'Alt+F4' },
    ],
  },
  {
    id: 'edit',
    label: 'Edit',
    mnemonic: 'E',
    items: [
      { label: 'Undo', mnemonic: 'U', commandId: 'app.edit.undo', shortcut: 'Ctrl+Z' },
      { label: 'Redo', mnemonic: 'R', commandId: 'app.edit.redo', shortcut: 'Ctrl+Y' },
      { separator: true },
      { label: 'Cut', mnemonic: 't', commandId: 'app.edit.cut', shortcut: 'Ctrl+X' },
      { label: 'Copy', mnemonic: 'C', commandId: 'app.edit.copy', shortcut: 'Ctrl+C' },
      { label: 'Paste', mnemonic: 'P', commandId: 'app.edit.paste', shortcut: 'Ctrl+V' },
      { separator: true },
      { label: 'Find...', mnemonic: 'F', commandId: 'app.edit.find', shortcut: 'Ctrl+F' },
      {
        label: 'Replace...',
        mnemonic: 'e',
        commandId: 'app.edit.replace',
        shortcut: 'Ctrl+H',
      },
    ],
  },
  {
    id: 'format',
    label: 'Format',
    mnemonic: 'o',
    items: [
      {
        label: 'Font...',
        mnemonic: 'F',
        commandId: 'app.format.font.dialog',
        shortcut: 'Ctrl+D',
      },
      { label: 'Paragraph...', mnemonic: 'P', commandId: 'app.format.paragraph.dialog' },
      {
        label: 'Bullets and Numbering...',
        mnemonic: 'B',
        commandId: 'app.format.bullets.dialog',
      },
      { label: 'Style...', mnemonic: 'S', commandId: 'app.format.style.dialog' },
    ],
  },
  {
    id: 'view',
    label: 'View',
    mnemonic: 'V',
    items: [
      { label: 'Normal', mnemonic: 'N', commandId: 'app.view.normal' },
      { label: 'Page Layout', mnemonic: 'P', commandId: 'app.view.pageLayout', disabled: true },
    ],
  },
  {
    id: 'help',
    label: 'Help',
    mnemonic: 'H',
    items: [{ label: 'About Word...', mnemonic: 'A', commandId: 'app.help.about' }],
  },
];

function renderLabel(label: string, mnemonic: string): React.ReactNode {
  const idx = label.toLowerCase().indexOf(mnemonic.toLowerCase());
  if (idx === -1) return label;
  return (
    <>
      {label.slice(0, idx)}
      <u>{label[idx]}</u>
      {label.slice(idx + 1)}
    </>
  );
}

function isSeparator(entry: MenuEntry): entry is MenuSeparatorDef {
  return 'separator' in entry && entry.separator === true;
}

function getMenuItems(menu: MenuDef): readonly MenuItemDef[] {
  return menu.items.filter((e): e is MenuItemDef => !isSeparator(e));
}

export const MenuBar = React.memo(function MenuBar({ onCommand }: MenuBarProps) {
  const [openMenuIdx, setOpenMenuIdx] = useState<number | null>(null);
  const [focusedItemIdx, setFocusedItemIdx] = useState<number>(-1);
  const barRef = useRef<HTMLDivElement>(null);
  const menuRefs = useRef<Array<HTMLElement | null>>([]);
  const itemRefs = useRef<Array<Array<HTMLElement | null>>>(MENUS.map(() => []));

  const closeAll = useCallback(() => {
    setOpenMenuIdx(null);
    setFocusedItemIdx(-1);
  }, []);

  const openMenu = useCallback((idx: number) => {
    setOpenMenuIdx(idx);
    setFocusedItemIdx(0);
  }, []);

  // Close when clicking outside
  useEffect(() => {
    if (openMenuIdx === null) return;

    const handleClick = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        closeAll();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openMenuIdx, closeAll]);

  // Focus first item when menu opens
  useEffect(() => {
    if (openMenuIdx !== null && focusedItemIdx >= 0) {
      const refs = itemRefs.current[openMenuIdx];
      if (refs) {
        const el = refs[focusedItemIdx];
        el?.focus();
      }
    }
  }, [openMenuIdx, focusedItemIdx]);

  const handleBarKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const currentIdx = MENUS.findIndex((_, i) => i === openMenuIdx);

      if (e.key === 'Escape') {
        e.preventDefault();
        closeAll();
        // Return focus to the bar trigger if we have one open
        if (openMenuIdx !== null) {
          menuRefs.current[openMenuIdx]?.focus();
        }
        return;
      }

      if (e.key === 'ArrowLeft' && openMenuIdx !== null) {
        e.preventDefault();
        const prev = (currentIdx - 1 + MENUS.length) % MENUS.length;
        openMenu(prev);
        menuRefs.current[prev]?.focus();
        return;
      }

      if (e.key === 'ArrowRight' && openMenuIdx !== null) {
        e.preventDefault();
        const next = (currentIdx + 1) % MENUS.length;
        openMenu(next);
        menuRefs.current[next]?.focus();
        return;
      }

      if (e.key === 'ArrowDown' && openMenuIdx !== null) {
        e.preventDefault();
        const menuDef = MENUS[openMenuIdx];
        if (!menuDef) return;
        const items = getMenuItems(menuDef);
        const next = (focusedItemIdx + 1) % items.length;
        setFocusedItemIdx(next);
        return;
      }

      if (e.key === 'ArrowUp' && openMenuIdx !== null) {
        e.preventDefault();
        const menuDef = MENUS[openMenuIdx];
        if (!menuDef) return;
        const items = getMenuItems(menuDef);
        const prev = (focusedItemIdx - 1 + items.length) % items.length;
        setFocusedItemIdx(prev);
        return;
      }
    },
    [openMenuIdx, focusedItemIdx, closeAll, openMenu],
  );

  // Alt+letter mnemonics for top-level bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey) return;
      const key = e.key.toUpperCase();
      const idx = MENUS.findIndex((m) => m.mnemonic.toUpperCase() === key);
      if (idx !== -1) {
        e.preventDefault();
        if (openMenuIdx === idx) {
          closeAll();
          menuRefs.current[idx]?.focus();
        } else {
          openMenu(idx);
          menuRefs.current[idx]?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openMenuIdx, openMenu, closeAll]);

  const handleBarItemClick = useCallback(
    (idx: number) => {
      if (openMenuIdx === idx) {
        closeAll();
        menuRefs.current[idx]?.focus();
      } else {
        openMenu(idx);
      }
    },
    [openMenuIdx, openMenu, closeAll],
  );

  const handleBarItemKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>, idx: number) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleBarItemClick(idx);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        openMenu(idx);
      }
    },
    [handleBarItemClick, openMenu],
  );

  const handleItemClick = useCallback(
    (item: MenuItemDef) => {
      if (item.disabled) return;
      closeAll();
      onCommand(item.commandId);
    },
    [closeAll, onCommand],
  );

  const handleItemKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>, item: MenuItemDef, itemIdx: number, menuIdx: number) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleItemClick(item);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeAll();
        menuRefs.current[menuIdx]?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const menuDef = MENUS[menuIdx];
        if (!menuDef) return;
        const items = getMenuItems(menuDef);
        const next = (itemIdx + 1) % items.length;
        setFocusedItemIdx(next);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const menuDef = MENUS[menuIdx];
        if (!menuDef) return;
        const items = getMenuItems(menuDef);
        const prev = (itemIdx - 1 + items.length) % items.length;
        setFocusedItemIdx(prev);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = (menuIdx - 1 + MENUS.length) % MENUS.length;
        openMenu(prev);
        menuRefs.current[prev]?.focus();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const next = (menuIdx + 1) % MENUS.length;
        openMenu(next);
        menuRefs.current[next]?.focus();
      }
    },
    [handleItemClick, closeAll, openMenu],
  );

  return (
    <div
      role="menubar"
      aria-label="Menu bar"
      className="menu-bar"
      ref={barRef}
      onKeyDown={handleBarKeyDown}
    >
      {MENUS.map((menu, menuIdx) => {
        const isOpen = openMenuIdx === menuIdx;
        const popupId = `menu-popup-${menu.id}`;

        return (
          <React.Fragment key={menu.id}>
            <div
              role="menuitem"
              aria-haspopup="true"
              aria-expanded={isOpen}
              aria-controls={isOpen ? popupId : undefined}
              tabIndex={0}
              className="menu-bar-item"
              ref={(el) => {
                menuRefs.current[menuIdx] = el;
              }}
              onClick={() => handleBarItemClick(menuIdx)}
              onKeyDown={(e) => handleBarItemKeyDown(e, menuIdx)}
            >
              {renderLabel(menu.label, menu.mnemonic)}
            </div>

            {isOpen && (
              <ul
                id={popupId}
                role="menu"
                aria-label={menu.label}
                className="menu-popup"
                style={{
                  top: barRef.current ? barRef.current.getBoundingClientRect().bottom : 22,
                  left: menuRefs.current[menuIdx]
                    ? menuRefs.current[menuIdx]!.getBoundingClientRect().left
                    : 0,
                }}
              >
                {(() => {
                  let itemCount = -1;
                  if (!itemRefs.current[menuIdx]) {
                    itemRefs.current[menuIdx] = [];
                  }
                  return menu.items.map((entry, entryIdx) => {
                    if (isSeparator(entry)) {
                      return (
                        <li key={`sep-${entryIdx}`} role="separator" className="menu-separator" />
                      );
                    }
                    itemCount += 1;
                    const localItemIdx = itemCount;
                    return (
                      <li
                        key={entry.commandId}
                        role="menuitem"
                        aria-disabled={entry.disabled === true ? 'true' : undefined}
                        tabIndex={-1}
                        className="menu-item"
                        ref={(el) => {
                          const refs = itemRefs.current[menuIdx];
                          if (refs) refs[localItemIdx] = el;
                        }}
                        onClick={() => handleItemClick(entry)}
                        onKeyDown={(e) => handleItemKeyDown(e, entry, localItemIdx, menuIdx)}
                      >
                        {renderLabel(entry.label, entry.mnemonic)}
                        {entry.shortcut !== undefined && (
                          <span
                            className="shortcut"
                            aria-label={`keyboard shortcut ${entry.shortcut}`}
                          >
                            {entry.shortcut}
                          </span>
                        )}
                      </li>
                    );
                  });
                })()}
              </ul>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
});
