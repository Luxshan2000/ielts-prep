import { Search } from "lucide-react";

import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

/**
 * A text field with a magnifier sitting inside its left edge.
 *
 * This exists as ONE component rather than as the eight hand-rolled copies it
 * replaced because the icon's `left-*` offset and the input's `pl-*` padding are
 * two halves of a single measurement: change one without the other and the
 * placeholder either collides with the glyph or floats away from it. When each
 * screen owned both halves, two of the eight drifted 2px out of line with the
 * other six — which is the whole argument for keeping the pair in one file.
 *
 * The wrapper takes `className` so every caller keeps its own sizing
 * (`flex-1`, `min-w-[13rem]`, …); the measurement itself is not a prop, and it
 * should not become one.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  id,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        id={id}
        className="pl-8"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
    </div>
  );
}
