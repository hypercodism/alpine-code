import {
  SERVER_EXITED,
  SERVER_EXITED_CODE,
  ServerError,
  type Method,
  type Notification,
  type Params,
  type Result,
  type ServerConnection,
} from './connection';

/** What a scripted result can do besides answering: speak to the app without being asked. */
export interface ScriptContext {
  /** Sends `notification` to every subscriber now. */
  emit(notification: Notification): void;
}

export interface Script {
  /**
   * What each request returns, by method. A function may throw a `ServerError` to script a failure, and may use the
   * context to send notifications, before or after it answers. It may be async, to answer after a while.
   */
  results?: {
    [M in Method]?: Result<M> | ((params: Params<M>, context: ScriptContext) => Result<M> | Promise<Result<M>>);
  };
  /** Sent in order to each new subscriber, like a recorded session. */
  events?: Notification[];
}

/** One script that answers with the results of all of `scripts`; for the same method, a later script wins. */
export function mergeScripts(...scripts: Script[]): Script {
  return {
    results: Object.assign({}, ...scripts.map((script) => script.results)) as Script['results'],
    events: scripts.flatMap((script) => script.events ?? []),
  };
}

/**
 * A server that follows a script: for Storybook stories and tests, where no server process runs. `exit()` plays the
 * server process ending, as the real connection reports it: what waits fails, and so does every request after it.
 */
export function scriptedConnection(script: Script = {}): ServerConnection & { exit(): void } {
  const listeners = new Set<(notification: Notification) => void>();
  const context: ScriptContext = {
    emit: (notification) => [...listeners].forEach((listener) => listener(notification)),
  };
  const gone = () => new ServerError(SERVER_EXITED_CODE, 'The server stopped');
  let exited = false;
  // Answers still on their way, failed when the server exits.
  const waiting = new Set<(error: Error) => void>();
  return {
    async request(method, params) {
      if (exited) throw gone();
      const result = script.results?.[method] as unknown;
      if (result === undefined) throw new Error(`The script has no result for ${method}`);
      const answer = (typeof result === 'function' ? result(params, context) : result) as Result<typeof method>;
      if (!(answer instanceof Promise)) return answer;
      return new Promise((resolve, reject) => {
        waiting.add(reject);
        answer.then(resolve, reject).finally(() => waiting.delete(reject));
      });
    },
    subscribe(listener) {
      script.events?.forEach(listener);
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    exit() {
      if (exited) return;
      exited = true;
      waiting.forEach((reject) => reject(gone()));
      waiting.clear();
      context.emit({ method: SERVER_EXITED });
    },
  };
}
