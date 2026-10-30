# 01 — Visão do jogo

> Nome do projeto: **Amazon Survival** (pode mudar no lançamento). Outras ideias: *Mata Viva*, *Várzea*, *Terra de Mapinguari*, *Purus*.

## Pitch em uma frase

Sobreviva à Amazônia, dome sua fauna real, a megafauna pré-histórica e as criaturas do folclore, e construa sua aldeia em palafitas enquanto o rio sobe e desce — direto no navegador.

## Pilares

1. **A floresta é viva e muda.** Ciclo de **cheia e seca** do rio transforma o mapa: na cheia a várzea vira igapó navegável; na seca surgem praias, trilhas e recursos novos.
2. **Domar é o coração.** Cada criatura tem uma forma própria de ser domada (alimento, paciência, rastro, ritual). Criaturas domadas trabalham, carregam, lutam e são montadas.
3. **Identidade brasileira.** Fauna real + megafauna fóssil + folclore. Nenhum jogo gringo tem isso.
4. **Feito para o navegador.** Abre por um link, roda leve, sessões curtas funcionam. Tudo desenhado por código.

## Loop principal

```
Explorar → Coletar (madeira, cipó, frutos, pedra, argila, peixe)
   → Craftar (ferramentas, armas, redes, canoa)
   → Sobreviver (fome, sede, febre, noite, predadores)
   → Domar criaturas → elas ampliam o que dá para coletar/explorar
   → Construir base (palafita, maloca, curral, viveiro, defumador)
   → Desbloquear novas regiões/tiers (terra firme, igapó, serra, sítio fóssil)
```

## O que adaptar do ARK

| ARK | Nossa versão (browser) |
|---|---|
| 3D, mundo enorme | 2D isométrico 3/4, mapa em regiões conectadas |
| Domar dinossauros | Fauna atual → megafauna pré-histórica → criaturas do folclore |
| Base com centenas de peças | Base modular simples: palafita, maloca, curral, viveiro, canoa |
| Servidores de 70 jogadores | Single player primeiro; co-op 2–4 na v3 |
| Fome, sede, temperatura | Fome, sede, **febre/malária**, umidade, **cheia e seca** |
| Tek tier (tecnologia futurista) | Sítios fósseis e "ecos" do passado que despertam a megafauna |

## Tom: realista + folclore

- O jogo **começa realista**: fauna atual, sobrevivência pé no chão.
- A **megafauna** entra como mistério: fósseis, pegadas gigantes, um rugido no rio.
- O **folclore** é a camada mítica: guardiões e chefes que reagem a como você trata a floresta.
  - **Curupira** pune quem caça/desmata demais (pegadas invertidas confundem o jogador).
  - **Mapinguari** é o grande chefe da terra firme — ligado à memória da preguiça-gigante.
  - **Boitatá** aparece em queimadas; dá para enfrentar ou apaziguar.
  - **Boto** e **Iara** nos rios, eventos noturnos.
- Mecânica de **equilíbrio da floresta**: explorar com moderação deixa os guardiões neutros ou aliados; predar demais os torna hostis. Diferencial de design e mensagem.

## Público e plataforma

- Primeiro: navegador desktop e celular (portais como CrazyGames/Poki, itch.io e link próprio).
- Depois: Telegram Mini App e, se der tração, Steam (survival craft tem a melhor taxa de sucesso por gênero, ver pesquisa).

## O que NÃO é

- Não é um clone do ARK: nenhuma arte, nome, ícone ou UI do ARK.
- Não é "play-to-earn" no lançamento. Economia com moeda digital só na v3, com análise jurídica.
