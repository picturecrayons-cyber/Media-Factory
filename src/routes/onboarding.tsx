import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { completeOnboarding } from "@/lib/bridge/profiles";
import { createTitle } from "@/lib/bridge/titles";
import { getBridgeSession } from "@/lib/bridge/session";
import { retryWorkspaceSession } from "@/lib/auth/workspace-session-retry";
import { supabase } from "@/lib/supabase";
import { ACCOUNT_TYPES } from "@/lib/bridge/types";
import { publicAccountTypeFrom } from "@/lib/auth/public-account-type";
import { BRIDGE_LOOP_LANES } from "@/lib/bridge/loop-lanes";
import { publicOnboardingError } from "@/lib/bridge/onboarding-errors";
import { BrandMark } from "@/components/bridge/shell";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/onboarding")({ component: Onboarding });

type PublicAccountType = "independent_creator" | "studio" | "buyer";

const ACCOUNT_LABELS: Record<PublicAccountType, string> = {
  independent_creator: "Independent Creator",
  studio: "Studio / Company",
  buyer: "Buyer / Acquisitions",
};

const LANGUAGES = ["Malayalam", "Tamil", "Telugu", "Kannada", "Hindi", "English", "Bengali", "Marathi", "Other"];
const TERRITORIES = ["India", "Worldwide", "South Asia", "GCC", "North America", "United Kingdom", "Europe", "Australia / New Zealand", "Other"];
const MEDIA = ["SVOD", "TVOD", "AVOD", "FAST", "Broadcast", "Theatrical", "Airline", "Educational", "Festival", "Crayons Loop"];
const DESTINATIONS = ["Crayons Loop", "External OTT", "Broadcast / TV", "TVOD / EST", "FAST", "Festival / Educational", "Buyer delivery"];

const SESSION_TIMEOUT_MS = 12_000;
const DRAFT_KEY_PREFIX = "crayons-bridge:onboarding-draft:v1:";

type OnboardingDraft = {
  displayName: string; accountType: PublicAccountType; organizationName: string;
  titleName: string; originalTitle: string; contentType: string; language: string;
  additionalLanguages: string[]; year: string; runtimeMinutes: string; synopsis: string;
  countryOfOrigin: string; releaseDate: string; director: string; producer: string;
  territories: string[]; rightsLanguages: string[]; media: string[]; windowStart: string; windowEnd: string;
  exclusivity: "EXCLUSIVE" | "NON_EXCLUSIVE"; sublicensingAllowed: boolean; promotionalRights: boolean;
  rightsBasis: "OWNER" | "EXCLUSIVE_LICENSEE" | "AUTHORIZED_DISTRIBUTOR" | "PRODUCER_AUTHORITY";
  authorizationAttested: boolean; screenerAccess: "BRIDGE_PRIVATE_SCREENER" | "SCREENER_PENDING"; destinations: string[];
};

function OnboardingHeader() {
  const user = useCurrentUser();
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <BrandMark />
        <div className="ml-auto flex min-w-0 items-center justify-end gap-3">
          <span className="hidden text-xs text-muted sm:inline">Creator onboarding</span>
          <span className="max-w-[42vw] truncate text-xs text-muted sm:max-w-none">{user?.primaryEmail ?? user?.displayName ?? "Account"}</span>
          <UserButton />
        </div>
      </div>
    </header>
  );
}

async function getBridgeSessionWithTimeout() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getBridgeSession(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Session check timed out. Please retry.")), SESSION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function goHome(home: string | null | undefined, navigate: ReturnType<typeof useNavigate>) {
  void navigate({ to: (home || "/dashboard") as any, replace: true });
}

