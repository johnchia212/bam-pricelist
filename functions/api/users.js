import { getSessionFromRequest, json } from "../_lib/auth.js";
import { getUsers, upsertUser } from "../_lib/users.js";

function isAdmin(session) {
  return !!session && session.r === "admin";
}

// List existing users (usernames + role only - never password hashes).
export async function onRequestGet({ request, env }) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return json({ error: "Forbidden" }, { status: 403 });

  if (!env.PRICELIST_R2) {
    return json({ error: "Storage not configured (PRICELIST_R2 binding missing)" }, { status: 500 });
  }

  const users = await getUsers(env);
  return json({ users: users.map((u) => ({ username: u.username, role: u.role })) });
}

// Create a new user, or update the password/role of an existing one.
export async function onRequestPost({ request, env }) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return json({ error: "Forbidden" }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
  }

  const { username, password, role } = body || {};
  if (!username || !String(username).trim()) {
    return json({ error: "Username is required" }, { status: 400 });
  }
  if (!password || String(password).length < 6) {
    return json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }
  if (role !== "admin" && role !== "user") {
    return json({ error: "Access must be 'admin' or 'user'" }, { status: 400 });
  }

  if (!env.PRICELIST_R2) {
    return json({ error: "Storage not configured (PRICELIST_R2 binding missing)" }, { status: 500 });
  }

  const users = await upsertUser(env, {
    username: String(username).trim(),
    password: String(password),
    role,
  });
  return json({ ok: true, users: users.map((u) => ({ username: u.username, role: u.role })) });
}
