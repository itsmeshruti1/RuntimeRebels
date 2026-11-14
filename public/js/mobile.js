const MOBILE = window.matchMedia('(max-width: 600px)');

export const isMobile = () => MOBILE.matches;
