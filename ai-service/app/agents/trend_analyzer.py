"""Combined trend analysis + report generation node.

Single-pass LLM call that scores, filters, analyzes, and generates
a LinkedIn-focused trend report from raw crawled articles.
"""

import json
from datetime import datetime, timezone

import structlog
from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.state import TrendScanState
from app.clients.openai_client import get_analyzer_llm
from app.core.dedup import compute_dedup_key
from app.core.storage import get_storage

logger = structlog.get_logger()

DEFAULT_QUALITY_THRESHOLD = 5
DEFAULT_KEYWORDS = [
    "Artificial Intelligence & Machine Learning",
    "Software Engineering & Developer Tools",
    "Cloud Computing & Infrastructure",
    "Cybersecurity & Privacy",
    "Open Source Projects",
    "Startups & Tech Industry",
    "Hardware & Semiconductors",
    "Programming Languages & Frameworks",
    "Data Science & Analytics",
    "Robotics & Automation",
]

TREND_ANALYZER_SYSTEM_PROMPT = """You are a Senior Tech Industry Analyst powering a LinkedIn marketing AI system. You receive raw crawled articles about technology trends. Your audience is LinkedIn — professionals, founders, CTOs, developers, and tech-savvy business leaders.

Your job has 2 phases in ONE pass.

---

## PHASE 1: PREPROCESSING & DEEP ANALYSIS

### Step 1 — Quality Scoring (1-10)

Rate each article on these tech-specific criteria:

| Criteria | What to check | Weight |
|---|---|---|
| **Signal vs Noise** | Is this a real tech insight, product launch, research finding, industry shift — or just a repost, listicle filler, or SEO spam? | 30% |
| **Substantive Depth** | Does it contain technical detail, data points, expert quotes, or original analysis — or is it surface-level? (< 100 words of actual content = auto-fail) | 30% |
| **Recency & Relevance** | Is it about a current development matching the target keywords? Outdated or tangential = penalize. | 20% |
| **Source Authority** | From a credible tech source (official blog, reputable publication, research paper, industry report)? Or from content farms, aggregator spam? | 20% |

Score guide:
- 1-3: Junk — broken page, irrelevant, content farm, error page
- 4-5: Low value — shallow, outdated, or barely relevant
- 6-7: Usable — decent insight but not standout
- 8-10: High value — strong signal, original data, expert perspective

**Discard any article scoring below {quality_threshold}.**

### Step 2 — Deep Analysis (passing articles only)

For each surviving article:

- `sentiment`: bullish | neutral | bearish | controversial
  (Use tech-industry sentiment — "bullish" = optimistic about adoption/growth, "bearish" = skeptical/declining, "controversial" = polarizing debate)

- `engagement_prediction`: low | medium | high | viral
  Predict LinkedIn engagement based on:
  - Does it trigger professional opinion? (high engagement)
  - Is it a "hot take" topic? (viral potential)
  - Is it too niche/dry for broad LinkedIn audience? (low)
  - Does it have a "lessons learned" or "how we did X" angle? (high on LinkedIn)

- `lifecycle`: emerging | rising | peaking | saturated | declining
  (5-stage for better granularity in tech where trends move fast)

- `linkedin_angles`: 3 content angles specifically optimized for LinkedIn, each with:
  - `angle`: the content hook (max 15 words)
  - `format`: thought_leadership | case_study | hot_take | tutorial | industry_analysis | career_advice | behind_the_scenes
  - `hook_line`: a compelling LinkedIn opening line (the "scroll-stopper", max 20 words)

- `cleaned_content`: extract ONLY valuable paragraphs — strip nav, ads, cookie banners, sidebars, author bios, related articles, broken HTML. Keep: core arguments, data points, quotes, technical details.

- `key_data_points`: extract up to 5 specific numbers, statistics, or quantifiable claims (these are gold for LinkedIn posts)

---

## PHASE 2: REPORT GENERATION

Using ONLY passing articles, generate:

### Output A — Trend Report (Markdown)

```md
# Tech Trend Report — {date}
**Keywords:** {keywords}
**Target Platform:** LinkedIn
**Articles Analyzed:** X passed / Y total

## Executive Summary
(3-5 sentences: what's happening in tech this cycle, dominant narrative, biggest opportunity for LinkedIn content)

## Trend Ranking

| # | Trend | Score | Sentiment | Lifecycle | LinkedIn Potential | Best Angle |
|---|---|---|---|---|---|---|

## Deep Dives
(For each top trend:)
### [Trend Name]
- **Why it matters now:** (2-3 sentences)
- **Key data points:** (bullet list of hard numbers)
- **LinkedIn audience fit:** Who cares about this — developers? CTOs? Founders? Recruiters?
- **Timing window:** How long is this trend relevant for content?
- **Recommended angles:**
  1. [Format] — [Angle] — Hook: "[hook_line]"
  2. [Format] — [Angle] — Hook: "[hook_line]"

## Content Calendar Suggestions
(5-7 prioritized post ideas, ordered by predicted engagement)
| Priority | Topic | Format | Best Post Day | Hook |
|---|---|---|---|---|

LinkedIn posting guidance:
- Tuesday-Thursday mornings get highest engagement
- Thought leadership and hot takes outperform tutorials on LinkedIn
- Posts with specific numbers in the hook get 2x engagement
- Carousel posts work well for "X lessons from Y" formats
```

### Output B — Processed Articles (JSON array)
For each passing article:
```json
{{
  "id": "<article_id>",
  "title": "<cleaned title>",
  "source_url": "<url>",
  "source_type": "official_blog | news | research | community | social",
  "quality_score": <number>,
  "cleaned_content": "<extracted core content>",
  "key_data_points": ["<stat1>", "<stat2>"],
  "sentiment": "<bullish|neutral|bearish|controversial>",
  "engagement_prediction": "<low|medium|high|viral>",
  "lifecycle": "<emerging|rising|peaking|saturated|declining>",
  "linkedin_angles": [
    {{
      "angle": "<content hook>",
      "format": "<format_type>",
      "hook_line": "<scroll-stopper opening>"
    }}
  ],
  "target_audience": ["developers", "ctos", "founders", "recruiters", "general_tech"]
}}
```

### Output C — Discarded Articles (JSON array)
```json
{{
  "id": "<article_id>",
  "title": "<raw title>",
  "quality_score": <number>,
  "discard_reason": "<brief reason>"
}}
```

---

## RESPONSE FORMAT

Return a single JSON object:
```json
{{
  "trend_report_md": "<full markdown string>",
  "processed_articles": [ ... ],
  "discarded_articles": [ ... ],
  "meta": {{
    "total_input": <number>,
    "passed": <number>,
    "discarded": <number>,
    "dominant_sentiment": "<string>",
    "top_trend": "<string>",
    "top_linkedin_format": "<most recommended format this cycle>",
    "suggested_posting_window": "<e.g. Tue-Thu 8-10am>"
  }}
}}
```

Respond ONLY with the JSON object. No preamble, no markdown fences, no explanation."""


