@AGENTS.md

# Notas específicas para Claude Code

- Trabaja **una issue por sesión**. Antes de editar, lee la issue completa en `docs/issues/` (o en GitHub) y los documentos que enlaza.
- Estado del repositorio: Fase 0 (solo documentación). Si no hay una issue asignada, **no escribas código de producto**; pregunta.
- Usa `node tools/planning/github-import.mjs validate` tras editar `docs/issues/*.md` y `... backlog` para regenerar `docs/BACKLOG.md` (no editar BACKLOG a mano).
- Acciones remotas (crear repo, importar issues, desplegar, cambiar protecciones) **requieren autorización explícita en el chat**; comprueba permisos con `gh auth status` y propón el plan antes.
- Para cambios de `core`, escribe primero los tests (incluidas propiedades con fast-check cuando haya invariantes).
- Para cambios de render, mide con `renderer.info` (vía `window.__RF__` en builds E2E) y pega el antes/después en el PR.
- Mantén los PR pequeños; si una issue crece, propón dividirla.
- Responde en español al propietario; escribe código, commits y PRs en inglés.
