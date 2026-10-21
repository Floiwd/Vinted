import { randomInt } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { appendSkuToTitle, ensureManualSizePrompt, normalizeRecognizedSize, sanitizeAdCopy } from "@/lib/ad-copy";
import {
  executeAiPrompt,
  getAiStatusSummary,
  mergeRuntimeAiConfig,
  type AiProviderType,
  type UserAiConfig,
} from "@/lib/ai-provider";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { SourcingAnalysis } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

let skuReservationQueue = Promise.resolve();

type PhotoInput = { dataUrl: string; angle: string };
type AiConfigInput = {
  provider?: AiProviderType;
  apiKey?: string;
  omnirouteBaseUrl?: string;
  visionModel?: string;
  copyModel?: string;
  clearApiKey?: boolean;
};
type PipelineInput = {
  action?: string;
  stock?: unknown[];
  skuId?: string;
  fileName?: string;
  dataUrl?: string;
  photos?: PhotoInput[];
  prixAchat?: number | null;
  mode?: "SEMAINE_ACHAT" | "WEEKEND_SHOOTING" | "SOURCING_CAPTURE";
  aiConfig?: AiConfigInput;
};

function dataDirectory(userId: string) {
  return join(process.env.VINTED_DATA_DIR || join(process.cwd(), ".vinted-data"), userId);
}

async function readServerStock(userId: string) {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { data, error } = await getSupabaseAdmin()
      .from("vinted_stock")
      .select("data")
      .like("sku_id", `${userId}:%`)
      .eq("data->>owner_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(`Lecture Supabase impossible : ${error.message}`);
    return (data || []).map((row) => row.data) as unknown[];
  }
  try {
    return JSON.parse(await readFile(join(dataDirectory(userId), "stock.json"), "utf8")) as unknown[];
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeServerStock(stock: unknown[], userId: string) {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const now = new Date().toISOString();
    const rows = stock.map((entry) => {
      const item = entry as Record<string, unknown>;
      if (typeof item.sku_id !== "string" || !/^(?:\d{3,9}|VTD-[A-Z0-9]{4,12})$/i.test(item.sku_id)) {
        throw new Error("SKU de stock invalide.");
      }
      const updatedAt = typeof item.updated_at === "string" ? item.updated_at : now;
      return {
        sku_id: `${userId}:${item.sku_id}`,
        data: { ...item, owner_id: userId, updated_at: updatedAt },
        updated_at: updatedAt,
      };
    });
    if (!rows.length) return;
    const { error } = await getSupabaseAdmin().from("vinted_stock").upsert(rows, { onConflict: "sku_id" });
    if (error) throw new Error(`Écriture Supabase impossible : ${error.message}`);
    return;
  }
  const directory = dataDirectory(userId);
  const filePath = join(directory, "stock.json");
  const temporaryPath = join(directory, `stock-${randomInt(1_000_000_000)}.tmp`);
  await mkdir(directory, { recursive: true });
  await writeFile(temporaryPath, JSON.stringify(stock, null, 2), "utf8");
  await rename(temporaryPath, filePath);
}

async function reserveServerSku(userId: string) {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { data, error } = await getSupabaseAdmin().rpc("reserve_vinted_sku", { p_user_id: userId });
    if (error) throw new Error(`Réservation Supabase impossible : ${error.message}`);
    return String(data).padStart(3, "0");
  }
  let reservedSku = "";
  const reserve = async () => {
    const directory = dataDirectory(userId);
    await mkdir(directory, { recursive: true });
    const stock = await readServerStock(userId);
    const stockMaximum = stock.reduce<number>((maximum, entry) => {
      const sku = (entry as { sku_id?: unknown })?.sku_id;
      return typeof sku === "string" && /^\d{3,9}$/.test(sku) ? Math.max(maximum, Number(sku)) : maximum;
    }, 0);
    let savedMaximum = 0;
    try {
      savedMaximum = Number(await readFile(join(directory, "sku-counter"), "utf8")) || 0;
    } catch {
      savedMaximum = 0;
    }
    const next = Math.max(stockMaximum, savedMaximum) + 1;
    await writeFile(join(directory, "sku-counter"), String(next), "utf8");
    reservedSku = String(next).padStart(3, "0");
  };
  skuReservationQueue = skuReservationQueue.then(reserve, reserve);
  await skuReservationQueue;
  return reservedSku;
}

async function deleteServerStock(skuId: string, userId: string) {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { error } = await getSupabaseAdmin()
      .from("vinted_stock")
      .delete()
      .eq("sku_id", `${userId}:${skuId}`)
      .eq("data->>owner_id", userId);
    if (error) throw new Error(`Suppression Supabase impossible : ${error.message}`);
    return;
  }
  const stock = await readServerStock(userId);
  await writeServerStock(stock.filter((entry) => (entry as { sku_id?: string }).sku_id !== skuId), userId);
}

