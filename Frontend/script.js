console.log("script.js loaded ✅");

const API_URL = "http://127.0.0.1:5000/run-dp";
const $ = (id) => document.getElementById(id);

let spo2ChartInstance = null;
let flowChartInstance = null;

window.addEventListener("DOMContentLoaded", () => {
  // Lambda live label
  const lambda = $("lambda");
  const lambdaVal = $("lambdaVal");
  lambdaVal.textContent = lambda.value;
  lambda.addEventListener("input", () => (lambdaVal.textContent = lambda.value));

  // Buttons
  $("runBtn").addEventListener("click", runSimulation);
  $("resetBtn").addEventListener("click", resetAll);

  $("presetAdult").addEventListener("click", () =>
    applyPreset({ caseType: "Adult", s1: 88, target: 94, sMin: 92, sMax: 96, T: 30, lambda: 2 })
  );
  $("presetCOPD").addEventListener("click", () =>
    applyPreset({ caseType: "COPD", s1: 86, target: 90, sMin: 88, sMax: 92, T: 30, lambda: 3 })
  );
  $("presetPeds").addEventListener("click", () =>
    applyPreset({ caseType: "Pediatric", s1: 90, target: 95, sMin: 93, sMax: 97, T: 30, lambda: 1 })
  );

  // Start with Adult preset (DO NOT set zeros)
  applyPreset({ caseType: "Adult", s1: 88, target: 94, sMin: 92, sMax: 96, T: 30, lambda: 2 });
});

function getInputs() {
  return {
    caseType: $("caseType").value,
    s1: Number($("s1").value),
    target: Number($("target").value),
    sMin: Number($("sMin").value),
    sMax: Number($("sMax").value),
    T: Number($("T").value),
    lambda: Number($("lambda").value),
  };
}

function applyPreset(p) {
  $("caseType").value = p.caseType;
  $("s1").value = p.s1;
  $("target").value = p.target;
  $("sMin").value = p.sMin;
  $("sMax").value = p.sMax;
  $("T").value = p.T;
  $("lambda").value = p.lambda;
  $("lambdaVal").textContent = p.lambda;
  setStatus("");
}

function resetAll() {
  // reset to a valid preset (not zeros)
  applyPreset({ caseType: "Adult", s1: 88, target: 94, sMin: 92, sMax: 96, T: 30, lambda: 2 });

  $("output").textContent = "";
  $("kpiCost").textContent = "—";
  $("kpiRange").textContent = "—";
  $("kpiChanges").textContent = "—";

  clearTable();
  destroyCharts();
  setStatus("");
}

function setStatus(msg, isError = false) {
  const el = $("status");
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? "#b00020" : "#0a7a2f";
}

function clearTable() {
  const tbody = document.querySelector("#planTable tbody");
  tbody.innerHTML = "";
}

function destroyCharts() {
  if (spo2ChartInstance) spo2ChartInstance.destroy();
  if (flowChartInstance) flowChartInstance.destroy();
  spo2ChartInstance = null;
  flowChartInstance = null;
}

async function runSimulation() {
  const data = getInputs();
  setStatus("Running...", false);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Backend error ${res.status}: ${text}`);
    }

    const result = await res.json();

    $("output").textContent = JSON.stringify(result, null, 2);

    $("kpiCost").textContent = result.cost?.toFixed ? result.cost.toFixed(2) : result.cost;
    $("kpiRange").textContent = `${Number(result.timeInRangePercent).toFixed(1)}%`;
    $("kpiChanges").textContent = result.numFlowChanges;

    let spo2 = result.spo2 || [];
    let flows = result.flows || [];

    renderTable(spo2, flows);
    renderCharts(spo2, flows, data.target, data.sMin, data.sMax);
    if (result.dp) {
  
      renderDPTable(result.dp, data.T);
}

    setStatus("Done ✅", false);
  } catch (err) {
    console.error(err);
    setStatus("Error calling backend. Check console.", true);
  }
}

function renderDPTable(dp, T) {
  const table = document.getElementById("dpTable");
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");

  thead.innerHTML = "";
  tbody.innerHTML = "";

  const states = dp.states;
  const costTable = dp.costTable;
  const bestPathRows = dp.bestPathRows;

  const trH = document.createElement("tr");
  const th0 = document.createElement("th");
  th0.textContent = "SpO₂ \\ t";
  trH.appendChild(th0);

  for (let t = 0; t < T; t++) {
    const th = document.createElement("th");
    th.textContent = t;
    trH.appendChild(th);
  }
  thead.appendChild(trH);

  for (let r = 0; r < states.length; r++) {
    const tr = document.createElement("tr");

    const th = document.createElement("th");
    th.textContent = states[r];
    tr.appendChild(th);

    for (let t = 0; t < T; t++) {
      const td = document.createElement("td");
      const val = costTable[r][t];

      td.textContent = (val >= 1e9) ? "∞" : Math.round(val);

      if (bestPathRows[t] === r) {
        td.classList.add("bestCell");
      }

      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }
}


function renderCharts(spo2, flows, target, sMin, sMax) {
  destroyCharts();

  const labelsSpo2 = spo2.map((_, i) => i);

  const labelsFlow = flows.map((_, i) => i);

  spo2ChartInstance = new Chart($("spo2Chart"), {
    type: "line",
    data: {
      labels: labelsSpo2,
      datasets: [
        { label: "SpO₂", data: spo2, tension: 0.25 },
        { label: "Target", data: labelsSpo2.map(() => target), borderDash: [6, 6], tension: 0 },
        { label: "Safe Min", data: labelsSpo2.map(() => sMin), borderDash: [3, 6], tension: 0 },
        { label: "Safe Max", data: labelsSpo2.map(() => sMax), borderDash: [3, 6], tension: 0 },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: { y: { min: 70, max: 100 } },
    },
  });

  flowChartInstance = new Chart($("flowChart"), {
    type: "line",
    data: {
      labels: labelsFlow,
      datasets: [{ label: "O₂ Flow (L/min)", data: flows, stepped: true }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: { y: { min: 0, max: 5 } },
    },
  });

}