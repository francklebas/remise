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

test("manages several boards in a workspace, each with its own URL", async ({ page, request }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `boards-${suffix}@example.test`;
  const password = `Boards-${suffix}!`;

  await page.goto("/");
  await page.getByRole("tab", { name: "Créer un compte" }).click();
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("checkbox", { name: /J’accepte les conditions/ }).check();
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await page.goto((await confirmationUrlFor(request, email))!);
  await expect(page.getByRole("heading", { name: "Mon espace de travail" })).toBeVisible();
  await expect(page).toHaveURL(/\/b\/[0-9a-f-]{36}$/);
  const firstBoardUrl = page.url();
  await page.getByRole("button", { name: "Ajouter une carte" }).first().click();
  await expect(page.locator("article.card")).toHaveCount(1);

  await page.getByRole("button", { name: "Nouveau board" }).click();
  await page.getByLabel("Nom du nouveau board").fill("Projet client");
  await page.getByLabel("Nom du nouveau board").press("Enter");
  await expect(page.getByRole("heading", { name: "Projet client" })).toBeVisible();
  await expect(page).not.toHaveURL(firstBoardUrl);
  await expect(page.locator("section.column")).toHaveCount(3);
  await expect(page.locator("article.card")).toHaveCount(0);
  const secondBoardUrl = page.url();
  await page.getByRole("button", { name: "Ajouter une carte" }).first().click();
  const linkedCardId = await page.locator("article.card").first().getAttribute("id");
  await expect(page.locator("article.card")).toHaveCount(1);
  await page.waitForTimeout(1_500);
  await page.goto(firstBoardUrl);
  await expect(page.getByRole("heading", { name: "Mon espace de travail" })).toBeVisible();
  await page.goto(`/?card=${linkedCardId}`);
  await expect(page.getByRole("heading", { name: "Projet client" })).toBeVisible();
  await expect(page).toHaveURL(`${secondBoardUrl}?card=${linkedCardId}`);
  await page.goto(firstBoardUrl);
  await page.goto(secondBoardUrl);

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Mon espace de travail" })).toBeVisible();
  await expect(page.locator("article.card")).toHaveCount(1);
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Projet client" })).toBeVisible();

  await page.getByRole("button", { name: "Options du board" }).click();
  await page.getByRole("button", { name: "Renommer" }).click();
  await page.getByLabel("Nom du board").fill("Projet renommé");
  await page.getByLabel("Nom du board").press("Enter");
  await expect(page.getByRole("heading", { name: "Projet renommé" })).toBeVisible();

  await page.goto(secondBoardUrl);
  await expect(page.getByRole("heading", { name: "Projet renommé" })).toBeVisible();

  await page.getByRole("button", { name: "Options du board" }).click();
  await page.getByRole("button", { name: "Archiver" }).click();
  await expect(page.getByRole("heading", { name: "Mon espace de travail" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Boards de l’espace" }).getByRole("link", { name: "Projet renommé" })).toHaveCount(0);

  await page.getByRole("button", { name: "Archivés (1)" }).click();
  await page.getByRole("button", { name: "Restaurer Projet renommé" }).click();
  await expect(page.getByRole("navigation", { name: "Boards de l’espace" }).getByRole("link", { name: "Projet renommé" })).toBeVisible();

  await page.getByRole("link", { name: "Projet renommé" }).click();
  await expect(page.getByRole("heading", { name: "Projet renommé" })).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Options du board" }).click();
  await page.getByRole("button", { name: "Supprimer" }).click();
  await expect(page.getByRole("heading", { name: "Mon espace de travail" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Projet renommé" })).toHaveCount(0);

  await page.goto(secondBoardUrl);
  await expect(page.getByRole("heading", { name: "Mon espace de travail" })).toBeVisible();
});
