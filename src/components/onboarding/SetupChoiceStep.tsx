import { Fragment, forwardRef, useRef, useState } from "react";
import {
  AlertCircle,
  BanknoteCheck,
  GalleryVerticalEnd,
  KeyRound,
  Laptop,
  Server,
  WifiOff,
  Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { usePolicySnapshot } from "../../hooks/usePolicy";
import {
  getParakeetModelInfo,
  getTranscriptionProviders,
  modelRegistry,
} from "../../models/ModelRegistry";
import type { OnboardingSetupMode } from "./flow";
import { getOnboardingSetupAvailability, hasAvailableOnboardingSetup } from "./setupEligibility";
import openAIIcon from "../../assets/icons/providers/openai.svg";
import nvidiaIcon from "../../assets/icons/providers/nvidia.webp";
// Only the Local card opens the warning dialog now — picking an API
// provider goes straight through to its setup step.
import warningBackdrop from "../../assets/onboarding-setup-warning-hero.webp";

type SetupMode = Exclude<OnboardingSetupMode, null>;
type AdvancedSetupMode = Exclude<SetupMode, "cloud">;
// Local opens the warning dialog; BYOK is picked directly from the API card,
// so a "byok" pending state is unreachable.
type WarningSetupMode = Exclude<AdvancedSetupMode, "byok">;

const REFERENCE_LOCAL_MODEL_ID = "nemotron-3.5-asr-streaming-0.6b";

interface SetupChoiceStepProps {
  agentAllowed: boolean;
  onSelect: (mode: SetupMode, options?: { selfHosted?: boolean }) => void;
}

interface ApiSetupOption {
  id: "byok" | "self-hosted";
  icon: typeof KeyRound;
  title: string;
  description: string;
}

// Figma "Frame 49"–"Frame 52": row, gap 8, a 14px mark beside 14/140% body.
// The mark is tertiary grey on the self-serve cards and the brand accent on the
// cloud card, which is the only visual weighting between them.
//
// strokeWidth stays at lucide's default 2 rather than the 1.16667 the export
// shows. Both describe the same line: Figma exports these at viewBox 0 0 14 14,
// so its 1.16667 is already in 14px space, while lucide draws in a 24 viewBox
// scaled down to 14 — 2 x (14/24) = 1.1667 device px, exactly the spec. Passing
// 1.167 here applies the scale twice and renders a 0.68px hairline.
function Feature({
  icon: Icon,
  accent = false,
  children,
}: {
  icon: typeof Zap;
  accent?: boolean;
  children: string;
}) {
  return (
    <li className="flex items-center gap-1.5 text-xs leading-[1.4] text-[var(--onboarding-text-primary)]">
      <Icon
        className={`size-3 shrink-0 ${accent ? "text-[var(--onboarding-accent)]" : "text-[var(--onboarding-text-tertiary)]"}`}
      />
      {children}
    </li>
  );
}

// Compact setup card: content stays pinned to the top and the action to the bottom.
function SetupCard({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative flex h-[350px] w-68 shrink-0 flex-col justify-between overflow-hidden rounded-2xl border border-[var(--onboarding-control-border)] bg-[var(--onboarding-surface)] px-4 pb-5 pt-4 text-left">
      {children}
    </section>
  );
}

// Figma "Frame 25": pad 8 20, radius 38, 14/140% medium. Brand fill or stroke.
const CardAction = forwardRef<
  HTMLButtonElement,
  {
    brand?: boolean;
    className?: string;
    onClick: () => void;
    children: string;
  }
>(function CardAction({ brand = false, className = "", onClick, children }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={`onboarding-pressable relative z-10 w-full rounded-[38px] px-4 py-1.5 text-xs font-medium leading-[1.4] ${className} ${
        brand
          ? "bg-[var(--onboarding-accent)] text-[var(--onboarding-accent-foreground)] hover:brightness-95"
          : "border border-[var(--onboarding-control-border)] text-[var(--onboarding-text-primary)] hover:bg-[var(--onboarding-surface-hover)]"
      }`}
    >
      {children}
    </button>
  );
});

