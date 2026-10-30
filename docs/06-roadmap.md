# 06 — Roadmap

Regra de ouro: **cada etapa termina jogável no navegador** e verificada com screenshots + `critico-de-arte`.

## Etapa 0 — Piloto técnico (1–3 sessões)

Objetivo: provar a técnica (esqueleto + IK + pintura por código) no nosso tema.

- [x] Clareira de várzea pintada por código (chão, samaúma, açaizeiros, arbustos, pedras), cacheada offscreen; vento balança folhas
- [x] Jogador bípede com esqueleto invisível + IK, anda em 8 direções (WASD), câmera 3/4 seguindo
- [x] Ação de golpe com facão (clique): antecipação → golpe → recuperação, com rastro
- [x] Uma **capivara** quadrúpede andando com marcha procedural, comportamento simples (vagar, fugir se correr perto)
- [x] Domar a capivara oferecendo fruta (tecla E perto dela, devagar) → ela passa a seguir o jogador
- [x] 60 FPS medido; zero imagens carregadas (verificar na aba Network)

Prompt: `prompts/01-piloto.md`

## Etapa 1 — MVP jogável (4–6 semanas)

- [ ] Mapa de várzea com 3–4 áreas, ruído para variação
- [ ] Coleta: madeira, cipó, frutos, pedra, peixe; inventário simples
- [ ] Crafting: facão, lança, cesta, fogueira, rede de dormir
- [ ] Sobrevivência: fome, sede, energia; ciclo dia/noite
- [ ] Domar: capivara, anta, jacaré (os 3 esqueletos de chão: Q, Q, R)
- [ ] Predador: onça à noite (perigo real)
- [ ] Base: palafita simples + fogueira
- [ ] Save local (localStorage com try/catch) e menu
- [ ] Controles de toque no celular
- [ ] Publicar em itch.io / link próprio e gravar dev log

## Etapa 2 — Floresta viva (v2)

- [ ] Ciclo **cheia/seca** transformando o mapa; canoa
- [ ] Terra firme e igapó como novas regiões
- [ ] Primeira megafauna: **preguiça-gigante** (carga)
- [ ] Harpia (ovo → montaria aérea curta)
- [ ] Mecânica de **equilíbrio da floresta** + primeira aparição do **Curupira**
- [ ] Diário do Naturalista (catálogo das criaturas)
- [ ] Save na nuvem (avaliar Supabase)
- [ ] Publicação em CrazyGames/Poki

## Etapa 3 — Lendas e social (v3)

- [ ] **Ecos do Cretáceo** (sítios fósseis): Amazonsaurus (carga gigante), Oxalaia (chefe/montaria do rio), Pycnonemosaurus (predador de terra firme) — exige esqueletos de pescoço/cauda em corrente e terópode
- [ ] Chefes: Mapinguari (terra firme), Purussaurus (rio), Boitatá (evento)
- [ ] Co-op 2–4 (WebSocket)
- [ ] Telegram Mini App
- [ ] **Avaliar** economia com moeda digital (colecionáveis, itens raros) — somente com orientação jurídica; começar com pontos sem valor monetário
- [ ] Avaliar Steam (página cedo para acumular wishlists)

## Métricas para acompanhar desde o MVP

- Tempo médio de sessão, % que doma a primeira criatura, retorno D1/D7.
- FPS médio em celular.
