import styled, { css } from "styled-components";
import NoUserSelect from "@appserver/components/utils/commonStyles";
import commonTextStyles from "../text/common-text-styles";
import Base from "../themes/base";

const fontSizeStyle = (props) => props.theme.heading.fontSize[props.size];

const styleCss = css`
  font-size: ${(props) => fontSizeStyle(props)};
  font-weight: ${(props) => props.theme.heading.fontWeight};

  ${(props) =>
    props.isInline &&
    css`
      display: inline-block;
    `}
`;

const StyledHeading = styled.h1`
  ${styleCss};

  ${commonTextStyles};

  ${NoUserSelect};
`;

StyledHeading.defaultProps = { theme: Base };

export default StyledHeading;
