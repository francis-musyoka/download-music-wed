#!/usr/bin/env node
// Reformat a single file's leading 2-space indentation to 4-space.
// Invoked from a Claude Code PostToolUse hook on Edit/Write.
// Idempotent: detects existing indentation and skips files that are already 4-space.
//
// Input: either argv[2] = file path, OR stdin JSON from a Claude Code hook
// (uses tool_response.filePath, falling back to tool_input.file_path).

import { readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const ALLOWED = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"]);

async function pathFromStdin() {
    if (process.stdin.isTTY) return null;
    let raw = "";
    for await (const chunk of process.stdin) raw += chunk;
    raw = raw.trim();
    if (!raw) return null;
    try {
        const ev = JSON.parse(raw);
        return ev?.tool_response?.filePath ?? ev?.tool_input?.file_path ?? null;
    } catch {
        return null;
    }
}

const arg = process.argv[2] ?? (await pathFromStdin());
if (!arg) process.exit(0);

const file = resolve(arg);
if (!ALLOWED.has(extname(file))) process.exit(0);

let src;
try {
    src = await readFile(file, "utf8");
} catch {
    process.exit(0);
}

// Find the minimum non-zero leading-space count across all content lines.
// If 2 → file uses 2-space indent; reformat to 4-space.
// If ≥4 or 0 → already 4-space (or unindented); leave alone.
function detectIndent(text) {
    let min = Infinity;
    for (const line of text.split("\n")) {
        const m = line.match(/^( +)\S/);
        if (!m) continue;
        if (m[1].length < min) min = m[1].length;
        if (min === 2) return 2;
    }
    return min === Infinity ? 0 : min;
}

if (detectIndent(src) !== 2) process.exit(0);

const out = src
    .split("\n")
    .map((line) => {
        const m = line.match(/^( {2})+/);
        if (!m) return line;
        const depth = m[0].length / 2;
        return " ".repeat(depth * 4) + line.substring(m[0].length);
    })
    .join("\n");

if (out !== src) {
    await writeFile(file, out, "utf8");
}
