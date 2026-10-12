import { useEffect, useRef, type ReactNode } from 'react';
export function MemberPress({
  children,
  enabled,
  label,
  onAction,
}: {
  children: ReactNode;
  enabled: boolean;
  label: string;
  onAction: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);
  return (
    <div
      className="member-row member-press"
      tabIndex={enabled ? 0 : undefined}
      aria-label={enabled ? label : undefined}
      aria-haspopup={enabled ? 'dialog' : undefined}
      onKeyDown={(event) => {
        if (
          enabled &&
          event.target === event.currentTarget &&
          (event.key === 'Enter' || event.key === ' ')
        ) {
          event.preventDefault();
          onAction();
        }
      }}
      onPointerDown={(event) => {
        if (
          !enabled ||
          event.button !== 0 ||
          (event.target as HTMLElement).closest('button,input,select,[role=listbox]')
        )
          return;
        cancel();
        origin.current = { x: event.clientX, y: event.clientY };
        timer.current = setTimeout(() => {
          timer.current = null;
          onAction();
        }, 650);
      }}
      onPointerMove={(event) => {
        if (Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 10)
          cancel();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onContextMenu={(event) => {
        if (enabled) {
          event.preventDefault();
          cancel();
          onAction();
        }
      }}
    >
      {children}
    </div>
  );
}
