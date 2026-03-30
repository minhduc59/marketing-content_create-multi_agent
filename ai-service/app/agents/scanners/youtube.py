from app.agents.scanners.base import BaseScannerNode
from app.tools.youtube_tool import YouTubeTool


class YouTubeScannerNode(BaseScannerNode):
    platform = "youtube"

    def __init__(self, rate_limiter, cache):
        super().__init__(rate_limiter, cache)
        self.tool = YouTubeTool()

    async def fetch(self, options: dict) -> list[dict]:
        region = options.get("region", "US")
        if region == "global" or len(region) != 2:
            region = "US"
        return await self.tool.fetch_all(region_code=region)
