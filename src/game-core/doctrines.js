const DAMAGE_TYPES = ["acid", "cold", "fire", "force", "lightning", "necrotic", "poison", "psychic", "radiant", "thunder"];

const DOCTRINES = [
  { id: "anti_air" },
  { id: "anti_magic" },
  { id: "heavy_artillery" },
  { id: "fire_artillery" },
  { id: "elemental_ammunition", requiresDamageType: true },
  { id: "armor_piercing" },
  { id: "heavy_protection" },
  { id: "battlefield_weavers" },
  { id: "counterspell_cadre" },
  { id: "wild_surge_license" },
  { id: "ritual_artillery" },
  { id: "ward_smiths" },
  { id: "soul_binders" },
  { id: "spellthief_detachment" }
];

const DOCTRINE_SET = new Set(DOCTRINES.map((doctrine) => doctrine.id));

const DOCTRINE_LABEL_ALIASES = {
  "anti-air": "anti_air",
  "anti air": "anti_air",
  anti_air: "anti_air",
  "anti-magic": "anti_magic",
  "anti magic": "anti_magic",
  anti_magic: "anti_magic",
  "heavy-artillery": "heavy_artillery",
  "heavy artillery": "heavy_artillery",
  heavy_artillery: "heavy_artillery",
  "fire-artillery": "fire_artillery",
  "fire artillery": "fire_artillery",
  fire_artillery: "fire_artillery",
  "elemental-ammunition": "elemental_ammunition",
  "elemental ammunition": "elemental_ammunition",
  elemental_ammunition: "elemental_ammunition",
  "armor-piercing": "armor_piercing",
  "armor piercing": "armor_piercing",
  armor_piercing: "armor_piercing",
  "heavy-protection": "heavy_protection",
  "heavy protection": "heavy_protection",
  heavy_protection: "heavy_protection",
  "battlefield-weavers": "battlefield_weavers",
  "battlefield weavers": "battlefield_weavers",
  battlefield_weavers: "battlefield_weavers",
  "counterspell-cadre": "counterspell_cadre",
  "counterspell cadre": "counterspell_cadre",
  counterspell_cadre: "counterspell_cadre",
  "wild-surge-license": "wild_surge_license",
  "wild surge license": "wild_surge_license",
  wild_surge_license: "wild_surge_license",
  "ritual-artillery": "ritual_artillery",
  "ritual artillery": "ritual_artillery",
  ritual_artillery: "ritual_artillery",
  "ward-smiths": "ward_smiths",
  "ward smiths": "ward_smiths",
  ward_smiths: "ward_smiths",
  "soul-binders": "soul_binders",
  "soul binders": "soul_binders",
  soul_binders: "soul_binders",
  "spellthief-detachment": "spellthief_detachment",
  "spellthief detachment": "spellthief_detachment",
  spellthief_detachment: "spellthief_detachment"
};

export function normalizeDoctrineId(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (DOCTRINE_LABEL_ALIASES[raw]) return DOCTRINE_LABEL_ALIASES[raw];
  const cleaned = raw.replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (DOCTRINE_LABEL_ALIASES[cleaned]) return DOCTRINE_LABEL_ALIASES[cleaned];
  return DOCTRINE_SET.has(cleaned) ? cleaned : "";
}

export function normalizeDamageType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return DAMAGE_TYPES.includes(normalized) ? normalized : "";
}

export function normalizeDoctrineChoice(doctrineId, choice) {
  if (doctrineId !== "elemental_ammunition") return undefined;
  const damageType = normalizeDamageType(choice?.damageType || choice || "");
  return damageType ? { damageType } : undefined;
}

export function normalizeDoctrineInstance(entry) {
  if (!entry) return null;
  const doctrineId = normalizeDoctrineId(
    typeof entry === "string" ? entry : (entry.doctrineId || entry.id || entry.name)
  );
  if (!doctrineId || !DOCTRINE_SET.has(doctrineId)) return null;
  const choice = normalizeDoctrineChoice(doctrineId, entry?.choice || entry?.damageType);
  if (doctrineId === "elemental_ammunition" && !choice?.damageType) return null;
  return choice ? { doctrineId, choice } : { doctrineId };
}

export function normalizeDoctrineList(list) {
  const normalized = [];
  const seen = new Set();
  for (const entry of Array.isArray(list) ? list : []) {
    const next = normalizeDoctrineInstance(entry);
    if (!next || seen.has(next.doctrineId)) continue;
    seen.add(next.doctrineId);
    normalized.push(next);
  }
  return normalized;
}
