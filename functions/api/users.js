import { getSessionFromRequest, json } from "../_lib/auth.js";
import { getUsers, hashPassword, upsertUser, deleteUser } from "../_lib/users.js";

const VALID_ROLES = ["admin", "manager", "user"];

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
// Password is optional when the username already exists - blank means
// "keep the current password".
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
  if (!VALID_ROLES.includes(role)) {
    return json({ error: "Access must be Admin, Manager, or User" }, { status: 400 });
  }

  if (!env.PRICELIST_R2) {
    return json({ error: "Storage not configured (PRICELIST_R2 binding missing)" }, { status: 500 });
  }

  const uname = String(username).trim();
  const users = await getUsers(env);
  const existing = users.find((u) => u.username.toLowerCase() === uname.toLowerCase());

  let passwordHash;
  if (password) {
    if (String(password).length < 6) {
      return json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }
    passwordHash = await hashPassword(String(password));
  } else if (existing) {
    passwordHash = existing.passwordHash;
  } else {
    return json({ error: "Password is required for a new user" }, { status: 400 });
  }

  const updated = await upsertUser(env, { username: uname, passwordHash, role });
  return json({ ok: true, users: updated.map((u) => ({ username: u.username, role: u.role })) });
}

// Remove a user. Blocked if it would leave zero Admin accounts.
export async function onRequestDelete({ request, env }) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return json({ error: "Forbidden" }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const username = body && body.username ? String(body.username).trim() : "";
  if (!username) {
    return json({ error: "Username is required" }, { status: 400 });
  }

  if (!env.PRICELIST_R2) {
    return json({ error: "Storage not configured (PRICELIST_R2 binding missing)" }, { status: 500 });
  }

  try {
    const updated = await deleteUser(env, username);
    return json({ ok: true, users: updated.map((u) => ({ username: u.username, role: u.role })) });
  } catch (err) {
    return json({ error: err.message }, { status: err.status || 500 });
  }
}
