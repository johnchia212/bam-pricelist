// User store, backed by the same R2 bucket used for pricelist.json.
// Passwords are never stored in plain text - only SHA-256 hashes.

const USERS_KEY = "users.json";

export async function hashPassword(password) {
  const enc = new TextEncoder().encode(password);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// First-run seed: migrates the previous single Cloudflare-secret admin
// login (ADMIN_USERNAME/ADMIN_PASSWORD) into the new user store, and adds
// the requested read-only user alongside it.
async function seedDefaultUsers(env) {
  const adminUser = env.ADMIN_USERNAME || "Admin";
  const adminPass = env.ADMIN_PASSWORD || "sniffy123!";
  return [
    { username: adminUser, passwordHash: await hashPassword(adminPass), role: "admin" },
    { username: "Jooi", passwordHash: await hashPassword("OoiSQ26!"), role: "user" },
  ];
}

export async function getUsers(env) {
  if (!env.PRICELIST_R2) {
    throw new Error("Storage not configured (PRICELIST_R2 binding missing)");
  }
  const obj = await env.PRICELIST_R2.get(USERS_KEY);
  if (obj) {
    const data = await obj.json();
    if (data && Array.isArray(data.users) && data.users.length) return data.users;
  }
  const users = await seedDefaultUsers(env);
  await saveUsers(env, users);
  return users;
}

export async function saveUsers(env, users) {
  await env.PRICELIST_R2.put(USERS_KEY, JSON.stringify({ users }), {
    httpMetadata: { contentType: "application/json" },
  });
}

// Creates a new user, or updates the password/role of an existing one
// (matched case-insensitively on username).
export async function upsertUser(env, { username, password, role }) {
  const users = await getUsers(env);
  const passwordHash = await hashPassword(password);
  const idx = users.findIndex((u) => u.username.toLowerCase() === username.toLowerCase());
  if (idx !== -1) {
    users[idx] = { username: users[idx].username, passwordHash, role };
  } else {
    users.push({ username, passwordHash, role });
  }
  await saveUsers(env, users);
  return users;
}
