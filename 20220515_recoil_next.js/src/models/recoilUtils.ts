import { CallbackInterface } from "recoil";
import { instance, RecoilContext } from "modules/RecoilContext";

export type Action<Args extends ReadonlyArray<unknown>, Return> = (
  dependency: RecoilContext,
) => (i: CallbackInterface) => (...args: Args) => Return;

export function action<Args extends ReadonlyArray<unknown>, Return>(fn: Action<Args, Return>): Action<Args, Return> {
  return (dependency: RecoilContext) =>
    (i: CallbackInterface) =>
      (...args: Args) => {
        console.log(
          "%c  sideEffect action %O",
          "color: #03A9F4; font-weight: bold;",
          fn,
          "called with params:",
          ...args,
        );
        return fn(dependency)(i)(...args);
      };
}

export function getActionInstance<Args extends ReadonlyArray<unknown>, Return>(
  act: Action<Args, Return>,
  recoilCb: CallbackInterface,
): (...args: Args) => Return {
  return act(instance)(recoilCb);
}

export function retainSnapshot<Args extends ReadonlyArray<unknown>, Return>(
  f: (recoilCb: CallbackInterface) => (...args: Args) => Promise<Return>,
): (recoilCb: CallbackInterface) => (...args: Args) => Promise<Return> {
  return function(recoilCb: CallbackInterface) {
    return async function retainSnapshotCallback(...args: Args) {
      const release = recoilCb.snapshot.retain();
      try {
        return await f(recoilCb)(...args);
      } finally {
        release();
      }
    };
  };
}
