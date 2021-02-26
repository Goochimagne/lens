// Helper for persisting data in local or remote storage.
// Web-storage adapter is used by default (window.localStorage)
// TODO: write unit/integration tests

import { CreateObservableOptions } from "mobx/lib/api/observable";
import { action, comparer, observable, toJS, when } from "mobx";
import { Draft, produce } from "immer";

export interface StorageHelperOptions<T = any> extends StorageConfiguration<T> {
  autoInit?: boolean; // get latest storage state on init (default: true)
}

export interface StorageConfiguration<T = any> {
  storage?: StorageAdapter<T>;
  observable?: CreateObservableOptions;
  onChange?(value: T, oldValue?: T): void;
}

export interface StorageAdapter<T = any, C = StorageHelper<T>> {
  getItem(this: C, key: string): T | Promise<T>; // import
  setItem(this: C, key: string, value: T): void; // export
  removeItem?(this: C, key: string): void; // default: setItem(key, undefined)
  onChange?(this: C, value: T, oldValue?: T): void;
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
      equals: comparer.shallow,
    }
  };

  private data = observable.box<T>();
  @observable.ref storage: StorageAdapter<T, ThisType<this>>;
  @observable initialized = false;

  whenReady = when(() => this.initialized);

  constructor(readonly key: string, readonly defaultValue?: T, readonly options: StorageHelperOptions = {}) {
    this.options = { ...StorageHelper.defaultOptions, ...options };
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
  configure(config: StorageConfiguration = this.options): this {
    if (config.storage) {
      this.storage = this.setupStorage(config.storage);
    }

    if (config.observable) {
      this.data = observable.box<T>(this.data.get(), {
        ...StorageHelper.defaultOptions.observable,
        ...config.observable,
      });
      this.data.observe(change => this.onChange(change));
    }

    return this;
  }

  protected setupStorage(storage: StorageAdapter<T>): StorageAdapter<T, ThisType<this>> {
    return Object.getOwnPropertyNames(storage).reduce((storage, name: keyof StorageAdapter) => {
      storage[name] = storage[name]?.bind(this); // bind "this"-context for storage-adapter methods

      return storage;
    }, { ...storage });
  }

  protected onChange(change: { newValue: T, oldValue?: T }) {
    const { newValue, oldValue } = toJS(change, { recurseEverything: true });

    if (oldValue == null) return; // skip on init
    this.options.onChange?.(newValue, oldValue);
    this.storage.onChange?.(newValue, oldValue);
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
      if (this.storage.removeItem) {
        this.storage.removeItem(this.key);
      } else {
        this.storage.setItem(this.key, undefined);
      }
      this.data.set(null);
    } catch (error) {
      console.error(`StorageHelper.clear(): ${error}`, this);
    }
  }

  toJSON() {
    return JSON.stringify(this.data.get());
  }
}
