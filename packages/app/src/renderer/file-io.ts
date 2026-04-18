import { readDocx, writeDocx } from '@word/docx';
import type { Document } from '@word/domain';
import { encodeBytes, decodeBytes } from '@word/ipc-schema';

export async function openDocxFile(): Promise<{ doc: Document; path: string } | null> {
  if (!window.wordAPI) return null;
  const dlg = await window.wordAPI.invoke('file.openDialog', {
    title: 'Open Document',
    filters: [
      { name: 'Word Documents', extensions: ['docx'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (dlg.cancelled) return null;
  const read = await window.wordAPI.invoke('file.readBytes', { path: dlg.path });
  const bytes = decodeBytes(read.bytes);
  const { doc } = await readDocx(bytes);
  return { doc, path: dlg.path };
}

export async function saveDocxFile(
  doc: Document,
  existingPath: string | null,
): Promise<string | null> {
  if (!window.wordAPI) return null;
  let target = existingPath;
  if (!target) {
    const dlg = await window.wordAPI.invoke('file.saveDialog', {
      title: 'Save Document',
      filters: [{ name: 'Word Documents', extensions: ['docx'] }],
    });
    if (dlg.cancelled) return null;
    target = dlg.path;
  }
  const bytes = await writeDocx(doc, { deterministic: false });
  await window.wordAPI.invoke('file.writeBytes', {
    path: target,
    bytes: encodeBytes(bytes),
    atomic: true,
  });
  return target;
}
