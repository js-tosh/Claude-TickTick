import { useState } from 'react';
import { useUI } from '../../state/ui';
import { Modal } from '../Modal';

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({ title, message, confirmLabel = 'OK', danger, onConfirm }: Props) {
  const { closeDialog } = useUI();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await onConfirm();
      closeDialog();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={title}
      onClose={closeDialog}
      footer={
        <>
          <button type="button" className="btn" onClick={closeDialog} autoFocus>
            Cancel
          </button>
          <button type="button" className={`btn ${danger ? 'danger' : 'primary'}`} onClick={go} disabled={busy}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}
