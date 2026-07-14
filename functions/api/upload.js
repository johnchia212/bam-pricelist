import { getSessionFromRequest, json } from "../_lib/auth.js";

// The Excel file is now parsed client-side in the browser (see public/app.js),
// which sends us the already-converted pricelist JSON. This endpoint just
// validates the shape and stores it. This avoids bundling an xlsx parser into
// the Worker, which was crashing on Cloudflare's edge runtime.
export async function onRequestPost({ request, env }) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: "Unauthorized" }, { status: 401 });

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!data || !Array.isArray(data.categories) || typeof data.total_items !== "number") {
    return json({ error: "Malformed pricelist data" }, { status: 400 });
  }

  if (!data.total_items) {
    return json({ error: "Parsed workbook contained no price rows" }, { status: 400 });
  }

  if (!env.PRICELIST_R2) {
    return json({ error: "Storage not configured (PRICELIST_R2 binding missing)" }, { status: 500 });
  }

  data.uploaded_by = session.u;
  data.generated_at = data.generated_at || new Date().toISOString();
  await env.PRICELIST_R2.put("pricelist.json", JSON.stringify(data), {
    httpMetadata: { contentType: "application/json" },
  });

  return json({
    ok: true,
    total_items: data.total_items,
    categories: data.categories.map((c) => ({ category: c.category, count: c.count })),
    generated_at: data.generated_at,
  });
}
