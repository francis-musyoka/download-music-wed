// Dev-only: measures input-token cost of each static system prompt against
// OpenAI's gpt-4o-mini tokenizer. Used to verify the ≥1024-token threshold
// for automatic prompt caching (cached prompts are billed at 50%).
//
// Run: node --experimental-strip-types scripts/count-prompt-tokens.ts

import { encoding_for_model } from "tiktoken";
import * as prompts from "../lib/llm/prompts.ts";

const enc = encoding_for_model("gpt-4o-mini");
const THRESHOLD = 1024;

console.log("Prompt sizes (tokens):");
let anyUnder = false;
for (const [name, value] of Object.entries(prompts)) {
  if (typeof value !== "string") continue;
  const tokens = enc.encode(value).length;
  const flag = tokens >= THRESHOLD ? "cache-eligible" : "BELOW THRESHOLD";
  console.log(`  ${name.padEnd(40)} ${String(tokens).padStart(5)}  ${flag}`);
  if (tokens < THRESHOLD) anyUnder = true;
}
enc.free();

if (anyUnder) {
  console.log("\nAt least one prompt is under 1024 tokens — will NOT benefit from automatic prompt caching.");
  console.log("Consider padding with deterministic few-shot examples.");
  process.exit(1);
}
