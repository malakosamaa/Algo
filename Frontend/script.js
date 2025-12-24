/* Oxygen Therapy Simulator - frontend */

const API_URL = "http://127.0.0.1:5000/run-dp";

const el = (id) => document.getElementById(id);
const qs = (sel) => document.querySelector(sel);

let spo2Chart = null;
let flowChart = null;
//inputs types and the 3 preset test cases we use 
const PRESETS = {
  Adult: { caseType: "Adult", s1: 88, target: 94, sMin: 92, sMax: 96, T: 30, lambda: 2 },
  COPD: { caseType: "COPD", s1: 86, target: 90, sMin: 88, sMax: 92, T: 30, lambda: 3 },
  Pediatric: { caseType: "Pediatric", s1: 90, target: 95, sMin: 93, sMax: 97, T: 30, lambda: 1 },
};

document.addEventListener("DOMContentLoaded", () => {
  wireUI();
  applyPreset(PRESETS.Adult);
});

function wireUI() {
  const lambda = el("lambda");
  const lambdaVal = el("lambdaVal");

  lambdaVal.textContent = lambda.value;
  lambda.addEventListener("input", () => {
    lambdaVal.textContent = lambda.value;
  });
//5 buttons 
  el("runBtn").addEventListener("click", runSimulation);
  el("resetBtn").addEventListener("click", resetAll);

  el("presetAdult").addEventListener("click", () => applyPreset(PRESETS.Adult));
  el("presetCOPD").addEventListener("click", () => applyPreset(PRESETS.COPD));
  el("presetPeds").addEventListener("click", () => applyPreset(PRESETS.Pediatric));
}

function readInputs() {
  return {
    caseType: el("caseType").value,
    s1: Number(el("s1").value),
    target: Number(el("target").value),
    sMin: Number(el("sMin").value),
    sMax: Number(el("sMax").value),
    T: Number(el("T").value),
    lambda: Number(el("lambda").value),
  };
}
//preset functions for our 3 test cases where it applies numbers automatically 
function applyPreset(p) {
  el("caseType").value = p.caseType;
  el("s1").value = p.s1;
  el("target").value = p.target;
  el("sMin").value = p.sMin;
  el("sMax").value = p.sMax;
  el("T").value = p.T;
  el("lambda").value = p.lambda;
  el("lambdaVal").textContent = String(p.lambda);
  setStatus("");
}

function resetAll() {
  // Reset inputs to zero 
  el("caseType").value = "Adult";
  el("s1").value = 0;
  el("target").value = 0;
  el("sMin").value = 0;
  el("sMax").value = 0;
  el("T").value = 0;
  el("lambda").value = 0;
  el("lambdaVal").textContent = "0";

  // Clear outputs
  setText("kpiCost", "—");
  setText("kpiRange", "—");
  setText("kpiChanges", "—");

  clearPlanTable();
  clearDpTable();
  destroyCharts();
  setStatus("");
}

function setStatus(msg, isError = false) {
  const box = el("status");
  if (!box) return;
  box.textContent = msg;
  box.style.color = isError ? "#b00020" : "#0a7a2f";
}

function setText(id, value) {
  const node = el(id);
  if (node) node.textContent = value;
}

function clearPlanTable() {
  const tbody = qs("#planTable tbody");
  if (tbody) tbody.innerHTML = "";
}

function clearDpTable() {
  const thead = qs("#dpTable thead");
  const tbody = qs("#dpTable tbody");
  if (thead) thead.innerHTML = "";
  if (tbody) tbody.innerHTML = "";
}

