import {createContext,useContext} from 'react';
export const ComparisonContext=createContext<any>(null);
export const useComparison=()=>useContext(ComparisonContext);
