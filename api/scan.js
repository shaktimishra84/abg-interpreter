// Serverless function: receives a base64 photo of an ABG report and asks
// the Claude API to transcribe its printed text. The transcription is fed
// through the existing client-side ocr-parser.js (same regex matching,
// same plausibility/confidence checks as the paste-text path) - this
// endpoint's only job is producing better raw text, not field extraction
// or clinical interpretation.
//
// PRIVACY NOTE: the photo (including any patient ID/name/sex printed on
// it) is sent to Anthropic's API here. The user explicitly chose this
// tradeoff over the alternatives (paste-text, cropped-header vision call)
// after being told what it costs - see PLAN-ocr-autofill.md.
//
// Model choice: claude-sonnet-5, not a cheaper tier (e.g. Haiku) -
// deliberate, not an oversight. This is a single careful read of a
// clinical document; the cost difference between tiers is a fraction of
// a cent per scan at this app's volume, not worth trading transcription
// accuracy for.
//
// Prompt caching: the instructions live in `system` with
// cache_control:"ephemeral" so repeat scans within the cache TTL (~5 min)
// reuse the cached prompt instead of paying for it again - the image
// itself is never cacheable (it's different every call) and lives in
// `messages`, not `system`.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // base64 payload guard, matches typical serverless body limits

const TRANSCRIBE_PROMPT = `Transcribe the printed text from this lab report photo exactly as it appears. Preserve each row as its own line, in the order printed, including labels, numeric values, units, and reference ranges. Include the header fields (Sample type, FO2(l)). Do not interpret, calculate, summarize, or omit anything - verbatim transcription only, one printed row per line. Do not transcribe handwritten annotations.`;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Scanning isn't configured on this deployment yet (missing API key). Use the paste-text option instead." });
    return;
  }

  const { image, mediaType } = req.body || {};
  if (!image || typeof image !== "string") {
    res.status(400).json({ error: "No image provided." });
    return;
  }
  if (image.length > MAX_IMAGE_BYTES) {
    res.status(413).json({ error: "Photo is too large. Try retaking it or use the paste-text option." });
    return;
  }

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: [
          { type: "text", text: TRANSCRIBE_PROMPT, cache_control: { type: "ephemeral" } }
        ],
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType || "image/jpeg",
                  data: image
                }
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      res.status(502).json({ error: `Scanning service error (${response.status}). Try again, or use the paste-text option.`, detail: detail.slice(0, 500) });
      return;
    }

    const data = await response.json();
    const text = (data.content || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    res.status(200).json({ text, cache: data.usage ? { cache_creation_input_tokens: data.usage.cache_creation_input_tokens, cache_read_input_tokens: data.usage.cache_read_input_tokens } : undefined });
  } catch (error) {
    res.status(502).json({ error: "Couldn't reach the scanning service. Try again, or use the paste-text option." });
  }
};
