import { supabase } from '../config/supabase.js';
import { isUuid } from '../utils/format.js';

export const SUPPORTED_FLOW_NODE_TYPES = new Set([
    'startBotFlow',
    'textMessage',
    'template',
    'button',
    'interactive',
    'userInput',
    'condition',
    'image',
    'video',
    'audio',
    'file',
    'location',
    'whatsappFlow',
    'ai',
    'httpApi',
    'googleSheets',
    'appointment',
    'product',
    'handoff',
    'end',
]);

export function parseFlowKeywords(value: any): string[] {
    if (Array.isArray(value)) {
        return value.map((v) => String(v || '').trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value.split(',').map((v) => v.trim()).filter(Boolean);
    }
    return [];
}

export function getFlowTriggerKeywords(flow: any, nodesOverride?: any[]): string[] {
    const nodes = Array.isArray(nodesOverride) ? nodesOverride : (Array.isArray(flow?.nodes) ? flow.nodes : []);
    const startNode = nodes.find((n: any) => n?.type === 'startBotFlow');
    return [...new Set([
        ...parseFlowKeywords(flow?.trigger_keywords),
        ...parseFlowKeywords(flow?.triggers),
        ...parseFlowKeywords(startNode?.data?.config?.keywords),
    ])];
}

export function normalizeFlowAccountScope(value: any) {
    return value === 'selected' ? 'selected' : 'all';
}

export function normalizeFlowAccountIds(value: any): string[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item || '').trim()).filter(isUuid);
}

export function isMissingFlowVersionAccountColumnsError(error: any) {
    const message = String(error?.message || error?.details || '').toLowerCase();
    const code = String(error?.code || '');
    return (code === 'PGRST204' || code === '42703') &&
        message.includes('w_flow_versions') &&
        (message.includes('wa_account_scope') || message.includes('wa_account_ids'));
}

export async function insertFlowVersionWithSchemaFallback(payload: any) {
    const insertPayload = {
        ...payload,
        wa_account_scope: normalizeFlowAccountScope(payload?.wa_account_scope),
        wa_account_ids: normalizeFlowAccountIds(payload?.wa_account_ids),
    };

    const firstAttempt = await supabase
        .from('w_flow_versions')
        .insert(insertPayload)
        .select()
        .single();

    if (!firstAttempt.error || !isMissingFlowVersionAccountColumnsError(firstAttempt.error)) {
        return firstAttempt;
    }

    const legacyPayload = { ...insertPayload };
    delete legacyPayload.wa_account_scope;
    delete legacyPayload.wa_account_ids;

    console.warn(
        '[Flow] w_flow_versions account scope columns are missing. ' +
        'Retrying publish with legacy schema; run supabase/migrations/20260523_flow_versions_account_scope_fix.sql.'
    );

    return supabase
        .from('w_flow_versions')
        .insert(legacyPayload)
        .select()
        .single();
}

export function flowAppliesToAccount(flow: any, waAccountId?: string | null) {
    const scope = normalizeFlowAccountScope(flow?.wa_account_scope);
    if (scope !== 'selected') return true;
    const ids = normalizeFlowAccountIds(flow?.wa_account_ids);
    if (ids.length === 0) return false;
    return Boolean(waAccountId && ids.includes(String(waAccountId)));
}

export function flowAccountScopesOverlap(a: any, b: any) {
    const aScope = normalizeFlowAccountScope(a?.wa_account_scope);
    const bScope = normalizeFlowAccountScope(b?.wa_account_scope);
    if (aScope === 'all' || bScope === 'all') return true;
    const aIds = new Set(normalizeFlowAccountIds(a?.wa_account_ids));
    return normalizeFlowAccountIds(b?.wa_account_ids).some((id) => aIds.has(id));
}

