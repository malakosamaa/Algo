from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # allow frontend requests


@app.route("/run-dp", methods=["POST"])
def run_dp():
    data = request.json

    # --- READ INPUTS (DO NOTHING WITH THEM YET) ---
    caseType = data.get("caseType")
    s1 = data.get("s1")
    target = data.get("target")
    sMin = data.get("sMin")
    sMax = data.get("sMax")
    T = data.get("T")
    lam = data.get("lambda")

    # --- DUMMY RESPONSE (TEMPORARY) ---
    flows = [2, 2, 3, 3, 2]
    spo2 = [s1, s1+1, s1+2, s1+3, s1+4]

    response = {
        "flows": flows,
        "spo2": spo2,
        "cost": 120.0,
        "timeInRangePercent": 60.0,
        "numFlowChanges": 2
    }

    return jsonify(response)

@app.route("/")
def home():
    return "Backend is running. Use POST /run-dp"

if __name__ == "__main__":
    app.run(debug=True)