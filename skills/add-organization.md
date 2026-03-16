---
name: add-organization
description: Creates a new organization config file, sets up google-service folder, provisions Supabase resources, and launches the app for verification. Triggered when user passes a JSON file with org data.
---

# Skill: Add Organization

Use this skill when the user wants to add a new organization to the multistore app. The user will provide:
1. A JSON file path with the new organization's data
2. Optionally, a `google-services.json` file path for Firebase/push notifications

---

## Pre-flight Checks (MUST pass before doing anything else)

Run these two checks immediately. If either fails, **stop and inform the user** — do not create any files or folders.

### Check 1: Supabase MCP Connection

Verify the Supabase MCP server is reachable by calling:

```
mcp: list_organizations
```

- **If it responds** (even with an empty list): connection is active. Proceed.
- **If it throws an error or times out**: stop and inform the user:
  > "The Supabase MCP server is not reachable. Please make sure the MCP server is running and configured in your Claude Code settings before using this skill."

### Check 2: Required Fields in Input JSON

After reading the JSON, verify these two fields are present and non-empty:
- `supabase_url`
- `supabase_key`

If either is missing or empty, stop and inform the user:
> "Cannot proceed: `supabase_url` and `supabase_key` are required. Please add them to your JSON and try again."

**Do not create any files, folders, or database resources until both checks pass.**

---

## Step 0: Read and Validate Input

The user will pass either:
- A path to a JSON file: `add-organization ./new-org-data.json`
- Or paste the JSON directly in the message

### Expected Input JSON Format

```json
{
  "name": "Store Name",
  "CFBundleDisplayName": "Short Name",
  "slug": "storeslug",
  "supabase_url": "https://xxxxx.supabase.co",
  "supabase_key": "eyJ...",
  "storeId_supabase": 1,
  "organizations": [
    {
      "id_organization": 123,
      "id_store_supabase": "uuid-here"
    }
  ],
  "colors": ["#HEX1", "#HEX2"],
  "colorText": "#HEX",
  "bundleIdentifier": "dev.xcirculars.storename",
  "package": "dev.xcirculars.storename",
  "adaptiveIcon": {
    "backgroundColor": "#HEX"
  },
  "splash": {
    "backgroundColor": "#HEX",
    "darkBackgroundColor": "#121212"
  },
  "eas": {
    "projectId": "expo-eas-uuid"
  }
}
```

> **Note:** `iconFileName`, `loginImageFileName`, and `backgroundImageFileName` are no longer needed — image filenames are derived automatically from the store name (see Step 0.1).

Read the JSON file using the Read tool or parse it from the user's message.

### Step 0.1: Extract and Normalize the Store Name

The `name` field in the JSON may contain the store name followed by an address (e.g., `"Antillana - 490 W 207th St, New York, NY 10034"`). You must extract only the store name.

**Rules:**
1. If `name` contains ` - ` (space-dash-space), take everything **before** the first ` - `.
2. If `name` contains a comma followed by a city/state pattern (e.g., `"Store, New York, NY"`), take everything **before** the first comma.
3. Otherwise, use `name` as-is.
4. Trim any trailing whitespace from the result.

**Examples:**
- `"Antillana - 490 W 207th St, New York, NY 10034"` → `STORE_NAME = "Antillana"`
- `"Fresh Market, Brooklyn, NY"` → `STORE_NAME = "Fresh Market"`
- `"La Placita"` → `STORE_NAME = "La Placita"`

**Derived values** (compute once, use throughout):
- `STORE_NAME` — the clean store name (e.g., `Antillana`)
- `STORE_NAME_LOWER` — lowercase, spaces replaced with hyphens (e.g., `antillana`)
- `CONFIG_NAME` — `"{STORE_NAME} Marketplace"` (e.g., `"Antillana Marketplace"`)
- `ICON_FILE` — `"{STORE_NAME_LOWER}.png"` (e.g., `antillana.png`)
- `LOGIN_FILE` — `"{STORE_NAME_LOWER}NoBack.png"` (e.g., `antillanaNoBack.png`)

---

## Step 1: Determine Next Organization Number

Count the existing files in `configs/`:

```bash
ls configs/ | grep "^organization[0-9]" | wc -l
```

The next number = current count + 1. Example: if there are 10 files (`organization1.js` through `organization10.js`), the new one is `organization11`.

Store this as `ORG_NUMBER` (e.g., `11`) and `ORG_KEY` (e.g., `organization11`).

---

## Step 2: Create the Config File

Create `configs/organizationN.js` following the exact structure of existing files.

