import { Capacitor } from '@capacitor/core';

/** True inside the Android (or iOS) app, false in a browser. */
export const isNative = Capacitor.isNativePlatform();

export type SaveResult = 'downloaded' | 'shared' | 'cancelled';

/**
 * Save a text file. Browsers get a normal download. The Android WebView cannot
 * download blob URLs, so the app writes the file to its cache and opens the
 * system share sheet instead (Save to Drive, Files, email, Nearby Share…).
 */
export async function saveTextFile(filename: string, text: string, mime: string): Promise<SaveResult> {
  if (!isNative) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'downloaded';
  }
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  const written = await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
  try {
    await Share.share({ title: filename, files: [written.uri], dialogTitle: 'Save or send your backup' });
    return 'shared';
  } catch (e) {
    // Dismissing the share sheet rejects; that is not an error for the user.
    if (e instanceof Error && /cancel/i.test(e.message)) return 'cancelled';
    throw e;
  }
}

/** Ask the browser not to evict our IndexedDB under storage pressure. */
export function requestPersistentStorage(): void {
  if (isNative) return;
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* not supported */
  }
}
