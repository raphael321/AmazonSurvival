# 07 — Registro de decisões

Formato: data · decisão · motivo · alternativas descartadas. Atualize sempre que algo importante for decidido.

| Data | Decisão | Motivo | Descartado |
|---|---|---|---|
| 2026-10-30 | Gênero: survival + domar criaturas (inspirado em ARK) | Survival craft tem a melhor taxa de sucesso (20,8%) e pouca concorrência; Raphael quer ARK | Idle cripto, simulador de loja |
| 2026-10-30 | Ambientação: Amazônia | Diferenciação; quase todo survival é fantasia/zumbi | Sertão (fica como ideia futura) |
| 2026-10-30 | Tom: realista + folclore misturados | Pedido do Raphael; fauna real + megafauna fóssil + lendas | Só realista, só fantasia |
| 2026-10-30 | Plataforma: navegador primeiro | Distribuição por link, portais, Telegram depois | Steam primeiro |
| 2026-10-30 | Técnica: tudo desenhado por código em Canvas 2D, esqueleto 3D invisível + IK (estilo Dunloc Online) | Anima dezenas de criaturas reaproveitando esqueletos; leve; estilo consistente | Sprites gerados por IA (estilo @giroka_eu), Phaser, WebGL |
| 2026-10-30 | Câmera isométrica 3/4, 8 direções, estilo HQ | Referência Dunloc/Hades; leitura boa para criaturas | Top-down puro, pixel art |
| 2026-10-30 | Sem moeda digital até a v3, e só com análise jurídica | Risco regulatório (valores mobiliários, jogos de azar) | Token desde o MVP |
| 2026-10-30 | Primeira criatura do piloto: capivara | Dócil, quadrúpede, simpática e icônica | Onça (complexa demais para o piloto) |
| 2026-10-30 | Esqueleto: **um núcleo genérico** (`Frame` + IK de 2 ossos + `Rig` com marcha procedural por grupos de pés); espécie = dados (ancoragens, comprimentos, pares de passada) + função de pintura | Bípede e quadrúpede já rodam no mesmo `Rig`; nova criatura não exige motor novo. Decidido direto (sem `the-jury`) para economizar tokens | Dois sistemas separados (bípede/quadrúpede) |
| 2026-10-30 | Projeção 3/4 ortográfica com eixos alinhados à tela (chão achatado 0,72), não losango isométrico | Chunks retangulares, WASD direto, árvores pintadas de frente; o esqueleto 3D gira livre, então a leitura 3/4 se mantém | Isométrico em losango (45°) |
| 2026-10-30 | Paleta ganhou tons extras: casca (samaúma), pedra, açaí, pele, cabelo, calça, camisa, aço, capivara, camu-camu (ver `game/src/art/palette.js`) | Faltavam cinzas/roxos/pele na paleta base | — |
| 2026-10-30 | Fruta para domar a capivara: **camu-camu** (arbusto real da beira de rio de várzea) | Real, regional e fácil de ler (frutinhas vermelhas) | Fruta genérica |
| 2026-10-30 | Quadrúpedes: patas sempre pintadas sob o corpo; passo encurta com a velocidade | Vista de cima, pata por cima do barril parecia inseto; passo longo esticava a IK | Ordenar patas só pela profundidade |
| 2026-10-30 | Dinossauros da Amazônia Legal (Amazonsaurus, Oxalaia, Pycnonemosaurus) entram como camada **"Ecos do Cretáceo"**, depois da megafauna | Pedido do Raphael; ancora o "tier final" em fósseis brasileiros reais em vez de tecnologia futurista | Colocar dinossauros desde o MVP |

## Dúvidas em aberto

- Nome final do jogo (projeto chama-se Amazon Survival por enquanto).
- Single player com save local no MVP: ok? (proposto: sim)
- Representação de povos indígenas: incluir ou não, e com qual consultoria.
- Controle no celular: joystick virtual ou toque-para-andar.
- Oxalaia é conhecido só por fragmentos do crânio e os tamanhos dos três dinossauros são estimativas: decidir quanto de "licença artística" aceitar e deixar isso claro no Diário do Naturalista.
