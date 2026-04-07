// =============================================================================
// FLAMINGUEO DASHBOARD - App Logic
// =============================================================================

// ---- CONFIGURACION ----
// Reemplaza esta URL con la de tu Google Sheet publicado como CSV
// Para cada hoja: Archivo > Compartir > Publicar en la web > CSV
const SHEETS = {
  resumen: 'https://docs.google.com/spreadsheets/d/1ZM1koLQih2Mxta4BeQhOQyIbLvFDk0qvRDFnlH4UEwo/gviz/tq?tqx=out:csv&gid=415334868',
  resenas: 'https://docs.google.com/spreadsheets/d/1ZM1koLQih2Mxta4BeQhOQyIbLvFDk0qvRDFnlH4UEwo/gviz/tq?tqx=out:csv&gid=1779225921',
  historico: 'https://docs.google.com/spreadsheets/d/1ZM1koLQih2Mxta4BeQhOQyIbLvFDk0qvRDFnlH4UEwo/gviz/tq?tqx=out:csv&gid=558916416',
};

// Intervalo de refresco en milisegundos (5 minutos)
const REFRESH_INTERVAL = 5 * 60 * 1000;

// ---- ESTADO GLOBAL ----
let state = {
  resumen: {},
  resenas: [],
  historico: [],
  chartRange: 30,
};

let evolutionChart = null;
let monthlyChart = null;

// =============================================================================
// INICIALIZACION
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initChartTabs();

  // Si no hay URLs configuradas, cargar datos de demo
  if (!SHEETS.resumen && !SHEETS.resenas && !SHEETS.historico) {
    loadDemoData();
  } else {
    loadData();
    setInterval(loadData, REFRESH_INTERVAL);
  }
});

// =============================================================================
// RELOJ
// =============================================================================
function initClock() {
  updateClock();
  setInterval(updateClock, 1000);
}

function updateClock() {
  const now = new Date();
  const h = now.getHours().toString().padStart(2, '0');
  const m = now.getMinutes().toString().padStart(2, '0');
  document.getElementById('clock').textContent = `${h}:${m}`;

  const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  const dateStr = now.toLocaleDateString('es-ES', options);
  document.getElementById('clockDate').textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
}

// =============================================================================
// TABS DE GRAFICOS
// =============================================================================
function initChartTabs() {
  document.querySelectorAll('.chart-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.chartRange = parseInt(tab.dataset.range);
      renderEvolutionChart();
    });
  });
}

// =============================================================================
// CARGA DE DATOS DESDE GOOGLE SHEETS (CSV)
// =============================================================================
async function loadData() {
  try {
    const [resumenCSV, resenasCSV, historicoCSV] = await Promise.all([
      fetchCSV(SHEETS.resumen),
      fetchCSV(SHEETS.resenas),
      fetchCSV(SHEETS.historico),
    ]);

    state.resumen = parseResumen(resumenCSV);
    state.resenas = parseResenas(resenasCSV);
    state.historico = parseHistorico(historicoCSV);

    renderAll();
    hideLoading();
    updateLastRefresh();
  } catch (err) {
    console.error('Error cargando datos:', err);
    // Si falla, usar datos de demo silenciosamente
    if (!state.resenas.length) {
      loadDemoData();
    } else {
      hideLoading();
    }
  }
}

async function fetchCSV(url) {
  if (!url) return '';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

// =============================================================================
// PARSERS CSV
// =============================================================================
function parseCSV(csv) {
  csv = csv.replace(/\r/g, ''); // Remove carriage returns
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).slice(0, 8); // Max 8 columns
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => obj[h.trim()] = (values[i] || '').trim());
    return obj;
  });
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// Parse date from dd/mm/yyyy or yyyy-mm-dd or other formats
function parseDate(str) {
  if (!str) return new Date(0);
  str = str.trim();
  // dd/mm/yyyy format (European)
  const euMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (euMatch) {
    return new Date(parseInt(euMatch[3]), parseInt(euMatch[2]) - 1, parseInt(euMatch[1]));
  }
  // yyyy-mm-dd format (ISO)
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  }
  // Fallback
  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

function parseResumen(csv) {
  const rows = parseCSV(csv);
  const data = {};
  rows.forEach(row => {
    const key = row['Metrica'] || row[Object.keys(row)[0]];
    let val = row['Valor'] || row[Object.keys(row)[1]];
    if (val) val = val.replace(',', '.');
    if (key) data[key] = parseFloat(val) || 0;
  });
  return data;
}

