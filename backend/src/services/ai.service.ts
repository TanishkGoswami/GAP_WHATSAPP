import { supabase } from '../config/supabase.js';

const KNOWLEDGE_MAX_CONTEXT_CHARS = 10000;
const AGENT_SETTINGS_ITEM_TYPE = "__agent_settings";

export async function getKnowledgeDocuments(organizationId: string) {
  const { data, error } = await supabase
    .from("knowledge_documents")
    .select("*")
    .eq("organization_id", organizationId);
  if (error) throw error;
  return data;
}

export async function getOrganizationKnowledgeContext(
  organizationId: string,
): Promise<string> {
  try {
    const docs = await getKnowledgeDocuments(organizationId);
    return docs
      .filter((doc: any) => doc.status === "INDEXED" && doc.content)
      .map((doc: any) => `Source: ${doc.name}\n${doc.content}`)
      .join("\n\n")
      .slice(0, KNOWLEDGE_MAX_CONTEXT_CHARS);
  } catch (err: any) {
    console.warn(
      "Failed to load organization knowledge base:",
      err?.message || err,
    );
    return "";
  }
}

export function getAgentAutomationSettings(agent: any) {
  const content = Array.isArray(agent?.knowledge_base_content)
    ? agent.knowledge_base_content
    : [];
  const item = content.find(
    (entry: any) => entry?.type === AGENT_SETTINGS_ITEM_TYPE,
  );
  const settings =
    item?.settings ||
    (agent as any)?.automation_settings || {
      reply_on_keywords: true,
      default_for_new_chats: false,
      auto_reply_unknown: false,
    };
  return settings;
}

export function stripAgentMetadataItems(items: any[]) {
  return (Array.isArray(items) ? items : []).filter(
    (entry: any) => entry?.type !== AGENT_SETTINGS_ITEM_TYPE,
  );
}

// ====== Helper: get bot agent reply ======
export async function getBotAgentReply(params: {
  organization_id: string;
  conversation_id: string;
  text: string;
}): Promise<{ reply: string; agent: any } | null> {
  const { organization_id, conversation_id, text } = params;
  const normalized = (text || "").toLowerCase().trim();
  if (!normalized) return null;

  try {
    // First check if bot is enabled for this specific conversation
    const { data: conv, error: convErr } = await supabase
      .from("w_conversations")
      .select("bot_enabled, assigned_bot_id")
      .eq("id", conversation_id)
      .single();

    if (convErr) throw convErr;

    // Per-chat toggle disables only AI-agent fallback. Flow Builder still runs first.
    if (conv?.bot_enabled === false) return null;

    // If no specific bot is selected for this conversation, check workspace bot rules.
    let targetAgent = null;

    if (conv?.bot_enabled && conv?.assigned_bot_id) {
      // Use the specifically assigned bot
      const { data: agent, error: agentErr } = await supabase
        .from("bot_agents")
        .select("*")
        .eq("id", conv.assigned_bot_id)
        .eq("is_active", true)
        .single();

      if (agentErr) throw agentErr;
      targetAgent = agent;
    } else {
      // Check all active bots and match by keywords
      const { data: agents, error: agentsErr } = await supabase
        .from("bot_agents")
        .select("*")
        .eq("organization_id", organization_id)
        .eq("is_active", true);

      if (agentsErr) throw agentsErr;

      // Find the first agent with matching keywords.
      for (const agent of agents || []) {
        const settings = getAgentAutomationSettings(agent);
        if (!settings.reply_on_keywords) continue;
        const keywords: string[] = agent.trigger_keywords || [];
        const hit = keywords.some((k: string) =>
          normalized.includes(String(k).toLowerCase()),
        );
        if (hit) {
          targetAgent = agent;
          break;
        }
      }

      // If no keyword matched, use a default/unknown-chat agent when configured.
      if (!targetAgent) {
        targetAgent =
          (agents || []).find((agent: any) => {
            const settings = getAgentAutomationSettings(agent);
            return (
              settings.default_for_new_chats || settings.auto_reply_unknown
            );
          }) || null;
      }
    }

    if (!targetAgent) return null;

    // Get OpenAI API key
    let apiKey = process.env.OPENAI_API_KEY || "";
    if (!apiKey) {
      const { data: settings } = await supabase
        .from("openai_settings")
        .select("api_key_encrypted")
        .eq("organization_id", organization_id)
        .single();
      apiKey = settings?.api_key_encrypted || "";
    }

    if (!apiKey) {
      console.log("No OpenAI API key configured, using static reply");
      // Return a static reply if no API key
      return {
        reply: `Hi! I'm ${targetAgent.name}. ${targetAgent.description || "How can I help you?"}`,
        agent: targetAgent,
      };
    }

    // Build knowledge base context
    let knowledgeContext =
      await getOrganizationKnowledgeContext(organization_id);
    if (
      targetAgent.knowledge_base_content &&
      Array.isArray(targetAgent.knowledge_base_content)
    ) {
      const agentKnowledgeContext = stripAgentMetadataItems(
        targetAgent.knowledge_base_content,
      )
        .map((item: any) => item?.content || "")
        .filter(Boolean)
        .join("\n\n");
      knowledgeContext = [knowledgeContext, agentKnowledgeContext]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, KNOWLEDGE_MAX_CONTEXT_CHARS);
    }

    // Call OpenAI
    const systemPrompt =
      targetAgent.system_prompt ||
      `You are ${targetAgent.name}, a helpful WhatsApp assistant. ${targetAgent.description || ""}`;

    const messages = [
      {
        role: "system",
        content:
          systemPrompt +
          (knowledgeContext ? `\n\nKnowledge Base:\n${knowledgeContext}` : ""),
      },
      {
        role: "user",
        content: text,
      },
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: targetAgent.model || "gpt-3.5-turbo",
        messages,
        temperature: Number(targetAgent.temperature) || 0.7,
        max_tokens: 500,
      }),
    });

    const data: any = await response.json();

    if (!response.ok) {
      console.error(
        "OpenAI API error:",
        data.error?.message || "Unknown error",
      );
      return {
        reply: `Hi! I'm ${targetAgent.name}. I'm having trouble processing your request right now. Please try again later.`,
        agent: targetAgent,
      };
    }

    const reply = data.choices?.[0]?.message?.content || "";
    if (!reply) return null;

    return { reply, agent: targetAgent };
  } catch (err) {
    console.error("getBotAgentReply error:", err);
    return null;
  }
}
