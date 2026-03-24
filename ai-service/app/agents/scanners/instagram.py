from app.agents.scanners.base import BaseScannerNode
from app.tools.instagram_tool import InstagramTool


class InstagramScannerNode(BaseScannerNode):
    platform = "instagram"

    def __init__(self, rate_limiter, cache):
        super().__init__(rate_limiter, cache)
        self.tool = InstagramTool()

    async def fetch(self, options: dict) -> list[dict]:
        return await self.tool.fetch_all()
