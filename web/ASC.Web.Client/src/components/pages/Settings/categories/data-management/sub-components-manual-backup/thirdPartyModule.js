import { useState } from "react";
import React from "react";
import { useTranslation } from "react-i18next";
import OperationsDialog from "files/OperationsDialog";
import Button from "@appserver/components/button";
import Text from "@appserver/components/text";
import { startBackup } from "@appserver/common/api/portal";
import { inject, observer } from "mobx-react";
import Box from "@appserver/components/box";
import Link from "@appserver/components/link";
const ThirdPartyModule = ({
  maxProgress,
  commonThirdPartyList,
  setInterval,
  helpUrlCreatingBackup,
}) => {
  const [selectedFolder, setSelectedFolder] = useState("");
  const [isPanelVisible, setPanelVisible] = useState(false);
  const { t } = useTranslation("Settings");

  const onSelectFolder = (folderId) => {
    setSelectedFolder(folderId);
  };

  const onClickInput = (e) => {
    setPanelVisible(true);
  };

  const onClose = () => {
    setPanelVisible(false);
  };

  const onClickButton = () => {
    console.log("selectedFolder", selectedFolder);
    startBackup("1", "folderId", selectedFolder[0]);
    setInterval();
  };

  return (
    <div className="category-item-wrapper">
      <div className="category-item-heading">
        <Text className="inherit-title-link header">
          {t("ThirdPartyResource")}
        </Text>
      </div>

      <Text className="category-item-description">
        {t("ThirdPartyResourceDescription")}
      </Text>
      <Text className="category-item-description note_description">
        {t("ThirdPartyResourceNoteDescription")}
      </Text>
      <Box marginProp="16px 0 16px 0">
        <Link
          color="#316DAA"
          target="_blank"
          isHovered={true}
          href={helpUrlCreatingBackup}
        >
          {t("LearnMore")}
        </Link>
      </Box>

      <OperationsDialog
        onSelectFolder={onSelectFolder}
        name={"thirdParty"}
        onClose={onClose}
        onClickInput={onClickInput}
        isPanelVisible={isPanelVisible}
        folderList={commonThirdPartyList}
      />

      <div className="manual-backup_buttons">
        <Button
          label={t("MakeCopy")}
          onClick={onClickButton}
          primary
          isDisabled={!maxProgress}
          size="medium"
          tabIndex={10}
        />
      </div>
    </div>
  );
};

export default inject(({ auth }) => {
  const { helpUrlCreatingBackup } = auth.settingsStore;
  return {
    helpUrlCreatingBackup,
  };
})(observer(ThirdPartyModule));