# Operación corporativa de CC Analytics

## Modelo de identidad

- CC Analytics utiliza un proyecto Supabase exclusivo.
- Sus identidades viven en Supabase Auth y sus perfiles en `public.analytics_profiles`.
- No consulta ni modifica usuarios, perfiles o permisos de CC HUB.
- Administrador, líder, supervisor, analista y operador son perfiles con acceso.
- **Vendedor no es un rol ni una cuenta de CC Analytics.** El vendedor se importa como nombre o código comercial y cada venta queda asociada a `supervisor_profile_id`.
- Un líder ve los supervisores que le reportan y sus equipos. Un supervisor ve sus ventas y las de los vendedores cargados bajo su perfil.

## Puesta en producción

1. Crear un proyecto Supabase exclusivo para CC Analytics.
2. Ejecutar `supabase/cc-analytics-integration.sql` completo en SQL Editor.
3. Crear el primer usuario desde **Authentication > Users**.
4. Ejecutar `public.bootstrap_analytics_admin(correo, nombre)` para activar el primer administrador.
5. Ejecutar `supabase/corporate-readiness-check.sql`. Todos los indicadores de la primera consulta deben ser `true`, debe existir al menos un administrador activo y el conteo de vendedores con acceso debe ser `0`.
6. Configurar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SERVICE_ROLE_KEY` con los datos del proyecto exclusivo. Nunca reutilizar las claves de CC HUB.
7. La clave de servicio no debe llevar el prefijo `NEXT_PUBLIC_`, guardarse en Git ni enviarse al navegador.
8. Agregar la URL productiva a **Authentication > URL Configuration > Redirect URLs**.
9. Probar una invitación con un correo controlado y confirmar que el usuario establece su propia contraseña.
10. Cuando la invitación segura esté verificada, deshabilitar el registro público de usuarios en Supabase Auth.

## Carga comercial

- El archivo debe incluir `Vendedor`, `Fecha Facturación` y `Supervisor` o `Equipo`.
- `Código Vendedor`, `Codigo Vendedor` o `ID Vendedor` son opcionales y ayudan a distinguir homónimos.
- Los nombres de supervisor deben coincidir con perfiles activos del mismo departamento y zona.
- Para usuarios no administradores, la carga se rechaza antes de escribir si alguna venta no puede asociarse a un supervisor válido.

## Controles operativos

- Revisar **Auditoría y seguridad** semanalmente.
- Supervisar `/api/health`; `degraded` indica que falta una capacidad del servidor.
- Mantener recuperación a un punto en el tiempo y verificar una restauración en un proyecto de ensayo al menos trimestralmente.
- Habilitar MFA para administradores y propietarios de Supabase y GitHub.
- Proteger `main`: revisión obligatoria, CI requerido y sin pushes directos.
- Mantener un ambiente de staging con otro proyecto Supabase antes de migraciones de producción.
- Confirmar periódicamente que las variables del despliegue siguen apuntando al proyecto exclusivo de CC Analytics.

## Incidentes

1. Suspender el perfil afectado en `analytics_profiles`.
2. Revocar sesiones y rotar cualquier clave que pudiera haberse expuesto.
3. Exportar la bitácora relevante sin modificarla.
4. Registrar hora, usuario, departamento, zona e importación afectada.
5. Restaurar desde respaldo si hubo corrupción y validar RLS antes de reabrir.
6. Verificar que el incidente no implique una configuración accidental con el proyecto de CC HUB.
