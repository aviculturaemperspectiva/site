/* ============================================================================
   Mapa da Especialização Avícola por Município — Avicultura em Perspectiva
   ----------------------------------------------------------------------
   Depende do Leaflet (carregado via CDN no <head> de mapa.html) e de dois
   arquivos de dados gerados pelo script Python (indice_especializacao_avicultura.py):
     - data/municipios_brasil_simplificado.geojson
     - data/dados_mapa_web.json
   ========================================================================== */

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================
const CAMINHO_GEOJSON = "data/municipios_brasil_simplificado.geojson";
const CAMINHO_DADOS_JSON = "data/dados_mapa_web.json";
const NUMERO_CLASSES = 8;

// Paleta sequencial ancorada na cor de destaque do site (#d91e00), do mais
// claro ao mais escuro -- assim o mapa fica visualmente parte da mesma marca.
const PALETA_CORES = [
  "#f8e9e7", "#f2cac4", "#efa093", "#f16e59",
  "#f3391b", "#d02105", "#951703", "#571004",
];
const COR_SEM_DADO = "#d6d6d6";

// ============================================================================
// ESTADO GLOBAL
// ============================================================================
let mapa;
let camadaMunicipios = null;
let geojsonBruto = null;
let dadosPorCodigo = null;
let quebras = [];
let controleLegenda = null;

const REGIOES_UFS = {
  "Norte": ["RO", "AC", "AM", "RR", "PA", "AP", "TO"],
  "Nordeste": ["MA", "PI", "CE", "RN", "PB", "PE", "AL", "SE", "BA"],
  "Sudeste": ["MG", "ES", "RJ", "SP"],
  "Sul": ["PR", "SC", "RS"],
  "Centro-Oeste": ["MS", "MT", "GO", "DF"],
};

// ============================================================================
// INICIALIZAÇÃO DO MAPA
// ============================================================================
function inicializarMapa() {
  mapa = L.map("mapa", {
    zoomControl: true,
    minZoom: 3,
    maxZoom: 10,
  }).setView([-14.2, -51.9], 4);
}

// ============================================================================
// CLASSIFICAÇÃO EM QUANTIS
// ============================================================================
function calcularQuebrasQuantis(valores, k) {
  const validos = valores.filter((v) => v !== null && v !== undefined && !isNaN(v)).sort((a, b) => a - b);
  if (validos.length === 0) return [];

  const quebrasCalculadas = [];
  for (let i = 1; i < k; i++) {
    const posicao = (i / k) * (validos.length - 1);
    const indiceBaixo = Math.floor(posicao);
    const indiceAlto = Math.ceil(posicao);
    const fracao = posicao - indiceBaixo;
    const valor = validos[indiceBaixo] + (validos[indiceAlto] - validos[indiceBaixo]) * fracao;
    quebrasCalculadas.push(valor);
  }
  quebrasCalculadas.push(validos[validos.length - 1]);
  return quebrasCalculadas;
}

function obterCorPorValor(valor) {
  if (valor === null || valor === undefined || isNaN(valor)) return COR_SEM_DADO;
  for (let i = 0; i < quebras.length; i++) {
    if (valor <= quebras[i]) return PALETA_CORES[Math.min(i, PALETA_CORES.length - 1)];
  }
  return PALETA_CORES[PALETA_CORES.length - 1];
}

// ============================================================================
// LEGENDA
// ============================================================================
function desenharLegenda() {
  if (controleLegenda) {
    mapa.removeControl(controleLegenda);
    controleLegenda = null;
  }

  const LegendaControl = L.Control.extend({
    onAdd: function () {
      const div = L.DomUtil.create("div", "legend-panel");
      let html = '<div class="legend-title">LQ Avicultura (quantis desta seleção)</div>';

      if (quebras.length === 0) {
        html += '<div class="legend-row">Sem dados suficientes nesta seleção</div>';
      } else {
        let limiteAnterior = null;
        for (let i = 0; i < quebras.length; i++) {
          const cor = PALETA_CORES[Math.min(i, PALETA_CORES.length - 1)];
          const rotulo = limiteAnterior === null
            ? `≤ ${quebras[i].toFixed(2)}`
            : `${limiteAnterior.toFixed(2)} – ${quebras[i].toFixed(2)}`;
          html += `<div class="legend-row"><span class="legend-swatch" style="background:${cor}"></span>${rotulo}</div>`;
          limiteAnterior = quebras[i];
        }
      }
      html += `<div class="legend-row"><span class="legend-swatch" style="background:${COR_SEM_DADO}"></span>Sem dado</div>`;

      div.innerHTML = html;
      L.DomEvent.disableClickPropagation(div);
      return div;
    },
    options: { position: "bottomleft" },
  });

  controleLegenda = new LegendaControl();
  controleLegenda.addTo(mapa);
}

