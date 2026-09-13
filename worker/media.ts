export interface Env {
  CARD_IMAGES: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

type User = { id: string };
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
  return response.ok ? response.json<User>() : null;
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

function response(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

function mediaPath(url: URL) {
  return decodeURIComponent(url.pathname.replace(/^\/media\//, ""));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
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
      const key = `${user.id}/${cardId}/${crypto.randomUUID()}.${extension}`;
      await env.CARD_IMAGES.put(key, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: "private, max-age=31536000, immutable" } });
      return Response.json({ storagePath: key, src: `/media/${encodeURIComponent(key).replace(/%2F/g, "/")}` }, { status: 201 });
    }

    if (request.method === "GET" && url.pathname.startsWith("/media/")) {
      const key = mediaPath(url);
      if (!key.startsWith(`${user.id}/`)) return response(403, "Accès refusé.");
      const object = await env.CARD_IMAGES.get(key);
      if (!object) return response(404, "Image introuvable.");
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("ETag", object.httpEtag);
      return new Response(object.body, { headers });
    }

    if (request.method === "DELETE" && url.pathname.startsWith("/api/media/")) {
      const key = decodeURIComponent(url.pathname.replace(/^\/api\/media\//, ""));
      if (!key.startsWith(`${user.id}/`)) return response(403, "Accès refusé.");
      await env.CARD_IMAGES.delete(key);
      return new Response(null, { status: 204 });
    }
    return response(404, "Route introuvable.");
  },
};
