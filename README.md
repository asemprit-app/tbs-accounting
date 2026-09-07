# TBS Accounting App

App de contabilidad interactiva: transacciones con categorización automática, facturación con PDF, clientes, y reportes mensuales — con base de datos real en Supabase, para que veas los mismos datos desde cualquier dispositivo.

## Paso 1 — Crear el proyecto en Supabase (gratis)

1. Ve a supabase.com, crea cuenta gratis, "New Project". Ponle un nombre y una contraseña (guárdala).
2. Cuando el proyecto termine de crearse, ve a "SQL Editor" → "New query".
3. Copia y pega todo el contenido del archivo `supabase_schema.sql` (incluido aquí) y dale "Run". Esto crea las tres tablas: transactions, invoices, customers.
4. Ve a "Project Settings" → "API". Copia el "Project URL" y el "anon public" key.

## Paso 2 — Conectar la app a Supabase

1. Renombra el archivo `.env.example` a `.env`.
2. Pega ahí el URL y la key que copiaste:
   ```
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-anon-key-aqui
   ```

## Paso 3 — Publicarla

1. Sube esta carpeta completa a un repositorio en GitHub (el .env normalmente NO se sube — mejor configurarlo directo en Vercel, ver abajo).
2. Entra a vercel.com → "Add New Project" → selecciona el repositorio.
3. Antes de darle Deploy, en "Environment Variables" agrega las mismas dos variables (VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY).
4. Dale "Deploy". En 1-2 minutos tienes tu URL real, con datos compartidos entre todos los dispositivos que la usen.

## Nota sobre seguridad

Esta configuración deja las tablas abiertas a cualquiera que tenga el link de tu app (correcto para un solo negocio usando su propio proyecto Supabase en privado). Si más adelante quieres login por usuario o multi-cliente con permisos separados, se ajustan las políticas de "Row Level Security" en Supabase — es un paso adicional, no un rediseño.
