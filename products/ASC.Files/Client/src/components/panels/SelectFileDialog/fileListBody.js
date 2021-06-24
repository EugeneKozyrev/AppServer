import React, { useCallback } from "react";
import Loader from "@appserver/components/loader";
import Text from "@appserver/components/text";
import { useTranslation, withTranslation } from "react-i18next";
import { ReactSVG } from "react-svg";
import config from "../../../../package.json";
import CustomScrollbarsVirtualList from "@appserver/components/scrollbar/custom-scrollbars-virtual-list";
import InfiniteLoader from "react-window-infinite-loader";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeList as List } from "react-window";
import { inject, observer } from "mobx-react";

const FileListBody = ({
  isLoadingData,
  filesList,
  onSelectFile,
  loadNextPage,
  hasNextPage,
  isNextPageLoading,
  displayType,
  viewer,
}) => {
  const { t } = useTranslation(["SelectFile", "Common"]);
  // Every row is loaded except for our loading indicator row.
  const isItemLoaded = useCallback(
    (index) => {
      return !hasNextPage || index < filesList.length;
    },
    [hasNextPage, filesList]
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

  const Item = useCallback(
    ({ index, style }) => {
      const file = filesList[index];

      const fileOwner = file
        ? file.createdBy &&
          ((viewer.id === file.createdBy.id && t("Common:MeLabel")) ||
            file.createdBy.displayName)
        : "";

      return (
        <div style={style}>
          {!isItemLoaded(index) ? (
            <div key="loader">
              <Loader
                type="oval"
                size="16px"
                style={{
                  display: "inline",
                  marginRight: "10px",
                }}
              />
              <Text as="span">{`${t("Common:LoadingProcessing")} ${t(
                "Common:LoadingDescription"
              )}`}</Text>
            </div>
          ) : (
            <div
              data-index={index}
              className="modal-dialog_file-name"
              onClick={onSelectFile}
            >
              <ReactSVG
                src={`${config.homepage}/images/icons/24/file_archive.svg`}
                className="select-file-dialog_icon"
              />
              <div data-index={index} className="files-list_full-name">
                <Text data-index={index} className="entry-title">
                  {file && file.title.substring(0, file.title.indexOf(".gz"))}
                </Text>

                <div data-index={index} className="file-exst">
                  {".gz"}
                </div>
              </div>
              <div className="files-list_file-owner_wrapper">
                <Text data-index={index} className="files-list_file-owner">
                  {fileOwner}
                </Text>
              </div>
            </div>
          )}
        </div>
      );
    },
    [filesList]
  );
  return (
    <>
      {!isLoadingData ? (
        <AutoSizer>
          {({ width, height }) => (
            <InfiniteLoader
              //ref={listOptionsRef}
              isItemLoaded={isItemLoaded}
              itemCount={itemCount}
              loadMoreItems={loadMoreItems}
            >
              {({ onItemsRendered, ref }) => (
                <List
                  className="options_list"
                  height={displayType === "aside" ? height : 320}
                  itemCount={itemCount}
                  itemSize={displayType === "aside" ? 40 : 36}
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
      ) : (
        <div key="loader" className="panel-loader-wrapper">
          <Loader type="oval" size="16px" className="panel-loader" />
          <Text as="span">{`${t("Common:LoadingProcessing")} ${t(
            "Common:LoadingDescription"
          )}`}</Text>
        </div>
      )}
    </>
  );
};
FileListBody.defaultProps = {
  isModalView: false,
  isLoadingData: false,
};
export default inject(({ auth }) => {
  const { user } = auth.userStore;
  return {
    viewer: user,
  };
})(observer(withTranslation("Common")(FileListBody)));