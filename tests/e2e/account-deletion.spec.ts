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

test("deletes the account and its data after password confirmation", async ({ page, request }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `delete-${suffix}@example.test`;
  const password = `Delete-${suffix}!`;

  await page.goto("/");
  await page.getByRole("tab", { name: "Créer un compte" }).click();
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await page.goto((await confirmationUrlFor(request, email))!);
  await expect(page.getByRole("heading", { name: "Mon espace de travail" })).toBeVisible();
  await page.getByRole("button", { name: "Ajouter une carte" }).first().click();
  await expect(page.locator("article.card")).toHaveCount(1);
  await page.waitForTimeout(1_500);

  await page.getByRole("button", { name: "Ouvrir mon espace utilisateur" }).click();
  await page.getByRole("button", { name: "Supprimer mon compte…" }).click();
  await page.getByLabel("Mot de passe pour confirmer la suppression").fill("mauvais-mot-de-passe");
  await page.getByRole("button", { name: "Supprimer définitivement" }).click();
  await expect(page.getByRole("alert")).toContainText("Mot de passe incorrect");

  await page.getByLabel("Mot de passe pour confirmer la suppression").fill(password);
  await page.getByRole("button", { name: "Supprimer définitivement" }).click();
  await expect(page.getByRole("status")).toContainText("Votre compte et toutes vos données ont été supprimés");

  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Mon espace de travail" })).toHaveCount(0);
  await expect(page.locator(".alert-error")).toBeVisible();
});
