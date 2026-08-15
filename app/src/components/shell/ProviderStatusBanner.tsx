import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Settings2, X, Zap } from "lucide-react";
import { Button } from "@/components/ui";
import { api, type ApiError } from "@/lib/api";
import { StatusStrip } from "./StatusStrip";

/**
 * The one global answer to "you have no working model provider".
 *
 * A brand-new install has a provider *preset* selected (ollama) but nothing running
 * behind it, so the first time a learner asks for an essay score, a generated prompt,
 * a word lookup or rendered listening audio, the sidecar answers 502/503. Each feature
 * shows that failure in place — correctly, and with the server's own words — but none
 * of them can put a Settings button in every one of those spots.
 *
 * This strip does. It listens to the transport layer, so ANY provider failure anywhere
 * raises it exactly once, with the one control that fixes the cause. It is dismissible
 * (a learner who is deliberately working offline should not be nagged) and hides itself
 * on the Settings screen, where the advice would be redundant.
 */
export function ProviderStatusBanner() {
  const [failure, setFailure] = useState<ApiError | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => api.onProviderFailure((error) => setFailure(error)), []);

  // Once the learner is in Settings the banner has served its purpose.
  useEffect(() => {
    if (location.pathname.startsWith("/settings")) setFailure(null);
  }, [location.pathname]);

  if (!failure) return null;

  return (
    <StatusStrip
      tone="warning"
      icon={Zap}
      title="BandReady couldn't reach a model provider"
      detail={
        <>
          {failure.detail} Scoring, generated prompts, word lookups and listening audio need
          one; everything else keeps working.
        </>
      }
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFailure(null);
              navigate("/settings");
            }}
          >
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
            Open Settings
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Dismiss the provider notice"
            onClick={() => setFailure(null)}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </>
      }
    />
  );
}

export default ProviderStatusBanner;
