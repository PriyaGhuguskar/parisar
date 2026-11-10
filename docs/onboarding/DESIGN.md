# Parisar design foundation

How to build onboarding screens. Tokens live in `apps/web/app/tokens.css`, components in `apps/web/components/kit`. Import from the barrel:

```jsx
import { DataTable, FormField, PageShell, StatusBadge } from "@/components/kit";
```

## The look

Restrained commercial SaaS. Calm surfaces, one brand green, semibold (never extrabold) headings at modest sizes, hairline borders, low shadows.

- No gradients, no hover lifts, no decorative colour. Colour means brand action or a status.
- One primary button per view.
- Say what happened in plain words. Never show "Invitation sent" (nothing is sent) and never show success before the server confirms it.

The landing page keeps its own `--pk-*` system and Manrope until its owner moves it over. Do not use `--pk-*` in new screens.

## Tokens

Use semantic tokens through Tailwind utilities. Do not hardcode hex values, and do not reach for raw `--color-brand-*` or `--color-neutral-*`: they stay for legacy screens and do not change in dark mode.

### Colour

| Utility | Use | Light | Dark |
|---|---|---|---|
| `bg-background` | Page ground | `#F8FAFC` | `#0D1A14` |
| `bg-card`, `text-card-foreground` | Cards, inputs, tables | `#FFFFFF` | `#16291F` |
| `text-foreground` | Headings, body | `#1E293B` | `#EDF5EF` |
| `text-muted-foreground`, `bg-muted` | Secondary text, quiet fills | `#475569`, `#F1F5F9` | `#A9BFB2`, `#12241B` |
| `bg-primary`, `text-primary` | Main action, links | `#12715A` | `#5FCFA6` |
| `hover:bg-primary-hover` | Primary hover | `#0E5A48` | `#7FDFBB` |
| `bg-primary-soft`, `text-primary-soft-foreground` | Tinted brand wells | `#DCEFE6`, `#0A4436` | `#12332A`, `#7FDFBB` |
| `bg-destructive`, `text-destructive` | Errors, destructive actions | `#C0341B` | `#F08A76` |
| `border-border` | Dividers, card edges (decorative) | `#E2E8F0` | `#274034` |
| `border-input` | Control boundaries, 3:1 or better | `#7C8BA1` | `#7F9A8B` |
| `ring-ring`, `outline-ring` | Focus | `#12715A` | `#5FCFA6` |

### Status

Five tones, each with four parts: `text-status-{tone}-fg`, `bg-status-{tone}-bg`, `border-status-{tone}-border`, `bg-status-{tone}-solid` (dots and icons).

| Tone | Means |
|---|---|
| `success` | Done, verified, approved |
| `warning` | Waiting on someone, needs a look |
| `danger` | Rejected, failed, invalid |
| `info` | Moving along, nothing needed yet |
| `neutral` | Not started, inactive, closed |

Pair colour with text or an icon; colour alone never carries meaning. `components/kit/__tests__/tokens.test.js` checks every pair for WCAG AA in both themes. Add new colours to its list.

### Type

Inter for Latin, Noto Sans Devanagari for hi and mr, chosen per glyph by `font-sans` on `<body>`. Use these classes rather than `text-[..px]`:

| Class | Size | Use |
|---|---|---|
| `type-display` | 28-36, semibold | Public page headline only |
| `type-h1` | 22-28, semibold | Page title |
| `type-h2` | 20, semibold | Section title |
| `type-h3` | 17, semibold | Card or group title |
| `type-body-lg` | 16 | Public page intro |
| `type-body` | 15 | Default text |
| `type-body-sm` | 13 | Hints, table meta |
| `type-caption` | 12 | Fine print, column headers |
| `type-label` | 14, medium | Form labels |
| `type-metric` | 28, semibold, tabular | Dashboard numbers |

In hi and mr these classes drop negative tracking and open the line height, so conjuncts and matras do not clip. Add `tabular-nums` to columns of numbers. Society codes and flat numbers use Inter too. Do not use uppercase eyebrows: Devanagari has no capitals.

### Spacing, radii, elevation

- **Spacing:** 4px grid, using Tailwind steps (`gap-4` is 16px). `--space-*` mirrors them for custom CSS. Rhythm: `--field-gap` 20px between fields (`gap-5`), `--section-gap` 32px between sections (`gap-8`), `--page-gutter` 16-24px.
- **Radii:** `rounded-lg` (10px) controls, `rounded-xl` (14px) cards and dialogs, `rounded-full` pills.
- **Elevation:** `shadow-card` resting, `shadow-raised` hover on clickable cards, `shadow-overlay` popovers and dialogs. Nothing heavier.
- **Touch:** every interactive element is at least 44px: `size="touch"` or `size="icon-touch"` on `Button`, `min-h-11` on custom ones.
- **Focus:** add `focus-ring` to custom focusable elements.

