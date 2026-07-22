# CC ANALYTICS

Plataforma empresarial de Business Intelligence para Cable Color Honduras. Usa la misma autenticación y tabla de perfiles de CC HUB, aplica acceso por cargo, departamento y zona, y permite importaciones Excel/CSV protegidas con Row Level Security.

## Funcionalidad

- Inicio de sesión y recuperación de contraseña con Supabase Auth.
- Perfiles compartidos con CC HUB.
- Administrador con vista global y gestión de accesos.
- Cargos separados del departamento: por ejemplo, Community Manager puede pertenecer a Marketing o Ventas Digitales.
- Usuarios limitados a los módulos y datos de la combinación departamento + zona asignada.
- Perfil editable con persistencia real.
- Dashboards ejecutivos, ventas, marketing, ROAS, operaciones, RR. HH. y finanzas.
- Importación de Excel y CSV almacenada por departamento y zona en Supabase.
- Filtros, reportes, alertas y proyecciones.
- Diseño responsive negro y morado neón.

## Desarrollo local

```bash
npm install
cp .env.example .env.local
npm run dev
```

Variables requeridas:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

No se usa una `service_role` en el navegador.

## Configuración del Supabase compartido

1. Abre el proyecto de Supabase utilizado por CC HUB.
2. En SQL Editor ejecuta `supabase/cc-analytics-integration.sql`. El script es idempotente y se puede volver a ejecutar al actualizar la plataforma.
3. Inicia sesión como administrador de CC HUB.
4. En **Usuarios y permisos**, activa cada usuario y asigna cargo, departamento, zona y rol.

La migración agrega los campos de acceso a Analytics, el alcance por zona, las tablas de importación, funciones administrativas y políticas RLS. Los administradores activos de CC HUB se habilitan automáticamente con alcance nacional. Las zonas iniciales son Nacional, Zona Norte, Zona Centro y Zona Sur; se pueden añadir otras sin cambiar la estructura de la base.

## Seguridad

- Los administradores pueden crear e invitar cuentas compartidas desde CC ANALYTICS.
- El alta crea el usuario en Supabase Auth y el mismo perfil habilita CC HUB y CC ANALYTICS.
- El navegador usa únicamente la clave pública de Supabase.
- RLS impide que un usuario consulte o cargue datos fuera de su departamento y zona.
- Los cambios de rol y estado pasan por una función `security definer` que valida al administrador.
- `.env.local` no debe versionarse.

## Validación

```bash
npm run build
npm run lint
```

El proyecto también está configurado para despliegue en Vercel y ChatGPT Sites.
