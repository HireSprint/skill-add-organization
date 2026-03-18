---
name: add-organization
description: Creates a new organization config file, sets up google-service folder, provisions Supabase resources, and launches the app for verification. Triggered when user passes a folder containing a JSON file and a logo image, or a JSON file path directly.
---

# Skill: Add Organization

Use this skill when the user wants to add a new organization to the multistore app. The user will provide:
1. A **folder path** containing:
   - A `.json` file with the organization's data
   - An image file (`.png`, `.jpg`, `.jpeg`, or `.webp`) as the logo
2. Optionally, a `google-services.json` file path for Firebase/push notifications

The user can also pass a plain JSON file path (legacy mode) — in that case no logo is auto-copied and the user must add images manually (Step 3 fallback).

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

The user can pass:
- **A folder** (preferred): `add-organization ./antillana/` — the folder must contain one `.json` file and one image file (`.png`, `.jpg`, `.jpeg`, or `.webp`)
- A single JSON file: `add-organization ./new-org-data.json`
- **Multiple JSON files for the same organization**: `add-organization ./store1.json ./store2.json ./store3.json`
- Or paste the JSON directly in the message

### Folder input detection

If the user passes a folder path (not ending in `.json`), run:

```bash
ls "<folder_path>"
```

From the listing, identify:
- **JSON files** — all `.json` files found, **excluding** `google-services.json`. Store their full paths as an ordered list.
  - 1 JSON file → single-store mode (same as passing one JSON file)
  - 2+ JSON files → multi-store mode (same as passing multiple JSON files — see "Multi-file behavior" below)
- **Logo image** — the **first** image file found with extension `.png`, `.jpg`, `.jpeg`, or `.webp` (alphabetical order). Store its full path as `LOGO_SOURCE_PATH`. Ignore any additional image files.

If no JSON file is found in the folder, stop and inform the user:
> "No JSON file found in the folder `<folder_path>`. Please make sure the folder contains at least one `.json` file with the organization data."

If no image file is found, set `LOGO_SOURCE_PATH = null` and continue — the user will need to add images manually in Step 3.

Read all detected JSON files and proceed as normal (single or multi-store depending on count).

### Multi-file behavior

When **multiple JSON files** are passed:
- All files must share the same `supabase_url`, `slug`, and core org fields (`colors`, `bundleIdentifier`, etc.)
- Use the **first file** as the base for all org-level fields (name, colors, slug, etc.)
- Each file represents **one store location** to be inserted into the `stores` table
- Collect the resulting `{ id_organization, id_store_supabase }` entry from **each file** and merge them all into a single `organizations` array in the config
- If an `organizationN.js` config already exists for this slug, **append** the new store entries to its existing `organizations` array instead of creating a new config file

### Expected Input JSON Format

The JSON format is the same as always — no new fields are required. The `name` field already contains both the store name and the address, and Step 0.1 explains how to separate them.

```json
{
  "name": "Store Name - 490 W 207th St, New York, NY 10034",
  "CFBundleDisplayName": "Short Name",
  "slug": "storeslug",
  "supabase_url": "https://xxxxx.supabase.co",
  "supabase_key": "eyJ...",
  "storeId_supabase": 1,
  "id_organization": 123,
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
    "projectId": ""
  }
}
```

The JSON may optionally include extra store fields at the top level (`latitude`, `longitude`, `phone`). If present, include them in the `stores` table insert. If absent, insert `NULL` for those columns.

> **Note:** `id_store_supabase` is **NOT** provided in the input — it is generated by Supabase after inserting the store and written back into the config automatically (see Step 6.5).

> **Note:** `iconFileName`, `loginImageFileName`, and `backgroundImageFileName` are no longer needed — image filenames are derived automatically from the store name (see Step 0.1).

Read each JSON file using the Read tool or parse them from the user's message.

### Required fields per JSON file

After reading each JSON, verify it has:
- `name` — contains the store name and address (will be split in Step 0.1)
- `id_organization` — the store's internal organization ID

### Step 0.1: Extract Store Name and Address from `name`

The `name` field always contains the store name followed by the address. You must split them into two separate values: `STORE_NAME` and `STORE_ADDRESS`.

**Splitting rules:**
1. If `name` contains ` - ` (space-dash-space): everything **before** the first ` - ` is the name; everything **after** is the address.
2. If `name` contains a `, ` (comma-space) but no ` - `: everything **before** the first `, ` is the name; everything **after** is the address.
3. If `name` has no separator: use `name` as-is for `STORE_NAME` and leave `STORE_ADDRESS` as `NULL`.
4. Trim any trailing whitespace from both values.

