# 05 — Direção de arte

## Estilo

- **HQ / ilustração chapada**: 2–3 tons por forma (base, sombra, luz) + **contorno escuro de tinta** (não preto puro: verde-musgo ou marrom muito escuro, ~#1d1a12).
- Câmera **isométrica 3/4**, luz vindo do **topo-esquerda** (sombras para baixo-direita).
- Leitura clara a distância: silhuetas fortes; criaturas sempre se destacam do fundo (fundo mais dessaturado, personagens mais saturados).
- Movimento > detalhe: animação fluida com antecipação e recuperação vale mais que textura.
- Proibido: gradientes "de app", brilho plástico, contornos finos cinza, estética genérica de asset store.

## Paleta base (ajustável, mas registre mudanças em 07-decisoes.md)

| Uso | Cores |
|---|---|
| Mata densa (fundo) | #1f3d2b · #2c5a3a · #3f7a47 |
| Folhagem viva | #4f9a4a · #6fb85a · #9fd16b |
| Chão de terra firme | #6b4a2e · #8a6239 · #a97c4a |
| Várzea / lama | #5a4a32 · #74613f |
| Rio Solimões (barrento) | #8a6b3f · #a8864f · #c9a66b (reflexos) |
| Rio Negro / igapó | #1c1712 · #3a2a1c · #6b4a2c (reflexos âmbar) |
| Céu / luz dourada | #f2c46b · #f7dc9a |
| Pôr do sol / fogo | #e3743b · #f29a4b · #c94a2a |
| Contorno | #1d1a12 |
| Interface (UI) | madeira escura #3a2a1c, palha #d9c08a, texto #f4ead2 |

## Ciclo dia/noite e estações

- Dia: luz quente; noite: azul-esverdeado escuro com vaga-lumes e olhos refletindo.
- **Cheia**: água invade a várzea, troncos submersos, reflexos de copa na água.
- **Seca**: praias de areia clara (#e3d2a4), lama rachada, rio estreito.
- Chuva tropical: cortinas de chuva diagonais + respingos (só efeitos animados; chão continua cacheado).

## Regras de pintura por código

- Cada objeto é uma **função pura de pintura** (`paintSamauma(ctx, seed, size)`) com **seed** para variar sem repetir.
- Elementos estáticos → **cache offscreen por chunk**. Só vento (balanço de copa/folhas), água e criaturas são animados.
- Árvores icônicas para pintar: **samaúma** (raízes tabulares), açaizeiro, buriti, castanheira, embaúba, vitória-régia na água, cipós.
- Criaturas: corpo em formas simples (elipses/capsulas por osso) + **padrões** por espécie (rosetas da onça, escamas do jacaré, listras da queixada jovem) desenhados por cima.
- Rostos: só quando necessário e **uma direção por vez** (custo alto).

## Referências (só para olhar, nunca carregar no jogo)

- Hades (iluminação, contorno, leitura isométrica) — referência do Dunloc.
- Fotografia real da Amazônia para paleta (várzea, igapó, encontro das águas).
- Ilustrações paleontológicas de megafauna sul-americana.
- Guarde referências geradas por IA em `refs/` com fundo verde chapado.
