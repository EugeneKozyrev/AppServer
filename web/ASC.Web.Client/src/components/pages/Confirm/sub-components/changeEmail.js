import React from "react";
import { withRouter } from "react-router";
import PropTypes from "prop-types";
import { inject, observer } from "mobx-react";
import Loader from "@appserver/components/loader";
import PageLayout from "@appserver/common/components/PageLayout";
import { combineUrl, tryRedirectTo } from "@appserver/common/utils";
import { AppServerConfig } from "@appserver/common/constants";

class ChangeEmail extends React.PureComponent {
  componentDidMount() {
    const { changeEmail, userId, isLoaded, linkData } = this.props;
    if (isLoaded) {
      const [email, key] = [linkData.email, linkData.confirmHeader];
      changeEmail(userId, email, key)
        .then((res) => {
          console.log("change client email success", res);
          tryRedirectTo(
            combineUrl(
              AppServerConfig.proxyURL,
              `/products/people/view/@self?email_change=success`
            )
          );
        })
        .catch((e) => {
          console.log("change client email error", e);
          tryRedirectTo(combineUrl(AppServerConfig.proxyURL, `/error=${e}`));
        });
    }
  }

  componentDidUpdate() {
    const { changeEmail, userId, isLoaded, linkData, defaultPage } = this.props;
    if (isLoaded) {
      const [email, key] = [linkData.email, linkData.confirmHeader];
      changeEmail(userId, email, key)
        .then((res) => {
          console.log("change client email success", res);
          tryRedirectTo(
            combineUrl(
              AppServerConfig.proxyURL,
              `/products/people/view/@self?email_change=success`
            )
          );
        })
        .catch((e) => console.log("change client email error", e));
    } else {
      tryRedirectTo(defaultPage);
    }
  }

  render() {
    console.log("Change email render");
    return <Loader className="pageLoader" type="rombs" size="40px" />;
  }
}

ChangeEmail.propTypes = {
  location: PropTypes.object.isRequired,
  changeEmail: PropTypes.func.isRequired,
};
const ChangeEmailForm = (props) => (
  <PageLayout>
    <PageLayout.SectionBody>
      <ChangeEmail {...props} />
    </PageLayout.SectionBody>
  </PageLayout>
);

export default inject(({ auth }) => {
  const { logout, userStore, settingsStore, isLoaded } = auth;
  return {
    isLoaded,
    userId: userStore.user.id,
    logout,
    changeEmail: userStore.changeEmail,
    defaultPage: settingsStore.defaultPage,
  };
})(observer(withRouter(ChangeEmailForm)));
