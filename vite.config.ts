// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      // Uploads source maps on production builds so Sentry stack traces show
      // real file/line info instead of minified output. No-ops (with a
      // console notice, no build failure) until SENTRY_ORG, SENTRY_PROJECT,
      // and SENTRY_AUTH_TOKEN are set — see .env.
      sentryTanstackStart({
        org: process.env["SENTRY_ORG"],
        project: process.env["SENTRY_PROJECT"],
        authToken: process.env["SENTRY_AUTH_TOKEN"],
        telemetry: false,
      }),
    ],
  },
});
