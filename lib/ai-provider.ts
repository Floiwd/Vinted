export type AiProviderType = "auto" | "gemini" | "openrouter" | "openai" | "groq" | "anthropic" | "omniroute";

export type UserAiConfig = {
  provider?: AiProviderType;
  apiKey?: string;
  geminiApiKey?: string;
  openrouterApiKey?: string;
  openaiApiKey?: string;
  groqApiKey?: string;
  anthropicApiKey?: string;
  omnirouteBaseUrl?: string;
  omnirouteApiKey?: string;
  visionModel?: string;
  copyModel?: string;
  updatedAt?: string;
};

export type AiStatusSummary = {
  ready: boolean;
  isCloudRuntime: boolean;
  activeProvider: string;
  activeProviderLabel: string;
  localOnlyWarning: boolean;
  availableProviders: Array<{ id: string; label: string; source: "account" | "env"; worksRemotely: boolean; isLocalhost: boolean }>;
  savedConfig: {
    provider: AiProviderType;
    hasApiKey: boolean;
    maskedApiKey: string;
    omnirouteBaseUrl: string;
    visionModel: string;
    copyModel: string;
  };
};

type MessagePart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | MessagePart[];
};

type ResolvedCandidate = {
  id: Exclude<AiProviderType, "auto">;
  label: string;
  apiKey: string;
  baseUrl?: string;
  visionModel?: string;
  copyModel?: string;
  source: "account" | "env";
  isLocalhost: boolean;
  worksRemotely: boolean;
};

export function isLocalhostUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url.startsWith("http") ? url : `http://${url}`);
    const host = parsed.hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.endsWith(".local")
    );
  } catch {
    return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(url);
  }
}

export function isServerCloudRuntime(): boolean {
  return Boolean(
    process.env.VERCEL ||
    process.env.VERCEL_ENV ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.NETLIFY ||
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.RENDER ||
    process.env.FLY_APP_NAME
  );
}

export function maskApiKey(key: string | undefined): string {
  const trimmed = key?.trim() || "";
  if (!trimmed) return "";
  if (trimmed.length <= 10) return "••••••••";
  return `${trimmed.slice(0, 6)}••••••${trimmed.slice(-4)}`;
}

export function detectProviderFromApiKey(apiKey: string | undefined): Exclude<AiProviderType, "auto"> | null {
  const trimmed = apiKey?.trim() || "";
  if (!trimmed) return null;
  if (trimmed.startsWith("AIza")) return "gemini";
  if (trimmed.startsWith("sk-or-")) return "openrouter";
  if (trimmed.startsWith("gsk_")) return "groq";
  if (trimmed.startsWith("sk-ant-")) return "anthropic";
  if (trimmed.startsWith("sk-proj-") || /^sk-[A-Za-z0-9]{32,}$/.test(trimmed)) return "openai";
  return null;
}

export function buildChatCompletionsEndpoint(baseUrl: string): string {
  const cleaned = baseUrl.trim().replace(/\/+$/, "");
  if (cleaned.endsWith("/chat/completions")) return cleaned;
  if (cleaned.endsWith("/v1") || cleaned.endsWith("/openai")) return `${cleaned}/chat/completions`;
  return `${cleaned}/v1/chat/completions`;
}

export function mergeRuntimeAiConfig(
  savedConfig: UserAiConfig | null | undefined,
  runtimeConfig: Partial<UserAiConfig> | undefined
): UserAiConfig {
  if (!runtimeConfig) return savedConfig || {};
  return {
    provider: runtimeConfig.provider || savedConfig?.provider || "auto",
    apiKey: (runtimeConfig.apiKey ?? savedConfig?.apiKey ?? "").trim(),
    omnirouteBaseUrl: (runtimeConfig.omnirouteBaseUrl ?? savedConfig?.omnirouteBaseUrl ?? "").trim(),
    visionModel: (runtimeConfig.visionModel ?? savedConfig?.visionModel ?? "").trim(),
    copyModel: (runtimeConfig.copyModel ?? savedConfig?.copyModel ?? "").trim(),
    updatedAt: savedConfig?.updatedAt,
  };
}

