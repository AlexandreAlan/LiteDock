# Como lançar uma versão (release)

Receita pra publicar um release no GitHub a partir do terminal, com `gh`.

## Passo a passo

1. **Suba a versão** no health (`src/server.ts`, campo `version`) e adicione a
   entrada no **Histórico de versões** do `README.md`.
2. **Commit** (autoria Alexandre, sem assinatura de terceiros):
   ```bash
   git add -A && git commit -m "vX.Y.Z: <resumo>"
   ```
3. **Push + release** num passo só:
   ```bash
   git push origin main
   gh release create vX.Y.Z \
     --target main \
     --title "vX.Y.Z — <resumo curto>" \
     --notes-file docs/_release-notes.md \   # ou --generate-notes
     --latest
   ```

## Atalhos úteis do `gh`

| Quero… | Flag |
| --- | --- |
| Notas automáticas (commits/PRs desde a última tag) | `--generate-notes` |
| Marcar como pré-release (não pronto pra produção) | `--prerelease` |
| Criar como rascunho pra revisar no site antes | `--draft` |
| Editar um release já publicado | `gh release edit vX.Y.Z --notes-file ...` |
| Apagar um release | `gh release delete vX.Y.Z` |

## Convenção de versão (semver 0.x)

- **0.Y.0** — frente nova relevante (feature grande, mudança de arquitetura).
- **0.Y.Z** — melhorias/correções incrementais sobre a Y.

Enquanto o produto é 0.x ele segue em evolução; cada release normal já está
rodando em produção (`litedock.morenadoaco.com.br`) — usar `--prerelease` só
quando for de propósito um preview.

---

## Template de notas

Copie pra `docs/_release-notes.md`, preencha e passe em `--notes-file`.
Use 1–3 seções com emoji + título; cada uma com bullets curtos. Inclua uma
**nota honesta** quando houver ressalva/limitação conhecida.

```markdown
<Uma linha de contexto: o que esta versão entrega e onde está rodando.>

### 🔐 <Frente 1 — ex.: Segurança>
- <o que mudou, em bullet objetivo>
- <flag/endpoint/arquivo relevante: `nome`>
- _Nota:_ <ressalva honesta, se houver>

### 🔄 <Frente 2 — ex.: Resiliência>
- <...>

### 🐛 <Correções de raiz, se houver>
- <bug encontrado → o que foi corrigido>
```
