import { makeSessionCookie, json } from "../_lib/auth.js";
import { getUsers, hashPassword } from "../_lib/users.js";

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const { username, password } = body || {};
  if (!username || !password) {
    return json({ ok: false, error: "Invalid username or password" }, { status: 401 });
  }

  if (!env.PRICELIST_R2) {
    return json({ ok: false, error: "Storage not configured (PRICELIST_R2 binding missing)" }, { status: 500 });
  }

  let users;
  try {
    users = await getUsers(env);
  } catch (err) {
    return json({ ok: false, error: "Failed to load users: " + err.message }, { status: 500 });
  }

  const passwordHash = await hashPassword(password);
  const user = users.find(
    (u) => u.username.toLowerCase() === String(username).toLowerCase() && u.passwordHash === passwordHash
  );
  if (!user) {
    return json({ ok: false, error: "Invalid username or password" }, { status: 401 });
  }

  const cookie = await makeSessionCookie(user.username, user.role, env);
  return json(
    { ok: true, username: user.username, role: user.role },
    { headers: { "Set-Cookie": cookie } }
  );
}
