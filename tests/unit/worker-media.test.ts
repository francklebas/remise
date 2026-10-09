import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/media";

const userId = "11111111-1111-4111-8111-111111111111";
const cardId = "22222222-2222-4222-8222-222222222222";
const otherCardId = "33333333-3333-4333-8333-333333333333";
const env = {
  CARD_IMAGES: { put: vi.fn().mockResolvedValue(undefined), get: vi.fn(), delete: vi.fn() },
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
} as never;
let usage = { storage_bytes: 0, max_storage_bytes: 500 * 1024 * 1024 as number | null };
let recordStatus = 201;
const recorded: unknown[] = [];

function request(file: File, id = cardId, extension = "png") {
  const body = new FormData();
  body.set("file", file);
  body.set("cardId", id);
  body.set("extension", extension);
  return new Request("https://boardly.test/api/media", { method: "POST", headers: { Authorization: "Bearer token" }, body });
}

describe("media worker upload guards", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) return Response.json({ id: userId });
      if (url.includes("/rest/v1/cards") && url.includes(`id=eq.${cardId}`)) return Response.json([{ id: cardId }]);
      if (url.endsWith("/rest/v1/rpc/account_usage")) return Response.json(usage);
      if (url.includes("/rest/v1/media_objects")) {
        recorded.push({ url, init });
        return new Response(null, { status: recordStatus });
      }
      return Response.json([]);
    }));
    usage = { storage_bytes: 0, max_storage_bytes: 500 * 1024 * 1024 };
    recordStatus = 201;
    recorded.length = 0;
    vi.mocked((env as { CARD_IMAGES: { put: () => void; delete: () => void } }).CARD_IMAGES.put).mockClear();
    vi.mocked((env as { CARD_IMAGES: { put: () => void; delete: () => void } }).CARD_IMAGES.delete).mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("accepts a card owned by the authenticated user and records the image size", async () => {
    const result = await worker.fetch(request(new File(["png"], "a.png", { type: "image/png" })), env);
    expect(result.status).toBe(201);
    const { storagePath } = await result.json() as { storagePath: string };
    expect(recorded).toHaveLength(1);
    const { init } = recorded[0] as { init: RequestInit };
    expect(JSON.parse(String(init.body))).toEqual({ storage_path: storagePath, user_id: userId, size_bytes: 3 });
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer service");
  });

  it("refuses an upload that would exceed the plan storage before writing to R2", async () => {
    usage = { storage_bytes: 500 * 1024 * 1024 - 2, max_storage_bytes: 500 * 1024 * 1024 };
    const result = await worker.fetch(request(new File(["png"], "a.png", { type: "image/png" })), env);
    expect(result.status).toBe(403);
    expect(await result.json()).toMatchObject({ code: "quota_storage" });
    expect((env as { CARD_IMAGES: { put: () => void } }).CARD_IMAGES.put).not.toHaveBeenCalled();
  });

  it("allows unlimited plans and rolls back the R2 write when the size cannot be recorded", async () => {
    usage = { storage_bytes: 10 ** 12, max_storage_bytes: null };
    recordStatus = 500;
    const result = await worker.fetch(request(new File(["png"], "a.png", { type: "image/png" })), env);
    expect(result.status).toBe(503);
    expect((env as { CARD_IMAGES: { delete: () => void } }).CARD_IMAGES.delete).toHaveBeenCalledTimes(1);
  });

  it("refuses another user's card and an unknown card", async () => {
    expect((await worker.fetch(request(new File(["png"], "a.png", { type: "image/png" }), otherCardId), env)).status).toBe(403);
    expect((await worker.fetch(request(new File(["png"], "a.png", { type: "image/png" }), "44444444-4444-4444-8444-444444444444"), env)).status).toBe(403);
  });

  it("refuses invalid MIME, oversized files and mismatched extensions", async () => {
    expect((await worker.fetch(request(new File(["x"], "a.svg", { type: "image/svg+xml" })), env)).status).toBe(415);
    expect((await worker.fetch(request(new File([new Uint8Array(20 * 1024 * 1024 + 1)], "a.png", { type: "image/png" })), env)).status).toBe(413);
    expect((await worker.fetch(request(new File(["x"], "a.jpg", { type: "image/png" }), cardId, "jpg"), env)).status).toBe(400);
  });

  it("purges only the authenticated user's images, page by page", async () => {
    const list = vi.fn()
      .mockResolvedValueOnce({ objects: [{ key: `${userId}/a.png` }, { key: `${userId}/b.png` }], truncated: true, cursor: "next" })
      .mockResolvedValueOnce({ objects: [{ key: `${userId}/c.png` }], truncated: false });
    const remove = vi.fn().mockResolvedValue(undefined);
    const purgeEnv = { CARD_IMAGES: { list, delete: remove }, SUPABASE_URL: "https://supabase.test", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service" } as never;
    const result = await worker.fetch(new Request("https://boardly.test/api/media", { method: "DELETE", headers: { Authorization: "Bearer token" } }), purgeEnv);
    expect(result.status).toBe(204);
    expect(list).toHaveBeenNthCalledWith(1, { prefix: `${userId}/`, cursor: undefined });
    expect(list).toHaveBeenNthCalledWith(2, { prefix: `${userId}/`, cursor: "next" });
    expect(remove).toHaveBeenCalledWith([`${userId}/a.png`, `${userId}/b.png`]);
    expect(remove).toHaveBeenCalledWith([`${userId}/c.png`]);
    expect(recorded.map((entry) => (entry as { url: string }).url)).toEqual([`https://supabase.test/rest/v1/media_objects?user_id=eq.${userId}`]);
  });

  it("refuses to purge without authentication", async () => {
    const result = await worker.fetch(new Request("https://boardly.test/api/media", { method: "DELETE" }), env);
    expect(result.status).toBe(401);
  });
});