export function resolveAiCandidates(userConfig?: UserAiConfig | null): ResolvedCandidate[] {
  const candidates: ResolvedCandidate[] = [];
  const preferred = userConfig?.provider || (process.env.AI_PROVIDER as AiProviderType | undefined) || "auto";

  const addCandidate = (candidate: Omit<ResolvedCandidate, "worksRemotely"> & { worksRemotely?: boolean }) => {
    if (!candidate.apiKey.trim()) return;
    const resolved: ResolvedCandidate = {
      ...candidate,
      worksRemotely: candidate.worksRemotely ?? !candidate.isLocalhost,
    };
    const duplicate = candidates.some(
      (existing) =>
        existing.id === resolved.id &&
        existing.apiKey === resolved.apiKey &&
        (existing.baseUrl || "") === (resolved.baseUrl || "")
    );
    if (!duplicate) candidates.push(resolved);
  };

  // 1. Clé principale configurée dans le compte utilisateur
  const userPrimaryKey = userConfig?.apiKey?.trim() || "";
  const detectedFromUserKey = detectProviderFromApiKey(userPrimaryKey);

  if (userPrimaryKey) {
    const targetProvider: Exclude<AiProviderType, "auto"> =
      preferred !== "auto"
        ? preferred
        : detectedFromUserKey || (userConfig?.omnirouteBaseUrl ? "omniroute" : "gemini");

    if (targetProvider === "gemini") {
      addCandidate({
        id: "gemini",
        label: "Google Gemini Cloud (Compte)",
        apiKey: userPrimaryKey,
        visionModel: userConfig?.visionModel,
        copyModel: userConfig?.copyModel,
        source: "account",
        isLocalhost: false,
      });
    } else if (targetProvider === "openrouter") {
      addCandidate({
        id: "openrouter",
        label: "OpenRouter Cloud (Compte)",
        apiKey: userPrimaryKey,
        baseUrl: "https://openrouter.ai/api/v1",
        visionModel: userConfig?.visionModel,
        copyModel: userConfig?.copyModel,
        source: "account",
        isLocalhost: false,
      });
    } else if (targetProvider === "openai") {
      addCandidate({
        id: "openai",
        label: "OpenAI Cloud (Compte)",
        apiKey: userPrimaryKey,
        baseUrl: "https://api.openai.com/v1",
        visionModel: userConfig?.visionModel,
        copyModel: userConfig?.copyModel,
        source: "account",
        isLocalhost: false,
      });
    } else if (targetProvider === "groq") {
      addCandidate({
        id: "groq",
        label: "Groq Cloud (Compte)",
        apiKey: userPrimaryKey,
        baseUrl: "https://api.groq.com/openai/v1",
        visionModel: userConfig?.visionModel,
        copyModel: userConfig?.copyModel,
        source: "account",
        isLocalhost: false,
      });
    } else if (targetProvider === "anthropic") {
      addCandidate({
        id: "anthropic",
        label: "Anthropic Claude Cloud (Compte)",
        apiKey: userPrimaryKey,
        visionModel: userConfig?.visionModel,
        copyModel: userConfig?.copyModel,
        source: "account",
        isLocalhost: false,
      });
    } else if (targetProvider === "omniroute") {
      const omniUrl = (userConfig?.omnirouteBaseUrl || process.env.OMNIROUTE_BASE_URL || "http://localhost:20128/v1").trim();
      const local = isLocalhostUrl(omniUrl);
      addCandidate({
        id: "omniroute",
        label: local ? "OmniRoute Local (Compte)" : "OmniRoute Distant (Compte)",
        apiKey: userPrimaryKey,
        baseUrl: omniUrl,
        visionModel: userConfig?.visionModel,
        copyModel: userConfig?.copyModel,
        source: "account",
        isLocalhost: local,
      });
    }
  }

  // Clés spécifiques éventuelles dans userConfig
  if (userConfig?.geminiApiKey?.trim()) {
    addCandidate({
      id: "gemini",
      label: "Google Gemini Cloud (Compte)",
      apiKey: userConfig.geminiApiKey.trim(),
      visionModel: userConfig.visionModel,
      copyModel: userConfig.copyModel,
      source: "account",
      isLocalhost: false,
    });
  }
  if (userConfig?.openrouterApiKey?.trim()) {
    addCandidate({
      id: "openrouter",
      label: "OpenRouter Cloud (Compte)",
      apiKey: userConfig.openrouterApiKey.trim(),
      baseUrl: "https://openrouter.ai/api/v1",
      visionModel: userConfig.visionModel,
      copyModel: userConfig.copyModel,
      source: "account",
      isLocalhost: false,
    });
  }
  if (userConfig?.openaiApiKey?.trim()) {
    addCandidate({
      id: "openai",
      label: "OpenAI Cloud (Compte)",
      apiKey: userConfig.openaiApiKey.trim(),
      baseUrl: "https://api.openai.com/v1",
      visionModel: userConfig.visionModel,
      copyModel: userConfig.copyModel,
      source: "account",
      isLocalhost: false,
    });
  }
  if (userConfig?.groqApiKey?.trim()) {
    addCandidate({
      id: "groq",
      label: "Groq Cloud (Compte)",
      apiKey: userConfig.groqApiKey.trim(),
      baseUrl: "https://api.groq.com/openai/v1",
      visionModel: userConfig.visionModel,
      copyModel: userConfig.copyModel,
      source: "account",
      isLocalhost: false,
    });
  }
  if (userConfig?.anthropicApiKey?.trim()) {
    addCandidate({
      id: "anthropic",
      label: "Anthropic Claude Cloud (Compte)",
      apiKey: userConfig.anthropicApiKey.trim(),
      visionModel: userConfig.visionModel,
      copyModel: userConfig.copyModel,
      source: "account",
      isLocalhost: false,
    });
  }
  if (userConfig?.omnirouteApiKey?.trim() || (userConfig?.omnirouteBaseUrl?.trim() && process.env.OMNIROUTE_API_KEY)) {
    const omniUrl = (userConfig?.omnirouteBaseUrl || process.env.OMNIROUTE_BASE_URL || "http://localhost:20128/v1").trim();
    const omniKey = (userConfig?.omnirouteApiKey || process.env.OMNIROUTE_API_KEY || "").trim();
    const local = isLocalhostUrl(omniUrl);
    addCandidate({
      id: "omniroute",
      label: local ? "OmniRoute Local" : "OmniRoute Distant",
      apiKey: omniKey,
      baseUrl: omniUrl,
      visionModel: userConfig?.visionModel,
      copyModel: userConfig?.copyModel,
      source: "account",
      isLocalhost: local,
    });
  }

  // 2. Variables d'environnement serveur (Cloud d'abord si hors local)
  const envGeminiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (envGeminiKey) {
    addCandidate({
      id: "gemini",
      label: "Google Gemini Cloud (Serveur)",
      apiKey: envGeminiKey,
      source: "env",
      isLocalhost: false,
    });
  }

  const envOpenRouterKey = (process.env.OPENROUTER_API_KEY || "").trim();
  if (envOpenRouterKey) {
    addCandidate({
      id: "openrouter",
      label: "OpenRouter Cloud (Serveur)",
      apiKey: envOpenRouterKey,
      baseUrl: "https://openrouter.ai/api/v1",
      source: "env",
      isLocalhost: false,
    });
  }

  const envOpenAiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (envOpenAiKey) {
    addCandidate({
      id: "openai",
      label: "OpenAI Cloud (Serveur)",
      apiKey: envOpenAiKey,
      baseUrl: "https://api.openai.com/v1",
      source: "env",
      isLocalhost: false,
    });
  }

  const envGroqKey = (process.env.GROQ_API_KEY || "").trim();
  if (envGroqKey) {
    addCandidate({
      id: "groq",
      label: "Groq Cloud (Serveur)",
      apiKey: envGroqKey,
      baseUrl: "https://api.groq.com/openai/v1",
      source: "env",
      isLocalhost: false,
    });
  }

  const envAnthropicKey = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (envAnthropicKey) {
    addCandidate({
      id: "anthropic",
      label: "Anthropic Claude Cloud (Serveur)",
      apiKey: envAnthropicKey,
      source: "env",
      isLocalhost: false,
    });
  }

  const envOmniKey = (process.env.OMNIROUTE_API_KEY || "").trim();
  const envOmniUrl = (process.env.OMNIROUTE_BASE_URL || "http://localhost:20128/v1").trim();
  if (envOmniKey) {
    // Si l'utilisateur a mis une clé Gemini/OpenRouter/Groq/Anthropic dans OMNIROUTE_API_KEY avec localhost
    const detectedInOmni = detectProviderFromApiKey(envOmniKey);
    if (detectedInOmni && isLocalhostUrl(envOmniUrl)) {
      addCandidate({
        id: detectedInOmni,
        label: `${detectedInOmni.toUpperCase()} Cloud (via OMNIROUTE_API_KEY)`,
        apiKey: envOmniKey,
        baseUrl:
          detectedInOmni === "openrouter"
            ? "https://openrouter.ai/api/v1"
            : detectedInOmni === "openai"
              ? "https://api.openai.com/v1"
              : detectedInOmni === "groq"
                ? "https://api.groq.com/openai/v1"
                : undefined,
        source: "env",
        isLocalhost: false,
      });
    }
    const local = isLocalhostUrl(envOmniUrl);
    addCandidate({
      id: "omniroute",
      label: local ? "OmniRoute Local (localhost:20128)" : "OmniRoute Distant (Serveur)",
      apiKey: envOmniKey,
      baseUrl: envOmniUrl,
      source: "env",
      isLocalhost: local,
    });
  }

  // Tri intelligent :
  // - Sur un runtime Cloud (Vercel), les candidats non-localhost passent toujours devant et les localhost sont exclus de l'exécution réelle
  // - Si un provider explicite est choisi par l'utilisateur, il passe en premier
  const cloudRuntime = isServerCloudRuntime();
  return candidates.sort((left, right) => {
    if (cloudRuntime && left.isLocalhost !== right.isLocalhost) {
      return left.isLocalhost ? 1 : -1;
    }
    if (preferred !== "auto") {
      if (left.id === preferred && right.id !== preferred) return -1;
      if (right.id === preferred && left.id !== preferred) return 1;
    }
    if (left.source !== right.source) {
      return left.source === "account" ? -1 : 1;
    }
    return 0;
  });
}