function parseResenas(csv) {
  const rows = parseCSV(csv);
  return rows.map(row => ({
    fecha: parseDate(row['Fecha'] || row[Object.keys(row)[0]]),
    autor: row['Autor'] || row[Object.keys(row)[1]] || 'Anonimo',
    estrellas: parseInt(row['Estrellas'] || row[Object.keys(row)[2]]) || 0,
    titulo: row['Titulo'] || row[Object.keys(row)[3]] || '',
    texto: row['Texto'] || row[Object.keys(row)[4]] || '',
    respuesta: row['Respuesta'] || row[Object.keys(row)[5]] || '',
  })).sort((a, b) => b.fecha - a.fecha);
}

function parseHistorico(csv) {
  const rows = parseCSV(csv);
  return rows.map(row => {
    const get = (key, idx) => (row[key] || row[Object.keys(row)[idx]] || '').replace(',', '.');
    return {
      fecha: parseDate(row['Fecha'] || row[Object.keys(row)[0]]),
      media: parseFloat(get('Puntuacion Media', 1)) || 0,
      total: parseInt(get('Total Resenas', 2)) || 0,
      e5: parseInt(get('Estrellas 5', 3)) || 0,
      e4: parseInt(get('Estrellas 4', 4)) || 0,
      e3: parseInt(get('Estrellas 3', 5)) || 0,
      e2: parseInt(get('Estrellas 2', 6)) || 0,
      e1: parseInt(get('Estrellas 1', 7)) || 0,
    };
  }).sort((a, b) => a.fecha - b.fecha);
}

