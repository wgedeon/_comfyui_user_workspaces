__version__ = "1.0.0"
import server
from aiohttp import web
import folder_paths
import importlib
import os
from pathlib import Path

cwd_path = os.path.dirname(os.path.realpath(__file__))
comfy_path = folder_paths.base_path

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
WEB_DIRECTORY = "./js"

# Nodes
nodes_list = [
    "nodes", 
]
for module_name in nodes_list:
    imported_module = importlib.import_module(".py.{}".format(module_name), __name__)
    NODE_CLASS_MAPPINGS = {**NODE_CLASS_MAPPINGS, **imported_module.NODE_CLASS_MAPPINGS}
    NODE_DISPLAY_NAME_MAPPINGS = {**NODE_DISPLAY_NAME_MAPPINGS, **imported_module.NODE_DISPLAY_NAME_MAPPINGS}

# Get the application instance
app = server.PromptServer.instance.app

@server.PromptServer.instance.routes.get("/comfyui_user_workspaces/get_folders")
async def get_workspaces(request):
    """
    Custom endpoint to fetch the folder names in a workspace.
    """
    try:
        print(f"get_workspaces:")
        user_dir = folder_paths.get_user_directory()
        workspaces_dir = os.path.join(user_dir, 'workspaces')
        # workspace_dir = os.path.join(workspaces_dir, codename)
        print(f"workspaces_dir = {workspaces_dir}")

        workspace_codename = request.query.get('workspace_codename')
        print(f"workspace_codename = {workspace_codename}")
        workspace_dir = os.path.join(workspaces_dir, workspace_codename)

        try:
            workspace_folders = [entry.name for entry in Path(workspace_dir).iterdir() 
                    if entry.is_dir() and not entry.name.startswith('.')]
            print(f" - Found {len(workspace_folders)} workspace folders: {workspace_folders}")
            if len(workspace_folders) == 0:
                workspace_folders = [ ]
        except OSError as e:
            print(f" - Error reading workspace folders: {e}")
            workspace_folders = [ ]

        return web.json_response({"folders": workspace_folders})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

# You can also define POST endpoints for receiving data
# @server.PromptServer.instance.routes.post("/my_custom_node/save_config")
# async def save_config(request):
#     data = await request.json()
#     # ... process the data from your widget ...
#     return web.json_response({"status": "success"})

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']
