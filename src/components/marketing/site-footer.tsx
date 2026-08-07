import { Link } from "@tanstack/react-router";
import { Terminal } from "lucide-react";

/**
 * Footer for public marketing pages (currently just the frontpage). Only
 * links to routes/anchors that actually exist — no placeholder Docs/Blog
 * links to nowhere.
 */
export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <div className="flex items-center gap-2 font-mono text-sm">
              <Terminal className="size-4 text-primary" />
              <span className="font-semibold tracking-tight">gitpush</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Push files to GitHub straight from your browser — no clone, no CLI.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <div>
              <p className="label-caps">Product</p>
              <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                <li>
                  <a href="#features" className="transition-colors hover:text-foreground">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#faq" className="transition-colors hover:text-foreground">
                    FAQ
                  </a>
                </li>
                <li>
                  <Link to="/pricing" className="transition-colors hover:text-foreground">
                    Pricing
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="label-caps">Account</p>
              <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                <li>
                  <Link to="/auth" className="transition-colors hover:text-foreground">
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link to="/auth" className="transition-colors hover:text-foreground">
                    Create account
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} gitpush. All rights reserved.</p>
          <p>Built for the moments you just need one file in a repo.</p>
        </div>
      </div>
    </footer>
  );
}
