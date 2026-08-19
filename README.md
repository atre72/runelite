# Desplegar RunElite en internet (gratis, sin tarjeta)

Verifiqué en agosto 2026 el estado real de las plataformas gratuitas: **Render es hoy la única con capa gratuita permanente sin tarjeta de crédito.** Railway y Fly.io eliminaron sus planes gratuitos (solo dan pruebas de días). Por eso esta guía es para Render.

## Paso 1 — Sube este código a GitHub

Desde la carpeta `runelite-server/`:

```bash
git init
git add .
git commit -m "RunElite backend"
```

Crea un repositorio nuevo (vacío) en https://github.com/new, luego:

```bash
git remote add origin https://github.com/TU-USUARIO/runelite.git
git branch -M main
git push -u origin main
```

## Paso 2 — Conecta con Render

1. Crea cuenta gratis en https://render.com (no pide tarjeta)
2. Click **New +** → **Blueprint**
3. Conecta tu repositorio de GitHub
4. Render detecta automáticamente el archivo `render.yaml` de esta carpeta y configura todo solo (nombre, plan gratis, comando de arranque)
5. Click **Apply** — en 1-2 minutos tienes una URL pública como `https://runelite.onrender.com`

Alternativa manual si prefieres no usar Blueprint: **New +** → **Web Service** → conecta el repo → Environment: `Node` → Build Command: (vacío) → Start Command: `node server.js` → Plan: **Free**.

## Paso 3 — Pruébalo

Abre la URL que te dio Render. Es tu app completa (cliente 3D + backend), ya con ranking global real entre todos los que la visiten. No hay que tocar nada del código del cliente: usa rutas relativas (`/api/...`) que funcionan igual en `localhost` que en el dominio de Render.

## Paso 4 (opcional pero recomendado) — Base de datos persistente gratis con Neon

Sin este paso, el ranking se guarda en `db.json` dentro del servidor — funciona, pero en Render el disco se reinicia en cada redeploy. Con Neon, los datos son permanentes de verdad, y no cambias ni una línea de código: el servidor detecta solo la variable `DATABASE_URL` y cambia de modo automáticamente.

1. Crea cuenta gratis en https://neon.tech (no pide tarjeta)
2. **New Project** → cualquier nombre, región más cercana a ti
3. En el dashboard del proyecto, copia el **Connection string** (empieza con `postgres://...`)
4. En Render: abre tu servicio → **Environment** → agrega la variable `DATABASE_URL` → pega el connection string → **Save**
5. Render redespliega solo. Listo — ahora el backend usa Postgres real y persistente

**Por qué Neon y no otra:** verifiqué en agosto 2026 que Neon "duerme" tu base tras inactividad pero **despierta sola en ~1 segundo** con la primera consulta, sin que nadie toque nada. Supabase (la otra opción gratuita popular) pausa el proyecto tras 7 días y hay que despausarlo **manualmente** desde su panel — mal si vuelves a tu app después de un tiempo sin avisar.

Para probar en tu computadora con Neon en vez del archivo local:
```bash
npm install
DATABASE_URL="postgres://tu-connection-string" node server.js
```

## Ahora es una PWA — se instala como app real

Una vez desplegada (Render te obliga a HTTPS automáticamente, que es requisito para esto), cualquiera que la visite puede instalarla:

- **Android (Chrome):** aparece un botón "Instalar" en el header de la app, o el menú ⋮ → "Instalar app". Queda con ícono propio en la pantalla de inicio, abre sin barra de navegador, como cualquier app nativa.
- **iPhone (Safari):** Safari no muestra el botón automático — hay que abrir el menú Compartir → **Añadir a pantalla de inicio**. Es una limitación de Apple, no de esta app.
- **Escritorio (Chrome/Edge):** ícono de instalar en la barra de direcciones.

Funciona igual que antes en localhost mientras pruebas — el botón "Instalar" solo aparece cuando el navegador confirma que se puede instalar.

## Dos límites reales del plan gratuito de Render (para que no te sorprendan)

1. **Se duerme tras 15 minutos sin visitas.** El primer visitante después de eso espera 30-60 segundos mientras el servidor "despierta". Es normal, no es un error — y no afecta a los datos, solo a la velocidad de esa primera visita.
2. **El disco local de Render es efímero.** Si NO configuraste Neon (paso 4), cada nuevo deploy reinicia `db.json`. Con Neon configurado, este límite deja de importar por completo.
