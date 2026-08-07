import { useCallback, useRef, useState } from 'react';
import useDismiss from '../../hooks/useDismiss';

// Every header menu (categories, notifications, messages, wishlist,
// language, user) is a trigger + a glassmorphic panel that opens below it.
// This shell owns the open/close state and outside-click/Escape dismissal
// so each menu only has to describe its trigger and its contents.
export default function DropdownShell({ trigger, align = 'right', panelClassName = '', width, children, onOpen }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, open, close);

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      if (next) onOpen?.();
      return next;
    });
  };

  return (
    <div className="jd-dropdown-root" ref={rootRef}>
      {trigger({ open, toggle, close })}
      {open && (
        <div
          className={`jd-dropdown-panel ${align === 'left' ? 'align-left' : 'align-right'} ${panelClassName}`}
          style={width ? { width } : undefined}
        >
          <div className="jd-dropdown-panel-glow" aria-hidden="true" />
          {children({ close })}
        </div>
      )}
    </div>
  );
}
