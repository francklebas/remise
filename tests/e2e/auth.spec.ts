import { expect, test, type APIRequestContext } from "@playwright/test";

const mailpitUrl = "http://127.0.0.1:8025";

type MailpitMessage = {
  ID: string;
  To: Array<{ Address: string }>;
};

async function findConfirmationMessage(
  request: APIRequestContext,
  email: string,
) {
  const response = await request.get(`${mailpitUrl}/api/v1/messages`);
  expect(response.ok()).toBeTruthy();
  const inbox = (await response.json()) as { messages: MailpitMessage[] };
  return inbox.messages.find((message) =>
    message.To.some(({ Address }) => Address === email),
  );
}

test("a user can confirm an account and sign in with a password", async ({
  page,
  request,
}) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `boardly-${suffix}@example.test`;
  const password = `Boardly-${suffix}!`;

  await page.goto("/");
  await page.getByRole("tab", { name: "Créer un compte" }).click();
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Créer mon compte" }).click();

  await expect(page.getByText("Votre compte a été créé.")).toBeVisible();

  let messageId: string | undefined;
  await expect
    .poll(
      async () => {
        messageId = (await findConfirmationMessage(request, email))?.ID;
        return messageId;
      },
      { timeout: 10_000 },
    )
    .toBeTruthy();

  const messageResponse = await request.get(
    `${mailpitUrl}/api/v1/message/${messageId}`,
  );
  expect(messageResponse.ok()).toBeTruthy();
  const message = (await messageResponse.json()) as { Text: string };
  const confirmationUrl = message.Text.match(/https?:\/\/[^\s)]+/)?.[0];
  expect(confirmationUrl).toBeTruthy();

  await page.goto(confirmationUrl!);
  await expect(
    page.getByRole("heading", { name: "Mon espace de travail" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();

  await expect(
    page.getByRole("heading", { name: "Mon espace de travail" }),
  ).toBeVisible();
});
