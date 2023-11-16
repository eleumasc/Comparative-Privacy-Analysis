import assert from "assert";

export default class Completer<T> {
  readonly promise: Promise<T>;
  readonly complete: (value: T) => void;
  readonly completeError: (reason?: any) => void;
  private completed: boolean = false;

  constructor() {
    let complete: ((value: T) => void) | null = null;
    let completeError: ((reason?: any) => void) | null = null;
    this.promise = new Promise((resolve, reject) => {
      complete = (value) => {
        this.completed = true;
        resolve(value);
      };
      completeError = (reason) => {
        this.completed = true;
        reject(reason);
      };
    });
    assert(complete !== null && completeError !== null);
    this.complete = complete;
    this.completeError = completeError;
  }

  isCompleted() {
    return this.completed;
  }
}
