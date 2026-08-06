import { type ReactNode } from "react";
import { ScrollText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const LAST_UPDATED = "August 6, 2026";

interface TermsSection {
  title: string;
  body: ReactNode;
}

const SECTIONS: TermsSection[] = [
  {
    title: "1. What GitPush is",
    body: (
      <p>
        GitPush ("GitPush", "we", "us") is a browser-based editor that lets you create, edit, and
        commit files directly to your own GitHub repositories, without cloning a repo or using a
        command line. By creating an account, you agree to these Terms of Service ("Terms"). If you
        don't agree, please don't create an account or use GitPush.
      </p>
    ),
  },
  {
    title: "2. Your account",
    body: (
      <p>
        You need an account to use GitPush, created with an email and password or by signing in
        with Google. You're responsible for keeping your login credentials secure and for
        everything that happens under your account. Let us know right away if you suspect
        unauthorized access.
      </p>
    ),
  },
  {
    title: "3. Connecting GitHub",
    body: (
      <p>
        To edit and push files, you connect a GitHub account and authorize GitPush with the{" "}
        <code className="rounded bg-secondary px-1 py-0.5 font-mono text-[11px]">repo</code> scope,
        which lets GitPush read and write to repositories you have access to. Your GitHub access
        token is encrypted at rest on our servers and is never sent to or stored in your browser.
        You can revoke this access at any time from your GitHub account settings or by
        disconnecting the account inside GitPush. You're solely responsible for the repositories
        you connect and for having the rights to edit and push to them.
      </p>
    ),
  },
  {
    title: "4. Your content",
    body: (
      <p>
        Any code, files, or commit messages you create or upload through GitPush belong to you.
        GitPush only reads and writes them on your behalf, to and from the repositories you
        choose — we don't claim ownership over your content and don't use it for anything beyond
        providing the service. You're responsible for making sure what you push doesn't infringe
        anyone else's rights, isn't illegal, and doesn't violate GitHub's own Terms of Service or
        Acceptable Use Policies.
      </p>
    ),
  },
  {
    title: "5. AI features",
    body: (
      <p>
        Pro plans can enable optional AI features — code generation, natural-language file edits,
        repository chat, and AI-generated commit messages — using an API key you provide for a
        third-party AI provider (such as OpenAI, Anthropic, or Google). When you use these
        features, the relevant file contents and prompts are sent to that provider using your key,
        subject to that provider's own terms and privacy practices. GitPush isn't responsible for
        how a third-party AI provider handles data you choose to send it. Don't include secrets,
        credentials, or other sensitive data in prompts or files you send through AI features
        unless you're comfortable with your chosen provider processing them.
      </p>
    ),
  },
  {
    title: "6. Plans and billing",
    body: (
      <p>
        GitPush offers a Free plan and a paid Pro plan. Pro subscriptions are billed through our
        payment processor (Paystack) and renew automatically until cancelled. You can cancel
        auto-renewal at any time from the Pricing page; you'll keep Pro access until the end of
        your current billing period. Prices and included features may change with reasonable
        notice, but changes won't apply retroactively to a period you've already paid for.
      </p>
    ),
  },
  {
    title: "7. Acceptable use",
    body: (
      <p>
        Don't use GitPush to push malware, to attempt unauthorized access to repositories or
        accounts that aren't yours, to abuse or overload our infrastructure, or to violate any
        applicable law. We may suspend or terminate accounts that violate these Terms or that we
        reasonably believe put GitPush, GitHub, or other users at risk.
      </p>
    ),
  },
  {
    title: "8. Availability and changes",
    body: (
      <p>
        We work to keep GitPush reliable, but we don't guarantee uninterrupted or error-free
        service — features may change, and GitPush depends on GitHub's API and, for AI features,
        on third-party AI providers being available. We may update these Terms from time to time;
        continuing to use GitPush after a change means you accept the updated Terms. Material
        changes will be reflected by an updated "last updated" date on this page.
      </p>
    ),
  },
  {
    title: "9. Termination",
    body: (
      <p>
        You can stop using GitPush and delete your account at any time from Settings. We may
        suspend or terminate accounts for violations of these Terms, non-payment on Pro plans, or
        extended inactivity. Disconnecting GitHub or deleting your GitPush account doesn't affect
        the repositories or commits already pushed to GitHub — those remain under your GitHub
        account.
      </p>
    ),
  },
  {
    title: "10. Disclaimer and limitation of liability",
    body: (
      <p>
        GitPush is provided "as is," without warranties of any kind. To the fullest extent
        permitted by law, GitPush and its team aren't liable for indirect, incidental, or
        consequential damages arising from your use of the service, including any loss of data,
        code, or availability of a connected repository or third-party provider. Always keep your
        own backups and review changes before pushing to important repositories.
      </p>
    ),
  },
  {
    title: "11. Contact",
    body: (
      <p>
        Questions about these Terms? Reach out from your account Settings page, or via the contact
        details listed there.
      </p>
    ),
  },
];

/**
 * Full Terms of Service, shown as a scrollable dialog. Triggered from the
 * signup form's agreement checkbox so people can actually read the terms
 * before creating an account, rather than trusting a link that leaves the
 * page.
 */
export function TermsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="size-4 text-primary" />
            Terms of Service
          </DialogTitle>
          <DialogDescription>Last updated {LAST_UPDATED}</DialogDescription>
        </DialogHeader>

        <div className="-mx-1 min-h-0 flex-1 space-y-5 overflow-y-auto px-1 text-sm">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
              <div className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{section.body}</div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
