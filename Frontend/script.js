// function runSimulation() {

//   const data = {
//     caseType: document.getElementById("caseType").value,
//     s1: Number(document.getElementById("s1").value),
//     target: Number(document.getElementById("target").value),
//     sMin: Number(document.getElementById("sMin").value),
//     sMax: Number(document.getElementById("sMax").value),
//     T: Number(document.getElementById("T").value),
//     lambda: Number(document.getElementById("lambda").value)
//   };

//   fetch("http://127.0.0.1:5000/run-dp", {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json"
//     },
//     body: JSON.stringify(data)
//   })
//   .then(response => response.json())
//   .then(result => {
//     document.getElementById("output").textContent =
//       JSON.stringify(result, null, 2);
//   })
//   .catch(error => {
//     console.error("Error:", error);
//   });
// }

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
  if (tbody) tbody.innerHTML = "";
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

    // Debug JSON
    $("output").textContent = JSON.stringify(result, null, 2);

    // Update KPIs
    $("kpiCost").textContent = result.cost?.toFixed ? result.cost.toFixed(2) : result.cost;
    $("kpiRange").textContent = `${Number(result.timeInRangePercent).toFixed(1)}%`;
    $("kpiChanges").textContent = result.numFlowChanges;

    // Align lengths (DP often outputs flows length = T-1)
    let spo2 = result.spo2 || [];
    let flows = result.flows || [];

    // Make flows length match spo2 length for charts/table
    // if (flows.length === spo2.length - 1) {
    //   flows = [flows[0] ?? 0, ...flows];
    // } else if (flows.length < spo2.length) {
    //   // pad with last known flow
    //   const last = flows.length ? flows[flows.length - 1] : 0;
    //   while (flows.length < spo2.length) flows.push(last);
    // } else if (flows.length > spo2.length) {
    //   flows = flows.slice(0, spo2.length);
    // }

    // Render table + charts
    renderTable(spo2, flows);
    renderCharts(spo2, flows, data.target, data.sMin, data.sMax);
    if (result.dp) {
      const s1 = Number(document.getElementById("s1").value);

      // ✅ backend returns spo2 as the optimal state path
      const spo2Path = Array.isArray(result.spo2) ? result.spo2 : [];
      if (!spo2Path.length) {
        console.error("Backend did not return spo2 array path:", result);
        return;
      }
      const sFinal = spo2Path[spo2Path.length - 1];

      // ✅ backend dp object fields
      const states = result.dp.states;
      const costTable = result.dp.costTable;
      const bestRows = result.dp.bestPathRows;

      renderDPTable(costTable, states, bestRows, s1, sFinal);
    }


    setStatus("Done ✅", false);
  } catch (err) {
    console.error(err);
    setStatus("Error calling backend. Check console.", true);
  }
}

function renderTable(spo2, flows) {
  const tbody = document.querySelector("#planTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";


  // spo2 length = T
  // flows length = T-1 (action from t -> t+1)
  for (let t = 0; t < spo2.length; t++) {
    const tr = document.createElement("tr");

    const tdT = document.createElement("td");
    tdT.textContent = t;

    const tdF = document.createElement("td");
    tdF.textContent = (t < flows.length) ? flows[t] : "—"; // no action at last state

    const tdS = document.createElement("td");
    tdS.textContent = spo2[t];

    tr.appendChild(tdT);
    tr.appendChild(tdF);
    tr.appendChild(tdS);
    tbody.appendChild(tr);
  }
}

function renderDPTable(costTable, states, bestPathRows, s1, sFinal) {
  const thead = document.querySelector("#dpTable thead");
  const tbody = document.querySelector("#dpTable tbody");
  if (!thead || !tbody) return;

  thead.innerHTML = "";
  tbody.innerHTML = "";

  const T = costTable?.[0]?.length ?? 0;
  if (!T) {
    console.error("Invalid costTable:", costTable);
    return;
  }

  // ✅ crop based on the actual backtracked path rows (so purple is always visible)
  const validRows = bestPathRows.filter((r) => Number.isInteger(r) && r >= 0);
  if (!validRows.length) {
    console.error("bestPathRows is empty/invalid:", bestPathRows);
    return;
  }

  let rowFrom = Math.min(...validRows);
  let rowTo = Math.max(...validRows);

  // optional: add padding rows above/below so it looks nicer
  rowFrom = Math.max(0, rowFrom - 2);
  rowTo = Math.min(states.length - 1, rowTo + 2);


  // Header
  const trHead = document.createElement("tr");
  const th0 = document.createElement("th");
  th0.textContent = "SpO₂ \\ t";
  trHead.appendChild(th0);

  for (let t = 0; t < T; t++) {
    const th = document.createElement("th");
    th.textContent = t;
    trHead.appendChild(th);
  }
  thead.appendChild(trHead);

  // highlight set: bestPathRows[t] gives row index at time t
  const pathSet = new Set(bestPathRows.map((r, t) => `${r}-${t}`));

  // Body cropped
  for (let r = rowFrom; r <= rowTo; r++) {
    const s = states[r];
    const tr = document.createElement("tr");

    const tdS = document.createElement("td");
    tdS.textContent = s;
    tr.appendChild(tdS);

    for (let t = 0; t < T; t++) {
      const td = document.createElement("td");
      const v = costTable[r]?.[t];

      td.textContent = (v >= 1e9 || v === null || v === undefined) ? "∞" : Number(v).toFixed(0);

      if (pathSet.has(`${r}-${t}`)) td.classList.add("path-cell");
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }
}





function renderCharts(spo2, flows, target, sMin, sMax) {
  destroyCharts();

  // labels for states: 0..T-1
  const labelsSpo2 = spo2.map((_, i) => i);

  // labels for actions: 0..T-2
  const labelsFlow = flows.map((_, i) => i);

  // SpO2 chart
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

  // Flow chart (actions)
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