export async function findFlowTriggerConflicts(orgId: string, flow: any, triggerKeywords: string[]) {
    const keywords = new Set((triggerKeywords || []).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean));
    if (keywords.size === 0) return [];

    const { data, error } = await supabase
        .from('w_flows')
        .select('id, name, status, trigger_keywords, triggers, wa_account_scope, wa_account_ids')
        .eq('organization_id', orgId)
        .eq('status', 'active')
        .neq('id', flow.id);
    if (error) throw error;

    return (data || [])
        .filter((other: any) => flowAccountScopesOverlap(flow, other))
        .map((other: any) => {
            const otherKeywords = getFlowTriggerKeywords(other);
            const overlap = otherKeywords.filter((item) => keywords.has(String(item).trim().toLowerCase()));
            return overlap.length > 0 ? { flow: other, triggers: overlap } : null;
        })
        .filter(Boolean);
}

export function normalizeFlowVariableKey(value: any) {
    return String(value || '')
        .trim()
        .replace(/^\{\{\s*/, '')
        .replace(/\s*\}\}$/, '')
        .trim()
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
}

export function renderFlowTemplate(value: any, state: any = {}) {
    return String(value || '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, rawKey) => {
        const key = normalizeFlowVariableKey(rawKey);
        const foundKey = Object.keys(state || {}).find((candidate) => normalizeFlowVariableKey(candidate) === key);
        const replacement = foundKey ? state[foundKey] : state?.[key];
        return replacement == null ? '' : String(replacement);
    });
}

export function validateFlowDefinition(flow: any) {
    const errors: string[] = [];
    const nodes: any[] = Array.isArray(flow?.nodes) ? flow.nodes : [];
    const edges: any[] = Array.isArray(flow?.edges) ? flow.edges : [];
    const nodeIds = new Set(nodes.map((n) => n?.id).filter(Boolean));
    const startNodes = nodes.filter((n) => n?.type === 'startBotFlow');
    const reachable = new Set<string>();

    if (startNodes.length !== 1) errors.push('Flow must have exactly one Start Bot Flow node.');
    if (nodes.length === 0) errors.push('Flow must contain at least one node.');

    for (const edge of edges) {
        if (!nodeIds.has(edge?.source) || !nodeIds.has(edge?.target)) {
            errors.push('Flow has a broken connection.');
            break;
        }
    }

    if (startNodes.length === 1) {
        const stack = [startNodes[0].id];
        while (stack.length) {
            const id = stack.pop();
            if (!id || reachable.has(id)) continue;
            reachable.add(id);
            edges.filter((e) => e.source === id).forEach((e) => stack.push(e.target));
        }
    }

    const nodesToValidate = reachable.size > 0
        ? nodes.filter((n) => n?.id && reachable.has(n.id))
        : nodes;

    for (const node of nodesToValidate) {
        if (!SUPPORTED_FLOW_NODE_TYPES.has(node?.type)) {
            errors.push(`Unsupported node "${node?.type || 'unknown'}" is not available in this flow builder.`);
        }
        const config = node?.data?.config || {};
        if (node?.type === 'textMessage' && !String(config.message || config.text || '').trim()) {
            errors.push('Text Message node must have message text.');
        }
        if (node?.type === 'button') {
            const buttons = Array.isArray(config.buttons) ? config.buttons.filter((b: any) => String(b?.text || '').trim()) : [];
            if (buttons.length === 0) errors.push('Button node must have at least one button.');
            if (buttons.length > 3) errors.push('Button node can have maximum 3 WhatsApp buttons.');
        }
        if (node?.type === 'userInput' && !String(config.saveToField || '').trim()) {
            errors.push('User Input node must save the answer to a field.');
        }
        if (node?.type === 'condition' && (
            !String(config.variable || '').trim()
            || !String(config.operator || '').trim()
            || !String(config.value || '').trim()
        )) {
            errors.push('Condition node must have variable, operator, and value.');
        }
    }

    if (startNodes.length === 1) {
        const keywords = getFlowTriggerKeywords(flow, nodes);
        if ((flow?.trigger_type || 'keyword') === 'keyword' && keywords.length === 0) {
            errors.push('Start node must have trigger keywords.');
        }
    }

    if (normalizeFlowAccountScope(flow?.wa_account_scope) === 'selected' && normalizeFlowAccountIds(flow?.wa_account_ids).length === 0) {
        errors.push('Select at least one WhatsApp account or switch the flow to all connected numbers.');
    }

    return { valid: errors.length === 0, errors };
}