All asset paths use the pattern `./assets/organizationN/filename.ext`.

Use the derived values from Step 0.1:
- `name` field → `CONFIG_NAME` (e.g., `"Antillana Marketplace"`)
- Icon/backgroundImage/iconHeader → `ICON_FILE` (e.g., `antillana.png`)
- loginImage → `LOGIN_FILE` (e.g., `antillanaNoBack.png`)

Template:

```js
module.exports = {
  name: "<CONFIG_NAME>",
  storeId_supabase: <storeId_supabase>,
  organizations: [
    // Array from input
  ],
  CFBundleDisplayName: "<CFBundleDisplayName>",
  supabase_url: "<supabase_url>",
  supabase_key: "<supabase_key>",
  slug: "<slug>",
  colors: [/* colors array */],
  colorText: "<colorText>",
  owner: "xcircular",
  bundleIdentifier: "<bundleIdentifier>",
  package: "<package>",
  icon: "./assets/organizationN/<ICON_FILE>",
  backgroundImage: "./assets/organizationN/<ICON_FILE>",
  loginImage: "./assets/organizationN/<LOGIN_FILE>",
  iconHeader: "./assets/organizationN/<ICON_FILE>",
  googleServicesFile: "./google-service/organizationN/google-services.json",
  adaptiveIcon: {
    foregroundImage: "./assets/organizationN/<ICON_FILE>",
    backgroundColor: "<adaptiveIcon.backgroundColor>",
  },
  splash: {
    image: "./assets/organizationN/<ICON_FILE>",
    imageWidth: 200,
    resizeMode: "contain",
    backgroundColor: "<splash.backgroundColor>",
    darkBackgroundColor: "<splash.darkBackgroundColor>",
  },
  eas: {
    projectId: "<eas.projectId>",
  },
  appdefinition: {
    colors: {
      text: {
        dark: "#ffffff",
        light: "#000000",
      },
    },
  },
};
```

Replace `N` with the actual org number and all placeholders with derived values throughout.

---

## Step 3: Create Assets Folder

Create the assets directory for this organization:

```bash
mkdir -p assets/organizationN
```

Inform the user: "The assets folder `assets/organizationN/` has been created. Please add these image files:
- `<ICON_FILE>` (app icon and background image — e.g., `antillana.png`)
- `<LOGIN_FILE>` (login screen image with transparent background — e.g., `antillanaNoBack.png`)"

---

## Step 4: Set Up Google Service Folder

Create the google-service directory for this organization — **empty, nothing inside**:

```bash
mkdir -p google-service/organizationN
```

That's all. Do not create any files inside this folder.

Inform the user: "The folder `google-service/organizationN/` has been created. Add your `google-services.json` file there before building."

---

## Step 5: Verify Supabase Project via MCP

Extract the `project_ref` from the `supabase_url`:
- URL format: `https://PROJECTREF.supabase.co`
- Extract: everything between `https://` and `.supabase.co`
- Example: `https://sxgdadvcqsqcxswlrtaf.supabase.co` → `PROJECT_REF=sxgdadvcqsqcxswlrtaf`

Use the Supabase MCP tool `list_projects` to confirm the project exists and is accessible:

```
mcp: list_projects
```

Look for the project whose `id` matches `PROJECT_REF`.

**If found:** Project is ready. Proceed to Step 6.

**If not found:** Inform the user:
> "The project `<PROJECT_REF>` was not found in your Supabase account. Please:
> 1. Create a new project at supabase.com/dashboard
> 2. Update `supabase_url` and `supabase_key` in your input JSON with the new project's values
> 3. Re-run `/add-organization` with the corrected JSON"
>
> **Do not proceed with schema provisioning until the project is confirmed.**

---

## Step 6: Provision Supabase Schema (Tables, Buckets, Edge Functions)

All provisioning is done via the **Supabase MCP** — no CLI or psql required.

### 6.1 Apply SQL schema migration

Read the full SQL file:
```
Read: script supabase/scripts/clone-supabase-project.sql
```

Then execute it against the target project using the MCP:

```
mcp: apply_migration
  project_ref: <PROJECT_REF>
  name: initial_schema
  query: <full contents of clone-supabase-project.sql>
```

This single call creates all of the following in order:
- Extensions (`uuid-ossp`, `pgcrypto`)
- Helper functions and triggers (`set_updated_at`, `handle_new_user`, etc.)
- 15 tables: `stores`, `profiles`, `shopping_lists`, `loyalty_cards`, `events`, `banners`, `catering_menus`, `quick_access`, `catering_requests`, `circulars`, `logos`, `recipes`, `recipe_votes`, `recipe_favorites`, `job_applications`
- Indexes and RPC function (`vote_recipe`)
- Row Level Security (RLS) policies for all tables
- 10 Storage buckets with their access policies

