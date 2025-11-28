
export const is_workspace_consumer = function (app, node_type) {
    try {
        return window.fot_ui_features && window.fot_ui_features[node_type]
        && "is_workspace_consumer" in window.fot_ui_features[node_type];
    }
    catch (e) {
        console.log("error: ", e);
    }
}

export const is_workspace_producer = function (app, node_type) {
    try {
        return window.fot_ui_features && window.fot_ui_features[node_type] && "is_workspace_producer" in window.fot_ui_features[node_type];
    }
    catch (e) {
        console.log("error: ", e);
    }
}

export const findUpstreamWorkspace = async function (app, node) {
    const DEBUG = false;
    if (DEBUG) console.log("[", node.id, "] findUpstreamWorkspace:");
    if (DEBUG) console.log("[", node.id, "]   - node: ", node);
    
    if (node.graph == undefined || node.graph == null) {
        if (DEBUG) console.log("[", node.id, "]   - graph is not yet defined");
        return null;
    }

    const slotIndex = node.findInputSlot("workspace");
    if (slotIndex == -1) {
        if (DEBUG) console.log("[", node.id, "]   > no workspace input slot");
        return node;
    }
    else {
        if (DEBUG) console.log("[", node.id, "]   > workspace input slot: ", slotIndex);
    }

    // if (DEBUG) console.log("[", node.id, "]   > workspace links to ", inputLink.origin_id);
    const upstreamNodeIdOrNode = node.getInputNode(slotIndex);
    if (DEBUG) console.log("[", node.id, "]   > getInputNode: ", upstreamNodeIdOrNode);
    let upstreamNode;
    if (upstreamNodeIdOrNode) {
        if (typeof upstreamNodeIdOrNode === "number") {
            upstreamNode = node.graph.getNodeById(upstreamNodeIdOrNode);
        }
        else {
            upstreamNode = upstreamNodeIdOrNode;
        }
    }
    else {
        // try the link route
        const inputLink = node.getInputLink(slotIndex);
    if (DEBUG) console.log("[", node.id, "]   > inputLink: ", inputLink);
        if (!inputLink) {
            if (DEBUG) console.log("[", node.id, "]   > workspace input slot not connected (no input link)");
            // if workspace?
            return node;
        }
        else {
            upstreamNode = node.graph.getNodeById(inputLink.origin_id);
            if (upstreamNode === undefined) {
                if (DEBUG) console.log("[", node.id, "]   > workspace input slot not connected (no upstream node)");
                // if workspace?
                return node;
            }
        }
    }
    if (DEBUG) console.log("[", node.id, "]   > upstreamNode: ", upstreamNode);

    if (upstreamNode.type === "Reroute") {
        if (DEBUG) console.log("[", node.id, "]   > upstream node (", upstreamNode.id, ") is a reroute: ", upstreamNode);
        const upstreamSlotIndex = upstreamNode.findInputSlot("");
        if (upstreamSlotIndex !== -1) {
            if (DEBUG) console.log("[", node.id, "]   > upstream reroute node (", upstreamNode.id, ") has an '' input slot (", upstreamSlotIndex, ")");
            const nextUpstreamNodeIdOrNode = upstreamNode.getInputNode(upstreamSlotIndex);
            if (DEBUG) console.log("[", node.id, "]   > upstream reroute node (", upstreamNode.id, ") '' input node: ", nextUpstreamNodeIdOrNode);
            if (nextUpstreamNodeIdOrNode) {
                let nextUpstreamNode;
                if (typeof nextUpstreamNodeIdOrNode === "number") {
                    nextUpstreamNode = node.graph.getNodeById(nextUpstreamNodeIdOrNode);
                }
                else {
                    nextUpstreamNode = nextUpstreamNodeIdOrNode;
                }
                if (DEBUG) console.log("[", node.id, "]   > recursing upstream to ", nextUpstreamNode.id);
                return findUpstreamWorkspace(app, nextUpstreamNode);
            }
            else {
                if (DEBUG) console.log("[", node.id, "]   > upstream reroute node (", upstreamNode.id, ") is not linked");
                return null;
            }
        }
        else {
            if (DEBUG) console.log("[", node.id, "]   > upstream reroute node (", upstreamNode.id, ") has no '' input slot");
            return null;
        }
    }

    if (window.fot_ui_features
        && window.fot_ui_features[upstreamNode.type]
        && "is_workspace_producer" in window.fot_ui_features[upstreamNode.type]
    ) {
        if (DEBUG) console.log("[", node.id, "]   > ", upstreamNode.id, " is a is_workspace_producer, recursing");
        return findUpstreamWorkspace(app, upstreamNode);
    }

    if (upstreamNode.type.startsWith("fot_Workspace")) {
        if (DEBUG) console.log("[", node.id, "]   > ", upstreamNode.id, " is a fot_Workspace*");
        const upstreamSlotIndex = upstreamNode.findInputSlot("workspace");
        if (upstreamSlotIndex !== -1) {
            const upstreamInputLink = upstreamNode.getInputLink(upstreamSlotIndex);
            if (upstreamInputLink) {
                if (DEBUG) console.log("[", node.id, "]   > workspace is linked, recursing to ", upstreamNode.id);
                return findUpstreamWorkspace(app, upstreamNode);
            }
            if (DEBUG) console.log("[", node.id, "]   > workspace is not linked");
        }
        else {
            if (DEBUG) console.log("[", node.id, "]   > no workspace input slot for ", upstreamNode.id);
        }

        return upstreamNode;
    }

    console.log("window.fot_ui_features[node.type] = ", window.fot_ui_features[node.type]);

    throw new Error("Unexpected, workspace is not a fot_Workspace* or a Reroute! it is a " + upstreamNode.type);
};