### Dark mode

`.dark` or `data-theme="dark"` on `<html>` switches every semantic token. It does not follow the OS, and nothing sets it yet: legacy screens hardcode the light neutrals and would turn into a mix of dark and light. Use semantic tokens and new screens will work the day a toggle ships.

## Components

Everything takes `className` unless noted. Default copy comes from the `kit` i18n shard; pass your own props for anything specific to a screen.

### Buttons

Use `components/ui/button` with `size="touch"`. Variants: `default` (primary), `outline`, `ghost`, `secondary`, `danger` (solid, for the action that cannot be undone), `destructive` (tinted), `link`.

### FormField

Label, required marker, hint and error, with `id`, `aria-describedby`, `aria-invalid` and `aria-required` passed to its child.

```jsx
<FormField label="Society name" required hint="As registered" error={errors.name}>
  <TextInput value={name} onChange={(e) => setName(e.target.value)} />
</FormField>
```

Props: `label`, `required`, `optional`, `hint`, `error`, `labelHidden`, `group` (fieldset and legend, for radios and checkboxes). Children can be a function, `(fieldProps) => ...`, for controls that need the props elsewhere. `TextInput` and `TextArea` are `components/ui` inputs at 44px.

### PhoneInput

```jsx
<FormField label="Mobile number" required error={errors.phone}>
  <PhoneInput value={phone} onChange={(digits, { e164, valid }) => setPhone(digits)} />
</FormField>
```

`value` is the 10 local digits. Pasted `+91 98765-43210` is cleaned. A bad number shows its own error after blur unless the parent shows one. Send `e164` to the server. Server code imports `isValidIndianMobile`, `normalizeIndianMobile` and `toE164` from the barrel. This checks format only; OTP proves possession.

### DatePicker

```jsx
<FormField label="Date of birth" required>
  <DatePicker value={dob} onChange={setDob} max={today} captionLayout="dropdown" />
</FormField>
```

`value`, `min`, `max` and the `onChange` argument are `yyyy-MM-dd` strings. Props: `clearable`, `placeholder`, `disabled`, `name`, `captionLayout` (`label` or `dropdown`). The calendar loads on first open and offers a retry if that fails. Text is localised through `Intl`, with Latin digits in all three languages. `parseDateValue`, `toDateValue` and `formatDateValue(value, lng)` are exported.

### SearchableSelect

```jsx
<FormField label="Wing" required error={errors.wing}>
  <SearchableSelect
    options={[{ value: "a", label: "A Wing", description: "12 floors", keywords: "tower" }]}
    value={wing}
    onChange={(value, option) => setWing(value)}
  />
</FormField>
```

No free text: the box only filters, and the value is always from `options`. Keys: Up, Down, Home, End, Enter, Escape, Tab. Enter on an open list never submits the form. Props: `clearable` (clearing gives `("", null)`), `loading`, `emptyText`, `placeholder`, `searchPlaceholder`, `disabled`, `name`. Option `disabled` is supported. The list is absolutely positioned, so do not put this inside `overflow-hidden`.

### FileUpload

```jsx
<FormField label="Ownership proof">
  <FileUpload
    accept={[".pdf", "image/*"]}
    maxBytes={5 * 1024 * 1024}
    upload={async (file, { onProgress, signal }) => uploadDoc(file)}
    onUploaded={(result, file) => setPath(result.path)}
    onRemove={() => setPath(null)}
  />
</FormField>
```

Handles one file. `upload` does the work; the bar moves only if it calls `onProgress(0-100)`, otherwise it stays indeterminate. "Uploaded" appears only after the promise resolves. Failure offers a retry. Without `upload`, `onSelect(file)` hands the checked file over, which is what Excel import wants. Other props: `acceptLabel`, `value` (`{ name, size }` of an existing file), `getErrorMessage(err)`, `disabled`, `name`. **These checks are feedback only: the RPC or bucket must enforce type and size too.**

### Stepper

```jsx
<Stepper steps={[{ id: "society", label: "Society" }, { id: "wings", label: "Wings" }]} current={1}
  onStepClick={(index, step) => goTo(step.id)} />
```

A compact "Step 2 of 5" and bar on phones, a labelled row from `md`. `orientation="vertical"` shows the full list at all widths, for a side rail (steps may have a `description`). `step.status` (`complete`, `current`, `upcoming`, `error`) overrides `current` for non-linear progress. Only finished or errored steps become buttons, and only with `onStepClick`.