def _prepare_raw_articles(all_items: list[dict]) -> list[dict]:
    """Condense raw items into the format expected by the LLM prompt."""
    articles = []
    for i, item in enumerate(all_items):
        raw = item.get("raw_data", {})
        articles.append({
            "id": str(i),
            "title": item.get("title", "")[:300],
            "url": item.get("source_url", ""),
            "raw_content": (item.get("content_body") or item.get("description") or "")[:3000],
            "platform": item.get("_platform", "hackernews"),
            "crawled_at": item.get("published_at", ""),
            "hn_score": raw.get("hn_score", 0),
            "hn_comments": raw.get("hn_comments", 0),
        })
    return articles


def _parse_llm_response(content: str) -> dict:
    """Extract JSON from LLM response, handling markdown fences."""
    if "```json" in content:
        content = content.split("```json")[1].split("```")[0]
    elif "```" in content:
        content = content.split("```")[1].split("```")[0]
    return json.loads(content.strip())


def _merge_analysis_into_items(
    all_items: list[dict],
    processed_articles: list[dict],
) -> list[dict]:
    """Merge LLM analysis results back into the original item dicts."""
    # Build lookup by article id (which is the original index)
    analysis_map = {}
    for article in processed_articles:
        article_id = str(article.get("id", ""))
        analysis_map[article_id] = article

    analyzed = []
    for i, item in enumerate(all_items):
        analysis = analysis_map.get(str(i))
        if analysis is None:
            continue  # Discarded by quality threshold

        item["category"] = "tech"  # All passing articles are tech-relevant
        item["sentiment"] = analysis.get("sentiment", "neutral")
        item["engagement_prediction"] = analysis.get("engagement_prediction", "medium")
        item["lifecycle"] = analysis.get("lifecycle", "rising")
        item["relevance_score"] = analysis.get("quality_score", 5.0)
        item["quality_score"] = analysis.get("quality_score", 5.0)
        item["linkedin_angles"] = analysis.get("linkedin_angles", [])
        item["key_data_points"] = analysis.get("key_data_points", [])
        item["target_audience"] = analysis.get("target_audience", [])
        item["source_type"] = analysis.get("source_type", "community")
        item["cleaned_content"] = analysis.get("cleaned_content", "")
        item["related_topics"] = [
            angle.get("angle", "") for angle in analysis.get("linkedin_angles", [])
        ]
        item["dedup_key"] = compute_dedup_key(item.get("title", ""))
        analyzed.append(item)

    return analyzed


