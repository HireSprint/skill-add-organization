import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.47.10";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVENTS_FUNCTION_API_KEY = Deno.env.get("EVENTS_FUNCTION_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "X-Api-Key, Content-Type, Accept, Origin",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

async function sendExpoNotification(
  pushTokens: string[],
  notif: { title?: string; body: string; data?: Record<string, unknown> }
) {
  if (!pushTokens?.length) return;

  const validTokens = pushTokens.filter(
    (t) => typeof t === "string" && (t.startsWith("ExponentPushToken") || t.startsWith("ExpoPushToken"))
  );
  if (!validTokens.length) return;

  const messages = validTokens.map((token) => ({
    to: token,
    sound: "default",
    title: notif.title || "Notification",
    body: notif.body || "",
    data: notif.data || {},
  }));

  const chunkSize = 100;
  for (let i = 0; i < messages.length; i += chunkSize) {
    const chunk = messages.slice(i, i + chunkSize);
    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("EXPO_ACCESS_TOKEN") ?? ""}`,
        },
        body: JSON.stringify(chunk),
      });
    } catch (err) {
      console.error("Error sending notification:", err);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: corsHeaders });

  const apiKey = (req.headers.get("X-Api-Key") || "").trim();
  if (!apiKey || apiKey !== (EVENTS_FUNCTION_API_KEY || "").trim()) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", message: "Invalid or missing X-Api-Key" }),
      { status: 401, headers: corsHeaders }
    );
  }

  try {
    const { message, data, title } = await req.json();
    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Missing or invalid message" }), { status: 400, headers: corsHeaders });
    }

    const { data: users, error: usersErr } = await supabase
      .from("profiles")
      .select("push_token")
      .not("push_token", "is", null)
      .neq("push_token", "");
    if (usersErr) throw usersErr;

    const pushTokens = (users ?? []).map((u: any) => u.push_token).filter(Boolean);

    await sendExpoNotification(pushTokens, {
      title: title || "Notification",
      body: message,
      data: data || {},
    });

    return new Response(JSON.stringify({ success: true, notified_count: pushTokens.length }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: "Internal Server Error", message: err?.message ?? String(err) }),
      { status: 500, headers: corsHeaders }
    );
  }
});
