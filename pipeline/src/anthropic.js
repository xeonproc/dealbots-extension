import { config } from "./config.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// Claude sometimes wraps JSON replies in a ```json ... ``` fence despite
// instructions not to — strip it before parsing.
function stripCodeFence(text) {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
}

// Sends `prompt`, expects a raw JSON value back, and returns it parsed.
// Throws if there's no API key, the request fails, or the reply isn't valid
// JSON (even after stripping a markdown fence) — callers decide how to
// fall back.
export async function callClaudeJSON(prompt, { maxTokens = 1024 } = {}) {
  if (!config.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }

  const headers = {
    "content-type": "application/json",
    "x-api-key": config.anthropicApiKey,
    "anthropic-version": "2023-06-01",
  };
  if (config.anthropicWorkspaceId) {
    headers["anthropic-workspace-id"] = config.anthropicWorkspaceId;
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.anthropicModel,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API request failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const textBlock = data.content.find((block) => block.type === "text");
  if (!textBlock) {
    throw new Error(
      `Anthropic response had no text block (stop_reason: ${data.stop_reason}). ` +
        `Raw content: ${JSON.stringify(data.content)}`
    );
  }
  const cleaned = stripCodeFence(textBlock.text);
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Failed to parse Claude's reply as JSON (stop_reason: ${data.stop_reason}, ` +
        `${cleaned.length} chars): ${err.message}\n---\n${cleaned}\n---`
    );
  }
}
