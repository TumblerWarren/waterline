import { t } from '../language';
import { useEffect, useRef } from 'react';
import { LoaderCircle, ShieldCheck, TriangleAlert, X } from 'lucide-react';
export function SignInFeedback({
  pending,
  error,
  dismiss,
}: {
  pending: boolean;
  error?: string;
  dismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const focused = document.activeElement;
    if (!pending && !error) return;
    element?.showModal();
    return () => {
      element?.close();
      if (focused instanceof HTMLElement) focused.focus();
    };
  }, [pending, error]);
  if (!pending && !error) return null;
  return (
    <dialog
      ref={dialog}
      className="auth-feedback-card"
      aria-labelledby="auth-feedback-title"
      aria-describedby="auth-feedback-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) dismiss();
      }}
      onClick={(event) => {
        if (!pending && event.target === event.currentTarget) dismiss();
      }}
    >
      {!pending ? (
        <button
          className="icon-button feedback-close"
          aria-label={t('Dismiss sign-in error')}
          onClick={dismiss}
        >
          <X size={20} />
        </button>
      ) : null}
      <div className={pending ? 'feedback-symbol' : 'feedback-symbol is-error'}>
        {pending ? <ShieldCheck size={30} /> : <TriangleAlert size={30} />}
      </div>
      <h2 id="auth-feedback-title">
        {pending ? t('Signing you in') : t('Sign-in could not complete')}
      </h2>
      <p id="auth-feedback-description">
        {pending
          ? t('Complete sign-in in the secure window. We’ll open your household when you return.')
          : error}
      </p>
      {pending ? (
        <div className="sign-in-progress" role="status">
          <LoaderCircle size={20} />
          <span>{t('Waiting for secure sign-in…')}</span>
        </div>
      ) : (
        <button className="button primary full-width" onClick={dismiss}>
          {t('Back to sign in')}
        </button>
      )}
    </dialog>
  );
}