function json(data: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(data, { status, headers });
}

async function readLocalAiConfig(userId: string): Promise<UserAiConfig | null> {
  try {
    const raw = await readFile(join(dataDirectory(userId), "ai-config.json"), "utf8");
    return JSON.parse(raw) as UserAiConfig;
  } catch {
    return null;
  }
}

async function saveUserAiConfig(
  userId: string,
  currentMetadata: Record<string, unknown>,
  existingConfig: UserAiConfig | null,
  input: AiConfigInput
): Promise<UserAiConfig> {
  const validProviders: AiProviderType[] = ["auto", "gemini", "openrouter", "openai", "groq", "anthropic", "omniroute"];
  const provider: AiProviderType = validProviders.includes(input.provider as AiProviderType)
    ? (input.provider as AiProviderType)
    : existingConfig?.provider || "auto";

  const trimmedNewKey = input.apiKey?.trim() || "";
  const resolvedApiKey = input.clearApiKey ? "" : trimmedNewKey || existingConfig?.apiKey || "";

  const nextConfig: UserAiConfig = {
    provider,
    apiKey: resolvedApiKey,
    omnirouteBaseUrl: (input.omnirouteBaseUrl ?? existingConfig?.omnirouteBaseUrl ?? "").trim().slice(0, 240),
    visionModel: (input.visionModel ?? existingConfig?.visionModel ?? "").trim().slice(0, 120),
    copyModel: (input.copyModel ?? existingConfig?.copyModel ?? "").trim().slice(0, 120),
    updatedAt: new Date().toISOString(),
  };

  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { error } = await getSupabaseAdmin().auth.admin.updateUserById(userId, {
      user_metadata: {
        ...currentMetadata,
        vinted_ai_config: nextConfig,
      },
    });
    if (error) throw new Error(`Sauvegarde Supabase impossible : ${error.message}`);
  }
  try {
    const directory = dataDirectory(userId);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "ai-config.json"), JSON.stringify(nextConfig, null, 2), "utf8");
  } catch {
    // Local directory write fallback
  }
  return nextConfig;
}

async function authenticateRequest(request: Request): Promise<{
  userId?: string;
  userMetadata?: Record<string, unknown>;
  userAiConfig?: UserAiConfig | null;
  status?: number;
}> {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { status: 401 };
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { status: 503 };
  try {
    const { data, error } = await getSupabaseAdmin().auth.getUser(token);
    if (error || !data.user) return { status: 401 };
    const metadata = (data.user.user_metadata || {}) as Record<string, unknown>;
    const metaConfig = metadata.vinted_ai_config as UserAiConfig | undefined;
    const localConfig = metaConfig ? null : await readLocalAiConfig(data.user.id);
    return {
      userId: data.user.id,
      userMetadata: metadata,
      userAiConfig: metaConfig || localConfig || null,
    };
  } catch {
    return { status: 503 };
  }
}

function nextPublicationSlot() {
  const zone = "Europe/Paris";
  const now = new Date();
  const weekdayFormat = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short" });
  const dateFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: zone, day: "2-digit", month: "short" });
  const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const slots = [
    { day: "Fri", hour: 19, minute: 0, label: "vendredi soir" },
    { day: "Sat", hour: 10, minute: 0, label: "samedi matin" },
    { day: "Sun", hour: 12, minute: 30, label: "dimanche midi" },
  ];

  for (let offset = 0; offset <= 7; offset += 1) {
    const date = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const weekday = weekdayFormat.format(date);
    for (const slot of slots) {
      if (weekday !== slot.day) continue;
      const dateLabel = dateFormat.format(date);
      const sameDay = dateLabel === dateFormat.format(now);
      const [currentHour, currentMinute] = timeFormat.format(now).split(":").map(Number);
      if (sameDay && (currentHour > slot.hour || (currentHour === slot.hour && currentMinute >= slot.minute))) continue;
      return `${slot.label} · ${dateLabel} à ${String(slot.hour).padStart(2, "0")}h${String(slot.minute).padStart(2, "0")} (Paris)`;
    }
  }
  return "Prochain créneau vendredi soir";
}

