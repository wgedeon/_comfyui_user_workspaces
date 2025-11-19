from typing import Iterator, List, Tuple, Dict, Any, Union, Optional
from _decimal import Context, getcontext
from nodes import NODE_CLASS_MAPPINGS as ALL_NODE_CLASS_MAPPINGS
from datetime import datetime
import folder_paths
import os
from pathlib import Path
import json

CATEGORY = "Feller of Trees/Workspaces"

WORKSPACE_DEFAULT = "default"

def get_wksp_list() -> list[str]:

    home_dir = folder_paths.get_output_directory() # get_user_directory()
    # print(f" - user_dir = {user_dir}")

    workspaces_dir = os.path.join(home_dir, 'workspaces')

    Path(workspaces_dir).mkdir(parents=True, exist_ok=True)
    # print(f" - workspaces_dir = {workspaces_dir}")

    # list folder names from workspaces_dir and put their name into entries
    try:
        entries = [entry.name for entry in Path(workspaces_dir).iterdir() 
                  if entry.is_dir() and not entry.name.startswith('.')]
        # print(f" - Found {len(entries)} workspace folders: {entries}")
        if len(entries) == 0:
            entries = [ WORKSPACE_DEFAULT ]
    except OSError as e:
        print(f" - Error reading workspaces directory: {e}")
        entries = [ WORKSPACE_DEFAULT ]
            
    return list(entries)

# #############################################################################
class fot_Workspace:

    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "codename": (get_wksp_list(), {"default": WORKSPACE_DEFAULT}),
                "width": ("INT", {"default": 640}),
                "height": ("INT", {"default": 480}),
            },
            "optional": {
                "codename_override": ("STRING", {"forceInput": True}),
                "workspace_hash": ("STRING", {"default": "", "forceInput": False}),
            },
            "hidden": {
            }
        }

    RETURN_TYPES = ("WORKSPACE", "STRING", "INT", "INT",)
    RETURN_NAMES = ("workspace", "codename", "width", "height",)
    OUTPUT_IS_LIST = (False, False, False, False)
    OUTPUT_NODE = True

    CATEGORY = CATEGORY

    FUNCTION = "construct_data"
    def construct_data(self, codename=None, codename_override=None, width=640, height=480, **kwargs):
        print("fot_Workspace constructing data")

        print(f" - width = {width}")
        print(f" - height = {height}")

        actual_codename = codename_override if codename_override is not None else codename
        # print(f" - actual_codename = {actual_codename}")

        home_dir = folder_paths.get_output_directory() # get_user_directory()
        # print(f" - user_dir = {user_dir}")

        workspaces_dir = os.path.join(home_dir, 'workspaces')

        Path(workspaces_dir).mkdir(parents=True, exist_ok=True)
        # print(f" - workspaces_dir = {workspaces_dir}")

        workspace_dir = os.path.join(workspaces_dir, actual_codename)

        Path(workspace_dir).mkdir(parents=True, exist_ok=True)
        # print(f" - workspace_dir = {workspace_dir}")

        workspace_json_filename = os.path.join(workspace_dir, 'workspace.json')

        workspace_json_object = None
        if os.path.exists(workspace_json_filename):
            try:
                with open(workspace_json_filename, 'r') as f:
                    workspace_json_object = json.load(f)
                print(f" - Loaded existing workspace.json")
            except (json.JSONDecodeError, IOError) as e:
                print(f" - Error loading workspace.json: {e}, creating new one")
        else:
            print(" - No existing workspace.json, creating new one")

        workspace_json_object_tostore = False
        if workspace_json_object is None:
            workspace_json_object = {
                "codename": actual_codename,
                "width": width,
                "height": height
            }
            workspace_json_object_tostore = True

        # if (not "width" in workspace_json_object) or (width != workspace_json_object["width"]):
        print(f" - updating width: {width}")
        workspace_json_object["width"] = width
        workspace_json_object_tostore = True
        # if (not "height" in workspace_json_object) or (height != workspace_json_object["height"]):
        print(f" - updating height: {height}")
        workspace_json_object["height"] = height
        workspace_json_object_tostore = True

        if workspace_json_object_tostore:
            try:
                with open(workspace_json_filename, 'w') as f:
                    json.dump(workspace_json_object, f, indent=2)
                print(f" - Saved workspace data for '{actual_codename}' to {workspace_json_filename}")
            except IOError as e:
                print(f" - Error saving workspace.json: {e}")

        return (
            workspace_json_object,
            workspace_json_object["codename"],
            workspace_json_object["width"],
            workspace_json_object["height"],
        )

