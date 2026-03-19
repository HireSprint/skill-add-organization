import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REGISTER_APP_API_KEY = Deno.env.get("REGISTER_APP_API_KEY") ?? "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Register-Key",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // Validate API key
  const apiKey = req.headers.get("X-Register-Key") ?? "";
  if (REGISTER_APP_API_KEY && apiKey !== REGISTER_APP_API_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let name: string = "";
    let description: string | null = null;
    let link: string | null = null;
    let google_play_url: string | null = null;
    let app_store_url: string | null = null;
    let cover_photo_url: string | null = null;
    let iconFile: File | null = null;

    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      name = (formData.get("name") as string) ?? "";
      description = (formData.get("description") as string) || null;
      link = (formData.get("link") as string) || null;
      google_play_url = (formData.get("google_play_url") as string) || null;
      app_store_url = (formData.get("app_store_url") as string) || null;
      cover_photo_url = (formData.get("cover_photo_url") as string) || null;
      const iconEntry = formData.get("icon");
      if (iconEntry instanceof File) iconFile = iconEntry;
    } else {
      const body = await req.json();
      name = body.name ?? "";
      description = body.description ?? null;
      link = body.link ?? null;
      google_play_url = body.google_play_url ?? null;
      app_store_url = body.app_store_url ?? null;
      cover_photo_url = body.cover_photo_url ?? null;
    }

    if (!name.trim()) {
      return new Response(JSON.stringify({ error: "name is required" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Upload icon to Storage if provided
    if (iconFile) {
      const ext = iconFile.name.split(".").pop() ?? "png";
      const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const fileName = `${slug}-${Date.now()}.${ext}`;

      // Ensure bucket exists (ignore "already exists" error)
      const { error: bucketError } = await supabase.storage.createBucket("app-icons", {
        public: true,
        fileSizeLimit: 5242880, // 5 MB
        allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
      });
      if (bucketError && !bucketError.message.toLowerCase().includes("already exists")) {
        throw bucketError;
      }

      const arrayBuffer = await iconFile.arrayBuffer();
      const { error: uploadError } = await supabase.storage
        .from("app-icons")
        .upload(fileName, arrayBuffer, {
          contentType: iconFile.type,
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("app-icons")
        .getPublicUrl(fileName);
      cover_photo_url = publicUrlData.publicUrl;
    }

    // Insert into apps_control_apps
    const { data, error } = await supabase
      .from("apps_control_apps")
      .insert({
        name: name.trim(),
        description,
        link,
        google_play_url,
        app_store_url,
        cover_photo_url,
        status: "to_start",
      })
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, app: data }), {
      status: 201,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("register-app error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message ?? "Unknown error" }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }
});