def _save_report_files(
    scan_run_id: str,
    report_markdown: str,
    summary_data: dict,
) -> str:
    """Save report.md and summary.json via storage backend.

    Returns the relative key (used as report_file_path in DB).
    """
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    storage = get_storage()

    report_key = f"reports/{scan_run_id}/{today}_report.md"
    summary_key = f"reports/{scan_run_id}/{today}_summary.json"

    storage.write_text(report_key, report_markdown, content_type="text/markdown")
    storage.write_text(
        summary_key,
        json.dumps(summary_data, indent=2, ensure_ascii=False, default=str),
        content_type="application/json",
    )

    logger.info(
        "Report files saved",
        report_key=report_key,
        summary_key=summary_key,
    )
    return report_key


def _generate_fallback_report(all_items: list[dict]) -> dict:
    """Generate a minimal fallback when the LLM call fails."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    lines = [
        f"# Tech Trend Report — {today}",
        f"**Articles Analyzed:** 0 passed / {len(all_items)} total",
        "",
        "## Executive Summary",
        "Report generation failed. Raw data preserved for manual review.",
        "",
        "## Trend Ranking",
        "",
        "| # | Trend | Score |",
        "|---|---|---|",
    ]
    for i, item in enumerate(all_items[:20], 1):
        lines.append(f"| {i} | {item.get('title', 'Unknown')[:80]} | N/A |")

    fallback_processed = []
    for i, item in enumerate(all_items):
        fallback_processed.append({
            "id": str(i),
            "title": item.get("title", ""),
            "source_url": item.get("source_url", ""),
            "source_type": "community",
            "quality_score": 5.0,
            "cleaned_content": item.get("content_body", ""),
            "key_data_points": [],
            "sentiment": "neutral",
            "engagement_prediction": "medium",
            "lifecycle": "rising",
            "linkedin_angles": [],
            "target_audience": ["general_tech"],
        })

    return {
        "trend_report_md": "\n".join(lines),
        "processed_articles": fallback_processed,
        "discarded_articles": [],
        "meta": {
            "total_input": len(all_items),
            "passed": len(all_items),
            "discarded": 0,
            "dominant_sentiment": "neutral",
            "top_trend": all_items[0].get("title", "Unknown") if all_items else "N/A",
            "top_linkedin_format": "thought_leadership",
            "suggested_posting_window": "Tue-Thu 8-10am",
        },
    }


def _chunks(lst: list, n: int):
    """Yield successive n-sized chunks from lst."""
    for i in range(0, len(lst), n):
        yield lst[i : i + n]


async def trend_analyzer_node(state: TrendScanState) -> dict:
    """Combined analysis + report generation in a single LLM pass.

    Quality scores articles, discards below threshold, performs deep
    LinkedIn-focused analysis, and generates a trend report — all in one call.
    """
    raw_results = state.get("raw_results", [])
    scan_run_id = state.get("scan_run_id", "unknown")
    options = state.get("options", {})

    quality_threshold = options.get("quality_threshold", DEFAULT_QUALITY_THRESHOLD)
    keywords = options.get("keywords", DEFAULT_KEYWORDS)

    # Flatten all items with platform tags
    all_items = []
    for result in raw_results:
        if result["error"] is None:
            for item in result["items"]:
                item["_platform"] = result["platform"]
                all_items.append(item)

    if not all_items:
        logger.warning("TrendAnalyzer: no items to analyze")
        return {
            "analyzed_trends": [],
            "discarded_articles": [],
            "trend_report_md": "",
            "analysis_meta": {},
            "report_file_path": "",
        }

    logger.info("TrendAnalyzer: starting combined analysis + report", total_items=len(all_items))

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    llm = get_analyzer_llm()

    # For large batches, process in chunks and merge
    all_processed = []
    all_discarded = []
    all_report_sections = []
    final_meta = {}

    for chunk_idx, chunk in enumerate(_chunks(all_items, 40)):
        raw_articles = _prepare_raw_articles(chunk)

        system_prompt = TREND_ANALYZER_SYSTEM_PROMPT.format(
            quality_threshold=quality_threshold,
            date=today,
            keywords=json.dumps(keywords),
        )

        user_message = json.dumps(raw_articles, default=str)

        try:
            response = await llm.ainvoke([
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_message),
            ])

            result = _parse_llm_response(response.content)

            chunk_processed = result.get("processed_articles", [])
            chunk_discarded = result.get("discarded_articles", [])
            chunk_report = result.get("trend_report_md", "")
            chunk_meta = result.get("meta", {})

            # Offset article IDs for chunks beyond the first
            offset = chunk_idx * 40
            for article in chunk_processed:
                article["id"] = str(int(article.get("id", "0")) + offset)
            for article in chunk_discarded:
                article["id"] = str(int(article.get("id", "0")) + offset)

            all_processed.extend(chunk_processed)
            all_discarded.extend(chunk_discarded)
            if chunk_report:
                all_report_sections.append(chunk_report)
            if not final_meta:
                final_meta = chunk_meta

            logger.info(
                "TrendAnalyzer: chunk processed",
                chunk=chunk_idx + 1,
                passed=len(chunk_processed),
                discarded=len(chunk_discarded),
            )

        except Exception as e:
            logger.error(
                "TrendAnalyzer: LLM call failed for chunk",
                chunk=chunk_idx,
                error=str(e),
            )
            # Fallback for this chunk
            fallback = _generate_fallback_report(chunk)
            offset = chunk_idx * 40
            for article in fallback["processed_articles"]:
                article["id"] = str(int(article.get("id", "0")) + offset)
            all_processed.extend(fallback["processed_articles"])
            if not all_report_sections:
                all_report_sections.append(fallback["trend_report_md"])

    # Use the first chunk's report as the main report (it has the full structure)
    # For multi-chunk scenarios, the first chunk report covers the top articles
    trend_report_md = all_report_sections[0] if all_report_sections else ""

    # Update meta with actual totals
    final_meta.update({
        "total_input": len(all_items),
        "passed": len(all_processed),
        "discarded": len(all_discarded),
    })

    # Merge analysis back into original items
    analyzed_items = _merge_analysis_into_items(all_items, all_processed)

    # Save report files
    report_file_path = ""
    if trend_report_md:
        summary_data = {
            "scan_run_id": scan_run_id,
            "meta": final_meta,
            "processed_count": len(all_processed),
            "discarded_count": len(all_discarded),
            "processed_articles": all_processed,
            "discarded_articles": all_discarded,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        report_file_path = _save_report_files(scan_run_id, trend_report_md, summary_data)

    logger.info(
        "TrendAnalyzer: completed",
        analyzed=len(analyzed_items),
        discarded=len(all_discarded),
        report_saved=bool(report_file_path),
    )

    return {
        "analyzed_trends": analyzed_items,
        "discarded_articles": all_discarded,
        "trend_report_md": trend_report_md,
        "analysis_meta": final_meta,
        "report_file_path": report_file_path,
    }
