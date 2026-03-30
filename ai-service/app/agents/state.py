import operator
from typing import Annotated, TypedDict


class RawTrendData(TypedDict):
    platform: str
    items: list[dict]
    error: str | None
    metadata: dict


class ScanError(TypedDict):
    platform: str
    error: str


class TrendScanState(TypedDict):
    # Input
    scan_run_id: str
    platforms: list[str]
    options: dict

    # Scanner outputs - each scanner appends via operator.add
    raw_results: Annotated[list[RawTrendData], operator.add]

    # Analyzer output
    analyzed_trends: list[dict]
    cross_platform_groups: list[dict]

    # Content saver output
    content_file_paths: list[str]

    # Reporter output
    report_content: str
    report_file_path: str

    # Control
    errors: Annotated[list[ScanError], operator.add]