// =============================================================================
// DATOS DE DEMO
// =============================================================================
function loadDemoData() {
  const now = new Date();

  // Generar resenas de demo
  const nombres = [
    'Maria Garcia', 'Carlos Lopez', 'Ana Martinez', 'Pedro Sanchez', 'Laura Fernandez',
    'Miguel Torres', 'Sofia Ruiz', 'David Moreno', 'Elena Jimenez', 'Javier Diaz',
    'Carmen Alvarez', 'Pablo Romero', 'Isabel Navarro', 'Raul Gil', 'Patricia Molina',
    'Alejandro Serrano', 'Lucia Blanco', 'Daniel Castro', 'Marta Ortega', 'Fernando Ramos',
    'Cristina Suarez', 'Alberto Vega', 'Rosa Medina', 'Victor Iglesias', 'Sandra Garrido',
    'Sergio Rubio', 'Beatriz Sanz', 'Andres Herrera', 'Teresa Flores', 'Francisco Cano',
    'Nuria Prieto', 'Manuel Delgado', 'Pilar Reyes', 'Enrique Gutierrez', 'Gloria Aguilar',
    'Ruben Pascual', 'Alicia Santos', 'Oscar Herrero', 'Inmaculada Cruz', 'Marcos Dominguez',
    'Eva Perez', 'Adrian Lozano', 'Yolanda Gonzalez', 'Ignacio Marquez', 'Natalia Fuentes',
    'Guillermo Campos', 'Irene Nieto', 'Jorge Caballero', 'Raquel Vargas', 'Roberto Marin',
    'Silvia Pena', 'Angel Izquierdo', 'Diana Leon', 'Emilio Guerrero', 'Monica Espinosa',
    'Luis Carrasco', 'Claudia Cortes', 'Ivan Crespo', 'Carolina Vicente', 'Nicolas Beltran',
  ];

  const comentariosPos = [
    'Productos super originales y de buena calidad. Muy contentos con la compra!',
    'Envio rapido y el producto es tal como se ve en las fotos. Genial!',
    'Nos encanta la decoracion que compramos. Muy recomendable.',
    'Atencion al cliente excelente. Resolvieron mi duda al momento.',
    'Relacion calidad-precio inmejorable. Repetiremos seguro.',
    'Todo perfecto, el packaging muy cuidado y bonito.',
    'El flamenco hinchable es espectacular! Exito total en la piscina.',
    'Decoracion muy bonita para la fiesta, quedo increible.',
    'Compre varios productos y todos llegaron en perfecto estado.',
    'Me encanta la marca, siempre tienen cosas originales.',
    'Pedido perfecto y super rapido. Muy buena experiencia.',
    'Los productos son muy instagrameables, me encantan!',
  ];

  const comentariosNeu = [
    'El producto esta bien pero el envio tardo un poco mas de lo esperado.',
    'Correcto, cumple con lo esperado aunque el material podria ser mejor.',
    'Esta bien para el precio que tiene. Nada excepcional.',
    'El producto es bonito pero mas pequeno de lo que esperaba.',
  ];

  const comentariosNeg = [
    'El producto llego con un pequeno desperfecto. Contacte con atencion al cliente.',
    'No corresponde exactamente con la foto del anuncio.',
  ];

  const resenas = [];
  for (let i = 0; i < 60; i++) {
    const diasAtras = Math.floor(Math.random() * 180);
    const fecha = new Date(now.getTime() - diasAtras * 86400000);
    const rand = Math.random();
    let estrellas, texto;

    if (rand < 0.58) { estrellas = 5; texto = comentariosPos[Math.floor(Math.random() * comentariosPos.length)]; }
    else if (rand < 0.80) { estrellas = 4; texto = comentariosPos[Math.floor(Math.random() * comentariosPos.length)]; }
    else if (rand < 0.90) { estrellas = 3; texto = comentariosNeu[Math.floor(Math.random() * comentariosNeu.length)]; }
    else if (rand < 0.95) { estrellas = 2; texto = comentariosNeg[Math.floor(Math.random() * comentariosNeg.length)]; }
    else { estrellas = 1; texto = comentariosNeg[Math.floor(Math.random() * comentariosNeg.length)]; }

    resenas.push({
      fecha,
      autor: nombres[i % nombres.length],
      estrellas,
      titulo: estrellas >= 4 ? 'Muy buena experiencia' : estrellas === 3 ? 'Correcto' : 'Podria mejorar',
      texto,
      respuesta: estrellas <= 3 ? 'Gracias por tu feedback, trabajamos para mejorar cada dia.' : '',
    });
  }

  resenas.sort((a, b) => b.fecha - a.fecha);
  state.resenas = resenas;

  // Calcular resumen
  const total = resenas.length;
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  resenas.forEach(r => { dist[r.estrellas]++; sum += r.estrellas; });

  const primerDiaMes = new Date(now.getFullYear(), now.getMonth(), 1);
  const hace7Dias = new Date(now.getTime() - 7 * 86400000);
  const resMes = resenas.filter(r => r.fecha >= primerDiaMes).length;
  const resSemana = resenas.filter(r => r.fecha >= hace7Dias).length;

  state.resumen = {
    'Puntuacion Media': parseFloat((sum / total).toFixed(2)),
    'Total Resenas': total,
    'Resenas Este Mes': resMes,
    'Resenas Esta Semana': resSemana,
    'Estrellas 5': dist[5],
    'Estrellas 4': dist[4],
    'Estrellas 3': dist[3],
    'Estrellas 2': dist[2],
    'Estrellas 1': dist[1],
  };

  // Generar historico
  const historico = [];
  let e5 = 18, e4 = 6, e3 = 3, e2 = 2, e1 = 1;
  for (let d = 90; d >= 0; d--) {
    const fecha = new Date(now.getTime() - d * 86400000);
    if (Math.random() < 0.4) {
      const r = Math.random();
      if (r < 0.58) e5++; else if (r < 0.80) e4++; else if (r < 0.90) e3++; else if (r < 0.95) e2++; else e1++;
    }
    const t = e5 + e4 + e3 + e2 + e1;
    historico.push({
      fecha,
      media: parseFloat(((e5*5 + e4*4 + e3*3 + e2*2 + e1) / t).toFixed(2)),
      total: t, e5, e4, e3, e2, e1,
    });
  }
  state.historico = historico;

  renderAll();
  hideLoading();
  document.getElementById('lastUpdate').textContent = 'Modo demo';
}

// =============================================================================
// RENDER PRINCIPAL
// =============================================================================
function renderAll() {
  renderScore();
  renderKPIs();
  renderStarsDistribution();
  renderSentiment();
  renderReviews();
  renderEvolutionChart();
  renderMonthlyChart();
}

// =============================================================================
// SCORE PRINCIPAL
// =============================================================================
function renderScore() {
  const media = state.resumen['Puntuacion Media'] || 0;
  const total = state.resumen['Total Resenas'] || 0;

  document.getElementById('scoreValue').textContent = media.toFixed(1);
  document.getElementById('scoreStars').innerHTML = renderStarsHTML(media);
  document.getElementById('scoreTotal').textContent = `${total} valoraciones en total`;
}

function renderStarsHTML(rating) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    if (i <= Math.floor(rating)) {
      html += '<span style="color:var(--accent-gold)">&#9733;</span>';
    } else if (i - rating < 1 && i - rating > 0) {
      html += '<span style="color:var(--accent-gold)">&#9733;</span>';
    } else {
      html += '<span style="color:var(--text-muted)">&#9733;</span>';
    }
  }
  return html;
}

