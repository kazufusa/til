import { createContext, useContext } from "react";

export const isProduction = process.env.NEXT_PUBLIC_MODE === "production";

export const initialFlag = process.env["NEXT_PUBLIC_FEATURE_FLAG"] === "true";

export function useFlag() {
  const f = useContext(FlagContext)
  return isProduction ? initialFlag : f
}

export const FlagContext = createContext(initialFlag);
