import operator
from typing import Annotated, TypedDict


class PostGenState(TypedDict):
    # Inputs (set by runner before graph.ainvoke)
    scan_run_id: str
    options: dict  # {num_posts: 3, formats: [...], ...}

    # Loaded during strategy_alignment
    trend_report_md: str
    analyzed_trends: list[dict]
    strategy: dict  # parsed strategy.json

    # Phase 1 output
    content_plan: list[dict]  # [{trend_index, angle, format, target_audience, ...}]

    # Phase 2+3 output
    generated_posts: list[dict]  # Full post dicts with caption, hashtags, image_prompt

    # Phase 4 output
    review_results: list[dict]  # [{post_id, score, criteria_scores, feedback}]
    revision_count: int  # 0, 1, or 2
    posts_to_revise: list[str]  # post_ids that need revision

    # Phase 5 output
    final_output: dict  # {content_plan, posts, strategy_update}
    saved_file_paths: list[str]

    # Control
    errors: Annotated[list[dict], operator.add]
