import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function ProfileSheet({ children, close }: { children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const start = useRef<number | null>(null);
  const [closing, setClosing] = useState(false);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const before = document.activeElement;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      document.body.style.overflow = bodyOverflow;
      if (before instanceof HTMLElement) before.focus();
    };
  }, []);
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => closeRef.current(), 180);
    return () => window.clearTimeout(timer);
  }, [closing]);
  return (
    <dialog
      ref={ref}
      className={`profile-sheet ${closing ? 'closing' : ''}`}
      aria-labelledby="profile-sheet-title"
      onCancel={(e) => {
        e.preventDefault();
        setClosing(true);
      }}
      onClick={(e) => {
        if (e.target === ref.current) setClosing(true);
      }}
    >
      <div
        className="sheet-grip"
        onPointerDown={(e) => {
          start.current = e.clientY;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerUp={(e) => {
          if (start.current !== null && e.clientY - start.current > 60) setClosing(true);
          start.current = null;
        }}
        onPointerCancel={() => {
          start.current = null;
        }}
      >
        <span />
      </div>
      <div className="dialog-heading">
        <h2 id="profile-sheet-title">Your profile</h2>
        <button className="icon-button" onClick={() => setClosing(true)} aria-label="Close profile">
          <X size={22} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