// ============================================================================
// FORMATAÇÃO DO TOOLTIP
// ============================================================================
function formatarNumero(valor, casasDecimais = 0) {
  if (valor === null || valor === undefined || isNaN(valor)) return "sem dado";
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: casasDecimais,
    maximumFractionDigits: casasDecimais,
  });
}

function construirTooltipHTML(dados) {
  if (!dados) {
    return `<div class="t-title">Sem dado</div><div class="t-sub">Município fora da base do índice</div>`;
  }
  return `
    <div class="t-title">${dados.nome}</div>
    <div class="t-sub">${dados.regiao} · ${dados.uf}</div>
    <div class="t-row"><span class="t-label">Produção de ovos</span><span class="t-value">${formatarNumero(dados.producao_ovos_mil_duzias, 1)} mil dz</span></div>
    <div class="t-row"><span class="t-label">% PIB agro nacional</span><span class="t-value">${formatarNumero(dados.participacao_pib_agro_nacional_pct, 3)}%</span></div>
    <div class="t-row"><span class="t-label">% PIB agro estadual</span><span class="t-value">${formatarNumero(dados.participacao_pib_agro_estadual_pct, 2)}%</span></div>
    <div class="t-row t-lq"><span class="t-label">LQ Avicultura</span><span class="t-value">${formatarNumero(dados.lq_avicultura, 2)}</span></div>
    <div class="t-row"><span class="t-label">Colocação (produção)</span><span class="t-value">${dados.colocacao_producao_ovos ?? "—"}º</span></div>
    <div class="t-row"><span class="t-label">Colocação (LQ)</span><span class="t-value">${dados.colocacao_lq ?? "—"}º</span></div>
  `;
}

// ============================================================================
// CAMADA GEOJSON (recriada a cada mudança de filtro)
// ============================================================================
function estiloFeature(feature) {
  const dados = dadosPorCodigo[feature.properties.id];
  const valor = dados ? dados.lq_avicultura : null;
  return {
    fillColor: obterCorPorValor(valor),
    weight: 0.4,
    color: "#ffffff",
    fillOpacity: 0.9,
  };
}

function aoPassarMouse(e) {
  const camada = e.target;
  camada.setStyle({ weight: 1.6, color: "#1e1e1e" });
  camada.bringToFront();
}

function aoSairMouse(e) {
  camadaMunicipios.resetStyle(e.target);
}

function paraCadaFeature(feature, layer) {
  const dados = dadosPorCodigo[feature.properties.id];
  layer.bindTooltip(construirTooltipHTML(dados), {
    className: "mun-tooltip",
    sticky: true,
    direction: "top",
  });
  layer.on({
    mouseover: aoPassarMouse,
    mouseout: aoSairMouse,
  });
}

function filtrarFeature(feature) {
  const dados = dadosPorCodigo[feature.properties.id];
  const regiaoSelecionada = document.getElementById("filtro-regiao").value;
  const ufSelecionada = document.getElementById("filtro-uf").value;

  if (!dados) return !regiaoSelecionada && !ufSelecionada;
  if (regiaoSelecionada && dados.regiao !== regiaoSelecionada) return false;
  if (ufSelecionada && dados.uf !== ufSelecionada) return false;
  return true;
}

