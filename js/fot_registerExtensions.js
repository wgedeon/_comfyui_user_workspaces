import { app } from "../../scripts/app.js";

import {
    findUpstreamWorkspace,
    findDownstreamNodes,
    updateWorkspaceCodename,
    is_workspace_consumer,
    is_workspace_producer,
} from "./workspaces.js";

const NODE_TYPES_MINE = ["fot_Workspace", "fot_WorkspaceReadOnly", "fot_Folder"]
const WIDGET_NAME_FOLDER = "folder";
const WIDGET_NAME_CODENAME = "codename";

const addWorkspace = async function (node, workspace_codename) {
    try {
        if (DEBUG) console.log("addWorkspace:");
        if (DEBUG) console.log("  - workspace = ", workspace_codename);
        const url = `/comfyui_user_workspaces/add_workspace?workspace_codename=${encodeURIComponent(workspace_codename)}`
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();

        if (response.ok) {
            if (DEBUG) console.log("addWorkspace: will update workspaces");
            await refreshWorkspaces(node);
            if (DEBUG) console.log("addWorkspace: will select workspace: ", workspace_codename);
            await selectWorkspace(node, workspace_codename);
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
            const widget = node.widgets.find(w => w.name === WIDGET_NAME_CODENAME);
            const currentValue = widget.value;
            widget.options.values = data.workspaces.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
            // console.log("(", node.id, ") got folders: ", data.folders)
            await selectWorkspace(node, currentValue);
        }
        else {
            console.error("Server error:", data.error);
        }
    }
    catch (error) {
        console.error("Failed to fetch workspaces:", error);
    }

}

const selectWorkspace = async function (node, workspace_codename) {
    if (DEBUG) console.log("(", node.id, ") will select workspace: ", workspace_codename);
    const widget = node.widgets.find(w => w.name === WIDGET_NAME_CODENAME);
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
    node.workspace_codename = widget.value;
    if (DEBUG) console.log("(", node.id, ",", node.type, ")   - node.workspace_codename: ", node.workspace_codename);

    refreshWorkspaceData(node);

    node.setDirtyCanvas(true, false);
}

const refreshWorkspaceData = async function (node) {
    const workspace_codename = node.workspace_codename;

    if (workspace_codename === undefined) return;

    // load json and update node inputs
    const url = `/comfyui_user_workspaces/get_workspace?workspace_codename=${encodeURIComponent(workspace_codename)}`
    const response = await fetch(url);
    const response_json = await response.json();
    let workspace = response_json.workspace;

    let hashstr = "";
    if (workspace) {
        workspace = Object.keys(workspace).sort().reduce((obj, key) => {
            obj[key] = workspace[key];
            return obj;
        }, {});
        const str = JSON.stringify(workspace);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        hashstr = hash.toString(16);
    }

    let w;
    w = node.widgets.find(w => w.name === "workspace_hash");
    w.value = hashstr;

    if (workspace && node.type === "fot_Workspace") {
        w = node.widgets.find(w => w.name === "width");
        w.value = workspace["width"];

        w = node.widgets.find(w => w.name === "height");
        w.value = workspace["height"];

        node.setDirtyCanvas(true, false);
    }
}

const refreshDownstreamConsumers = async function (app, node) {
    // find downstream workspace consumers and trigger their refreshFolders
    const fullNode = app.graph.getNodeById(node.id);
    const downstreams = await findDownstreamNodes(app, fullNode);

    for (var downstream of downstreams) {
        // console.log("workspace consumer ", downstream.type, "?", is_workspace_consumer(app, downstream.type));
        if (is_workspace_consumer(app, downstream.type)) {
            downstream.workspace_codename = node.workspace_codename;
            if (downstream.onWorkspaceCodenameUpdated) {
                if (DEBUG) console.log("refresh workspace consumer: ", downstream.type);
                await downstream.onWorkspaceCodenameUpdated(downstream);
            }
            else {
                if (DEBUG) console.log("no onWorkspaceCodenameUpdated: ", downstream);
            }
        }
    }
}

