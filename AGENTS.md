<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Render app branding through the shared BrandLogo component, using theme-specific CDN asset pointers, so all placements stay consistent.
- Preserve existing storage keys, OAuth message identifiers, and API field names during branding changes to avoid breaking saved preferences or integrations.
