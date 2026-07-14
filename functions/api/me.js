import { getSessionFromRequest, json } from "../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ authenticated: false });
  return json({ authenticated: true, username: session.u });
}
