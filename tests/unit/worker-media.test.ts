import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/media";

const userId = "11111111-1111-4111-8111-111111111111";
const cardId = "22222222-2222-4222-8222-222222222222";
const otherCardId = "33333333-3333-4333-8333-333333333333";
const env = {
  CARD_IMAGES: { put: vi.fn().mockResolvedValue(undefined), get: vi.fn(), delete: vi.fn() },
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_ANON_KEY: "anon",
} as never;

function request(file: File, id = cardId, extension = "png") {
  const body = new FormData();
  body.set("file", file);
  body.set("cardId", id);
  body.set("extension", extension);
  return new Request("https://boardly.test/api/media", { method: "POST", headers: { Authorization: "Bearer token" }, body });
}

describe("media worker upload guards", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) return Response.json({ id: userId });
      if (url.includes("/rest/v1/cards") && url.includes(`id=eq.${cardId}`)) return Response.json([{ id: cardId }]);
      return Response.json([]);
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("accepts a card owned by the authenticated user", async () => {
    const result = await worker.fetch(request(new File(["png"], "a.png", { type: "image/png" })), env);
    expect(result.status).toBe(201);
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
    const purgeEnv = { CARD_IMAGES: { list, delete: remove }, SUPABASE_URL: "https://supabase.test", SUPABASE_ANON_KEY: "anon" } as never;
    const result = await worker.fetch(new Request("https://boardly.test/api/media", { method: "DELETE", headers: { Authorization: "Bearer token" } }), purgeEnv);
    expect(result.status).toBe(204);
    expect(list).toHaveBeenNthCalledWith(1, { prefix: `${userId}/`, cursor: undefined });
    expect(list).toHaveBeenNthCalledWith(2, { prefix: `${userId}/`, cursor: "next" });
    expect(remove).toHaveBeenCalledWith([`${userId}/a.png`, `${userId}/b.png`]);
    expect(remove).toHaveBeenCalledWith([`${userId}/c.png`]);
  });

  it("refuses to purge without authentication", async () => {
    const result = await worker.fetch(new Request("https://boardly.test/api/media", { method: "DELETE" }), env);
    expect(result.status).toBe(401);
  });
});
