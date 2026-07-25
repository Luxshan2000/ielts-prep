import { KeyRound, RotateCcw } from "lucide-react";
import { Badge, Button, Field, Input, Select } from "@/components/ui";
import { Slider } from "./Slider";
import { getPath, isEnvRef, isMasked, type FieldSpec, type SlotDraft } from "../store";

export interface SpecFieldProps {
  spec: FieldSpec;
  draft: SlotDraft;
  /** Model ids discovered by the last Verify — feeds `options_from: "verify"`. */
  verifiedModels: string[];
  /** Fallback options for a model field before Verify has run. */
  suggestedModels: string[];
  /** True once the user has typed into this slot's key field. */
  secretTouched: boolean;
  onChange: (key: string, value: unknown) => void;
}

/**
 * The generic `config_spec` renderer (03 §4). Nothing here knows the name of a
 * provider — adding a preset never touches this file.
 */
export function SpecField({
  spec,
  draft,
  verifiedModels,
  suggestedModels,
  secretTouched,
  onChange,
}: SpecFieldProps) {
  const value = getPath(draft, spec.key) ?? spec.default;

  if (spec.type === "select") {
    const fromVerify = spec.options_from === "verify" ? verifiedModels : [];
    const pool = spec.options ?? (fromVerify.length > 0 ? fromVerify : suggestedModels);
    const current = typeof value === "string" ? value : "";
    const options = (current && !pool.includes(current) ? [current, ...pool] : pool).map((o) => ({
      value: o,
      label: o,
    }));
    return (
      <Field
        label={spec.label}
        required={spec.required}
        hint={
          spec.options_from === "verify" && verifiedModels.length === 0
            ? spec.help ?? "Run Verify to load the models this endpoint actually serves."
            : spec.help
        }
      >
        {options.length === 0 ? (
          <Input
            value={current}
            placeholder={spec.placeholder ?? "Verify to discover models"}
            onChange={(e) => onChange(spec.key, e.target.value)}
          />
        ) : (
          <Select
            aria-label={spec.label}
            value={current}
            options={options}
            placeholder="Select…"
            onChange={(v) => onChange(spec.key, v)}
            disabled={spec.readonly}
          />
        )}
      </Field>
    );
  }

  if (spec.type === "slider") {
    const min = spec.min ?? 0;
    const max = spec.max ?? 1;
    const numeric = typeof value === "number" ? value : Number(value ?? min);
    return (
      <Slider
        label={spec.label}
        value={Number.isFinite(numeric) ? numeric : min}
        min={min}
        max={max}
        step={spec.step ?? 0.1}
        hint={spec.help}
        decimals={(spec.step ?? 0.1) < 0.1 ? 2 : 1}
        onChange={(v) => onChange(spec.key, v)}
      />
    );
  }

  if (spec.type === "number") {
    return (
      <Field label={spec.label} required={spec.required} hint={spec.help}>
        {({ id }) => (
          <Input
            id={id}
            type="number"
            min={spec.min}
            max={spec.max}
            step={spec.step}
            value={typeof value === "number" || typeof value === "string" ? String(value) : ""}
            placeholder={spec.placeholder}
            readOnly={spec.readonly}
            onChange={(e) => {
              const n = Number(e.target.value);
              onChange(spec.key, e.target.value === "" ? "" : Number.isFinite(n) ? n : 0);
            }}
          />
        )}
      </Field>
    );
  }

  if (spec.type === "bool") {
    return (
      <label className="flex items-start gap-2.5 py-1">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(spec.key, e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
        />
        <span>
          <span className="block text-[13px] font-medium text-foreground">{spec.label}</span>
          {spec.help && <span className="block text-xs text-muted-foreground">{spec.help}</span>}
        </span>
      </label>
    );
  }

  if (spec.type === "password" || spec.secret) {
    const stored = isMasked(value);
    const envRef = isEnvRef(value);

    // An env reference is not a secret — 03 §8 shows it literally so the user can
    // see WHICH variable is expected.
    if (envRef && !secretTouched) {
      return (
        <Field label={spec.label} hint={spec.help}>
          <div className="flex items-center gap-2">
            <Input value={String(value)} readOnly className="font-mono text-[13px]" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange(spec.key, "")}
              title="Replace with a pasted key"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Replace
            </Button>
          </div>
        </Field>
      );
    }

    if (stored && !secretTouched) {
      return (
        <Field
          label={spec.label}
          hint={spec.help ?? "Stored encrypted on this machine. It is never sent to the app UI."}
        >
          <div className="flex items-center gap-2">
            <div className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-input bg-muted/40 px-3">
              <KeyRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm text-muted-foreground">Stored</span>
              <Badge tone="success" className="ml-auto">
                encrypted
              </Badge>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onChange(spec.key, "")}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Replace
            </Button>
          </div>
        </Field>
      );
    }

    return (
      <Field label={spec.label} required={spec.required} hint={spec.help}>
        {({ id }) => (
          <Input
            id={id}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={typeof value === "string" && !isMasked(value) ? value : ""}
            placeholder={spec.placeholder ?? "Paste your key, or ${MY_API_KEY}"}
            onChange={(e) => onChange(spec.key, e.target.value)}
          />
        )}
      </Field>
    );
  }

  return (
    <Field label={spec.label} required={spec.required} hint={spec.help}>
      {({ id }) => (
        <Input
          id={id}
          value={typeof value === "string" ? value : value === undefined ? "" : String(value)}
          placeholder={spec.placeholder}
          readOnly={spec.readonly}
          className={spec.readonly ? "bg-muted/40 text-muted-foreground" : undefined}
          onChange={(e) => onChange(spec.key, e.target.value)}
        />
      )}
    </Field>
  );
}