export default function SetupChoiceStep({ agentAllowed, onSelect }: SetupChoiceStepProps) {
  const { t } = useTranslation();
  const policy = usePolicySnapshot();
  const [pending, setPending] = useState<WarningSetupMode | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const localReferenceModel = getParakeetModelInfo(REFERENCE_LOCAL_MODEL_ID);
  const localModelSize = (localReferenceModel?.size ?? t("common.unknown")).replace(
    /(\d)([A-Za-z])/,
    "$1 $2"
  );
  // The model arrives as an archive and needs room to unpack, so quoting only
  // its compressed size can send a user into a setup that runs out of disk.
  const minimumLocalSpaceGb = Math.max(2, Math.ceil((localReferenceModel?.sizeMb ?? 0) / 1000));

  const availability = getOnboardingSetupAvailability({
    policy,
    agentAllowed,
    transcriptionProviders: getTranscriptionProviders(),
    llmProviders: modelRegistry.getCloudProviders(),
  });
  const { local: localAllowed, byok: byokAllowed, selfHosted: selfHostedAllowed } = availability;
  // OpenWhispr Cloud is retired: onboarding offers local or BYOK/self-hosted.
  const apiOptionsAllowed = byokAllowed || selfHostedAllowed;

  const confirmPending = () => {
    if (!pending) return;
    onSelect(pending);
    setPending(null);
  };

  // Radix otherwise focuses the first action (the Cloud escape hatch). Keep
  // Enter aligned with the mode the user just selected by focusing Proceed.
  const handleWarningAutoFocus = (event: Event) => {
    event.preventDefault();
    confirmRef.current?.focus();
  };

  const warningSteps = pending
    ? [1, 2, 3].map((step) =>
        t(`onboarding.rehaul.setupChoice.warnings.${pending}.steps.${step}`, {
          modelSize: localModelSize,
        })
      )
    : [];
  const apiSetupOptions: ApiSetupOption[] = [];
  if (byokAllowed) {
    apiSetupOptions.push({
      id: "byok",
      icon: KeyRound,
      title: t("onboarding.rehaul.setupChoice.byok.title"),
      description: t("onboarding.rehaul.setupChoice.byok.description"),
    });
  }
  if (selfHostedAllowed) {
    apiSetupOptions.push({
      id: "self-hosted",
      icon: Server,
      title: t("onboarding.rehaul.setupChoice.moreOptions.selfHosted.title"),
      description: t("onboarding.rehaul.setupChoice.moreOptions.selfHosted.description"),
    });
  }

  if (!hasAvailableOnboardingSetup(availability)) {
    return (
      <div
        role="alert"
        className="mx-auto mt-8 flex w-full max-w-md flex-col items-center rounded-2xl border border-[var(--onboarding-control-border)] bg-[var(--onboarding-surface)] px-6 py-8 text-center"
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-[var(--onboarding-surface-secondary)] text-[var(--onboarding-accent)]">
          <AlertCircle className="size-5" />
        </span>
        <h2 className="mt-4 text-base font-semibold text-[var(--onboarding-text-primary)]">
          {t("onboarding.rehaul.setupChoice.unavailable.title")}
        </h2>
        <p className="mt-2 text-sm leading-5 text-[var(--onboarding-text-secondary)]">
          {t("onboarding.rehaul.setupChoice.unavailable.description")}
        </p>
      </div>
    );
  }

  return (
    // Figma "Frame 2147259042", with the cloud card retired: the two remaining
    // paths — local models and your own API — sit side by side, so neither is
    // hidden behind a disclosure.
    <div className="mx-auto mt-5 flex w-full flex-col items-center gap-4">
      {/* Frame 60: row, gap 16. */}
      <div className="onboarding-stagger flex items-start justify-center gap-3">
        {localAllowed && (
          <SetupCard>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                {/* Frame 2147259034: the two model marks overlap by 8, each on a
                    1.33px white ring so the stack reads front-to-back. */}
                <span className="flex -space-x-2">
                  <span className="flex size-9 items-center justify-center rounded-full bg-[var(--onboarding-inverse-surface)] ring-[1.33px] ring-[var(--onboarding-surface)]">
                    <img
                      src={openAIIcon}
                      alt=""
                      aria-hidden="true"
                      width={20}
                      height={20}
                      decoding="async"
                      draggable={false}
                      className="size-4 invert dark:invert-0"
                    />
                  </span>
                  {/* The tile is its own green field, so it fills the chip and gets
                      clipped to the circle — the old lime-500 circle sat behind a
                      green eye mark, which read as green on green. The mark and
                      wordmark both fall inside the inscribed circle, so nothing of
                      the logo is lost to the crop. */}
                  <span className="size-9 overflow-hidden rounded-full ring-[1.33px] ring-[var(--onboarding-surface)]">
                    <img
                      src={nvidiaIcon}
                      alt=""
                      aria-hidden="true"
                      width={40}
                      height={40}
                      decoding="async"
                      draggable={false}
                      className="size-full object-cover"
                    />
                  </span>
                </span>
                {/* Frame 49: pad 4 9, radius 47, surface-tertiary, 10/140%. */}
                <span className="rounded-[47px] bg-[var(--onboarding-surface-tertiary)] px-[9px] py-1 text-[10px] leading-[1.4] text-[var(--onboarding-text-primary)]">
                  {t("onboarding.rehaul.setupChoice.local.badge")}
                </span>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <h2 className="onboarding-card-title text-[var(--onboarding-text-primary)]">
                    {t("onboarding.rehaul.setupChoice.local.title")}
                  </h2>
                  <p className="text-sm leading-[1.4] text-[var(--onboarding-text-secondary)]">
                    {t("onboarding.rehaul.setupChoice.local.description", {
                      minimumSpace: minimumLocalSpaceGb,
                    })}
                  </p>
                </div>
                {/* The four marks are the lucide originals the Figma assets were
                    exported from, matched by their path coordinates: Laptop (not
                    LaptopMinimal, which is a plain rect with a detached base line)
                    and BanknoteCheck (not BadgeCheck). */}
                <ul className="flex flex-col gap-2">
                  <Feature icon={Laptop}>
                    {t("onboarding.rehaul.setupChoice.local.features.device")}
                  </Feature>
                  <Feature icon={WifiOff}>
                    {t("onboarding.rehaul.setupChoice.local.features.offline")}
                  </Feature>
                  <Feature icon={GalleryVerticalEnd}>
                    {t("onboarding.rehaul.setupChoice.local.features.models")}
                  </Feature>
                  <Feature icon={BanknoteCheck}>
                    {t("onboarding.rehaul.setupChoice.local.features.free")}
                  </Feature>
                </ul>
              </div>
            </div>
            <CardAction onClick={() => setPending("local")}>
              {t("onboarding.rehaul.setupChoice.local.download")}
            </CardAction>
          </SetupCard>
        )}

        {apiOptionsAllowed && (
          <SetupCard>
            <div className="flex flex-col gap-4">
              {/* The local card stacks two model marks here; the API path has no
                  provider yet, so it shows the two routes into it instead. The
                  36px discs and 1.33px ring match that stack so both card
                  headers sit on the same line. */}
              <span className="flex h-9 -space-x-2">
                <span className="flex size-9 items-center justify-center rounded-full bg-[var(--onboarding-surface-secondary)] text-[var(--onboarding-accent)] ring-[1.33px] ring-[var(--onboarding-surface)]">
                  <KeyRound className="size-4" strokeWidth={1.667} />
                </span>
                <span className="flex size-9 items-center justify-center rounded-full bg-[var(--onboarding-surface-secondary)] text-[var(--onboarding-text-tertiary)] ring-[1.33px] ring-[var(--onboarding-surface)]">
                  <Server className="size-4" strokeWidth={1.667} />
                </span>
              </span>

              <div className="flex flex-col gap-1.5">
                <h2 className="onboarding-card-title text-[var(--onboarding-text-primary)]">
                  {t("onboarding.rehaul.setupChoice.moreOptions.title")}
                </h2>
                <p className="text-sm leading-[1.4] text-[var(--onboarding-text-secondary)]">
                  {t("onboarding.rehaul.setupChoice.moreOptions.description")}
                </p>
              </div>
            </div>

            {/* Each row is its own action, so they take the slot the local card
                gives its single button. Picking one goes straight to that setup
                step — deliberately skipping the warning dialog the local path
                uses, since the user has already made an explicit choice. */}
            <div className="flex flex-col gap-2">
              {apiSetupOptions.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  // Both rows land on the BYOK step; self-hosted differs only in
                  // starting it with the self-hosted field set on.
                  onClick={() => onSelect("byok", { selfHosted: row.id === "self-hosted" })}
                  className="onboarding-pressable flex w-full items-center gap-3 rounded-2xl border border-[var(--onboarding-control-border)] px-3 py-2.5 text-left hover:bg-[var(--onboarding-surface-hover)]"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full border-[1.47px] border-[var(--onboarding-control-border)] text-[var(--onboarding-accent)]">
                    <row.icon className="size-4" strokeWidth={1.667} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="text-sm font-medium leading-[1.4] text-[var(--onboarding-text-primary)]">
                      {row.title}
                    </span>
                    <span className="text-xs leading-[1.4] text-[var(--onboarding-text-secondary)]">
                      {row.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </SetupCard>
        )}
      </div>

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent
          overlayClassName="bg-[var(--onboarding-scrim)]! backdrop-blur-[11px]"
          className="w-full max-w-sm gap-6 rounded-3xl border-0 bg-[var(--onboarding-surface)] px-4 pb-6 pt-5 text-left text-[var(--onboarding-text-primary)] [&>button]:hidden"
          onOpenAutoFocus={handleWarningAutoFocus}
        >
          {/* Frame 2147258979: 238 tall, radius 20, image crop. The three marks
              are 32 / 55 / 32 on a 14 gap, with the outer two at 72% white so the
              middle one reads as the subject. */}
          <div
            className="flex h-[190px] items-center justify-center rounded-2xl bg-cover bg-center"
            style={{ backgroundImage: `url(${warningBackdrop})` }}
          >
            <div className="flex items-center gap-3.5">
              <span className="flex size-8 items-center justify-center rounded-full border border-[var(--onboarding-control-border)] bg-[color-mix(in_srgb,var(--onboarding-surface)_72%,transparent)] text-[var(--onboarding-text-tertiary)]">
                <KeyRound className="size-4" strokeWidth={1.25} />
              </span>
              <span className="flex size-[55px] items-center justify-center rounded-full border-[1.83px] border-[var(--onboarding-control-border)] bg-[var(--onboarding-surface)] text-[var(--onboarding-accent)]">
                <Laptop className="size-[22px]" strokeWidth={2.14} />
              </span>
              <span className="flex size-8 items-center justify-center rounded-full border border-[var(--onboarding-control-border)] bg-[color-mix(in_srgb,var(--onboarding-surface)_72%,transparent)] text-[var(--onboarding-text-tertiary)]">
                <Server className="size-4" strokeWidth={1.25} />
              </span>
            </div>
          </div>

          {/* Frame 2147259001: col gap 28. */}
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              {/* Important modifiers again: DialogTitle is an h2, and the global
                  h1–h6 rule forces line-height 1.15 and -0.025em tracking. */}
              <DialogTitle className="text-lg! font-semibold! leading-[1.4]! tracking-normal! text-[var(--onboarding-text-primary)]">
                {pending ? t(`onboarding.rehaul.setupChoice.warnings.${pending}.title`) : ""}
              </DialogTitle>
              <DialogDescription className="text-sm leading-[1.4] text-[var(--onboarding-text-secondary)]">
                {pending
                  ? t(`onboarding.rehaul.setupChoice.warnings.${pending}.description`, {
                      minimumSpace: minimumLocalSpaceGb,
                    })
                  : ""}
              </DialogDescription>
            </div>

            {/* Frame 2147258993: no gap between rows — the dashed connectors are
                real elements that supply the spacing, so the line runs continuously
                through the column of numbers. */}
            <ol className="flex flex-col">
              {warningSteps.map((step, index) => (
                <Fragment key={step}>
                  {index > 0 && (
                    <li className="h-[26.5px] w-7 shrink-0" aria-hidden="true">
                      <span className="mx-auto block h-full w-0 border-l border-dashed border-[var(--onboarding-surface-tertiary)]" />
                    </li>
                  )}
                  <li className="flex items-center gap-2">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--onboarding-inverse-surface)] text-sm leading-[1.32] text-[var(--onboarding-inverse-text)]">
                      {index + 1}
                    </span>
                    <span className="flex-1 text-sm font-medium leading-[1.32] text-[var(--onboarding-text-primary)]">
                      {step}
                    </span>
                  </li>
                </Fragment>
              ))}
            </ol>
          </div>

          {/* The same pill pair the cards use (pad 8 20, radius 38, 14/140%
              medium) rather than shadcn Buttons, which came in at h-8/text-xs
              with font-semibold and an outline variant whose border did not
              render against white. */}
          {/* Frame 2147259003: row, gap 10, both actions growing equally. */}
          {/* The escape hatch is secondary on the left; proceeding with the mode
              the user selected is primary on the right. */}
          <div className="flex gap-2.5">
            <CardAction ref={confirmRef} brand className="flex-1" onClick={confirmPending}>
              {pending
                ? t(`onboarding.rehaul.setupChoice.warnings.${pending}.continue`)
                : t("onboarding.rehaul.setupChoice.continueSetup")}
            </CardAction>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
