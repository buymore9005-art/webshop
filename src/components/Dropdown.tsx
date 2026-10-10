import type { KeyboardEvent } from 'react';
import { useEffect, useId, useRef, useState } from 'react';

export interface DropdownOption {
  value: string;
  label: string;
}

export function Dropdown({ id, label, value, options, onChange }: {
  id?: string;
  label: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
}) {
  const generatedId = useId();
  const triggerId = id || generatedId;
  const listId = generatedId + '-options';
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);

  useEffect(() => {
    if (!open)
      return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    optionRefs.current[activeIndex]?.focus();
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, activeIndex]);

  function close(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus)
      trigger.current?.focus();
  }

  function choose(option: DropdownOption) {
    onChange(option.value);
    close();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Tab' && open) {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      if (!open) {
        setActiveIndex(selectedIndex);
        setOpen(true);
      }
      else {
        setActiveIndex(index => (index + direction + options.length) % options.length);
      }
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActiveIndex(event.key === 'Home' ? 0 : options.length - 1);
      if (!open)
        setOpen(true);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      if (!open) {
        event.preventDefault();
        setActiveIndex(selectedIndex);
        setOpen(true);
      }
      else {
        const option = options[activeIndex];
        if (option) {
          event.preventDefault();
          choose(option);
        }
      }
      return;
    }
    if (event.key.length === 1 && /\S/.test(event.key)) {
      const start = (selectedIndex + 1) % options.length;
      const offset = options.findIndex((option, index) =>
        index >= start && option.label.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
      const wrapped = offset < 0 ? options.findIndex(option => option.label.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase())) : offset;
      if (wrapped >= 0) {
        setActiveIndex(wrapped);
        if (open)
          optionRefs.current[wrapped]?.focus();
        else
          choose(options[wrapped]);
      }
    }
  }

  const selected = options[selectedIndex];
  return <div className={'dropdown' + (open ? ' open' : '')} ref={root} onKeyDown={handleKeyDown}>
    <button
      ref={trigger}
      id={triggerId}
      type="button"
      className="dropdown-trigger"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={listId}
      aria-label={label}
      onClick={() => {
        if (open)
          close(false);
        else {
          setActiveIndex(selectedIndex);
          setOpen(true);
        }
      }}
    >
      <span>{selected?.label || ''}</span>
      <svg className="dropdown-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg>
    </button>
    {open && <div className="dropdown-menu" id={listId} role="listbox" aria-label={label}>
      {options.map((option, index) => <button
        key={option.value}
        ref={node => { optionRefs.current[index] = node; }}
        type="button"
        role="option"
        tabIndex={-1}
        aria-selected={option.value === value}
        className={'dropdown-option' + (index === activeIndex ? ' active' : '')}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => choose(option)}
      >
        <span>{option.label}</span>
        {option.value === value && <svg className="dropdown-check" viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8" /></svg>}
      </button>)}
    </div>}
  </div>;
}
