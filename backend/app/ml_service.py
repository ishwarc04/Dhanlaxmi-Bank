"""
ML Model Service — loads finalized approval (XGBoost) and isolation (Isolation Forest) models.
Models are loaded once at startup as trusted artifacts.
Feature adapters match the exact notebook engineering.

IMPORTANT: This is an academic synthetic-data model, NOT a fairness-certified lending system.
Model outputs never automatically make the final lending decision.
"""
import json
import logging
import math
import os
from typing import Optional, Dict, Any, Tuple

import joblib
import numpy as np
import pandas as pd

from app.config import settings

logger = logging.getLogger(__name__)


class ModelService:
    """Manages both ML models lifecycle."""

    def __init__(self):
        self.approval_pipeline = None
        self.approval_metadata: Optional[dict] = None
        self.isolation_pipeline = None
        self.isolation_metadata: Optional[dict] = None
        self._loaded = False
        self._load_errors: list[str] = []

    def load_models(self):
        """Load models from disk. Call once at startup."""
        models_dir = settings.MODELS_DIR

        # Load approval model
        try:
            approval_path = os.path.join(models_dir, "approval_model.joblib")
            approval_meta_path = os.path.join(models_dir, "approval_metadata.json")

            if not os.path.exists(approval_path):
                self._load_errors.append(f"Approval model not found: {approval_path}")
            elif not os.path.exists(approval_meta_path):
                self._load_errors.append(f"Approval metadata not found: {approval_meta_path}")
            else:
                artifact = joblib.load(approval_path)
                self.approval_pipeline = artifact["pipeline"]
                with open(approval_meta_path, "r") as f:
                    self.approval_metadata = json.load(f)
                logger.info("Approval model loaded: %s", self.approval_metadata.get("model_version"))
        except Exception as e:
            self._load_errors.append(f"Failed to load approval model: {e}")
            logger.error("Failed to load approval model", exc_info=True)

        # Load isolation model
        try:
            isolation_path = os.path.join(models_dir, "isolation_model.joblib")
            isolation_meta_path = os.path.join(models_dir, "isolation_metadata.json")

            if not os.path.exists(isolation_path):
                self._load_errors.append(f"Isolation model not found: {isolation_path}")
            elif not os.path.exists(isolation_meta_path):
                self._load_errors.append(f"Isolation metadata not found: {isolation_meta_path}")
            else:
                artifact = joblib.load(isolation_path)
                self.isolation_pipeline = artifact["pipeline"]
                with open(isolation_meta_path, "r") as f:
                    self.isolation_metadata = json.load(f)
                logger.info("Isolation model loaded: %s", self.isolation_metadata.get("model_version"))
        except Exception as e:
            self._load_errors.append(f"Failed to load isolation model: {e}")
            logger.error("Failed to load isolation model", exc_info=True)

        self._loaded = True
        if self._load_errors:
            logger.warning("Model load warnings: %s", self._load_errors)

    @property
    def approval_available(self) -> bool:
        return self.approval_pipeline is not None and self.approval_metadata is not None

    @property
    def isolation_available(self) -> bool:
        return self.isolation_pipeline is not None and self.isolation_metadata is not None

    @property
    def load_errors(self) -> list[str]:
        return self._load_errors.copy()

    # -------------------------------------------------------------------------
    # APPROVAL FEATURE ENGINEERING — EXACTLY MATCHES THE NOTEBOOK
    # -------------------------------------------------------------------------
    def _prepare_approval_features(self, raw: dict) -> pd.DataFrame:
        """
        Build the feature DataFrame for the approval model.
        Copies raw fields, then computes engineered features.
        Column order matches approval_metadata.feature_columns exactly.
        """
        meta = self.approval_metadata
        df = pd.DataFrame([raw])

        # Computed features — exactly as in the notebook
        df["Total_Income"] = df["Applicant_Income"].fillna(0) + df["Coapplicant_Income"].fillna(0)
        df["Loan_to_Income"] = df["Loan_Amount"] / (df["Total_Income"] + 1)
        df["Total_EMI"] = df["Existing_Monthly_EMI"] + df["Proposed_Monthly_EMI"]
        df["Loan_to_Collateral"] = df["Loan_Amount"] / (df["Collateral_Value"] + 1)

        # Validate categories against metadata
        for col in meta.get("categorical_columns", []):
            if col in df.columns and pd.notna(df[col].iloc[0]):
                valid_cats = meta["categories"].get(col, [])
                if df[col].iloc[0] not in valid_cats:
                    raise ValueError(f"Invalid category for {col}: '{df[col].iloc[0]}'. Valid: {valid_cats}")

        # Select and order exactly as metadata
        feature_cols = meta["feature_columns"]
        for col in feature_cols:
            if col not in df.columns:
                raise ValueError(f"Missing feature column: {col}")
        return df[feature_cols]

    def predict_approval(self, raw: dict) -> Dict[str, Any]:
        """
        Run the approval model on a raw application dict.
        Returns prediction, probability, features used and model version.
        """
        if not self.approval_available:
            return {
                "status": "unavailable",
                "error": "Approval model not loaded",
                "errors": self._load_errors
            }

        try:
            features_df = self._prepare_approval_features(raw)
            meta = self.approval_metadata

            prediction = int(self.approval_pipeline.predict(features_df)[0])

            proba = self.approval_pipeline.predict_proba(features_df)[0]
            classes = list(self.approval_pipeline.classes_)
            class_1_idx = classes.index(1)
            approval_probability = float(proba[class_1_idx])

            return {
                "status": "completed",
                "prediction": prediction,
                "approval_probability": approval_probability,
                "model_version": meta.get("model_version", "unknown"),
                "feature_values": {col: _safe_json(features_df[col].iloc[0]) for col in features_df.columns},
            }
        except Exception as e:
            logger.error("Approval prediction failed", exc_info=True)
            return {
                "status": "error",
                "error": str(e),
            }

    # -------------------------------------------------------------------------
    # ISOLATION FEATURE ENGINEERING — DIFFERENT FROM APPROVAL
    # -------------------------------------------------------------------------
    def _prepare_isolation_features(self, raw: dict) -> pd.DataFrame:
        """
        Build the feature DataFrame for the isolation model.
        Uses log transforms and ratio features specific to this model.
        Column order matches isolation_metadata.feature_columns exactly.

        IMPORTANT: Do NOT fill income with zero in this adapter.
        Preserve missing-value behavior.
        """
        income = _add_nullable(raw.get("Applicant_Income"), raw.get("Coapplicant_Income"))
        loan = raw.get("Loan_Amount")

        features = {
            "Income": np.log1p(income) if income is not None else np.nan,
            "Loan_Amount": np.log1p(loan) if loan is not None else np.nan,
            "Credit_Score": raw.get("Credit_Score"),
            "Existing_Loans": raw.get("Existing_Loans"),
            "DTI_Ratio": raw.get("DTI_Ratio"),
            "Late_Payments": raw.get("Late_Payments_12M"),
            "Credit_History": raw.get("Credit_History_Years"),
            "Loan_Term": raw.get("Loan_Term"),
            "Loan_to_Income": (loan / (income * 12)) if (income is not None and loan is not None and income != 0) else np.nan,
            "Savings_Ratio": (raw.get("Savings") / income) if (income is not None and raw.get("Savings") is not None and income != 0) else np.nan,
            "Collateral_Ratio": (raw.get("Collateral_Value") / loan) if (loan is not None and raw.get("Collateral_Value") is not None and loan != 0) else np.nan,
        }

        df = pd.DataFrame([features])

        # Replace positive/negative infinity with NaN
        df.replace([np.inf, -np.inf], np.nan, inplace=True)

        # Order columns exactly as metadata
        feature_cols = self.isolation_metadata["feature_columns"]
        for col in feature_cols:
            if col not in df.columns:
                raise ValueError(f"Missing isolation feature column: {col}")
        return df[feature_cols]

    def predict_anomaly(self, raw: dict) -> Dict[str, Any]:
        """
        Run the isolation model on a raw application dict.
        Score = -pipeline.score_samples. Flag when score >= threshold.
        Does NOT use pipeline.predict or recalculate the threshold.

        An anomaly flag means "Manual review recommended," not fraud or automatic rejection.
        No flag does not guarantee safety.
        """
        if not self.isolation_available:
            return {
                "status": "unavailable",
                "error": "Isolation model not loaded",
                "errors": self._load_errors
            }

        try:
            features_df = self._prepare_isolation_features(raw)
            meta = self.isolation_metadata

            score = float(-self.isolation_pipeline.score_samples(features_df)[0])
            threshold = meta["threshold"]
            flagged = bool(score >= threshold)

            return {
                "status": "completed",
                "anomaly_score": score,
                "anomaly_threshold": threshold,
                "anomaly_flagged": flagged,
                "model_version": meta.get("model_version", "unknown"),
                "feature_values": {col: _safe_json(features_df[col].iloc[0]) for col in features_df.columns},
            }
        except Exception as e:
            logger.error("Anomaly prediction failed", exc_info=True)
            return {
                "status": "error",
                "error": str(e),
            }

    def run_assessment(self, raw: dict) -> Dict[str, Any]:
        """Run both models on a single input dict. Returns combined results."""
        approval = self.predict_approval(raw)
        anomaly = self.predict_anomaly(raw)
        return {
            "approval": approval,
            "anomaly": anomaly,
        }


