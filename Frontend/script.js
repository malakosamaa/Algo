console.log("script.js loaded ✅");

const API_URL = "http://127.0.0.1:5000/run-dp";
const $ = (id) => document.getElementById(id);

window.addEventListener("DOMContentLoaded", () => {
  // ---- Lambda live label ----
  const lambda = $("lambda");
  const lambdaVal = $("lambdaVal");

  if (lambda && lambdaVal) {
    lambdaVal.textContent = lambda.value;
    lambda.addEventListener("input", () => {
      lambdaVal.textContent = lambda.value;
    });
  }

  // ---- Buttons wiring ----
  const runBtn = $("runBtn");
  const resetBtn = $("resetBtn");
  const presetAdult = $("presetAdult");
  const presetCOPD = $("presetCOPD");
  const presetPeds = $("presetPeds");

  if (runBtn) runBtn.addEventListener("click", runSimulation);
  if (resetBtn) resetBtn.addEventListener("click", resetAll);

  if (presetAdult) presetAdult.addEventListener("click", () => applyPreset({
    caseType: "Adult", s1: 88, target: 94, sMin: 92, sMax: 96, T: 30, lambda: 2
  }));

  if (presetCOPD) presetCOPD.addEventListener("click", () => applyPreset({
    caseType: "COPD", s1: 86, target: 90, sMin: 88, sMax: 92, T: 30, lambda: 3
  }));

  if (presetPeds) presetPeds.addEventListener("click", () => applyPreset({
    caseType: "Pediatric", s1: 90, target: 95, sMin: 93, sMax: 97, T: 30, lambda: 1
  }));

  // optional: start with default
  resetAll();
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
  $("lambdaVal").textContent = p.lambda; // update label
}

function resetAll() {
  applyPreset({ caseType: "", s1: 0, target: 0, sMin: 0, sMax: 0, T: 0, lambda: 0 });
  const out = $("output");
  if (out) out.textContent = "";
}

async function runSimulation() {
  const data = getInputs();
  if (result.dp) {
  renderDPTable(result.dp, data.T);
  }


  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const result = await res.json();
    $("output").textContent = JSON.stringify(result, null, 2);
  } catch (err) {
    console.error(err);
    $("output").textContent = "Error calling backend. Check console.";
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

  // header row
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

  // body rows (each SpO2 state)
  for (let r = 0; r < states.length; r++) {
    const tr = document.createElement("tr");

    const th = document.createElement("th");
    th.textContent = states[r];
    tr.appendChild(th);

    for (let t = 0; t < T; t++) {
      const td = document.createElement("td");
      const val = costTable[r][t];

      td.textContent = (val >= 1e9) ? "∞" : Math.round(val);

      // highlight best path cell
      if (bestPathRows[t] === r) {
        td.classList.add("bestCell");
      }

      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }
}

