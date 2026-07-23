# Operación corporativa de CC Analytics

## Modelo de identidad

- CC HUB y CC Analytics comparten Supabase Auth y `public.profiles`.
- Administrador, líder, supervisor, analista y operador son perfiles con acceso.
- **Vendedor no es un rol ni una cuenta de CC Analytics.** El vendedor se
  importa como nombre/código comercial y cada venta queda asociada a
  `supervisor_profile_id`.
- Un líder ve los supervisores que le reportan y sus equipos. Un supervisor ve
  sus ventas propias y las de los vendedores cargados bajo su perfil.

## Puesta en producción

1. Crear un respaldo del proyecto compartido de Supabase.
2. Ejecutar `supabase/cc-analytics-integration.sql` completo en SQL Editor.
3. Ejecutar `supabase/corporate-readiness-check.sql`. Todos los indicadores de
   la primera consulta deben ser `true` y el conteo de vendedores con acceso
   debe ser `0`.
4. Configurar `SUPABASE_SERVICE_ROLE_KEY` como secreto del servidor de hosting.
   Nunca debe llevar el prefijo `NEXT_PUBLIC_`, guardarse en Git o enviarse por
   chat.
5. Agregar la URL productiva a **Authentication > URL Configuration > Redirect
   URLs** de Supabase.
6. Probar una invitación con un correo controlado y confirmar que el usuario
   establece su propia contraseña.
7. Cuando la invitación segura esté verificada, deshabilitar el registro público
   de usuarios en Supabase Auth.

## Carga comercial

- El archivo debe incluir `Vendedor`, `Fecha Facturación` y `Supervisor` o
  `Equipo`.
- `Código Vendedor`, `Codigo Vendedor` o `ID Vendedor` son opcionales y ayudan a
  distinguir homónimos.
- Los nombres de supervisor deben coincidir con perfiles activos del mismo
  departamento y zona.
- Para usuarios no administradores, la carga se rechaza antes de escribir si
  alguna venta no puede asociarse a un supervisor válido.

## Controles operativos

- Revisar **Auditoría y seguridad** semanalmente.
- Supervisar `/api/health`; `degraded` indica que falta una capacidad del
  servidor.
- Mantener recuperación a un punto en el tiempo y verificar una restauración en
  un proyecto de ensayo al menos trimestralmente.
- Habilitar MFA para administradores y propietarios de Supabase/GitHub.
- Proteger `main`: revisión obligatoria, CI requerido y sin pushes directos.
- Mantener un ambiente de staging con un proyecto Supabase separado antes de
  migraciones de producción.

## Incidentes

1. Suspender el perfil afectado en Supabase.
2. Revocar sesiones y rotar cualquier clave que pudiera haberse expuesto.
3. Exportar la bitácora relevante sin modificarla.
4. Registrar hora, usuario, departamento, zona e importación afectada.
5. Restaurar desde respaldo si hubo corrupción y validar RLS antes de reabrir.
