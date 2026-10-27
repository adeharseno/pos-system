# TailAdmin UI redesign — Phase 1

Implemented on the existing branch. Primary reference: the supplied
`free-nextjs-admin-dashboard-main.zip`. No dependencies added.

## Completed

- Login: responsive two-column layout, existing Cipayung Farma logo, Indonesian
  copy, shared controls, and existing server action/error handling.
- App shell: 290 px desktop sidebar, full-width header beside the sidebar,
  active navigation, employee identity, and cash-drawer status. Smaller screens
  use a modal navigation drawer with Escape, focus containment, and scroll lock.
- Cashier: retains its separate full-screen workspace and existing navigation.
- Shared primitives: Button, Input, Select, Textarea, Checkbox, Card, CardHeader,
  CardContent, Label, FormField, Container, and modal presentation. Existing prop
  contracts and event handlers are retained. Native modal dialogs provide focus
  containment, Escape dismissal, focus restoration, and scroll lock.
- Theme: local Outfit variable font, TailAdmin brand/gray/status colors, spacing,
  borders, radii, control shadows, focus treatment, and reduced-motion handling.

## Source reuse

Adapted actual classes and tokens from these files in the supplied archive:

| TailAdmin source | Pharmacy POS destination |
| --- | --- |
| `src/app/globals.css` | `src/app/globals.css`: palette, shadows, typography |
| `src/components/ui/button/Button.tsx` | `src/modules/ui/components.tsx`: primary/outline classes, padding, states |
| `src/components/form/input/InputField.tsx` | `src/modules/ui/components.tsx`: control sizing, borders, focus rings, shadows |
| `src/components/form/Select.tsx` | Native Select retained; styled to match TailAdmin controls |
| `src/components/auth/SignInForm.tsx` and auth layout | `src/app/(auth)/login/page.tsx`: form hierarchy and split layout |
| `src/layout/AppSidebar.tsx`, `src/layout/AppHeader.tsx` | `src/modules/ui/app-shell.tsx`: shell proportions and navigation styling |
| `src/components/ui/modal/index.tsx` | `src/modules/ui/modal.tsx`: rounded surface, backdrop, close-button styling |

TailAdmin MIT notice: `docs/licenses/TailAdmin-MIT.txt`.
Outfit is bundled from Google Fonts (`ofl/outfit/Outfit[wght].ttf`), with its
SIL Open Font License in `docs/licenses/Outfit-OFL.txt`. No runtime font request.
No TailAdmin locale routing, auth, providers, demo pages, or application was copied.

## Files changed or added

- `src/app/(auth)/login/page.tsx`
- `src/app/globals.css`
- `src/modules/ui/app-shell.tsx`
- `src/modules/ui/components.tsx`
- `src/modules/ui/modal.tsx`
- `public/fonts/Outfit-Variable.ttf`
- `docs/licenses/TailAdmin-MIT.txt`
- `docs/licenses/Outfit-OFL.txt`
- `docs/ui-redesign-phase-1.md`

The pre-existing modification to `next-env.d.ts` was retained.
Routing, auth services/actions, proxy, role filtering, APIs, Supabase, migrations,
and business logic were not changed. No push or deployment was performed.

## Validation

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Local production HTTP smoke check: login and invalid-credential message render;
  existing login server action is present; logo/font return 200; unauthenticated
  cashier request retains the server redirect to login.
- Browser visual and authenticated interaction checks could not be run: this
  session exposes no connected browser. Responsive layout, mobile navigation,
  modal interactions, and cashier rendering still need manual browser QA.

## Phase 2 candidates (not implemented)

- Redesign dashboard content, domain-specific tables, filters, charts, and reports.
- Migrate remaining page-local controls and bespoke checkout/cart overlays to the
  shared design language, retaining the cashier's full-screen workflow.
- Refine empty, loading, and error states across individual feature screens.
