import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: stores, error: storesError } = await supabase
      .from("stores")
      .select("id, name");

    if (storesError) throw storesError;

    if (!stores || stores.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No stores found", foldersCreated: [] }),
        { headers: { "Content-Type": "application/json" }, status: 200 }
      );
    }

    const results = [];

    for (const store of stores) {
      const folderPath = `${store.id}/.keep`;
      const { data: existing } = await supabase.storage.from("circulars").list(store.id);

      if (!existing || existing.length === 0) {
        const emptyContent = new Blob([""], { type: "text/plain" });
        const { error: uploadError } = await supabase.storage
          .from("circulars")
          .upload(folderPath, emptyContent, { contentType: "text/plain", upsert: true });

        results.push({
          storeId: store.id,
          storeName: store.name,
          success: !uploadError,
          ...(uploadError && { error: uploadError.message }),
        });
      } else {
        results.push({ storeId: store.id, storeName: store.name, success: true, alreadyExists: true });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Initialized folders for ${results.filter((r) => r.success).length} stores`,
        foldersCreated: results,
        totalStores: stores.length,
      }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Unknown error" }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
});