# #############################################################################
class fot_WorkspaceReadOnly:

    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {
            },
            "optional": {
                "workspace": ("WORKSPACE"),
                "codename": (get_wksp_list(), {"default": WORKSPACE_DEFAULT}),
                "codename_override": ("STRING", {"forceInput": True}),
                "workspace_hash": ("STRING", {"default": "", "forceInput": False}),
            },
            "hidden": {
            }
        }
        # for i in range(1, 3):
        #     inputs["optional"]["subdir_%d" % i] = ("STRING",)

        return inputs

    RETURN_TYPES = ("WORKSPACE", "STRING", "INT", "INT", )
    RETURN_NAMES = ("workspace", "codename", "width", "height", )
    OUTPUT_NODE = True

    CATEGORY = CATEGORY

    FUNCTION = "expose_data"
    def expose_data(self, workspace=None, codename=None, codename_override=None, workspace_hash=None, **kwargs):
        print(f"fot_Workspace* exposing data, workspace={workspace}")
        print(f"fot_Workspace*: workspace_hash={workspace_hash}")

        if workspace is None:
            # print(f" - codename = {codename}")

            home_dir = folder_paths.get_output_directory() # get_user_directory()
            # print(f" - user_dir = {user_dir}")

            workspaces_dir = os.path.join(home_dir, 'workspaces')

            Path(workspaces_dir).mkdir(parents=True, exist_ok=True)
            # print(f" - workspaces_dir = {workspaces_dir}")

            actual_codename = codename_override if codename_override is not None else codename

            workspace_dir = os.path.join(workspaces_dir, actual_codename)

            Path(workspace_dir).mkdir(parents=True, exist_ok=True)
            # print(f" - workspace_dir = {workspace_dir}")

            workspace_json_filename = os.path.join(workspace_dir, 'workspace.json')

            workspace_json_object = None
            if os.path.exists(workspace_json_filename):
                with open(workspace_json_filename, 'r') as f:
                    workspace_json_object = json.load(f)
        else:
            workspace_json_object = workspace

        return {
            "ui": {
                "workspace": (workspace_json_object,) },
                "result": (
                    workspace_json_object,
                    workspace_json_object["codename"],
                    workspace_json_object["width"],
                    workspace_json_object["height"],
                )
            }

# #############################################################################
class fot_Folder:

    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {
                "workspace": ("WORKSPACE",),
                "folder": ("STRING", {"default": "", "forceInput": False}),
            },
            "optional": {
            },
            "hidden": {
            }
        }
        return inputs
    
    @classmethod
    def VALIDATE_INPUTS(s, input_types):
        print(f"VALIDATE_INPUTS = {s}")
        return True

    RETURN_TYPES = ("WORKSPACE", "STRING",)
    RETURN_NAMES = ("workspace", "path_full",)
    OUTPUT_NODE = True

    CATEGORY = CATEGORY

    FUNCTION = "expose_data"
    def expose_data(self, workspace, folder, **kwargs):
        # print(f"fot_Folder exposing data", workspace)
        codename = workspace["codename"]
        # print(f"codename = {codename}")

        home_dir = folder_paths.get_output_directory() # get_user_directory()
        workspaces_dir = os.path.join(home_dir, 'workspaces')
        workspace_dir = os.path.join(workspaces_dir, codename)
        path_full = os.path.join(workspace_dir, folder)
    
        return {"ui": {"workspace": (workspace,), "path_full": (path_full,)}, "result": (workspace, path_full,)}


# #############################################################################
NODE_CLASS_MAPPINGS = {
    "fot_Workspace": fot_Workspace,
    "fot_WorkspaceReadOnly": fot_WorkspaceReadOnly,
    "fot_Folder": fot_Folder,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "fot_Workspace": "Workspace",
    "fot_WorkspaceReadOnly": "Workspace Data",
    "fot_Folder": "Folder",
}
