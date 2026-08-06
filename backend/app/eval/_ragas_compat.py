"""Import-time shim: RAGAS 0.4.3 imports `langchain_community.chat_models.vertexai`
(`ChatVertexAI`), a path removed in langchain v1. We don't use VertexAI, so we
register a stub module before RAGAS is imported. Import this module FIRST.
"""
from __future__ import annotations

import sys
import types

_MOD = "langchain_community.chat_models.vertexai"
if _MOD not in sys.modules:
    stub = types.ModuleType(_MOD)
    stub.ChatVertexAI = type("ChatVertexAI", (), {})  # never instantiated
    sys.modules[_MOD] = stub
