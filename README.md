# CC ANALYTICS

Plataforma empresarial modular de Business Intelligence para **Cable Color Honduras**. Centraliza indicadores de ventas, marketing, operaciones, recursos humanos y finanzas en una interfaz ejecutiva, responsive y preparada para crecer.

## Características

- Dashboard ejecutivo con KPIs, tendencias y comparativos.
- Ventas diarias, comparativo mensual y distribución por ciudad.
- Ranking de vendedores y semáforo de rendimiento.
- Funnel comercial y proyección de cierre.
- Marketing: inversión, leads, CPL, costo por venta y ROAS.
- Operaciones: instalaciones, SLA, órdenes y alertas.
- Recursos Humanos: dotación, rotación, vacantes y productividad.
- Finanzas: ingresos, costos, margen y cartera.
- Importación funcional de Excel (`.xlsx`, `.xls`) y CSV con vista previa.
- Filtros globales por mes, región, ciudad, departamento y canal.
- 21 módulos navegables y arquitectura lista para conectar datos reales.
- Cliente Supabase preparado para autenticación y base de datos.
- Configuración compatible con Vercel.

## Stack

- Next.js 15 y React 19
- TypeScript
- Tailwind CSS
- Recharts
- Supabase JS
- SheetJS y Papa Parse
- Lucide React

## Instalación local

Requiere Node.js 20 o superior.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Variables de entorno

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

La aplicación funciona con datos demostrativos sin estas variables. Cuando se configuran, `lib/supabase.ts` expone un cliente listo para autenticación, consultas y almacenamiento. La clave `SUPABASE_SERVICE_ROLE_KEY` debe usarse exclusivamente del lado del servidor.

## Scripts

```bash
npm run dev      # Desarrollo
npm run build    # Build de producción
npm run start    # Servidor de producción
```

## Estructura

```text
app/
  globals.css          Sistema visual global
  layout.tsx           Metadatos y layout raíz
  page.tsx             Entrada de la aplicación
components/
  analytics-app.tsx    Shell, navegación, filtros y dashboards
lib/
  data.ts              Datos demostrativos
  supabase.ts          Cliente Supabase seguro y opcional
```

## Despliegue en Vercel

1. Importa el repositorio en Vercel.
2. Configura las variables de entorno de Supabase.
3. Vercel detectará Next.js automáticamente. `vercel.json` conserva comandos explícitos para instalación y build.
4. Publica el proyecto.

## Evolución recomendada

1. Crear tablas de Supabase para ventas, campañas, colaboradores, órdenes y presupuestos.
2. Añadir autenticación y políticas RLS por rol.
3. Sustituir los datos demostrativos por consultas server-side.
4. Crear perfiles de Administrador, Gerencia, Supervisor y Analista.
5. Agregar exportación PDF/Excel, alertas programadas y bitácora de auditoría.

## Seguridad

- Nunca publiques `.env.local`.
- Activa Row Level Security en las tablas de Supabase.
- Mantén la service role key únicamente en funciones de servidor.
- Aplica permisos por módulo y región antes de cargar información productiva.

---

Desarrollado como primera versión funcional de **CC ANALYTICS** para Cable Color.
