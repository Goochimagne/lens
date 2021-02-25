// Helper for persisting data in local or remote storage.
// Web-storage adapter is used by default (window.localStorage)
// TODO: write unit/integration tests

import { CreateObservableOptions } from "mobx/lib/api/observable";
import { action, comparer, observable, toJS } from "mobx";
import { Draft, produce } from "immer";

export interface StorageHelperOptions<T = any> extends StorageConfiguration<T> {
  autoInit?: boolean; // default: true, preload data at early stages (e.g. in place of use)
}

export interface StorageConfiguration<T = any> {
  storage?: StorageAdapter<T>;
  observable?: CreateObservableOptions;
}

export interface StorageAdapter<T = any, C = StorageHelper<T>> {
  getItem(this: C, key: string): T | Promise<T>;
  setItem(this: C, key: string, value: T): void;
  removeItem(this: C, key: string): void;
}

export const localStorageAdapter: StorageAdapter = {
  getItem(key: string) {
    return JSON.parse(localStorage.getItem(key));
  },
  setItem(key: string, value: any) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  removeItem(key: string) {
    localStorage.removeItem(key);
  }
};

export class StorageHelper<T = any> {
  static defaultOptions: StorageHelperOptions = {
    autoInit: true,
    storage: localStorageAdapter,
    observable: {
      deep: true,
      equals: comparer.default,
    }
  };

  @observable initialized = false;
  @observable.ref options: StorageHelperOptions = {};
  @observable.ref storage: StorageAdapter<T, ThisType<this>>;
  protected data = observable.box<T>();

  constructor(readonly key: string, readonly defaultValue?: T, readonly initOptions: StorageHelperOptions = {}) {
    this.options = { ...StorageHelper.defaultOptions, ...initOptions };
    this.configure(this.options);

    if (this.options.autoInit) {
      this.init();
    }
  }

  @action
  async init() {
    if (this.initialized) return;

    try {
      const value = await this.getStorageValueAsync();

      if (value != null) {
        this.set(value);
        this.initialized = true;
      }
    } catch (error) {
      console.error(`StorageHelper.init(): ${error}`, this);
    }
  }

  @action
  protected setupStorage(storage: StorageAdapter<T>) {
    this.storage = {
      ...storage,
      getItem: storage.getItem.bind(this),
      setItem: storage.setItem.bind(this),
      removeItem: storage.removeItem.bind(this),
    };
  }

  @action
  configure(config: StorageConfiguration): this {
    if (config.storage) {
      this.setupStorage(config.storage);
    }
    if (config.observable) {
      this.data = observable.box<T>(this.data.get(), config.observable);
    }
    return this;
  }

  async getStorageValueAsync(): Promise<T> {
    return this.storage.getItem(this.key);
  }

  getStorageValue(): T {
    try {
      const value = this.storage.getItem(this.key) as T;
      const isAsync = value instanceof Promise;

      if (value != null && !isAsync) {
        return value;
      }
    } catch (error) {
      console.error(`StorageHelper.getStorageValue(): ${error}`, this);
    }
  }

  get(): T {
    const value = this.data.get();

    if (value != null) {
      return value;
    }

    return this.getStorageValue() ?? this.defaultValue;
  }

  set(value: T) {
    try {
      this.storage.setItem(this.key, value);
      this.data.set(value);
    } catch (error) {
      console.error(`StorageHelper.set(): ${error}`, this, { value });
    }
  }

  merge(value: Partial<T> | ((draft: Draft<T>) => Partial<T> | void)) {
    const updater = typeof value === "function" ? value : () => value;
    try {
      const currentValue = toJS(this.get());
      const nextValue = produce(currentValue, updater) as T;

      this.set(nextValue);
    } catch (error) {
      console.error(`StorageHelper.merge(): ${error}`, this, { value });
    }
  }

  clear() {
    try {
      this.data.set(null);
      this.storage.removeItem(this.key);
    } catch (error) {
      console.error(`StorageHelper.clear(): ${error}`, this);
    }
  }
}