const addFolder = async function (app, node, workspace_codename, folder_name) {
    try {
        if (DEBUG) console.log("addFolder:");
        if (DEBUG) console.log("  - workspace = ", workspace_codename);
        if (DEBUG) console.log("  - folder = ", folder_name);
        const url = `/comfyui_user_workspaces/add_folder?workspace_codename=${encodeURIComponent(workspace_codename)}&folder_name=${folder_name}`
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();

        if (response.ok) {
            if (DEBUG) console.log("addFolder: will update folders");
            await refreshFolders(app, node);
            if (DEBUG) console.log("addFolder: will select folder: ", folder_name);
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

const refreshFolders = async function (app, node) {
    // console.log("refreshFolders, node: ", node.id);
    // Find the folder widget and change it to dropdown
    const folderWidget = node.widgets.find(w => w.name === WIDGET_NAME_FOLDER);
    if (folderWidget && folderWidget.type !== "combo") {
        // Convert string input to dropdown
        folderWidget.type = "combo";
        folderWidget.options.values = [];
    }

    const workspace_codename = node.workspace_codename;
    if (workspace_codename == undefined) {
        // console.log("(", node.id, ") update folders, node.workspace_codename is not set!");
        return;
    }

    try {
        const url = `/comfyui_user_workspaces/get_folders?workspace_codename=${encodeURIComponent(workspace_codename)}`
        const response = await fetch(url);
        const data = await response.json();

        if (response.ok) {
            const widget = node.widgets.find(w => w.name === WIDGET_NAME_FOLDER);
            if (widget) {
                const currentValue = widget.value;
                widget.options.values = data.folders.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
                // console.log("(", node.id, ") got folders: ", data.folders)
                selectFolder(node, currentValue);
                node.setDirtyCanvas(true, false);
            }
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

const DEBUG = false;

const setup_node = async function (app, node) {
    if (node.type === "fot_Workspace" || node.type === "fot_WorkspaceReadOnly") {
        if (!node.widgets) return;

        const codename_widget = node.widgets.find(w => w.name === WIDGET_NAME_CODENAME);
        const codename_widget_callback = codename_widget.callback;
        codename_widget.callback = async function (value) {
            let codename_widget_callback_result;
            if (codename_widget_callback) {
                codename_widget_callback_result = codename_widget_callback.apply(this, arguments);
            }
            if (DEBUG) console.log("workspace selected: ", value);
            const workspace_codename = value;

            node.workspace_codename = workspace_codename;

            refreshWorkspaceData(node);
            refreshDownstreamConsumers(app, node);

            return codename_widget_callback_result;
        };

        const fullNode = app.graph.getNodeById(node.id);
        // console.log("WHERE IS MY workspace INPUT LISTENER? fullNode = ", fullNode);
        const workspace_widget = node.widgets.find(w => w.name === WIDGET_NAME_CODENAME);
        const workspace_widget_callback = workspace_widget.callback;
        workspace_widget.callback = async function (value) {
            let workspace_widget_callback_result;
            if (workspace_widget_callback) {
                workspace_widget_callback_result = workspace_widget_callback.apply(this, arguments);
            }
            const workspace_codename = value;
            if (DEBUG) console.log("workspace_codename = ", workspace_codename);

            node.workspace_codename = workspace_codename;

            refreshWorkspaceData(node);
            if (DEBUG) console.log("(", node.type, ") workspace selected, refreshing downstream consumers");
            refreshDownstreamConsumers(app, node);

            node.setDirtyCanvas(true, false);

            return workspace_widget_callback_result;
        };

        // initialize workspace_codename
        // console.log("(", node.id, ") setup_node workspace node = ", node);
        if (node.widgets_values && node.widgets_values.length > 0) {
            node.workspace_codename = node.widgets_values[0];
            // console.log("(", node.id, ") setup_node workspace_codename = ", node.workspace_codename);
        }

        if (DEBUG) console.log("(", node.type, ") node setup, refreshing downstream consumers");
        refreshDownstreamConsumers(app, node);
    }

    if (node.type === "fot_Folder") {
        await refreshFolders(app, node);

        if (!node.widgets) return;

        const folder_widget = node.widgets.find(w => w.name === WIDGET_NAME_FOLDER);
        if (!folder_widget.callback) return;

        const original_widget_callback = folder_widget.callback;
        folder_widget.callback = async function (value) {
            let original_widget_callback_result;
            if (original_widget_callback) {
                original_widget_callback_result = original_widget_callback.apply(this, arguments);
            }
            node.setDirtyCanvas(true, false);

            return original_widget_callback_result;
        };

    }
};

// let nodes_ui_features = null;
let nodes_ui_features_graph_setup = false;
app.registerExtension({
    name: "comyui_fot_common.nodes_ui_features",

    extract_node_ui_features(nodeSpecs) {
        if (nodeSpecs.input === undefined || nodeSpecs.input === null) return;
        if (nodeSpecs.input.hidden === undefined || nodeSpecs.input.hidden === null) return;
        const ui_features = nodeSpecs.input.hidden.ui_features;
        if (nodeSpecs.input === undefined || nodeSpecs.input === null) return;
        if (!ui_features) return;
        if (DEBUG) console.log("extract_node_ui_features: ", nodeSpecs.name);
        const ui_features_settings = ui_features[1];
        if (ui_features_settings === undefined || ui_features_settings === null) return;
        const list_str = ui_features_settings['default'];
        if (list_str === undefined || list_str === null) return;
        const list = JSON.parse(list_str);
        if (DEBUG) console.log("ui_features for ", nodeSpecs.name, ":", list);

        return list;
    },

    async beforeRegisterNodeDef(nodeType, nodeSpecs, app) {
        // Log entry to this method    
        const list = this.extract_node_ui_features(nodeSpecs, app);

        // Log the result of feature extraction
        if (list === undefined) {
            return;
        }
        if (DEBUG) console.log(`🔵 beforeRegisterNodeDef features found for "${nodeSpecs.name}":`, list);

        if (DEBUG) console.log("== ", nodeSpecs.name, ":ui_features = ", list);

        if (window.fot_ui_features === undefined) {
            window.fot_ui_features = {};
        }
        window.fot_ui_features[nodeSpecs.name] = list;
        if (DEBUG) console.log("updated window.fot_ui_features: ", window.fot_ui_features);
    }
});

// comyui_fot_common.is_workspace_consumer
app.registerExtension({
    name: "comyui_fot_common.is_workspace_consumer",

    async beforeRegisterNodeDef(nodeType, nodeSpecs, app) {
        if (!is_workspace_consumer(app, nodeSpecs.name)) return;
        const DEBUG = false;
        if (DEBUG) console.log("register extension ", this.name, "for", nodeSpecs.name);

        const onConnectInput = nodeType.prototype.onConnectInput;
        nodeType.prototype.onConnectInput = function (slot_index, link_type, link_info, output_info) {
            const orig_return = onConnectInput?.apply(this, arguments);
            if (DEBUG) console.log("onConnectInput: ", arguments);
            if (DEBUG) console.log("  > orig_return = ", orig_return);
            if (DEBUG) console.log("this: ", this);
            setTimeout(async () => {
                const fullNode = app.graph.getNodeById(this.id);
                if (DEBUG) console.log("fullNode: ", fullNode);
                const workspaceNode = await findUpstreamWorkspace(app, fullNode);
                if (DEBUG) console.log("workspaceNode: ", workspaceNode);
                if (workspaceNode) refreshDownstreamConsumers(app, workspaceNode);
            }, 500);
            return orig_return;
        };

        const disconnectInput = nodeType.prototype.disconnectInput;
        nodeType.prototype.disconnectInput = function (slot, keepReroutes) {
            if (DEBUG) console.log("disconnectInput: ", arguments);

            return disconnectInput?.apply(this, arguments);
        };
    }
});

let workspaces_singleton = null;
app.registerExtension({
    name: "comyui_user_workspaces.workspaces_singleton",

    async beforeRegisterNodeDef(nodeType, node, app) {
        if (workspaces_singleton) return;
        const DEBUG = false;
        if (DEBUG) console.log("register extension ", this.name);
        workspaces_singleton = this;

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

                setup_node(app, node);

                return original_onNodeAdded_result;
            };

            // setup existing nodes
            // console.log("##### setup existing nodes: ", graph);
            for (var i = 0, l = graph.nodes.length; i < l; i++) {
                var node = graph.nodes[i];
                if (!NODE_TYPES_MINE.includes(node.type)) continue;
                const fullNode = app.graph.getNodeById(node.id);
                // console.log("====> setup existing node: ", fullNode);
                setup_node(app, fullNode);
            }

            return original_app_graph_configure_result;
        };
    }
});

// comyui_user_workspaces.fot_Folder
app.registerExtension({
    name: "comyui_user_workspaces.fot_Folder",

    async beforeRegisterNodeDef(nodeType, nodeSpecs, app) {
        if (nodeSpecs.name !== "fot_Folder") return;
        const DEBUG = false;
        if (DEBUG) console.log("register extension ", this.name);

        nodeSpecs.input.required.folder = [[]]

        const onWorkspaceCodenameUpdated = nodeType.prototype.onWorkspaceCodenameUpdated;
        nodeType.prototype.onWorkspaceCodenameUpdated = async (node) => {
            onWorkspaceCodenameUpdated?.apply(this, arguments);
            if (DEBUG) console.log(node.name, "onWorkspaceCodenameUpdated refreshFolders");
            await refreshFolders(app, node);
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const node = this;

            this.addCustomWidget({
                name: "+ Add Folder",
                title: "+ Add Folder",
                type: "button",
                callback: () => {
                    if (node.workspace_codename) {
                        // this.showAddFolderDialog();
                        const folderName = prompt("New folder:");
                        addFolder(app, node, node.workspace_codename, folderName)
                    }
                },
            });

            this.addCustomWidget({
                name: "⟳ Refresh",
                title: "⟳ Refresh",
                type: "button",
                callback: async () => {
                    await refreshFolders(app, node);
                },
            });

            if (onNodeCreated) onNodeCreated.apply(this, arguments);
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = async function (node) {
            // Find the folder widget and change it to dropdown
            const folderWidget = this.widgets.find(w => w.name === WIDGET_NAME_FOLDER);
            if (folderWidget && folderWidget.type !== "combo") {
                if (DEBUG) console.log(" - changing to combo list", folderWidget);
                folderWidget.type = "combo";
                // folderWidget.options.values = []; // Will be populated dynamically on configure
                folderWidget.options.values = ["Loading..."];
                folderWidget.value = "Loading...";
                this.inputs[1].type = "COMBO";
            }
        };
    }
});

// comyui_user_workspaces.fot_Workspace
app.registerExtension({
    name: "comyui_user_workspaces.fot_Workspace",

    async beforeRegisterNodeDef(nodeType, nodeSpecs, app) {
        if (!nodeSpecs.name.startsWith("fot_Workspace")) return;
        const DEBUG = false;
        if (DEBUG) console.log("register extension ", this.name, "for", nodeSpecs.name);

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const node = this;
            if (DEBUG) console.log("(", node.id, " : ", node.type, ") onNodeCreated, , this = ", this);

            if (nodeSpecs.name === "fot_Workspace") {
                this.addCustomWidget({
                    name: "+ Add Workspace",
                    title: "+ Add Workspace",
                    type: "button",
                    callback: async () => {
                        // this.showAddFolderDialog();
                        const workspace_codename = prompt("New workspace:");
                        addWorkspace(node, workspace_codename);
                        await selectWorkspace(node, workspace_codename);
                    },
                });
            }
            this.addCustomWidget({
                name: "⟳ Refresh Workspaces",
                title: "⟳ Refresh Workspaces",
                type: "button",
                callback: async () => {
                    await refreshWorkspaces(node);
                },
            });

            const w = this.widgets.find(w => w.name === "workspace_hash");
            if (DEBUG) console.log("(", node.id, " : ", node.type, ") - workspace_hash = ", w);
            if (w) w.hidden = true;

            refreshWorkspaces(node);

            let onNodeCreated_return;
            if (onNodeCreated) onNodeCreated_return = onNodeCreated.apply(this, arguments);
            return onNodeCreated_return;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = async function (node) {
            if (onConfigure) onConfigure.apply(this, arguments);
            if (DEBUG) console.log("(", node.id, " : ", node.type, ") onConfigure");

            // refreshWorkspaceData(this);

            // this.setDirtyCanvas(true, false);
        };

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = async function (result) {
            // console.log("fot_Workspace* onExecuted: ", this.id, result);

            // console.log("(", nodeSpecs.id, ") onExecuted: will update folders");
            await refreshFolders(app, this);

            onExecuted?.apply(this, arguments);
        };
    }

});
