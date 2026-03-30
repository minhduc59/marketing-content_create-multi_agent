"""MCP Server for trending content crawling tools.

Exposes platform-specific trending data tools via the Model Context Protocol.
"""

from mcp.server.fastmcp import FastMCP

from app.mcp.tools.google_news import register_tools

# Create MCP server
mcp = FastMCP(
    "Trending Content Scanner",
    instructions="Tools for crawling trending content from YouTube and Google News, including topic-based news search",
)

# Register tools
register_tools(mcp)


if __name__ == "__main__":
    mcp.run(transport="stdio")
