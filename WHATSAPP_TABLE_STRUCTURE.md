# WhatsApp Table Structure

This is the intended source of truth for WhatsApp chat, bot handoff, n8n summaries, and sales-agent notes.

## Core Tables

| Table | Purpose |
| --- | --- |
| `w_wa_accounts` | Connected WhatsApp numbers/accounts. |
| `w_contacts` | WhatsApp customers/leads. One row per customer per organization. |
| `w_conversations` | One chat thread between a contact and a WhatsApp account. Stores assignment, bot state, handoff state, and latest summary pointer. |
| `w_messages` | Every WhatsApp/customer/human/bot/system message. Sender identity must be explicit here. |
| `w_conversation_summaries` | n8n/AI generated handoff summaries. |
| `w_conversation_notes` | Private notes and handoff notes. These are not WhatsApp messages. |
| `w_conversation_reads` | Per-user read state for unread indicators. |
| `w_message_events` | Delivery/read/status event history when needed. |
| `w_flows` | Editable Flow Builder drafts and flow status. |
| `w_flow_versions` | Immutable published flow snapshots used by runtime. |
| `w_flow_sessions` | Active/waiting customer position inside a flow. |
| `w_flow_runs` | One execution log per flow trigger/resume. |
| `w_flow_run_steps` | Node-level execution logs for debugging. |

## Message Ownership

Use `w_messages.sender_type` to understand who created a message:

| `sender_type` | Meaning | Important ID |
| --- | --- | --- |
| `customer` | Inbound customer message | `contact_id` |
| `human_agent` | Sales/support agent manually replied | `sender_user_id` |
| `ai_agent` | AI bot/flow replied | `bot_agent_id` |
| `system` | Broadcast, import, automation, internal system item | `automation_source` |

Do not rely on `content.bot_agent_id` for reporting. It may exist for backward compatibility, but top-level `bot_agent_id` is the clean field.

## n8n Handoff Summary

Backend webhook mode is the preferred flow now:

1. Set backend env `N8N_HANDOFF_WEBHOOK_URL` to the n8n Webhook node URL.
2. Optional but recommended: set `N8N_WEBHOOK_SECRET`.
3. When a Flow Builder `handoff` node runs, backend posts `flow_handoff_requested` to n8n.
4. n8n generates the summary from the included `messages`.
5. n8n posts the result back to `callback_url`.

Callback request:

```http
POST /api/n8n/conversations/:conversationId/summary
X-N8N-Secret: your-secret-if-configured
Content-Type: application/json
```

Supported body:

```json
{
  "summary_text": "Short sales-ready summary.",
  "customer_intent": "Wants pricing",
  "customer_stage": "Qualified",
  "lead_quality": "Warm",
  "next_best_action": "Share pricing and ask for preferred call time.",
  "important_facts": ["Name: Tanishk", "Asked for pricing"],
  "open_questions": ["Budget", "Timeline"],
  "objections": [],
  "products_discussed": ["Website package"],
  "model": "gpt-4.1-mini"
}
```

The callback inserts `w_conversation_summaries`, inserts an `ai_summary` note, updates `w_conversations.latest_summary_id`, and sets `summary_status = 'ready'`.

## Sales Agent View

When a human opens a chat, show:

1. `w_conversations.assigned_agent_id`
2. `w_conversations.handoff_status`
3. latest `w_conversation_summaries` row
4. latest `w_conversation_notes` rows
5. `w_messages` ordered by `created_at`

## Flow Builder

`w_flows` is the editor table. Save updates draft JSON (`nodes`, `edges`). Publish creates a `w_flow_versions` row and sets `w_flows.current_version_id`.

Runtime uses the published version, not the live draft. This prevents active conversations from breaking while someone edits a flow.

Phase 1 supported nodes:

| Node | Runtime behavior |
| --- | --- |
| `startBotFlow` | Starts a flow from trigger keywords. |
| `textMessage` | Sends a text reply. |
| `button` | Sends WhatsApp reply buttons and waits for a response. |
| `userInput` | Asks a question and saves the next reply to session state. |
| `condition` | Branches by the latest customer text. |
| `image`, `video`, `audio`, `file` | Sends a media URL as text fallback in Phase 1. |
| `location` | Sends a Google Maps link. |
| `handoff` | Marks the conversation for human handoff and optionally requests n8n summary. |
| `end` | Completes the flow session. |

`w_bot_flows` is legacy/simple keyword flow storage. New work should use `w_flows` + `w_flow_versions` only.
