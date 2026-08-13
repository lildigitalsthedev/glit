import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { recordLogin } from "@/lib/audit.functions";

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const recordLoginFn = useServerFn(recordLogin);

  useEffect(() => {
    // The auth client throws if backend env vars are missing (e.g. a stale
    // build). Degrade to "signed out" instead of blanking the whole app.
    try {
      const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
        setSession(next);
        setLoading(false);
        // Feature 9: Audit Logs. Only the genuine "a new session just
        // started" event — never `INITIAL_SESSION` (a page refresh
        // restoring an existing session) or `TOKEN_REFRESHED` — so this
        // fires once per real sign-in, not once per tab open. Fire-and-
        // forget: a slow or failed audit write should never hold up
        // getting into the app.
        if (event === "SIGNED_IN") {
          void recordLoginFn().catch((err) => console.error("[audit] recordLogin failed:", err));
        }
      });
      void supabase.auth
        .getSession()
        .then(({ data }) => {
          setSession(data.session);
          setLoading(false);
        })
        .catch(() => setLoading(false));
      return () => sub.subscription.unsubscribe();
    } catch (err) {
      console.error("[auth] unavailable:", err);
      setLoading(false);
      return;
    }
  }, [recordLoginFn]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signOut: async () => {
          try {
            await supabase.auth.signOut();
          } catch (err) {
            console.error("[auth] sign-out failed:", err);
          }
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}