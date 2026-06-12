import { randomUUID } from "node:crypto";

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function toInt(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const number = Number(text);
  if (!Number.isFinite(number)) return null;
  return Math.trunc(number);
}

export function nowIso() {
  return new Date().toISOString();
}

export function uuid() {
  try {
    return randomUUID();
  } catch {
    return `id-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
  }
}

export function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

export function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
