import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_SOURCE = path.resolve(__dirname, "../reference/fantasy-war-sim.html");

function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function buildLineIndex(text) {
  return text.split(/\r?\n/);
}

function findFunctionBlock(lines, signature) {
  const startIndex = lines.findIndex((line) => line.includes(signature));
  if (startIndex === -1) {
    throw new Error(`Could not find function signature: ${signature}`);
  }

  let depth = 0;
  let started = false;
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    const openCount = countMatches(line, /\{/g);
    const closeCount = countMatches(line, /\}/g);
    if (openCount > 0) started = true;
    depth += openCount;
    depth -= closeCount;
    if (started && depth === 0) {
      return {
        startLine: startIndex + 1,
        endLine: index + 1,
        text: lines.slice(startIndex, index + 1).join("\n")
      };
    }
  }

  throw new Error(`Could not resolve function block for: ${signature}`);
}

function nonCommentDocumentReferences(lines) {
  return lines.filter((line) => line.includes("document.") && !line.includes("//")).length;
}

function collectMatchingLines(block, token) {
  return block.text
    .split(/\r?\n/)
    .map((line, index) => ({
      lineNumber: block.startLine + index,
      text: line
    }))
    .filter((entry) => entry.text.includes(token))
    .map((entry) => ({
      lineNumber: entry.lineNumber,
      text: entry.text.trim()
    }));
}

export function analyzeHtml(html, sourceFile = DEFAULT_SOURCE) {
  const lines = buildLineIndex(html);
  const runBattleRound = findFunctionBlock(lines, "function runBattleRound(options)");
  const tokens = [
    { key: "domLookup", token: "$(" },
    { key: "render", token: "render(" },
    { key: "persist", token: "persist(" },
    { key: "persistWeather", token: "persistWeather(" },
    { key: "renderResult", token: "renderResult(" },
    { key: "appendHistory", token: "appendHistory(" },
    { key: "setLiveMessage", token: "setLiveMessage(" },
    { key: "showToast", token: "showToast(" }
  ];

  const sideEffectCounts = Object.fromEntries(
    tokens.map(({ key, token }) => [
      key,
      countMatches(runBattleRound.text, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))
    ])
  );

  const sideEffectLines = Object.fromEntries(
    tokens
      .map(({ key, token }) => [key, collectMatchingLines(runBattleRound, token)])
      .filter(([, entries]) => entries.length > 0)
  );

  return {
    sourceFile,
    documentReferenceCount: nonCommentDocumentReferences(lines),
    runBattleRound: {
      startLine: runBattleRound.startLine,
      endLine: runBattleRound.endLine,
      sideEffectCounts,
      sideEffectLines
    }
  };
}

export function analyzeFile(sourceFile = DEFAULT_SOURCE) {
  const html = fs.readFileSync(sourceFile, "utf8");
  return analyzeHtml(html, sourceFile);
}

if (process.argv[1] === __filename) {
  const sourceFile = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_SOURCE;
  const report = analyzeFile(sourceFile);
  console.log(JSON.stringify(report, null, 2));
}
