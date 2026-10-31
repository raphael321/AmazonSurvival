# CLAUDE.md — Amazon Survival

Você é o engenheiro sênior deste projeto, trabalhando com o Raphael. Responda sempre em **português do Brasil**.

## O que estamos construindo

Um jogo de **sobrevivência + domar criaturas** inspirado em ARK, ambientado na **Amazônia**, rodando **no navegador**.
Mistura duas camadas de criaturas:

- **Real:** fauna amazônica atual (onça, sucuri, jacaré-açu, anta, harpia...) e **megafauna pré-histórica** com registro fóssil na região (Purussaurus, preguiça-gigante, toxodonte, ave-do-terror, gliptodonte).
- **Folclore:** Mapinguari, Curupira, Boitatá, Boto, Iara etc. como chefes, eventos e criaturas raras.

Leia antes de qualquer trabalho grande:

| Arquivo | Conteúdo |
|---|---|
| `docs/01-visao-do-jogo.md` | Conceito, pilares, loop principal, o que adaptar do ARK |
| `docs/02-pesquisa-de-mercado.md` | Dados de gêneros, retenção e por que este escopo |
| `docs/03-referencias-tecnicas.md` | Técnica do Dunloc Online (tudo desenhado por código) e fluxo do vídeo do @giroka_eu |
| `docs/04-bestiario.md` | Todas as criaturas, esqueleto base, tier, como domar |
| `docs/05-direcao-de-arte.md` | Estilo visual, paleta, câmera, regras de desenho |
| `docs/06-roadmap.md` | Fases (MVP → v2 → v3) e critérios de pronto |
| `docs/07-decisoes.md` | Registro de decisões tomadas (atualize sempre) |
| `prompts/` | Prompts prontos para cada etapa |

## Stack e regras técnicas

> **Atualização 2026-10-31:** decidido: **o jogo é 3D em Three.js**, em `game3d/` (ver `docs/07-decisoes.md`). As regras abaixo valem para o piloto 2D em `game/`; no 3D usamos Three.js (WebGL), objetos/terreno gerados por código e, quando ele trouxer, modelos próprios em .glb leves. Alvo: navegador e Steam (Electron + steamworks.js).

### Piloto 2D (`game/`)

- **HTML5 + JavaScript puro (ES modules) + Canvas 2D.** Sem engine (nada de Phaser, Unity, Godot), sem WebGL, sem framework de UI.
- **Nenhuma imagem no jogo.** Personagens, criaturas, cenário e efeitos são **desenhados por código**. Imagens geradas por IA podem existir só como **referência** em `refs/` (nunca carregadas pelo jogo).
- Personagens e criaturas = **esqueleto 3D invisível** (matemática pura) com **IK de dois ossos** nos membros, projetado e **pintado em 2D**. Ver `docs/03-referencias-tecnicas.md`.
- **Cenário estático** é pintado **uma vez** em canvas fora da tela (offscreen) ao carregar e reaproveitado. A cada quadro só se redesenha o que se move (personagens, criaturas, água, vento, efeitos).
- Câmera **isométrica 3/4**, movimento em **8 direções**.
- Meta de desempenho: **60 FPS** em notebook comum e celular intermediário. Sem dependências em runtime.
- Código em `game/`. Abrir com um servidor estático simples (`npx serve game` ou `python3 -m http.server -d game 8080`).
- Organização sugerida: `game/index.html`, `game/src/engine/` (loop, input, câmera, render), `game/src/skeleton/` (ossos, IK, poses), `game/src/art/` (funções de pintura), `game/src/world/` (mapa, bioma), `game/src/entities/` (jogador, criaturas), `game/src/systems/` (sobrevivência, crafting, domar).

## Como trabalhar (fluxo com skills)

Skills instaladas em `.claude/skills/` (do repositório MIT `tech-leads-club/agent-skills`):

| Skill | Quando usar |
|---|---|
| `tlc-prd` | Fechar o documento de produto de uma fase ou sistema antes de codar |
| `tlc-spec-driven` | Implementar features: especificar → desenhar → tarefas → executar, com verificador independente |
| `the-jury` | Decisões técnicas difíceis (júri de 3–5 agentes, veredito com confiança) |
| `the-fool` | Pré-mortem / advogado do diabo antes de comprometer escopo |
| `playwright-skill` | Abrir o jogo no navegador, tirar screenshots, testar (primeira vez: `npm run setup` dentro da skill) |
| `chrome-devtools` | Depurar console, medir FPS e memória |
| `perf-web-optimization` | Otimizar carregamento e peso |
| `subagent-creator` | Criar novos subagentes especializados |

Subagentes em `.claude/agents/`:

- `critico-de-arte` — compara screenshots com a direção de arte/referências e devolve lista de correções. **Use antes de entregar qualquer coisa visual.**
- `testador-de-jogo` — abre o jogo, joga o fluxo, mede FPS e reporta bugs.

Regras de processo:

1. **Um foco por rodada.** Contexto demais faz a IA entregar tudo mediano (lição do Dunloc). Ex.: uma rodada só para a anta andar bem; outra só para o rosto do jogador.
2. **Sempre verifique no navegador** antes de dizer que está pronto: rode o servidor, tire screenshots, passe pelo `critico-de-arte`.
3. **Não mude o estilo de arte** já aprovado ao criar coisas novas. Reaproveite funções de pintura e paleta.
4. Registre toda decisão relevante em `docs/07-decisoes.md`.
5. Commits pequenos, em português, um por tarefa concluída.
6. Economia de tokens: refinamento pixel a pixel (rostos, detalhes) é caro — faça só na direção/criatura pedida.

## Fora de escopo por enquanto

- Multiplayer, contas, backend, servidores.
- Qualquer coisa de **moeda digital / token / NFT** — fica para a v3 e só com análise jurídica (valores mobiliários e jogos de azar).
- Usar nome, arte, ícones ou interface do ARK. Mecânicas são livres; identidade visual é nossa.

## Cuidado cultural

Povos indígenas e lendas devem ser representados com respeito e pesquisa: nada de estereótipos ou "fantasia tribal" genérica. Na dúvida, prefira não representar e registre a dúvida em `docs/07-decisoes.md`.
