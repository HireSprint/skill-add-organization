import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabaseClient = await import("jsr:@supabase/supabase-js@2");
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const jwt = authHeader.replace(/^Bearer\s+/i, "");

    const { createClient } = supabaseClient;
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const serviceClient = createClient(url, service);

    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: userErr?.message || "No user" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userId = userRes.user.id;

    await Promise.allSettled([
      userClient.from("user_coupon_clipping").delete().eq("user_id", userId),
      userClient.from("loyalty_cards").delete().eq("user_id", userId),
    ]);

    const { error: profileDeleteError } = await userClient
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (profileDeleteError) {
      return new Response(JSON.stringify({ error: profileDeleteError.message }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { error: adminDeleteErr } = await serviceClient.auth.admin.deleteUser(userId);
    if (adminDeleteErr) {
      return new Response(JSON.stringify({ error: adminDeleteErr.message }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
