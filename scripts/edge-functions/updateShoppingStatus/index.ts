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
};

async function sendExpoNotification(shopList: any, pushTokens: string[]) {
  if (!pushTokens?.length) return;

  const validTokens = pushTokens.filter(
    (t) => typeof t === "string" && (t.startsWith("ExponentPushToken") || t.startsWith("ExpoPushToken"))
  );
  if (!validTokens.length) return;

  const messages = validTokens.map((token) => ({
    to: token,
    sound: "default",
    title: "Shopping List Reminder!",
    body: `Your shopping list "${shopList.title}" is ${shopList.status} — scheduled for ${shopList.delivery_date} at ${shopList.delivery_time}. Tap to see details!`,
    data: {
      shopListId: shopList.id,
      title: shopList.title,
      content: shopList.content,
      status: shopList.status,
      screen: "events",
    },
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

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = (req.headers.get("X-Api-Key") || "").trim();
  if (!apiKey || apiKey !== (EVENTS_FUNCTION_API_KEY || "").trim()) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", message: "Invalid or missing X-Api-Key" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { id, status, user_id } = await req.json();

    if (!id) {
      return new Response(JSON.stringify({ error: "Missing ShoppingList id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: shopLData, error: shopLDataErr } = await supabase
      .from("shopping_lists")
      .update({ status })
      .eq("id", id)
      .select("*")
      .single();

    if (shopLDataErr || !shopLData) {
      return new Response(
        JSON.stringify({ error: "Shopping List not found", details: shopLDataErr?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: users, error: usersErr } = await supabase
      .from("profiles")
      .select("push_token")
      .eq("id", user_id)
      .not("push_token", "is", null)
      .neq("push_token", "");
    if (usersErr) throw usersErr;

    const pushTokens = users.map((u: any) => u.push_token).filter(Boolean);
    await sendExpoNotification(shopLData, pushTokens);

    return new Response(
      JSON.stringify({ success: true, shoppingListId: id, notified_users: pushTokens.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: "Internal Server Error", message: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
