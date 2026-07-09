import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: (s) => searchSchema.parse(s),
  component: AuthPage,
});

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Account erstellt. Du kannst jetzt loslegen.");
        navigate({ to: "/dashboard", replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Willkommen zurück.");
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Etwas ist schiefgelaufen.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setOauthLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google-Anmeldung fehlgeschlagen.");
      setOauthLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Zurück
        </Link>

        <div className="mt-16">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-signal" />
            <span className="font-display text-2xl leading-none">Veritas</span>
          </div>

          <h1 className="font-display mt-10 text-5xl leading-[0.95]">
            {mode === "signin" ? "Willkommen zurück." : "Lass uns starten."}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Melde dich an, um dein Discovery-Feed zu öffnen."
              : "Wähle deine Themen. Wir übernehmen den Rest."}
          </p>
        </div>

        <button
          onClick={handleGoogle}
          disabled={oauthLoading}
          className="mt-10 flex w-full items-center justify-center gap-3 rounded-md border border-border bg-surface px-4 py-3 text-sm font-medium transition hover:bg-accent disabled:opacity-50"
        >
          {oauthLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5.4c1.8 0 3.4.7 4.6 1.8L20 3.8C17.9 1.9 15.1.8 12 .8 7.3.8 3.3 3.5 1.4 7.5l4 3.1C6.4 7.6 8.9 5.4 12 5.4z"
              />
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6l3.8 3c2.2-2 3.6-5 3.6-8.8z"
              />
              <path
                fill="#FBBC05"
                d="M5.4 14.4c-.3-.8-.4-1.6-.4-2.4s.2-1.6.4-2.4l-4-3.1C.5 8.3 0 10.1 0 12s.5 3.7 1.4 5.5l4-3.1z"
              />
              <path
                fill="#34A853"
                d="M12 23.2c3.2 0 5.9-1.1 7.9-2.9l-3.8-3c-1.1.7-2.4 1.1-4.1 1.1-3.1 0-5.7-2.1-6.6-5l-4 3.1c1.9 3.9 5.9 6.7 10.6 6.7z"
              />
            </svg>
          )}
          Mit Google fortfahren
        </button>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            oder
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleEmail} className="space-y-3">
          {mode === "signup" && (
            <input
              type="text"
              placeholder="Anzeigename"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-4 py-3 text-sm placeholder:text-muted-foreground focus:border-signal focus:outline-none"
            />
          )}
          <input
            type="email"
            required
            placeholder="E-Mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-4 py-3 text-sm placeholder:text-muted-foreground focus:border-signal focus:outline-none"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Passwort"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-4 py-3 text-sm placeholder:text-muted-foreground focus:border-signal focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-signal px-4 py-3 text-sm font-medium text-signal-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "signin" ? "Anmelden" : "Account erstellen"}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          {mode === "signin" ? "Noch kein Account?" : "Bereits registriert?"}{" "}
          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="text-foreground underline underline-offset-4 hover:text-signal"
          >
            {mode === "signin" ? "Registrieren" : "Anmelden"}
          </button>
        </p>
      </div>
    </div>
  );
}
