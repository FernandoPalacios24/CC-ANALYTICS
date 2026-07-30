# CC Analytics · Supabase independiente

## Proyecto creado

- Organización: `Cable Color Hub`
- Proyecto: `CC Analytics`
- Project ref: `xymexyhgydwkwflihqkc`
- Región: `us-east-1`
- URL: `https://xymexyhgydwkwflihqkc.supabase.co`

Este proyecto es exclusivo de CC Analytics y no comparte usuarios, perfiles ni tablas con CC HUB.

## Base instalada

La base ya contiene:

- `analytics_profiles`
- `analytics_audit_log`
- `analytics_imports`
- `analytics_records`
- `analytics_sales`
- `analytics_report_templates`
- RLS por rol, departamento, zona y jerarquía
- Auditoría de invitaciones, importaciones y plantillas
- Función `admin_update_analytics_profile`
- Función `bootstrap_analytics_admin`

## Variables locales

Crear `.env.local` en la raíz del proyecto:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xymexyhgydwkwflihqkc.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_KnO0nilQ2_D42LxuFrxJfg_2SRYJMox
SUPABASE_SERVICE_ROLE_KEY=PEGAR_AQUI_LA_SERVICE_ROLE_DEL_PROYECTO_CC_ANALYTICS
```

La `SUPABASE_SERVICE_ROLE_KEY` debe copiarse desde Supabase > Project Settings > API y nunca debe subirse a GitHub.

## Primer administrador

1. En Supabase abre **Authentication > Users > Add user**.
2. Crea la cuenta `updateconfirm17@gmail.com` con una contraseña exclusiva para CC Analytics.
3. Activa la opción de confirmar automáticamente el correo.
4. Abre SQL Editor y ejecuta:

```sql
select public.bootstrap_analytics_admin(
  'updateconfirm17@gmail.com',
  'Fernando Palacios'
);
```

## Verificación

```bash
npm install
npm run build
```

Después inicia sesión en CC Analytics con la cuenta creada en este proyecto. Las credenciales de CC HUB no se sincronizan ni se modifican.
