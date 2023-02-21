import { useRecoilCallback, useRecoilValue } from "recoil";
// import { instance } from "modules/RecoilContext";
// import { Action } from "modules/recoilUtils";

// export function useModuleAction<Args extends ReadonlyArray<unknown>, Return>(act: Action<Args, Return>) {
//   return useRecoilCallback(act(instance), []);
// }

export const useModuleValue = useRecoilValue;
