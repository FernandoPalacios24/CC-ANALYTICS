# CC ANALYTICS

Plataforma empresarial de Business Intelligence para Cable Color Honduras. Usa la misma autenticación y tabla de perfiles de CC HUB, aplica acceso por cargo, departamento y zona, y permite importaciones Excel/CSV protegidas con Row Level Security.

## Funcionalidad

- Inicio de sesión y recuperación de contraseña con Supabase Auth.
- Perfiles compartidos con CC HUB.
- Administrador con vista global y gestión de accesos.
- Cargos separados del departamento: por ejemplo, Community Manager puede pertenecer a Marketing o Ventas Digitales.
- Usuarios limitados a los módulos y datos de la combinación departamento + zona asignada.
- Jerarquía comercial **Líder de departamento → Supervisor → Vendedor/Operador**.
- El supervisor consulta su producción propia y el total de sus vendedores asignados.
- El líder abre cada supervisor y vendedor por separado o consolida todo su departamento.
- Comparativos entre cualquier par de meses con análisis automático de variación, proyección, meta y semáforo.
- Perfil editable con persistencia real.
- Dashboards ejecutivos, ventas, marketing, ROAS, operaciones, RR. HH. y finanzas.
- Importación de Excel y CSV almacenada por departamento y zona en Supabase. El formato operativo reconoce automáticamente la hoja `Detalle`, conserva el registro original y normaliza sus ventas.
- Laboratorio libre de reportes con campos, métricas, filas, columnas, filtros propios, orden, límites, tablas dinámicas y nueve tipos de visualización.
- Copiloto en lenguaje natural para crear composiciones completas. Tiene un motor inteligente local listo para usar y puede conectarse a OpenAI desde el servidor.
- Plantillas reutilizables en Supabase con alcance por usuario, departamento y zona.
- PDF y CSV generados desde cualquier combinación activa.
- Descarga CSV, alertas y proyecciones.
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
OPENAI_API_KEY=
OPENAI_REPORT_MODEL=gpt-5.6-sol
```

`OPENAI_API_KEY` es opcional: sin ella, el copiloto usa el planificador local y
el constructor manual conserva toda su funcionalidad. La clave de OpenAI y una
eventual `service_role` nunca deben usar el prefijo `NEXT_PUBLIC_` ni llegar al
navegador.

## Configuración del Supabase compartido

1. Abre el proyecto de Supabase utilizado por CC HUB.
2. En SQL Editor ejecuta `supabase/cc-analytics-integration.sql`. El script es idempotente y se puede volver a ejecutar al actualizar la plataforma.
3. Inicia sesión como administrador de CC HUB.
4. En **Usuarios y permisos**, activa cada usuario y asigna cargo, departamento, zona y rol.
5. Asigna cada supervisor a su líder y cada vendedor/operador a su supervisor usando **Reporta a**.

La migración agrega los campos de acceso a Analytics, `reports_to`, la tabla normalizada `analytics_sales`, las tablas de auditoría de importaciones, `analytics_report_templates`, funciones administrativas y políticas RLS jerárquicas. Los administradores activos de CC HUB se habilitan automáticamente con alcance nacional. Las zonas iniciales son Nacional, Zona Norte, Zona Centro y Zona Sur; se pueden añadir otras sin cambiar la estructura de la base.

## Copiloto de reportes

El endpoint `app/api/report-copilot/route.ts` usa la Responses API y Structured
Outputs para transformar una instrucción en una definición JSON validada. La
petición envía únicamente el catálogo de campos y valores disponibles; los
registros visibles se consultan antes con la sesión del usuario y las políticas
RLS de Supabase. Para producción, configura `OPENAI_API_KEY` como secreto del
servidor.

## Seguridad

- Los administradores pueden crear e invitar cuentas compartidas desde CC ANALYTICS.
- El alta crea el usuario en Supabase Auth y el mismo perfil habilita CC HUB y CC ANALYTICS.
- El navegador usa únicamente la clave pública de Supabase.
- RLS impide que un usuario consulte o cargue datos fuera de su departamento, zona y tramo jerárquico.
- Los cambios de rol y estado pasan por una función `security definer` que valida al administrador.
- `.env.local` no debe versionarse.

## Validación

```bash
npm run build
npm run lint
```

El proyecto también está configurado para despliegue en Vercel y ChatGPT Sites.