def _add_nullable(a, b):
    """Add two values that may be None. None + None = None."""
    if a is None and b is None:
        return None
    return (a or 0) + (b or 0)


def _safe_json(val):
    """Convert numpy/pandas types to JSON-safe Python types."""
    if val is None or (isinstance(val, float) and (math.isnan(val) or math.isinf(val))):
        return None
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        return float(val)
    if isinstance(val, np.bool_):
        return bool(val)
    return val


# --- EMI calculation (standard amortization) ---

def calculate_emi(principal: float, annual_rate: float, term_months: int) -> float:
    """
    Standard amortization EMI.
    monthly_rate = annual_rate / 1200
    Handles zero interest separately.
    """
    if annual_rate == 0:
        return principal / term_months if term_months > 0 else 0.0
    monthly_rate = annual_rate / 1200.0
    emi = principal * monthly_rate * ((1 + monthly_rate) ** term_months) / (((1 + monthly_rate) ** term_months) - 1)
    return round(emi, 2)


def calculate_dti(existing_emi: float, proposed_emi: float, combined_monthly_income: float) -> Optional[float]:
    """DTI = (existing EMI + proposed EMI) / combined monthly income."""
    if combined_monthly_income is None or combined_monthly_income <= 0:
        return None
    return round((existing_emi + proposed_emi) / combined_monthly_income, 4)


def generate_repayment_schedule(principal: float, annual_rate: float, term_months: int, start_date) -> list[dict]:
    """Generate amortization schedule."""
    emi = calculate_emi(principal, annual_rate, term_months)
    schedule = []
    balance = principal

    from dateutil.relativedelta import relativedelta

    for i in range(1, term_months + 1):
        if annual_rate == 0:
            interest_component = 0.0
        else:
            monthly_rate = annual_rate / 1200.0
            interest_component = round(balance * monthly_rate, 2)

        principal_component = round(emi - interest_component, 2)
        balance = round(balance - principal_component, 2)
        if balance < 0:
            balance = 0.0

        due_date = start_date + relativedelta(months=i)

        schedule.append({
            "installment_number": i,
            "due_date": due_date,
            "principal_component": principal_component,
            "interest_component": interest_component,
            "emi_amount": emi,
            "outstanding_balance": balance,
        })

    return schedule


# Singleton instance
model_service = ModelService()
