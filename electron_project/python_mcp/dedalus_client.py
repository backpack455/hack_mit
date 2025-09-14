import asyncio
import json
import sys
from dedalus_labs import AsyncDedalus, DedalusRunner
from dotenv import load_dotenv
from dedalus_labs.utils.streaming import stream_async

load_dotenv()

# Hardcoded Anthropic Claude Sonnet 4 model
MODEL = "anthropic/claude-sonnet-4-20250514"

async def run_dedalus_task(input_text, mcp_agent, stream=False):
    """
    Run a Dedalus task with MCP server integration using Claude Sonnet 4
    
    Args:
        input_text (str): The input prompt/task
        mcp_agent (str): MCP agent/server to use (e.g., "tsion/brave-search-mcp")
        stream (bool): Whether to stream the response
    
    Returns:
        dict: Result containing final_output and metadata
    """
    try:
        client = AsyncDedalus()
        runner = DedalusRunner(client)

        # Convert single agent to list format
        mcp_servers = [mcp_agent] if isinstance(mcp_agent, str) else mcp_agent

        result = await runner.run(
            input=input_text,
            model=MODEL,
            mcp_servers=mcp_servers,
            stream=stream
        )

        return {
            "success": True,
            "final_output": result.final_output,
            "model": MODEL,
            "mcp_agent": mcp_agent,
            "timestamp": asyncio.get_event_loop().time()
        }
    
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "model": MODEL,
            "mcp_agent": mcp_agent,
            "timestamp": asyncio.get_event_loop().time()
        }

async def main():
    """
    Main function that reads arguments from command line and executes Dedalus task
    Expected arguments: prompt mcp_agent
    """
    if len(sys.argv) != 3:
        print(json.dumps({
            "success": False,
            "error": "Usage: python dedalus_client.py <prompt> <mcp_agent>"
        }))
        return
    
    prompt = sys.argv[1]
    mcp_agent = sys.argv[2]
    
    result = await run_dedalus_task(prompt, mcp_agent)
    print(json.dumps(result))

if __name__ == "__main__":
    asyncio.run(main())
