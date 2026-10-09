export interface Env {
  CARD_IMAGES: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

type Usage = { storage_bytes: number; max_storage_bytes: number | null };

type User = { id: string };
const MEDIA_ORIGIN = "https://media.boardly.francklebas.com";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, Set<string>> = {
  "image/jpeg": new Set(["jpg", "jpeg"]),
  "image/png": new Set(["png"]),
  "image/webp": new Set(["webp"]),
  "image/gif": new Set(["gif"]),
};

async function authenticatedUser(request: Request, env: Env): Promise<User | null> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: env.SUPABASE_ANON_KEY },
  });
  if (!response.ok) return null;
  return response.json<User>();
}

async function cardBelongsToUser(cardId: string, request: Request, env: Env): Promise<boolean> {
  const authorization = request.headers.get("Authorization");
  if (!authorization) return false;
  const endpoint = `${env.SUPABASE_URL}/rest/v1/cards?id=eq.${encodeURIComponent(cardId)}&select=id&limit=1`;
  const response = await fetch(endpoint, {
    headers: { Authorization: authorization, apikey: env.SUPABASE_ANON_KEY },
  });
  if (!response.ok) return false;
  const rows = await response.json<unknown>();
  return Array.isArray(rows) && rows.some((row) => row && typeof row === "object" && (row as { id?: unknown }).id === cardId);
}

async function storageUsage(request: Request, env: Env): Promise<Usage | null> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/account_usage`, {
    method: "POST",
    headers: { Authorization: request.headers.get("Authorization") ?? "", apikey: env.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) return null;
  return response.json<Usage | null>();
}

// media_objects is only writable with the service role so users cannot reset their usage.
function mediaObjects(env: Env, init: RequestInit, query = "") {
  return fetch(`${env.SUPABASE_URL}/rest/v1/media_objects${query}`, {
    ...init,
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
  });
}

function response(status: number, message: string) {
  return Response.json({ error: message }, { status, headers: { "Access-Control-Allow-Origin": "https://boardly.francklebas.com" } });
}

function mediaPath(url: URL) {
  return decodeURIComponent(url.pathname.replace(/^\/media\//, ""));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "https://boardly.francklebas.com", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS" } });
    const user = await authenticatedUser(request, env);
    if (!user) return response(401, "Authentification requise.");

    if (request.method === "POST" && url.pathname === "/api/media") {
      const form = await request.formData();
      const file = form.get("file");
      const cardId = form.get("cardId");
      const extension = form.get("extension");
      if (!(file instanceof File) || typeof cardId !== "string" || !/^[0-9a-f-]{36}$/i.test(cardId) || typeof extension !== "string" || !/^[a-z0-9]{2,5}$/i.test(extension)) {
        return response(400, "Image invalide.");
      }
      if (!(await cardBelongsToUser(cardId, request, env))) return response(403, "Carte inaccessible.");
      const mime = file.type.toLowerCase();
      if (!MIME_EXTENSIONS[mime]) return response(415, "Type d’image non pris en charge.");
      if (file.size > MAX_IMAGE_BYTES) return response(413, "L’image dépasse la limite de 20 Mo.");
      if (!MIME_EXTENSIONS[mime].has(extension.toLowerCase())) return response(400, "Extension et type MIME incohérents.");
      if (!env.SUPABASE_SERVICE_ROLE_KEY) return response(500, "Service média mal configuré.");
      const usage = await storageUsage(request, env);
      if (!usage) return response(503, "Quota de stockage indisponible, réessayez plus tard.");
      if (usage.max_storage_bytes !== null && usage.storage_bytes + file.size > usage.max_storage_bytes) {
        return Response.json({ error: "Espace de stockage de votre plan épuisé. Passez en Pro pour ajouter des images.", code: "quota_storage" }, { status: 403, headers: { "Access-Control-Allow-Origin": "https://boardly.francklebas.com" } });
      }
      const key = `${user.id}/${cardId}/${crypto.randomUUID()}.${extension}`;
      await env.CARD_IMAGES.put(key, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: "private, max-age=31536000, immutable" } });
      const recorded = await mediaObjects(env, { method: "POST", body: JSON.stringify({ storage_path: key, user_id: user.id, size_bytes: file.size }) });
      if (!recorded.ok) {
        await env.CARD_IMAGES.delete(key);
        return response(503, "Enregistrement de l’image impossible, réessayez plus tard.");
      }
      return Response.json({ storagePath: key, src: `${MEDIA_ORIGIN}/media/${encodeURIComponent(key).replace(/%2F/g, "/")}` }, { status: 201, headers: { "Access-Control-Allow-Origin": "https://boardly.francklebas.com" } });
    }

    if (request.method === "GET" && url.pathname.startsWith("/media/")) {
      const key = mediaPath(url);
      if (!key.startsWith(`${user.id}/`)) return response(403, "Accès refusé.");
      const object = await env.CARD_IMAGES.get(key);
      if (!object) return response(404, "Image introuvable.");
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("ETag", object.httpEtag);
      headers.set("Access-Control-Allow-Origin", "https://boardly.francklebas.com");
      return new Response(object.body, { headers });
    }

    if (request.method === "DELETE" && url.pathname === "/api/media") {
      // Account deletion: purge every image stored under the user's prefix.
      let cursor: string | undefined;
      do {
        const page = await env.CARD_IMAGES.list({ prefix: `${user.id}/`, cursor });
        if (page.objects.length) await env.CARD_IMAGES.delete(page.objects.map((object) => object.key));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      await mediaObjects(env, { method: "DELETE" }, `?user_id=eq.${encodeURIComponent(user.id)}`);
      return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "https://boardly.francklebas.com" } });
    }

    if (request.method === "DELETE" && url.pathname.startsWith("/api/media/")) {
      const key = decodeURIComponent(url.pathname.replace(/^\/api\/media\//, ""));
      if (!key.startsWith(`${user.id}/`)) return response(403, "Accès refusé.");
      await env.CARD_IMAGES.delete(key);
      await mediaObjects(env, { method: "DELETE" }, `?storage_path=eq.${encodeURIComponent(key)}`);
      return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "https://boardly.francklebas.com" } });
    }
    return response(404, "Route introuvable.");
  },
};
