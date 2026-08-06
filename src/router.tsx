import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import * as Sentry from "@sentry/tanstackstart-react";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Repository data (tree, branches, commits, repo lists) rarely
        // changes moment-to-moment, and every push/delete/rename already
        // invalidates the exact queries it affects. A short staleTime means
        // re-visiting a repo, flipping back to a branch you were just on, or
        // refocusing the tab doesn't re-hit the GitHub API for data that's
        // still perfectly fresh. A manual "Refresh" action always forces a
        // real refetch regardless of this setting.
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  // Browser-only. VITE_SENTRY_DSN unset (e.g. local dev) leaves the SDK
  // disabled — Sentry.captureException calls elsewhere become no-ops.
  if (!router.isServer) {
    Sentry.init({
      dsn: import.meta.env["VITE_SENTRY_DSN"],
      environment: import.meta.env["VITE_SENTRY_ENVIRONMENT"] ?? "production",
      integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
      tracesSampleRate: 0.2,
      // Session Replay isn't wired up yet — add Sentry.replayIntegration()
      // to the array above plus replaysSessionSampleRate /
      // replaysOnErrorSampleRate here if that becomes a priority.
    });
  }

  return router;
};
