import React, { useState } from "react";
import PropTypes from "prop-types";
import Text from "../text";
import Link from "../link";
import globalColors from "../utils/globalColors";
import { StyledTableHeaderCell } from "./StyledTableContainer";

const TableHeaderCell = ({ column, index, onMouseDown, resizable }) => {
  const [sorted, setSorted] = useState(column.sorted);

  const { options, title, enable } = column;

  const onClick = (e) => {
    column.onClick(sorted, e);
    setSorted(!sorted);
  };

  return (
    <StyledTableHeaderCell
      sorted={sorted}
      className="table-container_header-cell"
      id={`column_${index + 1}`}
      data-enable={enable}
    >
      <div className="table-container_header-item">
        {column.onClick ? (
          <div onClick={onClick} className="header-container-text-wrapper">
            <Link
              fontWeight={600}
              color={globalColors.gray}
              className="header-container-text"
              data={options}
              noHover
            >
              {title}
            </Link>
            <img
              className="header-container-text-icon"
              src="/static/images/folder arrow.react.svg"
            />
          </div>
        ) : (
          <Text
            fontWeight={600}
            color={globalColors.gray}
            className="header-container-text"
          >
            {title}
          </Text>
        )}
        {resizable && (
          <div
            data-column={`${index + 1}`}
            className="resize-handle not-selectable"
            onMouseDown={onMouseDown}
          />
        )}
      </div>
    </StyledTableHeaderCell>
  );
};

TableHeaderCell.propTypes = {
  column: PropTypes.object,
  index: PropTypes.number,
  onMouseDown: PropTypes.func,
  resizable: PropTypes.bool,
};

export default TableHeaderCell;