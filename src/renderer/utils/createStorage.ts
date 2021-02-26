// Helper for work with persistent local storage (default: window.localStorage)
// TODO: write unit/integration tests

import type { CreateObservableOptions } from "mobx/lib/api/observable";
import { action, comparer, observable, toJS, when } from "mobx";
import { Draft, produce } from "immer";
import isEqual from "lodash/isEqual";

export interface StorageHelperOptions<T = any> extends StorageConfiguration<T> {
  autoInit?: boolean; // get latest storage state on init (default: true)
}

export interface StorageConfiguration<T = any> {
  storage?: StorageAdapter<T>;
  observable?: CreateObservableOptions;
}

export interface StorageAdapter<T = any, C = StorageHelper<T>> {
  getItem(this: C, key: string): T | Promise<T>; // import
  setItem(this: C, key: string, value: T): void; // export
  onChange?(this: C, value: T, oldValue?: T): void;
}

export const localStorageAdapter: StorageAdapter = {
  getItem(key: string) {
    return JSON.parse(localStorage.getItem(key));
  },
  setItem(key: string, value: any) {
    if (value != null) {
      localStorage.setItem(key, JSON.stringify(value));
    } else {
      localStorage.removeItem(key);
    }
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
    this.set(defaultValue);
    this.configure(this.options);

    if (this.options.autoInit) {
      this.init();
    }
  }

  @action
  async init() {
    if (this.initialized) return;

    try {
      const value = await this.load();
      const notEmpty = this.hasValue(value);
      const notDefault = !this.isDefaultValue(value);

      if (notEmpty && notDefault) {
        this.set(value);
      }
      this.initialized = true;
    } catch (error) {
      console.error(`StorageHelper.init(): ${error}`, this);
    }
  }

  hasValue(value: T) {
    return value != null;
  }

  isDefaultValue(value: T) {
    return isEqual(value, this.defaultValue);
  }

  @action
  configure({ storage, observable }: StorageConfiguration<T> = {}): this {
    if (storage) this.configureStorage(storage);
    if (observable) this.configureObservable(observable);

    return this;
  }

  @action
  configureStorage(storage: StorageAdapter<T>) {
    this.storage = Object.getOwnPropertyNames(storage).reduce((storage, name: keyof StorageAdapter) => {
      storage[name] = storage[name]?.bind(this); // bind storage-adapter methods to "this"-context

      return storage;
    }, { ...storage });
  }

  @action
  configureObservable(options: CreateObservableOptions = {}) {
    this.data = observable.box<T>(this.data.get(), {
      ...StorageHelper.defaultOptions.observable, // inherit default observability options
      ...options,
    });
    this.data.observe(change => {
      const { newValue, oldValue } = toJS(change, { recurseEverything: true });

      this.onChange(newValue, oldValue);
    });
  }

  protected onChange(value: T, oldValue?: T) {
    if (!this.initialized) return;

    this.storage.onChange?.(value, oldValue);
    this.storage.setItem(this.key, value);
  }

  async load(): Promise<T> {
    return this.storage.getItem(this.key);
  }

  get(): T {
    return toJS(this.data.get());
  }

  set(value: T) {
    this.data.set(value);
  }

  clear() {
    this.data.set(null);
  }

  merge(value: Partial<T> | ((draft: Draft<T>) => Partial<T> | void)) {
    const updater = typeof value === "function" ? value : () => value;
    const currentValue = this.get();
    const nextValue = produce(currentValue, updater) as T;

    this.set(nextValue);
  }

  toJSON(): string {
    return JSON.stringify(this.get());
  }
}
