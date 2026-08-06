"""Canonical Q/A/context dataset shared by the synthetic seeder (Phase 2) and
the golden-set seeder (Phase 4). Single source of truth so golden answers line
up exactly with what the synthetic RAG traces claim to retrieve/answer.
"""
from __future__ import annotations

from typing import TypedDict


class QAEntry(TypedDict):
    question: str
    answer: str
    contexts: list[str]


CANONICAL_QA: list[QAEntry] = [
    {
        "question": "What is the refund policy?",
        "answer": "Refunds are available within 30 days of purchase.",
        "contexts": [
            "Our refund policy allows customers to request a full refund within 30 days of purchase.",
            "After 30 days, purchases are considered final and non-refundable.",
        ],
    },
    {
        "question": "How do I reset my password?",
        "answer": "Use the 'Forgot password' link on the login page to reset it.",
        "contexts": [
            "To reset your password, click the 'Forgot password' link on the login page.",
            "A reset email is sent to the address on file; the link expires after 1 hour.",
        ],
    },
    {
        "question": "Which plan includes SSO?",
        "answer": "SSO is included in the Enterprise plan.",
        "contexts": [
            "Single sign-on (SSO) is available on the Enterprise plan.",
            "The Pro and Starter plans do not include SSO.",
        ],
    },
    {
        "question": "What are the API rate limits?",
        "answer": "The default API rate limit is 100 requests per minute.",
        "contexts": [
            "The API enforces a default rate limit of 100 requests per minute per key.",
            "Higher limits are available on request for Enterprise customers.",
        ],
    },
    {
        "question": "How is data encrypted at rest?",
        "answer": "Data at rest is encrypted using AES-256.",
        "contexts": [
            "All data at rest is encrypted with AES-256.",
            "Encryption keys are rotated automatically every 90 days.",
        ],
    },
]

# hallucinated answers (unsupported by contexts) for injected-failure traces
HALLUCINATED_ANSWERS: list[str] = [
    "Refunds are processed via carrier pigeon within three lunar cycles.",
    "Reset your password by emailing the CEO your mother's maiden name.",
    "SSO requires a notarized fax to our research base in Antarctica.",
]

# irrelevant contexts for low-recall (bad retrieval) traces
IRRELEVANT_CONTEXTS: list[str] = [
    "The company cafeteria serves lunch between 12pm and 2pm on weekdays.",
    "Our office plants are watered every Tuesday by the facilities team.",
]
