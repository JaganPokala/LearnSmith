import { createContext, useContext } from 'react';

export const LearningContext = createContext(null);
export const useLearning = () => useContext(LearningContext);
