import { makeAutoObservable, runInAction } from "mobx";
import { TIMEOUT } from "../helpers/constants";
import { loopTreeFolders } from "../helpers/files-helpers";
import uniqueid from "lodash/uniqueId";
import sumBy from "lodash/sumBy";
import { ConflictResolveType } from "@appserver/common/constants";
import {
  getFolder,
  getFileInfo,
  getFolderInfo,
  getProgress,
  uploadFile,
  convertFile,
  startUploadSession,
  getFileConversationProgress,
  copyToFolder,
  moveToFolder,
} from "@appserver/common/api/files";

class UploadDataStore {
  formatsStore;
  treeFoldersStore;
  selectedFolderStore;
  filesStore;
  secondaryProgressDataStore;
  primaryProgressDataStore;
  dialogsStore;
  settingsStore;

  files = [];
  filesSize = 0;
  tempConversionFiles = [];
  filesToConversion = [];
  convertFilesSize = 0;
  uploadToFolder = null;
  uploadedFiles = 0;
  percent = 0;
  conversionPercent = 0;
  uploaded = true;
  converted = true;
  uploadPanelVisible = false;
  selectedUploadFile = [];

  constructor(
    formatsStore,
    treeFoldersStore,
    selectedFolderStore,
    filesStore,
    secondaryProgressDataStore,
    primaryProgressDataStore,
    dialogsStore,
    settingsStore
  ) {
    makeAutoObservable(this);
    this.formatsStore = formatsStore;
    this.treeFoldersStore = treeFoldersStore;
    this.selectedFolderStore = selectedFolderStore;
    this.filesStore = filesStore;
    this.secondaryProgressDataStore = secondaryProgressDataStore;
    this.primaryProgressDataStore = primaryProgressDataStore;
    this.dialogsStore = dialogsStore;
    this.settingsStore = settingsStore;
  }

  selectUploadedFile = (file) => {
    this.selectedUploadFile = file;
  };

  setUploadPanelVisible = (uploadPanelVisible) => {
    this.uploadPanelVisible = uploadPanelVisible;
  };

  setUploadData = (uploadData) => {
    const uploadDataItems = Object.keys(uploadData);
    for (let key of uploadDataItems) {
      if (key in this) {
        this[key] = uploadData[key];
      }
    }
  };

  updateUploadedFile = (id, info) => {
    const files = this.files.map((file) =>
      file.fileId === id ? { ...file, fileInfo: info } : file
    );
    this.files = files;
  };

  updateUploadedItem = async (id) => {
    const uploadedFileData = await getFileInfo(id);
    this.updateUploadedFile(id, uploadedFileData);
  };

  clearUploadData = () => {
    this.files = [];
    this.filesToConversion = [];
    this.filesSize = 0;
    this.uploadedFiles = 0;
    this.percent = 0;
    this.conversionPercent = 0;
    this.uploaded = true;
    this.converted = true;
  };

  clearUploadedFiles = () => {
    const uploadData = {
      filesSize: 0,
      uploadedFiles: 0,
      percent: 0,
      files: this.files.filter((x) => x.action !== "uploaded"),
    };

    this.setUploadData(uploadData);
  };

  getUploadedFile = (id) => {
    return this.files.filter((f) => f.uniqueId === id);
  };

  cancelUpload = () => {
    let newFiles = [];

    for (let i = 0; i < this.files.length; i++) {
      if (this.files[i].fileId) {
        newFiles.push(this.files[i]);
      }
    }

    const newUploadData = {
      files: newFiles,
      filesSize: this.filesSize,
      uploadedFiles: this.uploadedFiles,
      percent: 100,
      uploaded: true,
      converted: true,
    };

    if (newUploadData.files.length === 0) this.setUploadPanelVisible(false);
    this.setUploadData(newUploadData);
  };