// =============================================================================
// KPIs
// =============================================================================
function renderKPIs() {
  const total = state.resumen['Total Resenas'] || 1;
  const e5 = state.resumen['Estrellas 5'] || 0;
  const semana = state.resumen['Resenas Esta Semana'] || 0;
  const mes = state.resumen['Resenas Este Mes'] || 0;
  const respondidas = state.resenas.filter(r => r.respuesta && r.respuesta.trim()).length;
  const pctResp = total > 0 ? Math.round((respondidas / total) * 100) : 0;
  const pct5 = total > 0 ? Math.round((e5 / total) * 100) : 0;

  document.getElementById('kpiTotal').textContent = total;
  document.getElementById('kpiMonth').textContent = mes;
  document.getElementById('kpiAvg5').textContent = pct5 + '%';
  document.getElementById('kpiResponseRate').textContent = pctResp + '%';
}

// =============================================================================
// DISTRIBUCION DE ESTRELLAS
// =============================================================================
function renderStarsDistribution() {
  const container = document.getElementById('starsContainer');
  const total = state.resumen['Total Resenas'] || 1;
  let html = '';

  for (let s = 5; s >= 1; s--) {
    const count = state.resumen[`Estrellas ${s}`] || 0;
    const pct = Math.round((count / total) * 100);

    html += `
      <div class="star-row">
        <span class="star-label">${s} <span class="star-icon">&#9733;</span></span>
        <div class="star-bar-bg">
          <div class="star-bar star-bar-${s}" style="width:${pct}%"></div>
        </div>
        <span class="star-count">${count}</span>
        <span class="star-percent">${pct}%</span>
      </div>
    `;
  }

  container.innerHTML = html;
}

// =============================================================================
// SENTIMIENTO
// =============================================================================
function renderSentiment() {
  const total = state.resenas.length || 1;
  const pos = state.resenas.filter(r => r.estrellas >= 4).length;
  const neu = state.resenas.filter(r => r.estrellas === 3).length;
  const neg = state.resenas.filter(r => r.estrellas <= 2).length;

  const pPos = Math.round((pos / total) * 100);
  const pNeu = Math.round((neu / total) * 100);
  const pNeg = Math.round((neg / total) * 100);

  document.getElementById('sentPositive').style.width = pPos + '%';
  document.getElementById('sentPositiveVal').textContent = pPos + '%';
  document.getElementById('sentNeutral').style.width = pNeu + '%';
  document.getElementById('sentNeutralVal').textContent = pNeu + '%';
  document.getElementById('sentNegative').style.width = pNeg + '%';
  document.getElementById('sentNegativeVal').textContent = pNeg + '%';
}

// =============================================================================
// RESENAS RECIENTES
// =============================================================================
function renderReviews() {
  const list = document.getElementById('reviewsList');
  const recentReviews = state.resenas.slice(0, 20);

  document.getElementById('reviewsBadge').textContent = `${state.resenas.length} total`;

  let html = '';
  recentReviews.forEach(r => {
    const fechaStr = r.fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    const starsHTML = renderStarsSmall(r.estrellas);
    const respuestaHTML = r.respuesta ? `
      <div class="review-response">
        <div class="review-response-label">Respuesta de Flamingueo</div>
        <div class="review-response-text">${escapeHTML(r.respuesta)}</div>
      </div>
    ` : '';

    html += `
      <div class="review-item">
        <div class="review-header">
          <span class="review-author">${escapeHTML(r.autor)}</span>
          <span class="review-date">${fechaStr}</span>
        </div>
        <div class="review-stars">${starsHTML}</div>
        <div class="review-text">${escapeHTML(r.texto)}</div>
        ${respuestaHTML}
      </div>
    `;
  });

  list.innerHTML = html;
}

function renderStarsSmall(n) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += i <= n
      ? '<span style="color:var(--accent-gold)">&#9733;</span>'
      : '<span style="color:var(--text-muted)">&#9733;</span>';
  }
  return html;
}