function destroyCharts() {
  if (spo2Chart) spo2Chart.destroy();
  if (flowChart) flowChart.destroy();
  spo2Chart = null;
  flowChart = null;
}
//inputs validation
function validateInputs(d) {
  const requiredPositive = ["s1", "target", "sMin", "sMax", "T"];
  for (const k of requiredPositive) {
    if (!Number.isFinite(d[k]) || d[k] <= 0) return "No zero inputs ❌";
  }
  if (d.sMin >= d.sMax) return "Safe Min must be < Safe Max ❌";
  return null;
}
//requests for backend/ what will appear while running
async function runSimulation() {
  const data = readInputs();

  const msg = validateInputs(data);
  if (msg) {
    setStatus(msg, true);
    return;
  }

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

    setText("kpiCost", formatCost(result.cost));
    setText("kpiRange", `${Number(result.timeInRangePercent).toFixed(1)}%`);
    setText("kpiChanges", String(result.numFlowChanges));

    const spo2 = Array.isArray(result.spo2) ? result.spo2 : [];
    const flows = Array.isArray(result.flows) ? result.flows : [];

    renderPlanTable(spo2, flows);
    renderCharts(spo2, flows, data.target, data.sMin, data.sMax);

    if (result.dp) renderDpTable(result.dp, data.T);

    setStatus("Done ✅", false);
  } catch (e) {
    console.error(e);
    setStatus("Could not reach backend (is Flask running?)", true);
  }
}

function formatCost(cost) {
  if (typeof cost === "number" && Number.isFinite(cost)) return cost.toFixed(2);
  return String(cost ?? "—");
}
//plan table:time step-by step summary of the optimal oxygen therapy plan computed by our dp.
function renderPlanTable(spo2, flows) {
  const tbody = qs("#planTable tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  for (let t = 0; t < spo2.length; t++) {
    const tr = document.createElement("tr");

    const tdT = document.createElement("td");
    tdT.textContent = String(t);

    const tdF = document.createElement("td");
    tdF.textContent = t < flows.length ? String(flows[t]) : "—";

    const tdS = document.createElement("td");
    tdS.textContent = String(spo2[t]);

    tr.append(tdT, tdF, tdS);
    tbody.appendChild(tr);
  }
}
//the dp table construction - it varies based on the iputs so we used infinity for the outer cases
function renderDpTable(dp, T) {
  const thead = qs("#dpTable thead");
  const tbody = qs("#dpTable tbody");
  if (!thead || !tbody) return;

  const states = dp.states || [];
  const costTable = dp.costTable || [];
  const bestPathRows = dp.bestPathRows || [];

  thead.innerHTML = "";
  tbody.innerHTML = "";

  const trHead = document.createElement("tr");
  const th0 = document.createElement("th");
  th0.textContent = "SpO₂ \\ t";
  trHead.appendChild(th0);

  for (let t = 0; t < T; t++) {
    const th = document.createElement("th");
    th.textContent = String(t);
    trHead.appendChild(th);
  }
  thead.appendChild(trHead);

  for (let r = 0; r < states.length; r++) {
    const tr = document.createElement("tr");

    const th = document.createElement("th");
    th.textContent = String(states[r]);
    tr.appendChild(th);

    for (let t = 0; t < T; t++) {
      const td = document.createElement("td");
      const v = costTable?.[r]?.[t];

      td.textContent = v == null || v >= 1e9 ? "∞" : String(Math.round(v));
      if (bestPathRows[t] === r) td.classList.add("bestCell");

      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }
}
// here we'll map the graph of spo2 and flows
function renderCharts(spo2, flows, target, sMin, sMax) {
  destroyCharts();

  const xSpo2 = spo2.map((_, i) => i);
  const xFlow = flows.map((_, i) => i);

  spo2Chart = new Chart(el("spo2Chart"), {
    type: "line",
    data: {
      labels: xSpo2,
      datasets: [
        { label: "SpO₂", data: spo2, tension: 0.25 },
        { label: "Target", data: xSpo2.map(() => target), borderDash: [6, 6], tension: 0 },
        { label: "Safe Min", data: xSpo2.map(() => sMin), borderDash: [3, 6], tension: 0 },
        { label: "Safe Max", data: xSpo2.map(() => sMax), borderDash: [3, 6], tension: 0 },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: { y: { min: 70, max: 100 } },
    },
  });

  flowChart = new Chart(el("flowChart"), {
    type: "line",
    data: {
      labels: xFlow,
      datasets: [{ label: "O₂ Flow (L/min)", data: flows, stepped: true }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: { y: { min: 0, max: 5 } },
    },
  });
}
