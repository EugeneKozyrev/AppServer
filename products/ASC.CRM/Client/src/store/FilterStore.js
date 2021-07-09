import { action, makeObservable, observable } from "mobx";
import CrmFilter from "@appserver/common/api/crm/filter";
import config from "../../package.json";
import { combineUrl } from "@appserver/common/utils";
import { AppServerConfig } from "@appserver/common/constants";

class FilterStore {
  filter = CrmFilter.getDefault();

  constructor() {
    makeObservable(this, {
      filter: observable,
      setFilterParams: action,
      setFilterUrl: action,
      resetFilter: action,
      setFilter: action,
    });
  }

  setFilterUrl = (filter) => {
    const urlFilter = filter.toUrlParams();
    window.history.replaceState(
      "",
      "",
      combineUrl(
        AppServerConfig.proxyURL,
        config.homepage,
        `/contact/filter?${urlFilter}`
      )
    );
  };

  setFilterParams = (data) => {
    this.setFilterUrl(data);
    this.setFilter(data);
  };

  resetFilter = () => {
    this.setFilter(CrmFilter.getDefault());
  };

  setFilter = (filter) => {
    this.filter = filter;
  };
}

export default FilterStore;