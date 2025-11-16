import { app } from "../../scripts/app.js";

const NODE_TYPES_MINE = ["fot_Workspace", "fot_WorkspaceReadOnly", "fot_Folder"]
const WIDGET_NAME_FOLDER = "folder";
const WIDGET_NAME_WORKSPACE = "codename";

let common_extension = null;

const findUpstreamWorkspace = async function (node) {
    // console.log("findUpstreamWorkspace:");
    // console.log("  - node: ", node);
    const slotIndex = node.findInputSlot("workspace");
    if (slotIndex == -1) {
        return;
    }
    const inputLink = node.getInputLink(slotIndex);
    if (!inputLink) {
        return;
    }

    // console.log("findUpstreamWorkspace node: ", node);
    // console.log("findUpstreamWorkspace inputLink.origin_id: ", inputLink.origin_id);
    const upstreamNode = node.graph.getNodeById(inputLink.origin_id);

    if (upstreamNode.type === "fot_Folder") {
        // console.log("upstream ", upstreamNode.id, "is folder, will continue up", thiz.id);
        return findUpstreamWorkspace(upstreamNode);
    }

    if (upstreamNode.type === "fot_Workspace" || upstreamNode.type === "fot_WorkspaceReadOnly") {
        const upstreamSlotIndex = upstreamNode.findInputSlot("workspace");
        if (upstreamSlotIndex !== -1) {
            const upstreamInputLink = upstreamNode.getInputLink(upstreamSlotIndex);
            if (upstreamInputLink) {
                // console.log("upstream ", upstreamNode.id, "is overriden workspace, will continue up", thiz.id);
                // console.log("  going up: ", upstreamNode.id);
                return findUpstreamWorkspace(upstreamNode);
            }
        }

        return upstreamNode;
    }

    throw new Error("Unexpected, workspace is not a fot_Workspace! it is a " + upstreamNode.type);
};

const findDownstreamNodes = async function (node) {
    console.log("findDownstreamNodes:");
    const slotIndex = node.findOutputSlot("workspace");
    if (slotIndex == -1) {
        return [];
    }
    const outputNodes = node.getOutputNodes(slotIndex);
    // console.log(" - outputNodes = ", outputNodes);

    if (outputNodes === null) {
        return [];
    }

    const mynodes = outputNodes.filter((node) => NODE_TYPES_MINE.includes(node.type))
    // console.log(" - mynodes = ", mynodes);

    let downstreamNodes = []
    for (const node of mynodes) {
        const downstreams = await findDownstreamNodes(node);
        downstreamNodes = downstreamNodes.concat([node]).concat(downstreams);
    }

    // console.log(" - downstream nodes = ", mynodes);
    return downstreamNodes;
};

const addWorkspace = async function (node, workspace_codename) {
    try {
        console.log("addWorkspace:");
        console.log("  - workspace = ", workspace_codename);
        const url = `/comfyui_user_workspaces/add_workspace?workspace_codename=${encodeURIComponent(workspace_codename)}`
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();

        if (response.ok) {
            console.log("addWorkspace: will update workspaces");
            await refreshWorkspaces(node);
            console.log("addWorkspace: will select workspace: ", workspace_codename);
            selectWorkspace(node, workspace_codename);
        }
        else {
            console.error("Server error:", data.error);
        }
    }
    catch (error) {
        console.error("Failed to add workspace folder:", error);
    }

}

const refreshWorkspaces = async function (node) {
    try {
        const url = `/comfyui_user_workspaces/get_workspaces`
        const response = await fetch(url);
        const data = await response.json();

        if (response.ok) {
            const widget = node.widgets.find(w => w.name === WIDGET_NAME_WORKSPACE);
            const currentValue = widget.value;
            widget.options.values = data.workspaces.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
            // console.log("(", node.id, ") got folders: ", data.folders)
            selectWorkspace(node, currentValue);
        }
        else {
            console.error("Server error:", data.error);
        }
    }
    catch (error) {
        console.error("Failed to fetch workspaces:", error);
    }

}

const selectWorkspace = function (node, workspace_codename) {
    console.log("(", node.id, ") will select workspace: ", workspace_codename);
    console.log("(", node.id, ")   - node: ", node);

    const widget = node.widgets.find(w => w.name === WIDGET_NAME_WORKSPACE);
    const workspaces = widget.options.values;
    if (workspaces.includes(workspace_codename)) {
        widget.value = workspace_codename;
    }
    else if (workspaces.length > 0) {
        widget.value = workspaces[0];
    }
    else {
        widget.value = "default";
    }
    node.setDirtyCanvas(true, false);
}

