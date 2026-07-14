import { makeSessionCookie, json } from "../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const { username, password } = body || {};
  const expectedUser = env.ADMIN_USERNAME || "Admin";
  const expectedPass = env.ADMIN_PASSWORD || "sniffy123!";

  if (username !== expectedUser || password !== expectedPass) {
    return json({ ok: false, error: "Invalid username or password" }, { status: 401 });
  }

  const cookie = await makeSessionCookie(username, env);
  return json(
    { ok: true, username },
    { headers: { "Set-Cookie": cookie } }
  );
}
