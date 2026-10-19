export type AdCopyInput = Partial<{
  titre_seo: string;
  description: string;
  hashtags: string;
  message_nego: string;
}>;

const FALLBACK_HASHTAGS = [
  "#secondemain",
  "#mode",
  "#vintage",
  "#look",
  "#streetwear",
  "#style",
  "#pull",
  "#boutique",
];

function normalizeText(value: string | undefined, fallback = "") {
  const asText = typeof value === "string" ? value : fallback;
  return asText
    .replace(/```(?:json)?/gi, "")
    .replace(/^(?:titre|title|description|hashtags|message_nego)\s*[: -]\s*/i, "")
    .replace(/\*\*\*+/g, "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n\n")
    .trim();
}

export function sanitizeAdCopy(input: AdCopyInput) {
  const titre = normalizeText(input.titre_seo, "Article Vinted")
    .replace(/[\u202F\u00A0]/g, " ")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const description = normalizeText(input.description, "Vêtement en bon état, à découvrir et à essayer.")
    .replace(/^Description\s*[: -]?\s*/i, "")
    .replace(/\[(?:\s*[^\]]+\s*\|\s*[^\]]+\s*)\]/g, "")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const hashtags = Array.from(new Set(
    (String(input.hashtags ?? "")
      .match(/#\w[\w-]*/g) ?? [])
      .map((tag) => tag.startsWith("#") ? tag : `#${tag}`)
      .map((tag) => tag.toLowerCase())
  )).slice(0, 8);
  const resolvedHashtags = hashtags.length >= 5 ? hashtags : [...hashtags, ...FALLBACK_HASHTAGS].slice(0, 8);
  const message = normalizeText(input.message_nego, "Bonjour, je suis intéressé. Serait-il possible d’ajuster le prix ?")
    .replace(/^(?:message\s*de\s*négociation|message\s*nego)\s*[: -]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    titre_seo: titre || "Article Vinted",
    description: description || "Vêtement en bon état, à découvrir et à essayer.",
    hashtags: resolvedHashtags.join(" ") || FALLBACK_HASHTAGS.slice(0, 8).join(" "),
    message_nego: message || "Bonjour, je suis intéressé. Serait-il possible d’ajuster le prix ?",
  };
}

export function appendSkuToTitle(title: string, sku: string) {
  const suffix = ` | ${sku}`;
  if (title.includes(sku)) return title.slice(0, 100).trimEnd();
  return `${title.slice(0, Math.max(0, 100 - suffix.length)).trimEnd()}${suffix}`;
}

export function ensureManualSizePrompt(description: string) {
  const sizeLine = "• Taille : À renseigner manuellement";
  const sizeLinePattern = /(^|\n)\s*(?:[•*-]\s*)?Taille\s*:[^\n]*/i;
  if (sizeLinePattern.test(description)) {
    return description.replace(sizeLinePattern, `$1${sizeLine}`);
  }
  if (/Détails\s*:/i.test(description)) {
    return description.replace(/Détails\s*:/i, (heading) => `${heading}\n${sizeLine}`);
  }
  return `${sizeLine}\n\n${description}`;
}

export function normalizeRecognizedSize(size: string | undefined) {
  const normalized = size?.trim() ?? "";
  if (!normalized || /^(?:taille\s*)?(?:inconnue?|non\s+(?:visible|lisible|indiquée|renseignée)|à\s+confirmer|n\/?a|unknown)$/i.test(normalized)) {
    return "À renseigner manuellement";
  }
  return normalized;
}
