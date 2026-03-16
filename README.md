# add-organization

Plugin para Claude Code que automatiza el proceso completo de incorporar una nueva organización a una app multitienda en Expo. Con un solo comando, Claude crea los archivos de configuración, prepara las carpetas de assets, provisiona el proyecto Supabase (tablas, buckets, edge functions) y lanza la app para verificación visual.

---

## ¿Qué hace?

Al ejecutar el skill, Claude realiza automáticamente:

1. **Crea el archivo de configuración** — genera `configs/organizationN.js` con todos los parámetros de la organización
2. **Prepara la carpeta de assets** — crea `assets/organizationN/` e indica qué imágenes debes agregar
3. **Configura Firebase** — crea `google-service/organizationN/google-services.json` (o un placeholder si no tienes el archivo)
4. **Verifica el proyecto Supabase** — confirma que el proyecto existe vía MCP
5. **Provisiona el esquema SQL** — crea las 15 tablas, índices, políticas RLS y 10 buckets de storage
6. **Despliega las Edge Functions** — sube las 6 funciones necesarias para la app
7. **Lanza la app** — ejecuta `ORGANIZATION=organizationN npx expo start --clear` para verificación

---

## Requisitos

- [Claude Code](https://claude.ai/code) instalado
- Proyecto Expo/React Native con la estructura multiorganización de xcircular
- Proyecto creado en [supabase.com](https://supabase.com) con el `project_ref` correspondiente
- MCP de Supabase configurado en Claude Code
- (Opcional) Archivo `google-services.json` del proyecto Firebase

---

## Instalación

### 1. Agregar el marketplace

```
/plugin marketplace add xcircular/add-organization-plugin
```

### 2. Instalar el plugin

```
/plugin install add-organization@xcircular-plugins
```

### 3. Verificar instalación

```
/plugin
```

Deberías ver `add-organization` en la lista de plugins instalados.

---

## Uso

### Opción A — Pasando la ruta del archivo JSON

```
/add-organization ./nueva-org.json
```

### Opción B — Pasando el JSON directamente en el mensaje

```
/add-organization

{
  "name": "Tienda Nueva",
  "slug": "tiendanueva",
  ...
}
```

### Opción C — Con archivo google-services.json

```
/add-organization ./nueva-org.json ./google-services.json
```

---

## Formato del JSON de entrada

```json
{
  "name": "Nombre de la Tienda",
  "CFBundleDisplayName": "Nombre Corto",
  "slug": "nombretienda",
  "supabase_url": "https://PROJECTREF.supabase.co",
  "supabase_key": "eyJ...",
  "storeId_supabase": 1,
  "organizations": [
    {
      "id_organization": 123,
      "id_store_supabase": "uuid-aqui"
    }
  ],
  "colors": ["#FF0000", "#FFFFFF"],
  "colorText": "#000000",
  "bundleIdentifier": "dev.xcirculars.nombretienda",
  "package": "dev.xcirculars.nombretienda",
  "adaptiveIcon": {
    "backgroundColor": "#FF0000"
  },
  "splash": {
    "backgroundColor": "#FF0000",
    "darkBackgroundColor": "#121212"
  },
  "eas": {
    "projectId": "expo-eas-uuid"
  },
  "iconFileName": "nombretienda.png",
  "loginImageFileName": "nombretiendaNoBack.png",
  "backgroundImageFileName": "fondo.png"
}
```

---

## Prompts de ejemplo

### Agregar una organización nueva desde cero
```
/add-organization ./datos/frescomarket.json
```

### Agregar con Firebase ya configurado
```
/add-organization ./datos/frescomarket.json ./firebase/google-services.json
```

### Pegar el JSON directamente
```
Agrega esta organización al proyecto:

/add-organization
{"name": "Super Fresco", "slug": "superfresco", "supabase_url": "https://abcd1234.supabase.co", ...}
```

---

## Qué debes hacer manualmente después

El skill te avisará al final, pero estas acciones requieren intervención humana:

| Acción | Dónde |
|--------|-------|
| Agregar imágenes de la app | `assets/organizationN/` |
| Reemplazar valores de Firebase | `google-service/organizationN/google-services.json` |
| Configurar secrets de Edge Functions | Dashboard de Supabase → Settings → Edge Functions |
| Agregar registros a la tabla `stores` | Supabase Studio o tu panel de administración |

Los secrets necesarios son:
- `EVENTS_FUNCTION_API_KEY`
- `EXPO_ACCESS_TOKEN`

---

## Estructura de archivos generados

```
proyecto/
├── configs/
│   └── organizationN.js           ← config principal de la org
├── assets/
│   └── organizationN/             ← carpeta de imágenes (vacía, debes agregar)
└── google-service/
    └── organizationN/
        └── google-services.json   ← Firebase config
```

---

## Soporte

Si tienes problemas, abre un issue en el repositorio del plugin.
