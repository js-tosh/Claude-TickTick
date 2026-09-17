import { useState } from 'react';
import { createList, updateList } from '../../db/repo';
import { LIST_COLORS, type Folder, type List } from '../../db/types';
import { useUI } from '../../state/ui';
import { Modal } from '../Modal';

interface Props {
  list?: List;
  folders: Folder[];
  defaultFolderId?: string | null;
}

export function ListDialog({ list, folders, defaultFolderId }: Props) {
  const { closeDialog, setView } = useUI();
  const [name, setName] = useState(list?.name ?? '');
  const [folderId, setFolderId] = useState<string>(list?.folderId ?? defaultFolderId ?? '');
  const [color, setColor] = useState<string | null>(list?.color ?? null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      if (list) {
        await updateList(list.id, { name: name.trim(), folderId: folderId || null, color });
      } else {
        const created = await createList(name, folderId || null, color);
        setView({ kind: 'list', listId: created.id });
      }
      closeDialog();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={list ? 'Edit list' : 'New list'}
      onClose={closeDialog}
      footer={
        <>
          <button type="button" className="btn" onClick={closeDialog}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={save} disabled={!name.trim() || busy}>
            {list ? 'Save' : 'Create'}
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
          <span className="field-label">List name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Groceries" />
        </label>
        <label className="field">
          <span className="field-label">Folder</span>
          <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">None (top level)</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span className="field-label">Color</span>
          <div className="color-row" role="radiogroup" aria-label="List color">
            <button
              type="button"
              role="radio"
              aria-checked={color === null}
              className={`color-swatch none${color === null ? ' on' : ''}`}
              onClick={() => setColor(null)}
              title="No color"
            />
            {LIST_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                className={`color-swatch${color === c ? ' on' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                title={c}
              />
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}