**If the migration fails** (e.g. tables already exist), check with:
```
mcp: list_tables
  project_ref: <PROJECT_REF>
  schema: public
```

If tables already exist, inform the user and skip to 6.2 (they may have already run the schema).

### 6.2 Deploy Edge Functions

Read each edge function source file and deploy via MCP. The source files are in `script supabase/scripts/edge-functions/`.

Deploy each function using:
```
mcp: deploy_edge_function
  project_ref: <PROJECT_REF>
  name: <function_name>
  entrypoint_path: script supabase/scripts/edge-functions/<function_name>/index.ts
  verify_jwt: <true|false>
```

Deploy all 6 functions with these settings:

| Function name         | verify_jwt |
|-----------------------|------------|
| `create-store-folders`| `true`     |
| `loyalty-barcodes`    | `true`     |
| `send-notification`   | `true`     |
| `delete-account`      | `true`     |
| `create-event`        | `false`    |
| `updateShoppingStatus`| `false`    |

### 6.3 Set required secrets

After deploying edge functions, remind the user to configure secrets manually in the Supabase Dashboard or via MCP if supported:

```
mcp: set_secrets
  project_ref: <PROJECT_REF>
  secrets:
    EVENTS_FUNCTION_API_KEY: <value>
    EXPO_ACCESS_TOKEN: <value>
```

> `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically into edge functions — no need to set them.

If the MCP does not support `set_secrets`, instruct the user to add them manually:
> "Go to `https://supabase.com/dashboard/project/<PROJECT_REF>/settings/functions` and add:
> - `EVENTS_FUNCTION_API_KEY`
> - `EXPO_ACCESS_TOKEN`"

### 6.4 Verify stores table

Check whether the `stores` table has records matching the `id_store_supabase` UUIDs from the input JSON:

```
mcp: execute_sql
  project_ref: <PROJECT_REF>
  query: SELECT id, name FROM public.stores LIMIT 20;
```

If the table is empty, remind the user:
> "The `stores` table is empty. Add at least one store record before launching the app. Each `id_store_supabase` UUID in your config must correspond to a row in `stores`."

---

## Step 7: Build and Run the App

Once all files are in place, run these two commands sequentially. Replace `N` with the org number from Step 1.

**7.1 — Prebuild for iOS:**

```bash
ORGANIZATION=organizationN yarn prebuild:ios
```

Wait for this to complete before continuing.

**7.2 — Launch on iOS simulator:**

```bash
ORGANIZATION=organizationN yarn ios
```

Inform the user: "Running prebuild and launching the app with `ORGANIZATION=organizationN`. Check the iOS simulator to verify the new organization loads correctly."

---

## Summary Checklist

After completing all steps, provide a summary:

```
✓ Config file created:        configs/organizationN.js
✓ Assets folder created:      assets/organizationN/
✓ Google service folder:      google-service/organizationN/ (empty — add google-services.json manually)
? Supabase project found:     [Found via MCP / Not found — create manually]
? SQL schema applied:         [Migration applied / Already existed / Failed]
? Edge functions deployed:    [6/6 deployed / X/6 deployed]
? Secrets configured:         [Set via MCP / Pending manual action in Dashboard]
? Stores table:               [N stores found / Empty — needs manual data]
✓ Prebuild iOS:               ORGANIZATION=organizationN yarn prebuild:ios
✓ App launched:               ORGANIZATION=organizationN yarn ios
```

**Pending manual actions (remind the user):**
- Add image assets to `assets/organizationN/`
- Add `google-services.json` to `google-service/organizationN/`
- Set edge function secrets: `EVENTS_FUNCTION_API_KEY` and `EXPO_ACCESS_TOKEN`
- Add store records to the Supabase `stores` table matching `id_store_supabase` UUIDs in config

---

## Notes

- Never skip creating the `google-service/organizationN/` folder — the app will crash at build time without it. Create the folder only, no files inside.
- The `owner` field is always `"xcircular"` — do not change it.
- `appdefinition.colors.text` always uses `dark: "#ffffff"` and `light: "#000000"` — do not customize unless explicitly asked.
- `imageWidth` in `splash` is always `200` — do not change it.
- Asset filenames are derived from the store name and are case-sensitive on Linux build servers.
