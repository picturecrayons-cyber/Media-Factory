import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { completeOnboarding } from "@/lib/bridge/profiles";
import { createTitle, updateTitle } from "@/lib/bridge/titles";
import { getBridgeSession } from "@/lib/bridge/session";
import { retryWorkspaceSession } from "@/lib/auth/workspace-session-retry";
import { supabase } from "@/lib/supabase";
import { publicAccountTypeFrom } from "@/lib/auth/public-account-type";
import { BRIDGE_LOOP_LANES } from "@/lib/bridge/loop-lanes";
import { publicOnboardingError } from "@/lib/bridge/onboarding-errors";
import { BrandMark } from "@/components/bridge/shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/onboarding")({ component: Onboarding });

type PublicAccountType = "independent_creator" | "studio" | "buyer";

const ACCOUNT_LABELS: Record<PublicAccountType, string> = {
  independent_creator: "Independent Creator",
  studio: "Studio / Company",
  buyer: "Buyer / Acquisitions",
};

const LANGUAGES = ["Malayalam", "Tamil", "Telugu", "Kannada", "Hindi", "English", "Bengali", "Marathi", "Other"];
const GENRES = ["Drama", "Comedy", "Thriller", "Horror", "Romance", "Action", "Family", "Documentary"];
const RATINGS = ["U", "UA", "A"];
const LATER = ["Film", "Trailer", "Posters", "English subtitles", "Audio", "Certificate"];

const SESSION_TIMEOUT_MS = 12_000;

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

