import { getSessionFromRequest, json } from "../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: "Unauthorized" }, { status: 401 });

  try {
    let data = null;

    if (env.PRICELIST_R2) {
      const obj = await env.PRICELIST_R2.get("pricelist.json");
      if (obj) data = await obj.json();
    }

    if (!data) {
      // Nothing in R2 yet (first run) - fall back to the bundled seed data
      // and write it into R2 so the bucket is populated going forward.
      const url = new URL(request.url);
      const seedRes = await env.ASSETS.fetch(new URL("/data/pricelist.json", url.origin));
      if (!seedRes.ok) {
        throw new Error(`Seed fetch failed: ${seedRes.status}`);
      }
      data = await seedRes.json();
      if (env.PRICELIST_R2) {
        await env.PRICELIST_R2.put("pricelist.json", JSON.stringify(data), {
          httpMetadata: { contentType: "application/json" },
        });
      }
    }

    return json(data);
  } catch (err) {
    console.error("pricelist error:", err);
    return json({ error: "Failed to load pricelist: " + err.message }, { status: 500 });
  }
}
