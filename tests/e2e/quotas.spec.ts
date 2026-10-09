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

test("the Free plan is limited to three boards across workspaces", async ({ page, request }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `quota-${suffix}@example.test`;

  await page.goto("/");
  await page.getByRole("tab", { name: "Créer un compte" }).click();
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(`Quota-${suffix}!`);
  await page.getByRole("checkbox", { name: /J’accepte les conditions/ }).check();
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await page.goto((await confirmationUrlFor(request, email))!);
  await expect(page.getByRole("heading", { name: "Mon espace de travail" })).toBeVisible();

  for (const name of ["Deuxième", "Troisième", "Quatrième"]) {
    await page.getByRole("button", { name: "Nouveau board" }).click();
    await page.getByLabel("Nom du nouveau board").fill(name);
    await page.getByLabel("Nom du nouveau board").press("Enter");
    if (name !== "Quatrième") await expect(page.getByRole("heading", { name })).toBeVisible();
  }
  await expect(page.getByRole("alert")).toContainText("Limite de 3 boards atteinte");
  await expect(page.getByRole("heading", { name: "Troisième" })).toBeVisible();

  await page.getByRole("button", { name: /Mes espaces/ }).click();
  await page.getByRole("button", { name: "Nouvel espace" }).click();
  await page.getByLabel("Nom de l’espace").fill("Plein");
  await page.getByRole("button", { name: "Créer l’espace" }).click();
  await expect(page.getByText("Aucun board dans cet espace")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Limite de 3 boards atteinte");

  await page.getByRole("link", { name: "Voir les plans" }).click();
  await expect(page.getByRole("tab", { name: "Abonnement" })).toHaveClass(/tab-active/);
  await expect(page.getByText("3 / 3")).toBeVisible();
  await expect(page.getByText("0 o / 500 Mio")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pro" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Team" })).toHaveCount(0);
});