  cancelConversion = () => {
    let newFiles = [];

    for (let i = 0; i < this.files.length; i++) {
      const file = this.files[i];
      if (file.action === "converted" || file.error || file.inConversion) {
        newFiles.push(this.files[i]);
      }
    }

    const newUploadData = {
      files: newFiles,
      filesToConversion: [],
      filesSize: this.filesSize,
      uploadedFiles: this.uploadedFiles,
      percent: 100,
      uploaded: true,
      converted: true,
    };

    if (newUploadData.files.length === 0) this.setUploadPanelVisible(false);
    this.setUploadData(newUploadData);
  };

  cancelCurrentUpload = (id) => {
    const newFiles = this.files.filter((el) => el.uniqueId !== id);

    const newUploadData = {
      files: newFiles,
      filesSize: this.filesSize,
      uploadedFiles: this.uploadedFiles,
      percent: this.percent,
      uploaded: false,
    };

    this.setUploadData(newUploadData);
  };

  cancelCurrentFileConversion = (fileId) => {
    const { convertItem, setConvertItem } = this.dialogsStore;
    convertItem && setConvertItem(null);

    const files = this.files.filter((el) => el.fileId + "" !== fileId);
    const filesToConversion = this.filesToConversion.filter(
      (el) => el.fileId + "" !== fileId
    );

    const newUploadData = {
      files,
      filesToConversion,
      filesSize: this.filesSize,
      uploadedFiles: this.uploadedFiles,
      percent: this.percent,
    };

    this.setUploadData(newUploadData);
  };

  convertFile = (file) => {
    this.dialogsStore.setConvertItem(null);

    const alreadyConverting = this.files.some(
      (item) => item.fileId === file.fileId
    );

    if (this.converted) {
      this.filesToConversion = [];
      this.convertFilesSize = 0;
      this.files = this.files.filter((f) => f.action === "converted");

      this.primaryProgressDataStore.clearPrimaryProgressData();
    }

    if (!alreadyConverting) {
      this.files.push(file);

      if (!this.filesToConversion.length) {
        this.filesToConversion.push(file);
        this.startConversion();
      } else {
        this.filesToConversion.push(file);
      }
    }
  };

  getNewPercent = (uploadedSize, indexOfFile) => {
    const newTotalSize = sumBy(this.files, (f) =>
      f.file && !this.uploaded ? f.file.size : 0
    );
    const totalUploadedFiles = this.files.filter((_, i) => i < indexOfFile);
    const totalUploadedSize = sumBy(totalUploadedFiles, (f) =>
      f.file && !this.uploaded ? f.file.size : 0
    );
    const newPercent =
      ((uploadedSize + totalUploadedSize) / newTotalSize) * 100;

    /*console.log(
    `newPercent=${newPercent} (newTotalSize=${newTotalSize} totalUploadedSize=${totalUploadedSize} indexOfFile=${indexOfFile})`
  );*/

    return newPercent;
  };

