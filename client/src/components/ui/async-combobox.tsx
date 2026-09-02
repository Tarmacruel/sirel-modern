import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Loader2, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

export type AsyncComboboxValue = string | number;

export interface AsyncComboboxProps<T> {
  value: AsyncComboboxValue | null;
  onChange: (option: T | null) => void;
  query: (search: string, limit: number) => Promise<T[]>;
  getOptionValue: (option: T) => AsyncComboboxValue;
  getOptionLabel: (option: T) => string;
  renderOption?: (option: T) => ReactNode;
  initialOption?: T | null;
  placeholder?: string;
  searchPlaceholder?: string;
  minSearchLength?: number;
  debounceMs?: number;
  limit?: number;
  allowClear?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  ariaLabel?: string;
  createOptionLabel?: string;
  onCreateOption?: (search: string) => void;
}

interface FloatingPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

const VIEWPORT_MARGIN = 8;
const DEFAULT_MAX_HEIGHT = 288;

function isSameValue(
  left: AsyncComboboxValue | null,
  right: AsyncComboboxValue | null,
) {
  return left !== null && right !== null && String(left) === String(right);
}

function getErrorMessage() {
  return "Não foi possível carregar as opções. Tente novamente.";
}

export function AsyncCombobox<T>({
  value,
  onChange,
  query,
  getOptionValue,
  getOptionLabel,
  renderOption,
  initialOption = null,
  placeholder = "Selecione uma opção",
  searchPlaceholder = "Digite para buscar",
  minSearchLength = 0,
  debounceMs = 250,
  limit = 20,
  allowClear = false,
  disabled = false,
  className,
  id,
  ariaLabel,
  createOptionLabel,
  onCreateOption,
}: AsyncComboboxProps<T>) {
  const generatedId = useId();
  const inputId = id ?? `async-combobox-${generatedId}`;
  const listboxId = `${inputId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const floatingRef = useRef<HTMLDivElement>(null);
  const requestSequence = useRef(0);
  const pendingOptionRef = useRef<T | null>(null);
  const queryRef = useRef(query);
  const getOptionValueRef = useRef(getOptionValue);
  const getOptionLabelRef = useRef(getOptionLabel);

  queryRef.current = query;
  getOptionValueRef.current = getOptionValue;
  getOptionLabelRef.current = getOptionLabel;

  const safeMinimum = Math.max(0, minSearchLength);
  const safeLimit = Math.max(1, Math.floor(limit));
  const safeDebounce = Math.max(0, debounceMs);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<T[]>([]);
  const [selectedOption, setSelectedOption] = useState<T | null>(() => {
    if (
      initialOption &&
      isSameValue(getOptionValue(initialOption), value)
    ) {
      return initialOption;
    }
    return null;
  });
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadSequence, setReloadSequence] = useState(0);
  const [floatingPosition, setFloatingPosition] = useState<FloatingPosition>({
    left: VIEWPORT_MARGIN,
    top: VIEWPORT_MARGIN,
    width: 240,
    maxHeight: DEFAULT_MAX_HEIGHT,
  });

  useEffect(() => {
    if (value === null) {
      setSelectedOption(null);
      pendingOptionRef.current = null;
      return;
    }

    if (
      initialOption &&
      isSameValue(getOptionValueRef.current(initialOption), value)
    ) {
      setSelectedOption(initialOption);
      pendingOptionRef.current = null;
      return;
    }

    if (
      pendingOptionRef.current &&
      isSameValue(getOptionValueRef.current(pendingOptionRef.current), value)
    ) {
      setSelectedOption(pendingOptionRef.current);
      pendingOptionRef.current = null;
      return;
    }

    setSelectedOption((current) =>
      current && isSameValue(getOptionValueRef.current(current), value)
        ? current
        : null,
    );
  }, [initialOption, value]);

  const close = useCallback(() => {
    setOpen(false);
    setSearch("");
    setActiveIndex(-1);
  }, []);

  const updateFloatingPosition = useCallback(() => {
    const root = rootRef.current;
    if (!root || typeof window === "undefined") return;

    const rect = root.getBoundingClientRect();
    const viewportWidth = Math.max(window.innerWidth, 320);
    const viewportHeight = Math.max(window.innerHeight, 320);
    const width = Math.min(
      Math.max(rect.width, 240),
      viewportWidth - VIEWPORT_MARGIN * 2,
    );
    const left = Math.min(
      Math.max(rect.left, VIEWPORT_MARGIN),
      viewportWidth - width - VIEWPORT_MARGIN,
    );
    const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - VIEWPORT_MARGIN;
    const placeAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
    const availableSpace = Math.max(
      120,
      placeAbove ? spaceAbove - 4 : spaceBelow - 4,
    );
    const maxHeight = Math.min(DEFAULT_MAX_HEIGHT, availableSpace);
    const estimatedHeight = Math.min(DEFAULT_MAX_HEIGHT, maxHeight);
    const top = placeAbove
      ? Math.max(VIEWPORT_MARGIN, rect.top - estimatedHeight - 4)
      : Math.min(rect.bottom + 4, viewportHeight - VIEWPORT_MARGIN);

    setFloatingPosition({ left, top, width, maxHeight });
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    updateFloatingPosition();
    const handleViewportChange = () => updateFloatingPosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, updateFloatingPosition]);

  useEffect(() => {
    if (!open) return undefined;

    const handleOutsidePointer = (event: PointerEvent) => {
      const path = event.composedPath();
      if (
        (rootRef.current && path.includes(rootRef.current)) ||
        (floatingRef.current && path.includes(floatingRef.current))
      ) {
        return;
      }
      close();
    };

    document.addEventListener("pointerdown", handleOutsidePointer, true);
    return () =>
      document.removeEventListener("pointerdown", handleOutsidePointer, true);
  }, [close, open]);

  useEffect(() => {
    if (!open) return undefined;

    const normalizedSearch = search.trim();
    const sequence = ++requestSequence.current;

    if (normalizedSearch.length < safeMinimum) {
      setOptions([]);
      setLoading(false);
      setError(null);
      setActiveIndex(-1);
      return undefined;
    }

    setLoading(true);
    setError(null);
    const timeout = window.setTimeout(() => {
      void queryRef
        .current(normalizedSearch, safeLimit)
        .then((result) => {
          if (sequence !== requestSequence.current) return;
          const limitedResult = result.slice(0, safeLimit);
          setOptions(limitedResult);
          setActiveIndex(-1);
          setLoading(false);

          if (value !== null) {
            const currentSelection = limitedResult.find((option) =>
              isSameValue(getOptionValueRef.current(option), value),
            );
            if (currentSelection) setSelectedOption(currentSelection);
          }
        })
        .catch(() => {
          if (sequence !== requestSequence.current) return;
          setOptions([]);
          setActiveIndex(-1);
          setError(getErrorMessage());
          setLoading(false);
        });
    }, safeDebounce);

    return () => window.clearTimeout(timeout);
  }, [open, reloadSequence, safeDebounce, safeLimit, safeMinimum, search, value]);

  const visibleOptions = useMemo(() => {
    if (!selectedOption || value === null) return options;
    const selectedValue = getOptionValue(selectedOption);
    const isAlreadyVisible = options.some((option) =>
      isSameValue(getOptionValue(option), selectedValue),
    );
    return isAlreadyVisible ? options : [selectedOption, ...options];
  }, [getOptionValue, options, selectedOption, value]);

  const selectedLabel = useMemo(() => {
    if (value === null) return "";
    return selectedOption ? getOptionLabel(selectedOption) : String(value);
  }, [getOptionLabel, selectedOption, value]);

  const moveActive = (direction: 1 | -1) => {
    if (!visibleOptions.length) return;
    setActiveIndex((current) => {
      const start = current < 0 ? (direction === 1 ? -1 : 0) : current;
      return (start + direction + visibleOptions.length) % visibleOptions.length;
    });
  };

  const selectOption = (option: T) => {
    // A opção só passa a ser exibida depois que o componente pai confirmar o
    // novo `value`. Isso evita mostrar B enquanto o formulário ainda envia A
    // quando um callback assíncrono falha ou é cancelado.
    pendingOptionRef.current = option;
    onChange(option);
    close();
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const openCombobox = () => {
    if (disabled) return;
    setOpen(true);
    setSearch("");
    setActiveIndex(-1);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openCombobox();
      return;
    }

    if (
      !open &&
      event.key.length === 1 &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      setOpen(true);
      setSearch(event.key);
      setActiveIndex(-1);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openCombobox();
        return;
      }
      moveActive(event.key === "ArrowDown" ? 1 : -1);
      return;
    }

    if (event.key === "Enter" && open) {
      event.preventDefault();
      const option = visibleOptions[activeIndex >= 0 ? activeIndex : 0];
      if (option) selectOption(option);
      return;
    }

    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }

    if (event.key === "Tab" && open) close();
  };

  const activeDescendant =
    open && activeIndex >= 0
      ? `${listboxId}-option-${activeIndex}`
      : undefined;

  useEffect(() => {
    if (!activeDescendant || typeof document === "undefined") return;
    document
      .getElementById(activeDescendant)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [activeDescendant]);

  const floatingStyle: CSSProperties = {
    left: floatingPosition.left,
    top: floatingPosition.top,
    width: floatingPosition.width,
  };

  const dropdown = open && typeof document !== "undefined" ? (
    <div
      ref={floatingRef}
      style={floatingStyle}
      className="fixed z-[160] overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        id={listboxId}
        role="listbox"
        aria-label={ariaLabel ?? placeholder}
        className="overflow-y-auto overscroll-contain p-1.5"
        style={{ maxHeight: floatingPosition.maxHeight }}
      >
        {search.trim().length < safeMinimum ? (
          <div className="px-3 py-4 text-sm text-[var(--text-secondary)]">
            Digite pelo menos {safeMinimum} caractere
            {safeMinimum === 1 ? "" : "s"} para buscar.
          </div>
        ) : loading ? (
          <div
            role="status"
            className="flex items-center gap-2 px-3 py-4 text-sm text-[var(--text-secondary)]"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Carregando opções...
          </div>
        ) : error ? (
          <div role="alert" className="space-y-2 px-3 py-4 text-sm">
            <p className="text-[var(--danger-color)]">{error}</p>
            <button
              type="button"
              className="rounded-xl border border-[var(--border-subtle)] px-3 py-1.5 font-semibold text-[var(--text-primary)] outline-none transition hover:bg-[var(--surface-soft)] focus-visible:ring-2 focus-visible:ring-[var(--surface-highlight)]"
              onClick={() => setReloadSequence((current) => current + 1)}
            >
              Tentar novamente
            </button>
          </div>
        ) : visibleOptions.length ? (
          visibleOptions.map((option, index) => {
            const optionValue = getOptionValue(option);
            const selected = isSameValue(optionValue, value);
            const active = index === activeIndex;
            return (
              <button
                key={`${typeof optionValue}-${optionValue}`}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={selected}
                className={cn(
                  "flex min-h-11 w-full items-center rounded-xl px-3 py-2 text-left text-sm text-[var(--text-primary)] outline-none transition",
                  active && "bg-[var(--surface-highlight)]",
                  selected && "font-semibold text-[var(--accent-color)]",
                  !active && "hover:bg-[var(--surface-soft)]",
                )}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(option)}
              >
                {renderOption ? renderOption(option) : getOptionLabel(option)}
              </button>
            );
          })
        ) : (
          <div className="space-y-2 px-3 py-4 text-sm text-[var(--text-secondary)]">
            <p>Nenhuma opção encontrada.</p>
            {createOptionLabel && onCreateOption ? (
              <button
                type="button"
                className="rounded-xl border border-[var(--border-subtle)] px-3 py-1.5 font-semibold text-[var(--text-primary)] outline-none transition hover:bg-[var(--surface-soft)] focus-visible:ring-2 focus-visible:ring-[var(--surface-highlight)]"
                onClick={() => {
                  onCreateOption(search.trim());
                  close();
                }}
              >
                {createOptionLabel}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={cn("relative w-full", className)}>
      <div
        className={cn(
          "flex h-11 w-full items-center rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] transition focus-within:border-[var(--border-strong)] focus-within:ring-2 focus-within:ring-[var(--surface-highlight)]",
          disabled && "cursor-not-allowed bg-[var(--surface-soft)] opacity-60",
        )}
      >
        <Search
          className="ml-3.5 h-4 w-4 shrink-0 text-[var(--text-muted)]"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          type="text"
          autoComplete="off"
          aria-label={ariaLabel ?? placeholder}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={activeDescendant}
          disabled={disabled}
          readOnly={!open}
          value={open ? search : selectedLabel}
          placeholder={open ? searchPlaceholder : placeholder}
          className="min-w-0 flex-1 self-stretch border-0 bg-transparent px-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] disabled:cursor-not-allowed"
          onClick={() => {
            if (!open) openCombobox();
          }}
          onChange={(event) => {
            if (!open) setOpen(true);
            setSearch(event.target.value);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
        />
        {allowClear && value !== null && !disabled ? (
          <button
            type="button"
            aria-label="Limpar seleção"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] outline-none transition hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--surface-highlight)]"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setSearch("");
              onChange(null);
              close();
              inputRef.current?.focus();
            }}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          aria-label={open ? "Fechar opções" : "Abrir opções"}
          tabIndex={-1}
          disabled={disabled}
          className="mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] outline-none transition hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => (open ? close() : openCombobox())}
        >
          <ChevronDown
            className={cn("h-4 w-4 transition", open && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </div>
      {dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}