export async function processFlowEngine(
  organization_id: string,
  contact_id: string,
  conversation_id: string,
  text: string,
  triggerMessageId?: string | null,
  incomingWaAccountId?: string | null,
): Promise<FlowEngineResult> {
  const normalized = text.toLowerCase().trim();

  // Flow Builder has priority and is independent from the per-chat AI-agent toggle.

  // 1. Check for active session
  const { data: session } = await supabase
    .from("w_flow_sessions")
    .select("*")
    .eq("organization_id", organization_id)
    .eq("conversation_id", conversation_id)
    .in("status", ["active", "waiting"])
    .maybeSingle();

  let currentFlowId: string | null = null;
  let currentNodeId: string | null = null;
  let session_id: string | null = null;
  let currentFlowVersionId: string | null = null;
  let run_id: string | null = null;
  let isResuming = false;

  if (session) {
    currentFlowId = session.flow_id;
    currentFlowVersionId = session.flow_version_id || null;
    currentNodeId = session.current_node_id;
    session_id = session.id;
    run_id = session.active_run_id || null;
    isResuming = true;
  } else {
    // 2. Check for trigger matches in active flows
    const { data: activeFlows } = await supabase
      .from("w_flows")
      .select("*")
      .eq("organization_id", organization_id)
      .eq("status", "active");

    const accountEligibleFlows = (activeFlows || []).filter((flow: any) =>
      flowAppliesToAccount(flow, incomingWaAccountId),
    );

    let matchedFlow = null;
    let matchedVersion = null;
    for (const flow of accountEligibleFlows) {
      let version = null;
      if (flow.current_version_id) {
        const { data } = await supabase
          .from("w_flow_versions")
          .select("*")
          .eq("id", flow.current_version_id)
          .maybeSingle();
        version = data;
      }
      const nodes = version?.nodes || flow.nodes || [];
      const allTriggers = getFlowTriggerKeywords(version || flow, nodes);

      if (
        allTriggers.some((t: string) => normalized.includes(t.toLowerCase()))
      ) {
        matchedFlow = flow;
        matchedVersion = version;
        break;
      }
    }

    if (!matchedFlow) {
      console.log("[Flow] No active flow matched; AI fallback may run", {
        organization_id,
        conversation_id,
        text: normalized,
        active_flow_count: activeFlows?.length || 0,
        account_eligible_flow_count: accountEligibleFlows.length,
        incoming_wa_account_id: incomingWaAccountId || null,
        triggers: accountEligibleFlows.map((flow: any) => ({
          id: flow.id,
          name: flow.name,
          trigger_keywords: flow.trigger_keywords,
          triggers: flow.triggers,
          wa_account_scope: flow.wa_account_scope || "all",
          wa_account_ids: flow.wa_account_ids || [],
        })),
      });
      return { consumed: false, output: null };
    }

    console.log("[Flow] Matched active flow", {
      organization_id,
      conversation_id,
      flow_id: matchedFlow.id,
      flow_name: matchedFlow.name,
      flow_version_id:
        matchedVersion?.id || matchedFlow.current_version_id || null,
      incoming_wa_account_id: incomingWaAccountId || null,
    });

    currentFlowId = matchedFlow.id;
    currentFlowVersionId =
      matchedVersion?.id || matchedFlow.current_version_id || null;
    // Find start node
    const nodes = matchedVersion?.nodes || matchedFlow.nodes || [];
    const startNode = nodes.find((n: any) => n.type === "startBotFlow");
    if (!startNode) return { consumed: false, output: null };

    currentNodeId = startNode.id;

    // Create or find active session
    const { data: newSession, error: sessErr } = await supabase
      .from("w_flow_sessions")
      .insert({
        organization_id,
        conversation_id,
        contact_id,
        flow_id: currentFlowId,
        flow_version_id: currentFlowVersionId,
        current_node_id: currentNodeId,
        status: "active",
        state_data: {},
      })
      .select()
      .single();

    if (sessErr) {
      console.error("Session create error:", sessErr);
      // Agar duplicate error hai toh existing session use karo
      if (sessErr.code === "23505") {
        const { data: existingSession } = await supabase
          .from("w_flow_sessions")
          .select("*")
          .eq("organization_id", organization_id)
          .eq("conversation_id", conversation_id)
          .in("status", ["active", "waiting"])
          .maybeSingle();
        if (existingSession) {
          currentFlowId = existingSession.flow_id;
          currentFlowVersionId =
            existingSession.flow_version_id || currentFlowVersionId;
          currentNodeId = existingSession.current_node_id;
          session_id = existingSession.id;
          run_id = existingSession.active_run_id || null;
          isResuming = true;
        }
      }
    } else if (newSession) {
      session_id = newSession.id;
    }

    if (!run_id) {
      const { data: newRun } = await supabase
        .from("w_flow_runs")
        .insert({
          organization_id,
          conversation_id,
          contact_id,
          flow_id: currentFlowId,
          flow_version_id: currentFlowVersionId,
          session_id,
          trigger_message_id: triggerMessageId || null,
          status: "running",
        })
        .select("id")
        .maybeSingle();
      run_id = newRun?.id || null;
      if (session_id && run_id) {
        await supabase
          .from("w_flow_sessions")
          .update({ active_run_id: run_id })
          .eq("id", session_id);
      }
    }

    console.log(
      `🆕 New flow session created: ${session_id}, starting at node: ${currentNodeId}`,
    );
  }

  if (!currentFlowId || !currentNodeId || !session_id) {
    return { consumed: false, output: null };
  }

  // Flow data load karo
  let flowData = null;
  if (currentFlowVersionId) {
    const { data } = await supabase
      .from("w_flow_versions")
      .select("nodes, edges")
      .eq("id", currentFlowVersionId)
      .maybeSingle();
    flowData = data;
  }
  if (!flowData) {
    const { data } = await supabase
      .from("w_flows")
      .select("nodes, edges")
      .eq("id", currentFlowId)
      .single();
    flowData = data;
  }

  if (!flowData) return { consumed: true, output: null };

  const nodes: any[] = flowData.nodes || [];
  const edges: any[] = flowData.edges || [];
  const { data: latestSessionState } = await supabase
    .from("w_flow_sessions")
    .select("state_data")
    .eq("id", session_id)
    .maybeSingle();
  let flowState = latestSessionState?.state_data || session?.state_data || {};
  const flowMeta = {
    flow_id: currentFlowId,
    flow_version_id: currentFlowVersionId,
    flow_session_id: session_id,
    flow_run_id: run_id,
  };

  // ----------------------------------------------------------------
  // RESUMING: User ne button click kiya ya kuch type kiya
  // Pehle current node ke edges check karo aur next node pe jao
  // ----------------------------------------------------------------
  if (isResuming) {
    const currentNode = nodes.find((n: any) => n.id === currentNodeId);

    if (currentNode?.type === "button" || currentNode?.type === "userInput") {
      if (currentNode.type === "userInput") {
        const saveToField = normalizeFlowVariableKey(
          currentNode.data?.config?.saveToField,
        );
        if (saveToField) {
          const nextState = {
            ...(session?.state_data || {}),
            [saveToField]: text,
          };
          await supabase
            .from("w_flow_sessions")
            .update({ state_data: nextState })
            .eq("id", session_id);
          flowState = nextState;
        }
      }
      // User ka response match karo outgoing edges se
      const outEdges = edges.filter((e: any) => e.source === currentNodeId);
      let nextEdge: any = null;

      if (outEdges.length === 1) {
        nextEdge = outEdges[0];
      } else if (outEdges.length > 1) {
        const buttons = currentNode?.data?.config?.buttons || [];
        const matchedButtonIndex = buttons.findIndex(
          (b: any) =>
            String(b?.text || "")
              .trim()
              .toLowerCase() === normalized,
        );
        if (matchedButtonIndex >= 0) {
          nextEdge = outEdges.find(
            (e: any) => e.sourceHandle === `button-${matchedButtonIndex}`,
          );
        }
        // Button ID, title, ya label se match karo
        nextEdge =
          nextEdge ||
          outEdges.find((e: any) => {
            const handle = (e.sourceHandle || "").toLowerCase();
            const label = (e.label || "").toLowerCase();
            return (
              handle === normalized ||
              label === normalized ||
              normalized.includes(handle)
            );
          }) ||
          outEdges.find((e: any) => {
            // Fallback to sourceHandle comparison if label fails
            return (
              e.sourceHandle &&
              normalized.includes(e.sourceHandle.toLowerCase())
            );
          }) ||
          outEdges[0]; // fallback: pehla edge
      }

      if (nextEdge) {
        currentNodeId = nextEdge.target;
        await supabase
          .from("w_flow_sessions")
          .update({ current_node_id: currentNodeId })
          .eq("id", session_id);
        console.log(`➡️ Advancing to node: ${currentNodeId}`);
      } else {
        // Koi edge nahi — flow complete
        await supabase
          .from("w_flow_sessions")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", session_id);
        if (run_id)
          await supabase
            .from("w_flow_runs")
            .update({ status: "completed", ended_at: new Date().toISOString() })
            .eq("id", run_id);
        return { consumed: true, output: null, ...flowMeta };
      }
    }
  }

  // ----------------------------------------------------------------
  // Node execution loop — current node se chalo
  // ----------------------------------------------------------------
  let activeNode = nodes.find((n: any) => n.id === currentNodeId);
  const outputText: string[] = [];
  const mediaOutput: NonNullable<FlowEngineResult["media"]> = [];
  let steps = 0;

  while (activeNode && steps < 15) {
    steps++;
    const nodeType = activeNode.type;
    const config = activeNode.data?.config || {};

    console.log(`⚙️ Executing node: ${nodeType} (${activeNode.id})`);
    await logFlowStep({
      organization_id,
      run_id,
      node_id: activeNode.id,
      node_type: nodeType,
      input_data: { text },
      status:
        nodeType === "button" || nodeType === "userInput"
          ? "waiting"
          : "success",
    });

    // --- TEXT MESSAGE ---
    if (nodeType === "textMessage") {
      const msg = config.message || config.text || activeNode.data?.label || "";
      if (msg) outputText.push(renderFlowTemplate(msg, flowState));
    }

    // --- BUTTON NODE ---
    else if (nodeType === "button") {
      const body = renderFlowTemplate(
        config.text || config.headerText || "Choose an option:",
        flowState,
      );
      const footer = renderFlowTemplate(config.footerText || "", flowState);
      const buttons = (config.buttons || [])
        .filter((b: any) => b.text)
        .slice(0, 3);

      // Session mein current_node_id save karo — next message yahan se resume hoga
      await supabase
        .from("w_flow_sessions")
        .update({ current_node_id: activeNode.id })
        .eq("id", session_id);

      if (buttons.length > 0) {
        return {
          consumed: true,
          output: outputText.length > 0 ? outputText.join("\n\n") : null,
          media: mediaOutput.length > 0 ? mediaOutput : undefined,
          ...flowMeta,
          flow_node_id: activeNode.id,
          interactive: {
            type: "button",
            body,
            footer,
            buttons: buttons.map((b: any) => ({
              id: b.id || b.text,
              text: b.text,
            })),
          },
        };
      } else {
        // Buttons nahi hain toh text fallback
        outputText.push(body);
        return {
          consumed: true,
          output: outputText.join("\n\n"),
          media: mediaOutput.length > 0 ? mediaOutput : undefined,
          ...flowMeta,
          flow_node_id: activeNode.id,
        };
      }
    }

    // --- INTERACTIVE LIST NODE ---
    else if (nodeType === "interactive") {
      const body = renderFlowTemplate(
        config.headerText || config.text || "Choose an option:",
        flowState,
      );
      const items = (config.items || [])
        .filter((item: any) => item.title)
        .map(
          (item: any, index: number) =>
            `${index + 1}. ${item.title}${item.description ? ` - ${item.description}` : ""}`,
        );

      outputText.push(items.length > 0 ? `${body}\n${items.join("\n")}` : body);
    }

    // --- USER INPUT NODE ---
    else if (nodeType === "userInput") {
      const question = renderFlowTemplate(
        config.question || config.text || "",
        flowState,
      );
      if (question) outputText.push(question);
      // Session save karo
      await supabase
        .from("w_flow_sessions")
        .update({ current_node_id: activeNode.id })
        .eq("id", session_id);
      return {
        consumed: true,
        output: outputText.join("\n\n"),
        media: mediaOutput.length > 0 ? mediaOutput : undefined,
        ...flowMeta,
        flow_node_id: activeNode.id,
      };
    }

    // --- CONDITION NODE ---
    else if (nodeType === "condition") {
      const variableKey = normalizeFlowVariableKey(config.variable || "");
      const operator = config.operator || "contains";
      const actualValue = String(
        variableKey ? (flowState?.[variableKey] ?? "") : text,
      ).toLowerCase();
      const expectedValue = renderFlowTemplate(
        config.value || "",
        flowState,
      ).toLowerCase();

      let conditionMet = false;
      if (operator === "contains")
        conditionMet = actualValue.includes(expectedValue);
      else if (operator === "equals")
        conditionMet = actualValue === expectedValue;
      else if (operator === "notEquals")
        conditionMet = actualValue !== expectedValue;
      else if (operator === "starts_with")
        conditionMet = actualValue.startsWith(expectedValue);
      else if (operator === "ends_with")
        conditionMet = actualValue.endsWith(expectedValue);
      else if (operator === "greaterThan")
        conditionMet = Number(actualValue) > Number(expectedValue);
      else if (operator === "lessThan")
        conditionMet = Number(actualValue) < Number(expectedValue);
      else conditionMet = true;

      // Condition ke hisaab se sahi edge dhundo
      const outEdges = edges.filter((e: any) => e.source === activeNode.id);
      const matchEdge =
        outEdges.find((e: any) => {
          const h = (e.sourceHandle || "").toLowerCase();
          return conditionMet
            ? h === "yes" || h === "true"
            : h === "no" || h === "false";
        }) || outEdges[0];

      if (matchEdge) {
        activeNode = nodes.find((n: any) => n.id === matchEdge.target);
        continue;
      } else {
        break;
      }
    }

    // --- MEDIA NODES (image, video, audio, file) ---
    else if (["image", "video", "audio", "file"].includes(nodeType)) {
      const url = config.url || config.mediaUrl || "";
      const caption = renderFlowTemplate(
        config.caption || config.message || "",
        flowState,
      );
      if (url) {
        mediaOutput.push({
          type: nodeType === "file" ? "document" : nodeType,
          url: renderFlowTemplate(url, flowState),
          caption: caption || undefined,
          fileName: config.fileName || config.displayName || undefined,
          mimeType: config.mimeType || undefined,
        });
      }
    }

    // --- LOCATION NODE ---
    else if (nodeType === "location") {
      const lat = config.latitude;
      const lng = config.longitude;
      const name = config.name || "";
      if (lat && lng) {
        outputText.push(`📍 ${name}\nhttps://maps.google.com/?q=${lat},${lng}`);
      }
    }

    // --- TEMPLATE NODE ---
    else if (nodeType === "template") {
      const source = config.templateSource || "whatsapp";
      if (source === "flow") {
        const flowName =
          config.template || config.flowTemplateId || "Flow template";
        if (flowName) outputText.push(`[Flow Template: ${flowName}]`);
      } else {
        const tplName = config.templateName || config.template;
        if (tplName) outputText.push(`[Template: ${tplName}]`);
      }
    }

    // --- WHATSAPP FLOW NODE ---
    else if (nodeType === "whatsappFlow") {
      const message =
        config.message ||
        config.text ||
        config.label ||
        activeNode.data?.label ||
        "";
      if (message) outputText.push(renderFlowTemplate(message, flowState));
    }

    // --- AI NODE ---
    else if (nodeType === "ai") {
      const botResult = await getBotAgentReply({
        organization_id,
        conversation_id,
        text,
      });
      const prompt =
        config.prompt ||
        config.systemPrompt ||
        config.label ||
        activeNode.data?.label ||
        "";
      if (botResult?.reply) outputText.push(botResult.reply);
      else if (config.fallbackMessage)
        outputText.push(renderFlowTemplate(config.fallbackMessage, flowState));
      else if (prompt) outputText.push(renderFlowTemplate(prompt, flowState));
    }

    // --- HTTP/API + DATA NODES ---
    else if (nodeType === "httpApi") {
      const url = renderFlowTemplate(config.url || "", flowState);
      if (url) {
        console.log(
          "[Flow] HTTP API node configured; publish/runtime pass-through enabled",
          {
            node_id: activeNode.id,
            method: config.method || "GET",
            url,
          },
        );
      }
    } else if (nodeType === "googleSheets") {
      console.log(
        "[Flow] Google Sheets node configured; publish/runtime pass-through enabled",
        {
          node_id: activeNode.id,
          action: config.action || null,
          spreadsheet: config.spreadsheet || null,
        },
      );
    } else if (nodeType === "appointment") {
      const message =
        config.message ||
        config.confirmationMessage ||
        config.label ||
        activeNode.data?.label ||
        "";
      if (message) outputText.push(renderFlowTemplate(message, flowState));
    } else if (nodeType === "product") {
      const productText =
        config.message ||
        config.description ||
        config.productName ||
        config.product ||
        config.label ||
        activeNode.data?.label ||
        "";
      if (productText)
        outputText.push(renderFlowTemplate(productText, flowState));
    }

    // Automatic advance — next edge dhundo
    if (nodeType === "handoff") {
      const handoffMessage =
        config.message || config.label || activeNode.data?.label || "";
      const conversationPatch: any = {
        handoff_status: "handoff_requested",
        handoff_reason: config.reason || "Flow requested human handoff",
        handoff_requested_at: new Date().toISOString(),
        summary_status: "not_started",
      };
      if (config.disableBotAfterHandoff !== false)
        conversationPatch.bot_enabled = false;
      await supabase
        .from("w_conversations")
        .update(conversationPatch)
        .eq("id", conversation_id);
      await supabase
        .from("w_flow_sessions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", session_id);
      if (run_id)
        await supabase
          .from("w_flow_runs")
          .update({ status: "completed", ended_at: new Date().toISOString() })
          .eq("id", run_id);
      return {
        consumed: true,
        output: renderFlowTemplate(handoffMessage, flowState) || null,
        media: mediaOutput.length > 0 ? mediaOutput : undefined,
        handoff: true,
        ...flowMeta,
        flow_node_id: activeNode.id,
      };
    }

    if (nodeType === "end") {
      await supabase
        .from("w_flow_sessions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", session_id);
      if (run_id)
        await supabase
          .from("w_flow_runs")
          .update({ status: "completed", ended_at: new Date().toISOString() })
          .eq("id", run_id);
      const finalMessage = config.message
        ? renderFlowTemplate(config.message, flowState)
        : null;
      return {
        consumed: true,
        output:
          finalMessage ||
          (outputText.length > 0 ? outputText.join("\n\n") : null),
        media: mediaOutput.length > 0 ? mediaOutput : undefined,
        ...flowMeta,
        flow_node_id: activeNode.id,
      };
    }

    const nextEdge = edges.find((e: any) => e.source === activeNode.id);
    if (nextEdge) {
      activeNode = nodes.find((n: any) => n.id === nextEdge.target);
    } else {
      // Flow khatam
      await supabase
        .from("w_flow_sessions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", session_id);
      if (run_id)
        await supabase
          .from("w_flow_runs")
          .update({ status: "completed", ended_at: new Date().toISOString() })
          .eq("id", run_id);
      console.log(`✅ Flow completed for session ${session_id}`);
      activeNode = null;
    }
  }

  return {
    consumed: true,
    output: outputText.length > 0 ? outputText.join("\n\n") : null,
    media: mediaOutput.length > 0 ? mediaOutput : undefined,
    ...flowMeta,
  };
}
