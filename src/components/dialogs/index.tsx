import type { Folder, List } from '../../db/types';
import { useUI } from '../../state/ui';
import { ConfirmDialog } from './ConfirmDialog';
import { FolderDialog } from './FolderDialog';
import { ListDialog } from './ListDialog';
import { SettingsDialog } from './SettingsDialog';
import { TagDialog } from './TagDialog';

interface Props {
  folders: Folder[];
  lists: List[];
  taskCount: number;
}

export function Dialogs({ folders, lists, taskCount }: Props) {
  const { dialog } = useUI();
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'folder':
      return <FolderDialog folder={folders.find((f) => f.id === dialog.folderId)} />;
    case 'list':
      return <ListDialog list={lists.find((l) => l.id === dialog.listId)} folders={folders} defaultFolderId={dialog.folderId} />;
    case 'tag':
      return <TagDialog tag={dialog.tag} />;
    case 'settings':
      return <SettingsDialog stats={{ folders: folders.length, lists: lists.length, tasks: taskCount }} />;
    case 'confirm':
      return (
        <ConfirmDialog
          title={dialog.title}
          message={dialog.message}
          confirmLabel={dialog.confirmLabel}
          danger={dialog.danger}
          onConfirm={dialog.onConfirm}
        />
      );
  }
}
