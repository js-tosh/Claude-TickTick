import { useState } from 'react';
import { deleteTagEverywhere, renameTagEverywhere } from '../../db/repo';
import { useUI } from '../../state/ui';
import { Modal } from '../Modal';

export function TagDialog({ tag }: { tag: string }) {
  const { closeDialog, setView, view } = useUI();
  const [name, setName] = useState(tag);
  const [busy, setBusy] = useState(false);

  const rename = async () => {
    const next = name.trim().replace(/^#/, '');
    if (!next || next === tag || busy) return;
    setBusy(true);
    try {
      await renameTagEverywhere(tag, next);
      if (view.kind === 'tag' && view.tag === tag) setView({ kind: 'tag', tag: next.toLowerCase() });
      closeDialog();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteTagEverywhere(tag);
      if (view.kind === 'tag' && view.tag === tag) setView({ kind: 'inbox' });
      closeDialog();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Tag #${tag}`}
      onClose={closeDialog}
      footer={
        <>
          <button type="button" className="btn danger" onClick={remove} disabled={busy}>
            Remove from all tasks
          </button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={closeDialog}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={rename} disabled={busy || !name.trim() || name.trim() === tag}>
            Rename
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void rename();
        }}
      >
        <label className="field">
          <span className="field-label">Tag name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
      </form>
    </Modal>
  );
}
