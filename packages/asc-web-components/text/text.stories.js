import React from "react";
import Text from "./";

const textTags = ["p", "span", "div"];

export default {
  title: "Components/Text",
  component: Text,
  parameters: {
    docs: {
      description: {
        component: "Component that displays plain text",
      },
    },
  },
  argTypes: {
    color: { control: "color" },
    backgroundColor: { control: "color" },
    exampleText: { control: "text" },
  },
};

const Template = ({ exampleText, ...args }) => {
  return (
    <div style={{ width: "100%" }}>
      <Text {...args}>{exampleText}</Text>
    </div>
  );
};

export const Default = Template.bind({});
Default.args = {
  title: "",
  as: "p",
  fontSize: "13px",
  fontWeight: "400",
  truncate: false,
  color: "#333333",
  backgroundColor: "",
  isBold: false,
  isItalic: false,
  isInline: false,
  exampleText: "Sample text",
};
