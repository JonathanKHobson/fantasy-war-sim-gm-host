import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import electronPath from "electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const child = spawn(electronPath, [repoRoot, "--smoke-test"], {
  cwd: repoRoot,
  env: { ...process.env },
  stdio: ["ignore", "pipe", "pipe"]
});

let stderr = "";

const timeout = setTimeout(() => {
  child.kill("SIGTERM");
}, 20000);

child.stdout.on("data", (chunk) => {
  const text = String(chunk);
  process.stdout.write(text);
});

child.stderr.on("data", (chunk) => {
  const text = String(chunk);
  stderr += text;
  process.stderr.write(text);
});

child.on("exit", (code) => {
  clearTimeout(timeout);
  if (code !== 0) {
    console.error(stderr || `Electron exited with code ${code}.`);
    process.exit(code || 1);
  }
  process.exit(0);
});
