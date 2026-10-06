# Fanvue audience engagement

Release 0.3.0 implements an initial human-reviewed conversation workflow, not a complete unified inbox. It uses official Fanvue endpoints with mocked integration coverage. No live creator account has been verified or audience message sent during development.

## Setup and controls

1. Configure the Fanvue app as described in [DEPLOYMENT.md](DEPLOYMENT.md). The app must be entitled to `read:chat` and `write:chat` as well as its existing publishing scopes.
2. In Channels or Inbox, the Wood operator or company representative chooses **Connect publishing + inbox**. This requests the extra chat scopes explicitly. The hub records scopes returned by Fanvue. If scopes are absent or insufficient, inbox operations fail closed; repeated reconnecting will not fix missing app entitlements or a provider that omits scope information. Verify the app's token response before enabling the workflow.
3. In Inbox → Reply policy, explicitly enable reviewed replies for the creator, set the daily attempt limit, and record response guidance/escalation instructions. Every reply requires a human approval. Automatic routine replies are not implemented yet. Guidance is supplied to people/agents, not enforced as a semantic content filter.
4. In Agent access, issue separate channel grants. A reader can have `inbox:read`; an editor can additionally have `reply:draft`; a publisher can additionally have `reply:send`. Issuing a grant does not broaden Fanvue scopes. Existing tokens gain no access automatically. Human company/owner portal access can review and operate its company's inbox; company access cannot use MCP.
5. For managed companies, Wood must launch the current company brief and include this channel before a reply can be sent. Reply-policy enablement does not launch the business service. A company/service pause, disconnected creator or revoked grant blocks subsequent operations. An external request already underway cannot be recalled.

Reconnecting or disconnecting Fanvue disables the engagement policy and advances its revision. Human review is required to enable it again. Any policy revision makes prior reply approvals stale; update the reply under the new policy and approve that exact revision again.

## Agent loop

Use the existing `/mcp/{business-id}` endpoint and a token for that business. Discover `tools/list` and `get_capabilities` first; tools requiring conversation permissions are absent from tokens without those grants. Authorization is also enforced on every REST/MCP execution, including a fresh revocation check inside the business operation queue.

| Tool | Permission | Behavior |
| --- | --- | --- |
| `get_engagement_policy` | Reader | Read enablement, channel scope, limit, guidance and revision |
| `list_conversations` | `inbox:read` | Read existing Fanvue chats; opaque `nextCursor` paging |
| `get_conversation` | `inbox:read` | Read current history and local revision, or older history with returned date cursors |
| `claim_conversation` | `reply:draft` | Claim the current revision for 15 minutes; renew with the same actor |
| `set_conversation_state` | `reply:draft` | Agents may hand their claim to a human; only company/owner access can resume agent control |
| `create_reply` | `reply:draft` | Create a text draft with stable request ID and current conversation revision |
| `update_reply` | `reply:draft` | Edit the current unsent revision and invalidate its approval |
| `list_replies` | `inbox:read` | Read the newest 50 reply records/receipts for that conversation |
| `send_reply` | `reply:send` | Send an approved revision after checking claim, current context, policy, service and limit |
| `cancel_reply` | `reply:draft` | Cancel an unsent revision; cannot cancel an uncertain or completed send |

Every conversation operation identifies both `channelId` (the connected `fanvue:CREATOR-UUID`) and `userId` (the counterpart's UUID returned by Fanvue). No caller-supplied provider URL or creator delegation is accepted. `sentBefore` and `receivedBefore` request older history without replacing the latest conversation revision. A read never silently marks Fanvue messages read. Conversation listing can move as messages arrive; restart at the first page periodically rather than treating the cursor as a change feed.

Read the current history, claim the conversation, and draft using its `conversationRevision`. Wait for a human to approve the exact text via the dashboard or `approve_reply` REST operation. Renew an expired claim before sending. Human approval is not available through MCP. If new history is observed, re-read the conversation, revise the reply and request approval again.

`create_reply` input:

```json
{
  "channelId": "fanvue:CONNECTED-CREATOR-UUID",
  "userId": "COUNTERPART-UUID-FROM-CONVERSATIONS",
  "requestId": "company-conversation-turn-0001",
  "conversationRevision": 1,
  "text": "Exact text to be reviewed."
}
```

Replace placeholders with discovered identifiers and the actual current revision. Send with `{channelId,userId,id,revision}` using the returned reply ID/revision. Reusing a creation request ID with changed input is rejected. Repeating a completed send returns its receipt without sending again. Paid price fields, bulk recipients, media fields and new-chat creation are rejected or unavailable; publishing permission cannot be used to bypass these boundaries.

## Delivery, recovery and privacy

- `draft` / `approved`: no external message has been sent. Editing clears approval.
- `sending`: an attempt was durably reserved before the external request. If interrupted, subsequent inspection converts it to `uncertain`.
- `sent`: Fanvue returned a valid `messageUuid`, or Wood recorded a verified sent outcome. This is API acceptance, not proof that the recipient received/read the message.
- `failed`: an explicit provider rejection, or verified non-delivery. Replies are not retried automatically, including 429 responses.
- `uncertain`: the request may have succeeded. The entire conversation is held against further sends and replacement drafts until Wood verifies it in Fanvue. `reconcile_reply` is owner-only REST/dashboard, requires written evidence and a message UUID for a sent outcome. It never resends.

Daily limits count send attempts in the business timezone; failures and uncertain attempts still count. Conversation claims prevent competing hub operators within one business. Keep a creator assigned to one business: claims do not coordinate two businesses intentionally connected to the same creator. Local approvals bind to observed history and policy revisions. The hub re-reads history immediately before sending, but Fanvue offers no atomic context-version precondition: a message or direct Fanvue operator action can race that final read. Webhooks are not implemented, and cannot by themselves remove this external race. Human takeover blocks future hub sends, not messages already in flight.

Provider history is read on demand. The hub persists a context fingerprint, control/claim metadata, reply copy, approvals and receipts, not a full private-history archive. General audit entries contain opaque conversation references or reply IDs rather than message copy/counterpart UUIDs. Dashboard draft buffers live only in session memory, are keyed by business/channel/conversation and are cleared on sign-out. Retention/export/deletion and backups remain on the commercial operations roadmap; do not claim those controls already exist.

Webhooks, background synchronization, comment management, new conversations, attachment replies, saved replies, assignment queues/SLA, search, fan segmentation, earnings, automatic replies and paid/bulk campaigns remain tracked in [CAPABILITIES.md](CAPABILITIES.md).
