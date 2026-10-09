import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

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

const workspaceMenu = (page: Page) => page.getByRole("button", { name: /Mes espaces/ });

test("creates, edits, restores and deletes workspaces", async ({ page, request }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `workspaces-${suffix}@example.test`;
  const password = `Workspaces-${suffix}!`;

  await page.goto("/");
  await page.getByRole("tab", { name: "Créer un compte" }).click();
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("checkbox", { name: /J’accepte les conditions/ }).check();
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await page.goto((await confirmationUrlFor(request, email))!);
  await expect(page.getByRole("heading", { name: "Mon espace de travail" })).toBeVisible();
  await expect(workspaceMenu(page)).toContainText("Personnel");

  await workspaceMenu(page).click();
  await page.getByRole("button", { name: "Nouvel espace" }).click();
  const dialog = page.getByRole("dialog", { name: "Nouvel espace" });
  await dialog.getByLabel("Nom de l’espace").fill("Client Acme");
  await dialog.getByRole("button", { name: "Vert" }).click();
  await dialog.getByRole("button", { name: "Créer l’espace" }).click();
  await expect(workspaceMenu(page)).toContainText("Client Acme");
  await expect(page.getByRole("heading", { name: "Mon espace de travail" })).toBeVisible();
  await page.getByRole("button", { name: "Ajouter une carte" }).first().click();
  await expect(page.locator("article.card")).toHaveCount(1);
  await page.waitForTimeout(1_500);

  await workspaceMenu(page).click();
  await page.getByRole("button", { name: "Modifier l’espace Client Acme" }).click();
  const editDialog = page.getByRole("dialog", { name: "Modifier l’espace" });
  await editDialog.getByLabel("Nom de l’espace").fill("Client Acme SA");
  await editDialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(workspaceMenu(page)).toContainText("Client Acme SA");

  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Mon espace de travail" })).toBeVisible();
  // A fresh visit without a board URL must reopen the last chosen workspace.
  await page.goto("/");
  await expect(workspaceMenu(page)).toContainText("Client Acme SA");
  await expect(page.locator("article.card")).toHaveCount(1);

  await workspaceMenu(page).click();
  await page.getByRole("button", { name: "Modifier l’espace Client Acme SA" }).click();
  await editDialog.getByRole("button", { name: "Supprimer l’espace" }).click();
  const confirmDelete = editDialog.getByRole("button", { name: "Supprimer définitivement" });
  await expect(confirmDelete).toBeDisabled();
  await editDialog.getByLabel("Confirmer le nom de l’espace à supprimer").fill("Client Acme SA");
  await confirmDelete.click();
  await expect(workspaceMenu(page)).toContainText("Personnel");
  await expect(page.locator("article.card")).toHaveCount(0);

  await workspaceMenu(page).click();
  await expect(page.getByRole("button", { name: "Modifier l’espace Client Acme SA" })).toHaveCount(0);
  await page.getByRole("button", { name: "Modifier l’espace Personnel" }).click();
  await expect(editDialog.getByRole("button", { name: "Supprimer l’espace" })).toBeDisabled();
});
