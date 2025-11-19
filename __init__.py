__version__ = "1.0.0"
import server
from aiohttp import web
import folder_paths
import importlib
import os
import re
from pathlib import Path

from .py.libs.image_io import loadJson

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
    imported_module = importlib.import_module(".py.nodes.{}".format(module_name), __name__)
    NODE_CLASS_MAPPINGS = {**NODE_CLASS_MAPPINGS, **imported_module.NODE_CLASS_MAPPINGS}
    NODE_DISPLAY_NAME_MAPPINGS = {**NODE_DISPLAY_NAME_MAPPINGS, **imported_module.NODE_DISPLAY_NAME_MAPPINGS}

app = server.PromptServer.instance.app

@server.PromptServer.instance.routes.get("/comfyui_user_workspaces/get_workspaces")
async def get_workspaces(request):
    """
    Custom endpoint to fetch the workspace codenames
    """
    try:
        # print(f"get_workspaces:")
        home_dir = folder_paths.get_output_directory() # get_user_directory()
        workspaces_dir = os.path.join(home_dir, 'workspaces')
        # print(f"workspaces_dir = {workspaces_dir}")

        try:
            workspaces = [entry.name for entry in Path(workspaces_dir).iterdir() 
                    if entry.is_dir() and not entry.name.startswith('.')]
            # print(f" - Found {len(workspaces)} workspaces: {workspaces}")
            if len(workspaces) == 0:
                workspaces = [ ]
        except OSError as e:
            print(f" - Error reading workspaces: {e}")
            workspaces = [ ]

        return web.json_response({"workspaces": workspaces})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@server.PromptServer.instance.routes.get("/comfyui_user_workspaces/get_folders")
async def get_folders(request):
    """
    Custom endpoint to fetch the folder names in a workspace.
    """
    try:
        # print(f"get_folders:")
        home_dir = folder_paths.get_output_directory() # get_user_directory()
        workspaces_dir = os.path.join(home_dir, 'workspaces')
        # print(f"workspaces_dir = {workspaces_dir}")

        workspace_codename = request.query.get('workspace_codename')
        # print(f"workspace_codename = {workspace_codename}")
        workspace_dir = os.path.join(workspaces_dir, workspace_codename)

        try:
            workspace_folders = [entry.name for entry in Path(workspace_dir).iterdir() 
                    if entry.is_dir() and not entry.name.startswith('.')]
            # print(f" - Found {len(workspace_folders)} workspace folders: {workspace_folders}")
            if len(workspace_folders) == 0:
                workspace_folders = [ ]
        except OSError as e:
            print(f" - Error reading workspace folders: {e}")
            workspace_folders = [ ]

        return web.json_response({"folders": workspace_folders})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@server.PromptServer.instance.routes.post("/comfyui_user_workspaces/add_folder")
async def add_folder(request):
    try:
        print(f"add_folder:")
        home_dir = folder_paths.get_output_directory() # get_user_directory()
        workspaces_dir = os.path.join(home_dir, 'workspaces')
        print(f"workspaces_dir = {workspaces_dir}")

        workspace_codename = request.query.get('workspace_codename')
        print(f"workspace_codename = {workspace_codename}")
        workspace_dir = os.path.join(workspaces_dir, workspace_codename)

        folder_name = request.query.get('folder_name')
        print(f"folder_name = {folder_name}")
        
        if not folder_name or not re.match(r'^[a-zA-Z0-9_-]+$', folder_name):
            print("invalid folder name")
            return web.json_response({"error": "Invalid folder name"}, status=400)
        
        folder_path = os.path.join(workspace_dir, folder_name)        
        os.makedirs(folder_path, exist_ok=True)
        
        print(f"done add_folder")
        return web.json_response({
            "status": "success", 
            "message": f"Folder '{folder_name}' created",
            "path": folder_path
        })
        
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@server.PromptServer.instance.routes.post("/comfyui_user_workspaces/add_workspace")
async def add_workspace(request):
    try:
        print(f"add_workspace:")
        home_dir = folder_paths.get_output_directory() # get_user_directory()
        workspaces_dir = os.path.join(home_dir, 'workspaces')
        print(f"workspaces_dir = {workspaces_dir}")

        workspace_codename = request.query.get('workspace_codename')
        print(f"workspace_codename = {workspace_codename}")
        
        if not workspace_codename or not re.match(r'^[a-zA-Z0-9_-]+$', workspace_codename):
            print("invalid folder name")
            return web.json_response({"error": "Invalid folder name"}, status=400)
        
        folder_path = os.path.join(workspaces_dir, workspace_codename)        
        os.makedirs(folder_path, exist_ok=True)
        
        print(f"done add_workspace")
        return web.json_response({
            "status": "success", 
            "message": f"Workspace '{workspace_codename}' created",
            "path": folder_path
        })
        
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@server.PromptServer.instance.routes.get("/comfyui_user_workspaces/get_workspace")
async def get_workspaces(request):
    """
    Custom endpoint to fetch the workspace codenames
    """
    try:
        # print(f"get_workspaces:")
        home_dir = folder_paths.get_output_directory() # get_user_directory()
        workspaces_dir = os.path.join(home_dir, 'workspaces')
        workspace_codename = request.query.get('workspace_codename')
        workspace_path = os.path.join(workspaces_dir, workspace_codename)
        workspace_json_file = os.path.join(workspace_path, "workspace.json")
        workspace_json = loadJson(workspace_json_file)
        return web.json_response({"workspace": workspace_json})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']
