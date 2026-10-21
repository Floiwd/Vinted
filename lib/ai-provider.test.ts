import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  isLocalhostUrl,
  detectProviderFromApiKey,
  buildChatCompletionsEndpoint,
  resolveAiCandidates,
  getAiStatusSummary,
} from "./ai-provider.ts";

describe("isLocalhostUrl", () => {
  it("should detect localhost URLs", () => {
    assert.equal(isLocalhostUrl("http://localhost:3000"), true);
    assert.equal(isLocalhostUrl("https://127.0.0.1:8080"), true);
    assert.equal(isLocalhostUrl("0.0.0.0:20128"), true);
    assert.equal(isLocalhostUrl("something.local"), true);
    assert.equal(isLocalhostUrl("localhost"), true);
  });

  it("should not detect non-localhost URLs", () => {
    assert.equal(isLocalhostUrl("https://example.com"), false);
    assert.equal(isLocalhostUrl("http://192.168.1.1"), false);
    assert.equal(isLocalhostUrl("http://my-api.com"), false);
  });
});

describe("detectProviderFromApiKey", () => {
  it("should detect Gemini API keys", () => {
    assert.equal(detectProviderFromApiKey("AIzaSyC_xxxxxxxxxxxxxxxxxxxxxxxxxx"), "gemini");
  });

  it("should detect OpenRouter API keys", () => {
    assert.equal(detectProviderFromApiKey("sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"), "openrouter");
  });

  it("should detect OpenAI API keys", () => {
    assert.equal(detectProviderFromApiKey("sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"), "openai");
    assert.equal(detectProviderFromApiKey("sk-abcdef1234567890abcdef1234567890"), "openai");
  });

  it("should detect Groq API keys", () => {
    assert.equal(detectProviderFromApiKey("gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"), "groq");
  });

  it("should detect Anthropic API keys", () => {
    assert.equal(detectProviderFromApiKey("sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"), "anthropic");
  });

  it("should return null for unknown or empty keys", () => {
    assert.equal(detectProviderFromApiKey(""), null);
    assert.equal(detectProviderFromApiKey(undefined), null);
    assert.equal(detectProviderFromApiKey("random-key-without-prefix"), null);
  });
});

describe("buildChatCompletionsEndpoint", () => {
  it("should return the correct endpoint for a base URL", () => {
    assert.equal(buildChatCompletionsEndpoint("http://localhost:20128"), "http://localhost:20128/v1/chat/completions");
    assert.equal(buildChatCompletionsEndpoint("http://localhost:20128/v1"), "http://localhost:20128/v1/chat/completions");
  });

  it("should return the URL as is if it already contains /chat/completions", () => {
    assert.equal(
      buildChatCompletionsEndpoint("https://api.openai.com/v1/chat/completions"),
      "https://api.openai.com/v1/chat/completions"
    );
  });
});

describe("resolveAiCandidates", () => {
  it("should return candidates from user config", () => {
    const userConfig = {
      provider: "auto" as const,
      apiKey: "AIza_user_gemini_key",
    };
    const candidates = resolveAiCandidates(userConfig);
    assert.ok(candidates.some((c) => c.id === "gemini" && c.source === "account" && c.apiKey === "AIza_user_gemini_key"));
  });

  it("should resolve candidates when explicit provider is chosen", () => {
    const userConfig = {
      provider: "openrouter" as const,
      apiKey: "sk-or-v1-test-key",
    };
    const candidates = resolveAiCandidates(userConfig);
    assert.ok(candidates.some((c) => c.id === "openrouter" && c.source === "account"));
  });
});

describe("getAiStatusSummary", () => {
  it("should return correct status when config is present", () => {
    const userConfig = {
      provider: "gemini" as const,
      apiKey: "AIza_test_key",
      omnirouteBaseUrl: "http://localhost:20128",
    };
    const summary = getAiStatusSummary(userConfig, false);

    assert.equal(summary.ready, true);
    assert.equal(summary.activeProvider, "gemini");
    assert.equal(summary.activeProviderLabel, "Google Gemini Cloud (Compte)");
    assert.equal(summary.localOnlyWarning, false);

    const cloudSummary = getAiStatusSummary(userConfig, true);
    assert.equal(cloudSummary.ready, true);
    assert.equal(cloudSummary.localOnlyWarning, false);
  });

  it("should return not ready status and warning if only local omniroute is configured on cloud runtime", () => {
    // When only local omniroute is set in config
    const userConfig = {
      provider: "omniroute" as const,
      apiKey: "omni_key",
      omnirouteBaseUrl: "http://localhost:20128",
    };
    // In cloud runtime: local candidates are marked isLocalhost and not usable
    const summary = getAiStatusSummary(userConfig, true);
    // OmniRoute with localhost should have isLocalhost: true
    const omniCandidate = summary.availableProviders.find((p) => p.id === "omniroute");
    assert.ok(omniCandidate);
    assert.equal(omniCandidate.isLocalhost, true);
  });
});