**Examples:**
- `"Antillana - 490 W 207th St, New York, NY 10034"` → `STORE_NAME = "Antillana"`, `STORE_ADDRESS = "490 W 207th St, New York, NY 10034"`
- `"Fresh Market, 123 Main St, Brooklyn, NY"` → `STORE_NAME = "Fresh Market"`, `STORE_ADDRESS = "123 Main St, Brooklyn, NY"`
- `"La Placita"` → `STORE_NAME = "La Placita"`, `STORE_ADDRESS = NULL`

**Derived values** (compute once, use throughout):
- `STORE_NAME` — the clean store name (e.g., `Antillana`)
- `STORE_ADDRESS` — the address portion extracted from `name` (e.g., `490 W 207th St, New York, NY 10034`)
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
    // Will be populated in Step 6.6 after store(s) are inserted into Supabase
    // Each entry: { id_organization: <number>, id_store_supabase: "<uuid>" }
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
    projectId: "",
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

## Step 3: Create Assets Folder and Copy Logo

Create the assets directory for this organization:

```bash
mkdir -p assets/organizationN
```

### If `LOGO_SOURCE_PATH` is set (folder input with image detected)

Copy the logo into the assets folder with the correct filename:

```bash
cp "<LOGO_SOURCE_PATH>" "assets/organizationN/<ICON_FILE>"
```

- `<ICON_FILE>` is derived from `STORE_NAME_LOWER` (e.g., `antillana.png`). Match the extension of the source image (e.g., if the source is `.jpg`, `ICON_FILE` becomes `antillana.jpg`).
- This file serves as the **icon**, **backgroundImage**, **iconHeader**, and **splash image** in the config.

After copying, inform the user:
> "Logo copied to `assets/organizationN/<ICON_FILE>`."
>
> Still needed — please add manually:
> - `<LOGIN_FILE>` (login screen image with transparent background — e.g., `antillanaNoBack.png`)"

### If `LOGO_SOURCE_PATH` is null (no image in folder, or plain JSON input)

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

The source code for all 6 edge functions lives inside this skill project, in the `edge-functions/` folder. Read each file and deploy it using the MCP.

For each function, first read the file:
```
Read: edge-functions/<function_name>/index.ts
```

Then deploy using:
```
mcp: deploy_edge_function
  project_ref: <PROJECT_REF>
  name: <function_name>
  files: [{ name: "index.ts", content: <file contents> }]
  verify_jwt: <true|false>
```

Deploy all 6 functions with these settings:

| Function name          | File path                                      | verify_jwt |
|------------------------|------------------------------------------------|------------|
| `create-store-folders` | `edge-functions/create-store-folders/index.ts` | `true`     |
| `loyalty-barcodes`     | `edge-functions/loyalty-barcodes/index.ts`     | `true`     |
| `send-notification`    | `edge-functions/send-notification/index.ts`    | `true`     |
| `delete-account`       | `edge-functions/delete-account/index.ts`       | `true`     |
| `create-event`         | `edge-functions/create-event/index.ts`         | `false`    |
| `updateShoppingStatus` | `edge-functions/updateShoppingStatus/index.ts` | `false`    |

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

### 6.4 Verify stores table and check for existing store

A chain can have multiple locations with the same store name — so always check by **address**, not by name. For each JSON file, run:

```
mcp: execute_sql
  project_ref: <PROJECT_REF>
  query: SELECT id, name, address FROM public.stores WHERE address = '<STORE_ADDRESS>';
```

Use the `STORE_ADDRESS` extracted in Step 0.1.

**If `STORE_ADDRESS` is NULL** (no address in the name field): skip the duplicate check and proceed directly to insert in Step 6.5.

**If a record is returned:** This exact location already exists. Do **not** insert again. Use the existing `id` as `id_store_supabase` and proceed to Step 6.6. Inform the user:
> "Store at `<STORE_ADDRESS>` already exists in the `stores` table (id: `<existing_uuid>`). Skipping insert."

**If no record is returned:** The store does not exist at this address. Proceed to insert it in Step 6.5.

### 6.5 Insert store(s) into the `stores` table

For each JSON file whose store was **not** found in Step 6.4, insert a new record:

```
mcp: execute_sql
  project_ref: <PROJECT_REF>
  query: |
    INSERT INTO public.stores (name, address, latitude, longitude, phone)
    VALUES (
      '<STORE_NAME>',
      '<STORE_ADDRESS or NULL>',
      <latitude from JSON top-level, or NULL>,
      <longitude from JSON top-level, or NULL>,
      '<phone from JSON top-level, or NULL>'
    )
    RETURNING id;
```

- `STORE_NAME` and `STORE_ADDRESS` come from the extraction in Step 0.1
- `latitude`, `longitude`, `phone` come from the JSON's **top-level fields** (if present). If absent, use `NULL` (without quotes)
- String values must be quoted; numeric and NULL values must not be quoted
- **Capture the returned `id` UUID** — this becomes `id_store_supabase` for this store entry

