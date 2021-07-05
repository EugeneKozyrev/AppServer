import React, { useCallback, useEffect, useRef } from "react";
import Loader from "@appserver/components/loader";
import Text from "@appserver/components/text";
import { useTranslation, withTranslation } from "react-i18next";
import CustomScrollbarsVirtualList from "@appserver/components/scrollbar/custom-scrollbars-virtual-list";
import InfiniteLoader from "react-window-infinite-loader";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeList as List } from "react-window";
import { inject, observer } from "mobx-react";
import ListRow from "./listRow";
import EmptyContainer from "../../EmptyContainer/EmptyContainer";
const FilesListBody = ({
  filesList,
  onSelectFile,
  loadNextPage,
  hasNextPage,
  isNextPageLoading,
  displayType,
  viewer,
  listHeight,
  needRowSelection,
  loadingText,
  selectedFolder,
  isMultiSelect,
  selectedFile,
}) => {
  const { t } = useTranslation(["SelectFile", "Common"]);
  const filesListRef = useRef(null);
  useEffect(() => {
    if (filesListRef && filesListRef.current) {
      filesListRef.current.resetloadMoreItemsCache(true);
    }
  }, [selectedFolder]);
  // Every row is loaded except for our loading indicator row.
  const isItemLoaded = useCallback(
    (index) => {
      return !hasNextPage || index < filesList.length;
    },
    [filesList, hasNextPage]
  );
  // If there are more items to be loaded then add an extra row to hold a loading indicator.
  const itemCount = hasNextPage ? filesList.length + 1 : filesList.length;

  const loadMoreItems = useCallback(
    (startIndex) => {
      if (isNextPageLoading) return;
      console.log("startIndex", startIndex);
      const options = {
        startIndex: startIndex || 0,
      };

      loadNextPage && loadNextPage(options);
    },
    [isNextPageLoading, filesList]
  );

  const renderLoader = useCallback(
    (style) => {
      return (
        <div style={style}>
          <div key="loader" className="panel-loader-wrapper">
            <Loader type="oval" size="16px" className="panel-loader" />
            <Text as="span">{loadingText}</Text>
          </div>
        </div>
      );
    },
    [loadingText]
  );
  const isFileChecked = useCallback(
    (file) => {
      const checked = selectedFile ? file.id === selectedFile.id : false;
      return checked;
    },
    [selectedFile]
  );
  const Item = useCallback(
    ({ index, style }) => {
      const isLoaded = isItemLoaded(index);

      if (!isLoaded) {
        return renderLoader(style);
      }

      const file = filesList[index];
      const fileName = file.title;
      const fileExst = file.fileExst;
      const modifyFileName = fileName.substring(
        0,
        fileName.indexOf(`${fileExst}`)
      );

      const fileOwner =
        file.createdBy &&
        ((viewer.id === file.createdBy.id && t("Common:MeLabel")) ||
          file.createdBy.displayName);

      const isChecked = isFileChecked(file);

      return (
        <div style={style}>
          <ListRow
            displayType={displayType}
            needRowSelection={needRowSelection}
            index={index}
            onSelectFile={onSelectFile}
            fileName={modifyFileName}
            fileExst={fileExst}
            isMultiSelect={isMultiSelect}
            isChecked={isChecked}
          >
            <Text data-index={index} className="files-list_file-owner">
              {fileOwner}
            </Text>
          </ListRow>
        </div>
      );
    },
    [filesList, selectedFile, renderLoader]
  );
  return (
    <>
      <AutoSizer>
        {({ width, height }) => (
          <InfiniteLoader
            ref={filesListRef}
            isItemLoaded={isItemLoaded}
            itemCount={itemCount}
            loadMoreItems={loadMoreItems}
          >
            {({ onItemsRendered, ref }) => (
              <List
                className="options_list"
                height={displayType === "aside" ? height : listHeight}
                itemCount={itemCount}
                itemSize={displayType === "aside" ? 56 : 36}
                onItemsRendered={onItemsRendered}
                ref={ref}
                width={width + 8}
                outerElementType={CustomScrollbarsVirtualList}
              >
                {Item}
              </List>
            )}
          </InfiniteLoader>
        )}
      </AutoSizer>

      {!hasNextPage && itemCount === 0 && (
        <div className="select-file-dialog_empty-container">
          <EmptyContainer
            headerText={t("Common:EmptyFolderHeader")}
            imageSrc="/static/images/empty_screen.png"
          />
        </div>
      )}
    </>
  );
};
FilesListBody.defaultProps = {
  listHeight: 300,
  isMultiSelect: false,
};
export default inject(({ auth }) => {
  const { user } = auth.userStore;
  return {
    viewer: user,
  };
})(observer(withTranslation("Common")(FilesListBody)));