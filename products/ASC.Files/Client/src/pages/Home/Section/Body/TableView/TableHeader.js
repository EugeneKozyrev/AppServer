import React from "react";
import TableHeader from "@appserver/components/table-container/TableHeader";
import TableGroupMenu from "@appserver/components/table-container/TableGroupMenu";
import { inject, observer } from "mobx-react";
import { withTranslation } from "react-i18next";
import { FilterType } from "@appserver/common/constants";
import DropDownItem from "@appserver/components/drop-down-item";

const TABLE_COLUMNS = "tableColumns";

class FilesTableHeader extends React.Component {
  constructor(props) {
    super(props);

    const { t, filter, withContent } = props;

    const defaultColumns = [
      {
        key: "Name",
        title: t("Common:Name"),
        resizable: true,
        enable: true,
        default: true,
        sorted: filter.sortOrder === "descending",
        onClick: this.onNameClick,
        onChange: this.onColumnChange,
      },
      {
        key: "Author",
        title: t("ByAuthor"),
        enable: true,
        resizable: true,
        onChange: this.onColumnChange,
      },
      {
        key: "Created",
        title: t("ByCreationDate"),
        enable: false,
        resizable: true,
        onChange: this.onColumnChange,
      },
      {
        key: "Modified",
        title: t("ByLastModifiedDate"),
        enable: true,
        resizable: true,
        onChange: this.onColumnChange,
      },
      {
        key: "Size",
        title: t("Common:Size"),
        enable: true,
        resizable: true,
        onChange: this.onColumnChange,
      },
      {
        key: "Type",
        title: t("Common:Type"),
        enable: false,
        resizable: true,
        onChange: this.onColumnChange,
      },
      {
        key: "Share",
        title: "",
        enable: withContent,
        default: true,
        resizable: false,
        onChange: this.onColumnChange,
      },
    ];

    const columns = this.getColumns(defaultColumns);

    this.state = { columns };
  }

  componentDidUpdate(prevProps) {
    const { columns } = this.state;
    if (this.props.withContent !== prevProps.withContent) {
      const columnIndex = columns.findIndex((c) => c.key === "Share");
      if (columnIndex === -1) return;

      columns[columnIndex].enable = this.props.withContent;
      this.setState({ columns });
    }
  }

  getColumns = (defaultColumns) => {
    const storageColumns = localStorage.getItem(TABLE_COLUMNS);
    const columns = [];

    if (storageColumns) {
      const splitColumns = storageColumns.split(",");

      for (let col of defaultColumns) {
        const column = splitColumns.find((key) => key === col.key);
        column ? (col.enable = true) : (col.enable = false);

        columns.push(col);
      }
      return columns;
    } else {
      return defaultColumns;
    }
  };

  onColumnChange = (e) => {
    const { columns } = this.state;
    const key = e.currentTarget.dataset.key;
    const columnIndex = columns.findIndex((c) => c.key === key);

    if (columnIndex === -1) return;

    columns[columnIndex].enable = !columns[columnIndex].enable;
    this.setState({ columns });

    const tableColumns = columns.map((c) => c.enable && c.key);
    localStorage.setItem(TABLE_COLUMNS, tableColumns);
  };

  onNameClick = (val) => {
    const { filter, selectedFolderId, setIsLoading, fetchFiles } = this.props;
    const newFilter = filter.clone();
    newFilter.sortOrder = val ? "ascending" : "descending";

    setIsLoading(true);
    fetchFiles(selectedFolderId, newFilter).finally(() => setIsLoading(false));
  };

  onChange = (checked) => {
    this.props.setSelected(checked ? "all" : "none");
  };

  onSelect = (e) => {
    const key = e.currentTarget.dataset.key;
    this.props.setSelected(key);
  };

  render() {
    const {
      t,
      containerRef,
      isHeaderVisible,
      isHeaderChecked,
      isHeaderIndeterminate,
      getHeaderMenu,
      setSelected,
    } = this.props;

    const { columns } = this.state;

    const checkboxOptions = (
      <>
        <DropDownItem label={t("All")} data-key="all" onClick={this.onSelect} />
        <DropDownItem
          label={t("Translations:Folders")}
          data-key={FilterType.FoldersOnly}
          onClick={this.onSelect}
        />
        <DropDownItem
          label={t("Common:Documents")}
          data-key={FilterType.DocumentsOnly}
          onClick={this.onSelect}
        />
        <DropDownItem
          label={t("Translations:Presentations")}
          data-key={FilterType.PresentationsOnly}
          onClick={this.onSelect}
        />
        <DropDownItem
          label={t("Translations:Spreadsheets")}
          data-key={FilterType.SpreadsheetsOnly}
          onClick={this.onSelect}
        />
        <DropDownItem
          label={t("Images")}
          data-key={FilterType.ImagesOnly}
          onClick={this.onSelect}
        />
        <DropDownItem
          label={t("Media")}
          data-key={FilterType.MediaOnly}
          onClick={this.onSelect}
        />
        <DropDownItem
          label={t("Archives")}
          data-key={FilterType.ArchiveOnly}
          onClick={this.onSelect}
        />
        <DropDownItem
          label={t("AllFiles")}
          data-key={FilterType.FilesOnly}
          onClick={this.onSelect}
        />
      </>
    );

    return isHeaderVisible ? (
      <TableGroupMenu
        checkboxOptions={checkboxOptions}
        containerRef={containerRef}
        onSelect={this.onSelect}
        onChange={this.onChange}
        isChecked={isHeaderChecked}
        isIndeterminate={isHeaderIndeterminate}
        headerMenu={getHeaderMenu(t)}
      />
    ) : (
      <TableHeader
        setSelected={setSelected}
        containerRef={containerRef}
        columns={columns}
      />
    );
  }
}

export default inject(
  ({
    filesStore,
    filesActionsStore,
    selectedFolderStore,
    treeFoldersStore,
  }) => {
    const {
      setSelected,
      isHeaderVisible,
      isHeaderIndeterminate,
      isHeaderChecked,
      setIsLoading,
      filter,
      fetchFiles,
      canShare,
    } = filesStore;
    const { getHeaderMenu } = filesActionsStore;
    const { isPrivacyFolder } = treeFoldersStore;

    const withContent = canShare || (canShare && isPrivacyFolder && isDesktop);

    return {
      isHeaderVisible,
      isHeaderIndeterminate,
      isHeaderChecked,
      filter,
      selectedFolderId: selectedFolderStore.id,
      withContent,

      setSelected,
      setIsLoading,
      fetchFiles,
      getHeaderMenu,
    };
  }
)(
  withTranslation(["Home", "Common", "Translations"])(
    observer(FilesTableHeader)
  )
);