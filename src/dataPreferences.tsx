import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type MeteredConnection = EventTarget & { readonly saveData?: boolean };
const DataPreferencesContext = createContext(false);

function connection(): MeteredConnection | undefined {
  return typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & { connection?: MeteredConnection }).connection;
}

/** This preference removes remote map tiles while keeping place search available. */
export function DataPreferencesProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [systemSaveData, setSystemSaveData] = useState(() => !!connection()?.saveData);
  useEffect(() => {
    const network = connection();
    const update = () => setSystemSaveData(!!network?.saveData);
    update();
    network?.addEventListener?.('change', update);
    return () => network?.removeEventListener?.('change', update);
  }, []);
  return (
    <DataPreferencesContext.Provider value={enabled || systemSaveData}>
      {children}
    </DataPreferencesContext.Provider>
  );
}

export const useDataSaver = () => useContext(DataPreferencesContext);
