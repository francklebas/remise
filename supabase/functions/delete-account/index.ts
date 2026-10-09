import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return json({ error: "Authentification requise." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user?.email) return json({ error: "Authentification requise." }, 401);

    const { password } = await request.json().catch(() => ({})) as { password?: unknown };
    if (typeof password !== "string" || !password) return json({ error: "Mot de passe requis." }, 400);
    const verifier = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: passwordError } = await verifier.auth.signInWithPassword({ email: user.email, password });
    if (passwordError) return json({ error: "Mot de passe incorrect." }, 403);

    // Images first: once the account is gone the user token can no longer authorize the purge.
    const mediaApiUrl = Deno.env.get("MEDIA_API_URL");
    if (mediaApiUrl) {
      const purge = await fetch(mediaApiUrl, { method: "DELETE", headers: { Authorization: authorization } });
      if (!purge.ok) return json({ error: "Suppression des images impossible, réessayez plus tard." }, 502);
    } else {
      console.warn("MEDIA_API_URL is not configured; uploaded images were not purged.");
    }

    // Workspaces, boards, columns and cards cascade from auth.users.
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) return json({ error: "Suppression du compte impossible." }, 500);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    let confirmationSent = false;
    if (resendApiKey) {
      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: Deno.env.get("RESEND_FROM_EMAIL") ?? "Remise <onboarding@resend.dev>",
          to: [user.email],
          subject: "Votre compte Remise a été supprimé",
          html: "<p>Votre compte Remise et toutes les données associées (espaces, boards, cartes et images) ont été supprimés définitivement.</p><p>Si vous n’êtes pas à l’origine de cette demande, répondez à ce message.</p>",
        }),
      });
      confirmationSent = resendResponse.ok;
    }
    return json({ deleted: true, confirmationSent });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erreur inattendue." }, 500);
  }
});
