export { StorageHelper, StorageHelperOptions, StorageConfiguration, StorageAdapter } from "./utils/createStorage";

import { StorageHelper, StorageHelperOptions } from "./utils/createStorage";
import { action, comparer, observable } from "mobx";
import { BaseStore } from "../common/base-store";
import { ClusterId, getHostedClusterId } from "../common/cluster-store";

export interface LensLocalStorageModel {
  [clusterId: string]: {
    [storageKey: string]: any;
  };
}

export class LensLocalStorage extends BaseStore<LensLocalStorageModel> {
  public state = observable.map<ClusterId, Record<string, any>>([], {
    equals: comparer.shallow,
  });

  constructor() {
    super({
      configName: "lens-local-storage",
      autoLoad: false,
      syncEnabled: false,
    });
  }

  getItem(clusterId: string, key: string) {
    return this.state.get(clusterId)?.[key];
  }

  @action
  setItem(clusterId: string, key: string, value: any) {
    const storage = this.state.get(clusterId) ?? {};

    if (value != null) {
      storage[key] = value;
    } else {
      delete storage[key];
    }

    this.state.merge({ [clusterId]: storage });
    this.saveToFile(this.toJSON());
  }

  @action
  protected fromStore(data: LensLocalStorageModel = {}) {
    this.state.replace(data);
  }

  toJSON(): LensLocalStorageModel {
    return this.state.toJSON();
  }
}

export const localStorage = LensLocalStorage.getInstance<LensLocalStorage>();

export function createStorage<T>(key: string, defaultValue?: T, options: StorageHelperOptions<T> = {}) {
  const clusterId = getHostedClusterId();

  return new StorageHelper(key, defaultValue, {
    ...options,
    storage: {
      getItem(key: string) {
        return localStorage.getItem(clusterId, key);
      },
      setItem(key: string, value: any) {
        localStorage.setItem(clusterId, key, value);
      },
      removeItem(key: string) {
        localStorage.setItem(clusterId, key, null);
      },
    }
  });
}
