import {createContext,useContext} from 'react';
export const ComparisonContext=createContext<{enhanced:boolean}|null>(null);
export const useComparison=()=>useContext(ComparisonContext);