async function vintedMarketSnapshot(item: { marque: string; modele: string; categorie: string; taille: string; etat?: string }) {
  const searchTerms = [item.marque, item.modele, item.categorie, item.taille]
    .filter((value) => Boolean(value) && !/^à renseigner/i.test(value))
    .join(" ");
  const fallback = { average: null, min: null, max: null, samples: [], count: 0, observed_at: new Date().toISOString(), source: "fallback" };
  if (!searchTerms.trim()) return fallback;

  const endpoint = `https://www.vinted.fr/api/v2/catalog/items?search_text=${encodeURIComponent(searchTerms)}&currency=EUR&status[]=active&per_page=8`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9",
        Accept: "application/json, text/plain, */*",
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) return fallback;
    const data = (await response.json()) as {
      items?: Array<{ price?: { amount?: number; currency?: string }; title?: string; brand_title?: string; size?: string }>;
    };
    const prices = (data.items || [])
      .map((entry) => Number(entry?.price?.amount))
      .filter((value) => Number.isFinite(value) && value > 0)
      .slice(0, 8);

    if (!prices.length) return fallback;

    const avg = prices.reduce((sum, value) => sum + value, 0) / prices.length;
    return {
      average: Number(avg.toFixed(2)),
      min: Number(Math.min(...prices).toFixed(2)),
      max: Number(Math.max(...prices).toFixed(2)),
      samples: prices.slice(0, 5),
      count: prices.length,
      observed_at: new Date().toISOString(),
      source: "vinted-live",
    };
  } catch {
    return fallback;
  }
}

function parseJson<T>(text: string): T {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("La réponse IA n'est pas au format JSON attendu.");
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.userId) {
    const status = auth.status || 401;
    return json({ success: false, error: status === 503 ? "Supabase Auth n'est pas configuré côté serveur." : "Session Supabase invalide." }, status);
  }
  const userId = auth.userId;
  const url = new URL(request.url);

  if (url.searchParams.get("resource") === "stock") {
    try {
      return json({
        success: true,
        stock: await readServerStock(userId),
        aiStatus: getAiStatusSummary(auth.userAiConfig),
      });
    } catch {
      return json({ success: false, error: "Lecture du stock central impossible." }, 500);
    }
  }

  if (url.searchParams.get("resource") === "ai-status") {
    return json({ success: true, aiStatus: getAiStatusSummary(auth.userAiConfig) });
  }

  const receiptSku = url.searchParams.get("receipt");
  if (receiptSku) {
    if (!/^(?:\d{3,6}|VTD-[A-Z0-9]{4,12})$/i.test(receiptSku)) return json({ success: false, error: "Référence invalide." }, 400);
    const extension = url.searchParams.get("ext");
    const contentTypes: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
    if (!extension || !contentTypes[extension]) return json({ success: false, error: "Format de reçu invalide." }, 400);
    try {
      let receiptBytes: Uint8Array;
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const { data, error } = await getSupabaseAdmin().storage.from("purchase-receipts").download(`${userId}/${receiptSku}.${extension}`);
        if (error || !data) throw new Error("Reçu Supabase introuvable.");
        receiptBytes = new Uint8Array(await data.arrayBuffer());
      } else {
        receiptBytes = new Uint8Array(await readFile(join(dataDirectory(userId), "receipts", `${receiptSku}.${extension}`)));
      }
      const receiptBuffer = receiptBytes.buffer.slice(receiptBytes.byteOffset, receiptBytes.byteOffset + receiptBytes.byteLength) as ArrayBuffer;
      return new Response(receiptBuffer, {
        headers: {
          "Content-Type": contentTypes[extension],
          "Content-Disposition": "inline",
          "Cache-Control": "private, no-store",
        },
      });
    } catch {
      return json({ success: false, error: "Reçu introuvable." }, 404);
    }
  }

  return json({ success: true, userId, aiStatus: getAiStatusSummary(auth.userAiConfig) });
}

