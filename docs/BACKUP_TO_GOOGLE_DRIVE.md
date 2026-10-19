# Respaldos externos cifrados — TBS Accounting Engine

**Estado: preparación, NO respaldo realizado ni restauración comprobada.**

Carpeta privada de Drive: https://drive.google.com/drive/folders/1_0t5KXVskY3lcNfI0jMCSzbO-kGjNzQP

- `01 - Base de datos cifrada`
- `02 - Documentos cifrados`
- `03 - Verificacion y restauracion`

**Límites de seguridad:**
- No almacenar secretos de PostgreSQL, Supabase, Google Drive ni claves de cifrado en GitHub, Google Drive, archivos fuente o logs.
- La CLI `supabase db dump` excluye esquemas gestionados `auth` y `storage`; se requiere un procedimiento separado si el objetivo es recuperar también autenticación y metadatos.
- El volcado de base de datos **no incluye** el contenido binario de Supabase Storage. Es indispensable exportar los objetos y verificar que pueden volver a descargarse.
- Subir a Google Drive **solo después** de cifrar localmente, preferiblemente con cifrado autenticado (p. ej. age) y con la clave guardada fuera de Drive y del repositorio.
- Una carpeta y un manifiesto no certifican el respaldo: se necesita recuperar una copia aislada de prueba.

## Procedimiento antes de modificar permisos

1. Obtener mediante la consola de Supabase una conexión de base de datos para exportación; usar una estación confiable con Supabase CLI y Docker.
2. Exportar roles, esquema y datos siguiendo https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
3. Añadir al método una copia comprobable de Auth y metadatos de Storage. La exportación por defecto de la CLI es insuficiente para una restauración integral; evaluar `pg_dump` con permisos adecuados, sin introducir credenciales en chat.
4. Descargar todos los objetos reales de los buckets: https://supabase.com/docs/guides/storage/management/download-objects
5. Construir un archivo de respaldo, cifrarlo **antes de subirlo**, registrar fecha UTC, tipo de artefacto, recuentos de tablas/objetos, versión y hash SHA-256 del archivo cifrado. Guardar contraseña de cifrado por separado.
6. Cargar los archivos cifrados en las carpetas de Drive.
7. Realizar restauración a destino aislado; verificar datos, usuarios, RLS y recuperación de documentos con pruebas positivas y negativas.
8. Conservar al menos una segunda copia cifrada independiente de Drive antes de autorizar cambios destructivos.
9. Solo después de aprobar la restauración, aplicar la migración revisada de permisos y repetir verificaciones de aislamiento.

Documentación: https://supabase.com/docs/guides/platform/backups

## Registro de ejecución

- [x] Carpeta principal creada y verificada como no compartida, con solo propietario.
- [x] Subcarpetas para base de datos, documentos y verificación.
- [x] Procedimiento almacenado en la subcarpeta de verificación.
- [ ] Volcado de base de datos creado y cifrado.
- [ ] Objetos de Storage exportados y cifrados.
- [ ] Manifiesto con hashes y recuentos.
- [ ] Archivos cifrados depositados y comprobados en Drive.
- [ ] Restauración aislada completada.
- [ ] Prueba de acceso entre dos clientes distintos y aprobación de seguridad.

**Nunca marcar como exitoso un paso no comprobado.**
