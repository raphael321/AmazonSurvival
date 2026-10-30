# Amazon Survival 🌿

Jogo de sobrevivência e domar criaturas inspirado em ARK, ambientado na Amazônia — fauna real, megafauna pré-histórica e folclore — rodando no navegador, com **tudo desenhado por código** em Canvas 2D.

## Como começar uma sessão no Claude Code

```bash
cd ~/Documents/"Amazon Survival"
claude
```

Na primeira mensagem, cole o conteúdo de `prompts/01-piloto.md`. O Claude Code lê o `CLAUDE.md` automaticamente.

Primeira vez usando a skill de navegador (instala o Playwright + Chromium):

```bash
cd .claude/skills/playwright-skill && npm run setup
```

## Estrutura

```
Amazon Survival/
├── CLAUDE.md               ← instruções do projeto (lidas pelo Claude Code)
├── README.md
├── docs/
│   ├── 01-visao-do-jogo.md
│   ├── 02-pesquisa-de-mercado.md
│   ├── 03-referencias-tecnicas.md   ← técnica do Dunloc Online
│   ├── 04-bestiario.md
│   ├── 05-direcao-de-arte.md
│   ├── 06-roadmap.md
│   └── 07-decisoes.md
├── prompts/
│   ├── 01-piloto.md
│   └── 02-refinamentos.md
├── refs/                   ← imagens de referência (nunca carregadas pelo jogo)
├── game/                   ← código do jogo (vazio até o piloto)
└── .claude/
    ├── agents/             ← critico-de-arte, testador-de-jogo
    └── skills/             ← tlc-prd, tlc-spec-driven, the-jury, the-fool,
                              playwright-skill, chrome-devtools,
                              perf-web-optimization, subagent-creator
```

## Rodar o jogo

```bash
python3 -m http.server -d game 8080
# abra http://localhost:8080
```

## Créditos

- Skills: [tech-leads-club/agent-skills](https://github.com/tech-leads-club/agent-skills) (MIT).
- Técnica de desenho por código inspirada no Dunloc Online (RafaxLab).
