import { t } from '../language';
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
export function Dialog({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    const focused = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (focused instanceof HTMLElement) focused.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === ref.current) close();
      }}
    >
      <div className="dialog-heading">
        <h2 id="dialog-title">{t(title)}</h2>
        <button
          type="button"
          className="icon-button"
          onClick={close}
          aria-label={t('Close dialog')}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