### DataTable

```jsx
<DataTable
  caption="Society requests"
  columns={[
    { key: "society", header: "Society", primary: true },
    { key: "city", header: "City" },
    { key: "units", header: "Flats", align: "right" },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} />, searchable: false },
  ]}
  rows={rows}
  rowHref={(row) => `/admin/requests/${row.id}`}
  rowActions={(row) => <Button variant="outline" size="touch">Call</Button>}
  searchable
  filters={[{ key: "status", label: "Status", options: statusOptions }]}
  loading={loading}
  error={loadError}
  onRetry={reload}
  emptyState={{ title: "No requests yet", description: "New requests appear here." }}
/>
```

A table from `md`, stacked cards below it.

| Prop | Notes |
|---|---|
| `columns[]` | `key`, `header`, `cell(row)`, `primary` (title on cards, link target), `align`, `className`, `hideOnCard`, `searchable: false`, `searchValue(row)` |
| `rowKey` | Field name or function. Default `"id"` |
| `filters[]` | `key`, `label`, `options`, `allLabel`, `match(row, value)` (default: equals `row[key]`) |
| `error` | `true` for the default message, or a friendly string. Never a raw error |
| `pageSize` | Default 20 |
| `toolbarActions` | Buttons at the end of the toolbar |

**Server mode:** pass `serverSide`, `total` and `onQueryChange({ search, filterValues, page, pageSize })`. `rows` is shown as given and the parent fetches on each call; search is debounced 300ms. Client mode only searches strings and numbers, so give a column with a rendered `cell` a `searchValue` if it should be searchable. Keep `columns` and `filters` stable (module constant or `useMemo`) so filtering is not recomputed each render.

### MetricCard

```jsx
<MetricCard label="Open requests" value={12} hint="3 need a call today" icon={Inbox} tone="warning" href="/admin" />
```

`loading` shows a placeholder and `value={null}` shows a dash. `tone` colours only the icon: `brand`, `success`, `warning`, `danger`, `info`, `neutral`. Lay out in `grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4`. `StatCard` stays for existing screens.

### StatusBadge

```jsx
<StatusBadge status="pending_review" />
```

Picks tone and translated label from `components/kit/lib/statuses.js`:

- **Connect requests:** `new`, `contacted`, `call_scheduled`, `rescheduled`, `registered`, `approved`, `rejected`, `cancelled`, `closed`
- **Setup:** `not_started`, `draft`, `in_progress`, `submitted`, `completed`
- **People:** `invited`, `invite_expired`, `invite_revoked`, `pending`, `pending_verification`, `pending_review`, `pending_owner_approval`, `pending_committee_approval`, `pending_documents`, `verified`, `active`, `inactive`, `suspended`, `declined`, `removed`, `moved_out`
- **Documents:** `missing`, `uploaded`, `under_review`, `expired`
- **Import:** `queued`, `validating`, `valid`, `invalid`, `importing`, `imported`, `partial`, `failed`, `skipped`, `duplicate`

Only the connect statuses are confirmed against the database so far; the rest anticipate the other builders. A new value needs one line in `statuses.js` and a `status.<value>` key in all three `kit.json` shards (a test enforces this). Until then it renders readable and neutral. `label` and `tone` override. `StatusPill` is the plain chip underneath.

### ConfirmDialog

```jsx
<ConfirmDialog
  open={open}
  onOpenChange={setOpen}
  title="Remove this resident?"
  description="They lose access to the society straight away."
  confirmLabel="Remove resident"
  onConfirm={() => removeResident(id)}
/>
```

`onConfirm` may be async and must **throw on failure**: the dialog stays open with `errorMessage` or a default. supabase-js returns errors rather than throwing, so check `error` and throw it. `destructive` defaults to true, which starts focus on Cancel. `trigger={<Button>...</Button>}` replaces `open` and `onOpenChange`. For type-the-name confirmation use `DestructiveConfirmDialog`.

### LoadingState, ErrorState, EmptyState

```jsx
<LoadingState variant="list" rows={5} />           // also: page, inline, cards
<ErrorState description="We couldn't load residents." onRetry={reload} />
<EmptyState icon={Users} title="No residents yet" description="Invite the first one." action={<Button size="touch">Invite resident</Button>} />
```

No `onRetry`, no retry button. Never pass a raw database or network message to `ErrorState`.

### CopyButton

```jsx
<CopyButton value={inviteUrl} label="Copy invite link" />
```

Says "Copied" only after the browser confirms it, and says so if copying fails. Keep the text visible nearby for that case. Invitations are not sent automatically, so pair it with a line saying that.

