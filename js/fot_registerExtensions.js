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
        console.log("addWorkspace:");
        console.log("  - workspace = ", workspace_codename);
        const url = `/comfyui_user_workspaces/add_workspace?workspace_codename=${encodeURIComponent(workspace_codename)}`
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();

        if (response.ok) {
            console.log("addWorkspace: will update workspaces");
            await refreshWorkspaces(node);
            console.log("addWorkspace: will select workspace: ", workspace_codename);
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
    console.log("(", node.id, ") will select workspace: ", workspace_codename);
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
    console.log("(", node.id, ")   - node.workspace_codename: ", node.workspace_codename);

    refreshWorkspaceData(node);

    node.setDirtyCanvas(true, false);
}

const refreshWorkspaceData = async function (node) {
    const workspace_codename = node.workspace_codename;

    if (!workspace_codename) {
        console.log("==> workspace_codename = ", workspace_codename);
    }

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
        console.log("workspace consumer ", downstream.type, "?", is_workspace_consumer(app, downstream.type));
        if (is_workspace_consumer(app, downstream.type)) {
            downstream.workspace_codename = node.workspace_codename;
            if (downstream.onWorkspaceUpdated) {
                console.log("refresh workspace consumer: ", downstream.type);
                await downstream.onWorkspaceUpdated(downstream);
            }
            else {
                console.log("no onWorkspaceUpdated: ", downstream);
            }
        }
    }
}

