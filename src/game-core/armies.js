import { normalizeDoctrineList } from "./doctrines.js";
import { nowIso, toInt, uuid } from "./utils.js";

function hasValidClassId(classId, validClassIds) {
  if (!classId) return false;
  if (!validClassIds) return true;
  if (validClassIds instanceof Set) return validClassIds.has(classId);
  if (validClassIds instanceof Map) return validClassIds.has(classId);
  if (Array.isArray(validClassIds)) return validClassIds.includes(classId);
  return true;
}

export function sanitizeArmyRecord(rawArmy, options = {}) {
  const classId = String(rawArmy?.classId || "").trim();
  if (!hasValidClassId(classId, options.validClassIds)) return null;
  const now = options.now || nowIso;
  const idFactory = options.idFactory || uuid;
  const size = Math.max(0, toInt(rawArmy?.size) ?? 0);
  const str = Math.max(0, toInt(rawArmy?.str) ?? 0);
  const originalSize = Math.max(0, toInt(rawArmy?.originalSize) ?? size);
  const originalStr = Math.max(0, toInt(rawArmy?.originalStr) ?? str);
  return {
    id: String(rawArmy?.id || "").trim() || idFactory(),
    name: String(rawArmy?.name || "Army").trim() || "Army",
    faction: String(rawArmy?.faction || "").trim(),
    classId,
    size,
    str,
    originalSize,
    originalStr,
    notes: String(rawArmy?.notes || "").trim(),
    doctrines: normalizeDoctrineList(rawArmy?.doctrines),
    createdAt: rawArmy?.createdAt || now(),
    updatedAt: rawArmy?.updatedAt || now()
  };
}

export function sanitizeArmyList(armies, options = {}) {
  return (Array.isArray(armies) ? armies : []).map((army) => sanitizeArmyRecord(army, options)).filter(Boolean);
}
