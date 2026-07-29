let trendChartInstance = null;
let typeChartInstance = null;

function renderTrendChart(trend) {
  const ctx = document.getElementById('trendChart');
  if (!ctx) return;

  const labels = trend.map((t) => t._id);
  const data = trend.map((t) => t.devicesSeen);

  if (trendChartInstance) trendChartInstance.destroy();
  trendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Devices Seen',
        data,
        borderColor: '#0a1a3c',
        backgroundColor: 'rgba(212, 175, 55, 0.15)',
        borderWidth: 2,
        tension: 0.35,
        fill: true,
        pointBackgroundColor: '#d4af37',
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

function renderTypeChart(breakdown) {
  const ctx = document.getElementById('typeChart');
  if (!ctx) return;

  const labels = breakdown.map((b) => b._id || 'Unspecified');
  const data = breakdown.map((b) => b.count);
  const palette = ['#0a1a3c', '#d4af37', '#1c3a7a', '#e8cc6c', '#6b7690', '#2e9e6b', '#d64550', '#e0a721'];

  if (typeChartInstance) typeChartInstance.destroy();
  typeChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: palette }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } }
    }
  });
}
