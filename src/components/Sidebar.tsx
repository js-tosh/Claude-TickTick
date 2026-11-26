import { useEffect, useRef, useState, type ReactNode } from 'react';
import { locationOf, type Folder, type List, type Location } from '../db/types';
import type { Counts, TagInfo } from '../hooks/useData';
import { useUI, type View } from '../state/ui';
import { deleteFolder, deleteList, updateFolder } from '../db/repo';
import { useBackHandler } from '../lib/backStack';
import {
  AllIcon,
  ChevronIcon,
  CloseIcon,
  DoneIcon,
  FolderIcon,
  InboxIcon,
  ListIcon,
  MoreIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  TagIcon,
  TodayIcon,
  WeekIcon,
} from './Icons';
import { Menu } from './Menu';
import { CLOUD_READY } from '../lib/cloud';

interface Props {
  folders: Folder[];
  lists: List[];
  tags: TagInfo[];
  counts: Counts;
}

function sameView(a: View, b: View): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'list' && b.kind === 'list') return a.listId === b.listId;
  if (a.kind === 'tag' && b.kind === 'tag') return a.tag === b.tag;
  return true;
}

function NavItem({ v, icon, label, count }: { v: View; icon: ReactNode; label: string; count?: number }) {
  const { view, setView } = useUI();
  const active = sameView(view, v);
  return (
    <button type="button" className={`nav-item${active ? ' active' : ''}`} onClick={() => setView(v)} aria-current={active ? 'page' : undefined}>
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
      {count !== undefined && count > 0 && <span className="nav-count">{count}</span>}
    </button>
  );
}

function ListRow({ list, nested, count, onDelete }: { list: List; nested?: boolean; count: number; onDelete: (l: List) => void }) {
  const { view, setView, openDialog } = useUI();
  const active = sameView(view, { kind: 'list', listId: list.id });
  return (
    <div className={`nav-row${nested ? ' nested' : ''}`}>
      <button type="button" className={`nav-item${active ? ' active' : ''}`} onClick={() => setView({ kind: 'list', listId: list.id })}>
        <span className="nav-icon">{list.color ? <span className="list-dot" style={{ background: list.color }} /> : <ListIcon />}</span>
        <span className="nav-label">{list.name}</span>
        {count > 0 && <span className="nav-count">{count}</span>}
      </button>
      <Menu
        label={`Options for ${list.name}`}
        trigger={<MoreIcon size={16} />}
        className="row-menu"
        items={[
          { label: 'Edit list', onSelect: () => openDialog({ kind: 'list', listId: list.id }) },
          { label: 'Delete list', danger: true, onSelect: () => onDelete(list) },
        ]}
      />
    </div>
  );
}