export function getAiStatusSummary(userConfig?: UserAiConfig | null, forceCloudRuntime?: boolean): AiStatusSummary {
  const cloudRuntime = forceCloudRuntime ?? isServerCloudRuntime();
  const allCandidates = resolveAiCandidates(userConfig);
  const usableCandidates = cloudRuntime
    ? allCandidates.filter((candidate) => !candidate.isLocalhost)
    : allCandidates;

  const hasOnlyLocalhost = allCandidates.length > 0 && allCandidates.every((candidate) => candidate.isLocalhost);
  const active = usableCandidates[0];
  const rawSavedKey =
    userConfig?.apiKey ||
    userConfig?.geminiApiKey ||
    userConfig?.openrouterApiKey ||
    userConfig?.openaiApiKey ||
    userConfig?.groqApiKey ||
    userConfig?.anthropicApiKey ||
    userConfig?.omnirouteApiKey ||
    "";

  return {
    ready: usableCandidates.length > 0,
    isCloudRuntime: cloudRuntime,
    activeProvider: active?.id || "none",
    activeProviderLabel: active?.label || (hasOnlyLocalhost ? "OmniRoute Local uniquement (inaccessible hors local)" : "Aucun moteur IA configuré"),
    localOnlyWarning: hasOnlyLocalhost,
    availableProviders: allCandidates.map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      source: candidate.source,
      worksRemotely: !candidate.isLocalhost,
      isLocalhost: candidate.isLocalhost,
    })),
    savedConfig: {
      provider: userConfig?.provider || "auto",
      hasApiKey: Boolean(rawSavedKey.trim()),
      maskedApiKey: maskApiKey(rawSavedKey),
      omnirouteBaseUrl: userConfig?.omnirouteBaseUrl || "",
      visionModel: userConfig?.visionModel || "",
      copyModel: userConfig?.copyModel || "",
    },
  };
}