export async function POST(request: Request) {
  let input: PipelineInput;
  try {
    input = (await request.json()) as PipelineInput;
  } catch {
    return json({ success: false, error: "Requête JSON invalide." }, 400);
  }

  const auth = await authenticateRequest(request);
  if (!auth.userId) {
    const status = auth.status || 401;
    return json({ success: false, error: status === 503 ? "Supabase Auth n'est pas configuré côté serveur." : "Session Supabase invalide." }, status);
  }
  const userId = auth.userId;

  if (input.action === "reserve-sku") {
    try {
      return json({ success: true, skuId: await reserveServerSku(userId) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur Supabase inconnue.";
      return json({ success: false, error: `Réservation du SKU impossible : ${message}` }, 500);
    }
  }

  if (input.action === "sync-stock") {
    if (!Array.isArray(input.stock) || input.stock.length > 5000) return json({ success: false, error: "Format de stock invalide." }, 400);
    const validItems = input.stock.every((item) => item && typeof item === "object" && typeof (item as { sku_id?: unknown }).sku_id === "string");
    if (!validItems || JSON.stringify(input.stock).length > 5_000_000) return json({ success: false, error: "Stock invalide ou trop volumineux." }, 400);
    try {
      await writeServerStock(input.stock, userId);
      return json({ success: true, count: input.stock.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur Supabase inconnue.";
      return json({ success: false, error: `Écriture du stock central impossible : ${message}` }, 500);
    }
  }

  if (input.action === "delete-stock") {
    if (!/^(?:\d{3,9}|VTD-[A-Z0-9]{4,12})$/i.test(input.skuId || "")) return json({ success: false, error: "SKU invalide." }, 400);
    try {
      await deleteServerStock(input.skuId!, userId);
      return json({ success: true });
    } catch {
      return json({ success: false, error: "Suppression de l'article impossible." }, 500);
    }
  }

  if (input.action === "save-ai-config") {
    try {
      const updatedConfig = await saveUserAiConfig(
        userId,
        auth.userMetadata || {},
        auth.userAiConfig || null,
        input.aiConfig || {}
      );
      return json({
        success: true,
        aiStatus: getAiStatusSummary(updatedConfig),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur de sauvegarde de la configuration IA.";
      return json({ success: false, error: message }, 500);
    }
  }

  if (input.action === "test-ai-config") {
    try {
      const effectiveConfig = mergeRuntimeAiConfig(auth.userAiConfig || null, input.aiConfig);
      const testResult = await executeAiPrompt({
        task: "copy",
        defaultModel: process.env.GEMINI_MODEL || "gemini-2.0-flash",
        messages: [
          { role: "system", content: "Réponds strictement par l'objet JSON suivant : {\"ok\": true}" },
          { role: "user", content: "Test de connexion IA Vinted COO." },
        ],
        timeoutMs: 18_000,
        stage: "le test de connexion IA",
        userConfig: effectiveConfig,
      });
      return json({
        success: true,
        providerLabel: testResult.providerLabel,
        providerId: testResult.providerId,
        aiStatus: getAiStatusSummary(effectiveConfig),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Test de connexion IA échoué.";
      return json({ success: false, error: message }, 400);
    }
  }

  if (input.action === "save-receipt") {
    if (!/^(?:\d{3,9}|VTD-[A-Z0-9]{4,12})$/i.test(input.skuId || "")) return json({ success: false, error: "SKU invalide." }, 400);
    const skuId = input.skuId!;
    const match = input.dataUrl?.match(/^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match || match[2].length > 12_000_000) return json({ success: false, error: "Format invalide ou fichier supérieur à 8 Mo." }, 400);
    const extension = match[1] === "application/pdf" ? "pdf" : match[1].split("/")[1] === "jpeg" ? "jpg" : match[1].split("/")[1];
    const filename = `${userId}/${skuId}.${extension}`;
    try {
      const receiptBytes = Buffer.from(match[2], "base64");
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const { error } = await getSupabaseAdmin().storage.from("purchase-receipts").upload(filename, receiptBytes, { contentType: match[1], upsert: true });
        if (error) throw new Error(`Enregistrement Supabase impossible : ${error.message}`);
      } else {
        const directory = join(dataDirectory(userId), "receipts");
        await mkdir(directory, { recursive: true });
        await writeFile(join(directory, filename), receiptBytes);
      }
      return json({ success: true, receipt_name: String(input.fileName || filename).slice(0, 120), receipt_url: `/api/vinted-pipeline?receipt=${encodeURIComponent(skuId)}&ext=${extension}` });
    } catch {
      return json({ success: false, error: "Enregistrement du reçu impossible." }, 500);
    }
  }

  const photos = input.photos;
  if (!Array.isArray(photos) || photos.length < 1 || photos.length > 12) {
    return json({ success: false, error: "Ajoutez entre 1 et 12 photos de l'article." }, 400);
  }
  const totalBytes = photos.reduce((total, photo) => total + (photo?.dataUrl?.length ?? 0), 0);
  if (totalBytes > 26_000_000 || photos.some((photo) => !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo.dataUrl))) {
    return json({ success: false, error: "Images invalides ou trop volumineuses (26 Mo maximum au total)." }, 400);
  }
  if (input.prixAchat != null && (!Number.isFinite(input.prixAchat) || input.prixAchat < 0)) {
    return json({ success: false, error: "Le prix d'achat doit être un montant positif." }, 400);
  }

  try {
    const runtimeAiConfig = mergeRuntimeAiConfig(auth.userAiConfig || null, input.aiConfig);
    const isSourcingMode = input.mode === "SOURCING_CAPTURE";

    const visionSystemPrompt = isSourcingMode
      ? "Tu es un expert d'arbitrage et de sourcing pour revendeurs Vinted. L'utilisateur te fournit une ou plusieurs captures d'écran d'une annonce en ligne (Vinted, Leboncoin, Depop, etc.) qu'il envisage d'acheter pour revendre avec bénéfice.\n" +
        "MISSION D'ARBITRAGE :\n" +
        "1) Détecte le prix affiché par le vendeur sur la capture (en euros). Renseigne 'prix_affiche_vendeur_eur' avec le montant exact (ex: 15).\n" +
        "2) Identifie précisément la marque, le modèle, la catégorie, la taille et l'état mentionné par le vendeur.\n" +
        "3) Évalue la COTE RÉELLE DE REVENTE sur Vinted : quel est le prix auquel cette pièce partira en moins de 7 jours ('prix_vente_rapide_estime_eur') et quel est le prix médian du marché ('prix_marche_median_eur') ? Sois strict et réaliste, ne gonfle jamais la cote.\n" +
        "4) Détecte les défauts ou usures visibles sur les photos du vendeur ou décrits dans l'annonce (renseigne 'defauts_observes').\n" +
        "5) Donne 2 à 3 points forts (ex: marque très recherchée, coupe tendance, bon état) et 2 à 3 points de vigilance (ex: photos floues, contrefaçons fréquentes, usure masquée).\n" +
        "Réponds en JSON strict avec les clés : marque, modele, categorie, taille, etat, defauts_observes (tableau), caracteristiques (tableau), authenticite (objet niveau et indices), prix_affiche_vendeur_eur (nombre ou null), prix_vente_rapide_estime_eur (nombre), prix_marche_median_eur (nombre), points_forts (tableau de chaînes), points_vigilance (tableau de chaînes), confiance (nombre 0-1)."
      : "Tu es un expert d'inventaire textile et d'arbitrage de marché d'occasion sur Vinted. Analyse chaque photo sans jamais certifier une authenticité à partir d'images seules. Signale les indices observables et les incertitudes. RÈGLES CRUCIALES :\n1) Pour la taille, lis uniquement une étiquette lisible; ne la déduis jamais de la coupe. Si aucune taille lisible n'apparaît, renvoie exactement 'À renseigner manuellement'.\n2) Lis les mesures uniquement si un mètre ruban est visible et ses graduations sont lisibles; sinon renvoie mesures null.\n3) Repère TOUS les défauts, micro-défauts et traces d'usure observables (taches, accroc, bouloches, frottement col/bas de pantalon, délavage, coutures fatiguées). Renvoie un tableau 'defauts_observes' avec descriptions précises (ex: 'Légères bouloches sur les poches', ou 'Aucun défaut visible, tissu impeccable').\n4) Pour l'analyse de marché : estime la valeur réelle et réaliste de revente sur Vinted (prix_vente_rapide_estime_eur pour vendre sous 7 jours sans brader, et prix_marche_median_eur pour le prix médian moyen).\nRéponds en JSON strict avec les clés : marque, modele, categorie, taille, etat, defauts_observes (tableau), caracteristiques (tableau), mesures (objet ou null), authenticite (objet niveau parmi faible/moyen/élevé et indices tableau), prix_achat_cible_eur (nombre), prix_vente_rapide_estime_eur (nombre), prix_marche_median_eur (nombre), points_forts (tableau), points_vigilance (tableau), confiance (nombre 0-1).";

    const visionUserPrompt = isSourcingMode
      ? `Analyse cette capture d'écran d'annonce pour un arbitrage d'achat-revente. ${input.prixAchat != null ? `Prix d'achat renseigné: ${input.prixAchat} EUR.` : "Extrais le prix affiché par le vendeur sur la capture."}`
      : `Analyse l'article sur ces ${photos.length} planches/photos. ${photos.map((photo) => photo.angle).join("; ")}. ${input.prixAchat == null ? "Estime aussi un prix d'achat cible prudent et les prix de marché réels Vinted." : `Prix d'achat réel payé: ${input.prixAchat} EUR.`}`;

    const visionResult = await executeAiPrompt({
      task: "vision",
      defaultModel: process.env.GEMINI_MODEL || "gemini-2.0-flash",
      messages: [
        {
          role: "system",
          content: visionSystemPrompt,
        },
        {
          role: "user",
          content: [
            { type: "text" as const, text: visionUserPrompt },
            ...photos.flatMap((photo) => [
              { type: "text" as const, text: `Angle: ${photo.angle}` },
              { type: "image_url" as const, image_url: { url: photo.dataUrl } },
            ]),
          ],
        },
      ],
      timeoutMs: 32_000,
      stage: "l'analyse des photos",
      userConfig: runtimeAiConfig,
    });

    const vision = parseJson<{
      marque?: string;
      modele?: string;
      categorie?: string;
      taille?: string;
      etat?: string;
      defauts_observes?: string[];
      caracteristiques?: string[];
      mesures?: Record<string, string | number> | null;
      authenticite?: { niveau?: string; indices?: string[] };
      prix_affiche_vendeur_eur?: number;
      prix_achat_cible_eur?: number;
      prix_vente_rapide_estime_eur?: number;
      prix_marche_median_eur?: number;
      points_forts?: string[];
      points_vigilance?: string[];
      confiance?: number;
    }>(visionResult.text);

    const detectedVendorPrice = Number(vision.prix_affiche_vendeur_eur) || Number(vision.prix_achat_cible_eur) || 12;
    const purchasePrice = (input.prixAchat ?? detectedVendorPrice) || 12;
    const estimatedFees = Number((2.90 + (purchasePrice * 0.05 + 0.70)).toFixed(2));
    const ctaTtc = Number((purchasePrice + estimatedFees).toFixed(2));
    const targetX2 = Math.round(ctaTtc * 2);

    const item = {
      marque: vision.marque || "Marque à identifier",
      modele: vision.modele || "Modèle à préciser",
      categorie: vision.categorie || "Vêtement",
      taille: normalizeRecognizedSize(vision.taille),
      etat: vision.etat || "Bon état",
      defauts_observes: Array.isArray(vision.defauts_observes) && vision.defauts_observes.length
        ? vision.defauts_observes
        : ["Aucun défaut majeur visible sur les photos"],
      caracteristiques: Array.isArray(vision.caracteristiques) ? vision.caracteristiques : [],
      mesures: vision.mesures || null,
      authenticite: vision.authenticite || { niveau: "moyen", indices: ["Vérification visuelle conforme"] },
      confiance: Math.min(1, Math.max(0, Number(vision.confiance) || 0)),
    };
    const market = await vintedMarketSnapshot(item);

    // Calcul réaliste et lucide du prix de marché Vinted (Fast Liquidity Pricing)
    const rawFastPrice = Number(vision.prix_vente_rapide_estime_eur) || market.average || Math.round(purchasePrice * 1.7);
    const rawMedianPrice = Number(vision.prix_marche_median_eur) || Math.round(rawFastPrice * 1.25);
    const marketFastSell = Math.max(5, Math.round(rawFastPrice));
    const marketMedian = Math.max(marketFastSell, Math.round(rawMedianPrice));

    // Détermination lucide du verdict d'achat sourcing
    let verdictType: "EXCELLENT_SOURCING" | "ACHAT_CORRECT" | "ACHAT_TROP_CHER";
    let verdictLabel: string;
    let verdictAnalysis: string;
    let velocite: "TRES_RAPIDE" | "NORMALE" | "LENTE";
    let velociteLabel: string;

    const ratioMarge = marketFastSell / Math.max(1, purchasePrice);
    if (ratioMarge >= 2.2) {
      verdictType = "EXCELLENT_SOURCING";
      verdictLabel = "🔥 Pépite sourcing (x2+ facile)";
      velocite = "TRES_RAPIDE";
      velociteLabel = "Vente très rapide (< 5 jours)";
      verdictAnalysis = `Prix d'achat exceptionnel (${purchasePrice} €). La cote médiane sur Vinted est de ${marketMedian} €. En vendant à ${marketFastSell} €, vous réalisez plus d'un x2 net avec une liquidation éclair.`;
    } else if (ratioMarge >= 1.5) {
      verdictType = "ACHAT_CORRECT";
      verdictLabel = "✅ Achat équilibré (Bonne marge)";
      velocite = "NORMALE";
      velociteLabel = "Vente normale (7 à 14 jours)";
      verdictAnalysis = `Achat cohérent à ${purchasePrice} €. Le prix idéal pour une rotation fluide sous 7 à 10 jours est de ${marketFastSell} € (cote médiane à ${marketMedian} €). Marge nette saine.`;
    } else {
      verdictType = "ACHAT_TROP_CHER";
      verdictLabel = "⚠️ Acheté trop cher pour viser x2";
      velocite = "LENTE";
      velociteLabel = "Attention : Vente lente si surévalué";
      verdictAnalysis = `Acheté ${purchasePrice} €, viser un x2 systématique (${targetX2} €) est au-dessus de la valeur réelle sur Vinted (${marketFastSell} € - ${marketMedian} €) et risque de bloquer la pièce des semaines. Pour liquider rapidement avec un bénéfice réaliste, vendez à ${marketFastSell} €.`;
    }

    const displayedPrice = Math.round(marketFastSell * 1.18); // +18% de marge de négo
    const counterOfferPrice = marketFastSell; // contre-offre idéale
    const floorPrice = Math.max(Math.round(purchasePrice * 1.15 + 1), Math.round(marketFastSell * 0.85)); // plancher de sécurité

    const marketVerdict = {
      verdict: verdictType,
      verdict_label: verdictLabel,
      analyse: verdictAnalysis,
      prix_vente_rapide: marketFastSell,
      prix_marche_moyen: marketMedian,
      prix_affiche_recommande: displayedPrice,
      prix_plancher: floorPrice,
      contre_offre: counterOfferPrice,
      velocite,
      velocite_label: velociteLabel,
      conseil_rotation: `Affichez à ${displayedPrice} € avec marge de négociation. Acceptez toute offre à partir de ${marketFastSell} €. Ne descendez pas en dessous de ${floorPrice} €.`,
    };

    const copySystemPrompt = isSourcingMode
      ? "Tu es un arbitre expert en achat-revente Vinted. Tu rédiges un avis franc, direct et sans concession sur une annonce repérée en ligne, ainsi qu'un message d'offre pour le vendeur et l'annonce de revente future.\n" +
        "Réponds en JSON strict avec les clés :\n" +
        "- avis_sincere : analyse cash de l'article (attractivité sur Vinted, justesse du prix affiché, si c'est une pépite ou un piège).\n" +
        "- message_offre : phrase de négociation courtoise et très efficace pour faire accepter l'offre proposée au vendeur Vinted sans le braquer.\n" +
        "- titre_court, titre_seo, description, defauts_transparence, hashtags, message_nego (pour l'annonce de revente future)."
      : "Tu es un rédacteur d'élite pour vendeurs Vinted. Tu rédiges des annonces percutantes, honnêtes, vendeuses et ultra-optimisées pour l'algorithme de recherche Vinted. Réponds en JSON strict avec les clés : titre_court, titre_seo, description, defauts_transparence, hashtags, message_nego.\nRÈGLES :\n1) titre_court : court, percutant et direct (ex: 'Jean Levi's 501 Bleu W32 L34').\n2) titre_seo : enrichi avec les mots-clés les plus cherchés sur Vinted (marque, coupe, matière, couleur, époque/style comme Vintage, Y2K, Streetwear, Oversize).\n3) description : annonce structurée premium en français : '📝 Titre', '📏 Détails & Taille', '✨ État & Authenticité', '🛡️ Transparence (mentionne clairement les défauts observés pour éviter tout litige acheteur)', '💡 Conseil look / Pourquoi l'acheter'.\n4) defauts_transparence : 1 à 2 phrases claires et rassurantes décrivant l'état réel pour sécuriser la transaction.\n5) hashtags : 10 à 15 hashtags #... ultra-ciblés, sans spam, correspondant exactement à la pièce.\n6) message_nego : phrase courtoise et ferme à envoyer à un acheteur qui fait une offre trop basse.";

    const copyResult = await executeAiPrompt({
      task: "copy",
      defaultModel: process.env.CLAUDE_MODEL || "auto/claude-sonnet",
      messages: [
        {
          role: "system",
          content: copySystemPrompt,
        },
        {
          role: "user",
          content: JSON.stringify({
            article: item,
            prixAchat: purchasePrice,
            prixVenteRapide: marketFastSell,
            prixAffiche: displayedPrice,
            defautsObserves: item.defauts_observes,
            mode: input.mode || "SEMAINE_ACHAT",
            marketVerdict,
          }),
        },
      ],
      timeoutMs: 24_000,
      stage: "la rédaction de l'annonce",
      userConfig: runtimeAiConfig,
    });

    const rawCopy = parseJson<{
      titre_court?: string;
      titre_seo?: string;
      description?: string;
      defauts_transparence?: string;
      hashtags?: string;
      message_nego?: string;
      avis_sincere?: string;
      message_offre?: string;
    }>(copyResult.text);

    const copy = sanitizeAdCopy(rawCopy);
    const skuId = /^\d{3,6}$/.test(input.skuId || "") ? input.skuId! : String(randomInt(1, 1_000_000)).padStart(3, "0");
    const missingSize = item.taille === "À renseigner manuellement";
    const titleSeo = missingSize && !/taille à renseigner/i.test(copy.titre_seo)
      ? `${copy.titre_seo} Taille à renseigner`
      : copy.titre_seo;
    const titleCourt = rawCopy.titre_court || `${item.marque} ${item.modele} ${item.taille}`;
    const description = missingSize ? ensureManualSizePrompt(copy.description) : copy.description;
    const pricing = {
      prix_affiche: displayedPrice,
      prix_revente: marketFastSell,
    };

    const netProfit = Math.round(marketFastSell - ctaTtc);
    const estimatedRoi = Math.round((netProfit / Math.max(1, ctaTtc)) * 100);
    const targetBuyForX2 = Math.max(1, Math.round((marketFastSell / 2) - estimatedFees));
    const suggestedOffer = Math.min(purchasePrice, targetBuyForX2);

    let sourcingVerdict: "FONCE" | "NEGOCIE" | "SKIP";
    let sourcingBadge: string;
    let sourcingTitle: string;
    let saleDelay: string;

    if (netProfit >= 16 && estimatedRoi >= 70) {
      sourcingVerdict = "FONCE";
      sourcingBadge = "🔥 FONCE ! (PÉPITE SOUS-COTÉE)";
      sourcingTitle = "Opportunité en or — Revente rapide avec marge x2+";
      saleDelay = "Vente très rapide (< 5 jours)";
    } else if (netProfit >= 6 && estimatedRoi >= 25) {
      sourcingVerdict = "NEGOCIE";
      sourcingBadge = "🤝 NÉGOCIE (TROP CHER POUR X2 DIRECT)";
      sourcingTitle = `Rentable avec une offre à ${suggestedOffer} €`;
      saleDelay = "Vente normale (7 à 14 jours)";
    } else {
      sourcingVerdict = "SKIP";
      sourcingBadge = "🛑 PASSE TON TOUR / TROP CHER";
      sourcingTitle = "Achat déconseillé — Marge insuffisante ou risque de perte";
      saleDelay = "Rotation lente / Risque de capital bloqué";
    }

    const sourcingAnalysis: SourcingAnalysis = {
      verdict: sourcingVerdict,
      badge: sourcingBadge,
      titre: sourcingTitle,
      avis_sincere: rawCopy.avis_sincere || (sourcingVerdict === "FONCE"
        ? `Excellente affaire détectée. Le vendeur affiche ${purchasePrice} €, ce qui est nettement sous la cote réelle Vinted de ${marketFastSell} €. Revente rapide garantie.`
        : sourcingVerdict === "NEGOCIE"
        ? `Le prix vendeur de ${purchasePrice} € est un peu trop élevé pour viser un x2 net après frais (${ctaTtc} € engagés). Proposez une offre ferme à ${suggestedOffer} € pour sécuriser votre marge.`
        : `Annonce à éviter. Le vendeur vend ${purchasePrice} €, mais la cote réelle Vinted ne dépasse pas ${marketFastSell} €. Après frais de port et protection, le bénéfice est quasi nul (${netProfit} €) pour un risque élevé d'invendu.`),
      prix_affiche_vendeur: purchasePrice,
      frais_estimes: estimatedFees,
      cout_total_achat: ctaTtc,
      prix_revente_rapide: marketFastSell,
      prix_revente_optimiste: marketMedian,
      benefice_net_estime: netProfit,
      roi_estime_pourcent: estimatedRoi,
      delai_vente_estime: saleDelay,
      offre_suggeree: suggestedOffer,
      message_offre: rawCopy.message_offre || `Bonjour ! Votre article m'intéresse beaucoup. Seriez-vous d'accord pour ${suggestedOffer} € ? Je prends immédiatement si c'est bon pour vous ! Merci à vous 😊`,
      points_forts: Array.isArray(vision.points_forts) && vision.points_forts.length ? vision.points_forts : ["Marque recherchée sur Vinted", "Bonne visibilité algorithmique"],
      points_vigilance: Array.isArray(vision.points_vigilance) && vision.points_vigilance.length ? vision.points_vigilance : ["Vérifier l'état et l'authenticité à réception"],
    };

    const data = {
      SKU_ID: skuId,
      sku_id: skuId,
      ...item,
      prix_achat: purchasePrice,
      cta_ttc: ctaTtc,
      prix_min_x2: targetX2,
      prix_affiche: pricing.prix_affiche,
      prix_revente: pricing.prix_revente,
      marge_negociation_pct: 18,
      creneau_publi: nextPublicationSlot(),
      created_at: new Date().toISOString(),
      statut: "A_COMPLETER",
      checklist: { size: false, condition: false, material: false, photos: false, authenticity: false },
      titre_court: appendSkuToTitle(titleCourt, skuId),
      titre_seo: appendSkuToTitle(titleSeo || `${item.marque} ${item.modele} ${item.categorie} ${item.taille}`, skuId),
      description: description || "Vêtement en bon état, à découvrir et à essayer.",
      market,
      market_verdict: marketVerdict,
      sourcing_analysis: isSourcingMode ? sourcingAnalysis : undefined,
      defauts_transparence: rawCopy.defauts_transparence || "Article en bon état général conforme aux photos.",
      hashtags: copy.hashtags || "#secondemain #mode #vintage #look #streetwear #style #pull #boutique",
      message_nego: input.mode === "WEEKEND_SHOOTING" ? "" : copy.message_nego || "",
      sync_sheet: false,
      ai_provider: copyResult.providerLabel || visionResult.providerLabel,
    };

    const webhook = process.env.STOCK_PIPELINE;
    if (webhook) {
      try {
        const syncResponse = await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          signal: AbortSignal.timeout(12_000),
        });
        data.sync_sheet = syncResponse.ok;
      } catch {
        data.sync_sheet = false;
      }
    }
    return json({
      success: true,
      data,
      warning: webhook && !data.sync_sheet ? "Article généré, mais la synchronisation Google Sheets a échoué." : undefined,
      ai: {
        visionProvider: visionResult.providerLabel,
        visionProviderId: visionResult.providerId,
        copyProvider: copyResult.providerLabel,
        copyProviderId: copyResult.providerId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue du pipeline.";
    return json({ success: false, error: message }, 502);
  }
}
