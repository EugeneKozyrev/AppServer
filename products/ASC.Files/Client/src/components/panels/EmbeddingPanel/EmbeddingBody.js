import React, { useEffect, useState, useCallback } from "react";
import Text from "@appserver/components/text";
import Link from "@appserver/components/link";
import TextInput from "@appserver/components/text-input";
import Textarea from "@appserver/components/textarea";
import copy from "copy-to-clipboard";
import toastr from "@appserver/components/toast/toastr";
import IconButton from "@appserver/components/icon-button";
import i18n from "./i18n";
import { withTranslation, I18nextProvider } from "react-i18next";

const EmbeddingBody = ({ embeddingLink, t }) => {
  const [size, setSize] = useState("auto");
  const [widthValue, setWidthValue] = useState("100%");
  const [heightValue, setHeightValue] = useState("100%");
  const getIframe = useCallback(
    () =>
      `<iframe src="${embeddingLink}" width="${widthValue}" height="${heightValue}" frameborder="0" scrolling="no" allowtransparency> </iframe>`,
    [embeddingLink, widthValue, heightValue]
  );
  const [link, setLink] = useState(getIframe());

  useEffect(() => {
    const link = getIframe();
    setLink(link);
  }, [embeddingLink, widthValue, heightValue]);

  const onSelectSizeMiddle = () => {
    if (size === "600x800") return;

    setSize("600x800");
    setWidthValue("600");
    setHeightValue("800");
  };

  const onSelectSizeSmall = () => {
    if (size === "400x600") return;

    setSize("400x600");
    setWidthValue("400");
    setHeightValue("600");
  };
  const onSelectSizeAuto = () => {
    if (size === "auto") return;

    setSize("auto");
    setWidthValue("100%");
    setHeightValue("100%");
  };

  const onChangeWidth = (e) => {
    setWidthValue(e.target.value);
  };
  const onChangeHeight = (e) => {
    setHeightValue(e.target.value);
  };

  const onCopyLink = () => {
    copy(link);
    toastr.success(t("CodeCopySuccess"));
  };

  return (
    <div className="embedding-panel_body">
      <Text className="embedding-panel_text">{t("Common:Size")}:</Text>
      <div className="embedding-panel_links-container">
        <Link
          isHovered
          type="action"
          className="embedding-panel_link"
          onClick={onSelectSizeMiddle}
        >
          600 x 800 px
        </Link>
        <Link
          isHovered
          type="action"
          className="embedding-panel_link"
          onClick={onSelectSizeSmall}
        >
          400 x 600 px
        </Link>
        <Link
          isHovered
          type="action"
          className="embedding-panel_link"
          onClick={onSelectSizeAuto}
        >
          {t("Auto")}
        </Link>
      </div>
      <div className="embedding-panel_inputs-container">
        <div>
          <Text className="embedding-panel_text">{t("Width")}:</Text>
          <TextInput
            className="embedding-panel_input"
            value={widthValue}
            onChange={onChangeWidth}
          />
        </div>
        <div>
          <Text className="embedding-panel_text">{t("Height")}:</Text>
          <TextInput
            className="embedding-panel_input"
            value={heightValue}
            onChange={onChangeHeight}
          />
        </div>
      </div>
      <div className="embedding-panel_code-container">
        <Text className="embedding-panel_text">{t("EmbedCode")}:</Text>
        <IconButton
          className="embedding-panel_copy-icon"
          size="16"
          iconName="/static/images/copy.react.svg"
          color="#333"
          onClick={onCopyLink}
        />
        <Textarea color="#AEAEAE" isReadOnly value={link} />
      </div>
    </div>
  );
};

const EmbeddingBodyWrapper = withTranslation("EmbeddingPanel")(EmbeddingBody);

export default (props) => (
  <I18nextProvider i18n={i18n}>
    <EmbeddingBodyWrapper {...props} />
  </I18nextProvider>
);
