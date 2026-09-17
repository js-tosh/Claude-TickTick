import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  checked?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}

export type MenuEntry = MenuItem | 'separator' | { heading: string };

interface Props {
  items: MenuEntry[];
  trigger: ReactNode;
  align?: 'left' | 'right';
  label: string;
  className?: string;
}

/** Simple dropdown menu; closes on outside click, Escape, or selection. */
export function Menu({ items, trigger, align = 'right', label, className }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`menu-root${className ? ` ${className}` : ''}`} ref={rootRef}>
      <button
        type="button"
        className="icon-btn menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {trigger}
      </button>
      {open && (
        <div className={`menu menu-${align}`} role="menu" id={id}>
          {items.map((item, i) => {
            if (item === 'separator') return <div key={i} className="menu-sep" role="separator" />;
            if ('heading' in item)
              return (
                <div key={i} className="menu-heading">
                  {item.heading}
                </div>
              );
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                className={`menu-item${item.danger ? ' danger' : ''}${item.checked ? ' checked' : ''}`}
                disabled={item.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.icon && <span className="menu-icon">{item.icon}</span>}
                <span>{item.label}</span>
                {item.checked && <span className="menu-check">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