function Onboarding() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const sessionQ = useQuery({
    queryKey: ["bridge-session", user?.id],
    queryFn: getBridgeSessionWithTimeout,
    enabled: !isPending && Boolean(user),
    retry: 1,
    retryDelay: 500,
  });

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [accountType, setAccountType] = useState<PublicAccountType>("independent_creator");
  const [organizationName, setOrganizationName] = useState("");

  const [titleName, setTitleName] = useState("");
  const [contentType, setContentType] = useState("Film");
  const [language, setLanguage] = useState("Malayalam");
  const [year, setYear] = useState("");
  const [runtimeMinutes, setRuntimeMinutes] = useState("");
  const [genre, setGenre] = useState("");
  const [rating, setRating] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [authorizationAttested, setAuthorizationAttested] = useState(false);

  const [submittedTitleId, setSubmittedTitleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitInFlight = useRef(false);
  const [retrying, setRetrying] = useState(false);

  // Preserve the role chosen during signup instead of silently defaulting
  // every new account to Creator when onboarding opens.
  const signupAccountTypeHint = user?.signupAccountTypeHint;
  const signupAccountType = publicAccountTypeFrom(signupAccountTypeHint);
  const unsupportedSignupRole = Boolean(signupAccountTypeHint && !signupAccountType);

  useEffect(() => {
    if (signupAccountType) setAccountType(signupAccountType);
    if (user?.displayName) setDisplayName((current) => current || user.displayName || "");
  }, [signupAccountType, user?.displayName]);

  const home = sessionQ.data?.profile ? sessionQ.data.home : null;

  useEffect(() => {
    if (home) goHome(home, navigate);
  }, [home, navigate]);

  if (isPending || (user && sessionQ.isPending) || home) {
    return (
      <main className="grid min-h-screen place-items-center bg-bg p-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Submit a title to Crayons Bridge</h1>
          <p className="mt-3 text-sm text-muted">{home ? "Opening workspace…" : "Loading Bridge…"}</p>
        </div>
      </main>
    );
  }
  if (!user) return <RedirectToSignIn />;

  if (submittedTitleId) {
    return (
      <main className="grid min-h-screen place-items-center bg-bg p-6">
        <div className="w-full max-w-lg space-y-5 rounded-2xl border border-line bg-surface p-7">
          <BrandMark />
          <h1 className="font-display text-2xl font-semibold">Record saved</h1>
          <p className="text-sm leading-relaxed text-muted">Film, trailer, posters, subtitles, audio, and the certificate are added on the title. Not here.</p>
          <Button className="w-full" onClick={() => void navigate({ to: "/title/$id", params: { id: submittedTitleId } })}>
            Open title workspace
          </Button>
        </div>
      </main>
    );
  }

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
      <main className="grid min-h-screen place-items-center bg-bg p-6">
        <div className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-6">
          <BrandMark />
          <h1 className="font-display text-2xl">Could not load Bridge</h1>
          <p className="text-sm leading-relaxed text-muted">Retry without clearing your session.</p>
          {error ? <p role="alert" className="text-sm text-accent">{error}</p> : null}
          <Button type="button" disabled={retrying} className="w-full" onClick={() => void retrySession()}>{retrying ? "Checking…" : "Retry"}</Button>
        </div>
      </main>
    );
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

      await completeOnboarding({
        data: {
          displayName: displayName.trim(),
          accountType,
          organizationName: accountType === "studio" ? organizationName.trim() : undefined,
          inviteToken,
        },
      });

      if (accountType === "buyer") {
        void navigate({ to: "/buyer", replace: true });
        return;
      }

      if (!titleName.trim()) throw new Error("Title name is required");
      if (!genre) throw new Error("Choose a genre");
      if (!rating) throw new Error("Choose a rating");
      if (synopsis.trim().length < 20) throw new Error("Add a short synopsis");
      if (!authorizationAttested) throw new Error("Confirm you can submit this title");

      const start = new Date();
      const end = new Date(start);
      end.setFullYear(end.getFullYear() + 3);
      const result = await createTitle({
        data: {
          name: titleName.trim(),
          contentType,
          language,
          year: year ? Number(year) : undefined,
          runtimeMinutes: runtimeMinutes ? Number(runtimeMinutes) : undefined,
          synopsis: synopsis.trim(),
          countryOfOrigin: "India",
          territories: ["India"],
          rightsLanguages: [language],
          media: ["SVOD"],
          windowStart: start.toISOString(),
          windowEnd: end.toISOString(),
          exclusivity: "NON_EXCLUSIVE",
          sublicensingAllowed: false,
          promotionalRights: true,
          rightsBasis: "OWNER",
          authorizationAttested: true,
          screenerAccess: "SCREENER_PENDING",
          intendedDestinations: ["Buyer delivery"],
        },
      });
      if (genre || rating) {
        await updateTitle({ data: { id: result.title.id, genre, rating } }).catch(() => undefined);
      }

      setSubmittedTitleId(result.title.id);
      try { sessionStorage.removeItem("bridge-invite"); } catch { /* ignore */ }
    } catch (err) {
      setError(publicOnboardingError(err));
    } finally {
      submitInFlight.current = false;
      setBusy(false);
    }
  }

  const marks = [
    Boolean((displayName || user.displayName || "").trim()),
    Boolean(titleName.trim()),
    Boolean(genre && rating),
    synopsis.trim().length >= 20,
    authorizationAttested,
  ];
  const progress = accountType === "buyer" ? (marks[0] ? 100 : 0) : Math.round((marks.filter(Boolean).length / marks.length) * 100);
  const field = "mt-1 h-11 w-full rounded-xl border border-[#d5dbe3] bg-white px-3 text-sm";
  const chip = (on: boolean) => `h-10 shrink-0 rounded-full border px-3 text-sm ${on ? "border-[#102033] bg-[#102033] text-white" : "border-[#d5dbe3] bg-white"}`;
  const missing = accountType !== "buyer" && (!genre || !rating) ? "Choose a genre and a rating." : "";

  return (
    <main className="min-h-screen bg-[#eef1f4] text-[#102033]">
      <form onSubmit={(e) => void onSubmit(e)} className="mx-auto grid min-h-screen max-w-6xl lg:grid-cols-[240px_1fr]">
        <aside className="border-b border-white/10 bg-[#102033] p-5 text-white lg:min-h-screen lg:border-b-0">
          <BrandMark />
          <p className="mt-8 text-xs text-white/50">Setup</p>
          <p className="mt-1 font-display text-4xl font-semibold">{progress}%</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full bg-white" style={{ width: `${progress}%` }} /></div>
          <ol className="mt-6 space-y-2 text-sm">
            {["Account", "Title", "Genre and rating", "Synopsis", "Confirm"].map((label, index) => (
              <li key={label} className={marks[index] ? "text-white" : "text-white/40"}>{marks[index] ? "Done" : "Open"} · {label}</li>
            ))}
          </ol>
          <button
            type="button"
            className="mt-8 text-sm text-white/70"
            onClick={() => {
              void supabase.auth.signOut({ scope: "local" }).finally(() => window.location.assign("/login"));
            }}
          >
            Sign out
          </button>
        </aside>
        <div className="flex min-h-screen flex-col">
          <div className="flex-1 space-y-5 p-5 sm:p-8">
            <h1 className="font-display text-3xl font-semibold">New title</h1>
            {unsupportedSignupRole ? <p role="alert" className="text-sm">This role needs a review. <Link to="/contact" className="font-semibold">Contact Bridge</Link>.</p> : null}
            <p className="text-sm text-[#5c6b7a]">{displayName || user.displayName || "Account"}{user.primaryEmail ? ` · ${user.primaryEmail}` : ""}{signupAccountType ? ` · ${ACCOUNT_LABELS[signupAccountType]}` : ""}</p>
            {!user.displayName ? <label className="block text-sm">Name<input required id="onboard-name" name="name" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={field} /></label> : null}
            {!signupAccountType ? (
              <label className="block text-sm">Account
                <select id="onboard-account" name="account" value={accountType} onChange={(e) => setAccountType(e.target.value as PublicAccountType)} className={field}>
                  {(Object.keys(ACCOUNT_LABELS) as PublicAccountType[]).map((type) => <option key={type} value={type}>{ACCOUNT_LABELS[type]}</option>)}
                </select>
              </label>
            ) : null}
            {accountType === "studio" ? <label className="block text-sm">Studio<input required id="onboard-studio" name="organization" autoComplete="organization" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} className={field} /></label> : null}
            {accountType === "buyer" ? <p className="text-sm text-[#5c6b7a]">Buyer accounts open the desk. A title is not created here.</p> : (
              <>
                <label className="block text-sm">Title<input required id="onboard-title" name="title" autoComplete="off" value={titleName} onChange={(e) => setTitleName(e.target.value)} className={field} /></label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">Type<select id="onboard-type" name="type" value={contentType} onChange={(e) => setContentType(e.target.value)} className={field}>{BRIDGE_LOOP_LANES.map((lane) => <option key={lane.id} value={lane.loopType}>{lane.label}</option>)}</select></label>
                  <label className="text-sm">Language<select id="onboard-language" name="language" value={language} onChange={(e) => setLanguage(e.target.value)} className={field}>{LANGUAGES.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label className="text-sm">Year<input id="onboard-year" name="year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} className={field} /></label>
                  <label className="text-sm">Minutes<input id="onboard-runtime" name="runtime" inputMode="numeric" value={runtimeMinutes} onChange={(e) => setRuntimeMinutes(e.target.value)} className={field} /></label>
                </div>
                <div>
                  <p className="text-sm">Genre</p>
                  <div className="mt-2 flex flex-wrap gap-2">{GENRES.map((item) => <button key={item} type="button" onClick={() => setGenre(item)} className={chip(genre === item)}>{item}</button>)}</div>
                </div>
                <div>
                  <p className="text-sm">Rating</p>
                  <div className="mt-2 flex flex-wrap gap-2">{RATINGS.map((item) => <button key={item} type="button" onClick={() => setRating(item)} className={chip(rating === item)}>{item}</button>)}</div>
                </div>
                <label className="block text-sm">Synopsis<textarea required id="onboard-synopsis" name="synopsis" autoComplete="off" minLength={20} rows={3} value={synopsis} onChange={(e) => setSynopsis(e.target.value)} className="mt-1 w-full rounded-xl border border-[#d5dbe3] bg-white px-3 py-2 text-sm" /></label>
                <label className="flex items-center gap-3 rounded-xl border border-[#d5dbe3] bg-white px-3 py-3 text-sm"><input type="checkbox" checked={authorizationAttested} onChange={(e) => setAuthorizationAttested(e.target.checked)} />I can submit this title.</label>
                <div>
                  <p className="text-sm">Added on the title</p>
                  <div className="mt-2 flex flex-wrap gap-2">{LATER.map((item) => <span key={item} className="rounded-full bg-white px-3 py-2 text-xs text-[#5c6b7a]">{item}</span>)}</div>
                </div>
              </>
            )}
          </div>
          <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-[#d5dbe3] bg-white px-5 py-3">
            {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : <p className="text-sm text-[#5c6b7a]">{missing || `${progress}% ready`}</p>}
            <Button type="submit" disabled={busy} className="h-11 rounded-full px-6">{busy ? "Saving…" : accountType === "buyer" ? "Open desk" : "Save record"}</Button>
          </div>
        </div>
      </form>
    </main>
  );
}
