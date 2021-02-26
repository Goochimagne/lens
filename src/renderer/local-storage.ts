import { remote } from "electron";
import { action, comparer, IReactionDisposer, observable, reaction, toJS } from "mobx";
import produce from "immer";
import Config from "conf";
import { StorageAdapter, StorageHelper, StorageHelperOptions } from "./utils/createStorage";
import { ClusterId, getHostedClusterId } from "../common/cluster-store";
import { getAppVersion } from "../common/utils/app-version";

export { StorageHelper, StorageHelperOptions, StorageConfiguration, StorageAdapter } from "./utils/createStorage";

export interface LensLocalStorageModel {
  [clusterId: string]: LensLocalStorageState;
}

export type LensLocalStorageState = Record<string, any>;

export class LensLocalStorage {
  private fileStorage: Config<LensLocalStorageModel>;
  private state = observable.map<ClusterId, LensLocalStorageState>();

  async init() {
    await this.load();
    this.bindAutoSave();
  }

  private load() {
    this.fileStorage = new Config({
      configName: "lens-local-storage",
      cwd: remote.app.getPath("userData"),
      projectVersion: getAppVersion(),
    });

    this.fromStore(this.fileStorage.store);
  }

  // FIXME: reset on app/page reload
  private bindAutoSave(): IReactionDisposer {
    return reaction(() => this.toJSON(), state => this.saveToFile(state), {
      equals: comparer.shallow,
    });
  }

  @action
  private saveToFile(state: LensLocalStorageModel){
    this.fileStorage.set(state);
  }

  getState(clusterId: ClusterId): LensLocalStorageState {
    return this.state.get(clusterId) ?? {};
  }

  @action
  setState(clusterId: ClusterId, updater: (state: LensLocalStorageModel) => void) {
    const state = toJS(this.getState(clusterId), { recurseEverything: true });
    const nextState = produce(state, updater);

    this.state.set(clusterId, nextState);
  }

  @action
  protected fromStore(data: LensLocalStorageModel = {}) {
    this.state.replace(data);
  }

  toJSON(): LensLocalStorageModel {
    return toJS(this.state.toJSON(), {
      recurseEverything: true,
    });
  }
}

export const localStorage = new LensLocalStorage();

export function createLocalStorageAdapter<T>(clusterId: ClusterId): StorageAdapter<T> {
  return {
    getItem(key: string) {
      return localStorage.getState(clusterId)[key];
    },
    setItem(key: string, value: any) {
      localStorage.setState(clusterId, state => {
        if (value != null) state[key] = value;
        else delete state[key];
      });
    },
  };
}

export function createStorage<T>(key: string, defaultValue?: T, options: StorageHelperOptions<T> = {}) {
  const clusterId = getHostedClusterId();
  const jsonFileStorageAdapter = createLocalStorageAdapter(clusterId);

  return new StorageHelper(key, defaultValue, {
    storage: jsonFileStorageAdapter,
    ...options,
  });
}
