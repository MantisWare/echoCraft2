import { useEffect, useState } from "react";
import type { CalendarProviderAvailability } from "../types/calendar";

/**
 * Which calendar providers this build can offer. Google and Microsoft need
 * OAuth client credentials baked in at build time, so a build without them must
 * not show those connect rows — see `calendarProviderAvailability.js`.
 *
 * Starts all-false so an unconfigured provider never flashes on screen before
 * the answer arrives. `resolved` distinguishes "still asking" from "nothing
 * available", which the empty state needs.
 */
const NONE_AVAILABLE: CalendarProviderAvailability = {
  google: false,
  microsoft: false,
  apple: false,
};

/**
 * Whether a provider's row should render. A provider that lost its credentials
 * between builds stays visible while accounts are still linked, otherwise those
 * accounts are stranded with no way to reach disconnect. Connecting is only
 * offered when `configured` is true.
 */
export function shouldShowCalendarProvider({
  configured,
  connected,
}: {
  configured: boolean;
  connected: boolean;
}): boolean {
  return configured === true || connected === true;
}

export function useCalendarProviderAvailability(): CalendarProviderAvailability & {
  resolved: boolean;
} {
  const [availability, setAvailability] = useState<CalendarProviderAvailability>(NONE_AVAILABLE);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const result = await window.electronAPI?.getCalendarProviderAvailability?.();
        if (cancelled) return;
        if (result !== undefined && result !== null) setAvailability(result);
      } catch {
        // Availability is build-time constant, so a failed read cannot be
        // retried into a different answer. Leaving every provider hidden is the
        // safe direction: it withholds rows that could not have connected.
      } finally {
        if (!cancelled) setResolved(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { ...availability, resolved };
}
