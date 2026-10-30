# 03 — Referências técnicas

## A. Dunloc Online (RafaxLab) — a técnica principal

Vídeo: "Meu MMORPG não usa imagens: a IA desenha tudo por código" — https://www.youtube.com/watch?v=Vi8wJKNYRp8

MMORPG de navegador, câmera isométrica 3/4, estilo inspirado em Hades. **Nenhum arquivo de imagem**: tudo desenhado em **Canvas 2D por código**, escrito pela IA (Claude Code).

### Como funciona

1. **Esqueleto 3D invisível.** O personagem é só matemática: ossos (quadril, tronco, cabeça, braço, antebraço, coxa, canela). Não é renderizado; é projetado para 2D e "pintado" por cima.
2. **IK de dois ossos** (cinemática inversa) em braços e pernas: você define onde a mão/pé deve ir e o cotovelo/joelho se resolve sozinho. Movimento natural sem animar cada osso à mão.
3. **Animação por poses-chave** com **antecipação** e **recuperação** (golpe → pausa → volta), interpoladas.
4. **Estilo HQ:** formas chapadas com **2 ou 3 tons** + **contorno escuro de tinta**.
5. **Cenário pintado uma vez** em canvas offscreen ao carregar (chão, árvores, pedras). Depois só se reaproveita. **Só o balanço do vento é animado.**
6. A cada quadro, desenha-se apenas: personagens, rastro de arma, vento, efeitos.
7. **8 direções** de movimento; o rosto precisa de versões por direção.

### Fluxo de trabalho que ele usou

- Quando estava travado, pediu ao Claude uma versão mínima "estilo Hades". O Claude fez **duas tentativas paralelas (3D WebGL vs Canvas 2D)** e um **juiz** decidiu: Canvas 2D venceu por 2 a 1. → aqui usamos a skill `the-jury` para isso.
- Gerou o rosto de referência numa IA de imagem (**fundo verde** para facilitar isolar), e o Claude gerou as outras direções com Nano Banana (Gemini).
- Um **agente crítico** abria o jogo no navegador, tirava screenshots e comparava com a referência até aprovar. → aqui: subagente `critico-de-arte` + skill `playwright-skill`.
- Refinamento é iterativo: "o braço está torto", "movimento mais natural" etc.

### Custos que ele mostrou (para calibrar expectativa)

- Piloto a partir de um prompt: **~2h e 21,7 milhões de tokens**.
- Refinar só o rosto virado para o sul: **~2h28 e 44 milhões de tokens**.
- Os dois rostos completos (masc./fem., todas as direções): ~10 horas.
- Lição dele: **um prompt só não faz um jogo**; **focar uma coisa por vez** dá resultado muito melhor do que pedir tudo junto.

### Prompt do piloto dele (resumo)

> Crie um piloto de RPG isométrico, câmera 3/4, no navegador com Canvas 2D. Um campo aberto com um cavaleiro que dá um combo de 3 golpes estilo Hades. Sem WebGL, sem engine, sem imagens: tudo desenhado por código. O personagem é um esqueleto 3D invisível com IK de dois ossos em braços e pernas, pintado em 2D. Animação com poses-chave, antecipação e recuperação. Estilo HQ: formas chapadas com 2–3 tons e contorno de tinta escura. Árvores, arbustos e pedras pintados por código, uma vez, em canvas offscreen; só o vento é animado. WASD para mover, clique para atacar. Use a referência anexa de rosto. Antes de entregar, use um agente crítico: abra no navegador, tire screenshots e corrija.

Nosso prompt adaptado está em `prompts/01-piloto.md`.

## B. @giroka_eu — fluxo com sprites (referência secundária)

Short: "Criando um jogo do zero usando IA" — https://www.youtube.com/shorts/oyAeaNGmTW4

- Jogo survival top-down em pixel art na selva (coletar, cortar, construir, dormir, mochila).
- ChatGPT gerava a folha de sprites; Claude recortava, removia fundo e limpava pixels; abandonou o Construct 3 e foi para HTML5 puro; depois migrou para Claude Code.
- **Não vamos usar sprites** (decisão: desenho por código, ver `07-decisoes.md`), mas o vídeo valida o tema "sobreviver na selva" e o formato de dev log.

## C. Por que esqueleto procedural é perfeito para domar criaturas

O gargalo de um jogo de domar é **animar dezenas de bichos**. Com esqueleto:

- **Bípede**: jogador, Curupira, Mapinguari (proporções exageradas).
- **Quadrúpede**: onça, anta, capivara, queixada, toxodonte, preguiça-gigante (em pé ou de quatro), gliptodonte.
- **Corrente/serpente**: sucuri, poraquê, também peixes grandes (pirarucu) com menos segmentos.
- **Ave**: harpia, arara, ave-do-terror (bípede corredor).
- **Réptil baixo**: jacaré-açu, Purussaurus (quadrúpede baixo + cauda em corrente).

Uma criatura nova = **proporções + paleta + padrão de pele + sons/comportamento** em cima de um esqueleto que já anda. Ver `04-bestiario.md`.

## D. Técnicas úteis a pesquisar/implementar

- IK analítico de 2 ossos (lei dos cossenos) e **marcha procedural** (pés plantados que "pulam" quando se afastam do corpo).
- Ordenação por profundidade (y-sort) para isométrico.
- Ruído (value/simplex) para gerar mapa e variação de árvores.
- Canvas offscreen por **chunk** de mapa (não um canvas gigante).
- `OffscreenCanvas` / pré-render de partes que não mudam de cada criatura em cada direção (cache) para manter 60 FPS com muitas criaturas.
