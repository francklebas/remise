import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Task = {
  id: string;
  title: string;
  description: string;
  dueDate: string | null;
  dueTime: string | null;
  estimatedDuration: number | null;
  complexity: "low" | "medium" | "high";
};

function htmlEscape(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.email) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (user.user_metadata.notifications_enabled !== true) return new Response(JSON.stringify({ skipped: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) return new Response(JSON.stringify({ error: "RESEND_API_KEY is not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { task, action } = await request.json() as { task: Task; action: "created" | "updated" };
    const appUrl = `${Deno.env.get("APP_URL") ?? "https://boardly.francklebas.com"}/?card=${encodeURIComponent(task.id)}`;
    const subject = action === "created" ? `Nouvelle tâche : ${task.title}` : `Tâche mise à jour : ${task.title}`;
    const details = [
      task.dueDate ? `Date limite : ${task.dueDate}${task.dueTime ? ` à ${task.dueTime}` : ""}` : null,
      task.estimatedDuration ? `Durée estimée : ${task.estimatedDuration} min` : null,
      `Complexité : ${task.complexity}`,
    ].filter(Boolean).join("<br>");
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("RESEND_FROM_EMAIL") ?? "Boardly <onboarding@resend.dev>",
        to: [user.email],
        subject,
        html: `<h2>${htmlEscape(subject)}</h2><p>${htmlEscape(task.description || "Aucune description")}</p><p>${details}</p><p><a href="${appUrl}">Ouvrir la tâche dans Boardly</a></p>`,
      }),
    });
    if (!resendResponse.ok) return new Response(JSON.stringify({ error: await resendResponse.text() }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ sent: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
