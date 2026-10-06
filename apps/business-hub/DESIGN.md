---
name: Wood Enterprises Content Service
description: A clear, company-scoped workspace for content operations and audience conversations.
colors:
  accent: "#612bd3"
  accent-dark: "#48199f"
  soft: "#ebe8ff"
  ink: "#22212a"
  muted: "#626570"
  line: "#dfe2e8"
  ground: "#f0f2f4"
  paper: "#fff"
  field-line: "#b8bdc8"
  focus: "#8c66df"
  status-ink: "#4c4265"
  status-ground: "#eee9f9"
  success: "#246644"
  success-ground: "#e5f3e9"
  danger: "#a32932"
  danger-ground: "#fbeaed"
  pending: "#275895"
  pending-ground: "#e8f0fb"
typography:
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "32px"
    fontWeight: 680
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "23px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  section-title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "17px"
    fontWeight: 650
    lineHeight: 1.55
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.55
  caption:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
  status:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.5
rounded:
  badge: "5px"
  field: "7px"
  control: "8px"
  surface: "12px"
spacing:
  compact: "8px"
  related: "12px"
  small: "16px"
  standard: "20px"
  group: "24px"
  panel: "28px"
  section: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "9px 17px"
  button-primary-hover:
    backgroundColor: "{colors.accent-dark}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "9px 17px"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
    width: "100%"
  workspace-tab:
    textColor: "{colors.muted}"
    padding: "12px 0"
  workspace-tab-current:
    textColor: "{colors.accent}"
  status-badge:
    backgroundColor: "{colors.status-ground}"
    textColor: "{colors.status-ink}"
    typography: "{typography.status}"
    rounded: "{rounded.badge}"
    padding: "3px 8px"
  status-badge-success:
    backgroundColor: "{colors.success-ground}"
    textColor: "{colors.success}"
  status-badge-danger:
    backgroundColor: "{colors.danger-ground}"
    textColor: "{colors.danger}"
  status-badge-pending:
    backgroundColor: "{colors.pending-ground}"
    textColor: "{colors.pending}"
  work-panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "28px"
  conversation-row:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "20px"
    width: "100%"
  conversation-row-hover:
    backgroundColor: "{colors.soft}"
  conversation-row-current:
    backgroundColor: "{colors.soft}"
  conversation-entry:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "20px 0"
---

# Design System: Wood Enterprises Content Service

## Overview

**Creative North Star: "The Clear Workspace"**

The Wood Enterprises content service extends Postiz’s light interface with a quiet operating surface. Cool neutral ground, white work areas, and a single purple action color keep attention on the current company and its work. Typography is a compact system sans; hierarchy comes from size, weight, spacing, and explicit labels.

The interface is practical and moderately dense. Tables, divided rows, and bordered forms organize working information without decorative imagery or visual elevation. Color supports action and confirmed state, while visible text distinguishes draft, submission, publication, reply sending, failure, and uncertainty. This document records reusable rules from `public/app.css`, `public/app.js`, `public/inbox.js`, and `public/index.html`; the current surface composition remains in `SURFACE.md`.

**Key Characteristics:**

- Cool neutral ground and white work surfaces.
- Purple actions and current navigation, with separate semantic state colors.
- Compact system typography and sentence-case labels.
- Flat borders and dividers, with gently rounded controls and containers.
- Persistent visible focus and a single-column phone layout.

## Colors

The palette combines cool, low-chroma neutrals with a concentrated Postiz purple and muted semantic feedback colors. Frontmatter holds the normative values.

### Primary

- **Postiz Purple — `accent`:** Primary buttons, links, the brand mark, and current navigation.
- **Deep Purple — `accent-dark`:** The primary button hover state.
- **Soft Lavender — `soft`:** Quiet contextual backgrounds, including business initials and the sign-in introduction, plus hover and current states for conversation rows.
- **Focus Purple — `focus`:** The shared visible keyboard focus outline.

### Secondary

- **Confirmed Green — `success` / `success-ground`:** Active strategies, approved or published content, and sent replies, with a pale success background also used by notices.
- **Attention Red — `danger` / `danger-ground`:** Failed or uncertain content and error feedback. The label always states which outcome applies.
- **In-flight Blue — `pending` / `pending-ground`:** Scheduled and submitted content. These remain visually distinct from completed publication.
- **Quiet Status Lavender — `status-ink` / `status-ground`:** Default badges, including draft and publishing-policy labels.

