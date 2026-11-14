import React, { useEffect } from 'react';
import { initGlobalCursor } from '../utils/globalCursor';

export type CursorPage = 'landing' | 'home';

interface CustomCursorProps {
  page: CursorPage;
}

export const CustomCursor: React.FC<CustomCursorProps> = ({ page }) => {
  useEffect(() => {
    const cursor = initGlobalCursor();
    cursor.el?.setAttribute('data-page', page);
  }, [page]);

  return null;
};
