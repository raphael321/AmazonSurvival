# Prompt 02 — Refinamentos (um foco por rodada)

Use **um** destes por vez. Pedir vários juntos faz a qualidade cair.

## Movimento do jogador
> A animação de andar do jogador está [descreva: rígida / braço torto / pés deslizando]. Trabalhe só nisso. Compare quadro a quadro, ajuste poses-chave e IK até o movimento ficar natural. Use o critico-de-arte e só me entregue quando ele aprovar.

## Rosto (uma direção)
> O rosto do jogador não está parecido com `refs/rosto-jogador.png`. Comece apenas pela direção sul. Analise olhos, boca, nariz, cabelo e proporções; coloque lado a lado referência e desenho, e itere com o critico-de-arte até ficar próximo em nível de detalhe. Não mexa em mais nada.

## Nova criatura
> Adicione a criatura [nome] seguindo `docs/04-bestiario.md`. Reaproveite o esqueleto [Q/R/S/A/B] e as funções de pintura existentes; mude só proporções, paleta, padrão e comportamento. Não altere o estilo de arte aprovado. Valide com screenshots nas 8 direções.

## Novo elemento de cenário
> Adicione [samaúma / vitória-régia / buriti / ...] como função pura de pintura com seed, cacheada offscreen. Mostre 5 variações lado a lado numa página de teste antes de colocar no mapa.

## Desempenho
> Meça o FPS com 30 criaturas na tela usando chrome-devtools. Se cair abaixo de 60, use perf-web-optimization e cache por direção/pose para recuperar. Mostre antes e depois.

## Decisão difícil
> Convoque the-jury para decidir: [pergunta]. Registre o veredito em docs/07-decisoes.md.

## Pré-mortem de escopo
> Use the-fool para fazer um pré-mortem da Etapa [N] do roadmap: o que provavelmente vai dar errado e o que cortar.
