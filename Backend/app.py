from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # allow frontend requests

FLOW_LEVELS = [0, 1, 2, 3, 4, 5]

ALPHA_BY_CASE = {
    "Adult": 0.4,
    "COPD": 0.25,
    "Pediatric": 0.6
}

SPO2_MIN = 70
SPO2_MAX = 100

def next_spo2(s, f, alpha):
    s_next = s + alpha * f
    return max(SPO2_MIN, min(SPO2_MAX, round(s_next)))



def step_cost(spo2, target, f, prev_f, lam):
    deviation = (spo2 - target) ** 2

    penalty = 0
    if spo2 < 90 or spo2 > 98:
        penalty = 100  

    smoothness = 0 if prev_f is None else lam * abs(f - prev_f)

    return deviation + smoothness + penalty

def run_dp_engine(s1, target, T, lam, alpha):
    dp = [{} for _ in range(T)]
    parent = [{} for _ in range(T)]

    dp[0][s1] = 0
    parent[0][s1] = (None, None)

    for t in range(1, T):
        for s_prev in dp[t-1]:
            for f in FLOW_LEVELS:
                s_new = next_spo2(s_prev, f, alpha)
                prev_f = parent[t-1][s_prev][1]

                cost = dp[t-1][s_prev] + step_cost(
                    s_new, target, f, prev_f, lam
                )

                if s_new not in dp[t] or cost < dp[t][s_new]:
                    dp[t][s_new] = cost
                    parent[t][s_new] = (s_prev, f)

    # Backtracking
    last_state = min(dp[T-1], key=dp[T-1].get)
    flows = []
    spo2 = [last_state]

    for t in range(T-1, 0, -1):
        prev_s, f = parent[t][spo2[-1]]
        flows.append(f)
        spo2.append(prev_s)

    flows.reverse()
    spo2.reverse()

    return flows, spo2

def compute_metrics(spo2, flows, target, sMin, sMax):
    # Total cost: deviation from target
    cost = sum((s - target) ** 2 for s in spo2)

    # Time in safe range
    in_range = sum(1 for s in spo2 if sMin <= s <= sMax)
    time_in_range_percent = 100 * in_range / len(spo2)

    # Number of oxygen flow changes
    num_flow_changes = sum(
        1 for i in range(1, len(flows)) if flows[i] != flows[i-1]
    )

    return cost, time_in_range_percent, num_flow_changes
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

    # --- SAFE BACKEND LOGIC (INTERMEDIATE STEP) ---
    alpha = ALPHA_BY_CASE.get(caseType, 0.4)

    # flows, spo2 = run_dp_engine(
    # s1, target, T, lam, alpha
    # )
   

    flows, spo2, dp_cost, states, best_rows = run_dp_engine_with_table(s1, target, T, lam, alpha, sMin, sMax)

    cost, time_in_range, num_changes = compute_metrics(
        spo2, flows, target, sMin, sMax
        )

    response = {
        "flows": flows,
        "spo2": spo2,
        "cost": cost,
        "timeInRangePercent": time_in_range,
        "numFlowChanges": num_changes,
        "dp": {
            "states": states,            # rows
            "costTable": dp_cost,        # 2D matrix
            "bestPathRows": best_rows    # highlight path
        }
    }


    return jsonify(response)

@app.route("/")
def home():
    return "Backend is running. Use POST /run-dp"

def run_dp_engine_with_table(s1, target, T, lam, alpha, sMin, sMax):
    states = list(range(SPO2_MIN, SPO2_MAX + 1))
    S = len(states)
    INF = 10**9

    # dp_cost[row][t]
    dp_cost = [[INF] * T for _ in range(S)]
    parent = [[None] * T for _ in range(S)]  # (prev_row, flow)

    s1_row = states.index(s1)
    dp_cost[s1_row][0] = 0
    parent[s1_row][0] = (None, None)

    for t in range(1, T):
        for r_prev, s_prev in enumerate(states):
            if dp_cost[r_prev][t-1] >= INF:
                continue

            prev_f = parent[r_prev][t-1][1] if parent[r_prev][t-1] else None

            for f in FLOW_LEVELS:
                s_new = next_spo2(s_prev, f, alpha)
                r_new = states.index(s_new)

                # base cost
                c = step_cost(s_new, target, f, prev_f, lam)

                # optional safety penalty (recommended)
                if s_new < sMin or s_new > sMax:
                    c += 1000

                new_cost = dp_cost[r_prev][t-1] + c

                if new_cost < dp_cost[r_new][t]:
                    dp_cost[r_new][t] = new_cost
                    parent[r_new][t] = (r_prev, f)

    # choose best final row
    last_row = min(range(S), key=lambda r: dp_cost[r][T-1])

    # backtrack
    best_rows = [last_row]
    flows = []
    spo2 = [states[last_row]]

    for t in range(T-1, 0, -1):
        prev_row, f = parent[best_rows[-1]][t]
        flows.append(f)
        best_rows.append(prev_row)
        spo2.append(states[prev_row])

    flows.reverse()
    spo2.reverse()
    best_rows.reverse()

    return flows, spo2, dp_cost, states, best_rows

if __name__ == "__main__":
    app.run(debug=True)