function cleanGeminiModelName(model: string | undefined, defaultModel = "gemini-2.0-flash"): string {
  const raw = (model || "").trim();
  if (!raw || raw.includes("claude") || raw.includes("gpt") || raw.includes("llama")) return defaultModel;
  return raw.replace(/^(?:google|gemini|models)\//i, "") || defaultModel;
}

async function callGeminiNative(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  timeoutMs: number
): Promise<string> {
  const modelsToTry = Array.from(new Set([cleanGeminiModelName(model, "gemini-2.0-flash"), "gemini-1.5-flash", "gemini-2.0-flash-lite"]));
  let lastError: Error | null = null;

  const systemMessages = messages.filter((msg) => msg.role === "system");
  const systemText = systemMessages
    .map((msg) => (typeof msg.content === "string" ? msg.content : msg.content.map((part) => (part.type === "text" ? part.text : "")).join("\n")))
    .filter(Boolean)
    .join("\n\n");

  const userParts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [];
  for (const msg of messages) {
    if (msg.role === "system") continue;
    if (typeof msg.content === "string") {
      userParts.push({ text: msg.content });
      continue;
    }
    for (const part of msg.content) {
      if (part.type === "text") {
        userParts.push({ text: part.text });
      } else if (part.type === "image_url" && part.image_url?.url) {
        const match = part.image_url.url.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (match) {
          userParts.push({
            inline_data: {
              mime_type: match[1],
              data: match[2],
            },
          });
        }
      }
    }
  }

  for (const geminiModel of modelsToTry) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(systemText ? { system_instruction: { parts: [{ text: systemText }] } } : {}),
          contents: [{ role: "user", parts: userParts }],
          generationConfig: {
            temperature: 0.35,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string; status?: string };
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      } | null;

      if (!response.ok) {
        const msg = payload?.error?.message || `Google Gemini API a répondu ${response.status}.`;
        lastError = new Error(msg);
        // Si modèle introuvable (404) ou surchargé (429/503), tente le modèle Gemini suivant
        if (response.status === 404 || response.status === 429 || response.status === 503) {
          continue;
        }
        throw lastError;
      }

      const text = payload?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("\n")
        .trim();

      if (!text) {
        throw new Error("Réponse vide de Google Gemini.");
      }
      return text;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Erreur Google Gemini.");
    }
  }

  throw lastError || new Error("Échec de l'appel Google Gemini API.");
}

