import { cn } from "../lib/utils";
import { EchoCraftMark } from "../ui/EchoCraftMark";
import { AGENT_MODE_PATH, VOICE_IDENTITY_CROSSFADE_MS } from "./voiceIdentityMorph";

interface VoiceIdentityIconProps {
  size?: number;
  agentMode?: boolean;
  className?: string;
}

/**
 * Dictation identity is the EchoCraft mark. Agent sessions crossfade that
 * mark into the supplied sparkle/leaf overlay instead of the old three-bar
 * listening glyph.
 */
export function VoiceIdentityIcon({
  size = 24,
  agentMode = false,
  className,
}: VoiceIdentityIconProps) {
  const layerTransition = {
    transitionDuration: `${VOICE_IDENTITY_CROSSFADE_MS}ms`,
  } as const;

  return (
    <span
      className={cn("voice-identity-icon relative inline-block shrink-0", className)}
      style={{ width: size, height: size }}
      data-agent-mode={agentMode ? "true" : "false"}
      aria-hidden="true"
    >
      <span
        className="voice-identity-echocraft absolute inset-0 motion-reduce:transition-none"
        style={{
          ...layerTransition,
          opacity: agentMode ? 0 : 1,
          transitionProperty: "opacity",
          transitionTimingFunction: "ease-out",
        }}
      >
        <EchoCraftMark size={size} />
      </span>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className="voice-identity-svg absolute inset-0 overflow-visible motion-reduce:transition-none"
        style={{
          ...layerTransition,
          opacity: agentMode ? 1 : 0,
          transitionProperty: "opacity",
          transitionTimingFunction: "ease-out",
        }}
        aria-hidden="true"
      >
        <path
          className="voice-identity-final-agent"
          d={AGENT_MODE_PATH}
          fill="currentColor"
          transform="scale(1.2)"
        />
      </svg>
    </span>
  );
}
