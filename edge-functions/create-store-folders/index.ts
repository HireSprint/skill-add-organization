import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: stores, error: storesError } = await supabase
      .from("stores")
      .select("id, name");

    if (storesError) {
      throw storesError;
    }

    if (!stores || stores.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No stores found to create folders for",
          foldersCreated: []
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const results: any[] = [];

    for (const store of stores) {
      const folderPath = `${store.id}/.keep`;

      const { data: existing } = await supabase.storage
        .from("circulars")
        .list(store.id);

      if (!existing || existing.length === 0) {
        const emptyContent = new Blob([""], { type: "text/plain" });

        const { error: uploadError } = await supabase.storage
          .from("circulars")
          .upload(folderPath, emptyContent, {
            contentType: "text/plain",
            upsert: true,
          });

        if (uploadError) {
          console.error(`Error creating folder for store ${store.name}:`, uploadError);
          results.push({
            storeId: store.id,
            storeName: store.name,
            success: false,
            error: uploadError.message,
          });
        } else {
          results.push({
            storeId: store.id,
            storeName: store.name,
            success: true,
          });
        }
      } else {
        results.push({
          storeId: store.id,
          storeName: store.name,
          success: true,
          alreadyExists: true,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        message: `Initialized folders for ${successCount} stores`,
        foldersCreated: results,
        totalStores: stores.length,
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error creating store folders:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || "Unknown error",
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