### Neutral

- **Ink — `ink`:** Main copy, headings, and secondary actions.
- **Slate — `muted`:** Supporting text, inactive navigation, timestamps, and table headings.
- **Cool Ground — `ground`:** The page canvas.
- **White Paper — `paper`:** Masthead, forms, tables, reading panels, and content rows.
- **Soft Divider — `line`:** Surface boundaries, row dividers, and navigation baselines.
- **Field Stroke — `field-line`:** Stronger boundaries for editable inputs.

**The Action and State Rule.** Purple identifies actions and the current location; semantic state colors supplement explicit status words. Preserve the distinction between submitted and published content.

## Typography

**Body and heading font:** The platform system sans stack recorded in frontmatter. No web font is loaded. Code and identifiers retain native monospace treatment; the optional explicit monospace stack is `ui-monospace, SFMono-Regular, Consolas, monospace`.

The type ramp is compact rather than proportional. Slightly tightened page and section headings establish hierarchy without large display typography. Body text remains comfortable for operational reading, and paragraphs are capped at a readable measure (72ch).

### Hierarchy

- **Headline:** Page and business names; use the `headline` role. At the phone breakpoint its size reduces (28px).
- **Title:** Main working-section headings; use the `title` role. Section headings reduce slightly on phones (21px).
- **Section title:** Content titles and supporting subsections; use `section-title`.
- **Body:** Reading copy and ordinary controls; use `body`. Supporting section descriptions and content copy commonly step down (14px).
- **Label:** Field labels and concise helpers; labels use `label`, while normal supporting text uses `caption`.
- **Status:** Small badges use `status`; table headings use the same compact size and semibold weight with the body line height.

**The Readable Hierarchy Rule.** Use sentence-case text, dark headings, and muted supporting copy. Make the action or state readable in words rather than relying on color or decoration.

## Layout

The main container is centered with a maximum width (1180px), horizontal padding (24px), generous top spacing (48px), and bottom space (80px). The white masthead shares the centered working alignment. Page headings pair the title with actions and allow their contents to wrap.

The recurring rhythm is recorded in `spacing`: compact control gaps, related metadata spacing, standard list and field spacing, group gutters, panel padding, and larger section separation. It is an observed set of steps, not a rule that every measurement must be a multiple of one base unit.

Forms use two equal columns with a group gutter. Reading/detail views pair the main work with a narrower explanation column (`minmax(0, 1.7fr) minmax(240px, 1fr)`) and section spacing between them. Wide fields span their form. Connection rows use two equal columns. Content rows place time, content, and actions in three columns (`130px 1fr auto`).

At the phone breakpoint (`max-width: 760px`), main horizontal padding becomes smaller (20px), two-column forms and detail views become one column, content rows stack, and action groups align to the start. Panel padding reduces (22px). Workspace navigation stays on one line and can scroll horizontally; the current tab is brought into view. Tables retain horizontal overflow as needed. The portfolio hides its optional identifier column while preserving the business name and opening action.

Conversation work pairs a selectable list and a reading pane inside one shared bordered surface. A vertical divider separates them on desktop; at the existing phone breakpoint, the list stacks above the reading pane and the divider becomes horizontal. The reading pane reuses panel padding on desktop and its smaller phone spacing. Metadata and action groups wrap, and long conversation text can break within a word to preserve the available width.

Stack working groups on phones, preserve readable labels and actions, and use horizontal overflow for tabular or navigation content.

## Elevation & Depth

The system is flat. The shipped stylesheet has no box shadows, gradients, or backdrop blur. White surfaces sit on cool ground; thin neutral borders, row dividers, and spacing create separation. The sticky notice uses stacking only to stay visible, without a shadow.

**The Border and Tone Rule.** Build ordinary surface hierarchy with paper, ground, borders, and spacing. Preserve this flat treatment when extending existing work panels.

## Shapes

Controls are softly rectangular, with distinct corner steps for buttons, fields, badges, and work surfaces. Badges are compact rounded rectangles rather than full pills. Panels use a thin neutral border. Tabs remain square and use a bottom border for the current state; table and list rows rely on dividers rather than individual card silhouettes.

## Components

### Buttons

Clear, text-led actions with enough height for ordinary pointer and touch use. Primary and secondary buttons share semibold text (600), a control radius, a minimum height (42px), centered content, and an internal gap (8px).

