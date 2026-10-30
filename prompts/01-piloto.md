# Prompt 01 — Piloto técnico

Cole no Claude Code dentro desta pasta (depois de ele ler o CLAUDE.md). Se tiver uma imagem de referência do rosto do jogador (fundo verde, virado para o sul, olhando para frente), coloque em `refs/rosto-jogador.png` e anexe também.

---

Leia `CLAUDE.md` e os documentos em `docs/` (principalmente 03, 04 e 05). Depois crie o **piloto técnico** descrito na Etapa 0 de `docs/06-roadmap.md`:

Um jogo isométrico, câmera 3/4, rodando no navegador com **Canvas 2D**, em `game/`. **Sem WebGL, sem engine, sem imagens: tudo é desenhado por código.**

- **Cenário:** uma pequena clareira de várzea amazônica — chão de terra e lama, uma samaúma com raízes tabulares, açaizeiros, arbustos, pedras e uma beira de rio barrento. Tudo pintado por código, **uma vez**, em canvas offscreen, e reaproveitado. Só o balanço do vento nas folhas e o brilho da água são animados.
- **Jogador:** um sobrevivente com roupa simples e facão. É um **esqueleto 3D invisível** com **IK de dois ossos** em braços e pernas, projetado e pintado em 2D. Anda em **8 direções** com WASD; a câmera segue. Clique = golpe de facão com **antecipação, golpe e recuperação** e um rastro.
- **Capivara:** um quadrúpede com esqueleto próprio e **marcha procedural** (pés plantados). Vaga calmamente; se o jogador correr perto, foge. Se o jogador chegar **devagar** e apertar **E**, oferece uma fruta; depois de 3 frutas ela fica domada (coraçãozinho) e passa a **seguir o jogador**.
- **Estilo HQ:** formas chapadas com 2–3 tons e contorno escuro de tinta, paleta de `docs/05-direcao-de-arte.md`.
- Um HUD mínimo: barra de vida e contador de frutas.

Antes de construir, use a skill **the-jury** para decidir a arquitetura do esqueleto (um sistema genérico de ossos que sirva para bípede e quadrúpede vs. dois sistemas separados) e registre a decisão em `docs/07-decisoes.md`.

Construa com a skill **tlc-spec-driven** (modo enxuto, é um piloto).

Antes de me entregar: rode um servidor local, use a **playwright-skill** para abrir no navegador, tire screenshots (parado, andando em diagonal, golpeando, capivara seguindo), e passe pelo subagente **critico-de-arte** e pelo **testador-de-jogo**. Corrija o que eles apontarem. Me entregue com as screenshots, o FPS medido e o comando para eu rodar.
