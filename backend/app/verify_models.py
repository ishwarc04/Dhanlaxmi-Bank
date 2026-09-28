"""
Verification script — tests ML model predictions against exported test cases.
Also tests EMI/DTI calculations independently.
Run: python -m app.verify_models

Uses ASCII-only output to avoid Windows cp1252 encoding issues.
"""
import json
import os
import sys
import math

# Ensure app imports work when run as: python -m app.verify_models from backend/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings
from app.ml_service import model_service, calculate_emi, calculate_dti


def verify_approval_model():
    """Reconstruct test-case inputs and verify against expected predictions."""
    print("\n=== APPROVAL MODEL VERIFICATION ===")

    models_dir = settings.MODELS_DIR
    tc_path = os.path.join(models_dir, "approval_test_cases.json")
    if not os.path.exists(tc_path):
        print(f"  ERROR: Test cases not found at: {tc_path}")
        return False

    with open(tc_path, encoding="utf-8") as f:
        test_cases = json.load(f)

    raw_inputs = test_cases["raw_inputs"]
    expected_preds = test_cases["expected_predictions"]
    expected_probs = test_cases["expected_approval_probabilities"]

    passed = 0
    failed = 0

    for i, (raw, exp_pred, exp_prob) in enumerate(zip(raw_inputs, expected_preds, expected_probs)):
        result = model_service.predict_approval(raw)

        if result["status"] != "completed":
            print(f"  FAIL [{i}]: status={result['status']} error={result.get('error')}")
            failed += 1
            continue

        pred_match = result["prediction"] == exp_pred
        prob_match = math.isclose(result["approval_probability"], exp_prob, rel_tol=1e-6)

        if pred_match and prob_match:
            passed += 1
            print(f"  PASS [{i}]: pred={result['prediction']} prob={result['approval_probability']:.10f}")
        else:
            failed += 1
            if not pred_match:
                print(f"  FAIL [{i}]: prediction expected={exp_pred} got={result['prediction']}")
            if not prob_match:
                print(f"  FAIL [{i}]: probability expected={exp_prob:.10f} got={result['approval_probability']:.10f}")

    print(f"\nApproval: {passed}/{len(raw_inputs)} passed, {failed} failed")
    return failed == 0


def verify_isolation_model():
    """Reconstruct test-case inputs and verify against expected anomaly scores/flags."""
    print("\n=== ISOLATION MODEL VERIFICATION ===")

    models_dir = settings.MODELS_DIR
    tc_path = os.path.join(models_dir, "isolation_test_cases.json")
    if not os.path.exists(tc_path):
        print(f"  ERROR: Test cases not found at: {tc_path}")
        return False

    with open(tc_path, encoding="utf-8") as f:
        test_cases = json.load(f)

    raw_inputs = test_cases["raw_inputs"]
    expected_scores = test_cases["expected_anomaly_scores"]
    expected_flags = test_cases["expected_review_flags"]

    passed = 0
    failed = 0

    for i, (raw, exp_score, exp_flag) in enumerate(zip(raw_inputs, expected_scores, expected_flags)):
        result = model_service.predict_anomaly(raw)

        if result["status"] != "completed":
            print(f"  FAIL [{i}]: status={result['status']} error={result.get('error')}")
            failed += 1
            continue

        score_match = math.isclose(result["anomaly_score"], exp_score, rel_tol=1e-6)
        flag_match = result["anomaly_flagged"] == exp_flag

        if score_match and flag_match:
            passed += 1
            print(f"  PASS [{i}]: score={result['anomaly_score']:.10f} flagged={result['anomaly_flagged']}")
        else:
            failed += 1
            if not score_match:
                print(f"  FAIL [{i}]: score expected={exp_score:.10f} got={result['anomaly_score']:.10f}")
            if not flag_match:
                print(f"  FAIL [{i}]: flag expected={exp_flag} got={result['anomaly_flagged']}")

    print(f"\nIsolation: {passed}/{len(raw_inputs)} passed, {failed} failed")
    return failed == 0


def verify_emi_dti():
    """Test EMI and DTI calculations independently."""
    print("\n=== EMI/DTI CALCULATION VERIFICATION ===")
    passed = 0
    failed = 0

    # Test EMI with known values: 10L at 10% for 12 months => EMI ~ 87915.89
    emi = calculate_emi(1000000, 10.0, 12)
    expected_emi = 87915.89
    if math.isclose(emi, expected_emi, rel_tol=1e-4):
        print(f"  PASS: EMI(10L, 10%, 12mo) = {emi}")
        passed += 1
    else:
        print(f"  FAIL: EMI(10L, 10%, 12mo) expected={expected_emi} got={emi}")
        failed += 1

    # Test zero interest
    emi_zero = calculate_emi(120000, 0, 12)
    if emi_zero == 10000.0:
        print(f"  PASS: EMI(1.2L, 0%, 12mo) = {emi_zero}")
        passed += 1
    else:
        print(f"  FAIL: EMI(1.2L, 0%, 12mo) expected=10000.0 got={emi_zero}")
        failed += 1

    # Test DTI
    dti = calculate_dti(5000, 10000, 50000)
    expected_dti = 0.3
    if math.isclose(dti, expected_dti, rel_tol=1e-4):
        print(f"  PASS: DTI(5000, 10000, 50000) = {dti}")
        passed += 1
    else:
        print(f"  FAIL: DTI expected={expected_dti} got={dti}")
        failed += 1

    # DTI with zero income
    dti_zero = calculate_dti(5000, 10000, 0)
    if dti_zero is None:
        print(f"  PASS: DTI with zero income = None")
        passed += 1
    else:
        print(f"  FAIL: DTI with zero income expected=None got={dti_zero}")
        failed += 1

    print(f"\nEMI/DTI: {passed}/4 passed, {failed} failed")
    return failed == 0


def main():
    print("FinTrust Model Verification")
    print("============================")
    print(f"Models directory: {settings.MODELS_DIR}")
    print()

    print("Loading models...")
    model_service.load_models()

    if not model_service.approval_available:
        print("ERROR: Approval model not loaded!")
        print(f"Errors: {model_service.load_errors}")
    else:
        print("OK: Approval model loaded")

    if not model_service.isolation_available:
        print("ERROR: Isolation model not loaded!")
        print(f"Errors: {model_service.load_errors}")
    else:
        print("OK: Isolation model loaded")

    results = []

    if model_service.approval_available:
        results.append(("Approval", verify_approval_model()))
    else:
        results.append(("Approval", False))

    if model_service.isolation_available:
        results.append(("Isolation", verify_isolation_model()))
    else:
        results.append(("Isolation", False))

    results.append(("EMI/DTI", verify_emi_dti()))

    print()
    print("=== SUMMARY ===")
    all_passed = True
    for name, passed in results:
        status_str = "PASSED" if passed else "FAILED"
        print(f"  {name}: {status_str}")
        if not passed:
            all_passed = False

    if all_passed:
        print()
        print("All verifications passed.")
        sys.exit(0)
    else:
        print()
        print("Some verifications failed.")
        sys.exit(1)


if __name__ == "__main__":
    main()
