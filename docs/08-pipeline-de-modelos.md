# 08 — Pipeline de modelos 3D

Como um modelo vira objeto do jogo. Feito pela primeira vez com dois pacotes da Tripo (`stylized_forest_props`), em 2026-10-31.

## Por que existe

Modelos de IA (Tripo, Meshy) costumam vir assim: **tudo numa malha só**, texturas enormes (8192²) e mapas de PBR que o nosso estilo toon não usa. O primeiro pacote veio com 15 MB, 94 mil triângulos e ~540 MB de memória de vídeo. Depois do pipeline: 26 objetos separados e nomeados, 0,4–4 mil triângulos cada, ~1 MB no total, mais versões de baixo detalhe (LOD).

## Passos

1. **Separar** (`game3d/tools/split-tripo.mjs`): componentes conectados da malha (com vértices soldados) viram objetos. Peças pequenas (musgo, folhinhas) entram no objeto que as contém. Cada objeto é centralizado com a base em y=0 e recebe um nome (linha e coluna da prateleira).
   - `SPLIT=overlap` junta componentes que se sobrepõem na vista de frente (bom quando cada objeto é feito de várias peças grandes).
   - `SPLIT=big` mantém cada componente grande separado (bom quando copas largas encostam nas vizinhas).
2. **Otimizar** com `@gltf-transform/cli`:
   ```bash
   gltf-transform weld in.glb out.glb
   gltf-transform simplify out.glb out.glb --ratio 0.25 --error 0.006
   gltf-transform resize out.glb out.glb --width 2048 --height 2048
   gltf-transform webp out.glb out.glb --quality 88
   gltf-transform meshopt out.glb out.glb
   ```
3. **LOD** (mesmos passos com `--ratio 0.06 --error 0.03` e textura 512) → `*-lod.glb`.
4. **Registrar** as medidas em `game3d/src/models-meta.js`, a altura alvo de cada objeto em `TARGET_H` e a categoria em `MODEL_SETS` (`props3d.js`).

## No jogo

- `assets.js` carrega os pacotes (meshopt), converte a geometria quantizada para float e troca o material por toon (textura pintada + rampa de 3 tons). O contorno é um casco inflado.
- `props3d.js`: **um InstancedMesh por tipo para o mundo todo** (pool), com distância de desenho por tamanho, LOD a partir de 850 unidades e sombra só nos objetos médios e grandes.
- Na página publicada (que não serve .glb), os modelos vão embutidos em base64 (`window.__EMBEDDED_ASSETS`).

## Regras para próximos modelos

- Exportar .glb. Escala e posição não importam (o pipeline normaliza).
- Preferir **um objeto por arquivo**, ou objetos bem separados na cena.
- Textura de cor basta; normal e rugosidade são descartadas.
- Os originais ficam fora do git (pesados); só os otimizados entram em `game3d/www/assets/`.
- Verificar a licença de uso comercial da ferramenta que gerou o modelo antes de vender o jogo.
