import { expect, test, type APIRequestContext } from "@playwright/test";

const mailpitUrl = "http://127.0.0.1:8025";

async function confirmationUrlFor(request: APIRequestContext, email: string) {
  let messageId: string | undefined;
  await expect.poll(async () => {
    const response = await request.get(`${mailpitUrl}/api/v1/messages`);
    const inbox = (await response.json()) as { messages: Array<{ ID: string; To: Array<{ Address: string }> }> };
    messageId = inbox.messages.find((message) => message.To.some(({ Address }) => Address === email))?.ID;
    return messageId;
  }, { timeout: 10_000 }).toBeTruthy();
  const message = await (await request.get(`${mailpitUrl}/api/v1/message/${messageId}`)).json() as { Text: string };
  return message.Text.match(/https?:\/\/[^\s)]+/)?.[0];
}

test("persists a canonical ProseMirror description across a full reload", async ({ page, request }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `persist-${suffix}@example.test`;
  const password = `Persist-${suffix}!`;
  const title = `Carte persistée ${suffix}`;

  await page.goto("/");
  await page.getByRole("tab", { name: "Créer un compte" }).click();
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await page.goto((await confirmationUrlFor(request, email))!);
  await expect(page.getByRole("heading", { name: "Mon espace de travail" })).toBeVisible();

  await page.getByRole("button", { name: "Ajouter une carte" }).first().click();
  const card = page.locator("#todo article.card").last();
  await card.dblclick();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Titre").fill(title);
  await dialog.getByRole("button", { name: "Markdown" }).click();
  await dialog.getByLabel("Markdown de la description").fill("# Titre durable\n\n**Texte riche**");
  await dialog.getByRole("button", { name: "Rich Text" }).click();
  await dialog.getByRole("button", { name: "Enregistrer" }).click();

  await page.reload();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("heading", { name: title }).dblclick();
  await page.getByRole("button", { name: "Markdown" }).click();
  await expect(page.getByLabel("Markdown de la description")).toHaveValue("# Titre durable\n\n**Texte riche**");
});
