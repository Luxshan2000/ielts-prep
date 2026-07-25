import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  value: string | null;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled,
  className,
  "aria-label": ariaLabel,
}: SelectProps) {
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <Listbox value={value ?? ""} onChange={onChange} disabled={disabled}>
      <div className={cn("relative", className)}>
        <ListboxButton
          aria-label={ariaLabel}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3",
            "text-sm text-foreground transition-colors focus:outline-none",
            "data-[focus]:ring-2 data-[focus]:ring-ring disabled:opacity-50",
          )}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </ListboxButton>
        <ListboxOptions
          anchor="bottom start"
          transition
          className={cn(
            "scrollbar-thin z-[60] max-h-64 w-[var(--button-width)] overflow-auto rounded-lg border border-border",
            "bg-card p-1 shadow-xl [--anchor-gap:4px] focus:outline-none data-[closed]:opacity-0",
          )}
        >
          {options.map((o) => (
            <ListboxOption
              key={o.value}
              value={o.value}
              disabled={o.disabled}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5",
                "text-sm text-foreground data-[focus]:bg-accent data-[disabled]:opacity-50",
              )}
            >
              {({ selected: isSelected }) => (
                <>
                  <span className="truncate">{o.label}</span>
                  {isSelected && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                </>
              )}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}
