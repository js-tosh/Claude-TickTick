import { useRef, useState } from 'react';
import { backupFilename, downloadText, exportCSV, exportJSON, importJSON, type ImportMode } from '../../db/backup';
import { clearAll, ensureInbox } from '../../db/repo';
import { useUI, type Theme } from '../../state/ui';
import { CopyIcon, DownloadIcon, MoonIcon, PasteIcon, SunIcon, UploadIcon } from '../Icons';
import { Modal } from '../Modal';

interface Props {
  stats: { folders: number; lists: number; tasks: number };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function SettingsDialog({ stats }: Props) {
  const { closeDialog, theme, setTheme, showToast, openDialog, setView } = useUI();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState('');

  const doExport = async (kind: 'json' | 'csv') => {
    setBusy(true);
    try {
      if (kind === 'json') downloadText(backupFilename('json'), await exportJSON(), 'application/json');
      else downloadText(backupFilename('csv'), await exportCSV(), 'text/csv');
      showToast(kind === 'json' ? 'Backup downloaded' : 'CSV downloaded');
    } finally {
      setBusy(false);
    }
  };

  // Some hosts (sandboxed pages, certain WebViews) block downloads. The
  // clipboard is a dependable fallback: copy here, paste into "Paste a backup" elsewhere.
  const copyBackup = async () => {
    setBusy(true);
    try {
      const text = await exportJSON();
      await navigator.clipboard.writeText(text);
      showToast('Backup copied to clipboard');
    } catch {
      setError('Could not access the clipboard. Try the download button instead.');
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    await importText(await file.text());
  };

  const importText = async (text: string) => {
    setError(null);
    const run = async () => {
      setBusy(true);
      try {
        const r = await importJSON(text, mode);
        showToast(`Imported ${r.tasks} tasks, ${r.lists} lists, ${r.folders} folders`);
        setView({ kind: 'inbox' });
        closeDialog();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Import failed.');
      } finally {
        setBusy(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    };
    if (mode === 'replace') {
      openDialog({
        kind: 'confirm',
        title: 'Replace all data?',
        message: `Everything currently on this device (${stats.tasks} tasks) will be deleted and replaced with the file's contents.`,
        confirmLabel: 'Replace',
        danger: true,
        onConfirm: run,
      });
    } else {
      await run();
    }
  };

  const reset = () =>
    openDialog({
      kind: 'confirm',
      title: 'Delete all data on this device?',
      message: 'All folders, lists and tasks stored in this browser will be permanently deleted. Export a backup first if you want to keep them.',
      confirmLabel: 'Delete everything',
      danger: true,
      onConfirm: async () => {
        await clearAll();
        await ensureInbox();
        setView({ kind: 'inbox' });
        showToast('All data deleted');
      },
    });

  return (
    <Modal title="Settings & backup" onClose={closeDialog} wide>
      <section className="settings-section">
        <h3>Appearance</h3>
        <div className="segmented" role="radiogroup" aria-label="Theme">
          {(['system', 'light', 'dark'] as Theme[]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={theme === t} className={theme === t ? 'on' : ''} onClick={() => setTheme(t)}>
              {t === 'light' && <SunIcon size={14} />}
              {t === 'dark' && <MoonIcon size={14} />}
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h3>Export</h3>
        <p className="muted">
          Your data lives only in this browser or app. Download a backup to keep it safe or to move it to another device.
          Currently: {plural(stats.tasks, 'task')} in {plural(stats.lists, 'list')} and {plural(stats.folders, 'folder')}.
        </p>
        <div className="btn-row">
          <button type="button" className="btn primary" onClick={() => doExport('json')} disabled={busy}>
            <DownloadIcon size={16} /> Backup (JSON)
          </button>
          <button type="button" className="btn" onClick={() => doExport('csv')} disabled={busy}>
            <DownloadIcon size={16} /> Spreadsheet (CSV)
          </button>
          <button type="button" className="btn" onClick={copyBackup} disabled={busy}>
            <CopyIcon size={16} /> Copy backup
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3>Import</h3>
        <p className="muted">Load a JSON backup made by this app on another device.</p>
        <div className="segmented" role="radiogroup" aria-label="Import mode">
          <button type="button" role="radio" aria-checked={mode === 'merge'} className={mode === 'merge' ? 'on' : ''} onClick={() => setMode('merge')}>
            Merge
          </button>
          <button type="button" role="radio" aria-checked={mode === 'replace'} className={mode === 'replace' ? 'on' : ''} onClick={() => setMode('replace')}>
            Replace
          </button>
        </div>
        <p className="muted small">
          {mode === 'merge'
            ? 'Adds anything new and updates tasks that changed more recently in the file. Nothing is deleted.'
            : 'Deletes everything on this device first, then loads the file.'}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
            <UploadIcon size={16} /> Choose backup file…
          </button>
          <button type="button" className="btn" onClick={() => setPasteOpen((v) => !v)} disabled={busy} aria-expanded={pasteOpen}>
            <PasteIcon size={16} /> Paste a backup
          </button>
        </div>
        {pasteOpen && (
          <div className="field" style={{ marginTop: 10 }}>
            <textarea
              className="paste-box"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder='Paste the copied backup here (it starts with {"app":"ticktick-clone"…)'
              aria-label="Pasted backup"
            />
            <div className="btn-row">
              <button
                type="button"
                className="btn primary"
                disabled={busy || !pasted.trim()}
                onClick={async () => {
                  await importText(pasted);
                  setPasted('');
                }}
              >
                Import pasted backup
              </button>
            </div>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="settings-section">
        <h3>Danger zone</h3>
        <div className="btn-row">
          <button type="button" className="btn danger" onClick={reset} disabled={busy}>
            Delete all data on this device
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3>About</h3>
        <p className="muted small">
          Offline-first to-do app. No account, no server: everything is stored on this device. Quick-add understands{' '}
          <code>!high</code> / <code>!low</code>, <code>#tag</code>, <code>today</code>, <code>tomorrow</code>, weekday names,
          <code>next week</code> and dates like <code>2026-10-03</code>.
        </p>
      </section>
    </Modal>
  );
}