const addFolder = async function (node, workspace_codename, folder_name) {
    try {
        console.log("addFolder:");
        console.log("  - workspace = ", workspace_codename);
        console.log("  - folder = ", folder_name);
        const url = `/comfyui_user_workspaces/add_folder?workspace_codename=${encodeURIComponent(workspace_codename)}&folder_name=${folder_name}`
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();

        if (response.ok) {
            console.log("addFolder: will update folders");
            await refreshFolders(node);
            console.log("addFolder: will select folder: ", folder_name);
            selectFolder(node, folder_name);
        }
        else {
            console.error("Server error:", data.error);
        }
    }
    catch (error) {
        console.error("Failed to add workspace folder:", error);
    }
};

const refreshFolders = async function (node) {
    // console.log("updateFolders, node: ", node);
    // Find the folder widget and change it to dropdown
    const folderWidget = node.widgets.find(w => w.name === WIDGET_NAME_FOLDER);
    if (folderWidget && folderWidget.type !== "combo") {
        // Convert string input to dropdown
        folderWidget.type = "combo";
        folderWidget.options.values = []; // Will be populated dynamically
    }

    let upstreamNode = await findUpstreamWorkspace(node);

    // TODO check codename_override
    let workspace_codename = undefined;
    // console.log(" - upstreamNode: ", upstreamNode);
    // if (upstreamNode != null) console.log(" - upstreamNode.workspace_codename: ", upstreamNode.workspace_codename);
    if (upstreamNode != null && upstreamNode.workspace_codename) {
        workspace_codename = upstreamNode.workspace_codename;
    }

    // console.log("(", node.id, ") update folders, workspace_codename: ", workspace_codename);
    node.workspace_codename = workspace_codename;
    if (workspace_codename == undefined) {
        return;
    }

    try {
        const url = `/comfyui_user_workspaces/get_folders?workspace_codename=${encodeURIComponent(workspace_codename)}`
        const response = await fetch(url);
        const data = await response.json();

        if (response.ok) {
            const widget = node.widgets.find(w => w.name === WIDGET_NAME_FOLDER);
            const currentValue = widget.value;
            widget.options.values = data.folders.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
            // console.log("(", node.id, ") got folders: ", data.folders)
            selectFolder(node, currentValue);
        }
        else {
            console.error("Server error:", data.error);
        }
    }
    catch (error) {
        console.error("Failed to fetch workspace folders:", error);
    }

};

const selectFolder = function (node, folder) {
    // console.log("(", node.id, ") will select folder: ", folder);
    // console.log("(", node.id, ")   - node: ", node);

    const widget = node.widgets.find(w => w.name === WIDGET_NAME_FOLDER);
    const folders = widget.options.values;
    if (folders.includes(folder)) {
        widget.value = folder;
    }
    else if (folders.length > 0) {
        widget.value = folders[0];
    }
    else {
        widget.value = "default";
    }
    node.setDirtyCanvas(true, false);
};

const setup_node = async function (node) {
    if (node.type === "fot_Workspace" || node.type === "fot_WorkspaceReadOnly") {
        if (node.widgets) {
            for (const widget of node.widgets) {
                if (widget.callback) {
                    const original_widget_callback = widget.callback;
                    widget.callback = async function (value) {
                        let original_widget_callback_result;
                        if (original_widget_callback) {
                            original_widget_callback_result = original_widget_callback.apply(this, arguments);
                        }

                        node.workspace_codename = value;
                        console.log("(", node.id, ") callback node.workspace_codename: ", node.workspace_codename);
                        // console.log("   =  node                   : ", node);

                        // find downstream workspace consumers and trigger their refreshFolders

                        const fullNode = app.graph.getNodeById(node.id);
                        const downstreams = await findDownstreamNodes(fullNode);

                        // console.log("   = got downstream nodes = ", downstreams);
                        for (var downstream of downstreams) {
                            console.log("(", node.id, ") updating downstream node : ", downstream);
                            await refreshFolders(downstream);
                        }

                        return original_widget_callback_result;
                    };
                }
                // else {
                //     console.log("----> no widget.callback! ", widget);
                // }
            }
        }
        // initialize workspace_codename
        // console.log("(", node.id, ") setup_node workspace node = ", node);
        if (node.widgets_values && node.widgets_values.length > 0) {
            node.workspace_codename = node.widgets_values[0];
            // console.log("(", node.id, ") setup_node workspace_codename = ", node.workspace_codename);
        }
    }

    if (node.type === "fot_Folder") {
        // console.log("(", node.id, ") setup_node (fot_Folder) will update folders");
        await refreshFolders(node);
    }
};

