
import { Response } from 'express';
import crypto from "crypto";
import { supabase } from '../config/supabase.js';
import { io } from '../socket.js';
import { storeMessage, upsertConversation } from '../services/messages.service.js';
import { processFlowEngine } from '../services/flows.service.js';
// (Add other imports as needed later)

const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN;
const APP_SECRET = process.env.META_APP_SECRET;

export function verifyMetaSignature(req: any) {
    const sig = req.get("X-Hub-Signature-256");
    if (!sig || !APP_SECRET) return false;

    const expected =
        "sha256=" +
        crypto.createHmac("sha256", APP_SECRET).update(req.rawBody).digest("hex");

    try {
        return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
        return false;
    }
}

export async function verifyWebhook(req: any, res: Response) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

export async function handleWebhook(req: any, res: Response) {
  // Signature verify (recommended)
  if (APP_SECRET) {
    const ok = verifyMetaSignature(req);
    if (!ok) {
      console.log("❌ Webhook Signature Verification Failed!");
      return res.sendStatus(403);
    }
  }
  res.sendStatus(200); // Ack immediately

  console.log("==========================================");
  console.log("📥 WEBHOOK EVENT RECEIVED!");
  console.log(JSON.stringify(req.body, null, 2));
  console.log("==========================================");

  try {
    const body = req.body;
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const metadata = value?.metadata; // has phone_number_id

    if (!value) return;

    if (
      change?.field === "message_template_status_update" ||
      value?.event === "message_template_status_update" ||
      value?.message_template_name
    ) {
      const wabaId = String(
        entry?.id ||
          value?.waba_id ||
          value?.whatsapp_business_account_id ||
          "",
      );
      const templateId =
        value?.message_template_id || value?.template_id || value?.id || null;
      const templateName =
        value?.message_template_name ||
        value?.name ||
        value?.template_name ||
        null;
      const templateLanguage =
        value?.message_template_language || value?.language || "en_US";
      const templateStatus = normalizeMetaTemplateStatus(
        value?.event ||
          value?.status ||
          value?.message_template_status ||
          "PENDING",
      );
      const rejectionReason =
        value?.reason ||
        value?.rejected_reason ||
        value?.disable_info?.reason ||
        value?.message_template_rejected_reason ||
        null;

      if (!templateName && !templateId) return;

      let query = supabase
        .from("w_template_submissions")
        .select(
          "id, organization_id, wa_account_id, name, language, category, components, normalized_payload",
        );
      if (templateId) query = query.eq("template_id", templateId);
      else
        query = query.eq("name", templateName).eq("language", templateLanguage);
      if (wabaId) query = query.eq("waba_id", wabaId);
      const { data: existing } = await query.maybeSingle();

      if (existing) {
        await upsertLocalTemplateSubmission({
          organization_id: existing.organization_id,
          wa_account_id: existing.wa_account_id,
          waba_id: wabaId || existing.normalized_payload?.waba_id || null,
          template_id: templateId,
          name: existing.name,
          language: existing.language,
          category: value?.category || existing.category,
          status: templateStatus,
          quality_score: value?.quality_score || value?.quality || null,
          rejection_reason: rejectionReason,
          components: existing.components || [],
          normalized_payload: existing.normalized_payload || {},
          meta_response: value,
        });
        io.to(`org:${existing.organization_id}`).emit(
          "template_status_updated",
          {
            name: existing.name,
            language: existing.language,
            status: templateStatus,
            rejected_reason: rejectionReason,
          },
        );
      } else {
        console.warn(
          "[Templates] Status webhook received for unknown template:",
          value,
        );
      }
      return;
    }

    // 1. Identify Organization & Account
    const phone_number_id = metadata?.phone_number_id;
    let organization_id = null;
    let wa_account_id = null;

    if (phone_number_id && supabase) {
      const { data: acc } = await supabase
        .from("w_wa_accounts")
        .select("id, organization_id")
        .eq("phone_number_id", phone_number_id)
        .maybeSingle();

      if (acc) {
        organization_id = acc.organization_id;
        wa_account_id = acc.id;
      }
    }

    if (!organization_id) {
      console.error(
        `❌ Webhook Error: Phone ID ${phone_number_id} not mapped to any organization.`,
      );
      return;
    }

    // 2. Handle Messages (Inbound)
    if (value.messages?.length) {
      const msg = value.messages[0];
      const contacts = value.contacts || [];

      const from = msg.from; // wa_id
      const profileName = contacts[0]?.profile?.name || null;
      const wa_message_id = msg.id;

      let type = msg.type;
      let text = "";
      let interactivePayload: any = null; // button/list reply ka raw data

      if (type === "reaction") {
        const targetWaId = msg.reaction?.message_id || null;
        const emoji =
          typeof msg.reaction?.emoji === "string"
            ? msg.reaction.emoji.trim()
            : "";

        if (targetWaId) {
          const { data: target, error: targetErr } = await supabase
            .from("w_messages")
            .select("id, conversation_id, reactions")
            .eq("organization_id", organization_id)
            .eq("wa_message_id", targetWaId)
            .maybeSingle();

          if (!targetErr && target) {
            const nextReactions = applyReactionUpdate(
              target.reactions,
              emoji || null,
              from,
            );
            const { error: updErr } = await supabase
              .from("w_messages")
              .update({ reactions: nextReactions })
              .eq("id", target.id)
              .eq("organization_id", organization_id);

            if (updErr) {
              console.error("Failed to update Cloud reaction", updErr);
            } else {
              io.to(`org:${organization_id}`).emit("message_updated", {
                conversation_id: target.conversation_id,
                message_id: target.id,
                wa_message_id: targetWaId,
                reactions: nextReactions,
              });
            }
          }
        }
        return;
      }

      // REPLACED: Updated type extraction logic for interactive/buttons
      if (type === "text") {
        text = msg.text?.body || "";
      } else if (type === "interactive") {
        interactivePayload = msg.interactive;
        text =
          msg.interactive?.button_reply?.title ||
          msg.interactive?.list_reply?.title ||
          msg.interactive?.button_reply?.id ||
          msg.interactive?.list_reply?.id ||
          `[interactive:${msg.interactive.type}]`;
      } else if (type === "button") {
        text = msg.button?.text || "";
      } else if (type === "image") {
        text = msg.image?.caption || "[Image]";
      } else if (type === "video") {
        text = msg.video?.caption || "[Video]";
      } else if (type === "audio") {
        text = "[Audio]";
      } else if (type === "document") {
        text = msg.document?.filename || "[Document]";
      } else {
        text = `[${type}]`;
      }

      // Ensure wa_account exists so conversations FK/unique constraints work
      if (!wa_account_id && phone_number_id && supabase) {
        const { data: newAcc } = await supabase
          .from("w_wa_accounts")
          .upsert(
            {
              organization_id,
              phone_number_id,
              display_phone_number:
                metadata?.display_phone_number || phone_number_id,
              access_token_encrypted: ACCESS_TOKEN
                ? encryptToken(ACCESS_TOKEN)
                : "",
              status: "connected",
            },
            { onConflict: "phone_number_id" },
          )
          .select("id")
          .single();
        wa_account_id = newAcc?.id || null;
      }

      // A. Upsert Contact
      const contact = await upsertContact(
        organization_id,
        wa_account_id,
        from,
        profileName,
      );

      // B. Upsert Conversation
      const conv = await upsertConversation(
        organization_id,
        wa_account_id,
        contact.id,
        {
          direction: "inbound",
          preview: text,
        },
      );

      // Quoted/Reply context extract karo
      let quotedMessage: any = null;
      const isForwarded = !!(
        msg.context?.forwarded || msg.context?.frequently_forwarded
      );
      if (msg.context?.id) {
        // DB mein quoted message dhundo
        const { data: quotedMsg } = await supabase
          .from("w_messages")
          .select("id, text_body, type, content, wa_message_id, direction")
          .eq("wa_message_id", msg.context.id)
          .maybeSingle();

        quotedMessage = {
          wa_message_id: msg.context.id,
          from: msg.context.from || null,
          // Agar DB mein mila toh uska text use karo
          text: quotedMsg?.text_body || quotedMsg?.content?.text || null,
          type: quotedMsg?.type || "text",
          direction: quotedMsg?.direction || null,
          found: !!quotedMsg,
        };
      }

      // PRE-DEFINE CONTENT (Media will update this row later)
      const enrichedContent: any = {
        text,
        raw: msg,
        quoted: quotedMessage,
        forwarded: isForwarded,
        frequently_forwarded: !!msg.context?.frequently_forwarded,
      };

      // C. Insert Message
      const storedInbound = await storeMessage({
        organization_id,
        contact_id: contact.id,
        conversation_id: conv.id, // TS fix needed? Cast in storeMessage helper
        wa_message_id,
        direction: "inbound",
        type,
        content: enrichedContent,
        status: "delivered",
        sender_type: "customer",
        automation_source: "webhook",
      } as any);

      // D. Emit Realtime
      // Emit to org room
      io.to(`org:${organization_id}`).emit("new_message", {
        from,
        phone: from,
        text,
        quoted: quotedMessage || null,
        forwarded: isForwarded,
        sender: "user",
        conversation_id: conv.id,
        contact_id: contact.id,
        message_id: storedInbound?.id || null,
        wa_message_id,
        created_at: storedInbound?.created_at || new Date().toISOString(),
        status: "delivered",
        name: profileName,
        connectedAccount: metadata?.display_phone_number,
        type,
        ...(enrichedContent?.media_url
          ? { media_url: enrichedContent.media_url }
          : {}),
        ...(enrichedContent?.mime_type
          ? { mime_type: enrichedContent.mime_type }
          : {}),
        ...(enrichedContent?.file_name
          ? { file_name: enrichedContent.file_name }
          : {}),
      });

      // If media, download from Meta and store in Supabase Storage
      if (["image", "video", "audio", "document"].includes(type)) {
        // RUN THIS ASYNC TO NOT BLOCK THE THREAD
        (async () => {
          const mediaId =
            type === "image"
              ? msg.image?.id
              : type === "video"
                ? msg.video?.id
                : type === "audio"
                  ? msg.audio?.id
                  : type === "document"
                    ? msg.document?.id
                    : null;

          if (mediaId && phone_number_id) {
            const downloaded = await downloadMetaMedia({
              phone_number_id,
              mediaId,
            });
            if (downloaded) {
              const uploaded = await uploadMediaToStorage({
                organization_id,
                conversation_id: conv.id,
                fileName: downloaded.fileName,
                mimeType: downloaded.mimeType,
                buffer: downloaded.buffer,
              });

              const caption =
                type === "image"
                  ? msg.image?.caption || null
                  : type === "video"
                    ? msg.video?.caption || null
                    : type === "document"
                      ? msg.document?.caption || null
                      : null;

              const finalMediaContent = {
                text: caption,
                media_url: uploaded.publicUrl,
                mime_type: downloaded.mimeType,
                file_name: downloaded.fileName,
                quoted: quotedMessage,
                forwarded: isForwarded,
                frequently_forwarded: !!msg.context?.frequently_forwarded,
                raw: msg,
              };

              // UPDATE THE MESSAGE CONTENT IN DB AFTER UPLOAD
              if (storedInbound?.id) {
                await supabase
                  .from("w_messages")
                  .update({ content: finalMediaContent })
                  .eq("id", storedInbound.id);
                // EMIT UPDATE TO FRONTEND
                io.emit("message_updated", {
                  message_id: storedInbound.id,
                  content: finalMediaContent,
                });
              }
            }
          }
        })();
      }

      // E. Bot Auto-Reply
      try {
        let flowConsumedMessage = false;

        // Flow engine: text + button replies + interactive replies sab process karo
        const isFlowEligible =
          (type === "text" || type === "interactive" || type === "button") &&
          text;

        if (isFlowEligible) {
          const flowResult = await processFlowEngine(
            organization_id,
            contact.id,
            conv.id,
            text,
            storedInbound?.id || null,
            conv.wa_account_id || null,
          );
          if (flowResult?.consumed) {
            flowConsumedMessage = true;

            // 1. Send preceding text output if present
            if (flowResult.output) {
              console.log(
                `🌊 Flow Engine replied with text to: "${text.substring(0, 50)}"`,
              );
              const sendResult = await sendTextMessage(
                from,
                flowResult.output,
                phone_number_id,
              );
              const botWaMessageId = sendResult?.messages?.[0]?.id || null;

              const storedBotReply = await storeMessage({
                organization_id,
                contact_id: contact.id,
                conversation_id: conv.id,
                wa_message_id: botWaMessageId,
                direction: "outbound",
                type: "text",
                content: { text: flowResult.output, is_flow: true },
                status: "sent",
                is_bot_reply: true,
                sender_type: "ai_agent",
                automation_source: "flow",
                metadata: {
                  flow_id: flowResult.flow_id,
                  flow_version_id: flowResult.flow_version_id,
                  flow_session_id: flowResult.flow_session_id,
                  flow_run_id: flowResult.flow_run_id,
                  flow_node_id: flowResult.flow_node_id,
                  handoff: flowResult.handoff === true,
                },
              } as any);

              io.emit("new_message", {
                from: metadata?.display_phone_number || phone_number_id,
                phone: from,
                text: flowResult.output,
                sender: "agent",
                conversation_id: conv.id,
                contact_id: contact.id,
                message_id: storedBotReply?.id || null,
                wa_message_id: botWaMessageId,
                created_at:
                  storedBotReply?.created_at || new Date().toISOString(),
                connectedAccount: metadata?.display_phone_number,
                type: "text",
                is_bot_reply: true,
              });
            }

            // 2. Send interactive buttons if present
            if (flowResult.interactive?.type === "button") {
              console.log(`🔘 Flow Engine sending real buttons`);
              const { body, buttons, footer } = flowResult.interactive;
              const sendResult = await sendInteractiveButtons(
                from,
                body,
                buttons,
                footer,
                phone_number_id,
              );
              const botWaMessageId = sendResult?.messages?.[0]?.id || null;

              const storedBotReply = await storeMessage({
                organization_id,
                contact_id: contact.id,
                conversation_id: conv.id,
                wa_message_id: botWaMessageId,
                direction: "outbound",
                type: "interactive",
                content: {
                  text: body,
                  interactive: flowResult.interactive,
                  is_flow: true,
                },
                status: "sent",
                is_bot_reply: true,
                sender_type: "ai_agent",
                automation_source: "flow",
                metadata: {
                  flow_id: flowResult.flow_id,
                  flow_version_id: flowResult.flow_version_id,
                  flow_session_id: flowResult.flow_session_id,
                  flow_run_id: flowResult.flow_run_id,
                  flow_node_id: flowResult.flow_node_id,
                  handoff: flowResult.handoff === true,
                },
              } as any);

              io.emit("new_message", {
                from: metadata?.display_phone_number || phone_number_id,
                phone: from,
                text: body,
                sender: "agent",
                conversation_id: conv.id,
                contact_id: contact.id,
                message_id: storedBotReply?.id || null,
                wa_message_id: botWaMessageId,
                created_at:
                  storedBotReply?.created_at || new Date().toISOString(),
                connectedAccount: metadata?.display_phone_number,
                type: "interactive",
                is_bot_reply: true,
              });
            }

            // 3. Send media nodes as real WhatsApp attachments.
            if (
              Array.isArray(flowResult.media) &&
              flowResult.media.length > 0
            ) {
              for (const media of flowResult.media) {
                try {
                  const sentMedia = await sendFlowMediaMessageMeta({
                    phone_number_id,
                    to: from,
                    media,
                  });
                  const preview =
                    media.caption ||
                    (media.type === "image"
                      ? "[Image]"
                      : media.type === "video"
                        ? "[Video]"
                        : media.type === "audio"
                          ? "[Audio]"
                          : "[Document]");

                  const storedBotMedia = await storeMessage({
                    organization_id,
                    contact_id: contact.id,
                    conversation_id: conv.id,
                    wa_message_id: sentMedia.wa_message_id,
                    direction: "outbound",
                    type: media.type,
                    content: {
                      text: media.caption || null,
                      media_url: sentMedia.media_url,
                      mime_type: sentMedia.mime_type,
                      file_name: sentMedia.file_name,
                      size: sentMedia.size,
                      is_flow: true,
                      raw_send: sentMedia.raw,
                    },
                    status: "sent",
                    is_bot_reply: true,
                    sender_type: "ai_agent",
                    automation_source: "flow",
                    metadata: {
                      flow_id: flowResult.flow_id,
                      flow_version_id: flowResult.flow_version_id,
                      flow_session_id: flowResult.flow_session_id,
                      flow_run_id: flowResult.flow_run_id,
                      flow_node_id: flowResult.flow_node_id,
                      handoff: flowResult.handoff === true,
                    },
                  } as any);

                  io.emit("new_message", {
                    from: metadata?.display_phone_number || phone_number_id,
                    phone: from,
                    text: preview,
                    sender: "agent",
                    conversation_id: conv.id,
                    contact_id: contact.id,
                    message_id: storedBotMedia?.id || null,
                    wa_message_id: sentMedia.wa_message_id,
                    created_at:
                      storedBotMedia?.created_at || new Date().toISOString(),
                    connectedAccount: metadata?.display_phone_number,
                    type: media.type,
                    media_url: sentMedia.media_url,
                    mime_type: sentMedia.mime_type,
                    file_name: sentMedia.file_name,
                    is_bot_reply: true,
                  });
                } catch (mediaErr: any) {
                  console.error(
                    "[Flow] Failed to send media node:",
                    mediaErr?.message || mediaErr,
                  );
                }
              }
            }

            // Update conversation preview
            const lastMedia = Array.isArray(flowResult.media)
              ? flowResult.media[flowResult.media.length - 1]
              : null;
            const lastPreview = lastMedia
              ? lastMedia.caption ||
                (lastMedia.type === "document"
                  ? "[Document]"
                  : `[${lastMedia.type.charAt(0).toUpperCase()}${lastMedia.type.slice(1)}]`)
              : flowResult.interactive?.body || flowResult.output || "";
            await supabase
              .from("w_conversations")
              .update({
                last_message_at: new Date().toISOString(),
                last_message_preview: lastPreview.substring(0, 100),
              })
              .eq("id", conv.id);
          }
        }

        // AI Agent fallback — sirf tab jab flow ne consume nahi kiya aur type text hai
        if (!flowConsumedMessage && type === "text" && text) {
          const botResult = await getBotAgentReply({
            organization_id,
            conversation_id: conv.id,
            text,
          });
          if (botResult?.reply) {
            console.log(`🤖 Bot "${botResult.agent?.name}" replying`);
            const sendResult = await sendTextMessage(
              from,
              botResult.reply,
              phone_number_id,
            );
            const botWaMessageId = sendResult?.messages?.[0]?.id || null;
            const storedBotReply = await storeMessage({
              organization_id,
              contact_id: contact.id,
              conversation_id: conv.id,
              wa_message_id: botWaMessageId,
              direction: "outbound",
              type: "text",
              content: {
                text: botResult.reply,
                bot_agent_id: botResult.agent?.id,
                bot_agent_name: botResult.agent?.name,
              },
              status: "sent",
              is_bot_reply: true,
              bot_agent_id: botResult.agent?.id || null,
              sender_type: "ai_agent",
              automation_source: "ai_agent",
            } as any);
            io.emit("new_message", {
              from: metadata?.display_phone_number || phone_number_id,
              phone: from,
              text: botResult.reply,
              sender: "agent",
              conversation_id: conv.id,
              contact_id: contact.id,
              message_id: storedBotReply?.id || null,
              wa_message_id: botWaMessageId,
              created_at:
                storedBotReply?.created_at || new Date().toISOString(),
              connectedAccount: metadata?.display_phone_number,
              type: "text",
              is_bot_reply: true,
              bot_agent_name: botResult.agent?.name,
            });

            // Update conversation preview
            await supabase
              .from("w_conversations")
              .update({
                last_message_at: new Date().toISOString(),
                last_message_preview: botResult.reply.substring(0, 100),
              })
              .eq("id", conv.id);
          }
        }
      } catch (botErr: any) {
        console.error("Bot auto-reply error:", botErr.message || botErr);
      }
    }

    // 3. Handle Status Updates (Sent/Delivered/Read)
    if (value.statuses?.length) {
      const status = value.statuses[0];
      const wa_message_id = status.id;
      const newStatus = status.status; // sent, delivered, read

      // Update message status in DB
      await supabase
        .from("w_messages")
        .update({ status: newStatus })
        .eq("wa_message_id", wa_message_id);

      io.emit("message_status_update", { wa_message_id, status: newStatus });

      // If "read", maybe mark conversation as read?
      // Usually "read" status on a message doesn't mean *we* read it, it means *user* read our message.
      // So we don't reset unread_count here.

      // Log event (optional)
      // await supabase.from('w_message_events').insert(...)
    }
  } catch (e: any) {
    console.error("Webhook Error:", e.message);
  }
}