Primary buttons use Postiz Purple and white text, darkening on hover. Secondary buttons use white paper, ink text, and a neutral border; hover adds a pale violet background and a stronger border. Disabled buttons retain their shape and use reduced opacity (0.5) with a disabled cursor. No transition or pressed transform is defined.

### Inputs / Fields

White, full-width input, textarea, and select controls use the stronger field stroke, field radius, body typography, and a minimum height (43px). Labels are separate and semibold, with a small label-to-control gap (7px). Fields have standard bottom spacing. Textareas resize vertically, with an ordinary minimum height (105px) and a larger writing variant (165px).

Buttons, links, inputs, textareas, and selects share a visible purple outline (3px) with an offset (3px). Form submission disables the submit button and changes its text to “Saving…” until completion. Error feedback appears in the notice or nearby error copy; there is no separate invalid-field styling in the current system.

### Navigation

Workspace navigation is a horizontal line of semibold, sentence-case text. Inactive items are muted; the current item uses purple text and a purple lower stroke (3px). The surrounding row has a thin neutral baseline. The current location is also exposed through `aria-current="page"`. Keep the keyboard focus outline.

### Chips / Status Badges

Badges are informational labels with compact padding, the badge radius, semibold status typography, and no interaction affordance. Default lavender labels support general states and policies. Active, approved, published, and sent use green; failed and uncertain use red; scheduled and submitted use blue. Cancelled content uses muted neutral styling. Preserve the visible status wording even when multiple states share a color. A reply labeled “sent” records the sending outcome; its green treatment does not change that wording into a read or delivery claim.

### Cards / Containers

Reading panels and form shells share white paper, a thin divider border, surface corners, and panel padding. Reading panels group prose with section headings. Form shells provide the same material around editing tasks. Tables use the same outer treatment, but their contents are row-based. Empty states use a heading, concise explanation, and the available next action rather than illustration or fabricated data.

### Business Identity Rows

The portfolio’s identifying row combines a lavender initials tile, a semibold business-name button, and a muted subtitle. The name changes to purple on hover, and the separate opening action uses the secondary button treatment. Keep identity and the action visible when optional metadata is hidden on phones.

### Conversation Selection Rows

Conversation rows are full-width, left-aligned buttons with square edges and a bottom divider. Each row groups a semibold name (650), a preview, and muted time and workflow metadata. Previews are limited to two lines; the selected conversation exposes its complete message text in the reading pane.

Hover and current selection both use Soft Lavender on the existing white list. Current selection is also exposed with `aria-current="true"`; retain the shared visible keyboard focus outline. Row padding uses the standard spacing on desktop and tightens slightly on phones (18px). Opening a conversation moves focus to its heading, bringing the reading pane into view on phones.

### Message and Reply Rows

History entries and reply-review entries share flat, divided rows with standard vertical padding. Sender or status metadata sits above the body; the metadata uses caption-sized type, wraps as needed, and separates its ends with a related gap. The body preserves line breaks and wraps long text. Full message and reply bodies are not clamped like list previews.

Reply composition and review groups use the existing section spacing and section-title typography. Review entries pair the status badge with the revision and time, then place available actions below the exact reply text. Action labels may wrap. Errors use the existing danger text, and confirmed reply outcomes reuse the existing status family rather than introducing a new palette or container treatment.

### Motion

Workspace entry uses one short arrival animation (180ms, ease-out), moving upward from a small offset (3px). It has no opacity fade and does not delay interaction. Reduced-motion preference removes the animation. Ordinary hover and focus changes are immediate.

## Do's and Don'ts

### Do:

- **Do** reuse the neutral canvas, white work surfaces, and purple action palette.
- **Do** show status words alongside their semantic color, preserving submitted and published as distinct outcomes.
- **Do** use the shared visible focus outline for interactive elements.
- **Do** reflow forms and detail groups to a single column at the existing phone breakpoint.
- **Do** use bordered panels for grouped work and dividers for repeated rows.
- **Do** limit conversation previews while preserving complete, wrapping message and reply text in the reading pane.
- **Do** honor reduced motion by disabling the workspace arrival animation.

### Don't:

- **Don't** replace readable status text with color alone.
- **Don't** add shadows or decorative gradients to the existing flat work-panel pattern.
- **Don't** hide the business identity or the primary row action when reducing optional table detail.
- **Don't** turn informational status badges into action controls without an explicit interaction design.
