from app.agents.scanners.base import BaseScannerNode
from app.tools.google_trends_tool import GoogleTrendsTool


class GoogleTrendsScannerNode(BaseScannerNode):
    platform = "google_trends"

    def __init__(self, rate_limiter, cache):
        super().__init__(rate_limiter, cache)
        self.tool = GoogleTrendsTool()

    async def fetch(self, options: dict) -> list[dict]:
        country = options.get("region", "united_states")
        return await self.tool.fetch_all(country=country)
