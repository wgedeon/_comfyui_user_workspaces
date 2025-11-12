import { app } from "../../scripts/app.js";
import { ComfyWidgets } from "../../scripts/widgets.js";

const WIDGET_NAME_FOLDER = "folder";

app.registerExtension({
    name: "comyui_user_workspaces.fot_Folder",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeType.comfyClass !== "fot_Folder") {
            return;
        }
        
        nodeData.input.required.folder = [ [] ]

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        const onExecuted = nodeType.prototype.onExecuted;
        const onConfigure = nodeType.prototype.onConfigure;

        nodeType.prototype.onNodeCreated = function() {
            // console.log("onNodeCreated: ", this.id, this);

            // Find the folder widget and change it to dropdown
            const folderWidget = this.widgets.find(w => w.name === WIDGET_NAME_FOLDER);
            if (folderWidget && folderWidget.type !== "combo") {
                // console.log(" - changing to combo list", folderWidget);
                folderWidget.type = "combo";
                // folderWidget.options.values = []; // Will be populated dynamically on configure
                folderWidget.options.values = ["Loading..."];
                folderWidget.value = "Loading...";
                this.inputs[1].type = "COMBO";
                // console.log(" - changed to combo list", folderWidget);
            }

            if (onNodeCreated) onNodeCreated.apply(this, arguments);
        };

        const findUpstreamWorkspace = async function(thiz, node) {
            // console.log("findUpstreamWorkspace thiz: ", thiz);
            // console.log("findUpstreamWorkspace node: ", node);
            const slotIndex = node.findInputSlot("workspace");
            if (slotIndex == -1) {
                return;
            }
            const inputLink = node.getInputLink(slotIndex);
            if (!inputLink) {
                return null;
            }

            const upstreamNode = app.graph.getNodeById(inputLink.origin_id);

            if (upstreamNode.type === "fot_Folder") {
                // console.log("upstream ", upstreamNode.id, "is folder, will continue up", thiz.id);
                return findUpstreamWorkspace(thiz, upstreamNode);
            }

            if (upstreamNode.type === "fot_Workspace" || upstreamNode.type === "fot_WorkspaceReadOnly") {
                const upstreamSlotIndex = upstreamNode.findInputSlot("workspace");
                if (upstreamSlotIndex !== -1) {
                    const upstreamInputLink = upstreamNode.getInputLink(upstreamSlotIndex);
                    if (upstreamInputLink) {
                        // console.log("upstream ", upstreamNode.id, "is overriden workspace, will continue up", thiz.id);
                        // console.log("  going up: ", upstreamNode.id);
                        return findUpstreamWorkspace(thiz, upstreamNode);
                    }
                }

                // console.log("got upstream workspace", thiz.id);
                return upstreamNode;
            }

            throw new Error("Unexpected, workspace is not a fot_Workspace! it is a " + upstreamNode.type);
        };

        const updateFolders = async function(thiz) {
            // Find the folder widget and change it to dropdown
            const folderWidget = thiz.widgets.find(w => w.name === "folder");
            if (folderWidget && folderWidget.type !== "combo") {
                // Convert string input to dropdown
                folderWidget.type = "combo";
                folderWidget.options.values = []; // Will be populated dynamically
            }

            const slotIndex = thiz.findInputSlot("workspace");
            if (slotIndex == -1) {
                return;
            }
            const inputLink = thiz.getInputLink(slotIndex);
            if (!inputLink) {
                return null;
            }

            let upstreamNode = await findUpstreamWorkspace(thiz, thiz);

            // TODO check codename_override
            let workspace_codename = undefined;
            if (upstreamNode != null && upstreamNode.widgets_values && upstreamNode.widgets_values.length > 0) {
                workspace_codename = upstreamNode.widgets_values[0];
            }

            // console.log(" - workspace_codename: ", workspace_codename);

            if (workspace_codename == undefined) {
                return;
            }

            try {
                const url = `/comfyui_user_workspaces/get_folders?workspace_codename=${encodeURIComponent(workspace_codename)}`
                const response = await fetch(url);
                const data = await response.json();

                if (response.ok) {
                    const widget = thiz.widgets.find(w => w.name === WIDGET_NAME_FOLDER);
                    const currentValue = widget.value;
                    widget.options.values = data.folders;

                    if (data.folders.includes(currentValue)) {
                        widget.value = currentValue;
                    } else if (data.folders.length > 0) {
                        widget.value = data.folders[0];
                    } else {
                        widget.value = "default";
                    }

                    thiz.onWidgetChange?.(WIDGET_NAME_FOLDER, widget.value);
                }
                else {
                    console.error("Server error:", data.error);
                }
            }
            catch (error) {
                console.error("Failed to fetch workspace folders:", error);
            }

        };

        nodeType.prototype.onConfigure = async function(node) {
            console.log("onConfigure: ", this.id);
            console.log(" - this: ", this);
            console.log(" - node: ", node);

            // listen to incoming workspace changes
            const originalOnInputChanged = node.onInputChanged;
            const thiz = this;
            node.onInputChanged = function () {
                if (originalOnInputChanged) originalOnInputChanged.apply(this, arguments);
                updateFolders(thiz);
            };            

            updateFolders(this);

            onConfigure?.apply(this, arguments);
        }

        nodeType.prototype.onExecuted = async function (result) {
            // console.log("fot_Folder:onExecuted: ", this.id, result);

            updateFolders(this);

            onExecuted?.apply(this, arguments);
        };

    }
});
