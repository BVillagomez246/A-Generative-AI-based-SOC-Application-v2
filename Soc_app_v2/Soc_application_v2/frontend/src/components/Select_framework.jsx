import { Portal, Select, createListCollection } from "@chakra-ui/react";

const MODELS = createListCollection({
  items: [
    { label: "Qwen3 VL 4B (vision)", value: "qwen/qwen3-vl-4b" },
    { label: "Qwen3.5 9B (text only)", value: "qwen/qwen3.5-9b" },
  ],
});

const SelectFramework = ({ value, onChange }) => {
  return (
    <Select.Root
      collection={MODELS}
      size="sm"
      width="320px"
      value={value ? [value] : []}
      onValueChange={(details) => onChange?.(details.value[0])}
    >
      <Select.HiddenSelect />

      <Select.Control>
        <Select.Trigger>
          <Select.ValueText placeholder="Select AI Model" />
        </Select.Trigger>

        <Select.IndicatorGroup>
          <Select.Indicator />
        </Select.IndicatorGroup>
      </Select.Control>

      <Portal>
        <Select.Positioner>
          <Select.Content>
            {MODELS.items.map((model) => (
              <Select.Item item={model} key={model.value}>
                {model.label}
                <Select.ItemIndicator />
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  );
};

export default SelectFramework;
