import { useState, FormEvent } from "react";
import { generalApi, apiError } from "../api";
import type { EMICalculatorResponse } from "../types";
import { formatINR } from "../utils";

export function EMICalculatorPage() {
  const [principal, setPrincipal] = useState("500000");
  const [rate, setRate] = useState("10");
  const [term, setTerm] = useState("60");
  const [result, setResult] = useState<EMICalculatorResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const p = parseFloat(principal);
    const r = parseFloat(rate);
    const t = parseInt(term, 10);
    if (isNaN(p) || p <= 0 || isNaN(r) || r < 0 || isNaN(t) || t <= 0) {
      setError("Please enter valid values");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await generalApi.emiCalculator(p, r, t);
      setResult(res);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container page">
      <h1 style={{ marginBottom: ".25rem" }}>EMI Calculator</h1>
      <p className="text-muted text-sm" style={{ marginBottom: "1.5rem" }}>
        Estimate your monthly instalment using the standard amortisation formula.
        Final EMI is determined by the loan officer based on the approved terms.
      </p>

      <div className="card" style={{ maxWidth: 520 }}>
        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="principal">
              Loan Amount (INR) <span className="required">*</span>
            </label>
            <input
              id="principal"
              type="number"
              className="form-input"
              min="1"
              step="1000"
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="rate">
              Annual Interest Rate (%) <span className="required">*</span>
            </label>
            <input
              id="rate"
              type="number"
              className="form-input"
              min="0"
              max="50"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              required
            />
            <p className="form-hint">Enter 0 for zero-interest loan</p>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="term">
              Loan Term (months) <span className="required">*</span>
            </label>
            <input
              id="term"
              type="number"
              className="form-input"
              min="1"
              max="600"
              step="1"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-accent w-full" disabled={loading}>
            {loading ? "Calculating..." : "Calculate EMI"}
          </button>
        </form>

        {result && (
          <div style={{ marginTop: "1.25rem", padding: "1rem", background: "var(--surface2)", border: "1px solid var(--border)" }}>
            <div className="grid grid-2" style={{ gap: ".75rem" }}>
              <div>
                <div className="stat-label">Monthly EMI</div>
                <div className="stat-value">{formatINR(result.monthly_emi)}</div>
              </div>
              <div>
                <div className="stat-label">Total Payable</div>
                <div className="stat-value">{formatINR(result.total_payment)}</div>
              </div>
              <div>
                <div className="stat-label">Total Interest</div>
                <div className="fw-600">{formatINR(result.total_interest)}</div>
              </div>
              <div>
                <div className="stat-label">Principal</div>
                <div className="fw-600">{formatINR(result.principal)}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
