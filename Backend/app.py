from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# -----------------------------
# Constants / configuration
# -----------------------------

FLOW_LEVELS: List[int] = [0, 1, 2, 3, 4, 5]

ALPHA_BY_CASE: Dict[str, float] = {
    "Adult": 0.4,
    "COPD": 0.25,
    "Pediatric": 0.6,
}

SPO2_MIN = 70
SPO2_MAX = 100
INF = 10**9


# -----------------------------
# Helpers
# -----------------------------

def clamp(x: float, lo: int, hi: int) -> int:
    return max(lo, min(hi, int(round(x))))


def next_spo2(s: int, flow: int, alpha: float) -> int:
    return clamp(s + alpha * flow, SPO2_MIN, SPO2_MAX)


def step_cost(spo2: int, target: int, flow: int, prev_flow: Optional[int],
              lam: float, s_min: int, s_max: int) -> float:
    deviation = (spo2 - target) ** 2
    smoothness = 0.0 if prev_flow is None else lam * abs(flow - prev_flow)
    safety_penalty = 1000.0 if (spo2 < s_min or spo2 > s_max) else 0.0
    return deviation + smoothness + safety_penalty


def compute_metrics(spo2_path: List[int], flows: List[int], target: int,
                    s_min: int, s_max: int) -> Tuple[float, float, int]:
    cost = float(sum((s - target) ** 2 for s in spo2_path))

    in_range = sum(1 for s in spo2_path if s_min <= s <= s_max)
    time_in_range_pct = 100.0 * in_range / max(1, len(spo2_path))

    num_flow_changes = sum(
        1 for i in range(1, len(flows)) if flows[i] != flows[i - 1]
    )

    return cost, time_in_range_pct, num_flow_changes


def build_states() -> List[int]:
    return list(range(SPO2_MIN, SPO2_MAX + 1))


def dp_with_table(s1: int, target: int, T: int, lam: float, alpha: float,
                  s_min: int, s_max: int) -> Tuple[List[int], List[int], List[List[float]], List[int], List[int]]:
    """
    Returns:
      flows: length T-1
      spo2_path: length T
      cost_table: S x T
      states: length S
      best_path_rows: length T (row indices into states)
    """
    states = build_states()
    S = len(states)

    cost_table: List[List[float]] = [[INF] * T for _ in range(S)]
    parent: List[List[Optional[Tuple[int, int]]]] = [[None] * T for _ in range(S)]  # (prev_row, flow)

    s1_row = states.index(s1)
    cost_table[s1_row][0] = 0.0
    parent[s1_row][0] = (s1_row, 0)  # dummy

    for t in range(1, T):
        for r_prev, s_prev in enumerate(states):
            prev_cost = cost_table[r_prev][t - 1]
            if prev_cost >= INF:
                continue

            prev_flow = parent[r_prev][t - 1][1] if parent[r_prev][t - 1] else None

            for flow in FLOW_LEVELS:
                s_new = next_spo2(s_prev, flow, alpha)
                r_new = s_new - SPO2_MIN  # faster than states.index(s_new)

                c = step_cost(s_new, target, flow, prev_flow, lam, s_min, s_max)
                new_cost = prev_cost + c

                if new_cost < cost_table[r_new][t]:
                    cost_table[r_new][t] = new_cost
                    parent[r_new][t] = (r_prev, flow)

    last_row = min(range(S), key=lambda r: cost_table[r][T - 1])

    # Backtrack
    best_rows = [last_row]
    flows: List[int] = []
    spo2_path = [states[last_row]]

    for t in range(T - 1, 0, -1):
        prev_row, flow = parent[best_rows[-1]][t]  # type: ignore[misc]
        flows.append(flow)
        best_rows.append(prev_row)
        spo2_path.append(states[prev_row])

    flows.reverse()
    best_rows.reverse()
    spo2_path.reverse()

    return flows, spo2_path, cost_table, states, best_rows


# -----------------------------
# Input validation
# -----------------------------

@dataclass
class Payload:
    caseType: str
    s1: int
    target: int
    sMin: int
    sMax: int
    T: int
    lam: float


def parse_payload(data: Dict[str, Any]) -> Payload:
    case_type = str(data.get("caseType", "Adult"))

    try:
        s1 = int(data.get("s1"))
        target = int(data.get("target"))
        s_min = int(data.get("sMin"))
        s_max = int(data.get("sMax"))
        T = int(data.get("T"))
        lam = float(data.get("lambda"))
    except Exception as e:
        raise ValueError("Invalid numeric inputs") from e

    if T <= 0:
        raise ValueError("T must be > 0")
    if not (SPO2_MIN <= s1 <= SPO2_MAX):
        raise ValueError("s1 must be between 70 and 100")
    if not (SPO2_MIN <= target <= SPO2_MAX):
        raise ValueError("target must be between 70 and 100")
    if not (SPO2_MIN <= s_min <= SPO2_MAX and SPO2_MIN <= s_max <= SPO2_MAX):
        raise ValueError("Safe range must be within 70–100")
    if s_min >= s_max:
        raise ValueError("sMin must be < sMax")
    if lam < 0:
        raise ValueError("lambda must be >= 0")

    return Payload(case_type, s1, target, s_min, s_max, T, lam)


# -----------------------------
# Routes
# -----------------------------

@app.get("/")
def home():
    return "Backend is running. Use POST /run-dp"


@app.post("/run-dp")
def run_dp():
    data = request.get_json(silent=True) or {}

    try:
        p = parse_payload(data)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    alpha = ALPHA_BY_CASE.get(p.caseType, ALPHA_BY_CASE["Adult"])

    flows, spo2_path, cost_table, states, best_rows = dp_with_table(
        p.s1, p.target, p.T, p.lam, alpha, p.sMin, p.sMax
    )

    cost, time_in_range, num_changes = compute_metrics(
        spo2_path, flows, p.target, p.sMin, p.sMax
    )

    return jsonify({
        "flows": flows,
        "spo2": spo2_path,
        "cost": cost,
        "timeInRangePercent": time_in_range,
        "numFlowChanges": num_changes,
        "dp": {
            "states": states,
            "costTable": cost_table,
            "bestPathRows": best_rows
        }
    })


if __name__ == "__main__":
    app.run(debug=True)