  getConversationProgress = async (fileId) => {
    const promise = new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          getFileConversationProgress(fileId).then((res) => {
            //console.log(`getFileConversationProgress fileId:${fileId}`, res);
            resolve(res);
          });
        } catch (error) {
          console.error(error);
          reject(error);
        }
      }, 1000);
    });

    return promise;
  };

  setConversionPercent = (percent, alert) => {
    const data = { icon: "file", percent, visible: true };

    if (this.uploaded) {
      this.primaryProgressDataStore.setPrimaryProgressBarData(
        alert ? { ...data, ...{ alert } } : data
      );
    }
  };

  getConversationPercent = (fileIndex) => {
    const length = this.files.filter((f) => f.needConvert).length;
    return (fileIndex / length) * 100;
  };

  startConversion = async () => {
    runInAction(() => (this.converted = false));
    this.setConversionPercent(0);

    let index = 0;
    let len = this.filesToConversion.length;
    let filesToConversion = this.filesToConversion;

    while (index < len) {
      const conversionItem = filesToConversion[index];
      const { fileId, toFolderId } = conversionItem;

      const file = this.files.find((f) => f.fileId === fileId);
      if (file) runInAction(() => (file.inConversion = true));

      const data = await convertFile(fileId);

      if (data && data[0]) {
        let progress = data[0].progress;
        let fileInfo = null;
        let error = null;

        while (progress < 100) {
          const res = await this.getConversationProgress(fileId);
          progress = res && res[0] && res[0].progress;
          fileInfo = res && res[0].result;

          runInAction(() => {
            const file = this.files.find((file) => file.fileId === fileId);
            if (file) file.convertProgress = progress;
          });

          error = res && res[0] && res[0].error;
          if (error.length) {
            const percent = this.getConversationPercent(index + 1);
            this.setConversionPercent(percent, !!error);

            runInAction(() => {
              const file = this.files.find((file) => file.fileId === fileId);
              if (file) {
                file.error = error;
                file.inConversion = false;
              }
            });

            //this.refreshFiles(toFolderId, false);
            break;
          }

          const percent = this.getConversationPercent(index + 1);
          this.setConversionPercent(percent);
        }

        if (progress === 100) {
          runInAction(() => {
            const file = this.files.find((file) => file.fileId === fileId);
            if (file) {
              file.convertProgress = progress;
              file.inConversion = false;
              file.action = "converted";
            }
          });

          this.settingsStore.storeOriginalFiles && this.refreshFiles(file);
          file.fileInfo = fileInfo;
          this.refreshFiles(file);
          const percent = this.getConversationPercent(index + 1);
          this.setConversionPercent(percent, !!error);
        }
      }

      index++;
      filesToConversion = this.filesToConversion;
      len = filesToConversion.length;
    }

    if (this.uploaded) {
      this.setConversionPercent(100);
      this.finishUploadFiles();
    } else {
      runInAction(() => {
        this.converted = true;
        this.filesToConversion = [];
        this.conversionPercent = 0;
      });
    }
  };

  convertUploadedFiles = (t) => {
    this.files = [...this.files, ...this.tempConversionFiles];

    if (this.uploaded) {
      const newUploadData = {
        files: this.files,
        filesSize: this.convertFilesSize,
        uploadedFiles: this.uploadedFiles,
        percent: this.percent,
        uploaded: false,
        converted: false,
      };
      this.tempConversionFiles = [];

      this.setUploadData(newUploadData);
      this.startUploadFiles(t);
    }
    this.tempConversionFiles = [];
  };

  startUpload = (uploadFiles, folderId, t) => {
    const { canConvert } = this.formatsStore.docserviceStore;

    const toFolderId = folderId ? folderId : this.selectedFolderStore.id;

    if (this.uploaded) {
      this.files = this.files.filter((f) => f.action !== "upload");
      this.filesSize = 0;
      this.uploadToFolder = null;
      this.percent = 0;
    }
    if (this.uploaded && this.converted) {
      this.files = [];
      this.filesToConversion = [];
    }

    let newFiles = this.files;
    let filesSize = 0;
    let convertSize = 0;

    for (let index of Object.keys(uploadFiles)) {
      const file = uploadFiles[index];

      const parts = file.name.split(".");
      const ext = parts.length > 1 ? "." + parts.pop() : "";
      const needConvert = canConvert(ext);

      const newFile = {
        file: file,
        uniqueId: uniqueid("download_row-key_"),
        fileId: null,
        toFolderId,
        action: "upload",
        error: file.size ? null : t("EmptyFile"),
        fileInfo: null,
        cancel: false,
        needConvert,
        encrypted: file.encrypted,
      };

      needConvert
        ? this.tempConversionFiles.push(newFile)
        : newFiles.push(newFile);

      filesSize += file.size;
      convertSize += file.size;
    }

    this.convertFilesSize = convertSize;

    //console.log("this.tempConversionFiles", this.tempConversionFiles);

    if (this.tempConversionFiles.length)
      this.settingsStore.hideConfirmConvertSave
        ? this.convertUploadedFiles(t)
        : this.dialogsStore.setConvertDialogVisible(true);

    const newUploadData = {
      files: newFiles,
      filesSize,
      uploadedFiles: this.uploadedFiles,
      percent: this.percent,
      uploaded: false,
      converted: !!this.tempConversionFiles.length,
    };

    if (this.uploaded && newFiles.length) {
      this.setUploadData(newUploadData);
      this.startUploadFiles(t);
    }
  };

  refreshFiles = async (currentFile) => {
    const {
      files,
      setFiles,
      folders,
      setFolders,
      filter,
      setFilter,
    } = this.filesStore;
    if (window.location.pathname.indexOf("/history") === -1) {
      const newFiles = files;
      const newFolders = folders;
      const path = currentFile.path || [];
      const fileIndex = newFiles.findIndex(
        (x) => x.id === currentFile.fileInfo.id
      );

      let folderInfo = null;
      const index = path.findIndex((x) => x === this.selectedFolderStore.id);
      const folderId = index !== -1 ? path[index + 1] : null;
      if (folderId) folderInfo = await getFolderInfo(folderId);

      const newPath = [];
      if (folderInfo || path[path.length - 1] === this.selectedFolderStore.id) {
        let i = 0;
        while (path[i] && path[i] !== folderId) {
          newPath.push(path[i]);
          i++;
        }
      }

    if (
        newPath[newPath.length - 1] !== this.selectedFolderStore.id &&
        path.length
    ) {
        return;
        }

      const addNewFile = () => {
        if (folderInfo) {
          const isFolderExist = newFolders.find((x) => x.id === folderInfo.id);
          if (!isFolderExist && folderInfo) {
            newFolders.unshift(folderInfo);
            setFolders(newFolders);
            const newFilter = filter;
            newFilter.total = newFilter.total += 1;
            setFilter(newFilter);
          }
        } else {
          if (currentFile && currentFile.fileInfo) {
            if (fileIndex === -1) {
              newFiles.unshift(currentFile.fileInfo);
              setFiles(newFiles);
              const newFilter = filter;
              newFilter.total = newFilter.total += 1;
              setFilter(newFilter);
            } else if (!this.settingsStore.storeOriginalFiles) {
              newFiles[fileIndex] = currentFile.fileInfo;
              setFiles(newFiles);
            }
          }
        }
      };

      const isFiltered =
        filter.filterType ||
        filter.authorType ||
        filter.search ||
        filter.page !== 0;

      if ((!currentFile && !folderInfo) || isFiltered) return;
      if (folderInfo && this.selectedFolderStore.id === folderInfo.id) return;

      if (folderInfo) {
        const folderIndex = folders.findIndex((f) => f.id === folderInfo.id);
        if (folderIndex !== -1) {
          folders[folderIndex] = folderInfo;
          return;
        }
      }

      if (filter.total >= filter.pageCount) {
        if (files.length) {
          fileIndex === -1 && newFiles.pop();
          addNewFile();
        } else {
          newFolders.pop();
          addNewFile();
        }
      } else {
        addNewFile();
      }

      if (!!folderInfo) {
        const {
          expandedKeys,
          setExpandedKeys,
          treeFolders,
        } = this.treeFoldersStore;

        const newExpandedKeys = expandedKeys.filter(
          (x) => x !== newPath[newPath.length - 1] + ""
      );

        setExpandedKeys(newExpandedKeys);

        loopTreeFolders(
          newPath,
          treeFolders,
          this.filesStore.folders.length === 1 ? this.filesStore.folders : [],
          this.filesStore.folders.length
        );
    }
    }
  };

  uploadFileChunks = async (
    location,
    requestsDataArray,
    fileSize,
    indexOfFile,
    file,
    path
  ) => {
    const length = requestsDataArray.length;
    for (let index = 0; index < length; index++) {
      if (
        this.uploaded ||
        !this.files.some((f) => f.file === file) ||
        this.files[indexOfFile].cancel
      ) {
        return Promise.resolve();
      }

      const res = await uploadFile(location, requestsDataArray[index]);

      //console.log(`Uploaded chunk ${index}/${length}`, res);

      //let isLatestFile = indexOfFile === newFilesLength - 1;

      if (!res.data.data && res.data.message) {
        return Promise.reject(res.data.message);
      }

      const fileId = res.data.data.id;

      const { uploaded } = res.data.data;

      const uploadedSize = uploaded
        ? fileSize
        : index * this.settingsStore.chunkUploadSize;

      const newPercent = this.getNewPercent(uploadedSize, indexOfFile);

      const percentCurrentFile = (index / length) * 100;

      this.primaryProgressDataStore.setPrimaryProgressBarData({
        icon: "upload",
        percent: newPercent,
        visible: true,
        loadingFile: {
          uniqueId: this.files[indexOfFile].uniqueId,
          percent: percentCurrentFile,
        },
      });

      if (uploaded) {
        const fileInfo = await getFileInfo(fileId);
        runInAction(() => {
          this.files[indexOfFile].action = "uploaded";
          this.files[indexOfFile].fileId = fileId;
          this.files[indexOfFile].fileInfo = fileInfo;
          this.percent = newPercent;
        });
        //setUploadData(uploadData);
      }
    }

    // All chuncks are uploaded

    const currentFile = this.files[indexOfFile];
    currentFile.path = path;
    if (!currentFile) return Promise.resolve();
    const { needConvert } = currentFile;

    if (needConvert) {
      runInAction(() => (currentFile.action = "convert"));
      if (!this.filesToConversion.length || this.converted) {
        this.filesToConversion.push(currentFile);
        this.startConversion();
      } else {
        this.filesToConversion.push(currentFile);
      }
      return Promise.resolve();
    } else {
      if (currentFile.action === "uploaded") {
        this.refreshFiles(currentFile);
    }
      return Promise.resolve();
    }
  };

  startUploadFiles = async (t) => {
    let files = this.files;

    if (files.length === 0 || this.filesSize === 0) {
      return this.finishUploadFiles();
    }

    const progressData = {
      visible: true,
      percent: this.percent,
      icon: "upload",
      alert: false,
    };

    this.primaryProgressDataStore.setPrimaryProgressBarData(progressData);

    let index = 0;
    let len = files.length;
    while (index < len) {
      await this.startSessionFunc(index, t);
      index++;

      files = this.files;
      len = files.length;
    }

    if (!this.filesToConversion.length) {
      this.finishUploadFiles();
    } else {
      runInAction(() => (this.uploaded = true));
      const uploadedFiles = this.files.filter((x) => x.action === "uploaded");
      const totalErrorsCount = sumBy(uploadedFiles, (f) => (f.error ? 1 : 0));
      if (totalErrorsCount > 0)
        console.log("Upload errors: ", totalErrorsCount);

      setTimeout(() => {
        if (!this.uploadPanelVisible && !totalErrorsCount && this.converted) {
          this.clearUploadedFiles();
        }
      }, TIMEOUT);
    }
  };

  startSessionFunc = (indexOfFile, t) => {
    //console.log("START UPLOAD SESSION FUNC", uploadData);

    if (!this.uploaded && this.files.length === 0) {
      this.uploaded = true;
      //setUploadData(uploadData);
      return;
    }

    const item = this.files[indexOfFile];

    if (!item) {
      console.error("Empty files");
      return Promise.resolve();
    } else if (
      item.action === "uploaded" ||
      item.action === "convert" ||
      item.action === "converted"
    ) {
      return Promise.resolve();
    }

    const { chunkUploadSize } = this.settingsStore;

    const { file, toFolderId /*, action*/ } = item;
    const chunks = Math.ceil(file.size / chunkUploadSize, chunkUploadSize);
    const fileName = file.name;
    const fileSize = file.size;
    const relativePath = file.path
      ? file.path.slice(1, -file.name.length)
      : file.webkitRelativePath
      ? file.webkitRelativePath.slice(0, -file.name.length)
      : "";

    return startUploadSession(
      toFolderId,
      fileName,
      fileSize,
      relativePath,
      file.encrypted
    )
      .then((res) => {
        const location = res.data.location;
        const path = res.data.path;

        const requestsDataArray = [];

        let chunk = 0;

        while (chunk < chunks) {
          const offset = chunk * chunkUploadSize;
          const formData = new FormData();
          formData.append("file", file.slice(offset, offset + chunkUploadSize));
          requestsDataArray.push(formData);
          chunk++;
        }

        return { location, requestsDataArray, fileSize, path };
      })
      .then(({ location, requestsDataArray, fileSize, path }) => {
        this.primaryProgressDataStore.setPrimaryProgressBarData({
          icon: "upload",
          visible: true,
          percent: this.percent,
          loadingFile: {
            uniqueId: this.files[indexOfFile].uniqueId,
            percent: chunks < 2 ? 50 : 0,
          },
        });

        return this.uploadFileChunks(
          location,
          requestsDataArray,
          fileSize,
          indexOfFile,
          file,
          path
        );
      })
      .catch((err) => {
        if (this.files[indexOfFile] === undefined) {
          this.primaryProgressDataStore.setPrimaryProgressBarData({
            icon: "upload",
            percent: 100,
            visible: true,
            alert: true,
          });
          return Promise.resolve();
        }

        this.files[indexOfFile].error = err;

        //dispatch(setUploadData(uploadData));

        const newPercent = this.getNewPercent(fileSize, indexOfFile);

        this.primaryProgressDataStore.setPrimaryProgressBarData({
          icon: "upload",
          percent: newPercent,
          visible: true,
          alert: true,
        });

        return Promise.resolve();
      });
  };

  finishUploadFiles = () => {
    const totalErrorsCount = sumBy(this.files, (f) => (f.error ? 1 : 0));

    if (totalErrorsCount > 0) console.log("Errors: ", totalErrorsCount);

    this.uploaded = true;
    this.converted = true;

    const uploadData = {
      filesSize: 0,
      uploadedFiles: 0,
      percent: 0,
      conversionPercent: 0,
    };

    setTimeout(() => {
      if (!this.primaryProgressDataStore.alert) {
        this.primaryProgressDataStore.clearPrimaryProgressData();
      }
      // !this.primaryProgressDataStore.alert &&
      //   this.primaryProgressDataStore.clearPrimaryProgressData();

      if (this.uploadPanelVisible || this.primaryProgressDataStore.alert) {
        uploadData.files = this.files;
        uploadData.filesToConversion = this.filesToConversion;
      } else {
        uploadData.files = [];
        uploadData.filesToConversion = [];
      }

      this.setUploadData(uploadData);
    }, TIMEOUT);
  };

  copyToAction = (
    destFolderId,
    folderIds,
    fileIds,
    conflictResolveType,
    deleteAfter
  ) => {
    const {
      setSecondaryProgressBarData,
      clearSecondaryProgressData,
    } = this.secondaryProgressDataStore;
    const { clearPrimaryProgressData } = this.primaryProgressDataStore;

    return copyToFolder(
      destFolderId,
      folderIds,
      fileIds,
      conflictResolveType,
      deleteAfter
    )
      .then((res) => {
        if (res[0]?.error) return Promise.reject(res[0].error);

        const data = res[0] ? res[0] : null;
        const pbData = { icon: "duplicate" };
        return this.loopFilesOperations(data, pbData).then(() =>
          this.moveToCopyTo(destFolderId, pbData, true)
        );
      })
      .catch((err) => {
        setSecondaryProgressBarData({
          visible: true,
          alert: true,
        });
        setTimeout(() => clearPrimaryProgressData(), TIMEOUT);
        setTimeout(() => clearSecondaryProgressData(), TIMEOUT);
        return Promise.reject(err);
      });
  };

  moveToAction = (
    destFolderId,
    folderIds,
    fileIds,
    conflictResolveType,
    deleteAfter
  ) => {
    const { clearPrimaryProgressData } = this.primaryProgressDataStore;
    const {
      setSecondaryProgressBarData,
      clearSecondaryProgressData,
    } = this.secondaryProgressDataStore;

    return moveToFolder(
      destFolderId,
      folderIds,
      fileIds,
      conflictResolveType,
      deleteAfter
    )
      .then((res) => {
        const data = res[0] ? res[0] : null;
        const pbData = { icon: "move" };
        return this.loopFilesOperations(data, pbData).then(() =>
          this.moveToCopyTo(destFolderId, pbData, false)
        );
      })
      .catch((err) => {
        setSecondaryProgressBarData({
          visible: true,
          alert: true,
        });
        setTimeout(() => clearPrimaryProgressData(), TIMEOUT);
        setTimeout(() => clearSecondaryProgressData(), TIMEOUT);
        return Promise.reject(err);
      });
  };

  itemOperationToFolder = (data) => {
    const {
      destFolderId,
      folderIds,
      fileIds,
      deleteAfter,
      isCopy,
      translations,
    } = data;
    const conflictResolveType = data.conflictResolveType
      ? data.conflictResolveType
      : ConflictResolveType.Duplicate;

    this.secondaryProgressDataStore.setSecondaryProgressBarData({
      icon: isCopy ? "duplicate" : "move",
      visible: true,
      percent: 0,
      label: isCopy ? translations.copy : translations.move,
      alert: false,
    });

    return isCopy
      ? this.copyToAction(
          destFolderId,
          folderIds,
          fileIds,
          conflictResolveType,
          deleteAfter
        )
      : this.moveToAction(
          destFolderId,
          folderIds,
          fileIds,
          conflictResolveType,
          deleteAfter
        );
  };

  loopFilesOperations = async (data, pbData) => {
    const label = this.secondaryProgressDataStore.label;

    const {
      clearSecondaryProgressData,
      setSecondaryProgressBarData,
    } = this.secondaryProgressDataStore;

    let progress = data.progress;

    if (!data) {
      setTimeout(() => clearSecondaryProgressData(), TIMEOUT);
      return;
    }

    let operationItem = data;
    let finished = data.finished;

    while (!finished) {
      const item = await this.getOperationProgress(data.id);
      operationItem = item;
      progress = item ? item.progress : 100;
      finished = item.finished;

      setSecondaryProgressBarData({
        icon: pbData.icon,
        label: pbData.label || label,
        percent: progress,
        visible: true,
        alert: false,
      });
    }

    return operationItem;
  };

  moveToCopyTo = (destFolderId, pbData, isCopy) => {
    const { treeFolders, setTreeFolders } = this.treeFoldersStore;
    const {
      fetchFiles,
      filter,
      isEmptyLastPageAfterOperation,
      resetFilterPage,
    } = this.filesStore;

    const {
      clearSecondaryProgressData,
      setSecondaryProgressBarData,
      label,
    } = this.secondaryProgressDataStore;

    let receivedFolder = destFolderId;
    let updatedFolder = this.selectedFolderStore.id;

    if (this.dialogsStore.isFolderActions) {
      receivedFolder = this.selectedFolderStore.parentId;
      updatedFolder = destFolderId;
    }

    getFolder(receivedFolder).then((data) => {
      let newTreeFolders = treeFolders;
      let path = data.pathParts.slice(0);
      let folders = data.folders;
      let foldersCount = data.current.foldersCount;
      loopTreeFolders(path, newTreeFolders, folders, foldersCount);

      if (!isCopy || destFolderId === this.selectedFolderStore.id) {
        let newFilter;

        if (isEmptyLastPageAfterOperation()) {
          newFilter = resetFilterPage();
        }

        fetchFiles(
          updatedFolder,
          newFilter ? newFilter : filter,
          true,
          true
        ).finally(() => {
            setTimeout(() => clearSecondaryProgressData(), TIMEOUT);
            this.dialogsStore.setIsFolderActions(false);
        });
      } else {
        setSecondaryProgressBarData({
          icon: pbData.icon,
          label: pbData.label || label,
          percent: 100,
          visible: true,
          alert: false,
        });

        setTimeout(() => clearSecondaryProgressData(), TIMEOUT);
        setTreeFolders(newTreeFolders);
      }
    });
  };

  getOperationProgress = async (id) => {
    const promise = new Promise((resolve, reject) => {
      setTimeout(async () => {
        try {
          await getProgress().then((res) => {
            const currentItem = res.find((x) => x.id === id);
            if (currentItem?.error) {
              reject(currentItem.error);
            }
            resolve(currentItem);
          });
        } catch (error) {
          reject(error);
        }
      }, 1000);
    });
    return promise;
  };
}

export default UploadDataStore;
