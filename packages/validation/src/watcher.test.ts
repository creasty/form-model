import { computed, makeObservable, observable, runInAction } from "mobx";
import { getWatcher, unwatch, watch } from "./watcher";

describe("getWatcher", () => {
  it("throws an error when a non-object is given", () => {
    expect(() => {
      getWatcher(null as any);
    }).toThrowError(/Expected an object/);
    expect(() => {
      getWatcher(1 as any);
    }).toThrowError(/Expected an object/);
  });

  it("returns the same instance for the same target", () => {
    const target = {};
    const watcher = getWatcher(target);
    expect(getWatcher(target)).toBe(watcher);
  });

  it("returns different instances for different targets", () => {
    const target1 = {};
    const target2 = {};
    expect(getWatcher(target1)).not.toBe(getWatcher(target2));
  });
});

describe("Annotations", () => {
  describe("@observable / @computed", () => {
    class Sample {
      @observable field1 = false;
      @observable field2 = false;

      constructor() {
        makeObservable(this);
      }

      @computed
      get computed1() {
        return this.field1;
      }

      @computed
      get computed2() {
        return this.field2;
      }

      @computed
      get computed3() {
        return this.field1 || this.field2;
      }
    }

    test("changes to @observable/@computed fields are tracked", () => {
      const sample = new Sample();
      const watcher = getWatcher(sample);
      expect(watcher.changed).toBe(false);
      expect(watcher.changedKeys).toEqual(new Set());

      runInAction(() => {
        sample.field1 = true;
      });
      expect(watcher.changed).toBe(true);
      expect(watcher.changedKeys).toEqual(new Set(["field1", "computed1", "computed3"]));

      runInAction(() => {
        sample.field2 = true;
      });
      expect(watcher.changed).toBe(true);
      expect(watcher.changedKeys).toEqual(new Set(["field1", "computed1", "field2", "computed2", "computed3"]));
    });

    test("changedTick is incremented for each change", () => {
      const sample = new Sample();
      const watcher = getWatcher(sample);
      expect(watcher.changedTick).toBe(0);

      runInAction(() => {
        sample.field1 = true;
      });
      // 1 change to 3 fields each (field1, computed1, computed3)
      expect(watcher.changedTick).toBe(3);

      runInAction(() => {
        sample.field2 = true;
      });
      // 1 change to 2 fields each (field2, computed2)
      // Since the value of computed3 is constant, it won't be counted.
      expect(watcher.changedTick).toBe(3 + 2);

      runInAction(() => {
        sample.field1 = false;
        sample.field2 = false;
      });
      // 1 change to all 5 fields each
      // Since runInAction is used, change to field1 and field2 are counted as 1 change.
      expect(watcher.changedTick).toBe(3 + 2 + 5);
    });

    test("when the value is not changed, the watcher is not updated", () => {
      const sample = new Sample();
      const watcher = getWatcher(sample);
      expect(watcher.changed).toBe(false);
      expect(watcher.changedKeys).toEqual(new Set());

      runInAction(() => {
        sample.field1 = false; // same value as before
      });
      expect(watcher.changed).toBe(false);
      expect(watcher.changedKeys).toEqual(new Set());
    });

    test("reset() resets changed, changedKeys, and changedTick", () => {
      const sample = new Sample();
      const watcher = getWatcher(sample);
      expect(watcher.changed).toBe(false);
      expect(watcher.changedKeys).toEqual(new Set());
      expect(watcher.changedTick).toBe(0);

      runInAction(() => {
        sample.field1 = true;
      });
      expect(watcher.changed).toBe(true);
      expect(watcher.changedKeys).not.toEqual(new Set());
      expect(watcher.changedTick).not.toBe(0);

      watcher.reset();
      expect(watcher.changed).toBe(false);
      expect(watcher.changedKeys).toEqual(new Set());
      expect(watcher.changedTick).toBe(0);
    });

    describe("object", () => {
      class Sample {
        @observable field1 = { value: false };

        constructor() {
          makeObservable(this);
        }
      }

      test("changes to an object are NOT tracked", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);

        runInAction(() => {
          sample.field1.value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });
    });

    describe("array", () => {
      class Sample {
        @observable field1 = [false];
        @observable field2 = [{ value: false }];

        constructor() {
          makeObservable(this);
        }
      }

      test("assignments to an array are tracked", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);

        runInAction(() => {
          sample.field1[0] = true;
        });
        expect(watcher.changedKeys).toEqual(new Set(["field1"]));
      });

      test("mutations to an array are tracked", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);

        runInAction(() => {
          sample.field1.push(true);
        });
        expect(watcher.changedKeys).toEqual(new Set(["field1"]));
      });

      test("changes to array elements are NOT tracked", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);

        runInAction(() => {
          sample.field2[0].value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });
    });

    describe("set", () => {
      class Sample {
        @observable field1 = new Set([false]);
        @observable field2 = new Set([{ value: false }]);

        constructor() {
          makeObservable(this);
        }
      }

      test("mutations to a set are tracked", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);

        runInAction(() => {
          sample.field1.add(true);
        });
        expect(watcher.changedKeys).toEqual(new Set(["field1"]));
      });

      test("changes to set elements are NOT tracked", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);

        runInAction(() => {
          for (const element of sample.field2) {
            element.value = true;
          }
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });
    });

    describe("map", () => {
      class Sample {
        @observable field1 = new Map([["key1", false]]);
        @observable field2 = new Map([["key1", { value: false }]]);

        constructor() {
          makeObservable(this);
        }
      }

      test("assignments to a map are tracked", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);

        runInAction(() => {
          sample.field1.set("key2", true);
        });
        expect(watcher.changedKeys).toEqual(new Set(["field1"]));
      });

      test("changes to map elements are NOT tracked", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);

        runInAction(() => {
          sample.field2.get("key1")!.value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });
    });
  });

  describe("@watch", () => {
    class Sample {
      @watch field1 = observable.box(false);
      @watch field2 = observable.box(false);

      constructor() {
        makeObservable(this);
      }

      readonly #computed1 = computed(() => this.field1.get());
      @watch
      get computed1() {
        return this.#computed1.get();
      }

      readonly #computed2 = computed(() => this.field2.get());
      @watch
      get computed2() {
        return this.#computed2.get();
      }

      readonly #computed3 = computed(() => this.field1.get() || this.field2.get());
      @watch
      get computed3() {
        return this.#computed3.get();
      }
    }

    test("changes to @watch fields are tracked", () => {
      const sample = new Sample();
      const watcher = getWatcher(sample);
      expect(watcher.changed).toBe(false);
      expect(watcher.changedKeys).toEqual(new Set());

      runInAction(() => {
        sample.field1.set(true);
      });
      expect(watcher.changed).toBe(true);
      expect(watcher.changedKeys).toEqual(new Set(["field1", "computed1", "computed3"]));

      runInAction(() => {
        sample.field2.set(true);
      });
      expect(watcher.changed).toBe(true);
      expect(watcher.changedKeys).toEqual(new Set(["field1", "computed1", "field2", "computed2", "computed3"]));
    });
  });

  describe("@unwatch", () => {
    class Sample {
      @unwatch @observable field1 = false;
      @observable field2 = false;

      constructor() {
        makeObservable(this);
      }

      @unwatch
      @computed
      get computed1() {
        return this.field1;
      }

      @unwatch
      @computed
      get computed2() {
        return this.field2;
      }

      @computed
      get computed3() {
        return this.field1 || this.field2;
      }
    }

    test("changes to @unwatch fields are ignored", () => {
      const sample = new Sample();
      const watcher = getWatcher(sample);
      expect(watcher.changed).toBe(false);
      expect(watcher.changedKeys).toEqual(new Set());

      runInAction(() => {
        sample.field1 = true;
      });
      expect(watcher.changed).toBe(true);
      expect(watcher.changedKeys).toEqual(new Set(["computed3"]));

      runInAction(() => {
        sample.field2 = true;
      });
      expect(watcher.changed).toBe(true);
      expect(watcher.changedKeys).toEqual(new Set(["field2", "computed3"]));
    });
  });

  describe("@watch.ref", () => {
    describe("object", () => {
      class Sample {
        @watch.ref @observable field1 = { value: false };

        constructor() {
          makeObservable(this);
        }
      }

      test("changes to an object are NOT tracked", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);

        runInAction(() => {
          sample.field1.value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });
    });

    describe("array", () => {
      class Sample {
        @watch.ref @observable field1 = [false];
        @watch.ref @observable field2 = [{ value: false }];

        constructor() {
          makeObservable(this);
        }
      }

      test("assignments to an array are NOT tracked", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);

        runInAction(() => {
          sample.field1[0] = true;
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });

      test("mutations to an array are NOT tracked", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);

        runInAction(() => {
          sample.field1.push(true);
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });

      test("changes to array elements are NOT tracked", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);

        runInAction(() => {
          sample.field2[0].value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });
    });

    describe("set", () => {
      class Sample {
        @watch.ref @observable field1 = new Set([false]);
        @watch.ref @observable field2 = new Set([{ value: false }]);

        constructor() {
          makeObservable(this);
        }
      }

      test("mutations to a set are NOT tracked", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);

        runInAction(() => {
          sample.field1.add(true);
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });

      test("changes to set elements are NOT tracked", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);

        runInAction(() => {
          for (const element of sample.field2) {
            element.value = true;
          }
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });
    });

    describe("map", () => {
      class Sample {
        @watch.ref @observable field1 = new Map([["key1", false]]);
        @watch.ref @observable field2 = new Map([["key1", { value: false }]]);

        constructor() {
          makeObservable(this);
        }
      }

      test("assignments to a map are NOT tracked", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);

        runInAction(() => {
          sample.field1.set("key2", true);
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });

      test("changes to map elements are NOT tracked", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);

        runInAction(() => {
          sample.field2.get("key1")!.value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });
    });
  });

  describe("@watch.nested", () => {
    describe("non-nested value", () => {
      class Sample {
        @watch.nested @observable field1 = 1;

        constructor() {
          makeObservable(this);
        }
      }

      test("nestedObjects does not include the value", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);
        expect(watcher.nestedObjects.length).toBe(0);
      });
    });

    describe("object", () => {
      class Sample {
        @watch.nested @observable field1 = { value: false };
        @watch.nested field2 = observable({ value: false });

        constructor() {
          makeObservable(this);
        }
      }

      test("nestedObjects returns the nested objects", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);
        expect(watcher.nestedObjects.length).toBe(2);
        expect(watcher.nestedObjects).toContain(sample.field1);
        expect(watcher.nestedObjects).toContain(sample.field2);
      });

      test("changes to an object are tracked", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);

        runInAction(() => {
          sample.field1.value = true;
          sample.field2.value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set(["field1", "field2"]));
        expect(watcher.changedKeyPaths).toEqual(new Set(["field1", "field1.value", "field2", "field2.value"]));
      });
    });

    describe("boxed observable", () => {
      class Sample {
        @watch.nested field1 = observable.box({ value: false });
      }

      test("nestedObjects returns the nested objects", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);
        expect(watcher.nestedObjects.length).toBe(1);
        expect(watcher.nestedObjects).toContain(sample.field1.get());
      });

      test("assignments to a boxed observable field are tracked", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);

        runInAction(() => {
          sample.field1.set({ value: true });
        });
        expect(watcher.changedKeys).toEqual(new Set(["field1"]));
      });

      test("changes to a boxed observable field are tracked", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);

        runInAction(() => {
          sample.field1.get().value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set(["field1"]));
      });
    });

    describe("array", () => {
      class Sample {
        @watch.nested @observable field1 = [{ value: false }];
        @watch.nested field2 = [observable({ value: false })];

        constructor() {
          makeObservable(this);
        }
      }

      test("nestedObjects returns the nested objects", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);
        expect(watcher.nestedObjects.length).toBe(2);
        expect(watcher.nestedObjects).toContain(sample.field1[0]);
        expect(watcher.nestedObjects).toContain(sample.field2[0]);
      });

      test("changes to array elements are tracked", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);

        runInAction(() => {
          sample.field1[0].value = true;
          sample.field2[0].value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set(["field1", "field2"]));
        expect(watcher.changedKeyPaths).toEqual(
          new Set(["field1", "field1.0", "field1.0.value", "field2", "field2.0", "field2.0.value"])
        );
      });
    });

    describe("set", () => {
      class Sample {
        @watch.nested @observable field1 = new Set([{ value: false }]);
        @watch.nested field2 = new Set([observable({ value: false })]);

        constructor() {
          makeObservable(this);
        }
      }

      test("nestedObjects returns the nested objects", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);
        expect(watcher.nestedObjects.length).toBe(2);
        for (const element of sample.field1) {
          expect(watcher.nestedObjects).toContain(element);
        }
        for (const element of sample.field2) {
          expect(watcher.nestedObjects).toContain(element);
        }
      });

      test("changes to set elements are tracked", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);

        runInAction(() => {
          for (const element of sample.field1) {
            element.value = true;
          }
          for (const element of sample.field2) {
            element.value = true;
          }
        });
        expect(watcher.changedKeys).toEqual(new Set(["field1", "field2"]));
        expect(watcher.changedKeyPaths).toEqual(
          new Set(["field1", "field1.0", "field1.0.value", "field2", "field2.0", "field2.0.value"])
        );
      });
    });

    describe("map", () => {
      class Sample {
        @watch.nested @observable field1 = new Map([["key1", { value: false }]]);
        @watch.nested field2 = new Map([["key1", observable({ value: false })]]);

        constructor() {
          makeObservable(this);
        }
      }

      test("nestedObjects returns the nested objects", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);
        expect(watcher.nestedObjects.length).toBe(2);
        expect(watcher.nestedObjects).toContain(sample.field1.get("key1"));
        expect(watcher.nestedObjects).toContain(sample.field2.get("key1"));
      });

      test("changes to map elements are tracked", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);

        runInAction(() => {
          sample.field1.get("key1")!.value = true;
          sample.field2.get("key1")!.value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set(["field1", "field2"]));
        expect(watcher.changedKeyPaths).toEqual(
          new Set(["field1", "field1.key1", "field1.key1.value", "field2", "field2.key1", "field2.key1.value"])
        );
      });
    });

    describe("class", () => {
      class Sample {
        @watch.nested field1 = new Other();
        @watch.nested @observable field2 = new Other();

        constructor() {
          makeObservable(this);
        }
      }

      class Other {
        @observable value = false;

        constructor() {
          makeObservable(this);
        }
      }

      test("nestedObjects returns the nested objects", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);
        expect(watcher.nestedObjects.length).toBe(2);
        expect(watcher.nestedObjects).toContain(sample.field1);
        expect(watcher.nestedObjects).toContain(sample.field2);
      });

      test("changes to a nested class are tracked", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);

        runInAction(() => {
          sample.field1.value = true;
          sample.field2.value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set(["field1", "field2"]));
        expect(watcher.changedKeyPaths).toEqual(new Set(["field1", "field1.value", "field2", "field2.value"]));
      });
    });
  });
});
