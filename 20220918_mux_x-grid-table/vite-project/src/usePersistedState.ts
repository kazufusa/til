import { Dispatch, SetStateAction, useEffect, useState } from 'react';

type PersistedState<T> = [T, Dispatch<SetStateAction<T>>];

export function usePersistedState<T>(key: string, defaultValue: T): PersistedState<T> {
  const [value, setValue] = useState<T>(() => {
    try {
      return Object.apply(defaultValue, JSON.parse(window.localStorage.getItem(key) ?? "{}"))
    } catch {
      return defaultValue
    }
  });

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}
