import { getSessionFromRequest, json } from "../_lib/auth.js";

const ALLOWED_FIELDS = [
  "series", "model", "sap_pn", "capacity", "dimensions", "range",
  "weight_kg", "et_mm", "hcg_mm", "mounting_class", "price_rmb",
  "input_date", "updated", "remarks",
];

// Amend a single price list row in place. Identified by category name +
// its index within that category's items array (stable as long as the
// category isn't re-uploaded/reordered in between).
export async function onRequestPost({ request, env }) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
  }

  const { category, index, item } = body || {};
  if (typeof category !== "string" || !category) {
    return json({ error: "Missing category" }, { status: 400 });
  }
  if (typeof index !== "number" || index < 0) {
    return json({ error: "Missing or invalid index" }, { status: 400 });
  }
  if (!item || typeof item !== "object") {
    return json({ error: "Missing item fields" }, { status: 400 });
  }

  if (!env.PRICELIST_R2) {
    return json({ error: "Storage not configured (PRICELIST_R2 binding missing)" }, { status: 500 });
  }

  const obj = await env.PRICELIST_R2.get("pricelist.json");
  if (!obj) {
    return json({ error: "No pricelist data found" }, { status: 404 });
  }
  const data = await obj.json();

  const cat = data.categories.find((c) => c.category === category);
  if (!cat || !cat.items[index]) {
    return json({ error: "Item not found" }, { status: 404 });
  }

  const updated = { ...cat.items[index] };
  for (const key of ALLOWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(item, key)) {
      updated[key] = item[key];
    }
  }
  updated.category = category;
  updated.updated = new Date().toISOString().slice(0, 10);
  cat.items[index] = updated;

  data.generated_at = new Date().toISOString();
  data.last_edited_by = session.u;

  await env.PRICELIST_R2.put("pricelist.json", JSON.stringify(data), {
    httpMetadata: { contentType: "application/json" },
  });

  return json({ ok: true, item: updated });
}

// Add a brand new row. If the category doesn't exist yet it's created
// (so a new tab/section appears automatically), otherwise the item is
// appended to the end of that category's list.
export async function onRequestPut({ request, env }) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
  }

  const { category, item } = body || {};
  if (typeof category !== "string" || !category.trim()) {
    return json({ error: "Missing category" }, { status: 400 });
  }
  if (!item || typeof item !== "object") {
    return json({ error: "Missing item fields" }, { status: 400 });
  }
  if (!item.model || !String(item.model).trim()) {
    return json({ error: "Model is required" }, { status: 400 });
  }

  if (!env.PRICELIST_R2) {
    return json({ error: "Storage not configured (PRICELIST_R2 binding missing)" }, { status: 500 });
  }

  const obj = await env.PRICELIST_R2.get("pricelist.json");
  const data = obj
    ? await obj.json()
    : { generated_at: null, source_file: null, total_items: 0, categories: [] };

  const categoryName = category.trim();
  let cat = data.categories.find((c) => c.category === categoryName);
  if (!cat) {
    cat = { category: categoryName, count: 0, items: [] };
    data.categories.push(cat);
  }

  const newItem = {};
  for (const key of ALLOWED_FIELDS) {
    newItem[key] = Object.prototype.hasOwnProperty.call(item, key) ? item[key] : null;
  }
  newItem.category = categoryName;
  newItem.updated = new Date().toISOString().slice(0, 10);

  cat.items.push(newItem);
  cat.count = cat.items.length;
  data.total_items = data.categories.reduce((sum, c) => sum + c.items.length, 0);
  data.generated_at = new Date().toISOString();
  data.last_edited_by = session.u;

  await env.PRICELIST_R2.put("pricelist.json", JSON.stringify(data), {
    httpMetadata: { contentType: "application/json" },
  });

  return json({ ok: true, item: newItem, category: categoryName, index: cat.items.length - 1 });
}
