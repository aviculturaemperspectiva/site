# Dados do mapa interativo

Esta pasta deve conter os dois arquivos gerados pelo script
`indice_especializacao_avicultura.py` (executado localmente, fora deste
repositório):

- `municipios_brasil_simplificado.geojson`
- `dados_mapa_web.json`

## Como gerar/atualizar esses arquivos

1. Rode o script Python normalmente (ele já produz esses dois arquivos
   automaticamente, junto com a planilha `.xlsx` e o mapa estático `.png`).
2. Copie os dois arquivos gerados para esta pasta (`data/`), substituindo
   os anteriores.
3. Suba (`git add`, `git commit`, `git push`) — o GitHub Pages atualiza
   sozinho em alguns minutos.

Não é necessário mexer em nada no HTML/JS do mapa (`mapa.html`, `js/mapa.js`)
para atualizar os dados — os caminhos já apontam para esta pasta.