Repeat for every JSON file that needed insertion. After all inserts, you will have one UUID per file (either from an existing row or from the new insert).

**If an insert fails**, inform the user with the error and stop.

### 6.6 Update config file with store UUIDs

After all stores are verified/inserted, build the `organizations` array using the data from each JSON file:

```js
organizations: [
  { id_organization: <id_organization from file 1>, id_store_supabase: "<UUID from step 6.4/6.5 for file 1>" },
  { id_organization: <id_organization from file 2>, id_store_supabase: "<UUID from step 6.4/6.5 for file 2>" },
  // ... one entry per JSON file
]
```

**If the config file is being created now (single-file flow or first batch):**
- Write the full `organizations` array into the new `configs/organizationN.js` as part of Step 2

**If the config file already exists (adding more stores to an existing org):**
- Read the existing `configs/organizationN.js`
- Append the new `{ id_organization, id_store_supabase }` entries to its existing `organizations` array
- Write the updated file

Confirm to the user which UUIDs were inserted (or reused) and how the `organizations` array now looks.

---

## Step 7: Build and Run the App

Once all files are in place, run these commands sequentially in the terminal. Replace `N` with the org number from Step 1.

### iOS

**7.1 — Prebuild for iOS:**

```bash
ORGANIZATION=organizationN yarn prebuild:ios
```

Wait for this to complete before continuing. This regenerates the native iOS project files from the JS config.

**7.2 — Launch on iOS simulator:**

```bash
ORGANIZATION=organizationN yarn ios
```

Inform the user:
> "Prebuild iOS complete. Launching `organizationN` in the iOS simulator — check that the app opens correctly."

---

### Android

**7.3 — Verify `google-services.json` before prebuild:**

Check that the file exists at:

```
google-service/organizationN/google-services.json
```

Use the Glob tool to verify:

```
google-service/organizationN/google-services.json
```

- **If the file exists:** proceed to 7.4.
- **If the file is missing:** stop and ask the user:
  > "I need the `google-services.json` file before running the Android prebuild. Please provide it and I'll place it in `google-service/organizationN/` and continue."

Do **not** run `yarn prebuild:android` until this file is confirmed present.

**7.4 — Prebuild for Android:**

```bash
ORGANIZATION=organizationN yarn prebuild:android
```

Wait for this to complete before continuing.

**7.5 — Launch on Android emulator:**

```bash
ORGANIZATION=organizationN yarn android
```

Inform the user:
> "Prebuild Android complete. Launching `organizationN` in the Android emulator — check that the app opens correctly."

---

## Summary Checklist

After completing all steps, provide a summary:

```
✓ Config file created/updated: configs/organizationN.js
✓ Assets folder created:       assets/organizationN/
? Logo copied:                 [✓ assets/organizationN/<ICON_FILE> copied / ✗ Add manually]
✓ Google service folder:       google-service/organizationN/ (empty — add google-services.json manually)
? Supabase project found:      [Found via MCP / Not found — create manually]
? SQL schema applied:          [Migration applied / Already existed / Failed]
? Edge functions deployed:     [6/6 deployed / X/6 deployed]
? Secrets configured:          [Set via MCP / Pending manual action in Dashboard]
? Stores inserted:             [N new stores inserted / N already existed — UUIDs reused]
  - <STORE_NAME>: <uuid>  (inserted | already existed)
  - ...
✓ Config updated:              organizations[] now has N entries with id_store_supabase UUIDs
✓ Prebuild iOS:                ORGANIZATION=organizationN yarn prebuild:ios
✓ App launched (iOS):          ORGANIZATION=organizationN yarn ios
✓ Prebuild Android:            ORGANIZATION=organizationN yarn prebuild:android
✓ App launched (Android):      ORGANIZATION=organizationN yarn android
```

**Pending manual actions (remind the user):**
- Add `<LOGIN_FILE>` (transparent background version) to `assets/organizationN/` — if not already present
- If logo was NOT auto-copied: add `<ICON_FILE>` to `assets/organizationN/`
- Add `google-services.json` to `google-service/organizationN/`
- Set edge function secrets: `EVENTS_FUNCTION_API_KEY` and `EXPO_ACCESS_TOKEN`

---

## Notes

- Never skip creating the `google-service/organizationN/` folder — the app will crash at build time without it. Create the folder only, no files inside.
- The `owner` field is always `"xcircular"` — do not change it.
- `appdefinition.colors.text` always uses `dark: "#ffffff"` and `light: "#000000"` — do not customize unless explicitly asked.
- `imageWidth` in `splash` is always `200` — do not change it.
- Asset filenames are derived from the store name and are case-sensitive on Linux build servers.
