# CC ANALYTICS

Plataforma empresarial de Business Intelligence para Cable Color Honduras. CC Analytics utiliza autenticación, perfiles, permisos y base de datos propios; no depende de las cuentas ni de las tablas de CC HUB.

## Funcionalidad

- Inicio de sesión y recuperación de contraseña con Supabase Auth exclusivo de CC Analytics.
- Perfiles propios en `public.analytics_profiles`.
- Administrador con vista global y gestión de usuarios.
- Cargos separados del departamento: por ejemplo, Community Manager puede pertenecer a Marketing o Ventas Digitales.
- Usuarios limitados a los módulos y datos de la combinación departamento + zona asignada.
- Jerarquía de acceso **Líder de departamento → Supervisor → Analista/Operador**.
- Los vendedores no son usuarios: se cargan como registros comerciales asociados al supervisor por nombre o código.
- El supervisor consulta su producción y la de los vendedores cargados bajo su perfil; el líder abre cada supervisor y equipo por separado o consolida todo su departamento.
- Comparativos entre meses con análisis de variación, proyección, meta y semáforo.
- Perfil editable con persistencia real.
- Dashboards ejecutivos, ventas, marketing, ROAS, operaciones, RR. HH. y finanzas.
- Importación de Excel y CSV almacenada por departamento y zona en Supabase.
- Laboratorio libre de reportes con campos, métricas, filtros, tablas dinámicas y visualizaciones.
- Copiloto en lenguaje natural con motor local y conexión opcional a OpenAI desde el servidor.
- Plantillas reutilizables con alcance por usuario, departamento y zona.
- PDF y CSV generados desde cualquier combinación activa.
- Invitaciones administrativas seguras por correo, sin contraseñas temporales expuestas al navegador.
- Bitácora administrativa para invitaciones, cambios de acceso e importaciones.
- Diseño responsive negro y morado neón.

## Desarrollo local

```bash
npm install
cp .env.example .env.local
npm run dev
```

Variables requeridas:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-cc-analytics-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_REPORT_MODEL=gpt-5.6-sol
```

Las tres variables de Supabase deben pertenecer al proyecto exclusivo de CC Analytics. No uses la URL ni las claves de CC HUB. `OPENAI_API_KEY` es opcional. La clave `SUPABASE_SERVICE_ROLE_KEY` nunca debe llevar el prefijo `NEXT_PUBLIC_`, llegar al navegador ni guardarse en Git.

## Configuración del Supabase independiente

1. Crea un proyecto Supabase exclusivo para CC Analytics.
2. En SQL Editor ejecuta `supabase/cc-analytics-integration.sql`.
3. Crea el primer usuario desde **Authentication > Users**.
4. Convierte ese usuario en administrador ejecutando:

```sql
select public.bootstrap_analytics_admin(
  'correo@empresa.com',
  'Nombre del administrador'
);
```

5. Ejecuta `supabase/corporate-readiness-check.sql`. Todos los indicadores deben ser `true`, debe existir al menos un administrador activo y el conteo de vendedores con acceso debe ser `0`.
6. Configura las variables de entorno del despliegue con los datos del nuevo proyecto.
7. En **Authentication > URL Configuration**, agrega las URL de desarrollo y producción.
8. Inicia sesión como administrador y crea el resto de usuarios desde **Usuarios y permisos**.

La instalación crea `analytics_profiles`, `analytics_sales`, `analytics_imports`, `analytics_records`, `analytics_audit_log`, `analytics_report_templates`, funciones administrativas y políticas RLS jerárquicas. Las zonas iniciales de la interfaz son Nacional, Zona Norte, Zona Centro y Zona Sur.

## Modelo de acceso

- **Administrador:** visibilidad nacional y administración global.
- **Líder de departamento:** ve los supervisores que le reportan y sus equipos.
- **Supervisor:** ve su producción y la de los vendedores asociados a su perfil.
- **Analista:** consulta y analiza la información autorizada de su alcance.
- **Operador:** carga información bajo el supervisor asignado.
- **Vendedor:** no posee cuenta; existe únicamente como registro comercial.

## Seguridad

- CC Analytics tiene su propio Supabase Auth y no consulta `public.profiles` ni `public.app_memberships` de CC HUB.
- Los administradores invitan cuentas desde un endpoint de servidor protegido por `SUPABASE_SERVICE_ROLE_KEY`.
- Supabase envía un enlace para que cada persona establezca su contraseña.
- El navegador usa únicamente la clave pública de Supabase.
- RLS impide consultar o cargar datos fuera del departamento, zona y tramo jerárquico.
- Los cambios de rol y estado pasan por `admin_update_analytics_profile`, una función `security definer` que valida al administrador.
- Una restricción de base de datos impide crear perfiles de acceso para vendedores o ejecutivos de ventas.
- `.env.local` no debe versionarse.

Consulta [docs/CORPORATE-RUNBOOK.md](docs/CORPORATE-RUNBOOK.md) para puesta en producción, respaldo, monitoreo e incidentes.

## Validación

```bash
npm run build
npm run lint
npm test
```

GitHub Actions ejecuta lint, build y pruebas en cada PR y cada cambio a `main`. El proyecto también está configurado para despliegue en Vercel y ChatGPT Sites.
