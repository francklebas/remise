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

  const response = await request.get(`${mailpitUrl}/api/v1/message/${messageId}`);
  const message = (await response.json()) as { Text: string };
  return message.Text.match(/https?:\/\/[^\s)]+/)?.[0];
}

test("highlights an editable code block without changing its persisted language", async ({ page, request, context }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `code-${suffix}@example.test`;
  const password = `Code-${suffix}!`;

  await page.goto("/");
  await page.getByRole("tab", { name: "Créer un compte" }).click();
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await page.goto((await confirmationUrlFor(request, email))!);
  await expect(page.getByRole("heading", { name: "Mon espace de travail" })).toBeVisible();

  await page.getByRole("button", { name: "Ajouter une carte" }).first().click();
  await page.locator("#todo article.card").last().dblclick();
  const dialog = page.getByRole("dialog");
  await dialog.locator(".content-editor summary").click();
  await dialog.getByRole("button", { name: "Bloc de code" }).click();

  const code = dialog.locator(".remise-code-block code");
  await dialog.getByLabel("Langage du bloc de code").selectOption("ts");
  await dialog.locator(".remise-code-block pre").click();
  await page.keyboard.type('const value: number = 42');
  await expect(code.locator(".hljs-keyword")).toBeVisible();

  await page.keyboard.press("End");
  await page.keyboard.type('\nconst other: number = 7');
  await expect(code.locator(".hljs-keyword")).toHaveCount(2);
  await dialog.getByLabel("Langage du bloc de code").selectOption("sh");
  await expect(dialog.getByLabel("Langage du bloc de code")).toHaveValue("sh");

  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await dialog.getByRole("button", { name: "Copier le code" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("const value: number = 42\nconst other: number = 7");

  await dialog.getByRole("button", { name: "Markdown" }).click();
  await expect(dialog.getByLabel("Markdown de la description")).toHaveValue(/```sh/);
  await dialog.getByLabel("Markdown de la description").fill("```foobar\ndo something\n```");
  await dialog.getByRole("button", { name: "Rich Text" }).click();
  await expect(dialog.getByLabel("Langage du bloc de code")).toHaveValue("foobar");
  await expect(dialog.locator(".remise-code-block code")).toHaveText("do something");
});