function reconstruirCamada() {
  if (camadaMunicipios) {
    mapa.removeLayer(camadaMunicipios);
  }

  // Recalcula os quantis usando só os municípios da seleção atual (região/UF),
  // para que a variação relativa DENTRO da seleção fique visível -- em vez de
  // sempre usar a escala nacional, que "esmagaria" as diferenças locais.
  const featuresIncluidas = geojsonBruto.features.filter(filtrarFeature);
  const valoresDaSelecao = featuresIncluidas
    .map((f) => dadosPorCodigo[f.properties.id])
    .filter((d) => d && d.lq_avicultura !== null && d.lq_avicultura !== undefined)
    .map((d) => d.lq_avicultura);

  const valoresUnicos = new Set(valoresDaSelecao).size;
  const classesEfetivas = Math.max(1, Math.min(NUMERO_CLASSES, valoresUnicos));
  quebras = calcularQuebrasQuantis(valoresDaSelecao, classesEfetivas);

  camadaMunicipios = L.geoJSON(geojsonBruto, {
    style: estiloFeature,
    filter: filtrarFeature,
    onEachFeature: paraCadaFeature,
  }).addTo(mapa);

  const bounds = camadaMunicipios.getBounds();
  if (bounds.isValid()) {
    mapa.fitBounds(bounds, { padding: [16, 16] });
  }

  const quantidade = camadaMunicipios.getLayers().length;
  document.getElementById("status-texto").textContent =
    `${quantidade.toLocaleString("pt-BR")} município(s) exibido(s)`;

  desenharLegenda();
}

// ============================================================================
// FILTROS (dropdowns encadeados: Região -> Estado)
// ============================================================================
function popularFiltroRegiao() {
  const select = document.getElementById("filtro-regiao");
  Object.keys(REGIOES_UFS).forEach((regiao) => {
    const opt = document.createElement("option");
    opt.value = regiao;
    opt.textContent = regiao;
    select.appendChild(opt);
  });
}

function popularFiltroUF(regiaoSelecionada) {
  const select = document.getElementById("filtro-uf");
  select.innerHTML = '<option value="">Todos</option>';

  const ufs = regiaoSelecionada ? REGIOES_UFS[regiaoSelecionada] : Object.values(REGIOES_UFS).flat();
  ufs.sort().forEach((uf) => {
    const opt = document.createElement("option");
    opt.value = uf;
    opt.textContent = uf;
    select.appendChild(opt);
  });
}

function configurarEventosFiltro() {
  const selectRegiao = document.getElementById("filtro-regiao");
  const selectUF = document.getElementById("filtro-uf");
  const botaoLimpar = document.getElementById("btn-limpar");

  selectRegiao.addEventListener("change", () => {
    popularFiltroUF(selectRegiao.value);
    reconstruirCamada();
  });

  selectUF.addEventListener("change", reconstruirCamada);

  botaoLimpar.addEventListener("click", () => {
    selectRegiao.value = "";
    popularFiltroUF("");
    reconstruirCamada();
  });
}

// ============================================================================
// CARREGAMENTO DOS DADOS E BOOT
// ============================================================================
async function carregarDados() {
  const [respGeojson, respDados] = await Promise.all([
    fetch(CAMINHO_GEOJSON),
    fetch(CAMINHO_DADOS_JSON),
  ]);

  if (!respGeojson.ok) throw new Error(`Falha ao carregar ${CAMINHO_GEOJSON}: ${respGeojson.status}`);
  if (!respDados.ok) throw new Error(`Falha ao carregar ${CAMINHO_DADOS_JSON}: ${respDados.status}`);

  geojsonBruto = await respGeojson.json();
  dadosPorCodigo = await respDados.json();
}

async function iniciarMapaAvicultura() {
  try {
    inicializarMapa();
    await carregarDados();

    popularFiltroRegiao();
    popularFiltroUF("");
    configurarEventosFiltro();

    reconstruirCamada();

    document.getElementById("mapa-loading-overlay").style.display = "none";
  } catch (erro) {
    document.getElementById("status-texto").textContent = "Erro ao carregar dados — veja o console.";
    document.getElementById("mapa-loading-overlay").textContent =
      "Não foi possível carregar o mapa. Verifique se os arquivos em /data estão publicados e se a página está sendo servida via HTTP.";
    console.error(erro);
  }
}

document.addEventListener("DOMContentLoaded", iniciarMapaAvicultura);
