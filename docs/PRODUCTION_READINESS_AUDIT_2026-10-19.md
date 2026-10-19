# TBS Accounting Engine — producción: auditoría de preparación

Fecha: 2026-10-19. Proyecto Supabase: TBS Accounting Engine. Vercel: tbs-accounting.
Rama revisada: `tbs-control-center` (Preview). No aplicar este informe como certificación.
**Decisión: NO APTO TODAVÍA PARA PRODUCCIÓN. No fusionar a main sin aprobación.**

## Evidencia verificada por consultas de solo lectura
- 26/26 tablas públicas con RLS habilitado. **Esto no sustituye probar las políticas.**
- 46 empresas; 2 perfiles de acceso: 1 staff y 1 client. No es posible probar client A vs B usando dos clientes existentes.
- Storage bucket `tbs-request-documents` privado, límite 10 MB, restricciones MIME y políticas por solicitud/cliente.
- 19,910 transacciones; 1,000 sin GL (997 vacío, 3 NULL). 18 clientes tienen más de 1,000 transacciones; máximo 3,460.
- La carga principal en `src/App.jsx` pagina transacciones de 1,000 en 1,000.
- 243 conciliaciones: 239 PASS y 4 REVIEW. Ninguna diferencia almacenada discordante con el cálculo de balances por más de $0.01, ni PASS con diferencia de $0.01 o superior.
- 26 transacciones con GL `5590` en dos clientes no encuentran su código en el catálogo de cuentas correspondiente. Requiere validación contable; no corregir automáticamente.
- Compilación Preview `fd320bc` READY, registros Vercel confirman 6 pruebas de código aprobadas (0 fallos) y `vite build` exitoso. No son pruebas E2E ni de aislamiento en sesiones reales.
- Sin metadatos de archivos con prefijos fuera de solicitud, mensajes huérfanos ni tareas de cierre huérfanas en comprobaciones SQL.
- DNS dominio Vercel verificado; despliegue Preview READY. READY no equivale a prueba de uso final.

## Cambios realizados en Preview, no publicados a producción
- Health Score ahora consulta cantidades exactas de solicitudes y revisiones abiertas, sin límite artificial de 1,000.
- El cierre mensual requiere los nueve task_key esperados marcados DONE antes de READY_FOR_REVIEW.
- Desmarcar una tarea tras READY_FOR_REVIEW devuelve estado a IN_PROGRESS en la UI.
- GitHub Actions preview checks adaptado provisionalmente a Node 24/npm install (no hay package-lock). Los checks de Actions aún no han sido confirmados como ejecutados y exitosos.
- SQL de mitigación propuesto en `supabase/tbs_proposed_security_hardening_NOT_APPLIED.sql`. **No ejecutado**.

## Actualización: respaldo y autorización condicionada
- Organización Supabase en plan **Free**. Documentación oficial: respaldos diarios automáticos para Pro/Team/Enterprise, no garantizados en Free. No existe evidencia verificable aún de un respaldo completo y recuperable.
- Usuario autorizó cambiar permisos **una vez verificado respaldo y reversión**; esa condición sigue pendiente. **No aplicar DDL todavía.**
- Simulación de seguridad con roles `client`, `staff`, `anon` y 13 tablas completada sin errores, sin operaciones de escritura. Cubre un cliente, no una segunda cuenta real independiente.
- La propuesta SQL fue corregida para NO eliminar las políticas RESTRICTIVE existentes ni prometer lectura contable a clientes.

