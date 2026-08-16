import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { api } from "@/lib/api";
import { assetAlt, assetMediaPath } from "../qtypes";
import type { QuestionAsset } from "../types";

interface MapAssetProps {
  asset: QuestionAsset;
  /** Used as the alt text when the asset carries none. */
  label: string;
}

/**
 * The map/plan image for a `map_labelling` question. Pack media is ticket-authed
 * like every other media route, so the `src` is signed with `api.mediaUrl`.
 *
 * If the pack ships the question but not its artwork the labelling inputs stay
 * usable and this renders a labelled placeholder — never a broken image.
 */
export function MapAsset({ asset, label }: MapAssetProps) {
  const path = assetMediaPath(asset);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    if (!path) return undefined;
    void api
      .mediaUrl(path)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!path || failed) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-border bg-muted/40 px-3 py-4">
        <ImageOff className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-[13px] text-muted-foreground">
          The map for this question isn't in the installed content pack. The audio still
          names each location, so you can answer from what you hear.
        </p>
      </div>
    );
  }

  if (!src) {
    return <div className="h-48 w-full animate-pulse rounded-xl bg-muted" aria-hidden="true" />;
  }

  return (
    <img
      src={src}
      alt={assetAlt(asset, label)}
      onError={() => setFailed(true)}
      className="max-h-[420px] w-full rounded-xl border border-border bg-card object-contain p-2"
    />
  );
}
