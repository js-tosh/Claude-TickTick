import { useState } from 'react';
import { createFolder, updateFolder } from '../../db/repo';
import type { Folder } from '../../db/types';
import { useUI } from '../../state/ui';
import { Modal } from '../Modal';

export function FolderDialog({ folder }: { folder?: Folder }) {
  const { closeDialog } = useUI();
  const [name, setName] = useState(folder?.name ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      if (folder) await updateFolder(folder.id, { name: name.trim() });
      else await createFolder(name);
      closeDialog();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={folder ? 'Rename folder' : 'New folder'}
      onClose={closeDialog}
      footer={
        <>
          <button type="button" className="btn" onClick={closeDialog}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={save} disabled={!name.trim() || busy}>
            {folder ? 'Save' : 'Create'}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="field">
          <span className="field-label">Folder name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Work" />
        </label>
      </form>
    </Modal>
  );
}
