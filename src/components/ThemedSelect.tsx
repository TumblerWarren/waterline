import {
  Children,
  isValidElement,
  useId,
  useRef,
  useState,
  type ReactNode,
  type ReactElement,
} from 'react';
import { Check, ChevronDown } from 'lucide-react';
export function ThemedSelect({
  id,
  name,
  value,
  defaultValue,
  disabled,
  label,
  onValueChange,
  children,
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  label: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
}) {
  const listId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [localValue, setLocalValue] = useState(defaultValue ?? '');
  const [open, setOpen] = useState(false);
  const options = Children.toArray(children)
    .filter(isValidElement)
    .map(
      (child) =>
        (child as ReactElement<{ value: string; children: ReactNode; disabled?: boolean }>).props,
    );
  const selected = value ?? localValue;
  return (
    <div
      className="themed-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      {name ? <input type="hidden" name={name} value={selected} /> : null}
      <button
        ref={button}
        id={id}
        type="button"
        className="themed-select-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open && !disabled}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            setOpen(false);
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            window.setTimeout(
              () =>
                list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus(),
              0,
            );
          }
        }}
      >
        <span>{options.find((option) => option.value === selected)?.children}</span>
        <ChevronDown size={18} />
      </button>
      {open && !disabled ? (
        <div
          ref={list}
          id={listId}
          className="themed-select-options"
          role="listbox"
          aria-label={label}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              button.current?.focus();
            }
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault();
              const items = Array.from(
                list.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [],
              );
              const index = items.indexOf(document.activeElement as HTMLButtonElement);
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? items.length - 1
                    : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
              items[next]?.focus();
            }
          }}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === selected}
              disabled={option.disabled}
              onClick={() => {
                setLocalValue(option.value);
                onValueChange?.(option.value);
                setOpen(false);
                button.current?.focus();
              }}
            >
              <span>{option.children}</span>
              {option.value === selected ? <Check size={18} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
