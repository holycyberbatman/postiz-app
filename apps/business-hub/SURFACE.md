# Wood Enterprises content service

Mode: Operate. Extends the incumbent Postiz light interface with Wood Enterprises service identity.

THESIS: Companies provide the mandate; Wood runs the operation. Every strategy, channel, credential, approval, and result belongs to one company.

OWN-WORLD: Postiz light neutral background and white work surfaces, purple primary actions, system sans typography, restrained borders, clear states.

STORY: Wood creates a company and shares scoped portal access. The company completes four saveable onboarding steps. Wood verifies requested channels, prepares and activates strategy, gathers the agreed approvals, assigns a team and review cadence, and launches. The team delivers content through MCP; both Wood and the company can pause publishing.

FIRST VIEWPORT: A compact Wood Enterprises masthead, operating-company portfolio and Onboard company action, then a real company table or truthful empty state. Inside a workspace, its identity and service status sit above task tabs. Service shows the remaining launch requirements and next steps; Company brief exposes one onboarding step at a time and persists each save.

FORM: Portfolio table with workspace drilldown, fourth of seven grounded structures (sidebar workbench, approval inbox, calendar, portfolio table, strategy planner, task queue, activity feed). Seed 2b925341. Table staging preserves recognizable business identity at every row; no scenic or spatial challenger improved operation clarity. On phones, the optional identifier column disappears and the workspace reflows to one column.

Open decisions: launch companies, channels, persistent Postiz host, agent runtime, and preferred review policy. Provisional defaults are listed in PRODUCT.md. No illustrative company data ships in production.

## Audience inbox extension

THESIS: Review one conversation in its company context before replying.

OWN-WORLD: The existing flat Wood workspace, with purple actions, neutral and white surfaces, divided rows, and explicit states. The inbox reuses the established palette, type, buttons, fields, and status badges.

STORY: Connect, read, claim, draft, review, send, or hand off. The company workspace identity remains above the Inbox tab. Conversation history and the exact reply under review stay together in one reading pane.

FIRST VIEWPORT: Audience inbox heading, policy action and policy summary above the conversation list. Connection and access gaps use the existing empty-state pattern. Before selection, the detail pane prompts the operator to choose a conversation.

FORM: A divided list-and-detail surface inside the workspace. Desktop columns use `minmax(230px, 1fr) minmax(0, 2fr)`; the current conversation row uses the existing soft lavender tint. Message and reply rows share dividers, with sender or status metadata above wrapping text. At the existing phone breakpoint (760px), the list stacks above the history and review pane; opening a conversation moves focus to its heading. This is a local extension, with no new visual identity or concept selection.