### Notice

The inline success and message pattern. There is no toast: nothing mounts a toast host, and an inline message stays until the person has read it.

```jsx
<Notice tone="success" title="Request received">Your reference is {code}.</Notice>
```

Tones: `success`, `info`, `warning`, `danger`, `neutral`. Props: `title`, `action`, `onDismiss`. Warning and danger interrupt screen readers; the others are polite.

### FormActions

```jsx
<form onSubmit={save}>
  ...
  <FormActions submitLabel="Save and continue" submitting={saving} onBack={goBack} onCancel={close} sticky />
</form>
```

Primary first on phones. Back and Cancel render only when given a handler. `onSubmit` makes the primary a plain button for use outside a form; `destructive` makes it `danger`; `sticky` pins the row on phones.

## Page layouts

Page frame: `PageShell` (`narrow` max-w-2xl, default max-w-4xl, `wide` max-w-6xl) and `PageHeader` (`title`, `description`, `actions`, `backHref`, `backLabel`, `eyebrow`).

### Public (`/connect`, `/invite/[token]`)

No sidebar. Wordmark at the top, one job on the page. Add new public routes to `lib/supabase/middleware.js`.

```jsx
<main className="min-h-screen bg-background">
  <PageShell width="narrow">
    <h1 className="type-display text-foreground">...</h1>
    <p className="type-body-lg mt-2 text-muted-foreground">...</p>
    <SurfaceCard className="mt-8 p-5 sm:p-6">{/* form */}</SurfaceCard>
  </PageShell>
</main>
```

### Form

Single column, `narrow`. Group fields into `SurfaceCard`s with a `type-h3` title. Two columns only for short pairs, and never on phones.

```jsx
<PageShell width="narrow">
  <PageHeader title="Add staff" backHref="/staff" backLabel="Staff" />
  <form onSubmit={save} className="flex flex-col gap-8">
    <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
      <h2 className="type-h3 text-foreground">Details</h2>
      <div className="grid gap-5 sm:grid-cols-2">{/* FormFields */}</div>
    </SurfaceCard>
    <FormActions submitLabel="Add staff" submitting={saving} />
  </form>
</PageShell>
```

Validate on submit, show errors at the field, and move focus to the first invalid one. Keep what was typed when the server rejects it.

### Dashboard

`wide`. Metrics first, then the work. Hide what the person's role or the society's features do not allow; never show a dead link.

```jsx
<PageShell width="wide">
  <PageHeader title="Requests" actions={<Button size="touch">...</Button>} />
  <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">{/* MetricCards */}</div>
  <section className="mt-8">
    <h2 className="type-h2 mb-4 text-foreground">Needs a call</h2>
    <DataTable ... />
  </section>
</PageShell>
```

### Wizard

One decision per step, saved as a draft on each Continue, so a closed tab loses nothing. Mark a step complete only after the server confirms the save.

```jsx
<PageShell>
  <PageHeader title="Set up your society" />
  <Stepper steps={steps} current={index} onStepClick={goTo} className="mb-8" />
  <form onSubmit={saveStep} className="flex flex-col gap-8">
    <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">{/* step */}</SurfaceCard>
    <FormActions submitLabel="Save and continue" submitting={saving} onBack={index > 0 ? back : undefined} sticky />
  </form>
</PageShell>
```

For long wizards use a rail: `md:grid md:grid-cols-[220px_1fr] md:gap-8` with `<Stepper orientation="vertical" />` shown from `md` and the horizontal one below it.

## i18n

Every string goes through `useTranslation`, with en, hi and mr added together. Each domain has its own shard in `packages/i18n/locales/{en,hi,mr}/`, so builders do not touch the same file:

| Namespace | Owner's area |
|---|---|
| `connect` | Public Connect With Us |
| `platform` | Platform admin |
| `setup-wizard` | Society setup |
| `resident-onboarding` | Residents, tenants, family, invitations |
| `staff-nav` | Staff and navigation |
| `kit` | Kit defaults and status labels |

```jsx
const { t } = useTranslation("setup-wizard");
```

Keep the `_meta` line. `node scripts/check-i18n-coverage.mjs` fails on missing keys or mismatched `{{placeholders}}`. Every shard is preloaded on every page, so keep them to UI copy. The vitest mock resolves all of these against the English shards.

## Excel

`exceljs` must stay out of the main bundle. Import it inside the handler:

```js
const { default: ExcelJS } = await import("exceljs");
```

Never import it at the top of a file. Parsing is a preview: the RPC validates every row again.

## Tests

Render tests are in `components/kit/__tests__`. Run them with `npx vitest run components/kit` from `apps/web`.