async function callAnthropicNative(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  timeoutMs: number
): Promise<string> {
  const systemText = messages
    .filter((msg) => msg.role === "system")
    .map((msg) => (typeof msg.content === "string" ? msg.content : ""))
    .filter(Boolean)
    .join("\n\n");

  const contentBlocks: Array<
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  > = [];

  for (const msg of messages) {
    if (msg.role === "system") continue;
    if (typeof msg.content === "string") {
      contentBlocks.push({ type: "text", text: msg.content });
      continue;
    }
    for (const part of msg.content) {
      if (part.type === "text") {
        contentBlocks.push({ type: "text", text: part.text });
      } else if (part.type === "image_url" && part.image_url?.url) {
        const match = part.image_url.url.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
        if (match) {
          contentBlocks.push({
            type: "image",
            source: {
              type: "base64",
              media_type: match[1],
              data: match[2],
            },
          });
        }
      }
    }
  }

  const resolvedModel =
    model && model.includes("claude") && !model.startsWith("auto/")
      ? model.replace(/^anthropic\//i, "")
      : "claude-sonnet-4-20250514";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: resolvedModel,
      max_tokens: 2048,
      temperature: 0.4,
      ...(systemText ? { system: `${systemText}\n\nIMPORTANT: Réponds uniquement avec un objet JSON valide, sans texte autour.` } : {}),
      messages: [{ role: "user", content: contentBlocks }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    content?: Array<{ type?: string; text?: string }>;
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Anthropic API a répondu ${response.status}.`);
  }

  const text = payload?.content
    ?.map((block) => block.text || "")
    .join("\n")
    .trim();
  if (!text) throw new Error("Réponse vide d'Anthropic Claude.");
  return text;
}

function resolveOpenAiCompatibleModels(
  candidate: ResolvedCandidate,
  task: "vision" | "copy",
  requestedModel: string
): string[] {
  const customModel = task === "vision" ? candidate.visionModel?.trim() : candidate.copyModel?.trim();
  if (customModel) return [customModel];

  if (candidate.id === "openrouter") {
    if (task === "vision") {
      return ["google/gemini-2.5-flash", "google/gemini-2.0-flash-001", "openai/gpt-4o-mini"];
    }
    return ["anthropic/claude-3.5-sonnet", "google/gemini-2.5-flash", "openai/gpt-4o-mini"];
  }

  if (candidate.id === "openai") {
    return ["gpt-4o-mini", "gpt-4o"];
  }

  if (candidate.id === "groq") {
    if (task === "vision") {
      return ["qwen/qwen3.8-27b", "meta-llama/llama-4-scout-17b-16e-instruct"];
    }
    return ["qwen/qwen3.8-27b", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile"];
  }

  return [requestedModel];
}

async function callOpenAiCompatible(
  candidate: ResolvedCandidate,
  task: "vision" | "copy",
  requestedModel: string,
  messages: ChatMessage[],
  timeoutMs: number,
  stage: string
): Promise<string> {
  const endpoint = buildChatCompletionsEndpoint(candidate.baseUrl || "http://localhost:20128/v1");
  const models = resolveOpenAiCompatibleModels(candidate, task, requestedModel);
  let lastError: Error | null = null;

  let outgoingMessages = messages;
  if (candidate.id === "groq" && task === "vision") {
    let imageCount = 0;
    outgoingMessages = messages.map((msg) => {
      if (typeof msg.content === "string") return msg;
      const filteredParts = msg.content.filter((part) => {
        if (part.type === "image_url") {
          imageCount++;
          return imageCount <= 3;
        }
        return true;
      });
      return { ...msg, content: filteredParts };
    });
  }

  for (const model of models) {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${candidate.apiKey}`,
          "Content-Type": "application/json",
          ...(candidate.id === "openrouter"
            ? {
                "HTTP-Referer": "https://vinted-assistant.vercel.app",
                "X-Title": "Vinted COO",
              }
            : {}),
        },
        body: JSON.stringify({
          model,
          messages: outgoingMessages,
          temperature: 0.4,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const reason =
        error instanceof Error && error.name === "TimeoutError"
          ? `La requête a dépassé ${Math.round(timeoutMs / 1000)} secondes.`
          : candidate.isLocalhost
            ? "Le serveur local OmniRoute (localhost:20128) n'est pas joignable."
            : `Impossible de joindre ${endpoint}.`;
      throw new Error(`${candidate.label} n'a pas terminé ${stage}. ${reason}`);
    }

    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
    } | null;

    if (!response.ok) {
      const providerMessage = payload?.error?.message || `${candidate.label} a répondu ${response.status}.`;
      if (/no active credentials/i.test(providerMessage)) {
        lastError = new Error(
          `Aucun accès fournisseur actif dans OmniRoute pour ${model}. Active un compte fournisseur ou configure une clé Cloud (Gemini / OpenRouter) dans "Moteur IA".`
        );
      } else if (/exhausted their quota|quota.*exhaust|insufficient.*credit/i.test(providerMessage)) {
        lastError = new Error(`Quota ou crédits épuisés pour ${model} sur ${candidate.label}.`);
        continue;
      } else {
        lastError = new Error(providerMessage);
      }
      // Sur OpenRouter, si un modèle échoue (ex: pas assez de crédits pour Claude), on tente le suivant (ex: Gemini Flash)
      if (candidate.id === "openrouter" && models.length > 1) {
        continue;
      }
      throw lastError;
    }

    const content = payload?.choices?.[0]?.message?.content;
    const text = Array.isArray(content) ? content.map((part) => part.text || "").join("\n") : content;
    if (!text) {
      lastError = new Error("Réponse IA vide.");
      continue;
    }
    return text;
  }

  throw lastError || new Error(`Échec de ${candidate.label} pour ${stage}.`);
}

