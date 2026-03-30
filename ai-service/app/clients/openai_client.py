from functools import lru_cache

from langchain_openai import ChatOpenAI

from app.config import get_settings


@lru_cache
def get_llm() -> ChatOpenAI:
    settings = get_settings()
    return ChatOpenAI(
        model="gpt-4o",
        api_key=settings.OPENAI_API_KEY,
        max_tokens=4096,
        temperature=0,
    )


def get_report_llm() -> ChatOpenAI:
    """LLM instance for report generation — higher token limit and slight creativity."""
    settings = get_settings()
    return ChatOpenAI(
        model="gpt-4o",
        api_key=settings.OPENAI_API_KEY,
        max_tokens=8192,
        temperature=0.3,
    )
