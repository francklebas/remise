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

test("legal pages are public and linked from the sign-up form", async ({ page }) => {
  await page.goto("/conditions");
  await expect(page.getByRole("heading", { name: "Conditions d’utilisation et de vente" })).toBeVisible();
  await page.getByRole("link", { name: "Confidentialité" }).click();
  await expect(page).toHaveURL(/\/confidentialite$/);
  await expect(page.getByText(/Resend/)).toBeVisible();

  await page.goto("/");
  await page.getByRole("tab", { name: "Créer un compte" }).click();
  await expect(page.getByRole("checkbox", { name: /J’accepte les conditions/ })).toBeVisible();
  await page.getByRole("navigation", { name: "Informations légales" }).getByRole("link", { name: "Mentions légales" }).click();
  await expect(page.getByRole("heading", { name: "Mentions légales" })).toBeVisible();
});

test("sign-up requires and records the acceptance of the terms", async ({ page, request }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `terms-${suffix}@example.test`;

  await page.goto("/");
  await page.getByRole("tab", { name: "Créer un compte" }).click();
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(`Terms-${suffix}!`);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByText("Votre compte a été créé")).toHaveCount(0);

  await page.getByRole("checkbox", { name: /J’accepte les conditions/ }).check();
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await page.goto((await confirmationUrlFor(request, email))!);
  await expect(page.getByRole("heading", { name: "Mon espace de travail" })).toBeVisible();
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Confidentialité" })).toBeVisible();

  const metadata = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((name) => name.endsWith("-auth-token"));
    return key ? JSON.parse(localStorage.getItem(key)!).user.user_metadata : null;
  });
  expect(metadata.terms_version).toBe("2026-10-09-provisoire");
  expect(Date.parse(metadata.terms_accepted_at)).not.toBeNaN();
});