export async function executeAiPrompt(options: {
  task: "vision" | "copy";
  defaultModel: string;
  messages: ChatMessage[];
  timeoutMs?: number;
  stage: string;
  userConfig?: UserAiConfig | null;
}): Promise<{ text: string; providerLabel: string; providerId: string }> {
  const cloudRuntime = isServerCloudRuntime();
  const allCandidates = resolveAiCandidates(options.userConfig);
  const usableCandidates = cloudRuntime
    ? allCandidates.filter((candidate) => !candidate.isLocalhost)
    : allCandidates;

  if (!usableCandidates.length) {
    if (allCandidates.some((candidate) => candidate.isLocalhost)) {
      throw new Error(
        "L'application tourne hors local (Cloud/Vercel), mais seul OmniRoute local (localhost:20128) est configuré. Clique sur « Moteur IA » en haut du tableau de bord pour activer une clé Cloud (ex: Google Gemini gratuit, OpenRouter ou OpenAI) ou renseigner une URL publique."
      );
    }
    throw new Error(
      "Aucun moteur IA n'est configuré. Clique sur « Moteur IA » en haut du tableau de bord pour enregistrer ta clé API Cloud (Google Gemini, OpenRouter, OpenAI...) ou configure GEMINI_API_KEY / OPENROUTER_API_KEY sur le serveur."
    );
  }

  const timeoutMs = options.timeoutMs ?? 38_000;
  const errors: string[] = [];

  for (const candidate of usableCandidates) {
    try {
      let text: string;
      if (candidate.id === "gemini") {
        text = await callGeminiNative(
          candidate.apiKey,
          candidate.visionModel || candidate.copyModel || options.defaultModel,
          options.messages,
          timeoutMs
        );
      } else if (candidate.id === "anthropic") {
        text = await callAnthropicNative(
          candidate.apiKey,
          candidate.copyModel || options.defaultModel,
          options.messages,
          timeoutMs
        );
      } else {
        text = await callOpenAiCompatible(
          candidate,
          options.task,
          options.defaultModel,
          options.messages,
          timeoutMs,
          options.stage
        );
      }
      return {
        text,
        providerLabel: candidate.label,
        providerId: candidate.id,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(msg);
    }
  }

  if (
    !cloudRuntime &&
    usableCandidates.length === 1 &&
    usableCandidates[0].isLocalhost
  ) {
    throw new Error(
      `${errors[0]} Astuce : clique sur « Moteur IA » en haut du tableau de bord pour ajouter une clé Cloud (Google Gemini gratuit, OpenRouter ou OpenAI) afin que l'analyse fonctionne même quand OmniRoute local est éteint ou hors local.`
    );
  }

  throw new Error(errors[0] || `L'analyse IA n'a pas pu terminer ${options.stage}.`);
}