export const findDownstreamNodes = async function (app, node) {
    const DEBUG = false;
    if (DEBUG) console.log("[", node.id, "] findDownstreamNodes:");
    if (DEBUG) console.log("[", node.id, "]   - node: ", node);

    let outputNodes;
    if (node.type === "Reroute") {
        if (DEBUG) console.log("[", node.id, "]   > node is a reroute");
        outputNodes = node.getOutputNodes(0);
        if (DEBUG) console.log("[", node.id, "]   > output nodes = ", outputNodes);
    }
    else {
        const slotIndex = node.findOutputSlot("workspace");
        if (slotIndex == -1) {
            return [];
        }
        outputNodes = node.getOutputNodes(slotIndex);
        // console.log(" - outputNodes = ", outputNodes);
    }

    if (outputNodes === null) {
        return [];
    }

    const consumers = outputNodes.filter((node) => is_workspace_consumer(app, node.type) || node.type === "Reroute");
    if (DEBUG) console.log(" - consumers = ", consumers);

    let downstreamNodes = []
    for (const node of consumers) {
        const downstreams = await findDownstreamNodes(app, node);
        downstreamNodes = downstreamNodes.concat([node]).concat(downstreams);
    }

    if (DEBUG) console.log(" - downstream nodes = ", downstreamNodes);
    return downstreamNodes;
};

export const updateWorkspaceCodename = async function (app, node) {
    // console.log("refreshPoses, findUpstreamWorkspace: ", node.id);
    let upstreamNode = await findUpstreamWorkspace(app, node);

    let workspace_codename = undefined;
    // console.log(" - upstreamNode: ", upstreamNode);
    // if (upstreamNode != null) console.log(" - upstreamNode.workspace_codename: ", upstreamNode.workspace_codename);
    if (upstreamNode != null && upstreamNode.workspace_codename) {
        workspace_codename = upstreamNode.workspace_codename;
    }

    // console.log("(", node.id, ") refreshCharacters, workspace_codename: ", workspace_codename);
    node.workspace_codename = workspace_codename;
    if (workspace_codename == undefined) {
        return;
    }
    return workspace_codename;
}
