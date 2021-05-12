import React from "react";
import Text from "@appserver/components/text";
import { withTranslation } from "react-i18next";
import commonSettingsStyles from "../../utils/commonSettingsStyles";
import styled from "styled-components";
import Button from "@appserver/components/button";
import Checkbox from "@appserver/components/checkbox";
import { inject, observer } from "mobx-react";

import { getBackupProgress, startBackup } from "@appserver/common/api/portal";
import toastr from "@appserver/components/toast/toastr";
import { toast } from "react-toastify";
import ThirdPartyModule from "./sub-components-manual-backup/thirdPartyModule";
import DocumentsModule from "./sub-components-manual-backup/documentsModule";
import ThirdPartyStorageModule from "./sub-components-manual-backup/thirdPartyStorageModule";

const StyledComponent = styled.div`
  ${commonSettingsStyles}
  .manual-backup_buttons {
    margin-top: 16px;
  }
  .backup-include_mail {
    margin-top: 16px;
    margin-bottom: 16ox;
  }
  .inherit-title-link {
    margin-bottom: 8px;
  }
  .note_description {
    margin-top: 8px;
  }
  .backup-folder_path {
    margin-top: 16px;
  }
`;
class ManualBackup extends React.Component {
  constructor(props) {
    super(props);
    this.manualBackup = true;

    // this.state = {
    //   backupMailTemporaryStorage: false,
    //   backupMailDocuments: false,
    //   backupMailThirdParty: false,
    //   backupMailThirdPartyStorage: false,
    // };
    this.state = {
      isVisiblePanel: false,
      downloadingProgress: 100,
      link: "",
      selectedFolder: "",
      isPanelVisible: false,
      isLoading: true,
    };
  }
  componentDidMount() {
    const { getCommonThirdPartyList } = this.props;
    this.setState(
      {
        isLoading: true,
      },
      function () {
        getCommonThirdPartyList()
          .then(() => getBackupProgress())
          .then((res) => {
            if (res) {
              this.setState({
                downloadingProgress: res.progress,
                link: res.link,
              });
              if (res.progress !== 100)
                this.timerId = setInterval(() => this.getProgress(), 1000);
            }
          })
          .finally(() =>
            this.setState({
              isLoading: false,
            })
          );
      }
    );
  }

  // onClickCheckbox = (e) => {
  //   const name = e.target.name;
  //   let change = !this.state[name];
  //   this.setState({ [name]: change });
  // };
  componentWillUnmount() {
    clearInterval(this.timerId);
  }

  onClickButton = () => {
    startBackup("4");
    this.timerId = setInterval(() => this.getProgress(), 1000);
  };

  getProgress = () => {
    const { downloadingProgress } = this.state;
    const { t } = this.props;
    console.log("downloadingProgress", downloadingProgress);
    getBackupProgress()
      .then((res) => {
        if (res.error.length > 0 && res.progress !== 100) {
          clearInterval(this.timerId);
          toastr.error(`${res.error}`);
          console.log("error", res.error);
          this.setState({
            downloadingProgress: 100,
          });
          return;
        }
        this.setState({
          downloadingProgress: res.progress,
        });

        if (res.progress === 100) {
          clearInterval(this.timerId);
          this.setState({
            link: res.link,
          });
          toastr.success(`${t("SuccessCopied")}`);
        }
      })
      .catch(() => {
        toastr.error();
        clearInterval(this.timerId);
      });
  };

  setInterval = () => {
    this.timerId = setInterval(() => this.getProgress(), 1000);
  };

  onClickDownload = () => {
    const { link } = this.state;
    const url = window.location.origin;
    const downloadUrl = `${url}` + `${link}`;
    window.open(downloadUrl, "_blank");
  };

  render() {
    const {
      t,
      providers,
      panelVisible,
      folderPath,
      commonThirdPartyList,
    } = this.props;
    const { downloadingProgress, link, isPanelVisible, isLoading } = this.state;
    const maxProgress = downloadingProgress === 100;
    // const {
    //   backupMailTemporaryStorage,
    //   backupMailDocuments,
    //   backupMailThirdParty,
    //   backupMailThirdPartyStorage,
    // } = this.state;
    // console.log("isLoading", isLoading);
    // console.log("commonThirdPartyList", commonThirdPartyList);
    return isLoading ? (
      <></>
    ) : (
      <StyledComponent>
        <div className="category-item-wrapper temporary-storage">
          <div className="category-item-heading">
            <Text className="inherit-title-link header">
              {t("TemporaryStorage")}
            </Text>
          </div>
          <Text className="category-item-description">
            {t("TemporaryStorageDescription")}
          </Text>

          {/* <div className="backup-include_mail">
            <Checkbox
              name={"backupMailTemporaryStorage"}
              isChecked={backupMailTemporaryStorage}
              label={t("IncludeMail")}
              onChange={this.onClickCheckbox}
            />
          </div> */}
          <div className="manual-backup_buttons">
            <Button
              label={t("MakeCopy")}
              onClick={this.onClickButton}
              primary
              isDisabled={!maxProgress}
              size="medium"
              tabIndex={10}
            />
            {link.length > 0 && maxProgress && (
              <Button
                label={t("DownloadBackup")}
                onClick={this.onClickDownload}
                isDisabled={false}
                size="medium"
                style={{ marginLeft: "8px" }}
                tabIndex={11}
              />
            )}
            {!maxProgress && (
              <Button
                label={t("Copying")}
                onClick={() => console.log("click")}
                isDisabled={true}
                size="medium"
                style={{ marginLeft: "8px" }}
                tabIndex={11}
              />
            )}
          </div>
        </div>

        <DocumentsModule
          maxProgress={maxProgress}
          setInterval={this.setInterval}
        />

        <ThirdPartyModule
          maxProgress={maxProgress}
          commonThirdPartyList={commonThirdPartyList}
          setInterval={this.setInterval}
        />

        <ThirdPartyStorageModule maxProgress={maxProgress} />
      </StyledComponent>
    );
  }
}

export default inject(({ auth, setup }) => {
  const { setPanelVisible, panelVisible } = auth;
  const { folderPath } = auth.settingsStore;
  const { getCommonThirdPartyList } = setup;
  const { commonThirdPartyList } = setup.dataManagement;

  return {
    setPanelVisible,
    panelVisible,
    folderPath,

    commonThirdPartyList,
    getCommonThirdPartyList,
  };
})(withTranslation("Settings")(observer(ManualBackup)));