from app.agents.scanners.base import BaseScannerNode
from app.tools.twitter_tool import TwitterTool


class TwitterScannerNode(BaseScannerNode):
    platform = "twitter"

    def __init__(self, rate_limiter, cache):
        super().__init__(rate_limiter, cache)
        self.tool = TwitterTool()

    async def fetch(self, options: dict) -> list[dict]:
        country = options.get("region", "US")
        return await self.tool.fetch_all(country=country)