app.registerExtension({
    name: "comyui_user_workspaces.extension_common",

    async beforeRegisterNodeDef(nodeType, node, app) {
        if (common_extension) return;
        // console.log("register ", this.name);
        common_extension = this;

        const original_app_graph_configure = app.graph.configure;
        app.graph.configure = function (graph) {
            let original_app_graph_configure_result;
            // console.log("##### app.graph.configure: ", arguments);
            // console.log("====> this: ", this);
            if (original_app_graph_configure) {
                original_app_graph_configure_result = original_app_graph_configure.apply(this, arguments);
            }

            const original_onNodeAdded = this.onNodeAdded;
            this.onNodeAdded = function (node) {
                let original_onNodeAdded_result;
                if (original_onNodeAdded) {
                    original_onNodeAdded_result = original_onNodeAdded.apply(this, arguments);
                }
                if (!NODE_TYPES_MINE.includes(node.type)) return original_onNodeAdded_result;
                // console.log("====> this.onNodeAdded");
                // console.log("  ==  node = ", node);
                // console.log("  ==  this = ", this);

                setup_node(node);

                return original_onNodeAdded_result;
            };

            // setup existing nodes
            // console.log("##### setup existing nodes: ", graph);
            for (var i = 0, l = graph.nodes.length; i < l; i++) {
                var node = graph.nodes[i];
                if (!NODE_TYPES_MINE.includes(node.type)) continue;
                const fullNode = app.graph.getNodeById(node.id);
                // console.log("====> setup existing node: ", fullNode);
                setup_node(fullNode);
            }

            return original_app_graph_configure_result;
        };
    }
});

app.registerExtension({
    name: "comyui_user_workspaces.fot_Folder",

    async beforeRegisterNodeDef(nodeType, nodeSpecs, app) {
        if (nodeSpecs.name !== "fot_Folder") return;
        // console.log("(", nodeSpecs.id, ") register ", this.name);

        nodeSpecs.input.required.folder = [[]]

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        const onExecuted = nodeType.prototype.onExecuted;
        const onConfigure = nodeType.prototype.onConfigure;

        nodeType.prototype.onNodeCreated = function () {
            // console.log("onNodeCreated: ", this.id, this);
            const node = this;
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

            this.addCustomWidget({
                name: "+ Add Folder",
                title: "+ Add Folder",
                type: "button",
                callback: () => {
                    if (node.workspace_codename) {
                        // this.showAddFolderDialog();
                        const folderName = prompt("New folder:");
                        addFolder(node, node.workspace_codename, folderName)
                    }
                },
            });

            this.addCustomWidget({
                name: "⟳ Refresh",
                title: "⟳ Refresh",
                type: "button",
                callback: async () => {
                    console.log("refresh: will update folders");
                    await refreshFolders(node);
                },
            });

            if (onNodeCreated) onNodeCreated.apply(this, arguments);
        };

        nodeType.prototype.onConfigure = async function (node) {
            // console.log("onConfigure: ", this.id);
            // console.log(" - this: ", this);
            // console.log(" - node: ", node);

            // listen to incoming workspace changes
            const originalOnInputChanged = node.onInputChanged;
            const thiz = this;
            node.onInputChanged = async function () {
                if (originalOnInputChanged) originalOnInputChanged.apply(this, arguments);
                console.log("(", node.id, ") onInputChanged: will update folders");
                await refreshFolders(thiz);
            };

            // console.log("(", node.id, ") onConfigure: will update folders");
            await refreshFolders(this);

            onConfigure?.apply(this, arguments);
        }

        nodeType.prototype.onExecuted = async function (result) {
            // console.log("fot_Folder:onExecuted: ", this.id, result);

            console.log("(", nodeSpecs.id, ") onExecuted: will update folders");
            await refreshFolders(this);

            onExecuted?.apply(this, arguments);
        };

    }
});

app.registerExtension({
    name: "comyui_user_workspaces.fot_Workspace",

    async beforeRegisterNodeDef(nodeType, nodeSpecs, app) {
        if (!nodeSpecs.name.startsWith("fot_Workspace")) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        // const onExecuted = nodeType.prototype.onExecuted;
        // const onConfigure = nodeType.prototype.onConfigure;
        if (nodeSpecs.name === "fot_Workspace") {
            nodeType.prototype.onNodeCreated = function () {
                const node = this;
                this.addCustomWidget({
                    name: "+ Add Workspace",
                    title: "+ Add Workspace",
                    type: "button",
                    callback: () => {
                        // this.showAddFolderDialog();
                        const workspace_codename = prompt("New workspace:");
                        addWorkspace(node, workspace_codename);
                        selectWorkspace(node, workspace_codename);
                    },
                });
                if (onNodeCreated) onNodeCreated.apply(this, arguments);
            };
        }

        nodeType.prototype.onConfigure = async function (node) {
            // ensure currently configured value is in list (in case of offline dir clean-up)
            const widget = node.widgets.find(w => w.name === WIDGET_NAME_WORKSPACE);
            const currentValue = widget.value;
            const workspaces = widget.options.values;
            if (workspaces.includes(currentValue)) {
                widget.value = currentValue;
            }
            else if (workspaces.length > 0) {
                widget.value = workspaces[0];
            }
            else {
                widget.value = "default";
            }
            this.setDirtyCanvas(true, false);
        };
    }

});