export function Sidebar({ folders, lists, tags, counts }: Props) {
  const { view, setView, openDialog, sidebarOpen, setSidebarOpen } = useUI();
  const [query, setQuery] = useState(view.kind === 'search' ? view.query : '');
  const lastNonSearch = useRef<View>(view.kind === 'search' ? { kind: 'inbox' } : view);

  useBackHandler(sidebarOpen, () => setSidebarOpen(false));

  useEffect(() => {
    if (view.kind !== 'search') {
      lastNonSearch.current = view;
      setQuery('');
    }
  }, [view]);

  const onSearch = (q: string) => {
    setQuery(q);
    if (q.trim()) setView({ kind: 'search', query: q });
    else setView(lastNonSearch.current);
  };

  const listsByFolder = groupByFolder(lists);

  const confirmDeleteList = (l: List) => {
    const n = counts.perList.get(l.id) ?? 0;
    openDialog({
      kind: 'confirm',
      title: `Delete "${l.name}"?`,
      message: `The list and ${n === 1 ? 'the 1 open task' : `all ${n} open tasks`} in it will be deleted. This cannot be undone.`,
      confirmLabel: 'Delete list',
      danger: true,
      onConfirm: async () => {
        await deleteList(l.id);
        if (view.kind === 'list' && view.listId === l.id) setView({ kind: 'inbox' });
      },
    });
  };

  const confirmDeleteFolder = (f: Folder) => {
    const inside = listsByFolder.get(f.id) ?? [];
    openDialog({
      kind: 'confirm',
      title: `Delete folder "${f.name}"?`,
      message: inside.length
        ? `The ${inside.length} list${inside.length === 1 ? '' : 's'} inside will be moved out of the folder. No tasks are deleted.`
        : 'This folder is empty.',
      confirmLabel: 'Delete folder',
      danger: true,
      onConfirm: () => deleteFolder(f.id, false),
    });
  };

  return (
    <>
      {sidebarOpen && <div className="scrim" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`} aria-label="Lists">
        <div className="sidebar-top">
          <label className="search">
            <SearchIcon size={16} />
            <input type="search" placeholder="Search tasks" value={query} onChange={(e) => onSearch(e.target.value)} aria-label="Search tasks" />
          </label>
          <button type="button" className="icon-btn sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <CloseIcon />
          </button>
        </div>

        <nav className="sidebar-scroll">
          <div className="nav-group">
            <NavItem v={{ kind: 'inbox' }} icon={<InboxIcon />} label="Inbox" count={counts.inbox} />
            <NavItem v={{ kind: 'today' }} icon={<TodayIcon />} label="Today" count={counts.today} />
            <NavItem v={{ kind: 'week' }} icon={<WeekIcon />} label="Next 7 Days" count={counts.week} />
            <NavItem v={{ kind: 'all' }} icon={<AllIcon />} label="All" count={counts.all} />
            <NavItem v={{ kind: 'completed' }} icon={<DoneIcon />} label="Completed" />
          </div>

          <LocationSection
            location="local"
            title="Local"
            subtitle="On this phone"
            folders={folders}
            lists={lists}
            counts={counts}
            onDeleteList={confirmDeleteList}
            onDeleteFolder={confirmDeleteFolder}
          />
          <LocationSection
            location="cloud"
            title="Cloud"
            subtitle="Synced to your account"
            folders={folders}
            lists={lists}
            counts={counts}
            onDeleteList={confirmDeleteList}
            onDeleteFolder={confirmDeleteFolder}
          />
          <LocationSection
            location="shared"
            title="Shared with me"
            subtitle="Lists others share with you"
            folders={folders}
            lists={lists}
            counts={counts}
            onDeleteList={confirmDeleteList}
            onDeleteFolder={confirmDeleteFolder}
          />

          {tags.length > 0 && (
            <div className="nav-group">
              <div className="nav-heading">
                <span>Tags</span>
              </div>
              {tags.map(({ tag, count }) => (
                <div key={tag} className="nav-row">
                  <NavItem v={{ kind: 'tag', tag }} icon={<TagIcon />} label={tag} count={count} />
                  <Menu
                    label={`Options for tag ${tag}`}
                    trigger={<MoreIcon size={16} />}
                    className="row-menu"
                    items={[{ label: 'Rename or delete tag', onSelect: () => openDialog({ kind: 'tag', tag }) }]}
                  />
                </div>
              ))}
            </div>
          )}
        </nav>

        <div className="sidebar-bottom">
          <button
            type="button"
            className="nav-item"
            onClick={() => {
              setSidebarOpen(false);
              openDialog({ kind: 'settings' });
            }}
          >
            <span className="nav-icon">
              <SettingsIcon />
            </span>
            <span className="nav-label">Settings &amp; backup</span>
          </button>
        </div>
      </aside>
    </>
  );
}

function groupByFolder(lists: List[]): Map<string, List[]> {
  const m = new Map<string, List[]>();
  for (const l of lists) {
    if (!l.folderId) continue;
    if (!m.has(l.folderId)) m.set(l.folderId, []);
    m.get(l.folderId)!.push(l);
  }
  return m;
}


/** One of the three places lists live: Local, Cloud, Shared with me. */
function LocationSection({
  location,
  title,
  subtitle,
  folders: allFolders,
  lists: allLists,
  counts,
  onDeleteList,
  onDeleteFolder,
}: {
  location: Location;
  title: string;
  subtitle: string;
  folders: Folder[];
  lists: List[];
  counts: Counts;
  onDeleteList: (l: List) => void;
  onDeleteFolder: (f: Folder) => void;
}) {
  const { openDialog } = useUI();
  const folders = allFolders.filter((f) => locationOf(f) === location);
  const lists = allLists.filter((l) => locationOf(l) === location);
  const listsByFolder = groupByFolder(lists);
  const topLevelLists = lists.filter((l) => !l.folderId && !l.isInbox);
  const canAdd = location === 'local' || (location === 'cloud' && CLOUD_READY);
  const empty = folders.length === 0 && topLevelLists.length === 0;

  return (
    <div className={`nav-group location-section loc-${location}`}>
      <div className="nav-heading">
        <span className="location-title">
          <span>{title}</span>
          <span className="location-sub">{subtitle}</span>
        </span>
        {canAdd && (
          <Menu
            label={`Add a ${title.toLowerCase()} list or folder`}
            trigger={<PlusIcon size={16} />}
            items={[
              { label: 'New list', icon: <ListIcon size={16} />, onSelect: () => openDialog({ kind: 'list', location }) },
              { label: 'New folder', icon: <FolderIcon size={16} />, onSelect: () => openDialog({ kind: 'folder', location }) },
            ]}
          />
        )}
      </div>

      {folders.map((f) => {
        const inside = listsByFolder.get(f.id) ?? [];
        const openCount = inside.reduce((n, l) => n + (counts.perList.get(l.id) ?? 0), 0);
        return (
          <div key={f.id} className="folder">
            <div className="nav-row">
              <button
                type="button"
                className="nav-item folder-toggle"
                onClick={() => updateFolder(f.id, { collapsed: !f.collapsed })}
                aria-expanded={!f.collapsed}
              >
                <span className={`nav-icon chevron${f.collapsed ? '' : ' open'}`}>
                  <ChevronIcon size={14} />
                </span>
                <span className="nav-icon">
                  <FolderIcon />
                </span>
                <span className="nav-label">{f.name}</span>
                {f.collapsed && openCount > 0 && <span className="nav-count">{openCount}</span>}
              </button>
              <Menu
                label={`Options for folder ${f.name}`}
                trigger={<MoreIcon size={16} />}
                className="row-menu"
                items={[
                  { label: 'New list in folder', onSelect: () => openDialog({ kind: 'list', folderId: f.id, location }) },
                  { label: 'Rename folder', onSelect: () => openDialog({ kind: 'folder', folderId: f.id }) },
                  { label: 'Delete folder', danger: true, onSelect: () => onDeleteFolder(f) },
                ]}
              />
            </div>
            {!f.collapsed && (
              <div className="folder-lists">
                {inside.length === 0 && <div className="nav-empty">No lists yet</div>}
                {inside.map((l) => (
                  <ListRow key={l.id} list={l} nested count={counts.perList.get(l.id) ?? 0} onDelete={onDeleteList} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {topLevelLists.map((l) => (
        <ListRow key={l.id} list={l} count={counts.perList.get(l.id) ?? 0} onDelete={onDeleteList} />
      ))}

      {empty && (
        <div className="nav-empty">
          {location === 'local'
            ? 'Create a list or folder with the + button.'
            : location === 'cloud'
              ? CLOUD_READY
                ? 'Create a cloud list with the + button, or move a list here.'
                : 'Sign in to keep lists in the cloud and share them. Coming soon.'
              : 'Lists other people share with you will show up here.'}
        </div>
      )}
    </div>
  );
}
