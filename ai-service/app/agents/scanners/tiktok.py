from app.agents.scanners.base import BaseScannerNode
from app.tools.tiktok_tool import TikTokTool


class TikTokScannerNode(BaseScannerNode):
    platform = "tiktok"

    def __init__(self, rate_limiter, cache):
        super().__init__(rate_limiter, cache)
        self.tool = TikTokTool()

    async def fetch(self, options: dict) -> list[dict]:
        return await self.tool.fetch_all()