function CheckGroup({
  label,
  values,
  selected,
  onChange,
  required = false,
}: {
  label: string;
  values: string[];
  selected: string[];
  onChange: (value: string, checked: boolean) => void;
  required?: boolean;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-fg">
        {label}{required ? " *" : ""}
      </legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {values.map((value) => (
          <label key={value} className="flex min-h-10 items-center gap-2 rounded-xl border border-line bg-elevated px-3 text-xs text-fg">
            <input
              type="checkbox"
              checked={selected.includes(value)}
              onChange={(e) => onChange(value, e.target.checked)}
              className="accent-current"
            />
            <span>{value}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Onboarding() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionQ = useQuery({
    queryKey: ["bridge-session", user?.id],
    queryFn: getBridgeSessionWithTimeout,
    enabled: !isPending && Boolean(user),
    retry: 1,
    retryDelay: 500,
  });

  const [displayName, setDisplayName] = useState("");
  const [accountType, setAccountType] = useState<PublicAccountType>("independent_creator");
  const [organizationName, setOrganizationName] = useState("");

  const [titleName, setTitleName] = useState("");
  const [originalTitle, setOriginalTitle] = useState("");
  const [contentType, setContentType] = useState("Film");
  const [language, setLanguage] = useState("Malayalam");
  const [additionalLanguages, setAdditionalLanguages] = useState<string[]>([]);
  const [year, setYear] = useState("");
  const [runtimeMinutes, setRuntimeMinutes] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [countryOfOrigin, setCountryOfOrigin] = useState("India");
  const [releaseDate, setReleaseDate] = useState("");
  const [director, setDirector] = useState("");
  const [producer, setProducer] = useState("");

  const [territories, setTerritories] = useState<string[]>(["India"]);
  const [rightsLanguages, setRightsLanguages] = useState<string[]>(["Malayalam"]);
  const [media, setMedia] = useState<string[]>(["SVOD"]);
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [exclusivity, setExclusivity] = useState<"EXCLUSIVE" | "NON_EXCLUSIVE">("NON_EXCLUSIVE");
  const [sublicensingAllowed, setSublicensingAllowed] = useState(false);
  const [promotionalRights, setPromotionalRights] = useState(true);
  const [rightsBasis, setRightsBasis] = useState<"OWNER" | "EXCLUSIVE_LICENSEE" | "AUTHORIZED_DISTRIBUTOR" | "PRODUCER_AUTHORITY">("OWNER");
  const [authorizationAttested, setAuthorizationAttested] = useState(false);
  const [authorizationEvidenceType, setAuthorizationEvidenceType] = useState<"" | "RIGHTS_AGREEMENT" | "CHAIN_OF_TITLE" | "AUTHORIZATION_LETTER" | "DISTRIBUTION_AGREEMENT" | "OTHER">("");
  const [screenerAccess, setScreenerAccess] = useState<"BRIDGE_PRIVATE_SCREENER" | "SCREENER_PENDING">("SCREENER_PENDING");
  const [destinations, setDestinations] = useState<string[]>(["Buyer delivery"]);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitInFlight = useRef(false);
  const [retrying, setRetrying] = useState(false);
  const [draftLoadedFor, setDraftLoadedFor] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState("Draft is saved only in this browser.");
  const draftKey = user?.id ? `${DRAFT_KEY_PREFIX}${user.id}` : null;

  const currentDraft: OnboardingDraft = {
    displayName, accountType, organizationName, titleName, originalTitle, contentType, language,
    additionalLanguages, year, runtimeMinutes, synopsis, countryOfOrigin, releaseDate, director, producer,
    territories, rightsLanguages, media, windowStart, windowEnd, exclusivity, sublicensingAllowed,
    promotionalRights, rightsBasis, authorizationAttested, screenerAccess, destinations,
  };

  useEffect(() => {
    if (!draftKey || isPending) return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw) as Partial<OnboardingDraft>;
        if (typeof d.displayName === "string") setDisplayName(d.displayName);
        if (d.accountType === "independent_creator" || d.accountType === "studio" || d.accountType === "buyer") setAccountType(d.accountType);
        if (typeof d.organizationName === "string") setOrganizationName(d.organizationName);
        if (typeof d.titleName === "string") setTitleName(d.titleName);
        if (typeof d.originalTitle === "string") setOriginalTitle(d.originalTitle);
        if (typeof d.contentType === "string") setContentType(d.contentType);
        if (typeof d.language === "string") setLanguage(d.language);
        if (Array.isArray(d.additionalLanguages)) setAdditionalLanguages(d.additionalLanguages.filter((x): x is string => typeof x === "string"));
        if (typeof d.year === "string") setYear(d.year);
        if (typeof d.runtimeMinutes === "string") setRuntimeMinutes(d.runtimeMinutes);
        if (typeof d.synopsis === "string") setSynopsis(d.synopsis);
        if (typeof d.countryOfOrigin === "string") setCountryOfOrigin(d.countryOfOrigin);
        if (typeof d.releaseDate === "string") setReleaseDate(d.releaseDate);
        if (typeof d.director === "string") setDirector(d.director);
        if (typeof d.producer === "string") setProducer(d.producer);
        if (Array.isArray(d.territories)) setTerritories(d.territories.filter((x): x is string => typeof x === "string"));
        if (Array.isArray(d.rightsLanguages)) setRightsLanguages(d.rightsLanguages.filter((x): x is string => typeof x === "string"));
        if (Array.isArray(d.media)) setMedia(d.media.filter((x): x is string => typeof x === "string"));
        if (typeof d.windowStart === "string") setWindowStart(d.windowStart);
        if (typeof d.windowEnd === "string") setWindowEnd(d.windowEnd);
        if (d.exclusivity === "EXCLUSIVE" || d.exclusivity === "NON_EXCLUSIVE") setExclusivity(d.exclusivity);
        if (typeof d.sublicensingAllowed === "boolean") setSublicensingAllowed(d.sublicensingAllowed);
        if (typeof d.promotionalRights === "boolean") setPromotionalRights(d.promotionalRights);
        if (d.rightsBasis === "OWNER" || d.rightsBasis === "EXCLUSIVE_LICENSEE" || d.rightsBasis === "AUTHORIZED_DISTRIBUTOR" || d.rightsBasis === "PRODUCER_AUTHORITY") setRightsBasis(d.rightsBasis);
        // Legal rights attestation is never restored from local storage. Require a fresh, explicit affirmation for every submission.
        setAuthorizationAttested(false);
        if (d.screenerAccess === "BRIDGE_PRIVATE_SCREENER" || d.screenerAccess === "SCREENER_PENDING") setScreenerAccess(d.screenerAccess);
        if (Array.isArray(d.destinations)) setDestinations(d.destinations.filter((x): x is string => typeof x === "string"));
        setDraftStatus("Saved draft restored from this browser.");
      }
    } catch {
      setDraftStatus("Could not restore the local draft. You can continue or save a new draft.");
    } finally {
      setDraftLoadedFor(draftKey);
    }
  }, [draftKey, isPending]);

  useEffect(() => {
    if (!draftKey || draftLoadedFor !== draftKey) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(currentDraft));
      setDraftStatus("Draft saved in this browser.");
    } catch {
      setDraftStatus("Draft could not be saved in this browser. Check available storage.");
    }
  // currentDraft is an intentional snapshot of every intake field.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, draftLoadedFor, displayName, accountType, organizationName, titleName, originalTitle, contentType, language, additionalLanguages, year, runtimeMinutes, synopsis, countryOfOrigin, releaseDate, director, producer, territories, rightsLanguages, media, windowStart, windowEnd, exclusivity, sublicensingAllowed, promotionalRights, rightsBasis, authorizationAttested, screenerAccess, destinations]);

  // Preserve the role chosen during signup instead of silently defaulting
  // every new account to Creator when onboarding opens.
  const signupAccountTypeHint = user?.signupAccountTypeHint;
  const signupAccountType = publicAccountTypeFrom(signupAccountTypeHint);
  const unsupportedSignupRole = Boolean(signupAccountTypeHint && !signupAccountType);

  useEffect(() => {
    if (signupAccountType) setAccountType(signupAccountType);
  }, [signupAccountType]);

  const home = sessionQ.data?.home && sessionQ.data.home !== "/onboarding" ? sessionQ.data.home : null;

  useEffect(() => {
    if (home) goHome(home, navigate);
  }, [home, navigate]);

  if (isPending || (user && sessionQ.isPending) || home) {
    return <div className="min-h-screen bg-bg"><OnboardingHeader /><main className="grid min-h-[60vh] place-items-center p-6"><p className="text-sm text-muted">{home ? "Opening workspace…" : "Loading Bridge…"}</p></main></div>;
  }
  if (!user) return <RedirectToSignIn />;

  if (sessionQ.isError) {
    async function retrySession() {
      if (retrying) return;
      setRetrying(true);
      setError(null);
      try {
        await retryWorkspaceSession({
          checkUser: () => supabase.auth.getUser(),
          refetch: async () => { const result = await sessionQ.refetch(); if (result.error) throw result.error; },
          signIn: async () => { await supabase.auth.signOut({ scope: "local" }).catch(() => undefined); void navigate({ to: "/login", replace: true }); },
        });
      } catch {
        setError("Bridge could not load onboarding. Please try again shortly.");
      } finally {
        setRetrying(false);
      }
    }
    return (
      <div className="min-h-screen bg-bg"><OnboardingHeader /><main className="grid min-h-[60vh] place-items-center p-6">
        <div className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-6">
          <BrandMark />
          <h1 className="font-display text-2xl">Could not load Bridge</h1>
          <p className="text-sm leading-relaxed text-muted">Retry without clearing your session.</p>
          {error ? <p role="alert" className="text-sm text-accent">{error}</p> : null}
          <Button type="button" disabled={retrying} className="w-full" onClick={() => void retrySession()}>{retrying ? "Checking…" : "Retry"}</Button>
        </div>
      </main></div>
    );
  }

  function toggle(setter: (next: string[]) => void, current: string[], value: string, checked: boolean) {
    setter(checked ? [...current, value] : current.filter((item) => item !== value));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (unsupportedSignupRole) {
      setError("This account type needs an invitation or support review. Please contact Crayons Bridge before continuing.");
      return;
    }
    if (submitInFlight.current) return;
    submitInFlight.current = true;
    setBusy(true);
    setError(null);

    try {
      let inviteToken: string | undefined;
      try { inviteToken = sessionStorage.getItem("bridge-invite") ?? undefined; } catch { /* ignore */ }

      if (accountType === "buyer") {
        await completeOnboarding({
          data: {
            displayName: displayName.trim(),
            accountType,
            organizationName: undefined,
            inviteToken,
          },
        });
        try { sessionStorage.removeItem("bridge-invite"); } catch { /* ignore */ }
        void navigate({ to: "/buyer", replace: true });
        return;
      }

      if (!titleName.trim()) throw new Error("Title name is required");
      if (synopsis.trim().length < 20) throw new Error("Add a synopsis of at least 20 characters");
      if (!territories.length || !rightsLanguages.length || !media.length || !destinations.length) {
        throw new Error("Select at least one value in each rights package group");
      }
      if (!windowStart || !windowEnd) throw new Error("Rights window start and end are required");
      if (!authorizationAttested) throw new Error("Confirm that you have authority to license the submitted rights");
      if (!authorizationEvidenceType) throw new Error("Select the authorization evidence you will provide");
      if (new Date(windowEnd) <= new Date(windowStart)) throw new Error("Rights window end must be after start");

      // Create the server-backed profile only after intake validation passes.
      // If title creation fails, the server-side intake-state check keeps the
      // creator on /onboarding so they can retry without being stranded.
      await completeOnboarding({
        data: {
          displayName: displayName.trim(),
          accountType,
          organizationName: accountType === "studio" ? organizationName.trim() : undefined,
          inviteToken,
        },
      });

      await createTitle({
        data: {
          name: titleName.trim(),
          originalTitle: originalTitle.trim() || undefined,
          contentType,
          language,
          additionalLanguages,
          year: year ? Number(year) : undefined,
          runtimeMinutes: runtimeMinutes ? Number(runtimeMinutes) : undefined,
          synopsis: synopsis.trim(),
          countryOfOrigin: countryOfOrigin.trim() || undefined,
          releaseDate: releaseDate || undefined,
          director: director.trim() || undefined,
          producer: producer.trim() || undefined,
          territories,
          rightsLanguages,
          media,
          windowStart: new Date(windowStart).toISOString(),
          windowEnd: new Date(windowEnd).toISOString(),
          exclusivity,
          sublicensingAllowed,
          promotionalRights,
          rightsBasis,
          authorizationAttested,
          authorizationEvidenceType,
          publicSubmission: true,
          screenerAccess,
          intendedDestinations: destinations,
        },
      });

      try { sessionStorage.removeItem("bridge-invite"); } catch { /* ignore */ }
      if (draftKey) { try { window.localStorage.removeItem(draftKey); } catch { /* ignore */ } }
      void queryClient.invalidateQueries({ queryKey: ["bridge-session"] });
      void queryClient.invalidateQueries({ queryKey: ["bridge-titles"] });
      void navigate({ to: "/studio", replace: true });
    } catch (err) {
      setError(publicOnboardingError(err));
    } finally {
      submitInFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      <OnboardingHeader />
      <main className="p-5 sm:p-8">
      <form onSubmit={(e) => void onSubmit(e)} className="mx-auto max-w-4xl space-y-6 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <div className="flex items-start justify-between gap-5">
          <div>
            <BrandMark />
            <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">Submit a title to Crayons Bridge</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              Upload → Prepare → License → Earn. This intake captures the minimum structured information needed to start rights review and buyer preparation.
            </p>
          </div>
          <span className="hidden rounded-full border border-line bg-elevated px-3 py-1 text-xs text-muted sm:inline-flex">StreamVista OPC Pvt Ltd.</span>
        </div>

        <section className="space-y-4 rounded-2xl border border-line p-5">
          <div>
            <h2 className="font-display text-xl font-semibold">1. Account</h2>
            <p className="mt-1 text-xs text-muted">Legal owner: StreamVista OPC Pvt Ltd. Product: Crayons Bridge.</p>
          </div>
          {unsupportedSignupRole ? (
            <div role="alert" className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-fg">
              This signup link contains a role that is not available through public onboarding. No role has been granted. <Link to="/contact" className="font-semibold underline">Contact Bridge</Link> to request the correct workspace.
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Your name *
              <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5" />
            </label>
            <label className="text-sm font-medium">Account type *
              <select value={accountType} onChange={(e) => setAccountType(e.target.value as PublicAccountType)} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5">
                {(Object.keys(ACCOUNT_LABELS) as PublicAccountType[]).map((type) => <option key={type} value={type}>{ACCOUNT_LABELS[type]}</option>)}
              </select>
            </label>
          </div>
          {accountType === "studio" ? (
            <label className="block text-sm font-medium">Studio / company name *
              <input required value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5" />
            </label>
          ) : null}
        </section>

        {accountType === "buyer" ? (
          <section className="rounded-2xl border border-line bg-elevated p-5">
            <h2 className="font-display text-xl font-semibold">Buyer access</h2>
            <p className="mt-2 text-sm text-muted">Buyer accounts discover and license titles. Rights-holder submissions are limited to Independent Creator and Studio / Company accounts.</p>
          </section>
        ) : (
          <>
            <section className="space-y-4 rounded-2xl border border-line p-5">
              <div><h2 className="font-display text-xl font-semibold">2. Title</h2><p className="mt-1 text-xs text-muted">Use structured fields; only the title synopsis remains free text.</p></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">Title name *
                  <input required value={titleName} onChange={(e) => setTitleName(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5" />
                </label>
                <label className="text-sm font-medium">Original / local title
                  <input value={originalTitle} onChange={(e) => setOriginalTitle(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5" />
                </label>
                <label className="text-sm font-medium">Content type *
                  <select value={contentType} onChange={(e) => setContentType(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5">
                    {BRIDGE_LOOP_LANES.map((lane) => <option key={lane.id} value={lane.loopType}>{lane.label}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium">Original language *
                  <select value={language} onChange={(e) => setLanguage(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5">{LANGUAGES.map((item) => <option key={item}>{item}</option>)}</select>
                </label>
                <label className="text-sm font-medium">Release year
                  <input type="number" min="1895" max="2100" value={year} onChange={(e) => setYear(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5" />
                </label>
                <label className="text-sm font-medium">Runtime (minutes)
                  <input type="number" min="1" max="600" value={runtimeMinutes} onChange={(e) => setRuntimeMinutes(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5" />
                </label>
              </div>
              <CheckGroup label="Additional languages" values={LANGUAGES} selected={additionalLanguages} onChange={(v, c) => toggle(setAdditionalLanguages, additionalLanguages, v, c)} />
              <label className="block text-sm font-medium">Synopsis *
                <textarea required minLength={20} maxLength={4000} rows={5} value={synopsis} onChange={(e) => setSynopsis(e.target.value)} className="mt-1.5 w-full rounded-xl border border-line-strong bg-elevated px-3.5 py-3" />
              </label>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="text-sm font-medium">Country of origin
                  <input value={countryOfOrigin} onChange={(e) => setCountryOfOrigin(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5" />
                </label>
                <label className="text-sm font-medium">Release date
                  <input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5" />
                </label>
                <label className="text-sm font-medium">Director
                  <input value={director} onChange={(e) => setDirector(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5" />
                </label>
              </div>
              <label className="block text-sm font-medium">Producer
                <input value={producer} onChange={(e) => setProducer(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5" />
              </label>
            </section>

            <section className="space-y-4 rounded-2xl border border-line p-5">
              <div><h2 className="font-display text-xl font-semibold">3. Rights package</h2><p className="mt-1 text-xs text-muted">These controls define what a buyer may license. No open-ended rights description is accepted.</p></div>
              <CheckGroup label="Territories" values={TERRITORIES} selected={territories} onChange={(v, c) => toggle(setTerritories, territories, v, c)} required />
              <CheckGroup label="Rights languages" values={LANGUAGES} selected={rightsLanguages} onChange={(v, c) => toggle(setRightsLanguages, rightsLanguages, v, c)} required />
              <CheckGroup label="Exploitation / media" values={MEDIA} selected={media} onChange={(v, c) => toggle(setMedia, media, v, c)} required />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">Rights window starts *
                  <input required type="datetime-local" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5" />
                </label>
                <label className="text-sm font-medium">Rights window ends *
                  <input required type="datetime-local" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5" />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="text-sm font-medium">Exclusivity *
                  <select value={exclusivity} onChange={(e) => setExclusivity(e.target.value as "EXCLUSIVE" | "NON_EXCLUSIVE")} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5"><option value="NON_EXCLUSIVE">Non-exclusive</option><option value="EXCLUSIVE">Exclusive</option></select>
                </label>
                <label className="text-sm font-medium">Sublicensing *
                  <select value={String(sublicensingAllowed)} onChange={(e) => setSublicensingAllowed(e.target.value === "true")} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5"><option value="false">Not allowed</option><option value="true">Allowed</option></select>
                </label>
                <label className="text-sm font-medium">Promotional rights *
                  <select value={String(promotionalRights)} onChange={(e) => setPromotionalRights(e.target.value === "true")} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5"><option value="true">Included</option><option value="false">Not included</option></select>
                </label>
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border border-line p-5">
              <div><h2 className="font-display text-xl font-semibold">4. Authorization & access</h2><p className="mt-1 text-xs text-muted">Attestation starts the legal review. It does not replace documentary evidence.</p></div>
              <label className="text-sm font-medium">Rights basis *
                <select value={rightsBasis} onChange={(e) => setRightsBasis(e.target.value as typeof rightsBasis)} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5">
                  <option value="OWNER">I am the rights owner</option>
                  <option value="EXCLUSIVE_LICENSEE">Exclusive licensee</option>
                  <option value="AUTHORIZED_DISTRIBUTOR">Authorized distributor</option>
                  <option value="PRODUCER_AUTHORITY">Producer authority</option>
                </select>
              </label>
              <label className="text-sm font-medium">Authorization evidence type *
                <select required value={authorizationEvidenceType} onChange={(e) => setAuthorizationEvidenceType(e.target.value as typeof authorizationEvidenceType)} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5">
                  <option value="">Select evidence type</option>
                  <option value="RIGHTS_AGREEMENT">Rights agreement</option>
                  <option value="CHAIN_OF_TITLE">Chain of title</option>
                  <option value="AUTHORIZATION_LETTER">Authorization letter</option>
                  <option value="DISTRIBUTION_AGREEMENT">Distribution agreement</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-line bg-elevated p-4 text-sm">
                <input required type="checkbox" checked={authorizationAttested} onChange={(e) => setAuthorizationAttested(e.target.checked)} className="mt-0.5 accent-current" />
                <span>I confirm that I am authorized to submit and license the selected rights. I understand Bridge will require supporting authorization / chain-of-title evidence before Licensing Ready.</span>
              </label>
              <label className="text-sm font-medium">Screener status *
                <select value={screenerAccess} onChange={(e) => setScreenerAccess(e.target.value as typeof screenerAccess)} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-elevated px-3.5">
                  <option value="SCREENER_PENDING">I will upload a screener in Bridge after submission</option>
                  <option value="BRIDGE_PRIVATE_SCREENER">Private Bridge screener is ready to upload</option>
                </select>
              </label>
              <CheckGroup label="Intended delivery destinations" values={DESTINATIONS} selected={destinations} onChange={(v, c) => toggle(setDestinations, destinations, v, c)} required />
            </section>
          </>
        )}

        {error ? <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</div> : null}
        <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs leading-relaxed text-muted">© 2026 StreamVista OPC Pvt Ltd. Crayons Bridge is the media supply chain, rights and licensing control plane.</p>
            <p role="status" aria-live="polite" className="text-xs text-muted">{draftStatus} This draft stays on this device and is not submitted to Bridge.</p>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <button type="button" onClick={() => { if (!draftKey) return; try { window.localStorage.setItem(draftKey, JSON.stringify(currentDraft)); setDraftStatus("Draft saved in this browser."); } catch { setDraftStatus("Draft could not be saved in this browser. Check available storage."); } }} className="font-semibold underline underline-offset-4">Save draft</button>
              <Link to="/" className="font-semibold underline underline-offset-4">Exit onboarding</Link>
              <button type="button" onClick={() => { if (!draftKey) return; try { window.localStorage.removeItem(draftKey); setDraftStatus("Saved draft removed from this browser."); } catch { setDraftStatus("Could not remove the local draft."); } }} className="text-muted underline underline-offset-4">Delete local draft</button>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <Button type="submit" disabled={busy} className="h-11 rounded-full px-6 font-semibold">{busy ? "Submitting…" : accountType === "buyer" ? "Enter Bridge" : "Submit title for review"}</Button>
          </div>
        </div>
      </form>
      </main>
    </div>
  );
}