## Bloqueos de seguridad y calidad para publicar
0. **ACLARACIÓN VALIDADA — políticas financieras:** esas nueve tablas tienen, además de políticas permisivas, una política RESTRICTIVE `tbs_staff_only_*` FOR ALL. La prueba de acceso como cliente autenticado mostró **cero filas propias visibles**, por lo que no se ha confirmado permiso de escritura de clientes. Simulación como staff y anon aprobada en 13 tablas: staff ve los registros existentes y anon ninguno. Mantener las restricciones existentes hasta decidir el acceso de lectura contable del portal. Este resultado es una simulación de roles en SQL, no pruebas HTTP con dos clientes distintos.
1. **ALTO — RLS sin pruebas negativas reales:** ejecutar dos sesiones independientes (client A y client B), comprobar SELECT/INSERT/UPDATE/DELETE y Storage sin leer, cambiar ni borrar datos ajenos. Validar staff por separado.
2. **ALTO — RPC y privilegios:** Supabase advierte 7 funciones SECURITY DEFINER ejecutables por anon y authenticated; hay 3 funciones con search_path no fijado. Revisar/aprobar la mitigación y volver a ejecutar el auditor.
3. **ALTO — privilegios de tablas:** los roles anon y authenticated tienen GRANT ALL directo sobre todas las tablas públicas; RLS limita filas pero esos privilegios son demasiado amplios. Restringir el rol anon, mantener el acceso autenticado necesario y volver a probar.
4. **ALTO — Endpoint GET:** `api/create-client-user.js` responde sin autenticación con datos de configuración (presencia/tipo y validación de clave administrativa, host de Supabase). La ruta POST comprueba sesión y rol staff, pero GET debe dejar de exponer diagnósticos antes de abrir el sitio. Intento de actualización directa bloqueado por verificaciones del conector; no afirmar que está corregido.
5. **ALTO — Advertencia Chrome Dangerous:** no se ha demostrado que el dominio esté limpio; confirmar estatus Google Safe Browsing y resolver/revisar antes de invitar clientes.
6. **ALTO — Pruebas funcionales finales:** login, alta de usuario cliente, reportes financieros de al menos un periodo real vs origen bancario, reconciliación, acceso staff/client y descarga de documento tras expiración.
7. **MEDIO — GL:** resolver las 26 transacciones con código 5590 sin correspondencia en el catálogo del cliente, o documentar tratamiento contable verificado.
8. **MEDIO — CI:** falta package-lock; registrar e interpretar un flujo GitHub Actions exitoso y pruebas automatizadas ejecutadas. Por ahora se comprobó Vercel READY, no GitHub Actions.
9. **MEDIO — Protección de contraseñas:** Supabase Auth informó protección contra contraseñas filtradas deshabilitada. Habilitar en configuración con aprobación.
10. **MEDIO — Rendimiento:** el asesor Supabase señala claves externas sin índices y políticas repetidas. Priorizar sin cambios especulativos a producción.
11. **Función destructiva:** `delete_client_cascade` y eliminar cliente desde la interfaz requieren prueba en entorno aislado y procedimiento de recuperación antes de aprobar.
12. **Cierre:** el bloqueo final del periodo y los permisos de aprobación siguen sin implementarse; aprobar alcance de la primera versión o completar desarrollo.

## Condiciones para autorizar publicación
- Autorización expresa del responsable para aplicar mitigaciones en la base de datos que contiene información de clientes.
- Dos cuentas cliente de prueba sin compartir credenciales con ChatGPT; cada una ligada a empresa diferente, más una sesión staff.
- Evidencia de seguridad negativa, pruebas de flujos contables, depuración de advertencia navegador y ejecución de CI.
- Autorización explícita para fusionar o publicar en producción después de revisión final.

No se alteraron transacciones ni se aplicaron cambios de seguridad al proyecto de Supabase durante esta auditoría.

## Verificaciones posteriores — Preview, 2026-10-19
- **21 pruebas automatizadas aprobadas** y **0 fallos**, confirmado en registros de compilación Vercel del commit `e4e620953f9dfc2c4bfcb35e2b8930eb4ee57fd6`. Se añadieron pruebas funcionales de lógica pura para las nueve tareas obligatorias, estados de cierre, puntuación piloto y sus límites; son pruebas unitarias y de configuración, NO E2E de usuarios.
- Configuración nueva `vercel.json` con `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, política de referer, API `private, no-store` y regla que responde 405 a `GET/HEAD /api/create-client-user` en Preview. La regla pasó revisión estática y compilación, **no se ha verificado la respuesta HTTP real**. El archivo JS de la API sigue incluyendo el diagnóstico GET; su actualización directa fue bloqueada.
- Simulación SQL de RLS sin escrituras: acceso `client` a solicitudes, mensajes, metadatos de archivos y objetos del bucket privado limitado al cliente vinculado; `staff` ve registros; `anon` no ve ninguno. Había una solicitud/archivo propios y una solicitud ajena, de modo que hubo comparación sobre registros existentes. **No sustituye prueba con sesiones HTTP independientes**.
- Las 13 tablas financieras/operacionales previamente comprobadas también aprobaron la simulación SQL para staff/client/anon; nueve tablas financieras conservan restricciones RESTRICTIVE `tbs_staff_only_*`.
- **Costos y términos:** equipo Vercel actualmente `hobby`; Vercel restringe ese plan a uso personal no comercial (https://vercel.com/docs/limits/fair-use-guidelines). Para uso comercial de TBS será necesario otro alojamiento que permita uso comercial o un plan comercial de Vercel. No se contrató ni activó nada.
- Supabase en plan Free sin evidencia de respaldo completo restaurable. No se aplicó DDL al proyecto. El SQL propuesto no está ejecutado.
- Advertencia Chrome `Dangerous` no evaluada como resuelta. Requiere validación oficial de Google Safe Browsing / Search Console (https://support.google.com/webmasters/answer/6347750).
