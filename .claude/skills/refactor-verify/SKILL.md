# /refactor-verify

Workflow de refactor seguro con verificación automática.

Cuando se invoque, ejecutar en este orden:

1. Leer los archivos afectados ANTES de hacer cambios. Anotar internamente toda la lógica de edge-cases, fallbacks, cleaning steps y error paths presentes.
2. Aplicar el refactor solicitado.
3. Correr `npx tsc --noEmit` y confirmar 0 errores. Si hay errores, corregirlos antes de continuar.
4. Comparar el estado post-refactor contra el estado original. Generar una lista de bullets con:
   - Cada pieza de lógica eliminada o alterada
   - Justificación para cada cambio
5. Si algún ítem de la lista no fue explícitamente pedido por el usuario, restaurarlo o preguntar antes de continuar.
6. Reportar en el chat: archivos modificados, resultado de tsc, y la lista de cambios (solo si hay algo relevante que reportar).

## Reglas
- NUNCA eliminar fallbacks, cleaning steps o error paths sin confirmación explícita.
- NUNCA declarar el refactor terminado con errores de tsc pendientes.
- Si hay dudas sobre si algo se puede eliminar, conservar y preguntar.
