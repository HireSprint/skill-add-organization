import { createClient } from "npm:@supabase/supabase-js@2.47.10";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const EVENTS_FUNCTION_API_KEY = Deno.env.get("EVENTS_FUNCTION_API_KEY");
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "X-Api-Key, Content-Type, Accept, Origin",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
async function sendExpoNotification(event, pushTokens) {
  if (!pushTokens || pushTokens.length === 0) return;
  const validTokens = pushTokens.filter((token) =>
    typeof token === "string" && (token.startsWith("ExponentPushToken") || token.startsWith("ExpoPushToken"))
  );
  if (validTokens.length === 0) return;
  const messages = validTokens.map((token) => ({
    to: token,
    sound: "default",
    title: "New Event Alert!",
    body: `${event.event_name} is coming up on ${new Date(event.event_date).toLocaleDateString()}. Don't miss out!`,
    data: { event_id: event.id, event_image: event.event_image, screen: "events" }
  }));
  const chunkSize = 100;
  const tickets = [];
  for (let i = 0; i < messages.length; i += chunkSize) {
    const chunk = messages.slice(i, i + chunkSize);
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("EXPO_ACCESS_TOKEN") ?? ""}`
        },
        body: JSON.stringify(chunk)
      });
      const text = await res.text();
      try {
        const json = text ? JSON.parse(text) : null;
        if (json) {
          if (Array.isArray(json)) tickets.push(...json);
          else tickets.push(json);
        }
      } catch (parseErr) {
        console.error("Error parsing Expo response:", parseErr, "raw:", text);
      }
      if (!res.ok) console.error("Expo API returned non-OK status:", res.status);
    } catch (err) {
      console.error("Error sending notification:", err);
    }
  }
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  const apiKey = (req.headers.get("X-Api-Key") || "").trim();
  if (!apiKey || apiKey !== (EVENTS_FUNCTION_API_KEY || "").trim()) {
    return new Response(JSON.stringify({ error: "Unauthorized", message: "Invalid or missing X-Api-Key" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  try {
    const { id } = await req.json();
    if (!id) {
      return new Response(JSON.stringify({ error: "Missing event id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const { data: event, error: eventErr } = await supabase.from("events").select("*").eq("id", id).single();
    if (eventErr || !event) {
      return new Response(JSON.stringify({ error: "Event not found", details: eventErr?.message }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const { data: users, error: usersErr } = await supabase.from("profiles").select("push_token").not("push_token", "is", null).neq("push_token", "");
    if (usersErr) throw usersErr;
    const pushTokens = users.map((u) => u.push_token).filter(Boolean);
    await sendExpoNotification(event, pushTokens);
    return new Response(JSON.stringify({ success: true, event_id: id, notified_users: pushTokens.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("Internal error:", err);
    return new Response(JSON.stringify({ error: "Internal Server Error", message: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