const addFolder = async function (app, node, workspace_codename, folder_name) {
    try {
        console.log("addFolder:");
        console.log("  - workspace = ", workspace_codename);
        console.log("  - folder = ", folder_name);
        const url = `/comfyui_user_workspaces/add_folder?workspace_codename=${encodeURIComponent(workspace_codename)}&folder_name=${folder_name}`
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();

        if (response.ok) {
            console.log("addFolder: will update folders");
            await refreshFolders(app, node);
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
            console.log("workspace selected: ", value);
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
            console.log("workspace_codename = ", workspace_codename);

            node.workspace_codename = workspace_codename;

            refreshWorkspaceData(node);
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

    setup_node_ui_features(nodeSpecs, app) {
        const DEBUG = false;
        if (DEBUG) console.log("setup_node_ui_features");

        if (nodeSpecs.input === undefined || nodeSpecs.input === null) return;
        if (nodeSpecs.input.hidden === undefined || nodeSpecs.input.hidden === null) return;
        const ui_features = nodeSpecs.input.hidden.ui_features;
        if (nodeSpecs.input === undefined || nodeSpecs.input === null) return;
        if (! ui_features) return;
        const ui_features_settings = ui_features[1];
        if (ui_features_settings === undefined || ui_features_settings === null) return;
        const list_str = ui_features_settings['default'];
        if (list_str === undefined || list_str === null) return;
        const list = JSON.parse(list_str);
        if (DEBUG) console.log("ui_features for ",nodeSpecs.name,":",list);

        if (app.ui_features === undefined) {
            app.ui_features = {};
        }
        app.ui_features[nodeSpecs.name] = list
    },

    async beforeRegisterNodeDef(nodeType, nodeSpecs, app) {
        const DEBUG = false;
        this.setup_node_ui_features(nodeSpecs, app);

        if (nodes_ui_features_graph_setup === false) {
            nodes_ui_features_graph_setup = true;
            const original_app_graph_configure = app.graph.configure;
            app.graph.configure = function (graph) {
                let original_app_graph_configure_result;
                // if (DEBUG) console.log("##### app.graph.configure: ", arguments);
                if (original_app_graph_configure) {
                    original_app_graph_configure_result = original_app_graph_configure.apply(this, arguments);
                }

                // const original_onNodeAdded = this.onNodeAdded;
                // this.onNodeAdded = function (node) {
                //     let original_onNodeAdded_result;
                //     if (original_onNodeAdded) {
                //         original_onNodeAdded_result = original_onNodeAdded.apply(this, arguments);
                //     }
                //     if (DEBUG) console.log("====> graph.onNodeAdded");
                //     if (DEBUG) console.log("  ==  node = ", node.id, "=", node.type);
                //     const ui_features = app.ui_features[node.type];
                //     if (ui_features === undefined) return original_onNodeAdded_result;
                //     if (DEBUG) console.log("====> ", node.id, ", ", node.type, "=", ui_features);

                //     return original_onNodeAdded_result;
                // };

                if (DEBUG) console.log("##### checking existing nodes");
                for (var i = 0, l = graph.nodes.length; i < l; i++) {
                    var node = graph.nodes[i];
                    const ui_features = app.ui_features[node.type];
                    if (ui_features === undefined) continue;
                    if (DEBUG) console.log("====> ", node.id, ", ", node.type, "=", ui_features);
                }

                return original_app_graph_configure_result;
            };
        }
    }
});

// // comyui_fot_common.workspace_chainlink
// app.registerExtension({
//     name: "comyui_fot_common.workspace_chainlink",

//     async beforeRegisterNodeDef(nodeType, nodeSpecs, app) {
//         if (!is_workspace_consumer(app, nodeSpecs.name)
//         ||  !is_workspace_producer(app, nodeSpecs.name)
//         ) return;
//         const DEBUG = false;
//         // TODO validate node input and output requirements
//         // the workspace_chainlink feature requires:
//         // - the node must have one visible input and one visible output named "workspace"
//         if (DEBUG) console.log("register extension ", this.name, "for", nodeSpecs.name);
//     }
// });

// comyui_fot_common.is_workspace_consumer
app.registerExtension({
    name: "comyui_fot_common.is_workspace_consumer",

    async beforeRegisterNodeDef(nodeType, nodeSpecs, app) {
        if (!is_workspace_consumer(app, nodeSpecs.name)) return;
        const DEBUG = true;
        if (DEBUG) console.log("register extension ", this.name, "for", nodeSpecs.name);

        // this.onWorkspaceUpdated

        const onConnectInput = nodeType.prototype.onConnectInput;
        nodeType.prototype.onConnectInput = function(slot_index, link_type, link_info, output_info) {            
            const orig_return = onConnectInput?.apply(this, arguments);
            if (DEBUG) console.log("onConnectInput: ", arguments);
            if (DEBUG) console.log("  > orig_return = ", orig_return);
            if (DEBUG) console.log("this: ", this);
            setTimeout( async () => {
                const fullNode = app.graph.getNodeById(this.id);
                if (DEBUG) console.log("fullNode: ", fullNode);
                const workspaceNode = await findUpstreamWorkspace(app, fullNode);
                if (DEBUG) console.log("workspaceNode: ", workspaceNode);
                if (workspaceNode) refreshDownstreamConsumers(app, workspaceNode);
            }, 500);
            return orig_return;
        };
    
        const disconnectInput = nodeType.prototype.disconnectInput;
        nodeType.prototype.disconnectInput = function(slot, keepReroutes) {
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
        const DEBUG = true;
        if (DEBUG) console.log("register extension ", this.name);

        nodeSpecs.input.required.folder = [[]]

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        const onExecuted = nodeType.prototype.onExecuted;
        const onConfigure = nodeType.prototype.onConfigure;

        nodeType.prototype.onNodeCreated = function () {
            if (DEBUG) console.log("onNodeCreated: ", this.id, this);
            const node = this;
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

            if (DEBUG) console.log("(", this.id, " : ",this.type,") onConfigure: will set node.onWorkspaceUpdated");
            // const fullNode = app.graph.getNodeById(node.id);
            this.onWorkspaceUpdated = async (node) => {
                await refreshFolders(app, node);
            }

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

        // nodeType.prototype.onConfigure = async function (node) {
        //     if (DEBUG) console.log("onConfigure: ", this.id);
        //     // console.log(" - this: ", this);
        //     // console.log(" - node: ", node);


        //     onConfigure?.apply(this, arguments);
        // };

        nodeType.prototype.onExecuted = async function (result) {
            // console.log("fot_Folder:onExecuted: ", this.id, result);

            // if (DEBUG) console.log("(", this.id, ") onExecuted: will update folders");
            // await refreshFolders(app, this);

            onExecuted?.apply(this, arguments);
        };

    }
});

// comyui_user_workspaces.fot_Workspace
app.registerExtension({
    name: "comyui_user_workspaces.fot_Workspace",

    async beforeRegisterNodeDef(nodeType, nodeSpecs, app) {
        if (!nodeSpecs.name.startsWith("fot_Workspace")) return;
        const DEBUG = true;
        if (DEBUG) console.log("register extension ", this.name, "for", nodeSpecs.name);

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const node = this;
            if (DEBUG) console.log("(", node.id, " : ",node.type,") onNodeCreated, , this = ", this);

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
            if (DEBUG) console.log("(", node.id, " : ",node.type,") - workspace_hash = ", w);
            if (w) w.hidden = true;

            refreshWorkspaces(node);

            let onNodeCreated_return;
            if (onNodeCreated) onNodeCreated_return = onNodeCreated.apply(this, arguments);
            return onNodeCreated_return;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = async function (node) {
            if (onConfigure) onConfigure.apply(this, arguments);
            if (DEBUG) console.log("(", node.id, " : ",node.type,") onConfigure");

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
