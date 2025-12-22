function runSimulation() {

  const data = {
    caseType: document.getElementById("caseType").value,
    s1: Number(document.getElementById("s1").value),
    target: Number(document.getElementById("target").value),
    sMin: Number(document.getElementById("sMin").value),
    sMax: Number(document.getElementById("sMax").value),
    T: Number(document.getElementById("T").value),
    lambda: Number(document.getElementById("lambda").value)
  };

  fetch("http://127.0.0.1:5000/run-dp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  })
  .then(response => response.json())
  .then(result => {
    document.getElementById("output").textContent =
      JSON.stringify(result, null, 2);
  })
  .catch(error => {
    console.error("Error:", error);
  });
}