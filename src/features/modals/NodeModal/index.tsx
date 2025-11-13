import React from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Button, Group, Textarea } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useJson from "../../../store/useJson";
import useFile from "../../../store/useFile";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const setJson = useJson(state => state.setJson);

  const [editMode, setEditMode] = React.useState(false);
  const [editValue, setEditValue] = React.useState("");
  const [editError, setEditError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setEditError(null);
    setEditMode(false);
    setEditValue("");
  }, [opened, nodeData]);

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <Group gap="xs">
              {!editMode && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    setEditMode(true);
                    setEditValue(normalizeNodeData(nodeData?.text ?? []));
                  }}
                >
                  Edit
                </Button>
              )}
              <CloseButton onClick={onClose} />
            </Group>
          </Flex>
          <ScrollArea.Autosize mah={250} maw={600}>
            {!editMode ? (
              <CodeHighlight
                code={normalizeNodeData(nodeData?.text ?? [])}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            ) : (
              <Textarea
                minRows={6}
                maxRows={20}
                value={editValue}
                onChange={e => setEditValue(e.currentTarget.value)}
                autosize
              />
            )}
          </ScrollArea.Autosize>
          {editMode && (
            <Group gap="xs" justify="right" mt="xs">
              <Button
                size="xs"
                variant="subtle"
                onClick={() => {
                  setEditMode(false);
                  setEditError(null);
                  setEditValue("");
                }}
              >
                Cancel
              </Button>
              <Button
                size="xs"
                onClick={() => {
                  // Attempt to parse edited content. If node represents object/array require valid JSON.
                  const hasComplex = nodeData?.text?.some(t => t.type === "object" || t.type === "array");
                  let parsedValue: any;
                  try {
                    parsedValue = JSON.parse(editValue);
                  } catch (err) {
                    if (hasComplex) {
                      setEditError("Invalid JSON for object/array");
                      return;
                    }
                    // fallback to raw string for simple scalar edits
                    parsedValue = editValue;
                  }

                  try {
                    const currentJson = useJson.getState().getJson();
                    const root = JSON.parse(currentJson);

                    const getValueAtPath = (obj: any, path: NodeData["path"] | undefined) => {
                      if (!path || path.length === 0) return obj;
                      let cur = obj;
                      for (let i = 0; i < path.length; i++) {
                        const key = path[i] as any;
                        if (cur == null) return undefined;
                        cur = cur[key];
                      }
                      return cur;
                    };

                    const setValueAtPath = (obj: any, path: NodeData["path"] | undefined, value: any) => {
                      if (!path || path.length === 0) return value;
                      let cur = obj;
                      for (let i = 0; i < path.length - 1; i++) {
                        const key = path[i] as any;
                        if (typeof key === "number") {
                          if (!Array.isArray(cur[key])) cur[key] = [];
                          cur = cur[key];
                        } else {
                          if (typeof cur[key] !== "object" || cur[key] === null) cur[key] = {};
                          cur = cur[key];
                        }
                      }
                      const last = path[path.length - 1] as any;
                      cur[last] = value;
                      return obj;
                    };

                    // If the node has nested object/array children, prefer merging primitive edits
                    // into the existing object to preserve nested details instead of replacing entire node.
                    const originalAtPath = getValueAtPath(root, nodeData?.path);
                    let newRoot;

                    const isObject = (v: any) => v && typeof v === "object" && !Array.isArray(v);

                    if (isObject(originalAtPath) && isObject(parsedValue)) {
                      // merge primitives from parsedValue into original object (shallow)
                      Object.keys(parsedValue).forEach(k => {
                        originalAtPath[k] = parsedValue[k];
                      });
                      newRoot = root;
                    } else {
                      newRoot = setValueAtPath(root, nodeData?.path, parsedValue);
                    }

                    const newJson = JSON.stringify(newRoot, null, 2);

                    // Update both the graph view and text editor
                    setJson(newJson);
                    useFile.getState().setContents({
                      contents: newJson,
                      hasChanges: true,
                      skipUpdate: false, // Allow live update
                    });

                    setEditMode(false);
                    setEditError(null);
                    onClose();
                  } catch (e) {
                    setEditError("Failed to apply change to document");
                  }
                }}
              >
                Save
              </Button>
            </Group>
          )}
          {editError && <Text color="red" fz="xs">{editError}</Text>}
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};