// =============================================================================
// GRAFICO DE EVOLUCION
// =============================================================================
function renderEvolutionChart() {
  const ctx = document.getElementById('evolutionChart');
  const range = state.chartRange;
  const data = state.historico.slice(-range);

  const labels = data.map(d => d.fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }));
  const mediaData = data.map(d => d.media);
  const totalData = data.map(d => d.total);

  if (evolutionChart) evolutionChart.destroy();

  evolutionChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Puntuacion Media',
          data: mediaData,
          borderColor: '#ff6b9d',
          backgroundColor: 'rgba(255, 107, 157, 0.1)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#ff6b9d',
          yAxisID: 'y',
        },
        {
          label: 'Total Resenas',
          data: totalData,
          borderColor: '#60a5fa',
          backgroundColor: 'rgba(96, 165, 250, 0.05)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#60a5fa',
          borderDash: [4, 4],
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: '#5f6368',
            font: { family: 'Inter', size: 11 },
            boxWidth: 12,
            boxHeight: 2,
            padding: 16,
            usePointStyle: false,
          },
        },
        tooltip: {
          backgroundColor: '#ffffff',
          titleColor: '#1a1a2e',
          bodyColor: '#5f6368',
          borderColor: '#e0e0e0',
          borderWidth: 1,
          padding: 12,
          titleFont: { family: 'Inter', size: 12, weight: '600' },
          bodyFont: { family: 'Inter', size: 11 },
          cornerRadius: 8,
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
          ticks: {
            color: '#9aa0a6',
            font: { family: 'Inter', size: 10 },
            maxTicksLimit: 8,
          },
        },
        y: {
          position: 'left',
          min: 3,
          max: 5,
          grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
          ticks: {
            color: '#ff6b9d',
            font: { family: 'Inter', size: 10 },
            stepSize: 0.5,
          },
        },
        y1: {
          position: 'right',
          grid: { display: false },
          beginAtZero: false,
          ticks: {
            color: '#60a5fa',
            font: { family: 'Inter', size: 10 },
          },
          suggestedMin: Math.max(0, Math.min(...totalData) - 5),
        },
      },
    },
  });
}

// =============================================================================
// GRAFICO DE RESENAS POR MES
// =============================================================================
function renderMonthlyChart() {
  const ctx = document.getElementById('monthlyChart');

  // Agrupar resenas por mes
  const meses = {};
  state.resenas.forEach(r => {
    const key = `${r.fecha.getFullYear()}-${(r.fecha.getMonth() + 1).toString().padStart(2, '0')}`;
    if (!meses[key]) meses[key] = { pos: 0, neu: 0, neg: 0 };
    if (r.estrellas >= 4) meses[key].pos++;
    else if (r.estrellas === 3) meses[key].neu++;
    else meses[key].neg++;
  });

  const sortedKeys = Object.keys(meses).sort();
  const last6 = sortedKeys.slice(-6);

  const labels = last6.map(k => {
    const [y, m] = k.split('-');
    const date = new Date(parseInt(y), parseInt(m) - 1);
    return date.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
  });

  if (monthlyChart) monthlyChart.destroy();

  monthlyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Positivas (4-5)',
          data: last6.map(k => meses[k].pos),
          backgroundColor: 'rgba(52, 211, 153, 0.8)',
          borderRadius: 4,
          barPercentage: 0.7,
        },
        {
          label: 'Neutras (3)',
          data: last6.map(k => meses[k].neu),
          backgroundColor: 'rgba(251, 191, 36, 0.8)',
          borderRadius: 4,
          barPercentage: 0.7,
        },
        {
          label: 'Negativas (1-2)',
          data: last6.map(k => meses[k].neg),
          backgroundColor: 'rgba(248, 113, 113, 0.8)',
          borderRadius: 4,
          barPercentage: 0.7,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: '#5f6368',
            font: { family: 'Inter', size: 11 },
            boxWidth: 12,
            boxHeight: 12,
            padding: 16,
            borderRadius: 3,
          },
        },
        tooltip: {
          backgroundColor: '#ffffff',
          titleColor: '#1a1a2e',
          bodyColor: '#5f6368',
          borderColor: '#e0e0e0',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { color: '#9aa0a6', font: { family: 'Inter', size: 11 } },
        },
        y: {
          stacked: true,
          grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
          ticks: {
            color: '#9aa0a6',
            font: { family: 'Inter', size: 10 },
            stepSize: 1,
          },
        },
      },
    },
  });
}

// =============================================================================
// UTILIDADES
// =============================================================================
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function hideLoading() {
  document.getElementById('loading').classList.add('hidden');
}

function showError(msg) {
  const banner = document.getElementById('errorBanner');
  banner.textContent = msg;
  banner.classList.add('visible');
  setTimeout(() => banner.classList.remove('visible'), 8000);
}

function updateLastRefresh() {
  const now = new Date();
  const h = now.getHours().toString().padStart(2, '0');
  const m = now.getMinutes().toString().padStart(2, '0');
  document.getElementById('lastUpdate').textContent = `Actualizado ${h}:${m}`;
}
